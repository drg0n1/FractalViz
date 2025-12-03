<template>
    <q-page class="fractal-page-container">
        <canvas ref="canvasRef" />

        <q-page-sticky position="top-left" :offset="[18, 18]">
            <q-card class="q-pa-md glass-panel" style="width: 340px">
                <div class="row items-center justify-between q-mb-md">
                    <div class="text-h6">Paramètres</div>
                    <q-badge color="primary" outline>{{ getFractalName(targetFractal) }}</q-badge>
                </div>

                <q-select v-model="targetFractal" :options="fractalOptions" label="Type de Fractal" emit-value
                    map-options dense filled class="q-mb-md" />

                <div class="q-mb-md">
                    <div class="row justify-between">
                        <span class="text-caption">Précision (Itérations)</span>
                        <span class="text-caption text-bold">{{ uniforms.u_maxIterations }}</span>
                    </div>
                    <q-slider v-model="uniforms.u_maxIterations" :min="10" :max="1000" :step="10" color="secondary" />
                </div>

                <q-separator class="q-my-md" />

                <div v-if="targetFractal === 6" class="q-mb-md">
                    <div class="text-subtitle2 q-mb-sm text-primary">Configuration Julia</div>

                    <q-btn-toggle v-model="juliaMode" spread no-caps rounded unelevated toggle-color="primary"
                        color="grey-3" text-color="grey-9" class="q-mb-md border-toggle" :options="[
                            { label: 'Manuel', value: 'manual' },
                            { label: 'Presets', value: 'preset' }
                        ]" />

                    <div v-if="juliaMode === 'preset'">
                        <div class="bg-grey-2 q-pa-sm rounded-borders text-center relative-position">
                            <q-linear-progress v-if="isJuliaTransitioning" indeterminate color="primary" size="xs"
                                class="absolute-top-left full-width rounded-borders"
                                style="border-bottom-left-radius: 0; border-bottom-right-radius: 0;" />

                            <div class="text-weight-bold q-mb-xs">{{ currentPresetName }}</div>
                            <div class="text-caption text-grey-7 q-mb-sm" style="font-family: monospace;">
                                {{ uniforms.u_julia_c[0].toFixed(4) }} {{ uniforms.u_julia_c[1] >= 0 ? '+' : '' }}{{
                                    uniforms.u_julia_c[1].toFixed(4) }}i
                            </div>
                            <div class="row justify-center q-gutter-x-md items-center">
                                <q-btn round dense flat icon="chevron_left" @click="cyclePreset(-1)"
                                    :disable="isAutoPlaying" />
                                <q-btn round dense flat icon="chevron_right" @click="cyclePreset(1)"
                                    :disable="isAutoPlaying" />
                            </div>
                        </div>
                        <div class="row justify-center q-mt-sm">
                            <q-checkbox v-model="isAutoPlaying" label="Lecture automatique (5s)" dense size="sm"
                                color="secondary" />
                        </div>
                    </div>

                    <div v-else>
                        <q-item-label class="text-caption text-grey-7">Partie Réelle (Re)</q-item-label>
                        <q-slider v-model="uniforms.u_julia_c[0]" :min="-2.0" :max="2.0" :step="0.00001" label dense />

                        <q-item-label class="text-caption text-grey-7 q-mt-xs">Partie Imaginaire (Im)</q-item-label>
                        <q-slider v-model="uniforms.u_julia_c[1]" :min="-2.0" :max="2.0" :step="0.00001" label dense />

                        <q-banner v-if="isJuliaValueBoring" dense rounded
                            class="bg-orange-2 text-orange-9 q-mt-sm text-caption">
                            <template v-slot:avatar><q-icon name="warning" size="xs" /></template>
                            Zone instable ou vide.
                        </q-banner>
                    </div>
                </div>

                <q-separator class="q-my-md" />

                <div class="row q-gutter-sm">
                    <q-btn label="Reset Caméra" @click="resetView" outline color="grey-8" class="col" size="sm"
                        icon="center_focus_strong" />
                </div>

                <div class="q-mt-md text-center text-grey-6" style="font-size: 0.75rem;">
                    <q-icon name="mouse" /> Zoom: Molette | Pan: Clic + Glisser
                </div>
            </q-card>
        </q-page-sticky>
    </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, computed } from 'vue';
import * as twgl from 'twgl.js';
import vs from '../shaders/fractal.vert?raw';
import fs from '../shaders/fractal.frag?raw';
import { fractalOptions, isJuliaCInteresting } from '../utils/fractalUtils';

const juliaPresets = [
    { name: "Le lapin de douady", c: [-0.123, 0.745] },
    { name: "Poussière de cantor", c: [0.285, 0.01] },
    { name: "Cœur de julia", c: [0.355, 0.355] },
    { name: "Cracks", c: [-0.23, 0.745] },
    { name: "Galaxies spirales", c: [-0.8, 0.156] },
    { name: "Siegel disk", c: [-0.391, -0.587] },
    { name: "San marco", c: [-0.75, 0] },
    { name: "Dentrite fine", c: [-0.4, 0.6] },
    { name: "Dragon", c: [0.360284, 0.100376] },
    { name: "Nuages", c: [-0.12, 0.75] },
    { name: "Flocon de neige", c: [-0.70176, -0.3842] }
];

const canvasRef = ref(null);
let gl;
let programInfo;
let bufferInfo;
let animationFrameId;

const targetFractal = ref(0);
const juliaMode = ref('manual');
const currentPresetIndex = ref(0);

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

let juliaMorphStartTime = 0;
const JULIA_MORPH_DURATION = 500;
let juliaStartC = [0, 0];
let juliaTargetC = [0, 0];
const isJuliaTransitioning = ref(false);

const isAutoPlaying = ref(false);
let autoPlayIntervalId = null;
const AUTOPLAY_DELAY = 5000;

const isJuliaValueBoring = ref(false);

const lerp = (start, end, t) => {
    return start * (1 - t) + end * t;
};

const currentPresetName = computed(() => juliaPresets[currentPresetIndex.value].name);

const getFractalName = (id) => {
    const opt = fractalOptions.find(o => o.value === id);
    return opt ? opt.label : 'Fractal';
};

const cyclePreset = (direction) => {
    let newIndex = currentPresetIndex.value + direction;
    if (newIndex < 0) newIndex = juliaPresets.length - 1;
    if (newIndex >= juliaPresets.length) newIndex = 0;

    currentPresetIndex.value = newIndex;

    juliaStartC = [...uniforms.u_julia_c];
    juliaTargetC = [...juliaPresets[newIndex].c];
    juliaMorphStartTime = performance.now();
    isJuliaTransitioning.value = true;
};

watch(isAutoPlaying, (playing) => {
    if (playing) {
        juliaMode.value = 'preset';
        cyclePreset(1);
        autoPlayIntervalId = setInterval(() => {
            cyclePreset(1);
        }, AUTOPLAY_DELAY);
    } else {
        if (autoPlayIntervalId) clearInterval(autoPlayIntervalId);
        autoPlayIntervalId = null;
    }
});


watch(targetFractal, (newFractalType) => {
    uniforms.u_fractalType_from = uniforms.u_fractalType_to;
    uniforms.u_fractalType_to = newFractalType;
    uniforms.u_morph_progress = 0.0;
    morphStartTime = performance.now();

    if (newFractalType !== 6) {
        isAutoPlaying.value = false;
    }

    if (newFractalType === 6 && juliaMode.value === 'preset') {
        const preset = juliaPresets[currentPresetIndex.value];
        uniforms.u_julia_c = [...preset.c];
    }
});

watch(
    () => uniforms.u_julia_c,
    (newC) => {
        if (targetFractal.value === 6 && !isJuliaTransitioning.value) {
            if (juliaMode.value === 'manual') {
                const isInteresting = isJuliaCInteresting(newC[0], newC[1]);
                isJuliaValueBoring.value = !isInteresting;
            } else {
                isJuliaValueBoring.value = false;
            }
        }
    },
    { deep: true }
);

watch(juliaMode, (newMode) => {
    if (newMode === 'manual' && isAutoPlaying.value) {
        isAutoPlaying.value = false;
    }
});


function getMouseWorldCoords(event) {
    if (!gl || !canvasRef.value) return [0, 0];
    const rect = canvasRef.value.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = rect.bottom - event.clientY;
    const coordX = (mouseX / gl.canvas.width - 0.5) * (gl.canvas.width / gl.canvas.height);
    const coordY = (mouseY / gl.canvas.height - 0.5);
    const worldX = (coordX / uniforms.u_zoom) + uniforms.u_pan[0];
    const worldY = (coordY / uniforms.u_zoom) + uniforms.u_pan[1];
    return [worldX, worldY];
}

const resetView = () => {
    uniforms.u_maxIterations = 100;
    const currentFractal = uniforms.u_fractalType_to;
    if (currentFractal == 1) {
        uniforms.u_pan = [-1.75, -0.05];
        uniforms.u_zoom = 1.0;
    } else if (currentFractal == 2) {
        uniforms.u_pan = [0.0, 0.0];
        uniforms.u_zoom = 0.7;
    } else {
        uniforms.u_pan = [-0.7, 0.0];
        uniforms.u_zoom = 0.7;
    }
};

const render = (time) => {
    if (!gl) return;

    if (uniforms.u_morph_progress < 1.0 && morphStartTime > 0) {
        const elapsedTime = time - morphStartTime;
        uniforms.u_morph_progress = Math.min(elapsedTime / MORPH_DURATION, 1.0);
        if (uniforms.u_morph_progress >= 1.0) {
            morphStartTime = 0;
            uniforms.u_fractalType_from = uniforms.u_fractalType_to;
        }
    }

    if (juliaMorphStartTime > 0) {
        const elapsedTime = time - juliaMorphStartTime;
        const progress = Math.min(elapsedTime / JULIA_MORPH_DURATION, 1.0);

        uniforms.u_julia_c[0] = lerp(juliaStartC[0], juliaTargetC[0], progress);
        uniforms.u_julia_c[1] = lerp(juliaStartC[1], juliaTargetC[1], progress);

        if (progress >= 1.0) {
            juliaMorphStartTime = 0;
            isJuliaTransitioning.value = false;
            uniforms.u_julia_c = [...juliaTargetC];
        }
    }

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

const handleWheel = (event) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const [mouseWorldX, mouseWorldY] = getMouseWorldCoords(event);
    uniforms.u_zoom *= zoomFactor;
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

onMounted(() => {
    gl = canvasRef.value.getContext('webgl');
    if (!gl) { console.error("WebGL n'est pas supporté !"); return; }
    programInfo = twgl.createProgramInfo(gl, [vs, fs]);
    bufferInfo = twgl.createBufferInfoFromArrays(gl, { position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0] });
    canvasRef.value.addEventListener('wheel', handleWheel, { passive: false });
    canvasRef.value.addEventListener('mousemove', handleMouseMove);
    render();
});

onUnmounted(() => {
    cancelAnimationFrame(animationFrameId);
    if (autoPlayIntervalId) clearInterval(autoPlayIntervalId);
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
    height: 100vh;
}

canvas {
    width: 100%;
    height: 100%;
    display: block;
}

.glass-panel {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-right: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}

.border-toggle {
    border: 1px solid #e0e0e0;
}
</style>
