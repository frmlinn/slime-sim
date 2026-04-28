/**
 * Slime Mold Sim - GPGPU WebGL2 Engine
 * Main entry point.
 */

import { Pane } from 'tweakpane';

// --- IMPORT SHADERS ---
import quadVertCode from './shaders/quad.vert?raw';
import renderVertCode from './shaders/render.vert?raw';

import updateFragCode from './shaders/update.frag?raw';
import renderFragCode from './shaders/render.frag?raw';
import blurHFragCode from './shaders/blurH.frag?raw';
import blurVFragCode from './shaders/blurV.frag?raw';
import displayFragCode from './shaders/display.frag?raw';

// --- MAIN CONFIGURATION & DEVICE CHECK ---
const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const BASE_RES = isMobile ? 512 : 1024;
let SIM_RES = BASE_RES * 0.5;

// Dynamic population based on map area (1 slime per 4 pixels)
let AGENT_TEX_SIZE = Math.floor(SIM_RES * 0.5); 
let NUM_AGENTS = AGENT_TEX_SIZE * AGENT_TEX_SIZE;

// --- WEBGL SETUP ---
const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2', { antialias: false });

if (!gl) throw new Error('WebGL 2.0 is not supported in your browser.');

if (!gl.getExtension('EXT_color_buffer_float')) console.warn('Missing EXT_color_buffer_float');
if (!gl.getExtension('EXT_color_buffer_half_float')) console.warn('Missing EXT_color_buffer_half_float');
gl.getExtension('OES_texture_half_float_linear');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- MOUSE INTERACTION ---
const mouseState = { x: SIM_RES / 2, y: SIM_RES / 2, isDown: 0.0 };

function updateMouse(e, isTouch = false) {
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    // Aspect Ratio Mapping
    const rect = canvas.getBoundingClientRect();
    const scaleX = SIM_RES / rect.width;
    const scaleY = SIM_RES / rect.height;

    mouseState.x = (clientX - rect.left) * scaleX;
    mouseState.y = SIM_RES - ((clientY - rect.top) * scaleY);
}

// Throttling to prevent JS event loop blocking
let isMouseThrottled = false;
function throttledUpdateMouse(e, isTouch = false) {
    if (isMouseThrottled) return;
    isMouseThrottled = true;
    requestAnimationFrame(() => {
        updateMouse(e, isTouch);
        isMouseThrottled = false;
    });
}

canvas.addEventListener('mousemove', (e) => throttledUpdateMouse(e));
canvas.addEventListener('mousedown', () => mouseState.isDown = 1.0);
canvas.addEventListener('mouseup', () => mouseState.isDown = 0.0);
canvas.addEventListener('touchmove', (e) => throttledUpdateMouse(e, true), {passive: true});
canvas.addEventListener('touchstart', (e) => {
    mouseState.isDown = 1.0;
    throttledUpdateMouse(e, true);
}, {passive: true});
canvas.addEventListener('touchend', () => mouseState.isDown = 0.0);

// --- HELPER FUNCTIONS ---
function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(vsSource, fsSource) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    
    // Validate linking
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

function createAgentTexture(data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, AGENT_TEX_SIZE, AGENT_TEX_SIZE, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

function createTrailTexture(w, h, useHalfFloat = true) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (useHalfFloat) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

// --- COMPILE PROGRAMS ---
const updateProgram = createProgram(quadVertCode, updateFragCode);
const renderProgram = createProgram(renderVertCode, renderFragCode);
const blurHProgram = createProgram(quadVertCode, blurHFragCode);
const blurVProgram = createProgram(quadVertCode, blurVFragCode);
const displayProgram = createProgram(quadVertCode, displayFragCode);

// --- INITIALIZE BUFFERS & FBOs ---
let texA = null;
let texB = null;
const fboA = gl.createFramebuffer(); 
const fboB = gl.createFramebuffer(); 

function allocateAgentTextures() {
    if (texA) gl.deleteTexture(texA);
    if (texB) gl.deleteTexture(texB);
    
    texA = createAgentTexture(null);
    texB = createAgentTexture(null);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
}

// Ping-Pong Buffers for the Environment Trail Map
let trailTexA, trailTexB, tempAgentsTex, blurHTex;
const trailFboA = gl.createFramebuffer();
const trailFboB = gl.createFramebuffer();
const tempAgentsFbo = gl.createFramebuffer();
const blurHFbo = gl.createFramebuffer();

function allocateTrailTextures() {
    if (trailTexA) gl.deleteTexture(trailTexA);
    if (trailTexB) gl.deleteTexture(trailTexB);
    if (tempAgentsTex) gl.deleteTexture(tempAgentsTex);
    if (blurHTex) gl.deleteTexture(blurHTex);

    trailTexA = createTrailTexture(SIM_RES, SIM_RES, true);
    trailTexB = createTrailTexture(SIM_RES, SIM_RES, true);
    tempAgentsTex = createTrailTexture(SIM_RES, SIM_RES, false);
    blurHTex = createTrailTexture(SIM_RES, SIM_RES, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboA); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, trailTexA, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, trailTexB, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempAgentsFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tempAgentsTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurHFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurHTex, 0);
}

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

// --- UNIFORM LOCATIONS ---
const updateLocs = {
    agents: gl.getUniformLocation(updateProgram, "u_agents"),
    trailMap: gl.getUniformLocation(updateProgram, "u_trailMap"),
    res: gl.getUniformLocation(updateProgram, "u_resolution"),
    time: gl.getUniformLocation(updateProgram, "u_time"),
    deltaTime: gl.getUniformLocation(updateProgram, "u_deltaTime"), 
    seed: gl.getUniformLocation(updateProgram, "u_seed"), 
    sensorAngleSpacing: gl.getUniformLocation(updateProgram, "u_sensorAngleSpacing"),
    sensorOffsetDist: gl.getUniformLocation(updateProgram, "u_sensorOffsetDist"),
    turnSpeed: gl.getUniformLocation(updateProgram, "u_turnSpeed"),
    moveSpeed: gl.getUniformLocation(updateProgram, "u_moveSpeed"),
    attractionMatrix: gl.getUniformLocation(updateProgram, "u_attractionMatrix"),
    mousePos: gl.getUniformLocation(updateProgram, "u_mousePos"),
    mouseIsDown: gl.getUniformLocation(updateProgram, "u_mouseIsDown"),
    mouseAttraction: gl.getUniformLocation(updateProgram, "u_mouseAttraction")
};

const renderLocs = {
    agents: gl.getUniformLocation(renderProgram, "u_agents"),
    res: gl.getUniformLocation(renderProgram, "u_resolution"),
    texSize: gl.getUniformLocation(renderProgram, "u_textureSize")
};

const blurHLocs = {
    trailMap: gl.getUniformLocation(blurHProgram, "u_trailMap"),
    res: gl.getUniformLocation(blurHProgram, "u_resolution"),
    blurRadius: gl.getUniformLocation(blurHProgram, "u_blurRadius")
};

const blurVLocs = {
    blurHTex: gl.getUniformLocation(blurVProgram, "u_blurHTex"),
    originalTrailMap: gl.getUniformLocation(blurVProgram, "u_originalTrailMap"),
    agentsMap: gl.getUniformLocation(blurVProgram, "u_agentsMap"),
    res: gl.getUniformLocation(blurVProgram, "u_resolution"),
    diffuseSpeed: gl.getUniformLocation(blurVProgram, "u_diffuseSpeed"),
    evaporationSpeed: gl.getUniformLocation(blurVProgram, "u_evaporationSpeed"),
    blurRadius: gl.getUniformLocation(blurVProgram, "u_blurRadius")
};

const displayLocs = {
    texture: gl.getUniformLocation(displayProgram, "u_texture"),
    bloom: gl.getUniformLocation(displayProgram, "u_bloom"),
    exposure: gl.getUniformLocation(displayProgram, "u_exposure"),
    res: gl.getUniformLocation(displayProgram, "u_resolution"),
    bumpScale: gl.getUniformLocation(displayProgram, "u_bumpScale"),
    specular: gl.getUniformLocation(displayProgram, "u_specular"),
    shininess: gl.getUniformLocation(displayProgram, "u_shininess"),
    lightPos: gl.getUniformLocation(displayProgram, "u_lightPos"),
    color0: gl.getUniformLocation(displayProgram, "u_color0"),
    color1: gl.getUniformLocation(displayProgram, "u_color1"),
    color2: gl.getUniformLocation(displayProgram, "u_color2"),
    bgColor: gl.getUniformLocation(displayProgram, "u_bgColor")
};

// --- TWEAKPANE UI SETUP ---
const PARAMS = {
    fps: 0,
    resScale: 0.5, 
    seed: 1337, // Internal stochastic seed
    diffuseSpeed: 0.15,
    evapSpeed: 0.001,
    blurRadius: 1, 
    mouseAttraction: 0.15,
    bloom: 1.5,
    exposure: 1.2,
    
    // 2.5D Lighting
    bumpScale: 5.0,
    specular: 2.0,
    shininess: 40.0,
    lightX: -0.5,
    lightY: 0.5,
    lightZ: 0.5,
    
    color0: {r: 255, g: 0, b: 128},   
    color1: {r: 0, g: 255, b: 200},   
    color2: {r: 255, g: 200, b: 0},   
    bgColor: {r: 5, g: 2, b: 15},     
    
    // DNA
    sp0_angle: 22.5, sp0_dist: 30.0, sp0_turn: 0.20, sp0_speed: 2.5,
    sp1_angle: 45.0, sp1_dist: 10.0, sp1_turn: 0.40, sp1_speed: 2.0,
    sp2_angle: 30.0, sp2_dist: 20.0, sp2_turn: 0.30, sp2_speed: 2.2,

    // Symbiosis
    m00: 1.0, m01: 1.0, m02: -1.0,  
    m10: -1.0, m11: 1.0, m12: 1.0,  
    m20: 1.0, m21: -1.0, m22: 1.0   
};

function resetSimulation() {
    // Generate new internal seed for noise
    PARAMS.seed = Math.floor(Math.random() * 100000);

    const newData = new Float32Array(NUM_AGENTS * 4);
    for (let i = 0; i < NUM_AGENTS; i++) {
        newData[i * 4 + 0] = Math.random() * SIM_RES;
        newData[i * 4 + 1] = Math.random() * SIM_RES;
        newData[i * 4 + 2] = Math.random() * Math.PI * 2;
        newData[i * 4 + 3] = Math.floor(Math.random() * 3.0);
    }
    
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, AGENT_TEX_SIZE, AGENT_TEX_SIZE, 0, gl.RGBA, gl.FLOAT, newData);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, AGENT_TEX_SIZE, AGENT_TEX_SIZE, 0, gl.RGBA, gl.FLOAT, newData);

    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboA);
    gl.clearColor(0.0, 0.0, 0.0, 0.0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboB);
    gl.clearColor(0.0, 0.0, 0.0, 0.0); gl.clear(gl.COLOR_BUFFER_BIT);
}

// Initial Boot
allocateTrailTextures();
allocateAgentTextures();
resetSimulation();

const uiContainer = document.getElementById('ui-container');
const pane = new Pane({ container: uiContainer, title: 'Genetic Laboratory' });

const uiToggleBtn = document.getElementById('ui-toggle');
uiToggleBtn.addEventListener('click', () => {
    uiContainer.classList.toggle('hidden-mobile');
    uiToggleBtn.innerText = uiContainer.classList.contains('hidden-mobile') ? 'Controls' : 'Close';
});

const tabs = pane.addTab({ pages: [{title: 'Global'}, {title: 'DNA'}, {title: 'Symbiosis'}] });

// Tab 1: Global
tabs.pages[0].addBinding(PARAMS, 'fps', { readonly: true, view: 'graph', min: 0, max: 70, label: 'FPS' });

// Dynamic Resolution Handling
tabs.pages[0].addBinding(PARAMS, 'resScale', { min: 0.1, max: 1.0, step: 0.1, label: 'Res. Scale' }).on('change', () => {
    SIM_RES = Math.floor(BASE_RES * PARAMS.resScale);
    
    // Scale population to match map area
    AGENT_TEX_SIZE = Math.floor(SIM_RES * 0.5);
    NUM_AGENTS = AGENT_TEX_SIZE * AGENT_TEX_SIZE;

    allocateTrailTextures();
    allocateAgentTextures();
    resetSimulation();
});

const btnMutate = tabs.pages[0].addButton({ title: 'Mutate ecosystem' });
btnMutate.on('click', () => {
    PARAMS.sp0_angle = 10 + Math.random() * 90;
    PARAMS.sp1_angle = 10 + Math.random() * 90;
    PARAMS.sp2_angle = 10 + Math.random() * 90;
    
    PARAMS.sp0_dist = 5 + Math.random() * 40;
    PARAMS.sp1_dist = 5 + Math.random() * 40;
    PARAMS.sp2_dist = 5 + Math.random() * 40;

    const rnd = () => (Math.random() * 2.0) - 1.0;
    PARAMS.m00 = rnd(); PARAMS.m01 = rnd(); PARAMS.m02 = rnd();
    PARAMS.m10 = rnd(); PARAMS.m11 = rnd(); PARAMS.m12 = rnd();
    PARAMS.m20 = rnd(); PARAMS.m21 = rnd(); PARAMS.m22 = rnd();

    pane.refresh(); 
    resetSimulation();
});

const fEnv = tabs.pages[0].addFolder({ title: 'Environment' });
fEnv.addBinding(PARAMS, 'diffuseSpeed', { min: 0.0, max: 1.0, label: 'Diffusion' });
fEnv.addBinding(PARAMS, 'evapSpeed', { min: 0.0001, max: 0.05, label: 'Evaporation' });
fEnv.addBinding(PARAMS, 'blurRadius', { min: 1, max: 10, step: 1, label: 'Blur Radius' });

const fPost = tabs.pages[0].addFolder({ title: 'Post-Processing' });
fPost.addBinding(PARAMS, 'bloom', { min: 0.0, max: 5.0, label: 'Bloom' });
fPost.addBinding(PARAMS, 'exposure', { min: 0.1, max: 3.0, label: 'Exposure' });
tabs.pages[0].addBinding(PARAMS, 'mouseAttraction', { min: -0.5, max: 0.5, label: 'Mouse Gravity' });

const fLight = tabs.pages[0].addFolder({ title: '2.5D Volume Lighting' });
fLight.addBinding(PARAMS, 'bumpScale', { min: 0.0, max: 15.0, label: 'Bump Scale' });
fLight.addBinding(PARAMS, 'specular', { min: 0.0, max: 8.0, label: 'Specular' });
fLight.addBinding(PARAMS, 'shininess', { min: 5.0, max: 100.0, label: 'Shininess' });
fLight.addBinding(PARAMS, 'lightX', { min: -1.0, max: 1.0, label: 'Light X' });
fLight.addBinding(PARAMS, 'lightY', { min: -1.0, max: 1.0, label: 'Light Y' });
fLight.addBinding(PARAMS, 'lightZ', { min: 0.1, max: 2.0, label: 'Light Z' });

const fColor = tabs.pages[0].addFolder({ title: 'Cinematic Palette' });
fColor.addBinding(PARAMS, 'color0', { label: 'Sp. 0' });
fColor.addBinding(PARAMS, 'color1', { label: 'Sp. 1' });
fColor.addBinding(PARAMS, 'color2', { label: 'Sp. 2' });
fColor.addBinding(PARAMS, 'bgColor', { label: 'Background' });

// Tab 2: DNA
const sp0 = tabs.pages[1].addFolder({ title: 'Species 0' });
sp0.addBinding(PARAMS, 'sp0_angle', { min: 0, max: 120, label: 'Sensor Angle' });
sp0.addBinding(PARAMS, 'sp0_dist', { min: 1, max: 50, label: 'Sensor Dist' });
sp0.addBinding(PARAMS, 'sp0_turn', { min: 0.01, max: 1.0, label: 'Turn Agility' });
sp0.addBinding(PARAMS, 'sp0_speed', { min: 0.5, max: 5.0, label: 'Speed' });

const sp1 = tabs.pages[1].addFolder({ title: 'Species 1' });
sp1.addBinding(PARAMS, 'sp1_angle', { min: 0, max: 120, label: 'Sensor Angle' });
sp1.addBinding(PARAMS, 'sp1_dist', { min: 1, max: 50, label: 'Sensor Dist' });
sp1.addBinding(PARAMS, 'sp1_turn', { min: 0.01, max: 1.0, label: 'Turn Agility' });
sp1.addBinding(PARAMS, 'sp1_speed', { min: 0.5, max: 5.0, label: 'Speed' });

const sp2 = tabs.pages[1].addFolder({ title: 'Species 2' });
sp2.addBinding(PARAMS, 'sp2_angle', { min: 0, max: 120, label: 'Sensor Angle' });
sp2.addBinding(PARAMS, 'sp2_dist', { min: 1, max: 50, label: 'Sensor Dist' });
sp2.addBinding(PARAMS, 'sp2_turn', { min: 0.01, max: 1.0, label: 'Turn Agility' });
sp2.addBinding(PARAMS, 'sp2_speed', { min: 0.5, max: 5.0, label: 'Speed' });

// Tab 3: Symbiosis
const m0 = tabs.pages[2].addFolder({ title: 'How Species 0 feels about:' });
m0.addBinding(PARAMS, 'm00', { min: -1, max: 1, label: 'Species 0' });
m0.addBinding(PARAMS, 'm01', { min: -1, max: 1, label: 'Species 1' });
m0.addBinding(PARAMS, 'm02', { min: -1, max: 1, label: 'Species 2' });

const m1 = tabs.pages[2].addFolder({ title: 'How Species 1 feels about:' });
m1.addBinding(PARAMS, 'm10', { min: -1, max: 1, label: 'Species 0' });
m1.addBinding(PARAMS, 'm11', { min: -1, max: 1, label: 'Species 1' });
m1.addBinding(PARAMS, 'm12', { min: -1, max: 1, label: 'Species 2' });

const m2 = tabs.pages[2].addFolder({ title: 'How Species 2 feels about:' });
m2.addBinding(PARAMS, 'm20', { min: -1, max: 1, label: 'Species 0' });
m2.addBinding(PARAMS, 'm21', { min: -1, max: 1, label: 'Species 1' });
m2.addBinding(PARAMS, 'm22', { min: -1, max: 1, label: 'Species 2' });


// --- RENDER LOOP VARIABLES ---
let time = 0;
let toggle = true;
let frames = 0;
let lastTime = performance.now();
let lastFrameTime = performance.now();

function setupQuadAttribute(program) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return aPos;
}

// --- MAIN RENDER LOOP ---
function render() {
    const now = performance.now();
    let deltaTime = Math.min((now - lastFrameTime) / 1000.0, 0.05); 
    lastFrameTime = now;
    
    time += deltaTime;

    frames++;
    if (now - lastTime >= 1000) {
        PARAMS.fps = frames; 
        frames = 0;
        lastTime = now;
    }

    // --- STEP 1: UPDATE AGENTS ---
    gl.useProgram(updateProgram);
    gl.viewport(0, 0, AGENT_TEX_SIZE, AGENT_TEX_SIZE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, toggle ? fboB : fboA);
    
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, toggle ? texA : texB);
    gl.uniform1i(updateLocs.agents, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, toggle ? trailTexA : trailTexB);
    gl.uniform1i(updateLocs.trailMap, 1);

    gl.uniform2f(updateLocs.res, SIM_RES, SIM_RES);
    gl.uniform1f(updateLocs.time, time);
    gl.uniform1f(updateLocs.deltaTime, deltaTime); 
    gl.uniform1ui(updateLocs.seed, PARAMS.seed);
    
    gl.uniform3f(updateLocs.sensorAngleSpacing, PARAMS.sp0_angle * Math.PI/180, PARAMS.sp1_angle * Math.PI/180, PARAMS.sp2_angle * Math.PI/180); 
    gl.uniform3f(updateLocs.sensorOffsetDist, PARAMS.sp0_dist, PARAMS.sp1_dist, PARAMS.sp2_dist);  
    gl.uniform3f(updateLocs.turnSpeed, PARAMS.sp0_turn, PARAMS.sp1_turn, PARAMS.sp2_turn);
    gl.uniform3f(updateLocs.moveSpeed, PARAMS.sp0_speed, PARAMS.sp1_speed, PARAMS.sp2_speed);
    
    const mat3Array = new Float32Array([
        PARAMS.m00, PARAMS.m01, PARAMS.m02, 
        PARAMS.m10, PARAMS.m11, PARAMS.m12, 
        PARAMS.m20, PARAMS.m21, PARAMS.m22  
    ]);
    gl.uniformMatrix3fv(updateLocs.attractionMatrix, false, mat3Array);
    
    gl.uniform2f(updateLocs.mousePos, mouseState.x, mouseState.y);
    gl.uniform1f(updateLocs.mouseIsDown, mouseState.isDown);
    gl.uniform1f(updateLocs.mouseAttraction, PARAMS.mouseAttraction);

    setupQuadAttribute(updateProgram);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- STEP 2: RENDER AGENTS AS POINTS ---
    gl.useProgram(renderProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempAgentsFbo);
    gl.viewport(0, 0, SIM_RES, SIM_RES);
    
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); 

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, toggle ? texB : texA);
    gl.uniform1i(renderLocs.agents, 0);
    gl.uniform2f(renderLocs.res, SIM_RES, SIM_RES);
    gl.uniform1f(renderLocs.texSize, AGENT_TEX_SIZE);
    
    gl.drawArrays(gl.POINTS, 0, NUM_AGENTS);
    gl.disable(gl.BLEND);

    // --- STEP 3A: SEPARABLE BLUR (HORIZONTAL PASS) ---
    gl.useProgram(blurHProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurHFbo); 
    gl.viewport(0, 0, SIM_RES, SIM_RES);
    
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, toggle ? trailTexA : trailTexB); 
    gl.uniform1i(blurHLocs.trailMap, 0);
    gl.uniform2f(blurHLocs.res, SIM_RES, SIM_RES);
    gl.uniform1i(blurHLocs.blurRadius, PARAMS.blurRadius);

    setupQuadAttribute(blurHProgram);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- STEP 3B: VERTICAL BLUR & PROCESSING ---
    gl.useProgram(blurVProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, toggle ? trailFboB : trailFboA); 
    gl.viewport(0, 0, SIM_RES, SIM_RES);
    
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, blurHTex); 
    gl.uniform1i(blurVLocs.blurHTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, toggle ? trailTexA : trailTexB); 
    gl.uniform1i(blurVLocs.originalTrailMap, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tempAgentsTex); 
    gl.uniform1i(blurVLocs.agentsMap, 2);
    
    gl.uniform2f(blurVLocs.res, SIM_RES, SIM_RES);
    gl.uniform1f(blurVLocs.diffuseSpeed, PARAMS.diffuseSpeed); 
    gl.uniform1f(blurVLocs.evaporationSpeed, PARAMS.evapSpeed); 
    gl.uniform1i(blurVLocs.blurRadius, PARAMS.blurRadius);

    setupQuadAttribute(blurVProgram);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- STEP 4: 2.5D DISPLAY ---
    gl.useProgram(displayProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
    gl.viewport(0, 0, canvas.width, canvas.height); 
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, toggle ? trailTexB : trailTexA);
    gl.uniform1i(displayLocs.texture, 0);
    gl.uniform1f(displayLocs.bloom, PARAMS.bloom);
    gl.uniform1f(displayLocs.exposure, PARAMS.exposure);
    gl.uniform2f(displayLocs.res, canvas.width, canvas.height); 
    
    gl.uniform1f(displayLocs.bumpScale, PARAMS.bumpScale);
    gl.uniform1f(displayLocs.specular, PARAMS.specular);
    gl.uniform1f(displayLocs.shininess, PARAMS.shininess);
    gl.uniform3f(displayLocs.lightPos, PARAMS.lightX, PARAMS.lightY, PARAMS.lightZ);
    
    gl.uniform3f(displayLocs.color0, PARAMS.color0.r/255, PARAMS.color0.g/255, PARAMS.color0.b/255);
    gl.uniform3f(displayLocs.color1, PARAMS.color1.r/255, PARAMS.color1.g/255, PARAMS.color1.b/255);
    gl.uniform3f(displayLocs.color2, PARAMS.color2.r/255, PARAMS.color2.g/255, PARAMS.color2.b/255);
    gl.uniform3f(displayLocs.bgColor, PARAMS.bgColor.r/255, PARAMS.bgColor.g/255, PARAMS.bgColor.b/255);

    setupQuadAttribute(displayProgram);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    toggle = !toggle;
    requestAnimationFrame(render);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

requestAnimationFrame(render);