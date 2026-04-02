#version 300 es
precision mediump float;

/**
 * Agent Trail Output
 * Renders individual agents with very low opacity to create smooth, slowly blending trails.
 */

in float v_species;
out vec4 outColor;

void main() {
    vec3 col = vec3(0.0);
    
    // Determine channel based on species index
    if (v_species < 0.5) {
        col.r = 1.0; // Species 0 -> Red Channel
    } else if (v_species < 1.5) {
        col.g = 1.0; // Species 1 -> Green Channel
    } else {
        col.b = 1.0; // Species 2 -> Blue Channel
    }
    
    // Low alpha (0.01) for delayed, organic color fusion
    outColor = vec4(col, 0.01); 
}