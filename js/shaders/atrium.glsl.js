/* =====================================================================
   Memory Garden atrium — Round 02 (js/garden/atrium.js)
   ---------------------------------------------------------------------
   The glass botanical atrium round the flower, in the garden scene's
   own coordinates (metres, the flower's base at the origin, the floor
   at y = −1). All meshes are built ONCE; everything that moves is a
   uniform (CPU, p5.js: wind from p.noise, colours from p.lerpColor,
   her position and closeness from the existing data streams).

   atriumSolid  metal frames, the stepped platform, walkways, planters
                · lit: hemisphere ambient, a cool key light from the
                  dome, the flower's warm point light (uWarm), a soft
                  Blinn highlight and a fresnel rim; integrated light
                  strips (aVertexColor.y) in uStripCol; depth haze
   atriumGlass  the curved glass walls and the dome: fresnel alpha (clear
                face-on, reflective at grazing angles), a cyan/lavender
                tint, thin-film colour, vertical reflection streaks,
                bright pane edges. Premultiplied alpha.
   atriumFloor  the polished floor, drawn OVER a mirrored copy of the
                room (gardenScene.js renders the frames, plants and the
                flower reflected about y = −1 first): reflectivity rises
                at grazing angles (fresnel); inlaid light rings and
                spokes that brighten as she comes close (uProx), and a
                golden pool round the platform (uPool). Premultiplied.
   cityBox      the REAL Round 01 buildings round the tower, seen
                through the glass (their own positions and heights from
                the city's data): window grids, roof trims, aerial haze;
                the city floor far below with its street lights.
   gardenPlant  hanging vines and blossoms, planter leaves. Vertex sway:
                wind (uWind, p.noise on the CPU) + per-strand p.sin
                swing, weighted toward the tip; near her (uHer) they lean
                away and brighten. Additive light.
   ===================================================================== */
AG.SHADERS.atriumHaze = `
uniform vec3 uHazeCol; uniform float uHazeK;
vec3 haze(vec3 c, vec3 wp){ float d = length(wp - uCamPos); return mix(c, uHazeCol, 1.0 - exp(-d * uHazeK)); }
`;

AG.SHADERS.atriumSolid = {
  vert: AG.SHADERS.header + `
in vec3 aPosition; in vec3 aNormal; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView, uProj;
out vec3 vWorld; out vec3 vN; out vec2 vUv; out vec4 vData;
void main(){
  vWorld = aPosition; vN = aNormal; vUv = aTexCoord; vData = aVertexColor;
  gl_Position = uProj * uView * vec4(aPosition, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.atriumHaze + `
in vec3 vWorld; in vec3 vN; in vec2 vUv; in vec4 vData;
out vec4 outColor;
uniform vec3 uWarmPos, uStripCol, uKeyCol; uniform float uWarm, uProx;
void main(){
  vec3 N = normalize(vN), V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float mat = vData.x;
  // materials: 0 brushed silver-lavender metal, 1 pearl stone (platform), 2 walkway, 3 planter
  vec3 base = mat < 0.5 ? vec3(0.34, 0.32, 0.46) : mat < 1.5 ? vec3(0.32, 0.28, 0.42) : mat < 2.5 ? vec3(0.2, 0.18, 0.29) : vec3(0.14, 0.11, 0.2);
  float gloss = mat < 0.5 ? 64.0 : mat < 1.5 ? 110.0 : 36.0;
  vec3 amb = mix(vec3(0.07, 0.05, 0.12), vec3(0.22, 0.18, 0.34), N.y * 0.5 + 0.5);
  vec3 Lk = normalize(vec3(0.15, 1.0, 0.1));
  float dk = max(dot(N, Lk), 0.0) * 0.6 + 0.4;
  vec3 Lw = uWarmPos - vWorld; float dw = length(Lw); Lw /= dw;
  float att = uWarm / (1.0 + dw * dw * 0.012);
  float dwarm = max(dot(N, Lw), 0.0) * 0.7 + 0.3;
  vec3 c = base * (amb + uKeyCol * dk * 0.35 + vec3(1.0, 0.6, 0.3) * dwarm * att * 0.9);
  // soft highlights: the key light and the flower's warm light
  c += uKeyCol * pow(max(dot(N, normalize(Lk + V)), 0.0), gloss) * (mat < 0.5 ? 0.9 : 0.6);
  c += vec3(1.0, 0.7, 0.45) * pow(max(dot(N, normalize(Lw + V)), 0.0), gloss * 0.5) * att * 1.8;
  // fresnel rim in lavender (polished edges catch the room's light)
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  c += vec3(0.6, 0.5, 0.95) * fr * 0.35;
  // integrated light strips
  float strip = vData.y;
  // the platform's strips are gold, the planters' rims pink, the architecture's follow uStripCol
  vec3 sc = mat > 0.5 && mat < 1.5 ? vec3(1.0, 0.68, 0.32) : mat > 2.5 ? vec3(1.0, 0.45, 0.8) : uStripCol;
  c += sc * strip * (1.9 + 0.35 * sin(uTime * 0.8 + vData.z * 30.0));
  c = haze(c, vWorld);
  outColor = vec4(c, 1.0);
}
`
};

AG.SHADERS.atriumGlass = {
  vert: AG.SHADERS.atriumSolid.vert,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.atriumHaze + `
in vec3 vWorld; in vec3 vN; in vec2 vUv; in vec4 vData;
out vec4 outColor;
uniform vec3 uTintA, uTintB; uniform float uProx;
void main(){
  vec3 N = normalize(vN), V = normalize(uCamPos - vWorld);
  float ndv = abs(dot(N, V)), fr = pow(1.0 - ndv, 3.0);
  // thin-film colour on the glass, strongest at grazing angles
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (fr * 1.2 + vUv.y * 0.3 + vData.z + vec3(0.0, 0.33, 0.67)));
  vec3 tint = mix(uTintA, uTintB, vUv.y);
  // reflection streaks (the room's lights, smeared vertically on the panes)
  float streak = vnoise2(vec2(vUv.x * 3.0 + vData.z * 17.0, vUv.y * 1.5 + uTime * 0.02));
  streak = smoothstep(0.62, 0.95, streak);
  // bright pane edges (where the glass meets the frame)
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = exp(-min(e.x, e.y) * 60.0);
  vec3 c = tint * (0.12 + 0.5 * fr) + film * fr * 0.22 + vec3(0.85, 0.8, 1.0) * streak * (0.05 + 0.1 * fr) + uTintB * edge * 0.35;
  float a = clamp(0.09 + 0.5 * fr + 0.1 * streak + 0.25 * edge, 0.0, 0.72);
  c = haze(c, vWorld);
  outColor = vec4(c * a + c * 0.25 * edge, a);
}
`
};

AG.SHADERS.atriumFloor = {
  vert: AG.SHADERS.atriumSolid.vert,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.atriumHaze + `
in vec3 vWorld; in vec3 vN; in vec2 vUv; in vec4 vData;
out vec4 outColor;
uniform float uProx, uPool, uRings; uniform vec3 uInlayCol, uPoolCol;
void main(){
  vec3 V = normalize(uCamPos - vWorld);
  float fr = pow(1.0 - max(V.y, 0.0), 5.0);
  float refl = clamp(0.42 + 0.45 * fr, 0.0, 0.88);                 // how much of the mirrored room shows
  vec2 xz = vWorld.xz; float r = length(xz), ang = atan(xz.y, xz.x);
  // polished dark stone with faint large tiles
  vec2 g = abs(fract(xz / 4.0) - 0.5);
  float joint = smoothstep(0.485, 0.5, max(g.x, g.y));
  vec3 base = vec3(0.045, 0.032, 0.08) + vec3(0.06, 0.05, 0.1) * joint;
  // inlaid light: rings round the platform and spokes toward the walls
  float rings = 0.0;
  for (int i = 0; i < 4; i++){ float rr = 10.5 + float(i) * 3.4; rings += exp(-pow((r - rr) * 7.0, 2.0)) * (1.0 - 0.15 * float(i)); }
  float spokes = exp(-pow(abs(fract(ang / 6.2832 * 16.0) - 0.5) * r * 0.35, 2.0) * 30.0) * smoothstep(9.5, 11.0, r) * smoothstep(23.0, 18.0, r);
  float flow = 0.6 + 0.4 * sin(r * 0.9 - uTime * 1.6);            // light flowing outward along them
  vec3 em = uInlayCol * (rings + spokes * 0.6) * flow * uRings;
  // the golden pool round the platform, wider as she comes close
  em += uPoolCol * exp(-pow(r / uPool, 2.0)) * (0.3 + 0.45 * uProx);
  vec3 c = base * (1.0 - refl) + em;
  c = haze(c, vWorld);
  outColor = vec4(c, 1.0 - refl);
}
`
};

AG.SHADERS.cityBox = {
  vert: AG.SHADERS.atriumSolid.vert,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 vWorld; in vec3 vN; in vec2 vUv; in vec4 vData;
out vec4 outColor;
uniform vec3 uFogCol, uSkyLow; uniform float uFloorY;
void main(){
  vec3 N = normalize(vN);
  float h = vData.x;                                              // building hash 0..1
  vec3 c;
  if (vData.y > 1.5){
    // the city floor far below: street lights along a grid
    vec2 g = abs(fract(vWorld.xz / 60.0) - 0.5);
    float street = exp(-pow((0.5 - max(g.x, g.y)) * 60.0, 2.0) * 0.5);
    c = vec3(0.04, 0.02, 0.06) + vec3(1.0, 0.55, 0.35) * street * 0.5 + vec3(0.6, 0.3, 0.9) * street * 0.25;
  } else if (abs(N.y) > 0.5){
    // roofs: dark, with a neon trim at the edge
    vec2 e = min(vUv, 1.0 - vUv);
    float trim = exp(-min(e.x, e.y) * 40.0);
    c = vec3(0.05, 0.035, 0.08) + mix(vec3(1.0, 0.3, 0.75), vec3(0.3, 0.85, 1.0), h) * trim * 0.6;
  } else {
    // facades: a window grid (3.2 m × 3.6 m cells), some lit warm, some cool, some pink
    vec2 f = vec2(abs(N.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
    vec2 cell = floor(f / vec2(1.8, 2.8)), q = fract(f / vec2(1.8, 2.8));
    float win = step(0.26, q.x) * step(q.x, 0.74) * step(0.3, q.y) * step(q.y, 0.76);
    float r = hash12(cell + h * 91.0);
    vec3 lit = r < 0.55 ? vec3(1.0, 0.72, 0.42) : r < 0.8 ? vec3(0.55, 0.75, 1.0) : vec3(1.0, 0.45, 0.8);
    float on = step(0.55, hash12(cell * 1.3 + h * 17.0));
    c = vec3(0.035, 0.026, 0.06) + lit * win * on * (0.4 + 0.45 * hash12(cell + 3.0));
  }
  // aerial haze: distance, and a pink-violet glow rising from the city below
  float d = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-d * 0.0024);
  float low = smoothstep(uFloorY + 10.0, uFloorY - 120.0, vWorld.y);
  c = mix(c, mix(uFogCol, uSkyLow, low), clamp(fog + 0.35 * low, 0.0, 0.92));
  outColor = vec4(c, 1.0);
}
`
};

AG.SHADERS.gardenPlant = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 aPosition; in vec3 aNormal; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView, uProj;
uniform vec2 uWind; uniform vec3 uHer;
out vec2 vUv; out vec4 vData; out float vNear; out vec3 vWorld;
void main(){
  vec3 p = aPosition; float kind = aVertexColor.x, along = aVertexColor.y, ph = aVertexColor.z;
  // hanging (kind 0, 1): anchored at the top, the tip moves most; planter leaves (2): anchored at the base
  float w = kind < 1.5 ? along * along : along * along * 0.35;
  vec2 swing = uWind + vec2(sin(uTime * 0.9 + ph * 6.28), cos(uTime * 0.7 + ph * 4.1)) * 0.22;
  p.xz += swing * w * (kind < 1.5 ? 1.6 : 1.0);
  // near her: they lean away (and brighten in the fragment shader)
  vec3 toP = p - uHer; float d = length(toP);
  float near = exp(-d * d / 110.0);                                // (≈ 1/e at 10.5 m: she hovers ~5 m from the flower)
  p.xz += normalize(toP.xz + vec2(1e-4)) * near * 0.7 * w;
  vNear = near; vUv = aTexCoord; vData = aVertexColor; vWorld = p;
  gl_Position = uProj * uView * vec4(p, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.atriumHaze + `
in vec2 vUv; in vec4 vData; in float vNear; in vec3 vWorld;
out vec4 outColor;
uniform vec3 uColA, uColB, uColC; uniform float uProx, uGlow;
void main(){
  float kind = vData.x, along = vData.y, hue = vData.w;
  vec3 col = mix(mix(uColA, uColB, hue), uColC, smoothstep(0.6, 1.0, hue));
  float a;
  if (kind > 0.5 && kind < 1.5){
    // a blossom: a soft round light, brighter toward the strand's tip (wisteria)
    float r = length(vUv * 2.0 - 1.0); if (r > 1.0) discard;
    a = (exp(-r * r * 3.0) * 0.9 + 0.2 * (1.0 - r)) * (0.35 + 0.65 * along);
  } else {
    // a vine / leaf ribbon: soft across, a light running along it
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    a = smoothstep(0.0, 0.6, across) * (0.25 + 0.3 * along) * (kind > 1.5 ? 1.4 : 0.8);
    col = mix(col, vec3(0.55, 0.95, 0.85), kind > 1.5 ? 0.25 * (1.0 - along) : 0.15);
  }
  a *= uGlow * (1.0 + 1.6 * vNear * (0.4 + 0.6 * uProx));
  // (additive light: haze only dims it with distance, it never adds the haze colour)
  outColor = vec4(col * a * exp(-length(vWorld - uCamPos) * uHazeK), 1.0);
}
`
};
