/* =====================================================================
   Network shader — the viewer's lights (states 02–05).
   ---------------------------------------------------------------------
   NODES  (one camera-facing sprite each, data in uniform arrays)
     kind 1  fragile light (FRACTURE): a window that flickers / blacks out
     kind 2  lit node: a steady light in its colour, slow breathing halo
     kind 3  dark node within reach of a lit one: a faint cold ring
     kind 4  dark node out of reach: a barely visible ember
     kind 5  stage-05 fragment: a four-petal crystal flower in its colour;
             kind 5 + 0.9×burst while it is being collected (flare, then gone)
     kind 6  a spark of the collection burst (6 + 0.9×age): small, sharp, fading
     hover (encoded in S.w ≥ 2): an outer ring, so the target is clear
   LINKS  (8-segment ribbons that arc gently between two windows)
     w of uA = progress 0..1 of the thread travelling A → B; the head is a
     bright spark; once arrived the thread stays, with a slow pulse.
   Two programs (nodes / links) keep each under the vertex-uniform limit.
   ===================================================================== */
AG.SHADERS.networkNode = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
#define MAXN 48
in vec3 aPosition; in vec2 aTexCoord;
uniform mat4 uView; uniform mat4 uProj;
uniform vec4 uP[MAXN]; uniform vec4 uS[MAXN];
uniform float uCount;
out vec2 vUv; out vec3 vCol; out float vKind; out float vLit; out float vHover; out float vSeed; out float vDist;
void main(){
  int i = int(aPosition.x + 0.5);
  if (float(i) >= uCount){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 P = uP[i], S = uS[i];
  float hover = step(1.5, S.w);
  vLit = S.w - 2.0 * hover; vHover = hover; vKind = P.w; vCol = S.rgb; vSeed = float(i);
  vec3 p = P.xyz;
  vec3 toC = uCamPos - p; float dc = length(toC);
  p += toC / dc * 1.2;                              // just in front of the facade
  vDist = dc;
  float k = P.w;
  float base = k < 1.5 ? 1.6 : k < 2.5 ? 3.2 : k < 3.5 ? 2.2 : 1.2;
  float size = max(base, dc * (k < 1.5 ? 0.0075 : k < 2.5 ? 0.011 : k < 3.5 ? 0.0085 : 0.004)) * (1.0 + hover * 0.7);
  if (k > 4.5 && k < 5.95) size = max(7.0, dc * 0.02) * (1.0 + 1.6 * clamp((k - 5.0) / 0.9, 0.0, 1.0));   // fragment (+ burst)
  if (k > 5.95) size = max(1.6, dc * 0.006) * (1.0 - 0.6 * clamp((k - 6.0) / 0.9, 0.0, 1.0));            // burst spark
  vec4 vp = uView * vec4(p, 1.0);
  vp.xy += aTexCoord * size;
  vUv = aTexCoord;
  gl_Position = uProj * vp;
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.fog + `
in vec2 vUv; in vec3 vCol; in float vKind; in float vLit; in float vHover; in float vSeed; in float vDist;
out vec4 outColor;
uniform float uFogMul;
void main(){
  float r = length(vUv);
  if (r > 1.0) discard;
  vec3 c = vec3(0.0);
  float breathe = 0.5 + 0.5 * sin(uTime * 1.6 + vSeed * 1.7);
  if (vKind < 1.5){
    // fragile window: a hot core that flickers with vLit, a soft spill
    c = vCol * (exp(-r * r * 9.0) * 2.4 + exp(-r * r * 2.2) * 0.35) * vLit;
    c += vec3(0.6, 0.75, 1.0) * smoothstep(0.08, 0.0, abs(r - 0.78)) * 0.25 * (1.0 - vLit);   // a cold trace while dark
  } else if (vKind < 2.5){
    c = vCol * (exp(-r * r * 14.0) * 3.0 + exp(-r * r * 3.0) * (0.35 + 0.25 * breathe)) * max(vLit, 0.05);
  } else if (vKind < 3.5){
    float ring = smoothstep(0.1, 0.0, abs(r - (0.55 + 0.15 * breathe)));
    c = vec3(0.55, 0.75, 1.0) * (ring * 0.55 + exp(-r * r * 30.0) * 0.5) * (0.6 + 0.4 * breathe);
  } else if (vKind > 5.95){
    // burst spark: a bright point with a four-ray glint, fading with age
    float age = clamp((vKind - 6.0) / 0.9, 0.0, 1.0);
    float rays = exp(-abs(vUv.x) * 18.0) * exp(-abs(vUv.y) * 2.5) + exp(-abs(vUv.y) * 18.0) * exp(-abs(vUv.x) * 2.5);
    c = mix(vCol, vec3(1.0), 0.4) * (exp(-r * r * 22.0) * 1.6 + rays * 0.9) * (1.0 - age) * (1.0 - age);
  } else if (vKind > 4.5){
    // fragment: four luminous crystal petals, a white-hot heart, a soft halo; slowly turning
    float burst = clamp((vKind - 5.0) / 0.9, 0.0, 1.0);
    float a = atan(vUv.y, vUv.x) + uTime * 0.35 + vSeed;
    float petal = pow(abs(cos(2.0 * a)), 0.7);                 // 4 petals
    float edgeR = 0.16 + 0.5 * petal;
    float body = smoothstep(edgeR + 0.03, edgeR - 0.03, r);
    float rim = smoothstep(0.035, 0.0, abs(r - edgeR)) * step(0.2, petal);
    float facet = 0.7 + 0.3 * smoothstep(0.05, 0.0, abs(fract(a / (PI * 0.25)) - 0.5) - 0.42);
    float glint = pow(max(0.0, sin(uTime * 2.3 + vSeed * 3.0)), 12.0);
    // kept below the bloom's saturation so each fragment keeps its own colour
    c = vCol * body * (0.28 + 0.32 * facet) * (0.9 + 0.2 * breathe)
      + mix(vCol, vec3(1.0), 0.35) * rim * 0.75
      + mix(vCol, vec3(1.0), 0.6) * exp(-r * r * 140.0) * (0.8 + 0.6 * glint)
      + vCol * exp(-r * r * 4.0) * 0.18;
    // collection: the flower flares white and dissolves while a ring of its colour expands
    c = c * (1.0 + 2.5 * burst) * (1.0 - burst) + mix(vec3(1.0), vCol, 0.4) * smoothstep(0.07, 0.0, abs(r - (0.2 + 0.75 * burst))) * 2.2 * (1.0 - burst);
  } else {
    c = vec3(0.45, 0.55, 0.8) * exp(-r * r * 26.0) * 0.18;
  }
  if (vHover > 0.5) c += mix(vec3(1.0), vCol, 0.4) * smoothstep(0.06, 0.0, abs(r - 0.9)) * 1.4;
  c *= 1.0 - min(0.6, vDist / 2400.0) * uFogMul;
  outColor = vec4(c, 1.0);
}
`
};

AG.SHADERS.networkLink = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
#define MAXN 48
in vec3 aPosition; in vec2 aTexCoord;
uniform mat4 uView; uniform mat4 uProj;
uniform vec4 uA[MAXN]; uniform vec4 uB[MAXN];
uniform vec3 uPal[5];
uniform float uCount;
out float vT; out float vX; out float vK; out vec3 vCol; out float vLen; out float vSeed;
void main(){
  int i = int(aPosition.x + 0.5);
  if (float(i) >= uCount){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 A = uA[i], B = uB[i];
  float seg = aPosition.y;                                // 0..7
  float t = (seg + (aTexCoord.y * 0.5 + 0.5)) / 8.0;
  vec3 pa = A.xyz, pb = B.xyz;
  float L = length(pb - pa);
  vec3 p = mix(pa, pb, t) + vec3(0.0, sin(t * PI) * L * 0.07, 0.0);
  vec3 tang = normalize(pb - pa + vec3(0.0, cos(t * PI) * L * 0.07 * PI, 0.0));
  vec3 toC = uCamPos - p; float dc = length(toC);
  vec3 side = normalize(cross(tang, toC / dc));
  p += toC / dc * 1.0;
  float w = max(0.28, dc * 0.0021);
  p += side * aTexCoord.x * w;
  int ci = int(B.w + 0.5);
  vCol = ci == 0 ? uPal[0] : ci == 1 ? uPal[1] : ci == 2 ? uPal[2] : ci == 3 ? uPal[3] : uPal[4];
  vT = t; vX = aTexCoord.x; vK = A.w; vLen = L; vSeed = float(i);
  gl_Position = uProj * uView * vec4(p, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in float vT; in float vX; in float vK; in vec3 vCol; in float vLen; in float vSeed;
out vec4 outColor;
void main(){
  float core = exp(-vX * vX * 7.0);
  float shown = smoothstep(vK + 0.01, vK - 0.01, vT);
  float head = vK < 0.999 ? exp(-abs(vT - vK) * vLen / 3.0) : 0.0;
  float flow = 0.5 + 0.5 * sin((vT * vLen) * 0.12 - uTime * 3.0 + vSeed);
  float settled = smoothstep(0.98, 1.0, vK);
  vec3 c = vCol * core * shown * (0.55 + 0.9 * (1.0 - settled) + 0.35 * flow * settled);
  c += mix(vec3(1.0), vCol, 0.3) * head * core * 4.0;
  outColor = vec4(c, 1.0);
}
`
};
