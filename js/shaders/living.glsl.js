/* =====================================================================
   Living architecture — Round 02, Phase 4: the building's transformation
   ---------------------------------------------------------------------
   Two programs, each used twice: inside the Memory Garden (the atrium,
   js/garden/gardenScene.js) and outside in the city (the doorway
   building's real faces, js/render/renderer.js). Additive light only.
   Every value that moves comes from AG.R2's data streams (CPU, p5.js):
     uStage  = (A, B, C, D)   stage progress 0..1 (p.map / p.constrain)
     uE      = E (living architecture), uBreath = p.sin breathing
     uOrigin = where the light comes from (the flower inside; the
               doorway outside), uReach = how far stage A's light goes

   livingWall   one quad per wall / face; uv = metres (along, up).
     A  golden light spreading from uOrigin (a soft front in metres)
     B  energy travelling along the structure: columns and floor slabs
        light up from the bottom, pulses run up them
     windows  each window cell has its own threshold (hash) against the
        window stream, so they come on one by one; their colour is a
        per-window mix of uWinA / uWinB, which p.lerpColor moves from
        cyan-lavender through pink to gold as the building transforms
     D  a pink-gold glow descending from the top (the rooftop bloom)
     E  everything breathes
     kind (aVertexColor.x): 0 wall, 1 floor (inside only)
   livingVine   ribbons whose paths p5.js computed on the same walls
     (js/garden/vines.js). aVertexColor = (s, across, depth, hash):
     s = growth order 0..1; drawn up to the growth front uGrow (stage C)
     with a bright tip; colours uColA/B/C from p.lerpColor.
     Leaves share the mesh: quads on the same wall, across = 2 flags
     them, s = the vine point they grow from, uv = (across, along) with
     the base at v = 0. The leaf shape is scaled about that base by how
     far the growth front has passed it, so it unfurls from the vine.
   ===================================================================== */
AG.SHADERS.livingWall = {
  vert: AG.SHADERS.header + `
in vec3 aPosition; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView, uProj;
out vec3 vWorld; out vec2 vUv; out vec4 vData;
void main(){
  vWorld = aPosition; vUv = aTexCoord; vData = aVertexColor;
  gl_Position = uProj * uView * vec4(aPosition, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 vWorld; in vec2 vUv; in vec4 vData;
out vec4 outColor;
uniform vec4 uStage; uniform float uE, uBreath, uWin, uReach, uHeight, uInterior, uFade;
uniform vec3 uOrigin; uniform vec2 uGrid;      // column spacing, storey height (metres)
uniform vec3 uWinA, uWinB;                     // window colours, 0..1 RGB (p.lerpColor by transform, js/garden/living.js)
void main(){
  vec2 m = vUv;
  float A = uStage.x, B = uStage.y, D = uStage.w;
  vec3 gold = vec3(1.0, 0.62, 0.24), pink = vec3(1.0, 0.42, 0.78), cyan = vec3(0.4, 0.82, 1.0), lav = vec3(0.62, 0.5, 1.0);
  // A: golden light spreading from its origin
  float d = distance(vWorld, uOrigin);
  float front = A * uReach;
  float lightA = smoothstep(front, front - 10.0, d) * A;
  vec3 c = gold * lightA * 0.02;
  if (vData.x > 0.5){
    // the atrium floor: a warm pool of light round the flower, and the faintest stone joints
    vec2 g = abs(fract(vWorld.xz / 3.0) - 0.5);
    float tile = smoothstep(0.48, 0.5, max(g.x, g.y));
    float pool = exp(-d * d / 90.0);
    c = gold * A * pool * 0.22 + gold * lightA * tile * 0.035 + lav * tile * 0.012 * B;
    outColor = vec4(c * uBreath * uFade, 1.0);
    return;
  }
  // the structure: columns and floor slabs (thin lines in metres)
  float cx = abs(fract(m.x / uGrid.x + 0.5) - 0.5) * uGrid.x;
  float sy = abs(fract(m.y / uGrid.y + 0.5) - 0.5) * uGrid.y;
  float colLine = 1.0 - smoothstep(0.05, 0.22, cx);
  float slabLine = 1.0 - smoothstep(0.04, 0.16, sy);
  // B: energy rises from the bottom; pulses run up the columns and along the slabs
  float hFront = B * uHeight * 1.08;
  float below = smoothstep(hFront, hFront - 6.0, m.y) * step(0.001, B);
  float colId = floor(m.x / uGrid.x + 0.5);
  float pulseUp = pow(fract(m.y * 0.045 - uTime * 0.42 + hash11(colId * 7.3)), 10.0);
  float pulseAlong = pow(fract(m.x * 0.04 + uTime * 0.3 + hash11(floor(m.y / uGrid.y + 0.5) * 3.1)), 12.0);
  float energy = (colLine * (0.22 + 1.6 * pulseUp) + slabLine * (0.16 + 1.2 * pulseAlong)) * below;
  // the building's structure is barely there until the light reaches it
  c += mix(lav, cyan, 0.5 + 0.5 * sin(colId * 1.7)) * energy * 0.55;
  c += lav * (colLine + slabLine) * lightA * 0.14;
  // windows: one cell between two columns and two slabs; each comes on at its own moment
  vec2 cell = vec2(floor(m.x / uGrid.x), floor(m.y / uGrid.y));
  vec2 f = vec2(fract(m.x / uGrid.x), fract(m.y / uGrid.y));
  // a soft glow inside each window (brighter at its centre), not a flat box
  vec2 wq = (f - vec2(0.5, 0.56)) / vec2(0.22, 0.24);
  float inWin = smoothstep(1.0, 0.55, max(abs(wq.x), abs(wq.y))) * (0.55 + 0.45 * exp(-dot(wq, wq) * 1.5));
  float th = hash12(cell + uInterior * 31.0) * 1.35;                 // about a quarter never light
  float on = smoothstep(th, th + 0.1, uWin * (0.65 + 0.35 * smoothstep(uHeight, 0.0, m.y)));
  vec3 winCol = mix(uWinA, uWinB, hash12(cell * 1.7 + 3.0) * 0.8);   // each window sits at its own point between the two
  c += winCol * inWin * on * (0.13 + 0.04 * sin(uTime * 1.3 + th * 30.0)) * mix(0.35, 1.0, uInterior);   // outside: over the city's own windows, so softer
  // D: a pink-gold glow descending from the top of the walls
  float top = smoothstep(uHeight * (1.0 - 0.7 * D), uHeight, m.y) * D;
  c += mix(pink, gold, 0.4) * top * 0.35;
  // outside, keep it to a delicate overlay; inside, the walls are the room
  c *= mix(0.75, 1.0, uInterior) * uBreath * uFade;
  outColor = vec4(c, 1.0);
}
`
};

AG.SHADERS.livingVine = {
  vert: AG.SHADERS.header + `
in vec3 aPosition; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView, uProj;
out vec4 vData; out vec3 vWorld; out vec2 vUv;
void main(){
  vData = aVertexColor; vWorld = aPosition; vUv = aTexCoord;
  gl_Position = uProj * uView * vec4(aPosition, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec4 vData; in vec3 vWorld; in vec2 vUv;
out vec4 outColor;
uniform float uGrow, uBreath, uE, uFade;
uniform vec3 uColA, uColB, uColC;
void main(){
  float s = vData.x;
  if (s > uGrow) discard;
  if (vData.y > 1.5){
    // A LEAF: it opens as the growth front moves past its vine point (fully open by stage E even
    // at the very tips, where the front stops); the outline is scaled about the leaf's base
    float g = max(smoothstep(0.0, 0.05, uGrow - s), uE);
    if (g < 0.01) discard;
    float al = vUv.y / g, x = (vUv.x * 2.0 - 1.0) / g;
    if (al > 1.0) discard;
    float edge = pow(max(sin(PI * pow(al, 0.7)), 0.0), 0.8) - abs(x);
    if (edge <= 0.0) discard;
    float rib = exp(-x * x * 70.0) * (1.0 - al);
    float pulse = 0.8 + 0.2 * sin(s * 60.0 - uTime * 2.4 + vData.w * 20.0);
    vec3 lc = mix(mix(uColA, uColB, vData.w), uColC, vData.z * 0.5);
    float lk = (0.32 * smoothstep(0.0, 0.3, edge) + 0.75 * smoothstep(0.2, 0.0, edge) + 0.6 * rib) * pulse * (0.85 + 0.25 * uE);
    outColor = vec4(lc * lk * uBreath * uFade, 1.0);
    return;
  }
  float across = exp(-vData.y * vData.y * 2.4);
  float tip = exp(-pow((uGrow - s) * 22.0, 2.0));                  // the bright growing tip
  float flow = 0.7 + 0.3 * sin(s * 60.0 - uTime * 2.4 + vData.w * 20.0);   // light flowing along it
  vec3 col = mix(uColA, uColB, vData.w);
  col = mix(col, uColC, vData.z * 0.6);
  col = mix(col, vec3(1.0, 0.9, 0.96), tip * 0.3);
  float k = across * (0.5 * flow + 1.1 * tip) * (1.0 - 0.35 * vData.z) * (0.85 + 0.25 * uE);
  outColor = vec4(col * k * uBreath * uFade, 1.0);
}
`
};
