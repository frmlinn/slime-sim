#version 300 es
precision mediump float;

/**
 * Cinematic Post-Processing & 2.5D Lighting
 * Generates Sobel normals from the density map and applies Blinn-Phong lighting.
 */

in vec2 v_uv;

uniform sampler2D u_texture;
uniform float u_bloom;
uniform float u_exposure;
uniform vec2 u_resolution;

// 2.5D Lighting parameters
uniform float u_bumpScale;
uniform float u_specular;
uniform float u_shininess;
uniform vec3 u_lightPos;

// Cinematic Color Palette
uniform vec3 u_color0;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_bgColor;

out vec4 outColor;

/** Maps normalized densities to actual cinematic colors */
vec3 mapColor(vec3 density) {
    return (density.r * u_color0) + (density.g * u_color1) + (density.b * u_color2);
}

void main() {
    // Read raw density map and convert to base color
    vec3 baseDensity = texture(u_texture, v_uv).rgb;
    vec3 baseCol = mapColor(baseDensity);
    
    vec2 texel = 1.0 / u_resolution;
    vec3 blurDensity = vec3(0.0);
    
    // Cheap spatial blur approximation for Bloom effect
    blurDensity += texture(u_texture, v_uv + vec2( 2.0,  0.0) * texel).rgb * 0.5;
    blurDensity += texture(u_texture, v_uv + vec2(-2.0,  0.0) * texel).rgb * 0.5;
    blurDensity += texture(u_texture, v_uv + vec2( 0.0,  2.0) * texel).rgb * 0.5;
    blurDensity += texture(u_texture, v_uv + vec2( 0.0, -2.0) * texel).rgb * 0.5;
    
    blurDensity += texture(u_texture, v_uv + vec2( 4.0,  4.0) * texel).rgb * 0.25;
    blurDensity += texture(u_texture, v_uv + vec2(-4.0,  4.0) * texel).rgb * 0.25;
    blurDensity += texture(u_texture, v_uv + vec2( 4.0, -4.0) * texel).rgb * 0.25;
    blurDensity += texture(u_texture, v_uv + vec2(-4.0, -4.0) * texel).rgb * 0.25;
    
    blurDensity /= 3.0; 
    
    vec3 blurCol = mapColor(blurDensity);
    vec3 bloomEffect = pow(blurCol, vec3(1.2)) * u_bloom;
    
    // --- 2.5D LIGHTING (SOBEL FILTER) ---
    // 1. Generate normal vectors by comparing neighboring density gradients
    vec2 offX = vec2(texel.x * 1.5, 0.0);
    vec2 offY = vec2(0.0, texel.y * 1.5);
    
    float dL = dot(texture(u_texture, v_uv - offX).rgb, vec3(0.333));
    float dR = dot(texture(u_texture, v_uv + offX).rgb, vec3(0.333));
    float dD = dot(texture(u_texture, v_uv - offY).rgb, vec3(0.333));
    float dU = dot(texture(u_texture, v_uv + offY).rgb, vec3(0.333));
    
    float dx = (dR - dL) * u_bumpScale;
    float dy = (dU - dD) * u_bumpScale;
    vec3 normal = normalize(vec3(-dx, -dy, 1.0));
    
    // 2. Blinn-Phong Illumination Model
    vec3 lightDir = normalize(u_lightPos);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(lightDir + viewDir);
    
    // Diffuse light (Creates 3D shadows & volume)
    float NdotL = max(dot(normal, lightDir), 0.0);
    float diffuse = NdotL * 0.7 + 0.3; // 0.3 acts as ambient baseline
    
    // Specular light (Creates wet/gelatinous reflections)
    float specIntensity = pow(max(dot(normal, halfDir), 0.0), u_shininess);
    float currentDensity = dot(baseDensity, vec3(0.333));
    
    // Mask out specular highlights in empty space
    float specMask = smoothstep(0.02, 0.15, currentDensity); 
    vec3 specularCol = vec3(1.0) * specIntensity * u_specular * specMask;
    
    // 3. Final Composition
    vec3 litBaseCol = baseCol * diffuse; 
    vec3 finalCol = u_bgColor + litBaseCol + bloomEffect + specularCol;
    
    // Exponential Tone Mapping to prevent color clipping
    finalCol = vec3(1.0) - exp(-finalCol * u_exposure);
    
    outColor = vec4(finalCol, 1.0);
}