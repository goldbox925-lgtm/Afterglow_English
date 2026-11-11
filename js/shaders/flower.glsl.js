/* =====================================================================
   Round 02 · Memory Garden — the Interactive Bloom flower (shaders)
   ---------------------------------------------------------------------
   flowerPetal  ONE petal per draw call (uniforms uA/uB/uC/uD describe it).
     The mesh is a plain (u, v) grid: u = 0 at the base pivot … 1 at the
     tip, v = −1 … 1 across. The VERTEX shader bends it into a real 3D
     petal in the petal's own local frame (petalLocal), and p5's model
     matrix (uModelMatrix: p.translate / p.rotate / p.scale, see
     js/garden/gardenScene.js) places it: azimuth, base, the rotation
     about its base as it opens, idle sway, growth. Shape:
       · the spine leaves the PIVOT straight up (p.rotate tilts it open by
         θ about the base) and bends with a curvature that changes along it,
         k(s) = k0 + k1·s: an S-curve (flared base, upturned tip) when open,
         a bulge folding inward over the bud when closed. Integrated
         numerically (10 midpoint steps);
       · a rounded obovate outline (widest above the middle, narrow claw,
         soft round tip), slightly asymmetric; the halves cup inward, the
         edges curl back near the tip, a faint noise ripple;
       · the normal comes from the deformed surface (central differences);
       · flutter / twist from CPU p.noise().
     The FRAGMENT shader is a lit translucent tissue: hemisphere ambient,
     a cool key light and a warm point light at the core (wrap diffuse),
     back-light transmission, a soft dewy highlight, a fresnel sheen,
     thin-film iridescence, noise mottling and striations, fine veins with
     flowing light, soft rims; premultiplied alpha, sorted back to front by
     the CPU; HDR, so the bloom pass adds the glow.
     uKind 1 draws the golden receptacle (a small dome mesh) instead.
   flowerSprite  camera-facing sprites and thin ribbons:
     kind 0 = glow sprites (core glow, anthers, floating motes) from
              uniform arrays (CPU positions, LightParticle objects)
     kind 1 = stamen filaments (ribbons between uStamA[i] and uStamB[i])
     kind 2 = the ground disc: soft concentric light rings + click pulse
   flowerBackdrop  the preview's night-violet gradient behind it all.
   flowerComposite  scene + bloom → tone map, vignette (preview only).
   ===================================================================== */
window.AG = window.AG || {};
AG.SHADERS = AG.SHADERS || {};

AG.SHADERS.flowerPetal = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 aPosition; in vec2 aTexCoord;
uniform mat4 uView, uProj;
uniform mat4 uModelMatrix; // p5's own transform stack (p.translate / p.rotate / p.scale in gardenScene.js)
uniform vec3 uCenter;      // flower base (world) — used by the lighting
uniform float uScale;      // metres per flower unit — used by the lighting
uniform vec4 uA;           // -, pivot radius r0, length L, half-width W
uniform vec4 uB;           // θ (hinge + sway: ONLY for the closed bud's wrap, see below), base curvature k0, cup, pivot height y0
uniform vec4 uC;           // flutter (sideways sway at the tip), twist, curvature change k1, asymmetry
uniform vec4 uD;           // edge curl, surface ripple, noise seed, wrap (1 = closed: wrapped round the axis)
uniform float uKind;       // 0 petal · 1 receptacle dome
out vec2 vUv; out vec3 vN; out vec3 vWorld; out float vU;

/* one point of the petal in its OWN LOCAL FRAME: the base pivot at the origin, the petal rising
   along +Y, +X = away from the flower's centre, +Z = across. Where the petal stands, which way it
   faces, how far it has rotated open about its base and how large it is all come from p5's model
   matrix (p.translate → p.rotate(−φ, Y) → p.translate(base) → p.rotate(−θ, Z) → p.scale).
   SPINE: leaves the base straight up and bends with a curvature that changes along it,
   k(s) = k0 + k1·s (an S-curve when open, a bulge folding inward when closed), integrated
   numerically (midpoint rule).
   OUTLINE: rounded obovate (widest above the middle, narrow claw, soft round tip), one side a
   little wider; the halves cup inward, the edges curl back near the tip, a faint noise ripple. */
vec3 petalLocal(float u, float v, out vec3 nIn3){
  float L = uA.z, W = uA.w, k0 = uB.y, cup = uB.z, k1 = uC.z, asym = uC.w;
  float s = u * L, h = s / 10.0;
  vec2 sp = vec2(0.0);
  for (int i = 0; i < 10; i++){ float m = (float(i) + 0.5) * h; float al = k0 * m + 0.5 * k1 * m * m; sp += vec2(sin(al), cos(al)) * h; }
  float al = k0 * s + 0.5 * k1 * s * s;
  vec2 nIn = vec2(-cos(al), sin(al));                       // toward the inner face, in (out, up)
  nIn3 = vec3(nIn, 0.0);
  float shape = pow(max(sin(PI * pow(clamp(u, 0.0, 1.0), 0.6)), 0.0), 0.55);
  float w = W * max(shape, 0.17 * (1.0 - u)) * (1.0 + asym * v);
  float tw = uC.y * u;                                       // a slight twist toward the tip
  vec3 Tw = normalize(vec3(0.0, sin(tw) * 0.25, cos(tw)));
  float av = abs(v);
  float ripple = (vnoise(vec3(u * 3.5, v * 2.2, uD.z * 17.0)) - 0.5) * uD.y * W * smoothstep(0.1, 0.6, u);
  float lean = (uC.x + asym * 0.18) * u * u;                // flutter + a lean to one side
  vec3 flatP = vec3(sp, 0.0) + Tw * (v * w) + nIn3 * (cup * v * v * w - uD.x * av * av * av * u * u * w + ripple) + vec3(0.0, 0.0, lean);
  if (uD.w < 0.001) return flatP;
  // CLOSED BUD: the width wraps round the FLOWER's axis at the petal's radius, so the bud is one
  // smooth rounded body. That needs the petal's position in the flower (radius r0 + …), so the
  // same θ that p.rotate() applies is used here to go to the flower's frame and back.
  float c = cos(uB.x), sn = sin(uB.x), r0 = uA.y, y0 = uB.w;
  vec2 f = vec2(sp.x * c + sp.y * sn, -sp.x * sn + sp.y * c);           // spine rotated by θ (= the hinge)
  float rr = r0 + f.x, nInY = -nIn.x * sn + nIn.y * c;
  float a = clamp(v * w / max(rr, 0.1), -1.25, 1.25) + lean / max(rr, 0.3);
  vec3 q = vec3((rr + ripple * 0.5) * cos(a) - r0, f.y + 0.12 * cup * v * v * w * nInY, (rr + ripple * 0.5) * sin(a));
  vec3 wrapped = vec3(q.x * c - q.y * sn, q.x * sn + q.y * c, q.z);      // back into the petal's local frame
  return mix(flatP, wrapped, uD.w);
}
void main(){
  if (uKind > 0.5){
    // receptacle: a unit dome, placed and scaled by p5's model matrix (p.translate / p.scale)
    vec3 lp = vec3(aPosition.x * 0.13, aPosition.y * 0.1 + 0.09, aPosition.z * 0.13);
    vec3 p = (uModelMatrix * vec4(lp, 1.0)).xyz;
    vN = normalize(vec3(aPosition.x, aPosition.y * 1.4, aPosition.z));
    vUv = aTexCoord; vU = 0.0; vWorld = p;
    gl_Position = uProj * uView * vec4(p, 1.0);
    return;
  }
  float u = aPosition.x, v = aPosition.y;
  vec3 nIn3, tmp;
  vec3 lp = petalLocal(u, v, nIn3);
  // the true surface normal from the deformed surface itself (central differences)
  const float e = 0.012;
  vec3 tu = petalLocal(min(u + e, 1.0), v, tmp) - petalLocal(max(u - e, 0.0), v, tmp);
  vec3 tv = petalLocal(u, min(v + e, 1.0), tmp) - petalLocal(u, max(v - e, -1.0), tmp);
  vec3 n = normalize(cross(tv, tu));
  if (dot(n, nIn3) < 0.0) n = -n;                            // n = the INNER face's normal
  // p5's model matrix: rotations and uniform scales only, so its 3×3 part carries the normal
  vN = normalize(mat3(uModelMatrix) * n);
  vec3 wp = (uModelMatrix * vec4(lp, 1.0)).xyz;
  vUv = vec2(u, v); vU = u; vWorld = wp;
  gl_Position = uProj * uView * vec4(wp, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; in vec3 vN; in vec3 vWorld; in float vU;
out vec4 outColor;
uniform float uKind;
uniform vec3 uBaseCol, uBodyCol, uTipCol, uRimCol, uCoreCol;   // p.lerpColor results (CPU)
uniform float uBloom, uAwake, uCore, uVein, uAlpha, uSeed, uIri, uEmit;
uniform vec3 uHeatCol, uStamCol;      // the flower's own warm light (palette)
uniform vec3 uCenter; uniform float uScale;
void main(){
  vec3 V = normalize(uCamPos - vWorld);
  vec3 Nf = normalize(vN);
  vec3 N = gl_FrontFacing ? Nf : -Nf;                        // two-sided: the face we are looking at
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0), fr = pow(1.0 - ndv, 2.4);
  // the warm core light: a soft point light just above the heart
  vec3 Lc = uCenter + vec3(0.0, 0.42, 0.0) * uScale - vWorld; float dc = length(Lc) / uScale; Lc = normalize(Lc);
  float coreAtt = 1.0 / (1.0 + dc * dc * 2.2);
  if (uKind > 0.5){
    // the golden receptacle: warm, bright toward its top, rim-lit
    float top = smoothstep(-0.2, 1.0, vN.y);
    vec3 c = uCoreCol * (0.45 + 0.9 * uCore * top) + uHeatCol * fr * (0.3 + 0.5 * uCore);
    outColor = vec4(c, 1.0);
    return;
  }
  float u = vUv.x, v = vUv.y, av = abs(v);
  // ---- surface variation: soft mottling and fine lengthwise striations (procedural noise) ----
  float n1 = vnoise(vec3(u * 5.0, v * 3.0, uSeed * 31.0));
  float n2 = vnoise(vec3(u * 14.0, v * 9.0, uSeed * 13.0 + 4.0));
  float stri = 0.5 + 0.5 * sin(v * 46.0 + n1 * 5.0);
  // ---- albedo: warm near the pivot → body colour → cool tip, with thin-film iridescence ----
  vec3 col = mix(uBaseCol, uBodyCol, smoothstep(0.0, 0.42, u));
  col = mix(col, uTipCol, smoothstep(0.5, 1.0, u) * 0.8);
  float film = fr * 0.9 + u * 0.35 + av * 0.25 + n1 * 0.25 + uSeed + uTime * 0.03;
  vec3 ir = 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
  col *= 1.0 + (ir - 0.5) * 0.8 * uIri;
  col = mix(col, uTipCol, fr * 0.4 * uIri);
  col *= 0.9 + 0.14 * n1 + 0.05 * (stri - 0.5);
  // ---- lighting ----
  // soft hemisphere ambient (lavender sky above, deep violet below) so it never goes flat-dark
  vec3 amb = mix(vec3(0.30, 0.20, 0.42), vec3(0.62, 0.55, 0.85), N.y * 0.5 + 0.5);
  // a cool key light from above-front, with wrap diffuse (thin, light-scattering tissue)
  vec3 Lk = normalize(vec3(0.35, 0.85, 0.4)), keyCol = vec3(0.95, 0.9, 1.0);
  float wrapK = clamp((dot(N, Lk) + 0.55) / 1.55, 0.0, 1.0);
  float wrapC = clamp((dot(N, Lc) + 0.6) / 1.6, 0.0, 1.0);
  vec3 coreLightCol = uHeatCol * uCore * coreAtt;
  vec3 diffuse = amb * 0.55 + keyCol * wrapK * 0.5 + coreLightCol * wrapC * 1.05;
  // translucency: light from BEHIND the petal glows through it (thinner in the middle)
  float thin = 1.0 - 0.6 * smoothstep(0.55, 1.0, av);
  float tK = pow(clamp(dot(V, -normalize(Lk + N * 0.4)), 0.0, 1.0), 3.0);
  float tC = pow(clamp(dot(V, -normalize(Lc + N * 0.4)), 0.0, 1.0), 2.0);
  vec3 trans = (keyCol * tK * 0.45 + coreLightCol * tC * 1.6) * thin;
  // a soft, wide dewy highlight (not a hard plastic spot) and a fresnel sheen in the iridescent hue
  vec3 H = normalize(Lk + V);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 36.0) * 0.28 + pow(clamp(dot(N, normalize(Lc + V)), 0.0, 1.0), 24.0) * 0.4 * uCore * coreAtt;
  vec3 sheen = mix(uRimCol, mix(uTipCol, ir, 0.4), 0.5) * fr * (0.35 + 0.35 * uIri);
  // ---- glowing veins: a mid vein and fine veins that converge toward the base, light flowing up them ----
  float q = v * 4.5 + 0.12 * (n2 - 0.5) + 0.05 * sin(u * 8.0 + uSeed * 6.0);
  float fine = (1.0 - smoothstep(0.0, 0.045, abs(fract(q) - 0.5))) * smoothstep(0.04, 0.2, u) * smoothstep(1.0, 0.6, u) * smoothstep(0.95, 0.6, av);
  float mid = exp(-av * 34.0) * smoothstep(0.98, 0.25, u) * smoothstep(0.0, 0.1, u);
  float flow = 0.6 + 0.4 * sin(u * 12.0 - uTime * 2.0 + uSeed * 20.0);
  float vein = (mid + fine * 0.85) * flow;
  // ---- rims: the edge and tip glow softly (not right at the base, where ten petals overlap) ----
  float rim = (smoothstep(0.8, 1.0, av) * 0.8 + smoothstep(0.9, 1.0, u) * 0.5) * smoothstep(0.08, 0.35, u);
  vec3 veinCol = mix(uRimCol, uStamCol, smoothstep(0.5, 0.0, u) * 0.6);
  vec3 emit = (uRimCol * rim * 0.45 + veinCol * vein * uVein * 1.25 + uBodyCol * 0.12) * uEmit
            + uHeatCol * exp(-u * 5.5) * uCore * 0.35;
  vec3 c = col * (diffuse + trans) + emit + sheen + vec3(1.0, 0.92, 0.98) * spec;
  // ---- translucency (alpha): thin in the middle, denser at the edges and at grazing angles ----
  float a = clamp(uAlpha * (0.5 + 0.32 * fr + 0.22 * rim + 0.12 * vein + 0.1 * (n1 - 0.5)), 0.0, 0.94);
  // p5's BLEND is premultiplied (ONE, ONE_MINUS_SRC_ALPHA): the colour must be multiplied by alpha,
  // or every translucent layer adds its full brightness and the heart washes out to white
  outColor = vec4(c * a, a);
}
`
};

AG.SHADERS.flowerSprite = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 aPosition; in vec2 aTexCoord;
uniform mat4 uView, uProj;
uniform float uKind;
uniform vec4 uSpr[64];       // kind 0: xyz + size
uniform vec4 uSprC[64];      // kind 0: rgb + alpha
uniform vec4 uStamA[18];     // kind 1: filament base xyz + width
uniform vec4 uStamB[18];     // kind 1: filament tip xyz + brightness
uniform vec3 uCenter, uStamCol; uniform float uScale, uDisc;
out vec2 vUv; out vec3 vCol; out float vA; out float vKind;
void main(){
  int i = int(aPosition.x + 0.5);
  vKind = uKind;
  if (uKind < 0.5){
    vec4 s = uSpr[i], c = uSprC[i];
    vec4 vp = uView * vec4(s.xyz, 1.0);
    vp.xy += aTexCoord * s.w * (c.a > 0.0 ? 1.0 : 0.0);
    vUv = aTexCoord; vCol = c.rgb; vA = c.a;
    gl_Position = uProj * vp;
  } else if (uKind < 1.5){
    if (i >= 18) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    vec4 a = uStamA[i], b = uStamB[i];
    vec4 va = uView * vec4(a.xyz, 1.0), vb = uView * vec4(b.xyz, 1.0);
    vec2 d = vb.xy - va.xy; float dl = length(d); vec2 dn = dl > 1e-6 ? d / dl : vec2(0.0, 1.0), pn = vec2(-dn.y, dn.x);
    float t = aTexCoord.x * 0.5 + 0.5;
    vec4 vp = mix(va, vb, t); vp.xy += pn * aTexCoord.y * a.w * mix(1.0, 0.45, t);
    vUv = vec2(t, aTexCoord.y); vCol = uStamCol; vA = b.w * 0.75;
    gl_Position = uProj * vp;
  } else {
    // ground disc in the XZ plane under the flower
    vec3 p = uCenter + vec3(aTexCoord.x, 0.0, aTexCoord.y) * uDisc * uScale + vec3(0.0, 0.004, 0.0);
    vUv = aTexCoord; vCol = vec3(1.0); vA = 1.0;
    gl_Position = uProj * uView * vec4(p, 1.0);
  }
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; in vec3 vCol; in float vA; in float vKind;
out vec4 outColor;
uniform float uBloom, uAwake, uPulseR, uPulseA;
uniform vec3 uRingCol;
void main(){
  if (vKind < 0.5){
    float r2 = dot(vUv, vUv); if (r2 > 1.0) discard;
    float g = exp(-r2 * 4.0) + 0.7 * exp(-r2 * 26.0);
    outColor = vec4(vCol * g * vA, 1.0);
  } else if (vKind < 1.5){
    float g = exp(-vUv.y * vUv.y * 3.5);
    outColor = vec4(vCol * g * vA * mix(0.6, 1.4, vUv.x), 1.0);
  } else {
    // soft concentric rings that brighten as it blooms, and the expanding click pulse
    float r = length(vUv);
    if (r > 1.0) discard;
    float rings = 0.0;
    for (int k = 1; k <= 3; k++){ float rr = 0.28 * float(k); rings += exp(-pow((r - rr) * 60.0, 2.0)) * (1.0 - 0.25 * float(k)); }
    float glow = exp(-r * r * 9.0) * 0.3;
    float pulse = exp(-pow((r - uPulseR) * 30.0, 2.0)) * uPulseA;
    vec3 c = uRingCol * ((rings * (0.25 + 0.75 * uBloom) + glow) * (0.3 + 0.7 * max(uAwake, uBloom)) + pulse * 1.6);
    outColor = vec4(c * (1.0 - smoothstep(0.8, 1.0, r)), 1.0);
  }
}
`
};

AG.SHADERS.flowerBackdrop = {
  vert: AG.SHADERS.quadVert,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; out vec4 outColor;
uniform float uBloom;
void main(){
  vec2 q = vUv - vec2(0.5, 0.42);
  vec3 top = vec3(0.07, 0.04, 0.12), low = vec3(0.16, 0.07, 0.2);
  vec3 c = mix(low, top, smoothstep(0.0, 1.0, vUv.y));
  c += vec3(0.5, 0.25, 0.55) * exp(-dot(q, q) * 6.0) * (0.10 + 0.12 * uBloom);
  float st = step(0.9975, hash12(floor(vUv * vec2(900.0, 560.0))));
  c += st * 0.25 * smoothstep(0.35, 1.0, vUv.y);
  outColor = vec4(c, 1.0);
}
`
};

AG.SHADERS.flowerComposite = {
  vert: AG.SHADERS.quadVert,
  frag: AG.SHADERS.header + `
in vec2 vUv; out vec4 outColor;
uniform sampler2D tScene, tBloom; uniform float uBloomAmt;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = texture(tScene, vUv).rgb + texture(tBloom, vUv).rgb * uBloomAmt;
  // tone map: plain ACES pushes bright colours toward white; scaling the colour by the curve of
  // its brightest channel keeps the hue. A blend keeps a little white in the hottest highlights.
  c *= 0.95;
  float m = max(max(c.r, c.g), c.b);
  vec3 keepHue = c * (aces(vec3(m)).x / max(m, 1e-4));
  c = mix(aces(c), keepHue, 0.65);
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.9;
  outColor = vec4(pow(c, vec3(1.0 / 1.05)), 1.0);
}
`
};
