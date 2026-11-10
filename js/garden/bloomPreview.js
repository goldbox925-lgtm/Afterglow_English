/* =====================================================================
   Round 02 · Memory Garden — Interactive Bloom DEV PREVIEW (bloom.html)
   ---------------------------------------------------------------------
   A separate p5.js instance (WebGL2), the same way the game runs, that
   shows ONE AG.BloomFlower on its own. Nothing here touches Round 01.

   Controls
     click the flower's heart  → awaken (the core pulses)
     drag outward from it      → unfold (the farther, the more it opens;
                                  release keeps it; drag again for more)
     drag anywhere else        → orbit the camera     wheel → zoom
     R / Reset button          → back to the closed bud
   While the flower is being dragged the camera does not orbit.

   The scene itself (camera, picking, drawing, bloom) is AG.GardenScene
   (js/garden/gardenScene.js), the same one the game draws inside the
   portal building. This file only wires p5's events and the meter.

   p5.js used here: p.mousePressed / p.mouseDragged / p.mouseReleased /
   p.mouseWheel / p.keyPressed, p.mouseX / p.mouseY, p.deltaTime.
   ===================================================================== */
window.AG = window.AG || {};

new p5((p) => {
  let scene = null;
  const $ = (id) => document.getElementById(id);

  p.setup = function () {
    p.setAttributes({ antialias: false, alpha: false, depth: true, version: 2 });
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    p.setAttributes({ antialias: false, alpha: false, depth: true, version: 2 });
    p.pixelDensity(Math.min(window.devicePixelRatio || 1, 1.5));
    scene = AG.GardenScene.create(p);
    scene.init();
    // test bench / console
    window.__flower = scene.flower; window.__bloomCam = scene.cam; window.__bloomProject = (w) => { scene.camera(); return scene.project(w); };
    $('btnReset').addEventListener('click', () => scene.flower.reset());
    window.__bloomReady = true;
  };

  p.windowResized = function () { p.resizeCanvas(window.innerWidth, window.innerHeight); scene.resize(); };

  /* ---------- input (p5.js mouse events; touch arrives here too) ---------- */
  const onCanvas = (e) => !e || !e.target || e.target === p.canvas;
  p.mousePressed = function (e) { if (!onCanvas(e) || !scene) return; scene.down(p.mouseX, p.mouseY); return false; };
  p.mouseDragged = function () { if (scene) scene.move(p.mouseX, p.mouseY); return false; };
  p.mouseReleased = function () { if (scene) scene.up(); };
  p.mouseWheel = function (e) { if (scene) scene.wheel(e.delta); return false; };
  p.keyPressed = function () { if (p.key === 'r' || p.key === 'R') scene.flower.reset(); };

  /* ---------- frame ---------- */
  p.draw = function () {
    if (!scene) return;
    const dt = Math.min(p.deltaTime / 1000, 0.1) || 0.016;
    scene.draw(dt);
    // the temporary progress indicator
    const f = scene.flower;
    $('bloomPct').textContent = Math.round(f.bloom * 100) + '%';
    $('bloomBar').style.width = (f.bloom * 100).toFixed(1) + '%';
    $('bloomStage').textContent = f.stageName() + (f.dragging ? ' · unfolding' : '');
  };
});
