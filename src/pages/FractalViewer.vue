<template>
    <q-page class="fractal-page-container">
        <canvas ref="canvasRef" />

        <q-page-sticky position="top-left" :offset="[18, 18]">
            <q-card class="q-pa-md" style="width: 300px">
                <div class="text-h6">Contrôles du Fractal</div>

                <q-select v-model="targetFractal" :options="fractalOptions" label="Type de Fractal" emit-value
                    map-options options-dense class="q-mt-md" />

                <q-slider v-model="uniforms.u_maxIterations" :min="10" :max="1000" :step="10" label label-always
                    class="q-mt-md" />
                <q-item-label class="q-mt-sm">Itérations : {{ uniforms.u_maxIterations }}</q-item-label>

                <div v-if="targetFractal === 6" class="q-mt-md"> <q-item-label class="text-caption q-mb-sm">Constante
                        Julia (C)</q-item-label>
                    <q-slider v-model="uniforms.u_julia_c[0]" :min="-2.0" :max="2.0" :step="0.001" label label-always
                        :label-value="`Réel: ${uniforms.u_julia_c[0].toFixed(3)}`" />
                    <q-slider v-model="uniforms.u_julia_c[1]" :min="-2.0" :max="2.0" :step="0.001" label label-always
                        :label-value="`Imag: ${uniforms.u_julia_c[1].toFixed(3)}`" class="q-mt-sm" />
                </div>
                <div v-if="targetFractal === 6" class="q-mt-md">
                    <q-banner v-if="isJuliaValueBoring" inline-actions dense class="text-white bg-orange q-mt-sm">
                        <template v-slot:avatar>
                            <q-icon name="warning" />
                        </template>
                        Cette valeur de C produira probablement un fractal vide ou peu intéressant.
                    </q-banner>
                </div>
                <q-btn label="Reset View" @click="resetView" color="primary" class="q-mt-md" />
                <q-item-label class="q-mt-sm text-caption">
                    * Utilisez la molette pour zoomer
                    <br />
                    * Cliquez et glissez pour vous déplacer
                </q-item-label>
                <q-btn label="Generate Fractal" @click="generateFractal" color="secondary" class="q-mt-md" />
            </q-card>
        </q-page-sticky>
    </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import * as twgl from 'twgl.js';
import vs from '../shaders/fractal.vert?raw';
import fs from '../shaders/fractal.frag?raw';
import { fractalOptions, isJuliaCInteresting } from '../utils/fractalUtils';

const canvasRef = ref(null);
let gl;
let programInfo;
let bufferInfo;
let animationFrameId;

const targetFractal = ref(0);

// Shaders Uniforms
const uniforms = reactive({
    u_resolution: [300, 300],
    u_pan: [-0.7, 0.0],
    u_zoom: 0.7,
    u_maxIterations: 100,
    u_time: 0.0,
    u_fractalType_from: 0,
    u_fractalType_to: 0,
    u_morph_progress: 0.0,
    u_julia_c: [-0.7, 0.27015],
});

let morphStartTime = 0;
const MORPH_DURATION = 1500;
const isJuliaValueBoring = ref(false);

watch(targetFractal, (newFractalType) => {
    uniforms.u_fractalType_from = uniforms.u_fractalType_to;

    uniforms.u_fractalType_to = newFractalType;

    uniforms.u_morph_progress = 0.0;
    morphStartTime = performance.now();
});

watch(
    () => uniforms.u_julia_c,
    (newC) => {
        if (targetFractal.value === 6) {
            const isInteresting = isJuliaCInteresting(newC[0], newC[1]);
            isJuliaValueBoring.value = !isInteresting;
        } else {
            isJuliaValueBoring.value = false;
        }
    },
    { deep: true }
);

function getMouseWorldCoords(event) {
    if (!gl || !canvasRef.value) return [0, 0];
    const rect = canvasRef.value.getBoundingClientRect();

    // Coordonnées du pixel par rapport au canevas
    const mouseX = event.clientX - rect.left;
    const mouseY = rect.bottom - event.clientY; // Y est inversé en WebGL

    // Coordonnées normalisées (-0.5 à 0.5, gérant le ratio)
    const coordX = (mouseX / gl.canvas.width - 0.5) * (gl.canvas.width / gl.canvas.height);
    const coordY = (mouseY / gl.canvas.height - 0.5);

    // Coordonnées mondiales (appliquant zoom et pan)
    const worldX = (coordX / uniforms.u_zoom) + uniforms.u_pan[0];
    const worldY = (coordY / uniforms.u_zoom) + uniforms.u_pan[1];

    return [worldX, worldY];
}

// Fonction pour (re)démarrer la vue (mise à jour)
const resetView = () => {
    uniforms.u_maxIterations = 100;

    // Centre la vue en fonction du fractal ACTIF
    const currentFractal = uniforms.u_fractalType_to;

    if (currentFractal == 1) { // Burning Ship
        uniforms.u_pan = [-1.75, -0.05];
        uniforms.u_zoom = 1.0;
    } else if (currentFractal == 2) { // Tricorn
        uniforms.u_pan = [0.0, 0.0];
        uniforms.u_zoom = 0.7;
    } else { // Mandelbrot & Multibrots
        uniforms.u_pan = [-0.7, 0.0];
        uniforms.u_zoom = 0.7;
    }
};

// La boucle de rendu (mise à jour pour l'animation de morphing)
const render = (time) => {
    if (!gl) return;

    // AJOUT: Animation du morphing
    if (uniforms.u_morph_progress < 1.0 && morphStartTime > 0) {
        const elapsedTime = time - morphStartTime;
        uniforms.u_morph_progress = Math.min(elapsedTime / MORPH_DURATION, 1.0);

        // Si l'animation est finie, on fige
        if (uniforms.u_morph_progress >= 1.0) {
            morphStartTime = 0;
            uniforms.u_fractalType_from = uniforms.u_fractalType_to;
        }
    }

    // Rendu standard
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_time = time * 0.001;
    gl.useProgram(programInfo.program);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
    twgl.setUniforms(programInfo, uniforms);
    twgl.drawBufferInfo(gl, bufferInfo);
    animationFrameId = requestAnimationFrame(render);
};

// Gestion des Événement
const handleWheel = (event) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;

    const [mouseWorldX, mouseWorldY] = getMouseWorldCoords(event);

    uniforms.u_zoom *= zoomFactor;

    // Re-calculer les coords mondiales pour le pan
    const [newMouseWorldX, newMouseWorldY] = getMouseWorldCoords(event);

    uniforms.u_pan[0] += mouseWorldX - newMouseWorldX;
    uniforms.u_pan[1] += mouseWorldY - newMouseWorldY;
};

const handleMouseMove = (event) => {
    if (event.buttons !== 1) return;
    const panX = event.movementX / gl.canvas.height / uniforms.u_zoom;
    const panY = -event.movementY / gl.canvas.height / uniforms.u_zoom;
    uniforms.u_pan[0] -= panX;
    uniforms.u_pan[1] -= panY;
};

// Cycle de vie
onMounted(() => {
    gl = canvasRef.value.getContext('webgl');
    if (!gl) {
        console.error("WebGL n'est pas supporté !");
        return;
    }
    programInfo = twgl.createProgramInfo(gl, [vs, fs]);
    bufferInfo = twgl.createBufferInfoFromArrays(gl, {
        position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
    });
    canvasRef.value.addEventListener('wheel', handleWheel, { passive: false });
    canvasRef.value.addEventListener('mousemove', handleMouseMove);

    render();
});

onUnmounted(() => {
    cancelAnimationFrame(animationFrameId);
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('wheel', handleWheel);
        canvasRef.value.removeEventListener('mousemove', handleMouseMove);
    }
});
</script>
<style scoped>
.fractal-page-container {
    padding: 0;
    margin: 0;
    overflow: hidden;
}

canvas {
    width: 100%;
    height: 100%;
    display: block;
}
</style>
