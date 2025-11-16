// src/utils/fractalUtils.js

export const fractalOptions = [
    { label: 'Burning Ship', value: 1 },
    { label: 'Tricorn (z^2 conj)', value: 2 },
    { label: 'Mandelbrot (z^2)', value: 0 },
    { label: 'Multibrot (z^3)', value: 3 },
    { label: 'Multibrot (z^4)', value: 4 },
    { label: 'Multibrot (z^5)', value: 5 },
    { label: 'Julia Set (z^2)', value: 6 },
];

export function isJuliaCInteresting(cr, ci) {
    let zr = 0;
    let zi = 0;
    const MAX_ITERATIONS = 50;
    const ESCAPE_RADIUS = 4.0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        let zr_temp = zr * zr - zi * zi + cr;
        let zi_temp = 2 * zr * zi + ci;

        zr = zr_temp;
        zi = zi_temp;

        // Si le point s'échappe (c est 'ennuyeux')
        if (zr * zr + zi * zi > ESCAPE_RADIUS) {
            return i > 10; // On considère "ennuyeux" s'il s'échappe en moins de 10 itérations
        }
    }

    return true;
}
