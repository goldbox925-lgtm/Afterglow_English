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
   gardenPlant  the procedural plants (js/garden/botanical.js): opaque and
                depth-tested, so every leaf and flower has an edge and
                sits at its real depth. Vertex sway: wind (uWind, p.noise
                on the CPU), uSway (p.sin / p.cos) and a per-plant swing,
                weighted toward the tips. Reacts to her (uHer), bloom,
                dragging (a ripple) and the transformation (gold).
                Dithered away close to the lens and along the line of
                sight to the flower.
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
uniform float uEnergy, uFrontY, uBreath;       // the transformation (stage B): how far the energy has risen
uniform float uLight, uLightR;                 // (stage A): the golden wave, which crosses the platform first
void main(){
  vec3 N = normalize(vN), V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float mat = vData.x;
  // materials: 0 brushed silver-lavender metal, 1 pearl stone (platform), 2 walkway, 3 planter
  vec3 base = mat < 0.5 ? vec3(0.34, 0.32, 0.46) : mat < 1.5 ? vec3(0.17, 0.14, 0.26) : mat < 2.5 ? vec3(0.2, 0.18, 0.29) : vec3(0.14, 0.11, 0.2);
  float gloss = mat < 0.5 ? 64.0 : mat < 1.5 ? 110.0 : 36.0;
  vec3 amb = mix(vec3(0.10, 0.07, 0.17), vec3(0.34, 0.28, 0.5), N.y * 0.5 + 0.5);
  vec3 Lk = normalize(vec3(0.15, 1.0, 0.1));
  float dk = max(dot(N, Lk), 0.0) * 0.6 + 0.4;
  vec3 Lw = uWarmPos - vWorld; float dw = length(Lw); Lw /= dw;
  float att = uWarm / (1.0 + dw * dw * 0.012);
  float dwarm = max(dot(N, Lw), 0.0) * 0.7 + 0.3;
  vec3 c = base * (amb + uKeyCol * dk * 0.35 + vec3(1.0, 0.6, 0.3) * dwarm * att * 0.9);
  // soft highlights: the key light and the flower's warm light
  c += uKeyCol * pow(max(dot(N, normalize(Lk + V)), 0.0), gloss) * (mat < 0.5 ? 0.9 : 0.6);
  c += vec3(1.0, 0.7, 0.45) * pow(max(dot(N, normalize(Lw + V)), 0.0), gloss * 0.5) * att * (mat > 0.5 && mat < 1.5 ? 0.35 : 1.8);
  // fresnel rim in lavender (polished edges catch the room's light)
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  c += vec3(0.6, 0.5, 0.95) * fr * 0.35;
  // integrated light strips
  float strip = vData.y;
  // the platform's strips are gold, the planters' rims pink, the architecture's follow uStripCol
  vec3 sc = mat > 0.5 && mat < 1.5 ? vec3(1.0, 0.68, 0.32) : mat > 2.5 ? vec3(1.0, 0.45, 0.8) : uStripCol;
  // STAGE B: energy climbs the structure from the floor. Behind the front the strips turn gold and
  // settle to a lower level, so the pulses running up them read as light moving; the metal warms
  // with them, and a bright front marks how far the energy has reached
  float below = uEnergy > 0.001 ? smoothstep(uFrontY + 0.5, uFrontY - 3.0, vWorld.y) * uEnergy : 0.0;
  vec3 gold = vec3(1.0, 0.66, 0.3);
  c += mix(sc, gold, below) * strip * mix(2.6 + 0.4 * sin(uTime * 0.8 + vData.z * 30.0), 1.1, below) * uBreath;
  if (uEnergy > 0.001){
    float pulse = pow(fract(vWorld.y * 0.12 - uTime * 0.55 + vData.z * 7.0), 5.0);
    float head = exp(-pow((vWorld.y - uFrontY) * 0.7, 2.0)) * (1.0 - smoothstep(0.8, 1.0, uEnergy));
    c += gold * strip * (below * 6.0 * pulse * uBreath + head * 5.0);
    if (mat < 0.5) c += gold * (1.0 - strip) * (below * (0.1 + 0.8 * pulse) * uBreath + head * 0.7);
  }
  // the dais glows from within round the flower: a warm gold light in its pearl top
  if (mat > 0.5 && mat < 1.5 && N.y > 0.5){
    float rr = length(vWorld.xz);
    c += vec3(1.0, 0.62, 0.3) * exp(-rr * rr / 12.0) * (0.1 + 0.16 * uWarm) + vec3(0.75, 0.55, 1.0) * 0.03;
    c += vec3(1.0, 0.75, 0.45) * exp(-pow((rr - 3.2) * 6.0, 2.0)) * 0.22 * uWarm;          // an inner ring of light
    // STAGE A starts here: the wave crosses the platform before the floor. Nothing is added
    // right under the flower, which must not wash out
    if (uLight > 0.001){
      float lit = smoothstep(uLightR, uLightR - 5.0, rr) * smoothstep(3.0, 8.0, rr) * uLight;
      float wave = exp(-pow((rr - uLightR) * 0.55, 2.0)) * smoothstep(3.0, 6.0, rr) * uLight * (1.0 - smoothstep(0.75, 1.0, uLight));
      c += vec3(1.0, 0.64, 0.28) * (lit * 0.2 + wave * 0.75) * uBreath;
    }
  }
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
uniform vec3 uWinA, uWinB; uniform float uWin, uDome, uBreath;     // the transformation: panes light as windows, the dome glows
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
  vec3 c = tint * (0.16 + 0.6 * fr) + film * fr * 0.26 + vec3(0.85, 0.8, 1.0) * streak * (0.05 + 0.1 * fr) + uTintB * edge * 0.35;
  float a = clamp(0.09 + 0.5 * fr + 0.1 * streak + 0.25 * edge, 0.0, 0.72);
  c = haze(c, vWorld);
  // the panes are the tower's windows: each lights at its own moment, in the same colours as the
  // facade's windows; stage D sends a pink-gold glow down from the dome (added light, so the
  // city stays visible through the glass)
  vec2 pq = vUv * 2.0 - 1.0;
  float th = hash11(vData.z * 97.0 + 3.1) * 1.3;
  float on = smoothstep(th, th + 0.1, uWin) * (1.0 - vData.x);
  vec3 em = mix(uWinA, uWinB, hash11(vData.z * 53.0 + 1.7)) * on * (1.0 - 0.45 * dot(pq, pq)) * (0.12 + 0.025 * sin(uTime * 1.3 + th * 30.0));
  float high = smoothstep(14.0, 44.0, vWorld.y);
  em += mix(vec3(1.0, 0.42, 0.78), vec3(1.0, 0.68, 0.32), high) * uDome * high * mix(0.14, 0.5, vData.x);
  outColor = vec4(c * a + c * 0.25 * edge + em * uBreath, a);
}
`
};

AG.SHADERS.atriumFloor = {
  vert: AG.SHADERS.atriumSolid.vert,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.atriumHaze + `
in vec3 vWorld; in vec3 vN; in vec2 vUv; in vec4 vData;
out vec4 outColor;
uniform float uProx, uPool, uRings; uniform vec3 uInlayCol, uPoolCol;
uniform float uLight, uLightR, uBreath;        // the transformation (stage A): the golden light and how far it has spread
void main(){
  vec3 V = normalize(uCamPos - vWorld);
  float fr = pow(1.0 - max(V.y, 0.0), 5.0);
  float refl = clamp(0.58 + 0.35 * fr, 0.0, 0.92);                 // how much of the mirrored room shows
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
  vec3 em = uInlayCol * (rings + spokes * 0.6) * flow * uRings * 1.5 * uBreath;
  // STAGE A: golden light spreads across the floor from the flower: a soft front, the inlays and
  // the stone joints lit behind it
  if (uLight > 0.001){
    vec3 gold = vec3(1.0, 0.64, 0.28);
    float lit = smoothstep(uLightR, uLightR - 6.0, r) * uLight;
    float head = exp(-pow((r - uLightR) * 0.5, 2.0)) * uLight * (1.0 - smoothstep(0.75, 1.0, uLight));
    em += gold * (lit * (0.12 + 1.8 * (rings + spokes * 0.6) * flow + 0.4 * joint) + head * 1.2) * uBreath;
  }
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
    float on = step(0.4, hash12(cell * 1.3 + h * 17.0));
    vec3 glassTower = mix(vec3(0.06, 0.05, 0.14), vec3(0.16, 0.12, 0.32), h) * (0.7 + 0.3 * smoothstep(-80.0, 60.0, vWorld.y));
    c = glassTower + lit * win * on * (0.7 + 0.6 * hash12(cell + 3.0));
  }
  // aerial haze: distance, and a pink-violet glow rising from the city below
  float d = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-d * 0.0019);
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
uniform vec2 uWind, uSway; uniform vec3 uHer, uFocus;
out vec2 vUv; out vec4 vData; out float vNear, vClear; out vec3 vWorld, vN;
void main(){
  vec3 p = aPosition; float kind = aVertexColor.x, w = aVertexColor.y, ph = aVertexColor.z;
  // the swing varies smoothly with height, so a plant's stem, shoots and flowers stay joined
  float local = ph * 6.28 + aPosition.y * 0.22;
  vec2 swing = uWind + uSway + vec2(sin(uTime * 0.7 + local), cos(uTime * 0.55 + local * 1.3)) * 0.16;
  p.xz += swing * w * 1.6;
  vec3 toP = p - uHer; float d = length(toP);
  float near = exp(-d * d / 170.0);                                // (≈ 1/e at 13 m: she hovers ~5 m from the flower)
  p.xz += normalize(toP.xz + vec2(1e-4)) * near * 0.5 * w;
  if (kind > 0.5 && kind < 1.5 || kind > 2.5) p += aNormal * sin(uTime * 1.9 + ph * 20.0 + aPosition.x * 3.0) * 0.035 * aTexCoord.y * (1.0 + 3.0 * near);
  vec3 ab = uFocus - uCamPos;
  float h = clamp(dot(p - uCamPos, ab) / dot(ab, ab), 0.0, 1.0);
  vClear = smoothstep(1.8, 4.0, length(p - uCamPos - ab * h));     // near the lens, and across the view of the flower
  vNear = near; vUv = aTexCoord; vData = aVertexColor; vWorld = p; vN = aNormal;
  gl_Position = uProj * uView * vec4(p, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.atriumHaze + `
in vec2 vUv; in vec4 vData; in float vNear, vClear; in vec3 vWorld, vN;
out vec4 outColor;
uniform vec3 uColA, uColB, uColC, uGoldC;
uniform float uProx, uBloom, uBreath, uGold, uGoldR, uRippleR, uRippleA;
void main(){
  if (vClear < 0.999){
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dither > vClear) discard;
  }
  vec3 N = normalize(vN), V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float kind = vData.x, ph = vData.z, hue = vData.w;
  float dist = length(vWorld - vec3(0.0, 2.0, 0.0));
  vec3 pal = hue > 1.1 ? uGoldC : hue < 0.5 ? mix(uColA, uColB, hue * 2.0) : mix(uColB, uColC, (hue - 0.5) * 2.0);
  vec3 amb = mix(vec3(0.16, 0.12, 0.26), vec3(0.42, 0.36, 0.62), N.y * 0.5 + 0.5);
  vec3 Lw = normalize(vec3(0.0, 2.0, 0.0) - vWorld);
  vec3 light = amb + vec3(1.0, 0.62, 0.34) * (max(dot(N, Lw), 0.0) * 0.7 + 0.2) * (0.25 + 0.5 * uBloom) * exp(-dist * 0.03);
  float pulse = 0.94 + 0.06 * sin(uTime * 0.7 + ph * 6.28);        // very subtle at rest
  float react = 1.0 + 1.1 * vNear * (0.35 + 0.65 * uProx) + 0.8 * uBloom * exp(-dist * 0.05);
  react += 1.2 * uRippleA * exp(-pow((dist - uRippleR) * 0.3, 2.0));
  vec3 surf, em;
  float across = abs(vUv.x - 0.5) * 2.0;
  if (kind < 0.5){                                                 // stem
    surf = vec3(0.26, 0.24, 0.14); em = vec3(0.1, 0.09, 0.05);
  } else if (kind < 1.5){                                          // leaf: olive, a lit midrib and side veins
    float rib = exp(-across * across * 90.0);
    float veins = smoothstep(0.82, 1.0, sin((vUv.y * 11.0 - across * 3.0) * 3.14159));
    surf = mix(vec3(0.2, 0.32, 0.13), vec3(0.6, 0.62, 0.18), vUv.y * 0.6 + hue * 0.4);
    em = vec3(0.7, 0.75, 0.25) * (rib * 0.4 + veins * 0.08) + mix(vec3(0.2, 0.3, 0.12), vec3(0.5, 0.48, 0.14), vUv.y) * 0.3;
  } else if (kind < 2.5){                                          // flower: a deep throat, a light rim
    float shade = smoothstep(0.0, 1.0, vUv.y);
    surf = pal * (0.3 + 0.45 * shade);
    em = pal * (0.42 + 0.62 * shade * shade) + vec3(1.0, 0.86, 0.6) * exp(-vUv.y * 6.0) * 0.25;
  } else {                                                         // crystal leaf: pale glass with glowing veins
    float rib = exp(-across * across * 70.0);
    float veins = smoothstep(0.7, 1.0, sin((vUv.y * 13.0 - across * 4.0) * 3.14159));
    float fr = pow(1.0 - abs(dot(N, V)), 2.0);
    vec3 film = 0.5 + 0.5 * cos(6.2832 * (vUv.y * 0.5 + fr * 0.6 + hue + vec3(0.0, 0.33, 0.67)));
    surf = mix(uColB, uColC, vUv.y) * 0.2;
    em = mix(uColB, uColA, vUv.y) * (0.22 + 0.25 * across * across) + film * fr * 0.28 + vec3(1.0, 0.86, 0.72) * (rib * 0.7 + veins * 0.28);
  }
  // the transformation: gold spreads out from the flower through the plants
  float gold = uGold * smoothstep(uGoldR, uGoldR - 8.0, dist);
  em = mix(em, em * 0.6 + uGoldC * dot(em, vec3(0.5)) * 1.1, gold * (kind < 1.5 ? 1.0 : 0.2));
  if (kind > 1.5 && kind < 2.5) em += uGoldC * gold * exp(-vUv.y * 5.0) * 0.5;                // the flowers' throats light gold; their colour stays
  if (kind < 0.5) em += uGoldC * gold * 0.28;
  vec3 c = surf * light + em * pulse * react * uBreath;
  c = haze(min(c, vec3(1.3)), vWorld);
  outColor = vec4(c, 1.0);
}
`
};
