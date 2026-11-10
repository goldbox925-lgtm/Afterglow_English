/* =====================================================================
   Microphone input — REMOVED.
   ---------------------------------------------------------------------
   AFTERGLOW no longer uses the microphone: there is no Voice Mode
   control and nothing here calls getUserMedia(), so the browser never
   asks for microphone permission. The visuals react to the game's own
   soundtrack instead (see js/audio/reactivity.js).

   AG.Mic stays as a permanently-off placeholder because AG.Input (below)
   reads its fields; with state 'off' Input uses its existing
   mouse/keyboard path (holding the mouse still or holding L = a
   "sustained, gentle sound"; stillness = "silence").
   ===================================================================== */
window.AG = window.AG || {};

AG.Mic = (function () {
  const M = { state: 'off', message: '', level: 0, pitch: 0.5, sustain: 0, silence: 0, burst: 0, raw: 0 };
  function update(dt) { M.silence += dt; }
  return Object.assign(M, { update });
})();

/* =====================================================================
   Input — merges Voice Mode with mouse/keyboard so the experience is
   complete without a microphone. Holding the mouse still (or holding L)
   is a "sustained, gentle sound"; stillness is "silence".
   ===================================================================== */
AG.Input = (function () {
  const U = AG.U;
  const I = { level: 0, pitch: 0.5, sustain: 0, silence: 0, burst: 0, active: false, micOn: false,
    mx: 0, my: 0, dragDX: 0, dragDY: 0, wheel: 0, dragging: false, holding: false };
  let hold = 0, holdT = 0, idle = 0, down = false, moved = 0, keyHold = false;
  let rawMX = 0, rawMY = 0, ddx = 0, ddy = 0, wh = 0;
  let downT = 0, pendingClick = null, pendingEnter = false, pendingPress = null, pendingRelease = null;

  function bind(canvasEl) {
    window.addEventListener('pointermove', (e) => {
      rawMX = (e.clientX / window.innerWidth) * 2 - 1;
      rawMY = (e.clientY / window.innerHeight) * 2 - 1;
      I.px = e.clientX; I.py = e.clientY;
      if (down) { ddx += e.movementX || 0; ddy += e.movementY || 0; moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); }
      idle = 0;
    });
    canvasEl.addEventListener('pointerdown', (e) => { if (e.button === 0) { down = true; moved = 0; downT = performance.now(); I.px = e.clientX; I.py = e.clientY; pendingPress = { x: e.clientX, y: e.clientY }; } idle = 0; });
    // a CLICK = a short press that barely moved (a longer or moving press is a drag / hold)
    window.addEventListener('pointerup', (e) => {
      if (down && moved < 8 && performance.now() - downT < 550 && e.target === canvasEl) pendingClick = { x: e.clientX, y: e.clientY };
      if (down) pendingRelease = { x: e.clientX, y: e.clientY, moved };
      down = false;
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat) pendingEnter = true; });
    canvasEl.addEventListener('wheel', (e) => { wh += e.deltaY; e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => { if ((e.key === 'l' || e.key === 'L') && !e.repeat) keyHold = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'l' || e.key === 'L') keyHold = false; });
    window.addEventListener('blur', () => { down = false; keyHold = false; });
  }

  function update(dt, sampleRate) {
    AG.Mic.update(dt, sampleRate || 48000);
    const holdingNow = keyHold || (down && moved < 10);
    I.holding = holdingNow;
    holdT = holdingNow ? holdT + dt : Math.max(0, holdT - dt * 2);
    hold = U.damp(hold, holdingNow ? 0.42 : 0, holdingNow ? 3 : 4, dt);
    idle += dt;
    const holdSustain = U.smooth(0.3, 1.5, holdT);
    const M = AG.Mic, micOn = M.state === 'on';
    I.micOn = micOn;
    I.level = Math.max(micOn ? M.level : 0, hold);
    I.sustain = Math.max(micOn ? M.sustain : 0, holdSustain);
    I.pitch = micOn && M.level > 0.08 ? M.pitch : U.damp(I.pitch, (rawMX + 1) / 2, 2, dt);
    I.burst = micOn ? M.burst : 0;
    I.silence = micOn ? Math.min(M.silence, holdingNow ? 0 : 999) : (holdingNow ? 0 : idle);
    I.active = micOn || holdingNow;
    I.mx = U.damp(I.mx, rawMX, 2.5, dt); I.my = U.damp(I.my, rawMY, 2.5, dt);
    I.dragDX = ddx; I.dragDY = ddy; I.wheel = wh; ddx = ddy = wh = 0;
    I.dragging = down && moved >= 10;
    I.click = pendingClick; pendingClick = null;
    I.pressed = pendingPress; pendingPress = null;
    I.released = pendingRelease; pendingRelease = null;
    I.down = down;
    I.enter = pendingEnter; pendingEnter = false;
    return I;
  }
  return Object.assign(I, { bind, update });
})();
