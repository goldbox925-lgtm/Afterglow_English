/* =====================================================================
   Round 02 · progress HUD and narrative lines (AG.R2Hud)
   ---------------------------------------------------------------------
   READS the game's state once per frame and writes the page only when
   a value changes. It keeps no progress of its own:
     City Bloom    AG.Gardens.completedCount()
     Bloom bar     the flower's real bloom (AG.Garden.siteBloom)
     Transform bar site.transform
   The bars are display only (pointer-events: none in the stylesheet).

   Narrative: a short line at four moments of a building's visit. Each
   site records which moments it has told (site.told, reset by a new
   story). A line's place in the story comes from the real counts of
   bloomed and completed buildings, so it goes from her strength, to
   the city waking, to the city made beautiful. Lines run on the game clock, so
   pause holds them. No listeners on the page, nothing blocks input.
   ===================================================================== */
window.AG = window.AG || {};

AG.R2Hud = (function () {
  const LINES = {
    arrive: [
      'It is quiet here. She listens for her own strength, and finds it.',
      'The strength stays with her.',
      'Beyond the glass, the city turns in its sleep.',
      'The city is stirring now. It knows her light.',
      'One bud left. The whole city leans in.'
    ],
    begin: [
      'She reaches out. Her hand is steady.',
      'It opens more easily now.',
      'Each petal wakes a street.',
      'She no longer asks if she can.',
      'Now, the last of it.'
    ],
    complete: [
      '{name} is awake. So is something in her.',
      '{name} shines, and the city stirs.',
      '{name} glows. Windows answer down the street.',
      '{name} blooms. The city is becoming beautiful.',
      'The city stirs awake. She found the strength within herself, and gave the world its beauty back.'
    ],
    leave: [
      'One light has returned. Another is waiting.',
      'Another light is calling her on.',
      'The city is watching where she goes.',
      'One more. The city is almost whole.'
    ]
  };
  const FADE = 0.7;

  let el = null, queue = [], cur = null, lineT = 0, colFor = null;
  const $ = (id) => document.getElementById(id);
  const put = (node, v) => { if (node.textContent !== v) node.textContent = v; };

  function refs() {
    el = { root: $('r2Hud'), n: $('cityBloomN'), tot: $('cityBloomT'), site: $('r2Site'), note: $('r2SiteNote'), stage: $('r2Stage'),
      bloomRow: $('r2BloomRow'), bloomBar: $('r2BloomBar'), bloomFill: $('r2BloomFill'), bloomPct: $('r2BloomPct'),
      formRow: $('r2FormRow'), formBar: $('r2FormBar'), formFill: $('r2FormFill'), formPct: $('r2FormPct'), siteRow: $('r2SiteRow'), line: $('r2Line') };
  }

  /* 100 % only when the game itself says done, never by rounding up */
  function setBar(bar, fill, label, v, done) {
    const pct = done ? 100 : Math.min(99, Math.floor(v * 100));
    if (bar.getAttribute('aria-valuenow') !== String(pct)) {
      bar.setAttribute('aria-valuenow', String(pct));
      fill.style.width = pct + '%';
      label.textContent = pct + '%';
    }
  }
  function show(node, on) { if (node.hidden === on) node.hidden = !on; }

  /* the building the HUD talks about */
  function focusSite(G, Gs) {
    if (G.phase !== 'approach') return G.site;
    if (G.site && G.site.bloomed && !G.site.completed) return G.site;   // still transforming behind her
    if (Gs.allComplete()) return null;
    // the same building as the objective above ("NEXT: ROSE · 120 m"), not whichever doorway she
    // happens to face (it said "Aurora next" while the objective said Rose)
    if (G.targetSite && !G.targetSite.bloomed) return G.targetSite;
    return Gs.sites.find((s) => s.portal === G.portal) || null;
  }

  function stageText(f, s, R) {
    if (!s.bloomed) return f.stageName() + (f.dragging ? ' · unfolding' : '');
    if (s.completed) return 'Fully awake';
    const S = R.stage;
    return S.E > 0.01 ? 'Living architecture' : S.D > 0.01 ? 'Rooftop bloom' : S.C > 0.01 ? 'Organic growth' : S.B > 0.01 ? 'Energy flow' : 'Awakening';
  }

  function drawHud(G, Gs, R) {
    put(el.n, String(Gs.completedCount())); put(el.tot, String(Gs.sites.length));
    const s = focusSite(G, Gs), inFlight = G.phase === 'approach';
    show(el.siteRow, !!s);
    if (!s) { show(el.bloomRow, false); show(el.formRow, false); show(el.stage, false); return; }
    if (s !== colFor) {
      colFor = s;
      const rgb = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')';
      el.root.style.setProperty('--r2a', rgb(s.cfg.portal.a)); el.root.style.setProperty('--r2b', rgb(s.cfg.portal.gold));
    }
    put(el.site, s.name);
    put(el.note, !inFlight ? '' : s.completed ? 'awake' : s.bloomed ? 'transforming' : 'next');
    const bloom = G.siteBloom(s), bloomDone = bloom >= R.BLOOM_DONE;
    show(el.bloomRow, inFlight ? bloom > 0 && !bloomDone : true);
    setBar(el.bloomBar, el.bloomFill, el.bloomPct, bloom, bloomDone);
    show(el.formRow, s.bloomed && (!inFlight || !s.completed));
    setBar(el.formBar, el.formFill, el.formPct, s.transform, s.transform >= 1);
    const f = !inFlight && G.scene && s === G.site ? G.scene.flower : null;
    show(el.stage, !!f);
    if (f) put(el.stage, stageText(f, s, R));
  }

  /* ---- narrative ---- */
  /* A line's place comes from the real count, so what it says is true ("One bud left" only with
     one bud left). If two buildings reach the same moment at the same count, the second takes the
     next unused line, but never the last one, which is reserved for its claim. */
  function tell(kind, s, Gs) {
    const L = LINES[kind], last = L.length - 1;
    const base = kind === 'complete' ? Gs.completedCount() - 1 : kind === 'leave' ? Gs.bloomedCount() - 1 : Gs.bloomedCount();
    let i = Math.max(0, Math.min(base, last));
    const used = new Set(Gs.sites.map((x) => x.told[kind]).filter((v) => v !== false));
    if (i < last) while (used.has(i) && i + 1 < last) i++;
    s.told[kind] = i;
    if (queue.length < 3) queue.push(L[i].replace('{name}', s.name));
  }
  function narrate(G, Gs, R) {
    const fresh = (x, k) => x.told[k] === false;              // (a told moment holds the line index it used)
    for (const x of Gs.sites) if (x.completed && fresh(x, 'complete')) tell('complete', x, Gs);
    const s = G.site;
    if (!s) return;
    if (G.phase === 'inside' && G.white < 0.2 && fresh(s, 'arrive')) tell('arrive', s, Gs);
    if (R.phase === 'DRAG' && fresh(s, 'begin')) tell('begin', s, Gs);
    if (R.phase === 'EXPLORE' && G.white < 0.4 && s.bloomed && fresh(s, 'leave')) {
      if (Gs.sites.some((x) => !x.bloomed)) tell('leave', s, Gs); else s.told.leave = -1;
    }
  }
  function drawLine(dt) {
    if (!cur && queue.length) {
      const text = queue.shift();
      cur = { dur: 3.8 + text.length * 0.03 }; lineT = 0; el.line.textContent = text;
    }
    if (!cur) return;
    if (AG.FSM.playing) lineT += dt;
    const dur = queue.length ? Math.min(cur.dur, 3.2) : cur.dur;      // the next moment is waiting: don't hold it back
    const a = Math.min(1, lineT / FADE, (dur - lineT) / FADE);
    el.line.style.opacity = Math.max(0, a).toFixed(3);
    if (lineT >= dur) { cur = null; el.line.style.opacity = '0'; el.line.textContent = ''; }
  }

  function clear() {
    queue.length = 0; cur = null; colFor = null;
    if (el) { el.line.style.opacity = '0'; el.line.textContent = ''; }
  }

  /* once per frame from js/sketch.js, after AG.R2.update */
  function update(dt) {
    const G = AG.Garden;
    if (!G.isActive()) { if (cur || queue.length) clear(); return; }
    if (!el) refs();
    const Gs = AG.Gardens, R = AG.R2;
    drawHud(G, Gs, R);
    narrate(G, Gs, R);
    drawLine(dt);
  }

  AG.U.on('reset', clear); AG.U.on('replay', clear);
  return { LINES, update, clear };
})();
