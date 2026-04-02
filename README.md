*Read this in other languages: [English](README.md), [Español](README.es.md).*

# GPGPU Slime Mold Simulation

The idea for this project stems from a single question: is it possible to efficiently and organically find the optimal path between multiple points in multi-agent systems? When thinking about it, the concept that immediately comes to mind is the 'hive mind'. While colony-based optimization algorithms are a well-known standard, I wanted to take them to the 'next level' visually through various computer graphics techniques. From this premise arises a multi-agent simulation computed and rendered entirely on the GPU.

## Technical Overview

The simulation handles over 260,000 individual agents running at 60 FPS. To achieve this, the project bypasses the CPU entirely for simulation logic, relying on Ping-Pong Framebuffer Objects (FBOs) and custom GLSL shaders to read and write state data.

### Data Precision
- **Agent State Texture:** `RGBA32F` (32-bit Float). Encodes Position X, Position Y, Angle, and Species Index.
- **Trail Map Texture:** `RGBA16F` (16-bit Half-Float). Allows high dynamic range (HDR) energy accumulation without clamping to 1.0, enabling smooth diffusion and cinematic tone mapping.
- **Manual Blending:** Due to limited device support for `gl.BLEND` on floating-point textures, agent deposition is manually blended inside the shader pipeline to preserve the half-float precision.

## Mathematical & Algorithmic Foundations

### 1. Agent Behavior (Sense-Rotate-Move)
Agents deposit pheromones and steer based on local trail densities. 
- **Sensory Sampling:** Each agent samples the trail map at three points: directly ahead, left, and right (defined by *Sensor Angle* and *Sensor Distance*).
- **Symbiosis / Attraction Matrix ($M$):** A 3x3 matrix defines how species interact. The sensory weight $W$ for an agent of species $S$ is calculated as the dot product of the sampled trail concentrations $C$ and the attraction row for that species:
  $$W = C_0 M_{s,0} + C_1 M_{s,1} + C_2 M_{s,2}$$
- **Steering:** The agent compares the weights. If forward is highest, it maintains heading. Otherwise, it steers towards the maximum weight by adding/subtracting the *Turn Agility* variable multiplied by a PCG-hashed pseudo-random float.

### 2. Separable Blur & Trail Processing
To simulate the diffusion of pheromones, the trail map is blurred every frame.
- Instead of an $O(N^2)$ 2D kernel (e.g., Box or Gaussian blur), the diffusion utilizes a **Separable 1D Blur** ($O(2N)$). 
- It processes an $X$-axis blur into an intermediate FBO, followed by a $Y$-axis blur. This reduces texture lookups drastically, allowing large blur radii (e.g., $10$ pixels, equivalent to a $21 \times 21$ kernel) with negligible performance cost.
- **Decay:** The final trail value $T_{t}$ is calculated by linearly interpolating between the original and blurred maps (Diffusion), adding new agent deposits, and subtracting an Evaporation constant.

### 3. 2.5D Volumetric Illumination
To render the flat density map as a gelatinous, volumetric fluid, the display shader calculates surface normals in real-time.
- **Sobel Filter / Gradient:** The shader samples neighboring pixels to compute the partial derivatives of the density $D$:
  $$\nabla D_x = D_{right} - D_{left}$$
  $$\nabla D_y = D_{up} - D_{down}$$
- **Surface Normal:** The normal vector $N$ is derived from the gradient: $N = \text{normalize}(-\nabla D_x \cdot \text{scale}, -\nabla D_y \cdot \text{scale}, 1.0)$.
- **Blinn-Phong Shading:** Using $N$, the shader computes diffuse lighting (Lambertian) and specular highlights using a Half-way vector ($H = \text{normalize}(L + V)$).
- **Tone Mapping:** An exponential tone mapping function ($C_{out} = 1.0 - e^{-C_{in} \cdot E}$) is applied globally to preserve hue (Hue-Preserving Tone Mapping) under HDR accumulation.

---

## Features & Controls

The simulation features a responsive UI powered by Tweakpane, allowing real-time manipulation of the underlying mathematical variables.

### Global Environment
- **Diffusion:** Interpolation factor between the raw trail and the blurred trail.
- **Evaporation:** Fixed scalar subtracted from the trail map per frame to simulate pheromone decay.
- **Blur Radius:** Defines the $1D$ kernel size for the separable blur (1 to 10).
- **Mouse Gravity:** Gravitational pull strength of the cursor over the agents.

### Post-Processing & 2.5D Lighting
- **Bloom:** Multiplier for the spatial halo effect surrounding high-density areas.
- **Exposure:** Limits the maximum luminance output in the HDR tone mapping equation.
- **Bump Scale:** Multiplier for the Sobel gradient, defining the "height" of the fluid normals.
- **Specular & Shininess:** Controls the intensity and spread of the Blinn-Phong specular highlight, altering the material from matte to glossy.
- **Light X/Y/Z:** The directional vector of the simulated 3D light source.

### DNA (Per Species: Pink, Cyan, Gold)
- **Sensor Angle:** Rotational offset for the left/right sensory probes.
- **Sensor Dist:** Distance from the agent center to the sensory probes.
- **Turn Agility:** Maximum angular steering step per frame.
- **Speed:** Linear displacement scalar per frame.

### Symbiosis
- **Attraction Matrix (M00 to M22):** A matrix where values range from `-1.0` (Repulsion) to `1.0` (Attraction). Dictates intra- and inter-species behavior (e.g., predator-prey dynamics, herd behavior, or segregation).

---

## Project Setup

The project uses **Vite** for local development, module bundling, and direct GLSL file imports as raw strings.

```bash
# Install dependencies
npm install

# Run the local development server
npm run dev

# Build for production
npm run build
```