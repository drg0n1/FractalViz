<template>
    <q-page class="fractal-page-container">
        <canvas ref="canvasRef" class="gl-canvas" />

        <q-page-sticky position="top-left" :offset="[16, 16]">
            <div class="glass-container" :class="{ 'menu-open': menuOpen }">
                <q-expansion-item v-model="menuOpen" expand-icon-toggle expand-icon-class="text-grey-8"
                    header-class="glass-header q-pa-sm">
                    <template v-slot:header>
                        <div class="row items-center full-width">
                            <q-avatar icon="settings" color="primary" text-color="white" size="md" font-size="20px" />
                            <div class="q-ml-md">
                                <div class="text-subtitle2 text-weight-bold">Fractal Explorer</div>
                                <div class="text-caption text-grey-8">{{ getFractalName(targetFractal) }}</div>
                            </div>
                        </div>
                    </template>

                    <div class="q-pa-md glass-content">
                        <q-select v-model="targetFractal" :options="fractalOptions" label="Choisir une Fractal"
                            emit-value map-options dense filled options-dense behavior="menu"
                            class="q-mb-md bg-white-50" />

                        <div class="q-mb-md">
                            <div class="row justify-between items-center q-mb-xs">
                                <span class="text-caption text-weight-medium">Précision ({{ uniforms.u_maxIterations
                                    }})</span>
                            </div>
                            <q-slider v-model="uniforms.u_maxIterations" :min="10" :max="1000" :step="10"
                                color="primary" label dense track-size="4px" thumb-size="12px" />
                        </div>

                        <q-separator class="q-my-md bg-grey-4" />

                        <!-- Section Julia -->
                        <div v-if="targetFractal === 6" class="q-mb-md transition-generic">
                            <div class="text-subtitle2 q-mb-sm text-primary">Mode Julia</div>

                            <q-btn-toggle v-model="juliaMode" spread no-caps rounded unelevated toggle-color="primary"
                                color="grey-3" text-color="grey-8" class="q-mb-md shadow-1" padding="xs lg" :options="[
                                    { label: 'Manuel', value: 'manual' },
                                    { label: 'Presets', value: 'preset' }
                                ]" />

                            <div v-if="juliaMode === 'preset'" class="preset-box">
                                <q-linear-progress v-if="isJuliaTransitioning" indeterminate color="primary" size="2px"
                                    class="absolute-top-left full-width" />

                                <div class="text-weight-bold q-mb-xs text-center">{{ currentPresetName }}</div>
                                <div class="text-caption text-grey-7 q-mb-sm text-center font-mono">
                                    {{ uniforms.u_julia_c[0].toFixed(4) }} {{ uniforms.u_julia_c[1] >= 0 ? '+' : '' }}{{
                                        uniforms.u_julia_c[1].toFixed(4) }}i
                                </div>
                                <div class="row justify-center q-gutter-x-md items-center">
                                    <q-btn round dense flat icon="chevron_left" @click="cyclePreset(-1)"
                                        :disable="isAutoPlaying" />
                                    <q-btn round dense flat icon="play_circle" @click="toggleAutoPlay"
                                        :color="isAutoPlaying ? 'negative' : 'primary'" />
                                    <q-btn round dense flat icon="chevron_right" @click="cyclePreset(1)"
                                        :disable="isAutoPlaying" />
                                </div>
                            </div>

                            <div v-else>
                                <div class="row items-center justify-between">
                                    <span class="text-caption text-grey-8">Réel (Re)</span>
                                    <span class="text-caption font-mono text-xs">{{ uniforms.u_julia_c[0].toFixed(4)
                                        }}</span>
                                </div>
                                <q-slider v-model="uniforms.u_julia_c[0]" :min="-2.0" :max="2.0" :step="0.00001" dense
                                    color="secondary" />

                                <div class="row items-center justify-between q-mt-xs">
                                    <span class="text-caption text-grey-8">Imaginaire (Im)</span>
                                    <span class="text-caption font-mono text-xs">{{ uniforms.u_julia_c[1].toFixed(4)
                                        }}</span>
                                </div>
                                <q-slider v-model="uniforms.u_julia_c[1]" :min="-2.0" :max="2.0" :step="0.00001" dense
                                    color="secondary" />

                                <q-banner v-if="isJuliaValueBoring" dense rounded
                                    class="bg-orange-1 text-orange-9 q-mt-sm text-caption q-py-xs">
                                    <template v-slot:avatar><q-icon name="warning" size="xs" /></template>
                                    Zone instable.
                                </q-banner>
                            </div>
                        </div>

                        <q-separator class="q-my-md bg-grey-4" />

                        <div class="row q-gutter-sm">
                            <q-btn label="Reset Vue" @click="resetView" outline color="grey-8" class="col full-width"
                                size="sm" icon="center_focus_strong" no-caps />
                        </div>

                        <div class="q-mt-md text-center text-grey-6 text-xs mobile-hide">
                            <q-icon name="mouse" /> Molette (Zoom) | Clic (Pan)
                        </div>
                        <div class="q-mt-xs text-center text-grey-6 text-xs desktop-hide">
                            <q-icon name="touch_app" /> 1 doigt (Pan) | 2 doigts (Zoom)
                        </div>
                    </div>
                </q-expansion-item>
            </div>
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
const menuOpen = ref(true);
let gl;
let programInfo;
let bufferInfo;
let animationFrameId;

const targetFractal = ref(0);
const juliaMode = ref('manual');
const currentPresetIndex = ref(0);

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

let lastTouchX = 0;
let lastTouchY = 0;
let lastPinchDist = 0;

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);

        lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
}

function handleTouchMove(e) {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1) {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        const deltaX = (touchX - lastTouchX) / gl.canvas.height / uniforms.u_zoom;
        const deltaY = -(touchY - lastTouchY) / gl.canvas.height / uniforms.u_zoom;

        uniforms.u_pan[0] -= deltaX;
        uniforms.u_pan[1] -= deltaY;

        lastTouchX = touchX;
        lastTouchY = touchY;

    } else if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];

        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const dist = Math.hypot(dx, dy);

        if (lastPinchDist > 0) {
            const zoomFactor = dist / lastPinchDist;

            const centerX = (t1.clientX + t2.clientX) / 2;
            const centerY = (t1.clientY + t2.clientY) / 2;

            uniforms.u_zoom *= zoomFactor;

            const deltaX = (centerX - lastTouchX) / gl.canvas.height / uniforms.u_zoom;
            const deltaY = -(centerY - lastTouchY) / gl.canvas.height / uniforms.u_zoom;

            uniforms.u_pan[0] -= deltaX;
            uniforms.u_pan[1] -= deltaY;

            lastTouchX = centerX;
            lastTouchY = centerY;
        }
        lastPinchDist = dist;
    }
}

const lerp = (start, end, t) => start * (1 - t) + end * t;

const currentPresetName = computed(() => juliaPresets[currentPresetIndex.value].name);

const getFractalName = (id) => {
    const opt = fractalOptions.find(o => o.value === id);
    return opt ? opt.label : 'Fractal';
};

const toggleAutoPlay = () => {
    isAutoPlaying.value = !isAutoPlaying.value;
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

    if (newFractalType !== 6) isAutoPlaying.value = false;

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
    if (newMode === 'manual' && isAutoPlaying.value) isAutoPlaying.value = false;
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

onMounted(() => {
    gl = canvasRef.value.getContext('webgl', { alpha: false }); // Optimisation
    if (!gl) { console.error("WebGL error"); return; }

    programInfo = twgl.createProgramInfo(gl, [vs, fs]);
    bufferInfo = twgl.createBufferInfoFromArrays(gl, { position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0] });

    canvasRef.value.addEventListener('wheel', handleWheel, { passive: false });
    canvasRef.value.addEventListener('mousemove', handleMouseMove);

    canvasRef.value.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvasRef.value.addEventListener('touchmove', handleTouchMove, { passive: false });

    render();
});

onUnmounted(() => {
    cancelAnimationFrame(animationFrameId);
    if (autoPlayIntervalId) clearInterval(autoPlayIntervalId);
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('wheel', handleWheel);
        canvasRef.value.removeEventListener('mousemove', handleMouseMove);
        canvasRef.value.removeEventListener('touchstart', handleTouchStart);
        canvasRef.value.removeEventListener('touchmove', handleTouchMove);
    }
});
</script>

<style>
body,
html {
    overflow: hidden;
    overscroll-behavior: none;
    height: 100%;
}
</style>

<style scoped>
.fractal-page-container {
    padding: 0;
    margin: 0;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    position: relative;
    background: black;
}

canvas.gl-canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: crosshair;
}

.glass-container {
    width: 320px;
    max-width: 90vw;
    border-radius: 16px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    transition: all 0.3s ease;
}

.glass-container:not(.menu-open) {
    width: 260px;
    opacity: 0.9;
}

.glass-header {
    background: rgba(255, 255, 255, 0.4);
    transition: background 0.3s;
}

.glass-header:hover {
    background: rgba(255, 255, 255, 0.6);
}

.glass-content {
    background: transparent;
}

.preset-box {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 8px;
    padding: 12px;
    position: relative;
    border: 1px solid rgba(0, 0, 0, 0.05);
}

.font-mono {
    font-family: 'Roboto Mono', monospace;
}

.text-xs {
    font-size: 0.7rem;
}

.bg-white-50 {
    background: rgba(255, 255, 255, 0.5);
}
</style>
