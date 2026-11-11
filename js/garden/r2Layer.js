/* =====================================================================
   Round 02 · Memory Garden — the p5.js-drawn light layer (AG.R2Layer)
   ---------------------------------------------------------------------
   Drawn with p5's OWN immediate-mode drawing on the same WebGL canvas,
   after the garden's 3D image is composited (no second canvas, context
   or loop). It is screen space: p5's default camera, origin moved to the
   top-left corner, so 1 unit = 1 CSS pixel. Each element is anchored to
   the 3D flower through GardenScene.project() (world → screen pixels).
   Additive blending, no depth test: light added over the image.

   Elements, each isolated in p.push() / p.pop():
     HOVER CUE      the pointer over the golden centre (p.mouseMoved +
                    p.dist in GardenScene.hover): a thin ring and four
                    ticks around the heart, turning (p.rotate) and
                    breathing (p.scale), fading in with the hover glow
     AWAKEN PULSE   the click that wakes the flower: a ring expanding
                    from the heart (p.scale of a unit circle), fading
     ORBIT SYMBOLS  petal-shaped light glyphs (p.beginShape / p.vertex /
                    p.bezierVertex / p.endShape, a vein p.line, a tip
                    p.ellipse) circling the flower on a 3D orbit; they
                    appear one by one as it opens (3 → 9), grow
                    (p.scale), spin (p.rotate), wander (p.noise), and
                    shift colour (p.lerpColor) lavender → pink → gold
     POLLEN HALOS   rings round the 18 anthers, pulsing (p.scale, p.sin)
                    as the stamens rise out of the opening flower
   Animation runs on the flower's clock (flower.t, from p.deltaTime), so
   pausing the game freezes the layer too.
   ===================================================================== */
window.AG = window.AG || {};

AG.R2Layer = {
  create(p) {
    const U = AG.U;
    const COL = {
      lav: p.color(176, 150, 255), pink: p.color(255, 128, 214), gold: p.color(255, 204, 120), cyan: p.color(130, 228, 255)
    };
    // nine symbols, each a little different (size, speed, height, tint): p.random, once
    const SYM = [];
    for (let i = 0; i < 9; i++) {
      SYM.push({ a0: (i / 9) * p.TWO_PI + p.random(-0.2, 0.2), size: p.random(0.8, 1.2), spin: p.random(0.5, 1.2) * (i % 2 ? 1 : -1),
        h: p.random(0, 1), tint: p.random(0, 1), seed: p.random(100) });
    }
    const alpha = (c, a) => { const k = p.color(p.red(c), p.green(c), p.blue(c)); k.setAlpha(U.clamp(a, 0, 1) * 255); return k; };

    /* one petal-shaped glyph of unit size (tip at y = −1), drawn with bezier curves */
    function petalShape() {
      p.beginShape();
      p.vertex(0, -1);
      p.bezierVertex(0.62, -0.55, 0.5, 0.5, 0, 1);
      p.bezierVertex(-0.5, 0.5, -0.62, -0.55, 0, -1);
      p.endShape(p.CLOSE);
    }
    function petalGlyph(col, a) {
      // a soft wide glow stroke, then the bright thin outline over a faint luminous fill
      p.noFill(); p.stroke(alpha(col, a * 0.22)); p.strokeWeight(5);
      petalShape();
      p.fill(alpha(col, a * 0.3)); p.stroke(alpha(col, a)); p.strokeWeight(1.2);
      petalShape();
      p.stroke(alpha(col, a * 0.7)); p.strokeWeight(1);
      p.line(0, -0.7, 0, 0.75);                                    // its vein
      p.noStroke(); p.fill(alpha(COL.gold, a * 0.9));
      p.ellipse(0, -1, 0.22, 0.22, 10);                            // a bright tip
    }

    /* ---- Phase 4: the building's transformation, seen from inside (AG.R2 streams, AG.Living paths) ---- */
    function leafShape() {
      p.beginShape();
      p.vertex(0, 0);
      p.bezierVertex(0.45, -0.25, 0.5, -0.8, 0, -1.2);
      p.bezierVertex(-0.5, -0.8, -0.45, -0.25, 0, 0);
      p.endShape(p.CLOSE);
    }
    function transformation(scene, h) {
      const R = AG.R2, LV = AG.Living && AG.Living.built;
      if (!LV || R.transform <= 0) return;
      const S = R.stage, t = R.sinceBloom;
      // GOLDEN PULSE as the flower reaches 100 %: two soft rings, the second a little later
      for (const delay of [0, 0.6]) {
        const k = (t - delay) / 2.6;
        if (k <= 0 || k >= 1) continue;
        p.push();
        p.translate(h.x, h.y);
        p.scale(h.r * p.lerp(1, 9, 1 - Math.pow(1 - k, 3)), h.r * p.lerp(1, 9, 1 - Math.pow(1 - k, 3)) * 0.45);   // a ring on the floor
        p.noFill(); p.stroke(alpha(COL.gold, 0.8 * Math.pow(1 - k, 1.4))); p.strokeWeight(2);
        p.ellipse(0, 0, 2, 2, 48);
        p.pop();
      }
      // (STAGE A's golden light paths on the floor are a WebGL ribbon mesh: js/garden/living.js)
      // STAGE C: luminous leaves unfurling along the vines on the atrium walls, as the growth passes
      if (S.C > 0.001 && !(AG.Garden && AG.Garden.atrium)) {          // (the old interior walls' leaves; Part B re-homes them)
        const front = S.C * 1.02;
        for (let i = 0; i < LV.atrium.leaves.length; i++) {
          const n = LV.atrium.leaves[i];
          if (n.s > front) continue;
          const g = p.constrain(p.map(front - n.s, 0, 0.06, 0, 1), 0, 1);           // it grows as the front passes
          const a = scene.project(n.pos), b = scene.project(U.v3.add(n.pos, n.dir));
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + p.HALF_PI + n.side * 0.8;
          const px = p.dist(a[0], a[1], b[0], b[1]) * 1.4 * n.size;                 // metres → pixels where it is
          if (px < 1.5 || a[0] < -40 || a[0] > p.width + 40 || a[1] < -40 || a[1] > p.height + 40) continue;
          p.push();
          p.translate(a[0], a[1]);
          p.rotate(ang + 0.15 * p.sin(t * 1.4 + i));                                   // a slight living sway
          p.scale(px * g * (1 + 0.06 * S.E * p.sin(t * 2 + i)));
          const col = p.lerpColor(n.side > 0 ? COL.pink : COL.cyan, COL.lav, 0.35);
          // outline only: a FILLED bezier shape is tessellated on the CPU every frame in p5's WEBGL mode
          p.noFill(); p.stroke(alpha(col, 0.75 * g)); p.strokeWeight(1.1);
          leafShape();
          p.pop();
        }
      }
      // STAGE D: a rosette of light behind the flower, answering the rooftop bloom: it opens (scale),
      // turns slowly (rotate) and pulses (p.sin) with the same stage
      if (S.D > 0.001) {
        p.push();
        p.translate(h.x, h.y - h.r * 0.4);
        p.rotate(t * 0.12);
        p.scale(h.r * (2.2 + 1.4 * S.D) * (1 + 0.05 * p.sin(t * 1.6)));
        for (let i = 0; i < 12; i++) {
          p.push();
          p.rotate((i / 12) * p.TWO_PI);
          p.scale(0.5 + 0.5 * S.D, 1);
          const col = p.lerpColor(COL.pink, COL.gold, (i % 3) / 3);
          p.noFill(); p.stroke(alpha(col, 0.18 * S.D)); p.strokeWeight(1.2);
          p.beginShape();
          p.vertex(0, -0.35);
          p.bezierVertex(0.22, -0.6, 0.16, -0.95, 0, -1.1);
          p.bezierVertex(-0.16, -0.95, -0.22, -0.6, 0, -0.35);
          p.endShape(p.CLOSE);
          p.pop();
        }
        p.pop();
      }
    }

    /* the atrium's drifting petals (positions: AG.Atrium, p5.Vector): small bezier petals, each
       turning (p.rotate) and tumbling (p.scale on one axis: seen edge-on as it spins) */
    function atriumPetals(scene) {
      const A = AG.Garden && AG.Garden.atrium;
      if (!A || !A.built || scene !== AG.Garden.scene) return;
      const t = scene.flower.t;
      for (const pt of A.petals) {
        const s = scene.project([pt.pos.x, pt.pos.y, pt.pos.z]), s2 = scene.project([pt.pos.x, pt.pos.y + pt.size, pt.pos.z]);
        const px = p.dist(s[0], s[1], s2[0], s2[1]);
        if (px < 1.5 || s[0] < -30 || s[0] > p.width + 30 || s[1] < -30 || s[1] > p.height + 30) continue;
        const col = p.lerpColor(COL.pink, COL.lav, pt.hue);
        p.push();
        p.translate(s[0], s[1]);
        p.rotate(t * pt.spin + pt.seed);
        p.scale(px, px * (0.35 + 0.65 * Math.abs(p.sin(t * 1.3 + pt.seed))));
        p.noFill(); p.stroke(alpha(col, 0.55)); p.strokeWeight(1);
        p.beginShape();
        p.vertex(0, -1);
        p.bezierVertex(0.6, -0.4, 0.4, 0.6, 0, 1);
        p.bezierVertex(-0.4, 0.6, -0.6, -0.4, 0, -1);
        p.endShape(p.CLOSE);
        p.pop();
      }
    }

    function draw(scene) {
      const f = scene.flower, gl = p.drawingContext, t = f.t, b = f.bloom;
      const h = scene.heartScreen();                               // (also sets the scene's matrices)
      p.push();
      p.resetShader(); p.resetMatrix();
      gl.disable(gl.DEPTH_TEST);
      p.blendMode(p.ADD);
      p.translate(-p.width / 2, -p.height / 2);                    // screen pixels, origin top-left
      p.bezierDetail(6);
      atriumPetals(scene);
      transformation(scene, h);

      // ---- HOVER CUE ----
      const hk = f.hoverK;
      if (hk > 0.01) {
        p.push();
        p.translate(h.x, h.y);
        p.rotate(t * 0.6);
        p.scale(h.r * (1.05 + 0.04 * p.sin(t * 4)));
        p.noFill(); p.stroke(alpha(COL.gold, 0.75 * hk)); p.strokeWeight(1.4);
        p.ellipse(0, 0, 2, 2, 48);
        for (let i = 0; i < 4; i++) {
          const a = i * p.HALF_PI;
          p.line(p.cos(a) * 1.18, p.sin(a) * 1.18, p.cos(a) * 1.42, p.sin(a) * 1.42);
        }
        p.pop();
      }

      // ---- AWAKEN PULSE: a ring expanding from the heart after the click ----
      if (f.awake && f.pulseT < 1.4) {
        const k = f.pulseT / 1.4, e = 1 - Math.pow(1 - k, 3);
        p.push();
        p.translate(h.x, h.y);
        p.scale(h.r * p.lerp(0.9, 4.2, e));
        p.noFill(); p.stroke(alpha(p.lerpColor(COL.gold, COL.pink, k), Math.pow(1 - k, 1.6))); p.strokeWeight(2);
        p.ellipse(0, 0, 2, 2, 48);                                 // (p5 1.11 WEBGL draws nothing above detail ≈ 50)
        p.pop();
      }

      // ---- ORBIT SYMBOLS: appear one by one as it opens (3 when awake → 9 at full bloom) ----
      if (f.awakeK > 0.01) {
        const shown = p.map(b, 0, 1, 3, 9) * f.awakeK, sc = f.scale * f.grow;
        const camD = U.v3.len(U.v3.sub(scene.view.eye, f.center));
        for (let i = 0; i < SYM.length; i++) {
          const appear = p.constrain(shown - i, 0, 1);
          if (appear <= 0.001) continue;
          const S = SYM[i];
          const a = S.a0 + t * 0.22 * (1 + 0.4 * b);
          const wander = p.noise(S.seed, t * 0.15) - 0.5;
          const r = sc * (1.45 + 1.4 * b + 0.35 * wander);
          const y = sc * (0.55 + 0.45 * b + 0.35 * S.h + 0.12 * p.sin(t * 0.7 + i));
          const P = [f.center[0] + p.cos(a) * r, f.center[1] + y, f.center[2] + p.sin(a) * r];
          const s = scene.project(P);
          // behind the flower (farther than its centre from the camera): dimmer
          const behind = U.v3.len(U.v3.sub(scene.view.eye, P)) > camD ? 0.4 : 1;
          let col = p.lerpColor(COL.lav, COL.pink, U.smooth(0, 0.7, b));
          col = p.lerpColor(col, COL.cyan, S.tint * 0.45);
          col = p.lerpColor(col, COL.gold, U.smooth(0.85, 1, b) * 0.6);
          p.push();
          p.translate(s[0], s[1]);
          p.rotate(a * 0.5 + t * S.spin);
          p.scale(h.r * 0.2 * S.size * appear * (1 + 0.12 * p.sin(t * 2 + i)) * (0.7 + 0.3 * f.grow));
          petalGlyph(col, (0.55 + 0.45 * b) * behind * appear);
          p.pop();
        }
      }

      // ---- POLLEN HALOS round the anthers, as the stamens rise ----
      const emerge = U.smooth(0.18, 0.85, b);
      if (emerge > 0.01) {
        p.noFill(); p.strokeWeight(0.8);
        for (let i = 0; i < 18; i++) {
          const s = scene.project([f.stamB[i * 4], f.stamB[i * 4 + 1], f.stamB[i * 4 + 2]]);
          p.push();
          p.translate(s[0], s[1]);
          p.scale(h.r * 0.045 * (1 + 0.45 * p.sin(t * 2.2 + i * 1.7)));
          p.stroke(alpha(COL.gold, 0.3 * emerge * (0.6 + 0.4 * p.sin(t * 2.2 + i * 1.7))));
          p.ellipse(0, 0, 2, 2, 16);
          p.pop();
        }
      }

      p.pop();
      p.blendMode(p.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }

    return { draw };
  }
};
