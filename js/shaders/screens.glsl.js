/* =====================================================================
   Screen words shader (stages 04–05, js/fx/screenWords.js)
   ---------------------------------------------------------------------
   Vertex: the same floating / homing offset as the city shader applies
   to her parapet pieces (fragment id in aVertexColor.b, box centre in
   aNormal), so every word and thread stays on its screen.
   Fragment (additive):
     kind 0  a word: sharp warm lettering + its soft glow (texture rows
             0–5 sharp, 6–11 glow), brightness uLit[i]
     kind 1  a thread between two screens: two hair-thin warm lines
             (~1 px, from fwidth) that wave gently and meet at the ends,
             with a small bright node at each end; drawn in from the left
             up to uLine[i]
   ===================================================================== */
AG.SHADERS.screens = {
  vert: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.field + `
in vec3 aPosition; in vec3 aNormal; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView; uniform mat4 uProj;
uniform float uRebuild, uTremor;
out vec2 vUv; out vec4 vD; out vec3 vWorld; out float vHome;
void main(){
  vec3 p = aPosition; float frag = aVertexColor.b;
  // identical to city.glsl.js for her parapet pieces (order 0): home once rebuilt
  float Lv = fieldAt(aNormal).w;
  float a = smoothstep(0.0, 0.18, max(uRebuild, Lv * 0.98));
  float away = 1.0 - a;
  vec3 off = vec3((hash11(frag * 13.1) - 0.5) * 3.0, -3.2 - hash11(frag * 7.7) * 2.5, -1.8 - hash11(frag * 3.3) * 3.0);
  float bob = sin(uTime * 0.35 + frag * 41.0);
  vec3 wob = vec3(sin(uTime * 0.21 + frag * 17.0), bob, cos(uTime * 0.27 + frag * 23.0)) * 0.07;
  vec3 shiver = (vec3(hash11(floor(uTime * 30.0) + frag * 99.0), hash11(floor(uTime * 30.0) + frag * 71.0), hash11(floor(uTime * 30.0) + frag * 37.0)) - 0.5) * uTremor * 0.05;
  p += (off + wob + shiver) * away;
  vHome = a; vUv = aTexCoord; vD = aVertexColor; vWorld = p;
  gl_Position = uProj * uView * vec4(p, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + AG.SHADERS.fog + `
in vec2 vUv; in vec4 vD; in vec3 vWorld; in float vHome;
out vec4 outColor;
uniform sampler2D tWords;
uniform float uLit[6];
uniform float uLine[5];
uniform float uStrength;        // overall level (exposure of this effect)
const vec3 WARM = vec3(1.0, 0.70, 0.40);
const vec3 CORE = vec3(1.0, 0.90, 0.78);
void main(){
  int idx = int(vD.g + 0.5);
  vec3 col = vec3(0.0);
  if (vD.r < 0.5){
    float lit = uLit[idx];
    if (lit < 0.002) discard;
    float ty = 1.0 - vUv.y;
    float s = texture(tWords, vec2(vUv.x, (float(idx) + ty) / 12.0)).a;
    float g = texture(tWords, vec2(vUv.x, (float(idx) + 6.0 + ty) / 12.0)).a;
    col = (mix(WARM, CORE, 0.55) * s * 1.35 + WARM * g * 0.45) * lit;
  } else {
    float prog = uLine[idx];
    float x = vUv.x;
    if (prog < 0.002 || x > prog) discard;
    float env = sin(x * 3.14159);
    float y1 = 0.5 + 0.30 * env * sin(x * 6.2832 + 0.7 + uTime * 0.35);
    float y2 = 0.5 + 0.22 * env * sin(x * 6.2832 + 2.6 - uTime * 0.28);
    float w = max(fwidth(vUv.y), 1e-4);
    float l1 = 1.0 - smoothstep(0.35 * w, 1.1 * w, abs(vUv.y - y1));
    float l2 = 1.0 - smoothstep(0.35 * w, 1.1 * w, abs(vUv.y - y2));
    float halo = exp(-pow((vUv.y - y1) / (w * 3.5), 2.0)) * 0.18;
    // small nodes where the thread meets each screen, and a soft tip while it draws in
    float wx = max(fwidth(vUv.x), 1e-4);
    float node = exp(-(pow(x / (wx * 2.2), 2.0) + pow((vUv.y - 0.5) / (w * 2.2), 2.0)))
               + exp(-(pow((1.0 - x) / (wx * 2.2), 2.0) + pow((vUv.y - 0.5) / (w * 2.2), 2.0))) * step(0.999, prog);
    float tip = exp(-pow((prog - x) / (wx * 3.0), 2.0)) * (1.0 - step(0.999, prog)) * exp(-pow((vUv.y - y1) / (w * 3.0), 2.0));
    col = WARM * (l1 * 0.75 + l2 * 0.4 + halo) + CORE * (node * 0.9 + tip * 1.2);
  }
  col *= vHome * uStrength * (1.0 - fogAmount(vWorld) * 0.6);
  outColor = vec4(col, 1.0);
}
`
};
