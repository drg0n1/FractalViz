<template>
    <q-page class="fullscreen">
        <canvas ref="canvasRef" class="fullscreen" />

        <q-page-sticky position="top-left" :offset="[18, 18]">
            <q-card class="q-pa-md" style="width: 300px">
                <div class="text-h6">Contrôles du Fractal</div>
                <q-slider v-model="uniforms.u_maxIterations" :min="10" :max="1000" :step="10" label label-always
                    class="q-mt-md" />
                <q-item-label class="q-mt-sm">Itérations : {{ uniforms.u_maxIterations }}</q-item-label>
                <q-btn label="Reset View" @click="resetView" color="primary" class="q-mt-md" />
                <q-item-label class="q-mt-sm text-caption">
                    * Utilisez la molette pour zoomer
                    <br />
                    * Cliquez et glissez pour vous déplacer
                </q-item-label>
            </q-card>
        </q-page-sticky>
    </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import * as twgl from 'twgl.js';

// --- Les Shaders ---

// 1. Vertex Shader (Le Géomètre)
// Son seul rôle : prendre 2 triangles qui forment un carré
// et faire en sorte qu'ils remplissent l'écran.
const vs = `
    attribute vec4 position;
    void main() {
      gl_Position = position;
    }
  `;

// 2. Fragment Shader (L'Artiste)
// C'est ici que la magie opère. Exécuté pour CHAQUE pixel.
const fs = `
    precision highp float; // On demande la meilleure précision (32-bit)

    // Variables reçues depuis JavaScript
    uniform vec2 u_resolution;
    uniform vec2 u_pan;
    uniform float u_zoom;
    uniform int u_maxIterations;
    uniform float u_time;

    // Fonction pour convertir HSV (Teinte, Saturation, Valeur) en RVB
    // C'est juste pour faire de jolies couleurs
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      // 1. Transformer la coordonnée du pixel (ex: 800, 600)
      //    en coordonnée mathématique (ex: -0.5, 0.0)
      vec2 coord = (gl_FragCoord.xy / u_resolution) - 0.5;
      coord.x *= u_resolution.x / u_resolution.y; // Gérer le ratio de l'écran
      coord = (coord / u_zoom) + u_pan; // Appliquer le zoom et le déplacement

      // 2. Algorithme de Mandelbrot
      vec2 z = vec2(0.0);
      vec2 c = coord;
      int i = 0;

      for(int j = 0; j < 1000; j++) { // Doit être <= u_maxIterations
        if (j >= u_maxIterations) break; // Limite de boucle

        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;

        if(dot(z, z) > 4.0) {
          break; // Le point s'est échappé
        }
        i = j;
      }

      // 3. Calculer la couleur
      vec3 color = vec3(0.0); // Noir (intérieur de l'ensemble)

      if (i < u_maxIterations - 1) {
        float smooth_i = float(i) + 1.0 - log(log(dot(z,z))) / log(2.0);

        // FAIRE PULSER LA COULEUR AVEC LE TEMPS
        float hue = 0.5 + 0.1 * smooth_i / float(u_maxIterations) + (sin(u_time) * 0.1);

        color = hsv2rgb(vec3(fract(hue), 0.8, 1.0));
        }

        gl_FragColor = vec4(color, 1.0);
    }
  `;

// --- Logique du Composant ---

const canvasRef = ref(null);
let gl; // Contexte WebGL
let programInfo; // Le shader compilé
let bufferInfo; // Le carré (2 triangles) à dessiner
let animationFrameId;

// Les "uniforms" sont les variables JS que l'on envoie au shader
const uniforms = reactive({
    u_resolution: [300, 300],
    u_pan: [-0.7, 0.0],
    u_zoom: 1.5,
    u_maxIterations: 100,
    u_time: 0.0, // Notre nouvelle variable
});
// Fonction pour (re)démarrer la vue
const resetView = () => {
    uniforms.u_pan = [-0.7, 0.0];
    uniforms.u_zoom = 1.5;
    uniforms.u_maxIterations = 100;
};

// La boucle de rendu (appelée ~60 fois/sec)
const render = (time) => { // 'time' est maintenant utilisé !
    if (!gl) return;

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Mettre à jour les uniforms
    uniforms.u_resolution = [gl.canvas.width, gl.canvas.height];
    uniforms.u_time = time * 0.001; // Convertir les ms en secondes

    gl.useProgram(programInfo.program);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
    twgl.setUniforms(programInfo, uniforms);

    twgl.drawBufferInfo(gl, bufferInfo);
    animationFrameId = requestAnimationFrame(render);
};

// --- Gestion des Événements ---
const handleWheel = (event) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9; // Zoom in ou out

    // Logique pour zoomer vers le pointeur de la souris
    const rect = canvasRef.value.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = rect.bottom - event.clientY; // Y est inversé en WebGL

    const mouseCoordX = (mouseX / gl.canvas.width - 0.5) * (gl.canvas.width / gl.canvas.height);
    const mouseCoordY = (mouseY / gl.canvas.height - 0.5);

    const mouseWorldX = (mouseCoordX / uniforms.u_zoom) + uniforms.u_pan[0];
    const mouseWorldY = (mouseCoordY / uniforms.u_zoom) + uniforms.u_pan[1];

    uniforms.u_zoom *= zoomFactor;

    const newMouseWorldX = (mouseCoordX / uniforms.u_zoom) + uniforms.u_pan[0];
    const newMouseWorldY = (mouseCoordY / uniforms.u_zoom) + uniforms.u_pan[1];

    uniforms.u_pan[0] += mouseWorldX - newMouseWorldX;
    uniforms.u_pan[1] += mouseWorldY - newMouseWorldY;
};

const handleMouseMove = (event) => {
    if (event.buttons !== 1) return; // Si le clic gauche n'est pas enfoncé

    const panX = event.movementX / gl.canvas.height / uniforms.u_zoom;
    const panY = -event.movementY / gl.canvas.height / uniforms.u_zoom;

    uniforms.u_pan[0] -= panX;
    uniforms.u_pan[1] -= panY;
};

// --- Cycle de vie ---
onMounted(() => {
    gl = canvasRef.value.getContext('webgl');
    if (!gl) {
        console.error("WebGL n'est pas supporté !");
        return;
    }

    // TWGL compile les shaders et crée le programme
    programInfo = twgl.createProgramInfo(gl, [vs, fs]);

    // TWGL crée un buffer pour un simple carré qui remplit l'écran
    bufferInfo = twgl.createBufferInfoFromArrays(gl, {
        position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
    });

    // Ajouter les écouteurs d'événements
    canvasRef.value.addEventListener('wheel', handleWheel, { passive: false });
    canvasRef.value.addEventListener('mousemove', handleMouseMove);

    // Lancer la boucle de rendu
    render();
});

onUnmounted(() => {
    // Nettoyer quand le composant est détruit
    cancelAnimationFrame(animationFrameId);
    if (canvasRef.value) {
        canvasRef.value.removeEventListener('wheel', handleWheel);
        canvasRef.value.removeEventListener('mousemove', handleMouseMove);
    }
});
</script>
