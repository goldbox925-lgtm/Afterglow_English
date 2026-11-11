/* =====================================================================
   Round 02 · the 3D heroine (js/character/heroModel.js): GPU skinning.
   ---------------------------------------------------------------------
   The mesh is a p5.Geometry. p5 1.11 has no custom vertex attributes, so
   the four skin influences ride in the vec4 "colour" channel, the same
   packed-data channel the city's meshes use (js/city/geometryBuilder.js):
     aVertexColor[k] = jointIndex + weight · 0.999
   The joint matrices (24 joints) come in as 3 rows each (affine, 72 vec4).
   Light: the Memory Garden's (lavender ambient, warm light from the
   flower, a soft rim), so she sits in the same atmosphere as the flower.
   ===================================================================== */
window.AG = window.AG || {};
AG.SHADERS = AG.SHADERS || {};

AG.SHADERS.heroSkin = {
  vert: AG.SHADERS.header + `
in vec3 aPosition; in vec3 aNormal; in vec2 aTexCoord; in vec4 aVertexColor;
uniform mat4 uView, uProj, uHeroModel;
uniform vec4 uBones[72];
out vec2 vUv; out vec3 vN; out vec3 vWorld;
mat4 bone(int j){
  vec4 a = uBones[j * 3], b = uBones[j * 3 + 1], c = uBones[j * 3 + 2];
  return mat4(a.x, b.x, c.x, 0.0,  a.y, b.y, c.y, 0.0,  a.z, b.z, c.z, 0.0,  a.w, b.w, c.w, 1.0);
}
void main(){
  mat4 S = mat4(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 4; k++){
    float v = aVertexColor[k], j = floor(v + 1e-4), w = clamp((v - j) / 0.999, 0.0, 1.0);
    if (w > 0.0) { S += bone(int(j)) * w; wsum += w; }
  }
  if (wsum < 1e-4) S = mat4(1.0); else S *= 1.0 / wsum;
  vec4 wp = uHeroModel * (S * vec4(aPosition, 1.0));
  vWorld = wp.xyz;
  vN = normalize(mat3(uHeroModel) * (mat3(S) * aNormal));
  vUv = aTexCoord;
  gl_Position = uProj * uView * wp;
}`,
  frag: AG.SHADERS.header + `
uniform sampler2D tTex;
uniform vec3 uCamPos, uKeyPos, uKeyCol, uAmbSky, uAmbGround, uRimCol;
uniform float uWarm, uAlpha, uEmit;
in vec2 vUv; in vec3 vN; in vec3 vWorld;
out vec4 outColor;
void main(){
  vec3 alb = texture(tTex, vUv).rgb;
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(n, V) < -0.2) n = -n;                       // (two-sided cloth: light the side we see)
  vec3 L = normalize(uKeyPos - vWorld);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  vec3 key = uKeyCol * (0.35 + 0.65 * uWarm) * wrap * wrap;
  float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  vec3 col = alb * (amb + key + uEmit) + uRimCol * rim * 0.55;
  outColor = vec4(col, uAlpha);
}`
};
