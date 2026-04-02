#version 300 es
precision highp float;
precision highp sampler2D;

/**
 * Separable Blur - Horizontal Pass
 * First step of the O(2N) 2D Gaussian blur approximation.
 */

in vec2 v_uv;
uniform sampler2D u_trailMap;
uniform vec2 u_resolution;
uniform int u_blurRadius;

out vec4 outColor;

void main() {
    vec2 texelSize = 1.0 / u_resolution;
    vec4 sum = vec4(0.0);
    float weight = 0.0;
    
    // 1D Horizontal Kernel
    for(int x = -u_blurRadius; x <= u_blurRadius; x++) {
        sum += texture(u_trailMap, v_uv + vec2(float(x), 0.0) * texelSize);
        weight += 1.0;
    }
    
    outColor = sum / weight;
}