#version 300 es
precision highp float;
precision highp sampler2D; 

uniform sampler2D u_agents;
uniform sampler2D u_trailMap;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_deltaTime;
uniform uint u_seed;

// --- SPECIES DNA ARRAYS ---
uniform vec3 u_sensorAngleSpacing;
uniform vec3 u_sensorOffsetDist;
uniform vec3 u_turnSpeed;
uniform vec3 u_moveSpeed;

// --- ATTRACTION MATRIX (3x3) ---
uniform mat3 u_attractionMatrix;

// --- MOUSE INTERACTION ---
uniform vec2 u_mousePos;
uniform float u_mouseIsDown;
uniform float u_mouseAttraction;

in vec2 v_uv;
out vec4 outColor;

/** Pseudo-random number generator (PCG Hash) */
uint hash(uint state) {
    state ^= 2747636419u;
    state *= 2654435769u;
    state ^= state >> 16;
    state *= 2654435769u;
    state ^= state >> 16;
    state *= 2654435769u;
    return state;
}

float scaleToRange01(uint state) {
    return float(state) / 4294967295.0;
}

float getSpeciesValue(vec3 dnaArray, int speciesIndex) {
    if (speciesIndex == 0) return dnaArray.x;
    if (speciesIndex == 1) return dnaArray.y;
    return dnaArray.z;
}

float sense(vec2 pos, float agentAngle, float sensorAngleOffset, float sensorDist, int speciesIndex) {
    float sensorAngle = agentAngle + sensorAngleOffset;
    vec2 sensorDir = vec2(cos(sensorAngle), sin(sensorAngle));
    vec2 sensorPos = pos + sensorDir * sensorDist;

    if (sensorPos.x < 0.0 || sensorPos.x >= u_resolution.x || sensorPos.y < 0.0 || sensorPos.y >= u_resolution.y) {
        return 0.0;
    }

    vec2 uv = sensorPos / u_resolution;
    vec4 trail = texture(u_trailMap, uv);

    vec3 attractionRow;
    if (speciesIndex == 0) attractionRow = u_attractionMatrix[0];
    else if (speciesIndex == 1) attractionRow = u_attractionMatrix[1];
    else attractionRow = u_attractionMatrix[2];

    return (trail.r * attractionRow.x) + (trail.g * attractionRow.y) + (trail.b * attractionRow.z);
}

void main() {
    vec4 agent = texture(u_agents, v_uv);
    float x = agent.x;
    float y = agent.y;
    float angle = agent.z;
    int speciesIndex = int(agent.w + 0.1);

    uint randomState = uint(gl_FragCoord.y * u_resolution.x + gl_FragCoord.x);
    randomState ^= u_seed; 
    randomState += uint(u_time * 1000.0);
    randomState = hash(randomState);
    float randomVal = scaleToRange01(randomState);
    
    vec2 pos = vec2(x, y);

    float mySensorAngle = getSpeciesValue(u_sensorAngleSpacing, speciesIndex);
    float mySensorDist  = getSpeciesValue(u_sensorOffsetDist, speciesIndex);
    float myTurnSpeed   = getSpeciesValue(u_turnSpeed, speciesIndex);
    float myMoveSpeed   = getSpeciesValue(u_moveSpeed, speciesIndex);

    // Declaración del factor de tiempo (Vital declararlo antes de usarlo)
    float timeScale = u_deltaTime * 60.0;

    // 1. DIRECTION LOGIC (BRANCHLESS)
    float weightForward = sense(pos, angle, 0.0, mySensorDist, speciesIndex);
    float weightLeft    = sense(pos, angle, mySensorAngle, mySensorDist, speciesIndex);
    float weightRight   = sense(pos, angle, -mySensorAngle, mySensorDist, speciesIndex);

    float isForwardBest = step(weightLeft, weightForward) * step(weightRight, weightForward);
    float isBlocked     = step(weightForward, weightLeft) * step(weightForward, weightRight);
    
    float turnRight = step(weightLeft, weightRight);
    float turnLeft  = 1.0 - turnRight;

    float wanderAngle = (randomVal - 0.5) * 2.0 * myTurnSpeed * timeScale;
    float steerAngle  = randomVal * myTurnSpeed * timeScale;

    float angleDelta = isBlocked * wanderAngle + 
                       (1.0 - isBlocked) * (turnLeft * steerAngle - turnRight * steerAngle);

    angle += angleDelta * (1.0 - isForwardBest);

    // 2. MOUSE ATTRACTION LOGIC
    if (u_mouseIsDown > 0.5) {
        vec2 toMouse = u_mousePos - pos;
        float distToMouse = length(toMouse);
        
        float distMask = step(5.0, distToMouse) * step(distToMouse, 250.0);
        
        float angleToMouse = atan(toMouse.y, toMouse.x);
        float force = (1.0 - (distToMouse / 250.0)) * u_mouseAttraction;
        float diff = angleToMouse - angle;

        diff = mod(diff + 3.14159265, 6.2831853) - 3.14159265;
        angle += diff * force * timeScale * distMask;
    }

    // 3. APPLY MOVEMENT
    float newX = x + cos(angle) * myMoveSpeed * timeScale;
    float newY = y + sin(angle) * myMoveSpeed * timeScale;

    // 4. BOUNDARY COLLISION
    float outX = step(newX, 0.0) + step(u_resolution.x, newX); 
    float outY = step(newY, 0.0) + step(u_resolution.y, newY);
    
    newX = clamp(newX, 0.0, u_resolution.x - 0.01);
    newY = clamp(newY, 0.0, u_resolution.y - 0.01);
    
    angle = mix(angle, 3.14159265 - angle, min(1.0, outX));
    angle = mix(angle, -angle, min(1.0, outY));

    outColor = vec4(newX, newY, angle, agent.w);
}