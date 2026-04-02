#version 300 es
precision highp float;
precision highp sampler2D; 

uniform sampler2D u_agents;
uniform sampler2D u_trailMap;
uniform vec2 u_resolution;
uniform float u_time;

// --- SPECIES DNA ARRAYS ---
// Index: 0 = Red/Pink, 1 = Green/Cyan, 2 = Blue/Gold
uniform vec3 u_sensorAngleSpacing;
uniform vec3 u_sensorOffsetDist;
uniform vec3 u_turnSpeed;
uniform vec3 u_moveSpeed;

// --- ATTRACTION MATRIX (3x3) ---
// M[i][j]: Affinity of species 'i' towards the trail of species 'j'
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

/** Extracts specific DNA traits based on species index */
float getSpeciesValue(vec3 dnaArray, int speciesIndex) {
    if (speciesIndex == 0) return dnaArray.x;
    if (speciesIndex == 1) return dnaArray.y;
    return dnaArray.z;
}

/** Samples the trail map and calculates weighted attraction */
float sense(vec2 pos, float agentAngle, float sensorAngleOffset, float sensorDist, int speciesIndex) {
    float sensorAngle = agentAngle + sensorAngleOffset;
    vec2 sensorDir = vec2(cos(sensorAngle), sin(sensorAngle));
    vec2 sensorPos = pos + sensorDir * sensorDist;

    // Out of bounds check
    if (sensorPos.x < 0.0 || sensorPos.x >= u_resolution.x || sensorPos.y < 0.0 || sensorPos.y >= u_resolution.y) {
        return 0.0;
    }

    vec2 uv = sensorPos / u_resolution;
    vec4 trail = texture(u_trailMap, uv);
    
    // Extract interaction weights for current species
    vec3 attractionRow;
    if (speciesIndex == 0) attractionRow = u_attractionMatrix[0];
    else if (speciesIndex == 1) attractionRow = u_attractionMatrix[1];
    else attractionRow = u_attractionMatrix[2];

    // Compute final sensor weight based on matrix
    float weight = (trail.r * attractionRow.x) + 
                   (trail.g * attractionRow.y) + 
                   (trail.b * attractionRow.z);
                   
    return weight;
}

void main() {
    vec4 agent = texture(u_agents, v_uv);
    float x = agent.x;
    float y = agent.y;
    float angle = agent.z;
    int speciesIndex = int(agent.w + 0.1); 

    uint randomState = uint(gl_FragCoord.y * u_resolution.x + gl_FragCoord.x) + uint(u_time * 1000.0);
    randomState = hash(randomState);
    float randomVal = scaleToRange01(randomState);

    vec2 pos = vec2(x, y);

    // Fetch DNA specifics
    float mySensorAngle = getSpeciesValue(u_sensorAngleSpacing, speciesIndex);
    float mySensorDist  = getSpeciesValue(u_sensorOffsetDist, speciesIndex);
    float myTurnSpeed   = getSpeciesValue(u_turnSpeed, speciesIndex);
    float myMoveSpeed   = getSpeciesValue(u_moveSpeed, speciesIndex);

    // 1. DIRECTION LOGIC
    float weightForward = sense(pos, angle, 0.0, mySensorDist, speciesIndex);
    float weightLeft    = sense(pos, angle, mySensorAngle, mySensorDist, speciesIndex);
    float weightRight   = sense(pos, angle, -mySensorAngle, mySensorDist, speciesIndex);

    if (weightForward > weightLeft && weightForward > weightRight) {
        // Keep moving forward
    } else if (weightForward < weightLeft && weightForward < weightRight) {
        // Wander randomly if blocked
        angle += (randomVal - 0.5) * 2.0 * myTurnSpeed;
    } else if (weightRight > weightLeft) {
        angle -= randomVal * myTurnSpeed;
    } else if (weightLeft > weightRight) {
        angle += randomVal * myTurnSpeed;
    }

    // 2. MOUSE ATTRACTION LOGIC
    if (u_mouseIsDown > 0.5) {
        vec2 toMouse = u_mousePos - pos;
        float distToMouse = length(toMouse);
        
        if (distToMouse < 250.0 && distToMouse > 5.0) {
            float angleToMouse = atan(toMouse.y, toMouse.x);
            float force = (1.0 - (distToMouse / 250.0)) * u_mouseAttraction;
            float diff = angleToMouse - angle;
            // Shortest rotational distance
            diff = mod(diff + 3.14159265, 6.2831853) - 3.14159265; 
            angle += diff * force;
        }
    }

    // 3. APPLY MOVEMENT
    float newX = x + cos(angle) * myMoveSpeed;
    float newY = y + sin(angle) * myMoveSpeed;

    // Handle screen boundaries (Random reflection)
    if (newX < 0.0 || newX >= u_resolution.x || newY < 0.0 || newY >= u_resolution.y) {
        angle = randomVal * 6.28318530718; 
        newX = clamp(newX, 0.0, u_resolution.x - 1.0);
        newY = clamp(newY, 0.0, u_resolution.y - 1.0);
    }

    // Output updated state
    outColor = vec4(newX, newY, angle, agent.w);
}