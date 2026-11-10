/* =====================================================================
   Portal shader — Round 02: the doorway of light into the Memory Garden.
   ---------------------------------------------------------------------
   One quad (corners ±1), drawn additively by the city renderer:
     uKind 0  THE DOORWAY on the building's facade: an arched opening
              (half-size uSize, centre uC, outward normal uN) filled with
              a slow swirl of pink / lavender light and a warm golden
              heart, a bright rim, and a soft spill on the wall around it.
              Depth-tested, so nearer buildings hide it.
     uKind 1  THE BEACON: a tall, soft column of light rising from the
              roof, turned to face the camera around the vertical axis,
              so the doorway's building can be found from anywhere.
              Not depth-tested (like the stage-05 fragments).
   uOpen 0..1 fades both in when the doorway opens; uNear 0..1 (she is
   close) brightens the doorway and dims the beacon.
   ===================================================================== */
AG.SHADERS.portal = {
  vert: AG.SHADERS.header + AG.SHADERS.common + `
in vec3 aPosition;
uniform mat4 uView; uniform mat4 uProj;
uniform vec3 uC; uniform vec3 uN; uniform vec2 uSize; uniform float uKind;
out vec2 vUv; out vec3 vW;
void main(){
  vec2 q = aPosition.xy;                               // the renderer's quad: corners ±1
  vec3 p;
  if (uKind < 0.5){
    vec3 t = normalize(vec3(-uN.z, 0.0, uN.x));
    // the quad is a little larger than the opening (room for the spill), just off the wall
    p = uC + uN * 0.6 + t * q.x * uSize.x * 1.6 + vec3(0.0, 1.0, 0.0) * q.y * uSize.y * 1.35;
    vUv = vec2(q.x * 1.6, q.y * 1.35);                 // in units of the opening's half-size
  } else {
    vec3 toC = uCamPos - uC; toC.y = 0.0;
    vec3 side = normalize(vec3(-toC.z, 0.0, toC.x) + vec3(1e-4, 0.0, 0.0));
    p = uC + side * q.x * uSize.x + vec3(0.0, 1.0, 0.0) * (q.y * 0.5 + 0.5) * uSize.y;
    vUv = q;
  }
  vW = p;
  gl_Position = uProj * uView * vec4(p, 1.0);
}
`,
  frag: AG.SHADERS.header + AG.SHADERS.common + `
in vec2 vUv; in vec3 vW;
out vec4 outColor;
uniform float uKind; uniform float uOpen; uniform float uNear;
void main(){
  vec3 pink = vec3(1.0, 0.42, 0.78), lav = vec3(0.62, 0.5, 1.0), gold = vec3(1.0, 0.62, 0.22), cyan = vec3(0.45, 0.85, 1.0);
  vec3 c;
  if (uKind < 0.5){
    // arched opening (half-size units): straight sides from y = -1 up to y = 0, then a half
    // circle of radius 1. dEdge = signed distance to the outline (negative inside).
    vec2 q = vUv, a = vec2(abs(q.x), q.y);
    float dEdge = a.y > 0.0 ? length(a) - 1.0 : max(a.x - 1.0, -1.0 - a.y);
    float inside = smoothstep(0.03, -0.03, dEdge);
    // the light inside: a slow swirl (two noise layers) from lavender at the edge to a golden heart
    vec2 sq = vec2(q.x, q.y + 0.2);
    float r = length(sq), ang = atan(sq.y, sq.x);
    float sw = vnoise2(vec2(ang * 1.6 + uTime * 0.25, r * 3.0 - uTime * 0.6)) * 0.6 + vnoise2(sq * 3.0 + uTime * 0.2) * 0.4;
    vec3 fill = mix(lav, pink, smoothstep(1.1, 0.4, r + sw * 0.3));
    fill = mix(fill, gold, smoothstep(0.55, 0.0, r) * 0.8);
    float bright = 0.55 + 0.6 * smoothstep(1.0, 0.0, r) + 0.35 * sw;
    c = fill * bright * inside * (0.32 + 0.25 * uNear);
    // the rim: a bright line with a cyan sheen, and a soft spill on the wall around the opening
    float rim = exp(-pow(dEdge / 0.05, 2.0));
    c += mix(pink, cyan, 0.5 + 0.5 * sin(ang * 3.0 + uTime * 1.2)) * rim * 0.9;
    c += pink * exp(-max(dEdge, 0.0) * 4.0) * (1.0 - inside) * 0.18;
    // soft square falloff at the quad's own edges
    c *= smoothstep(1.6, 1.3, abs(q.x)) * smoothstep(1.35, 1.1, abs(q.y));
  } else {
    // beacon: soft across (gaussian), fading toward the top, a slow upward shimmer
    float x = vUv.x, y = vUv.y * 0.5 + 0.5;
    float core = exp(-x * x * 18.0), halo = exp(-x * x * 3.0);
    float shimmer = 0.75 + 0.25 * vnoise2(vec2(x * 3.0, y * 9.0 - uTime * 0.8));
    c = (pink * halo * 0.35 + mix(pink, gold, 0.35) * core * 0.9) * shimmer * pow(1.0 - y, 1.6) * (1.0 - 0.6 * uNear);
  }
  c *= uOpen;
  outColor = vec4(c, 1.0);
}
`
};
