#version 300 es
precision highp float;
precision highp sampler2D;

/**
 * Separable Blur - Vertical Pass & Trail Processing
 * Completes the blur, applies diffusion (mix), injects new agents, and evaporates the map.
 */

in vec2 v_uv;

uniform sampler2D u_blurHTex;
uniform sampler2D u_originalTrailMap;
uniform sampler2D u_agentsMap;

uniform vec2 u_resolution;
uniform float u_diffuseSpeed;
uniform float u_evaporationSpeed;
uniform int u_blurRadius;

out vec4 outColor;

void main() {
    vec2 texelSize = 1.0 / u_resolution;
    vec4 sum = vec4(0.0);
    float weight = 0.0;
    
    // 1D Vertical Kernel (Reads from Horizontal blur result)
    for(int y = -u_blurRadius; y <= u_blurRadius; y++) {
        sum += texture(u_blurHTex, v_uv + vec2(0.0, float(y)) * texelSize);
        weight += 1.0;
    }
    vec4 blurredColor = sum / weight;
    
    // Manual Blending (Half-Float precision preserved)
    vec4 originalColor = texture(u_originalTrailMap, v_uv);
    vec4 diffusedColor = mix(originalColor, blurredColor, u_diffuseSpeed);
    
    // Inject newly rendered agents
    vec4 newAgents = texture(u_agentsMap, v_uv);
    vec4 finalColor = diffusedColor + vec4(newAgents.rgb, 0.0);
    
    // Apply evaporation and clamp total energy to 10.0 max
    outColor = clamp(finalColor - u_evaporationSpeed, 0.0, 10.0);
}