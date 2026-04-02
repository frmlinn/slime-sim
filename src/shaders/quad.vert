#version 300 es

/**
 * Shared Fullscreen Quad Vertex Shader
 * Maps a 2D position to clip space and passes UV coordinates to the fragment shader.
 */

in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5; // Convert clip space (-1 to 1) to UV space (0 to 1)
    gl_Position = vec4(a_position, 0.0, 1.0);
}