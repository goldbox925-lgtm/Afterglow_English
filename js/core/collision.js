/* =====================================================================
   Collision — her flight against the city's buildings (collide & slide)
   ---------------------------------------------------------------------
   Every building is a solid box from the ground to its roof
   (info.boxes: x0..x1, z0..z1, top). She is a sphere of radius r.

   sweep(pos, vel, r, dt)  moves her by vel·dt in SUB-STEPS no longer than
     r/2 (so even 30 m/s at 10 fps cannot tunnel through a facade). After
     each sub-step every nearby box is tested: the closest point of the box
     to her centre gives the contact NORMAL (a wall, a roof edge or a
     rounded corner — the normal turns smoothly around edges and corners,
     so she glides round them). If she is closer than r:
       · she is moved out along the normal by exactly the overlap (never
         more than the last sub-step put her in: no visible jump), and
       · the part of her velocity going INTO the surface is removed, the
         part along the facade is kept → she slides (velocity projection
         onto the contact plane). Nothing is reflected: no bounce.
     A few passes per sub-step resolve two touching buildings at once
     (an inside corner, a narrow street) without oscillating between them.

   soften(pos, vel, r, dt, k)  the gentle proximity behaviour: approaching a
     surface, the velocity component toward it is limited to k × the
     remaining gap, so she comes to rest at the boundary instead of
     stopping dead; motion along the facade is untouched.

   ROUND 02 — portals (not used yet). A box may carry
       solid: false                       → no collision at all
       portals: [{ c: [x, y, z], n: [nx, 0, nz], w, h, open }]
     A contact on the face whose outward normal matches a portal's n,
     inside that portal's w × h rectangle, is ignored while the portal is
     open — so she can fly through it — and the rest of the building stays
     solid. passable(box, point, normal) is the single place to extend.
   ===================================================================== */
window.AG = window.AG || {};

AG.Collision = (function () {
  const C = { boxes: [], CELL: 64 };
  let grid = new Map();
  const key = (ix, iz) => ix * 73856093 ^ iz * 19349663;

  /* a uniform grid over the boxes so a query only looks at the few buildings around her */
  function setBoxes(list) {
    C.boxes = list || []; grid = new Map();
    for (const b of C.boxes) {
      if (b.hero) continue;                                   // her own roof: she lifts off from it
      const i0 = Math.floor(b.x0 / C.CELL), i1 = Math.floor(b.x1 / C.CELL), k0 = Math.floor(b.z0 / C.CELL), k1 = Math.floor(b.z1 / C.CELL);
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        const h = key(i, k); let cell = grid.get(h); if (!cell) grid.set(h, (cell = [])); cell.push(b);
      }
    }
  }

  /* the boxes within `reach` metres (horizontally) of x, z */
  const seen = new Set();
  function nearby(x, z, reach, out) {
    out.length = 0; seen.clear();
    const i0 = Math.floor((x - reach) / C.CELL), i1 = Math.floor((x + reach) / C.CELL), k0 = Math.floor((z - reach) / C.CELL), k1 = Math.floor((z + reach) / C.CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const cell = grid.get(key(i, k)); if (!cell) continue;
      for (const b of cell) if (!seen.has(b)) { seen.add(b); out.push(b); }
    }
    return out;
  }

  /* Round 02: is this contact on an open portal (or on a non-solid box)? */
  function passable(b, cp, n) {
    if (b.solid === false) return true;
    if (!b.portals) return false;
    for (const pt of b.portals) {
      if (!pt.open || n[0] * pt.n[0] + n[2] * pt.n[2] < 0.7) continue;
      const tx = -pt.n[2], tz = pt.n[0];                       // along the face
      const along = (cp[0] - pt.c[0]) * tx + (cp[2] - pt.c[2]) * tz, up = cp[1] - pt.c[1];
      if (Math.abs(along) <= pt.w / 2 && Math.abs(up) <= pt.h / 2) return true;
    }
    return false;
  }

  /* contact with one box: closest point of the (ground-to-roof) box to p, its distance and normal */
  function contact(b, x, y, z) {
    const cx = Math.max(b.x0, Math.min(x, b.x1)), cy = Math.min(y, b.top), cz = Math.max(b.z0, Math.min(z, b.z1));
    let dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) {
      // her centre is inside the box (should never happen in play): leave by the nearest face
      const opts = [[x - b.x0, -1, 0, 0], [b.x1 - x, 1, 0, 0], [z - b.z0, 0, 0, -1], [b.z1 - z, 0, 0, 1], [b.top - y, 0, 1, 0]];
      opts.sort((a, c) => a[0] - c[0]);
      return { d: -opts[0][0], n: [opts[0][1], opts[0][2], opts[0][3]], cp: [x, y, z] };
    }
    return { d, n: [dx / d, dy / d, dz / d], cp: [cx, cy, cz] };
  }

  /* move pos (p5.Vector) by vel (p5.Vector) · dt with collide-and-slide; both are updated.
     Returns the contact normals of this frame (empty = free flight). */
  const near = [];
  function sweep(pos, vel, r, dt) {
    const contacts = [];
    const dist = vel.mag() * dt;
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    const h = dt / steps;
    nearby(pos.x, pos.z, r + dist + 2, near);
    for (let s = 0; s < steps; s++) {
      pos.x += vel.x * h; pos.y += vel.y * h; pos.z += vel.z * h;
      for (let pass = 0; pass < 4; pass++) {
        let any = false;
        for (const b of near) {
          if (pos.y - r > b.top) continue;
          const c = contact(b, pos.x, pos.y, pos.z);
          if (c.d >= r || passable(b, c.cp, c.n)) continue;
          // out along the normal by the overlap. The overlap this sub-step's own movement caused
          // is removed at once (≤ the step); anything deeper (she was placed inside, or the
          // radius changed) eases out at ≤ 12 m/s, so nothing ever teleports
          const push = Math.min(r - c.d, vel.mag() * h + 12 * h);
          pos.x += c.n[0] * push; pos.y += c.n[1] * push; pos.z += c.n[2] * push;
          // slide: remove only the velocity going into the surface
          const vn = vel.x * c.n[0] + vel.y * c.n[1] + vel.z * c.n[2];
          if (vn < 0) { vel.x -= c.n[0] * vn; vel.y -= c.n[1] * vn; vel.z -= c.n[2] * vn; }
          if (pass === 0) contacts.push(c.n);
          any = true;
        }
        if (!any) break;
      }
    }
    return contacts;
  }

  /* gentle proximity: the speed toward a surface may not exceed k × the gap left before contact */
  function soften(pos, vel, r, dt, k, reach) {
    nearby(pos.x, pos.z, r + reach, near);
    let closest = 1e9;
    for (const b of near) {
      if (pos.y - r - reach > b.top) continue;
      const c = contact(b, pos.x, pos.y, pos.z);
      if (c.d - r > reach || passable(b, c.cp, c.n)) continue;
      const gap = Math.max(0, c.d - r);
      closest = Math.min(closest, gap);
      const vn = vel.x * c.n[0] + vel.y * c.n[1] + vel.z * c.n[2];   // < 0 = approaching
      const allowed = -k * gap;
      if (vn < allowed) { const cut = vn - allowed; vel.x -= c.n[0] * cut; vel.y -= c.n[1] * cut; vel.z -= c.n[2] * cut; }
    }
    return closest;
  }

  return Object.assign(C, { setBoxes, nearby, contact, sweep, soften, passable });
})();
