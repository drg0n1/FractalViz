// src/shaders/fractal.frag
precision highp float;

// Variables Uniform
uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform int u_maxIterations;
uniform float u_time;
uniform int u_fractalType_from;
uniform int u_fractalType_to;
uniform float u_morph_progress;
uniform vec2 u_julia_c;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


// Mandelbrot (z^2)
vec2 calc_mandelbrot(vec2 z, vec2 c) {
    return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
}

 // Burning Ship
vec2 calc_burning_ship(vec2 z, vec2 c) {
    vec2 z_abs = abs(z);
    return vec2(z_abs.x * z_abs.x - z_abs.y * z_abs.y, - 2.0 * z_abs.x * z_abs.y) + c;
}

// Tricorn (z^2 conjugué)
vec2 calc_tricorn(vec2 z, vec2 c) {
    vec2 z_conj = vec2(z.x, -z.y);
    return vec2(z_conj.x * z_conj.x - z_conj.y * z_conj.y, 2.0 * z_conj.x * z_conj.y) + c;
}

// Multibrot (z^3)
vec2 calc_multibrot3(vec2 z, vec2 c) {
    return vec2(z.x * z.x * z.x - 3.0 * z.x * z.y * z.y, 3.0 * z.x * z.x * z.y - z.y * z.y * z.y) + c;
}

// Multibrot (z^4)
vec2 calc_multibrot4(vec2 z, vec2 c) {
    float x2 = z.x * z.x;
    float y2 = z.y * z.y;
    float x4 = x2 * x2;
    float y4 = y2 * y2;
    float x2y2 = x2 * y2;
    return vec2(x4 - 6.0 * x2y2 + y4, 4.0 * z.x * z.y * (x2 - y2)) + c;
}

// Multibrot (z^5)
vec2 calc_multibrot5(vec2 z, vec2 c) {
    float x = z.x;
    float y = z.y;
    float x2 = x * x;
    float y2 = y * y;
    return vec2(x * (x2 * x2 - 10.0 * x2 * y2 + 5.0 * y2 * y2), y * (5.0 * x2 * x2 - 10.0 * x2 * y2 + y2 * y2)) + c;
}

// Julia set (z^2)
vec2 calc_julia(vec2 z, vec2 c) {
    return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
}


vec2 get_fractal_z(int type, vec2 z, vec2 c) {
    if(type == 0)
        return calc_mandelbrot(z, c);
    if(type == 1)
        return calc_burning_ship(z, c);
    if(type == 2)
        return calc_tricorn(z, c);
    if(type == 3)
        return calc_multibrot3(z, c);
    if(type == 4)
        return calc_multibrot4(z, c);
    if(type == 5)
        return calc_multibrot5(z, c);
    if(type == 6)
        return calc_julia(z, c);
    return calc_mandelbrot(z, c);
}

void main() {
    vec2 coord = (gl_FragCoord.xy / u_resolution) - 0.5;
    coord.x *= u_resolution.x / u_resolution.y;
    coord = (coord / u_zoom) + u_pan;

    vec2 z_from_init;
    vec2 c_from_init;
    vec2 z_to_init;
    vec2 c_to_init;

    if (u_fractalType_from == 6) {
        z_from_init = coord;
        c_from_init = u_julia_c;
    } else {
        z_from_init = vec2(0.0);
        c_from_init = coord;
    }

    if (u_fractalType_to == 6) {
        z_to_init = coord;
        c_to_init = u_julia_c;
    } else {
        z_to_init = vec2(0.0);
        c_to_init = coord;
    }

    vec2 z = mix(z_from_init, z_to_init, u_morph_progress);
    vec2 c = mix(c_from_init, c_to_init, u_morph_progress);

    int i = 0;

    for(int j = 0; j < 1000; j++) {
        if(j >= u_maxIterations)
            break;

        vec2 z_from = get_fractal_z(u_fractalType_from, z, c);
        vec2 z_to = get_fractal_z(u_fractalType_to, z, c);

        z = mix(z_from, z_to, u_morph_progress);

        if(dot(z, z) > 4.0) {
            break;
        }
        i = j;
    }

    vec3 color = vec3(0.0);
    if(i < u_maxIterations - 1) {
        float smooth_i = float(i) + 1.0 - log(log(dot(z, z))) / log(2.0);
        float hue = 0.5 + 0.1 * smooth_i / float(u_maxIterations) + (sin(u_time) * 0.01);
        color = hsv2rgb(vec3(fract(hue), 0.8, 1.0));
    }
    gl_FragColor = vec4(color, 1.0);
}