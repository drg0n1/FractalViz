// src/shaders/fractal.frag
precision highp float;

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

vec2 iterate(int type, vec2 z, vec2 c) {
    if (type == 0 || type == 6) {
        return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    }
    
    if (type == 1) {
        vec2 z_abs = abs(z);
        return vec2(z_abs.x * z_abs.x - z_abs.y * z_abs.y, -2.0 * z_abs.x * z_abs.y) + c;
    }
    
    if (type == 2) {
        return vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) + c;
    }
    
    if (type == 3) {
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        return vec2(z.x * (x2 - 3.0 * y2), z.y * (3.0 * x2 - y2)) + c;
    }
    
    if (type == 4) {
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        return vec2(x2 * x2 - 6.0 * x2 * y2 + y2 * y2, 4.0 * z.x * z.y * (x2 - y2)) + c;
    }
    
    if (type == 5) {
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        float x4 = x2 * x2;
        float y4 = y2 * y2;
        return vec2(z.x * (x4 - 10.0 * x2 * y2 + 5.0 * y4), z.y * (5.0 * x4 - 10.0 * x2 * y2 + y4)) + c;
    }

    return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
}

vec3 palette( float t ) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.263, 0.416, 0.557);

    return a + b * cos( 6.28318 * (c * t + d) );
}

void main() {
    float ratio = u_resolution.x / u_resolution.y;
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 coord = (uv - 0.5) * vec2(ratio, 1.0);
    coord = (coord / u_zoom) + u_pan;

    vec2 z_from, c_from;
    vec2 z_to, c_to;

    float isJuliaFrom = step(5.5, float(u_fractalType_from)); 
    z_from = mix(vec2(0.0), coord, isJuliaFrom);
    c_from = mix(coord, u_julia_c, isJuliaFrom);

    float isJuliaTo = step(5.5, float(u_fractalType_to));
    z_to = mix(vec2(0.0), coord, isJuliaTo);
    c_to = mix(coord, u_julia_c, isJuliaTo);

    vec2 z = mix(z_from, z_to, u_morph_progress);
    vec2 c = mix(c_from, c_to, u_morph_progress);

    int iterations = 0;
    
    bool do_morph = u_morph_progress > 0.01 && u_morph_progress < 0.99;

    int typeFrom = u_fractalType_from;
    int typeTo = u_fractalType_to;

    for(int i = 0; i < 1000; i++) {
        if(i >= u_maxIterations) break;

        float dotZ = dot(z, z);
        if(dotZ > 4.0) break;

        vec2 z_next;

        if (!do_morph) {
            int targetType = (u_morph_progress >= 0.99) ? typeTo : typeFrom;
            z_next = iterate(targetType, z, c);
        } else {
            vec2 val1 = iterate(typeFrom, z, c);
            vec2 val2 = iterate(typeTo, z, c);
            z_next = mix(val1, val2, u_morph_progress);
        }

        z = z_next;
        iterations = i;
    }

    vec3 color = vec3(0.0);
    
    if(iterations < u_maxIterations - 1) {
        float smooth_val = float(iterations) + 1.0 - log2(log2(dot(z, z)));
        float t = (smooth_val * 0.05) - (u_time * 0.05);
        color = palette(t);

        // float hue = 0.5 + 0.1 * smooth_val / float(u_maxIterations) + (sin(u_time) * 0.01);
        // color = hsv2rgb(vec3(fract(hue), 0.8, 1.0));
    }

    gl_FragColor = vec4(color, 1.0);
}