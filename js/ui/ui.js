/* =====================================================================
   Interface — minimal, cinematic, auto-hiding.
   Every control here is wired to real behaviour; nothing is decorative.
   ===================================================================== */
window.AG = window.AG || {};

AG.UI = (function () {
  const U = AG.U, C = AG.CONFIG;
  const $ = (id) => document.getElementById(id);
  let stateShownAt = 0;
  let idle = 0, hidden = false, forceHidden = false, cardTimer = null, lastHint = '';

  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
    regen: '<svg viewBox="0 0 24 24"><path d="M3 21V9l4-3v15zm6 0V3h6v18zm8 0V8l4 2v11z"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 3v-3h2v5h-5v-2z"/></svg>',
    help: '<svg viewBox="0 0 24 24"><path d="M11 18h2v-2h-2zm1-16a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 4 0c0 2-3 1.8-3 5h2c0-2.3 3-2.5 3-5a4 4 0 0 0-4-4z"/></svg>'
  };

  /* ---------- stage 05 fragments: compact HUD + collection message ---------- */
  const FLOWER = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><ellipse cx="0" cy="-5.4" rx="3.3" ry="5.4"/><ellipse cx="5.4" cy="0" rx="5.4" ry="3.3"/><ellipse cx="0" cy="5.4" rx="3.3" ry="5.4"/><ellipse cx="-5.4" cy="0" rx="5.4" ry="3.3"/></svg>';
  const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
  let fragBuilt = false, fragKey = '', fragMsgTimer = null;
  function updateFragHud(st) {
    const FR = AG.Fragments, hud = $('fragHud'), body = document.body;
    const show = !!(FR && FR.ready) && st === 'AFTERGLOW' && body.classList.contains('entered') && !body.classList.contains('ended') && !AG.FSM.cinematic
      && !body.classList.contains('garden');                     // Round 02 has no fragments
    hud.classList.toggle('show', show);
    if (!FR || !FR.ready) return;
    if (!fragBuilt) {
      $('fragIcons').innerHTML = FR.list.map((f, i) => `<i class="fh-ico" data-i="${i}" title="${f.id}" style="--c:${rgb(f.col)}">${FLOWER}</i>`).join('');
      fragBuilt = true;
    }
    const active = FR.list.findIndex((f) => !f.collected);
    const key = FR.collected + ':' + active;
    if (key === fragKey) return;
    fragKey = key;
    document.querySelectorAll('#fragIcons .fh-ico').forEach((el, i) => {
      el.classList.toggle('done', !!FR.list[i] && FR.list[i].collected);
      el.classList.toggle('active', i === active);
    });
    $('fragCount').textContent = `${FR.collected} / ${FR.list.length}`;
    const cur = FR.list[active >= 0 ? active : FR.list.length - 1];
    $('fragName').textContent = cur.id;
    $('fragDesc').textContent = cur.desc;
    $('fragCur').style.setProperty('--fc', rgb(cur.col));
  }
  function showFragMsg(e) {
    const FR = AG.Fragments, i = FR.list.findIndex((f) => f.id === e.id), f = FR.list[i];
    if (!f) return;
    $('fragMsgKey').textContent = `${f.id} · ${e.n}/${FR.list.length}`;
    $('fragMsgText').textContent = f.found;
    const m = $('fragMsg');
    m.style.setProperty('--fc', rgb(f.col));
    fragKey = ''; updateFragHud(AG.FSM.state);                  // HUD first (its height can change) ...
    const hudTop = $('fragHud').getBoundingClientRect().top;      // ... then sit 8 px above it
    if (hudTop > 0) m.style.bottom = Math.round(window.innerHeight - hudTop + 8) + 'px';
    m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
    clearTimeout(fragMsgTimer); fragMsgTimer = setTimeout(() => m.classList.remove('show'), 2600);
    const ico = document.querySelector(`#fragIcons .fh-ico[data-i="${i}"]`);
    if (ico) { ico.classList.remove('pop'); void ico.offsetWidth; ico.classList.add('pop'); }
  }
  /* the persistent stage 05 goal: below the stage hint card (or the top bar), until 5/5 */
  function updateFragGoal(st) {
    const g = $('fragGoal'), FR = AG.Fragments, body = document.body;
    // Round 02, on the way to the doorway: the same pill carries the garden's goal
    const garden = !!AG.Garden && AG.Garden.phase === 'approach';
    const show = garden || (!!(FR && FR.ready) && st === 'AFTERGLOW' && body.classList.contains('entered') && !body.classList.contains('ended')
      && !AG.FSM.cinematic && !AG.Flight.finale && FR.collected < FR.list.length && !body.classList.contains('garden'));
    const text = garden ? AG.Garden.goalText() : 'COLLECT ALL FIVE FRAGMENTS';
    if (g.textContent !== text) g.textContent = text;
    g.classList.toggle('show', show);
    if (!show) return;
    const panel = $('stagePanel'), barBottom = $('brand').getBoundingClientRect().bottom;
    const below = panel.classList.contains('show') ? panel.getBoundingClientRect().bottom : barBottom;
    const top = Math.round(Math.max(below, barBottom) + 8);
    if (g.dataset.top !== String(top)) { g.style.top = top + 'px'; g.dataset.top = String(top); }
  }
  function hideFragMsg() { clearTimeout(fragMsgTimer); $('fragMsg').classList.remove('show'); fragKey = ''; }

  /* ---------- stage 05 touch flight pad: each button holds the same key as ← → ↑ ↓ ---------- */
  const isTouch = () => (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function initFlightPad() {
    document.querySelectorAll('#flightPad .fp-btn').forEach((btn) => {
      const k = btn.dataset.key;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); AG.Flight.press(k, true); btn.classList.add('on'); try { btn.setPointerCapture(e.pointerId); } catch (err) {} };
      const up = (e) => { e.stopPropagation(); if (AG.Flight.keys[k]) AG.Flight.press(k, false); btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('pointermove', (e) => e.stopPropagation());    // never steers by 'mouse' position
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
  function updateFlightPad(st) {
    const pad = $('flightPad'), F = AG.FSM;
    const show = st === 'AFTERGLOW' && document.body.classList.contains('entered') && !F.cinematic && !AG.Flight.finale && F.playing && isTouch()
      && !(AG.Garden && AG.Garden.isActive() && AG.Garden.phase !== 'approach');      // not inside the garden

    if (show === pad.classList.contains('show')) return;
    pad.classList.toggle('show', show);
    if (!show) document.querySelectorAll('#flightPad .fp-btn').forEach((b) => { if (b.classList.contains('on')) { AG.Flight.press(b.dataset.key, false); b.classList.remove('on'); } });
  }

  function init(handlers) {
    initFlightPad();
    $('btnPlay').innerHTML = ICON.play;
    $('btnReplay').innerHTML = ICON.replay;
    $('btnRegen').innerHTML = ICON.regen;
    $('btnFull').innerHTML = ICON.full;
    $('btnHelp').innerHTML = ICON.help;

    // state chips: the five emotional states (presentation navigation: jump, earlier states auto-complete)
    const chips = $('chapters');
    C.states.forEach((st) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = st.num;
      b.title = `${st.num} — ${st.title}: ${st.subtitle} (presentation jump)`;
      b.dataset.id = st.id;
      b.addEventListener('click', () => handlers.jump(st.id));
      chips.appendChild(b);
    });
    // Round 02 — Memory Garden: straight to its start (testing / presentation; key 6)
    const r2 = document.createElement('button');
    r2.className = 'chip r2'; r2.id = 'chipR2'; r2.textContent = 'R02';
    r2.title = 'R02 — Memory Garden: start Round 02 at the doorway of light (presentation jump, key 6)';
    r2.addEventListener('click', () => handlers.jumpR2());
    chips.appendChild(r2);
    // feedback where the viewer clicks
    U.on('tap', (e) => {
      const r = document.createElement('span');
      r.className = e.near ? 'near' : e.far ? 'far' : '';
      r.style.left = e.x + 'px'; r.style.top = e.y + 'px';
      $('ripples').appendChild(r); setTimeout(() => r.remove(), 1500);
    });
    U.on('state', (e) => { showCard(C.states.find((s) => s.id === e.state), e.why === 'jump'); stateShownAt = performance.now(); });
    U.on('cinematicEnd', () => { stateShownAt = performance.now(); });

    // camera modes
    const sel = $('camMode');
    AG.Camera.MODES.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; sel.appendChild(o); });
    sel.addEventListener('change', () => handlers.camera(sel.value));
    U.on('cameraMode', (m) => { sel.value = m; });

    $('btnPlay').addEventListener('click', handlers.toggle);
    $('btnReplay').addEventListener('click', handlers.replay);
    // AUDIO REACTIVITY ON/OFF: visuals only (never touches playback)
    $('btnReact').addEventListener('click', handlers.reactivity);
    U.on('reactivity', (on) => { const b = $('btnReact'); b.textContent = on ? 'AUDIO REACTIVITY ON' : 'AUDIO REACTIVITY OFF'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('btnRegen').addEventListener('click', handlers.regen);
    $('btnFull').addEventListener('click', handlers.fullscreen);
    $('btnHelp').addEventListener('click', () => toggleHelp());
    $('helpClose').addEventListener('click', () => toggleHelp(false));
    $('endReplay').addEventListener('click', handlers.replay);
    $('quality').addEventListener('change', (e) => handlers.quality(e.target.value));
    // character asset report (Help panel): the offline audit of the files you supplied + what the browser verified
    const renderAssets = () => {
      const rows = AG.CharacterAssets.report().map((r) => {
        const bad = /CHECKERBOARD|DUPLICATE/.test(r.audit);
        const st = r.status === 'ok' ? 'ok' : r.status;
        return `<div class="arow ${bad ? 'warn' : ''}"><b>${r.id}</b><span>${r.name}</span><span class="st ${st}">${st}</span><span class="au">${r.audit}${r.status !== 'ok' && r.message ? ' · ' + r.message : ''}</span></div>`;
      });
      $('assetReport').innerHTML = rows.join('');
    };
    renderAssets();
    U.on('characterAsset', renderAssets);

    U.on('playstate', (pl) => { $('btnPlay').innerHTML = pl ? ICON.pause : ICON.play; $('btnPlay').title = pl ? 'Pause (Space)' : 'Resume (Space)'; document.body.classList.toggle('paused', !pl); });
    U.on('reset', () => { $('endCard').classList.remove('show'); document.body.classList.remove('ended'); hideFragMsg(); });
    U.on('fragment', showFragMsg);
    U.on('replay', () => { $('endCard').classList.remove('show'); document.body.classList.remove('ended'); hideFragMsg(); });
    U.on('quality', (q) => { $('tierNow').textContent = q; });
    U.on('audioMode', (m) => { $('audioMode').textContent = m === 'mp3' ? 'music: MP3' : 'music: generative'; });

    const wake = () => { idle = 0; };
    window.addEventListener('pointermove', wake); window.addEventListener('keydown', wake); window.addEventListener('pointerdown', wake);
  }

  function showCard(st, labelOnly) {
    const card = $('chapterCard');
    if (!st) return;
    $('chapterLabel').textContent = st.num + ' · ' + st.title;
    const idx = AG.stateIndex(st.id);
    document.querySelectorAll('#chapters .chip:not(.r2)').forEach((b, i) => { b.classList.toggle('active', i === idx); b.classList.toggle('done', i < idx); });
    if (labelOnly) { card.classList.remove('show'); return; }
    $('cardNum').textContent = st.num;
    $('cardTitle').textContent = st.title;
    $('cardSub').textContent = st.subtitle;
    card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    clearTimeout(cardTimer); cardTimer = setTimeout(() => card.classList.remove('show'), 4200);
  }

  function toggleHelp(force) {
    const h = $('help');
    const show = force === undefined ? !h.classList.contains('show') : force;
    h.classList.toggle('show', show);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  /* the prompt for this moment (context sensitive, never a score) */
  function promptFor(st) {
    const F = AG.FSM, IA = AG.Interactions;
    if (F.cinematic) return { title: 'WATCH THE SCENE', text: "You'll be able to interact soon." };
    const def = C.states.find((s) => s.id === st);
    if (st === 'AFTERGLOW' && AG.Garden && AG.Garden.isActive()) {
      if (AG.Gardens.allComplete()) return null;                       // free flight: nothing left to ask of her
      return AG.Garden.phase === 'approach' ? { title: 'THE MEMORY GARDEN', text: 'A doorway of light has opened. Fly through it · ← → steer · tap ↑ to rise · ↓ to descend.' } : null;
    }
    if (st === 'AFTERGLOW') {
      if (AG.Flight.finale) return null;
      if (F.mode === 'ASCENSION') return null;
      if (F.stateTime > 50 && F.modeTime > 30) return { title: 'Find the fragments', text: 'Follow the arrow · double-tap ↑ to rise · ↓ to descend.' };
      return { title: def.title, text: def.prompt };
    }
    if (st === 'NUMBNESS') return { title: 'FIND THE LIGHT', text: def.prompt };
    if (st === 'FRACTURE') return { title: 'RESTORE THE LIGHTS', text: def.prompt };
    if (st === 'AWAKENING') return { title: 'WAKE THE CITY', text: def.prompt };
    if (st === 'RECLAIMING_SELF') return { title: 'CONNECT THE BUILDINGS', text: def.prompt };
    return { title: def.title, text: def.prompt };
  }

  function update(dt, S) {
    idle += dt;
    const F = AG.FSM, IA = AG.Interactions, st = F.state;
    const helpOpen = $('help').classList.contains('show');
    const shouldHide = forceHidden || (st === 'AFTERGLOW' && idle > 3.5 && !helpOpen && F.playing);
    if (shouldHide !== hidden) { hidden = shouldHide; document.body.classList.toggle('ui-hidden', hidden); }
    // overall progress (no numbers): restoration toward the flight, then altitude toward the light
    const NC = C.interaction.network, idx = AG.stateIndex(st);
    let prog = st === 'AFTERGLOW' ? 0.8 + 0.2 * AG.Flight.asc : Math.min(0.8, idx * 0.1 + 0.5 * U.clamp(AG.Interactions.progress / NC.toAfterglow, 0, 1));
    $('progress').style.width = (prog * 100).toFixed(1) + '%';
    const def = C.states[idx];
    const r2on = !!AG.R2 && AG.R2.phase !== 'OFF';
    $('chipR2').classList.toggle('active', r2on);
    $('timeText').textContent = r2on ? 'R02 · ' + AG.R2.phase : st === 'AFTERGLOW' && AG.Flight.arc ? AG.Flight.phase : AG.Flight.finale ? 'LIGHT' : def.title;
    if (S.hint !== lastHint) { lastHint = S.hint; $('hint').textContent = S.hint; $('hint').classList.toggle('show', !!S.hint); }
    document.body.classList.toggle('flying', st === 'AFTERGLOW');
    document.body.classList.toggle('cinematic', !!F.cinematic);
    // ---- the prompt ----
    const pr = F.playing ? promptFor(st) : null;
    const panel = $('stagePanel');
    const key = pr ? pr.title + pr.text : '';
    if (panel.dataset.key !== key) { panel.dataset.key = key; if (pr) { $('stageTitle').textContent = pr.title; $('stageText').textContent = pr.text; } stateShownAt = performance.now(); }
    panel.classList.toggle('show', !!pr);
    panel.classList.toggle('compact', !!pr && st === 'AFTERGLOW' && (performance.now() - stateShownAt) > 7000);
    let done = 0, total = 0;
    if (st === 'FRACTURE') { done = IA.stabilised; total = IA.need.fragile; }
    else if (st === 'AWAKENING') { done = IA.awakeningConnections; total = IA.need.awakening; }
    else if (st === 'RECLAIMING_SELF') { done = IA.cityLinks; total = C.interaction.network.reclaimingLinks; }
    const countHTML = total ? Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('') : '';
    if ($('stageCount').innerHTML !== countHTML) $('stageCount').innerHTML = countHTML;
    // ---- hints: a ring on the target, an arrow toward it when off screen ----
    let ring = null, arrow = null;
    if (st === 'NUMBNESS' && !F.cinematic) {
      const b = IA.beaconScreen;
      if (b && b.on && b.visible) ring = b;
      else if (b && !b.on) arrow = b;
      else if (!b && IA.beacon) arrow = { behind: true };
    } else if ((st === 'FRACTURE' || st === 'AWAKENING' || st === 'RECLAIMING_SELF') && IA.hint && !F.cinematic) ring = IA.hint;
    else if (st === 'AFTERGLOW' && AG.Garden && AG.Garden.target()) {
      // Round 02: the same edge arrow points to the doorway while it is off screen
      const P = AG.Garden.target(), cam = AG.Camera.state, sp = IA.project(P, cam);
      if (!sp) { const V = U.v3, right = V.cross(V.norm(V.sub(cam.target, cam.pos)), [0, 1, 0]); arrow = { nx: V.dot(V.sub(P, cam.pos), right) >= 0 ? 1 : -1, ny: 0 }; }
      else if (!sp.on) arrow = sp;
    }
    else if (st === 'AFTERGLOW' && !F.cinematic && !AG.Flight.finale && AG.Fragments && AG.Fragments.active()) {
      // stage 05: the existing edge arrow points to the revealed fragment while it is off screen
      const fr = AG.Fragments.active(), P = [fr.pos.x, fr.pos.y, fr.pos.z], cam = AG.Camera.state, sp = IA.project(P, cam);
      if (!sp) { const V = U.v3, right = V.cross(V.norm(V.sub(cam.target, cam.pos)), [0, 1, 0]); arrow = { nx: V.dot(V.sub(P, cam.pos), right) >= 0 ? 1 : -1, ny: 0 }; }
      else if (!sp.on) arrow = sp;
    }
    const hr = $('hintRing');
    hr.classList.toggle('show', !!ring);
    if (ring) { hr.style.left = ring.x + 'px'; hr.style.top = ring.y + 'px'; }
    const ha = $('hintArrow');
    ha.classList.toggle('show', !!arrow);
    if (arrow) {
      const W = window.innerWidth, H = window.innerHeight;
      let dx, dy;
      if (arrow.behind) { const cam = AG.Camera.state, b = U.v3.sub(IA.beacon.pos, cam.pos); dx = U.v3.dot(b, cam.right || [1, 0, 0]) >= 0 ? 1 : -1; dy = 0; }
      else { dx = arrow.nx; dy = -arrow.ny; }
      const a = Math.atan2(dy, dx), m = 46;
      const k = Math.min((W / 2 - m) / Math.max(Math.abs(Math.cos(a)), 1e-3), (H / 2 - m) / Math.max(Math.abs(Math.sin(a)), 1e-3));
      ha.style.left = (W / 2 + Math.cos(a) * k) + 'px'; ha.style.top = (H / 2 + Math.sin(a) * k) + 'px';
      ha.style.transform = `rotate(${a}rad)`;
    }
    // ---- press-and-hold charge on a fragile light ----
    const hold = $('holdRing');
    if (IA.charge && st === 'FRACTURE') {
      hold.classList.add('show', 'charge');
      hold.style.left = IA.charge.x + 'px'; hold.style.top = IA.charge.y + 'px';
      hold.style.transform = `scale(${0.4 + 0.6 * IA.charge.k})`;
    } else { hold.classList.remove('show', 'charge'); hold.style.left = ''; hold.style.top = ''; hold.style.transform = ''; }
    // ---- the thread being drawn from a lit node ----
    const th = $('thread'), line = $('threadLine');
    if (IA.dragging && IA.dragTo && IA.dragFrom >= 0 && IA.nodes[IA.dragFrom]) {
      const a = IA.project(IA.nodes[IA.dragFrom].pos, AG.Camera.state);
      if (a) {
        const col = (IA.nodes[IA.dragFrom].col || [1, 0.8, 0.6]).map((c) => Math.round(c * 255)).join(',');
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', IA.dragTo.x); line.setAttribute('y2', IA.dragTo.y);
        line.style.stroke = `rgb(${col})`;
        th.classList.toggle('far', !IA.dragOk);
        th.classList.add('show');
      }
    } else th.classList.remove('show');
    updateFragHud(st);
    updateFragGoal(st);
    updateFlightPad(st);
    // the end card: on the game clock (S.finale = game seconds since the fifth fragment), so a
    // pause holds it back; shown once the glide and the ascent (finaleEnd s) have played
    const FC = C.flight;
    if (st === 'AFTERGLOW' && AG.Flight.finale && S.finale >= FC.finaleGlide + FC.finaleEnd && !document.body.classList.contains('ended') && !(AG.Garden && AG.Garden.isActive())) {
      document.body.classList.add('ended'); $('endCard').classList.add('show');
    }
    // Round 02: the doorway's white light (entering / leaving the garden)
    const gv = $('gardenVeil'), wv = AG.Garden ? AG.Garden.white.toFixed(3) : '0.000';
    if (gv && gv.dataset.o !== wv) { gv.dataset.o = wv; gv.style.opacity = wv; }
    const tr = $('titleReveal');
    const showT = S.title > 0.02;
    if (showT !== tr.classList.contains('show')) tr.classList.toggle('show', showT);
  }

  return {
    init, update, toast, toggleHelp, showCard,
    toggleHidden() { forceHidden = !forceHidden; },
    setSeed(s) { $('seedVal').textContent = s; },
    setLoading(msg, ready) { $('loadMsg').textContent = msg; $('btnEnter').disabled = !ready; },
    hideIntro() { $('intro').classList.add('gone'); document.body.classList.add('entered'); }
  };
})();
