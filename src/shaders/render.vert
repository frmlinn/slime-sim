#version 300 es

/**
 * Agent Particle Renderer
 * Reads agent data from the GPGPU texture and maps it to point coordinates on screen.
 */

uniform sampler2D u_agents;
uniform vec2 u_resolution;
uniform float u_textureSize;

out float v_species;

void main() {
    // Calculate 2D texture coordinates from 1D VertexID
    float col = mod(float(gl_VertexID), u_textureSize);
    float row = floor(float(gl_VertexID) / u_textureSize);
    vec2 uv = (vec2(col, row) + 0.5) / u_textureSize; 
    
    // Fetch agent state (x, y, angle, species)
    vec4 agent = texture(u_agents, uv);
    v_species = agent.w; // Pass species to Fragment Shader
    
    // Map internal coordinates (0 -> u_resolution) to clip space (-1 -> 1)
    vec2 clipSpace = (agent.xy / u_resolution) * 2.0 - 1.0;
    
    gl_Position = vec4(clipSpace, 0.0, 1.0);
    gl_PointSize = 1.0; 
}