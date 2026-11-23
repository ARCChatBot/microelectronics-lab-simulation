// The close-up: what is physically happening on the wafer while a step runs, drawn at microscope scale.
// Left, a cut through the wafer across two of the mask's 10 µm stripes, with the molecules, light and atoms that do
// the work. Right, the wafer from above and the stripes through a microscope, coloured as they really look (thermal
// oxide shows interference colours). Every layer thickness comes from the model's layersAt; only the particles are
// illustration.
import {REC, oxideColour, resistThk, sheetR} from './model.js';

const W = 988;
const H = 186;
const C = {si: '#53617A', ox: '#73C5FB', resist: '#00358E', exposed: '#A4B4D0', al: '#A6AFC1', alEdge: '#53617A', ink: '#0B0F19', label: '#53617A', blue: '#00358E', uv: '#FF6700', heat: '#FF6700', white: '#FFFFFF'};
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
const mix = (a, b, k) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};

// the cut: two periods of the mask, 40 µm across; vertical drawn larger so nanometre films show
const X0 = 10;
const XW = 630;
const HS = XW / (2 * (REC.mask.line + REC.mask.space)); // px per µm across
const VS = 52; // px per µm up
const Y0 = 150; // the original silicon surface
const SI_USED = 0.44; // growing x of oxide uses up 0.44x of silicon (densities of Si and SiO2)

/** What the student should notice right now, by step and progress. */
function caption(s) {
  const f = s.f;
  switch (s.stepId) {
    case 'clean':
      return f < 0.5 ? 'SC-1 bath: ammonia and peroxide lift dust and greasy films off the silicon.' : 'SC-2 bath: acid and peroxide pull stray metal atoms off the surface.';
    case 'oxide':
      return 'Water molecules push down through the glass to the silicon and react: Si + 2 H₂O → SiO₂ + 2 H₂. The glass grows down into the wafer as well as up.';
    case 'spin':
      return f < 0.15 ? 'The puddle of photoresist spreads outward as the wafer speeds up.' : 'Spinning throws the extra off the edge. The film thins until it is an even 1.3 µm.';
    case 'bake':
      return 'Heat from the plate drives the solvent out of the photoresist. The film becomes firm.';
    case 'expose':
      return 'UV light passes through the clear parts of the mask. The chrome stripes block it, so only the uncovered photoresist changes.';
    case 'develop':
      return 'Developer dissolves the photoresist that the UV light changed. The unexposed stripes stay.';
    case 'etch':
      return f < 0.85 ? 'The acid dissolves the glass in the openings. Photoresist and silicon resist it.' : 'Wet etching eats sideways too, so the glass stripes end up slightly narrower than the mask.';
    case 'strip':
      return 'Acetone dissolves the leftover photoresist, leaving stripes of glass on silicon.';
    case 'metal':
      return 'Aluminium atoms fly in straight lines from the source and stick where they land. Steep sidewalls catch very little.';
    case 'probe':
      return 'Current flows through the aluminium between the outer needles. The inner pair measures the voltage drop.';
  }
  return '';
}

export function createCloseup(root) {
  const el = document.createElement('div');
  el.className = 'cp closeup';
  el.innerHTML = `<div class="cuh"><div class="ph"><i></i>CLOSE-UP · ON THE WAFER</div><div class="cucap"></div></div><canvas width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas>`;
  root.appendChild(el);
  const cap = el.querySelector('.cucap');
  const g = el.querySelector('canvas').getContext('2d');
  g.scale(2, 2);
  let lastCap = '';
  let shown = false;

  const text = (t, x, y, o = {}) => {
    g.font = `${o.w || 600} ${o.size || 10.5}px Inter, sans-serif`;
    g.fillStyle = o.c || C.ink;
    g.textAlign = o.align || 'left';
    g.textBaseline = o.base || 'middle';
    g.fillText(t, x, y);
  };
  const dot = (x, y, r, fill, stroke) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 1;
      g.stroke();
    }
  };
  const arrow = (x1, y1, x2, y2, color, w = 1.6) => {
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - 6 * Math.cos(a - 0.45), y2 - 6 * Math.sin(a - 0.45));
    g.lineTo(x2 - 6 * Math.cos(a + 0.45), y2 - 6 * Math.sin(a + 0.45));
    g.closePath();
    g.fill();
  };

  /** The stack in each of the four columns: line, opening, line, opening. Returns surfaces for the particles. */
  function drawCut(s, T) {
    const L = s.layers;
    const f = s.f;
    // the medium around the wafer
    const bg = {clean: '#E3EDFC', etch: '#FAFBFD', develop: '#FAFBFD', strip: '#FAFBFD', oxide: '#E3EDFC', bake: '#FAFBFD', expose: '#E3EDFC', metal: '#111928', spin: '#FAFBFD', probe: '#FAFBFD'}[s.stepId] || '#FAFBFD';
    g.fillStyle = bg;
    g.fillRect(X0, 0, XW, H);
    const ox = L.ox / 1000;
    const siTop = Y0 + SI_USED * ox * VS;
    const etch = L.etch / 1000;
    const uc = Math.min(etch, ox) * HS; // isotropic: as far sideways as down
    // the photoresist thins while it spins
    const spinK = s.stepId === 'spin' ? 1 + 0.65 * Math.exp(-f * 9) : 1;
    // silicon
    g.fillStyle = C.si;
    g.fillRect(X0, siTop, XW, H - siTop);
    const cols = [];
    const colW = REC.mask.line * HS;
    for (let i = 0; i < 4; i++) {
      const open = i % 2 === 1;
      const x = X0 + i * colW;
      const oxT = (open ? ox - etch : ox) * VS;
      const oxTop = siTop - oxT;
      if (oxT > 0.3) {
        g.fillStyle = C.ox;
        if (open) g.fillRect(x, oxTop, colW, oxT);
        else g.fillRect(x + uc, oxTop, colW - 2 * uc, oxT);
      }
      const rs = ((open ? L.resistWindow : L.resist) / 1000) * VS * spinK;
      let top = oxTop;
      if (rs > 0.3) {
        // resist sits on the glass; over an undercut it overhangs
        g.fillStyle = open && L.doseK > 0 ? mix(C.resist, C.exposed, clamp(L.doseK)) : C.resist;
        g.fillRect(x, (open ? oxTop : siTop - ox * VS) - rs, colW, rs);
        top = (open ? oxTop : siTop - ox * VS) - rs;
      }
      cols.push({x, w: colW, open, top, oxTop, rs});
    }
    // aluminium lands on whatever faces up; the bare sidewalls of the glass stripes catch none
    if (L.al > 0.3) {
      const a = (L.al / 1000) * VS;
      g.fillStyle = C.al;
      g.strokeStyle = C.alEdge;
      g.lineWidth = 0.8;
      for (const c of cols) {
        const x = c.open ? c.x - uc : c.x + uc;
        const w = c.open ? c.w + 2 * uc : c.w - 2 * uc;
        const y = c.open ? (ox - etch > 0.001 ? c.oxTop : siTop) : c.oxTop;
        g.fillRect(x, y - a, w, a);
        g.strokeRect(x, y - a, w, a);
        c.top = y - a;
      }
    }
    // the original surface, so the downward growth of the oxide shows
    if (ox > 0.02) {
      g.setLineDash([4, 3]);
      g.strokeStyle = 'rgba(11,15,25,.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(X0, Y0);
      g.lineTo(X0 + XW, Y0);
      g.stroke();
      g.setLineDash([]);
      text('original silicon surface', X0 + XW - 6, Y0 - 6, {align: 'right', size: 9, c: s.stepId === 'metal' ? '#A4B4D0' : C.label, w: 500});
    }
    return {cols, siTop, ox, uc, spinK};
  }

  /** Molecules, light and atoms: illustration on top of the measured layers. */
  function drawAction(s, T, cut) {
    const f = s.f;
    const {cols, siTop} = cut;
    const surf = (x) => {
      const c = cols.find((k) => x >= k.x && x < k.x + k.w) || cols[cols.length - 1];
      return c.top;
    };
    switch (s.stepId) {
      case 'clean': {
        // dust (SC-1) and metal atoms (SC-2) let go of the surface and drift up and away
        const sc2 = f >= 0.5;
        const k = sc2 ? (f - 0.5) / 0.5 : f / 0.5;
        for (let i = 0; i < 26; i++) {
          const x = X0 + 12 + hash(i) * (XW - 24);
          const t0 = hash(i + 40) * 0.7;
          const up = Math.max(0, k - t0) * 260;
          const y = siTop - (sc2 ? 2.5 : 4) - up;
          if (y < -8) continue;
          if (sc2) dot(x, y, 2.6, '#FF6700', '#0B0F19');
          else dot(x, y, 2.5 + hash(i + 9) * 3, '#A6AFC1', '#53617A');
        }
        for (let i = 0; i < 14; i++) {
          const x = X0 + hash(i + 70) * XW;
          const y = siTop - ((T * 40 + hash(i + 80) * 200) % (siTop + 10));
          dot(x, y, 2 + hash(i) * 2, 'rgba(255,255,255,.8)', 'rgba(0,53,142,.25)');
        }
        text(sc2 ? 'metal atoms' : 'dust and grease', X0 + 14, 18, {c: C.blue});
        break;
      }
      case 'oxide': {
        // water molecules diffuse down through the glass and react at the silicon
        const top = Y0 - 0.56 * cut.ox * VS;
        for (let i = 0; i < 22; i++) {
          const x = X0 + 10 + hash(i) * (XW - 20);
          const ph = (T * 0.35 + hash(i + 20)) % 1;
          const y = 8 + ph * (siTop - 10);
          const inGlass = y > top;
          dot(x, y, 3.2, inGlass ? '#00358E' : C.blue);
          dot(x - 3, y - 2.5, 1.4, '#ffffff');
          dot(x + 3, y - 2.5, 1.4, '#ffffff');
        }
        // hydrogen leaves
        for (let i = 0; i < 8; i++) {
          const x = X0 + hash(i + 60) * XW;
          const ph = (T * 0.5 + hash(i + 61)) % 1;
          dot(x, top - ph * (top - 8), 1.8, '#ffffff', 'rgba(83,97,122,.5)');
        }
        text('H₂O', X0 + 14, 18, {c: C.blue, w: 700});
        text(`SiO₂ ${Math.round(s.layers.ox)} nm`, X0 + 14, Math.max(30, top - 10), {c: C.ink, w: 700});
        break;
      }
      case 'spin': {
        // excess flung off the sides
        for (let i = 0; i < 10; i++) {
          const ph = (T * 1.6 + hash(i)) % 1;
          const y = cols[0].top + 6 + hash(i + 5) * 20;
          dot(X0 + XW - 4 + ph * 0, y, 0, C.resist);
          arrow(X0 + XW - 60 + ph * 40, y - ph * 12, X0 + XW - 40 + ph * 40, y - ph * 14, 'rgba(0,53,142,.7)', 1.2);
          arrow(X0 + 60 - ph * 40, y - ph * 12, X0 + 40 - ph * 40, y - ph * 14, 'rgba(0,53,142,.7)', 1.2);
        }
        text(`Photoresist ${((s.layers.resist / 1000) * cut.spinK).toFixed(2)} µm`, X0 + XW / 2, cols[0].top - 10, {align: 'center', w: 700});
        break;
      }
      case 'bake': {
        // solvent molecules wriggle out; heat rises from below
        for (let i = 0; i < 18; i++) {
          const x = X0 + 10 + hash(i) * (XW - 20);
          const ph = (T * 0.45 + hash(i + 3)) % 1;
          const y = cols[0].top + 20 - ph * (cols[0].top + 10);
          g.strokeStyle = `rgba(83,97,122,${0.8 * (1 - ph)})`;
          g.lineWidth = 1.4;
          g.beginPath();
          for (let k = 0; k <= 10; k++) g.lineTo(x + k * 1.6, y + Math.sin(k + T * 6 + i) * 2.2);
          g.stroke();
        }
        for (let i = 0; i < 9; i++) {
          const x = X0 + 30 + i * 70;
          const ph = (T * 0.8 + i * 0.3) % 1;
          arrow(x, H - 4 - ph * 6, x, H - 22 - ph * 6, `rgba(200,40,30,${0.85 - ph * 0.5})`, 1.8);
        }
        text('solvent leaving', X0 + 14, 18, {c: C.label});
        break;
      }
      case 'expose': {
        // the mask in contact: glass with chrome over the lines; UV through the openings only
        const my = cols[0].top - 12;
        g.fillStyle = 'rgba(227,237,252,.92)';
        g.fillRect(X0, my - 2, XW, 12);
        for (const c of cols) if (!c.open) {
          g.fillStyle = '#0B0F19';
          g.fillRect(c.x, my + 7, c.w, 3);
        }
        text('mask: glass with chrome stripes', X0 + XW - 6, my - 10, {align: 'right', size: 9.5, c: C.label});
        const on = s.exposing ? 1 : 0;
        for (let i = 0; i < 40; i++) {
          const x = X0 + 6 + (i / 40) * (XW - 12);
          const c = cols.find((k) => x >= k.x && x < k.x + k.w);
          const ph = (T * 2.2 + hash(i)) % 1;
          const y1 = ph * (my - 4);
          if (!on) break;
          if (c.open) arrow(x, y1 - 14, x, Math.min(c.top - 2, y1 + 14 + (my + 10 - y1) * 0), C.uv, 1.4);
          else if (y1 < my - 6) arrow(x, y1 - 14, x, Math.min(y1, my - 4), 'rgba(255,103,0,.55)', 1.2);
        }
        if (on) {
          for (const c of cols) if (c.open) {
            g.fillStyle = `rgba(255,103,0,${0.12 + 0.1 * Math.sin(T * 10)})`;
            g.fillRect(c.x, my + 10, c.w, c.top - my - 10 + c.rs);
          }
        }
        text(`UV dose ${Math.round(s.layers.dose)} / ${REC.resist.dose} mJ/cm²`, X0 + 14, 14, {c: C.uv, w: 700});
        break;
      }
      case 'develop':
      case 'strip': {
        // dissolved photoresist breaks off and floats away
        const open = s.stepId === 'develop';
        for (let i = 0; i < 24; i++) {
          const ci = open ? 1 + 2 * (i % 2) : i % 4;
          const c = cols[ci];
          const x = c.x + 6 + hash(i) * (c.w - 12);
          const ph = (T * 0.4 + hash(i + 7)) % 1;
          const y = c.top - 4 - ph * (c.top - 6);
          if ((open ? s.layers.dev : s.layers.strip) <= 0.001) break;
          g.fillStyle = `rgba(0,53,142,${0.7 * (1 - ph)})`;
          g.fillRect(x, y, 4, 3);
        }
        text(open ? 'exposed photoresist dissolving' : 'photoresist dissolving in acetone', X0 + 14, 18, {c: C.label});
        break;
      }
      case 'etch': {
        // acid at work in the openings
        for (let i = 0; i < 30; i++) {
          const c = cols[1 + 2 * (i % 2)];
          const x = c.x + 4 + hash(i) * (c.w - 8);
          const ph = (T * 0.6 + hash(i + 11)) % 1;
          const y = c.top - 3 - ph * 40;
          dot(x, y, 2, '#FF6700');
        }
        text('hydrofluoric acid (orange) attacks only the glass', X0 + 14, 18, {c: '#FF6700', w: 600});
        if (cut.uc > 1) {
          const c = cols[0];
          arrow(c.x + c.w + 18, siTop - 10, c.x + c.w - cut.uc - 1, siTop - 10, C.ink, 1.2);
          text('undercut', c.x + c.w + 22, siTop - 10, {size: 9.5});
        }
        break;
      }
      case 'metal': {
        // aluminium atoms in straight lines
        for (let i = 0; i < 60; i++) {
          const x = X0 + 4 + hash(i) * (XW - 8);
          const ph = (T * 0.9 + hash(i + 13)) % 1;
          const y = ph * surf(x);
          if (!s.depositing) break;
          dot(x, y, 1.9, '#E3EDFC');
        }
        text('vacuum · aluminium atoms', X0 + 14, 14, {c: '#A4B4D0', w: 600});
        text('wafer shown face up (it hangs face down in the chamber)', X0 + 14, 28, {c: '#A4B4D0', size: 9, w: 500});
        text(`Al ${Math.round(s.layers.al)} nm`, X0 + XW - 8, cols[0].top - 10, {align: 'right', c: '#E3EDFC', w: 700});
        break;
      }
      case 'probe': {
        // four needles; current through the film between the outer pair
        const k = s.probing;
        const top = cols[0].top;
        const xs = [0.2, 0.4, 0.6, 0.8].map((v) => X0 + v * XW);
        xs.forEach((x, i) => {
          const tip = top - (1 - k) * 40;
          g.fillStyle = '#A6AFC1';
          g.beginPath();
          g.moveTo(x - 4, 0);
          g.lineTo(x + 4, 0);
          g.lineTo(x, tip);
          g.closePath();
          g.fill();
          text(['I in', 'V', 'V', 'I out'][i], x + 8, 14, {c: i % 3 ? C.uv : C.blue, w: 700});
        });
        if (k > 0.99) {
          for (let i = 0; i < 14; i++) {
            const ph = (T * 0.6 + i / 14) % 1;
            const x = xs[0] + ph * (xs[3] - xs[0]);
            arrow(x, top + 2, x + 10, top + 2, C.blue, 1.4);
          }
          const v = ((REC.probe.I * sheetR(s.layers.al)) / REC.probe.k) * 1000;
          text(`${v.toFixed(3)} mV`, (xs[1] + xs[2]) / 2, top - 28, {align: 'center', c: C.uv, w: 800, size: 12});
        }
        text('not to scale: the needles are 1 mm apart', X0 + XW - 6, H - 10, {align: 'right', c: '#FFFFFF', size: 9, w: 500});
        break;
      }
    }
  }

  /** The labels on the layers and the scale. */
  function drawScale(s, cut) {
    const onDark = s.stepId === 'metal';
    const c0 = cut.cols[0];
    // scale bar on the silicon
    const bar = REC.mask.line * HS;
    g.fillStyle = '#FFFFFF';
    g.fillRect(X0 + 10, H - 14, bar, 2.5);
    text('10 µm', X0 + 16 + bar, H - 13, {c: '#FFFFFF', size: 9.5});
    text('Si', X0 + 10, cut.siTop + 12, {c: '#FFFFFF', w: 700});
    text(`height ×${(VS / HS).toFixed(1)}`, X0 + XW - 6, H - 22, {align: 'right', c: '#E3EDFC', size: 9, w: 500});
    if (s.layers.resist > 0.5 && s.stepId !== 'spin') text(`Photoresist ${(s.layers.resist / 1000).toFixed(2)} µm`, c0.x + 8, c0.top + Math.min(14, c0.rs / 2), {c: '#FFFFFF', w: 700, size: 10});
    if (s.layers.ox > 30 && !['oxide', 'metal', 'probe'].includes(s.stepId)) text(`SiO₂ ${Math.round(s.layers.ox)} nm`, X0 + XW - 6, cut.siTop - cut.ox * VS - (s.layers.al > 0 ? 18 : 8), {align: 'right', c: onDark ? '#E3EDFC' : C.ink, size: 10, w: 700});
  }

  /** Right: the wafer from above and the stripes through a microscope. */
  function drawTop(s, T) {
    const L = s.layers;
    const cx = 728;
    const cy = 92;
    const R = 66;
    g.fillStyle = '#FFFFFF';
    g.fillRect(650, 0, W - 650, H);
    g.save();
    g.translate(cx, cy);
    if (s.spinning) g.rotate(s.spinAngle % (Math.PI * 2));
    g.beginPath();
    const fa = Math.asin(0.325);
    g.arc(0, 0, R, Math.PI / 2 + fa, Math.PI / 2 - fa + Math.PI * 2);
    g.closePath();
    g.fillStyle = rgb(s.colour);
    g.fill();
    g.strokeStyle = '#53617A';
    g.lineWidth = 1;
    g.stroke();
    // resist spreading out from the centre at the start of the spin
    if (s.stepId === 'spin') {
      const rr = R * clamp(0.2 + s.f / 0.12);
      g.beginPath();
      g.arc(0, 0, rr, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,53,142,.55)';
      g.fill();
      for (let i = 0; i < 6; i++) {
        g.rotate(Math.PI / 3);
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.beginPath();
        g.moveTo(8, 0);
        g.quadraticCurveTo(R * 0.5, R * 0.25, R * 0.95, R * 0.1);
        g.stroke();
      }
    }
    g.restore();
    // the spot the microscope looks at
    g.strokeStyle = C.blue;
    g.lineWidth = 1.5;
    g.strokeRect(cx + 14, cy - 18, 12, 12);
    // the microscope view
    const mx = 900;
    const my = 92;
    const mr = 74;
    g.strokeStyle = 'rgba(0,53,142,.35)';
    g.beginPath();
    g.moveTo(cx + 26, cy - 18);
    g.lineTo(mx - mr * 0.7, my - mr * 0.7);
    g.moveTo(cx + 26, cy - 6);
    g.lineTo(mx - mr * 0.7, my + mr * 0.7);
    g.stroke();
    g.save();
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.clip();
    const stripe = 26;
    const exposedRes = mix(C.resist, C.exposed, clamp(L.doseK));
    for (let i = -4; i < 8; i++) {
      const open = ((i % 2) + 2) % 2 === 1;
      let col;
      if (L.al > 0.5) col = open ? '#A6AFC1' : '#E0E5EC';
      else if ((open ? L.resistWindow : L.resist) > 0.5) col = open && L.doseK > 0 ? exposedRes : C.resist;
      else {
        const t = open ? L.ox - L.etch : L.ox;
        col = t > 5 ? rgb(oxideColour(t)) : '#53617A';
      }
      g.fillStyle = col;
      g.fillRect(mx - mr + i * stripe, my - mr, stripe, mr * 2);
    }
    // a metal film blurs the stripes; show the edges faintly
    if (L.al > 0.5) {
      g.strokeStyle = 'rgba(83,97,122,.35)';
      for (let i = -4; i < 8; i++) {
        g.beginPath();
        g.moveTo(mx - mr + i * stripe, my - mr);
        g.lineTo(mx - mr + i * stripe, my + mr);
        g.stroke();
      }
    }
    // the probe needle tips
    if (s.stepId === 'probe' && s.probing > 0.5) for (let i = 0; i < 4; i++) dot(mx - 39 + i * 26, my, 4, '#0B0F19');
    g.restore();
    g.strokeStyle = '#0B0F19';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.stroke();
    text('WAFER FROM ABOVE', cx, H - 8, {align: 'center', size: 9, c: C.label, w: 700});
    text('MICROSCOPE · 10 µm STRIPES', mx, H - 8, {align: 'center', size: 9, c: C.label, w: 700});
    void T;
    void resistThk;
  }

  return {
    update(s, T, visible) {
      if (visible !== shown) {
        shown = visible;
        el.classList.toggle('on', visible);
      }
      if (!visible) return;
      g.clearRect(0, 0, W, H);
      const cut = drawCut(s, T);
      drawAction(s, T, cut);
      drawScale(s, cut);
      drawTop(s, T);
      const c = caption(s);
      if (c !== lastCap) {
        cap.textContent = c;
        lastCap = c;
      }
    },
  };
}
