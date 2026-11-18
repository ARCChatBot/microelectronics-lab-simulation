// The microelectronics lab as numbers. One input: tau, the process clock in minutes of one 100 mm wafer's run.
// Every pose, gauge and label on the page is a pure function of tau and the constants below. No three.js in here.
// kind: 'standard' (a published standard or textbook constant), 'datasheet' (a product datasheet figure),
//       'typical' (a common value for this class of tool, not a specific lab's), 'guess' (chosen for this model).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};

// ------------------------------------------------------------ the room, metres
export const WAFER = {d: 0.1, t: 525e-6, flat: 0.0325};
export const ROOM = {W: 14, D: 8, H: 2.7, cut: 1.1, wall: 0.1};
export const FFU = {w: 1.2, d: 0.6, h: 0.3, v: 0.45};
// ISO 14644-1 limits, particles per cubic metre at 0.5 um and larger
export const ISO_LIMIT = {5: 3520, 6: 35200, 7: 352000};
export const ZONES = [
  {id: 'design', name: 'Design office', iso: null, x0: 0, x1: 3, z0: 0, z1: 4, cover: 0},
  {id: 'gown', name: 'Gowning room', iso: 7, x0: 0, x1: 3, z0: 4, z1: 8, cover: 0.1},
  {id: 'main', name: 'Process bay', iso: 6, x0: 3, x1: 9.5, z0: 0, z1: 8, cover: 0.25},
  {id: 'litho', name: 'Lithography bay', iso: 5, x0: 9.5, x1: 14, z0: 0, z1: 5, cover: 0.6},
  {id: 'test', name: 'Test bay', iso: 6, x0: 9.5, x1: 14, z0: 5, z1: 8, cover: 0.25},
];
export const zoneOf = (id) => ZONES.find((z) => z.id === id);
const areaOf = (z) => (z.x1 - z.x0) * (z.z1 - z.z0);

/** Fan filter units in a zone: the count that reaches the target ceiling coverage, laid on a grid. */
export function ffuLayout(z) {
  const n = Math.round((areaOf(z) * z.cover) / (FFU.w * FFU.d));
  if (!n) return [];
  const W = z.x1 - z.x0;
  const D = z.z1 - z.z0;
  const cols = Math.max(1, Math.round(Math.sqrt((n * (W / D)) / 2)));
  const rows = Math.ceil(n / cols);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push([z.x0 + ((c + 0.5) * W) / cols, z.z0 + ((r + 0.5) * D) / rows]);
  }
  return out;
}
/** Air in a zone: filter count, real coverage, supply flow and air changes per hour. */
export function zoneAir(z) {
  const n = ffuLayout(z).length;
  const area = areaOf(z);
  const filter = n * FFU.w * FFU.d;
  const flow = filter * FFU.v * 3600;
  return {n, area, coverage: filter / area, flow, ach: flow / (area * ROOM.H), limit: z.iso ? ISO_LIMIT[z.iso] : null};
}

// ------------------------------------------------------------ the recipe
export const PASS = 70; // percent on the station quizzes needed to complete the training
export const REC = {
  clean: {sc1: 10, sc2: 10, T: 75},
  ox: {T: 1100, A: 0.11, B: 0.51, target: 0.5},
  resist: {t4000: 1.3, rpm: 4000, spin: 30, bakeT: 115, bake: 60, dose: 150, I: 15, dev: 60, strip: 120},
  mask: {line: 10, space: 10},
  boe: {rate: 100},
  al: {rate: 0.5, target: 200, rho: 2.65e-8, opaque: 30},
  probe: {I: 0.01, k: Math.PI / Math.LN2, t: 60},
  walk: 0.5,
};
/** Deal-Grove: oxide thickness in um after h hours of wet oxidation at 1100 C (no initial oxide). */
export const dealGrove = (h) => {
  const {A, B} = REC.ox;
  return (A / 2) * (Math.sqrt(1 + (4 * B * h) / (A * A)) - 1);
};
/** The inverse: hours to grow x um. */
export const oxHours = (x) => (x * x + REC.ox.A * x) / REC.ox.B;
/** Resist thickness in um: the datasheet point at 4000 rpm, scaled by the inverse square root of spin speed. */
export const resistThk = (rpm) => REC.resist.t4000 * Math.sqrt(4000 / rpm);
/** Sheet resistance in ohm per square of a film t_nm thick. */
export const sheetR = (tnm) => REC.al.rho / (tnm * 1e-9);

// ------------------------------------------------------------ stations (x, z of the tool centre, rot about y; local +z is the front)
export const STATIONS = {
  design: {size: [1.6, 0.8], name: 'Design workstation', short: 'DESIGN', zone: 'design', x: 1.5, z: 0.55, rot: 0, slot: [0, 1.0, 0], desc: 'The mask is drawn here: 10 µm lines and 10 µm spaces. The office is outside the cleanroom.'},
  gown: {size: [1.4, 0.5], name: 'Gowning bench', short: 'GOWNING', zone: 'gown', x: 1.5, z: 7.45, rot: Math.PI, slot: [0, 1.0, 0], desc: 'Booties, hood, coverall and gloves go on here, on the clean side of the sticky mat. ISO 7.'},
  wet: {size: [1.8, 0.9], name: 'RCA wet bench', short: 'RCA CLEAN', zone: 'main', x: 4.6, z: 0.55, rot: 0, slot: [-0.4, 0.87, 0], desc: 'Two heated tanks: SC-1 lifts particles and organics, SC-2 removes metal ions.'},
  furnace: {size: [2.6, 0.8], name: 'Oxidation furnace', short: 'FURNACE', zone: 'main', x: 7.3, z: 0.5, rot: 0, slot: [-1.0, 1.2, 0], desc: 'A quartz tube at 1100 °C with steam. Silicon turns to SiO2 at the rate Deal and Grove measured.'},
  spin: {size: [1.2, 0.75], name: 'Spin coater', short: 'SPIN COAT', zone: 'litho', x: 10.6, z: 0.5, rot: 0, slot: [0, 0.953, 0], desc: 'A vacuum chuck spins the wafer and throws the resist out to an even film.'},
  bake: {size: [1.0, 0.75], name: 'Hot plate', short: 'SOFT BAKE', zone: 'litho', x: 12.1, z: 0.5, rot: 0, slot: [0, 0.933, 0], desc: 'Drives the solvent out of the resist before exposure.'},
  align: {size: [1.2, 1.0], name: 'Mask aligner', short: 'EXPOSE', zone: 'litho', x: 13.4, z: 2.6, rot: -Math.PI / 2, slot: [0, 0.993, 0], desc: 'The mask drops into contact with the wafer and a UV lamp prints its pattern into the resist.'},
  develop: {size: [1.5, 0.8], name: 'Develop and strip hood', short: 'DEVELOP', zone: 'litho', x: 11.6, z: 4.5, rot: Math.PI, slot: [-0.3, 0.9, 0], desc: 'Developer dissolves the exposed resist. Later, solvent strips what is left.'},
  etch: {size: [1.8, 0.9], name: 'BOE etch hood', short: 'OXIDE ETCH', zone: 'main', x: 4.6, z: 7.45, rot: Math.PI, slot: [0, 0.87, 0], desc: 'Buffered oxide etch removes SiO2 where the resist is open and stops on silicon.'},
  evap: {size: [1.0, 1.0], name: 'Metal evaporator', short: 'METAL', zone: 'main', x: 7.4, z: 7.4, rot: Math.PI, slot: [0, 1.42, 0], desc: 'Aluminium boils off a crucible under vacuum and lands on the wafer hanging face down above it.'},
  probe: {size: [1.4, 0.8], name: 'Probe station', short: 'TEST', zone: 'test', x: 12.2, z: 7.5, rot: Math.PI, slot: [0, 0.953, 0], desc: 'Four needles in a row: current through the outer pair, voltage across the inner pair.'},
};
export const STATION_ORDER = ['design', 'gown', 'wet', 'furnace', 'spin', 'bake', 'align', 'develop', 'etch', 'evap', 'probe'];
/** Tool-local point to world. */
export const toWorld = (st, [lx, ly, lz]) => {
  const c = Math.cos(st.rot);
  const s = Math.sin(st.rot);
  return [st.x + lx * c + lz * s, ly, st.z - lx * s + lz * c];
};
const DOORS = {litho: [9.5, 2.5], test: [9.5, 6.3]};
// walls as [x0, z0, x1, z1]; the gaps between them are the doors
export const WALLS = [
  [0, 0, 14, 0], [0, 8, 14, 8], [14, 0, 14, 8],
  [0, 0, 0, 1.5], [0, 2.5, 0, 8],
  [0, 4, 1, 4], [2, 4, 3, 4],
  [3, 0, 3, 5.6], [3, 6.6, 3, 8],
  [9.5, 0, 9.5, 2], [9.5, 3, 9.5, 5.9], [9.5, 6.7, 9.5, 8],
  [9.5, 5, 14, 5],
];
export const DOORWAYS = [[0, 1.5, 0, 2.5], [1, 4, 2, 4], [3, 5.6, 3, 6.6], [9.5, 2, 9.5, 3], [9.5, 5.9, 9.5, 6.7]];
/** Can a person of radius r stand at (x, z)? Walls and tool footprints block. */
export function blocked(x, z, r = 0.28) {
  if (x < r + 0.05 || x > ROOM.W - r - 0.05 || z < r + 0.05 || z > ROOM.D - r - 0.05) return true;
  for (const [x0, z0, x1, z1] of WALLS) {
    const dx = x - clamp(x, Math.min(x0, x1), Math.max(x0, x1));
    const dz = z - clamp(z, Math.min(z0, z1), Math.max(z0, z1));
    if (dx * dx + dz * dz < (r + 0.05) ** 2) return true;
  }
  for (const st of Object.values(STATIONS)) {
    const turned = Math.abs(Math.sin(st.rot)) > 0.5;
    const w = (turned ? st.size[1] : st.size[0]) / 2 + r;
    const d = (turned ? st.size[0] : st.size[1]) / 2 + r;
    if (Math.abs(x - st.x) < w && Math.abs(z - st.z) < d) return true;
  }
  return false;
}
const CARRY = 1.05;
const STAND = 0.95;
const REACH = 0.55; // the operator stands an arm's length behind the wafer

// ------------------------------------------------------------ the run
const T_OX = oxHours(REC.ox.target) * 60;
const T_EXP = REC.resist.dose / REC.resist.I / 60;
const T_ETCH = (REC.ox.target * 1000) / REC.boe.rate;
const T_AL = REC.al.target / REC.al.rate / 60;
export const STEPS = [
  {id: 'clean', st: 'wet', name: 'RCA clean', dur: REC.clean.sc1 + REC.clean.sc2, upright: 1},
  {id: 'oxide', st: 'furnace', name: 'Wet oxidation', dur: T_OX, upright: 1},
  {id: 'spin', st: 'spin', name: 'Spin coat resist', dur: REC.resist.spin / 60, upright: 0},
  {id: 'bake', st: 'bake', name: 'Soft bake', dur: REC.resist.bake / 60, upright: 0},
  {id: 'expose', st: 'align', name: 'UV exposure', dur: T_EXP, upright: 0},
  {id: 'develop', st: 'develop', name: 'Develop', dur: REC.resist.dev / 60, upright: 0},
  {id: 'etch', st: 'etch', name: 'Oxide etch', dur: T_ETCH, upright: 1},
  {id: 'strip', st: 'develop', name: 'Resist strip', dur: REC.resist.strip / 60, upright: 0},
  {id: 'metal', st: 'evap', name: 'Aluminium evaporation', dur: T_AL, upright: 2},
  {id: 'probe', st: 'probe', name: 'Four-point probe', dur: REC.probe.t / 60, upright: 0},
];

/** Where the wafer sits in its tool, tool-local, at fraction f of the step. */
export function stepLocal(id, f) {
  const [x, y, z] = STATIONS[STEPS.find((s) => s.id === id).st].slot;
  if (id === 'clean') return [lerp(-0.4, 0.4, smooth((f - 0.47) / 0.06)), y + 0.36 * Math.sin(Math.PI * clamp((f - 0.45) / 0.1)), z];
  if (id === 'oxide') return [lerp(-1.0, 0.35, smooth(f / 0.06) * smooth((1 - f) / 0.06)), y, z];
  if (id === 'strip') return [0.3, y, z];
  return [x, y, z];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function pathBetween(a, b) {
  const sa = STATIONS[a.st];
  const sb = STATIONS[b.st];
  const la = stepLocal(a.id, 1);
  const lb = stepLocal(b.id, 0);
  const pts = [toWorld(sa, la), toWorld(sa, [la[0], CARRY, STAND])];
  if (sa.zone !== sb.zone) {
    if (sa.zone !== 'main') pts.push([DOORS[sa.zone][0], CARRY, DOORS[sa.zone][1]]);
    if (sb.zone !== 'main') pts.push([DOORS[sb.zone][0], CARRY, DOORS[sb.zone][1]]);
  }
  pts.push(toWorld(sb, [lb[0], CARRY, STAND]), toWorld(sb, lb));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return {pts, cum, len: cum[cum.length - 1]};
}

// segments: a step, then the walk to the next one. u is the display axis: a step is 1 wide, a walk 0.4.
export const SEGS = [];
{
  let tau = 0;
  let u = 0;
  STEPS.forEach((step, i) => {
    SEGS.push({kind: 'step', i, step, tau0: tau, tau1: tau + step.dur, u0: u, u1: u + 1});
    step.tau0 = tau;
    tau += step.dur;
    u += 1;
    if (i < STEPS.length - 1) {
      const path = pathBetween(step, STEPS[i + 1]);
      const dur = path.len / REC.walk / 60;
      SEGS.push({kind: 'move', i, from: step, to: STEPS[i + 1], path, tau0: tau, tau1: tau + dur, u0: u, u1: u + 0.4});
      tau += dur;
      u += 0.4;
    }
  });
}
export const TOTAL = SEGS[SEGS.length - 1].tau1;
export const U_TOTAL = SEGS[SEGS.length - 1].u1;
export const tauOfU = (u) => {
  const s = SEGS.find((x) => u <= x.u1) || SEGS[SEGS.length - 1];
  return lerp(s.tau0, s.tau1, clamp((u - s.u0) / (s.u1 - s.u0)));
};
export const uOfTau = (tau) => {
  const s = SEGS.find((x) => tau <= x.tau1) || SEGS[SEGS.length - 1];
  return lerp(s.u0, s.u1, clamp((tau - s.tau0) / (s.tau1 - s.tau0)));
};

/** Minutes spent in a step so far. */
const elapsed = (id, tau) => {
  const s = STEPS.find((x) => x.id === id);
  return clamp(tau - s.tau0, 0, s.dur);
};

/** The film stack on the wafer at tau. Thicknesses in nm. */
export function layersAt(tau) {
  const R = REC.resist;
  const ox = dealGrove(elapsed('oxide', tau) / 60) * 1000;
  const coated = tau >= STEPS[2].tau0;
  const strip = elapsed('strip', tau) / (R.strip / 60);
  const resistFull = coated ? resistThk(R.rpm) * 1000 : 0;
  const dose = R.I * elapsed('expose', tau) * 60;
  const dev = elapsed('develop', tau) / (R.dev / 60);
  const etch = Math.min(ox, REC.boe.rate * elapsed('etch', tau));
  const al = REC.al.rate * elapsed('metal', tau) * 60;
  return {
    ox,
    resist: resistFull * (1 - strip),
    resistWindow: resistFull * (1 - dev) * (1 - strip),
    dose,
    doseK: dose / R.dose,
    dev,
    etch,
    strip,
    al,
    rs: al > 0 ? sheetR(al) : null,
  };
}

// thermal oxide interference colours, nm -> colour (the standard chart, approximate on a screen)
const OX_COLOURS = [
  [0, '#8f969d'], [50, '#b59a6e'], [75, '#8a5a3a'], [100, '#5b2a78'], [125, '#2a3fa8'], [150, '#5f9bd6'], [175, '#b9cf8a'], [200, '#d9c05a'],
  [225, '#d9a23c'], [250, '#e08a4a'], [275, '#b0407a'], [300, '#4a4ac0'], [325, '#2f8fb0'], [350, '#7fc06a'], [375, '#c0d050'], [390, '#e0d040'],
  [412, '#e8a850'], [426, '#e88aa0'], [443, '#c04a78'], [465, '#a03a8a'], [480, '#5a40b8'], [493, '#3a6ac8'], [502, '#2f9aa8'], [520, '#4ab070'],
];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
export function oxideColour(nm) {
  for (let i = 0; i < OX_COLOURS.length - 1; i++) {
    const [a, ca] = OX_COLOURS[i];
    const [b, cb] = OX_COLOURS[i + 1];
    if (nm <= b) return mix(hex(ca), hex(cb), clamp((nm - a) / (b - a)));
  }
  return hex(OX_COLOURS[OX_COLOURS.length - 1][1]);
}
/** What the wafer face looks like from across the room, rgb 0..1. The 10 um pattern is far too small to see. */
export function waferColour(L) {
  const si = hex('#8f969d');
  let c = oxideColour(L.ox);
  if (L.etch > 0) c = mix(c, mix(oxideColour(L.ox - L.etch), si, L.etch / Math.max(1, L.ox)), 0.5);
  if (L.resist > 0) c = mix(c, hex('#b5482e'), 0.75 * (L.resist / (resistThk(REC.resist.rpm) * 1000)));
  if (L.al > 0) c = mix(c, hex('#dfe3e8'), clamp(L.al / REC.al.opaque));
  return c;
}

/** Everything about the lab at process time tau. */
export function stateAt(tauIn) {
  const tau = clamp(tauIn, 0, TOTAL);
  const seg = SEGS.find((s) => tau <= s.tau1) || SEGS[SEGS.length - 1];
  const f = clamp((tau - seg.tau0) / (seg.tau1 - seg.tau0));
  const L = layersAt(tau);
  const out = {tau, seg, f, layers: L, moving: seg.kind === 'move', colour: waferColour(L)};
  if (seg.kind === 'step') {
    const st = STATIONS[seg.step.st];
    const loc = stepLocal(seg.step.id, f);
    out.stepId = seg.step.id;
    out.station = seg.step.st;
    out.local = loc;
    out.pos = toWorld(st, loc);
    out.upright = seg.step.upright;
    const stand = toWorld(st, [loc[0], 0, STAND + REACH]);
    out.operator = {x: stand[0], z: stand[2], yaw: st.rot + Math.PI};
  } else {
    const {pts, cum, len} = seg.path;
    const at = (s) => {
      let i = 1;
      while (i < pts.length - 1 && s > cum[i]) i++;
      const k = clamp((s - cum[i - 1]) / (cum[i] - cum[i - 1]));
      return {i, k, p: pts[i - 1].map((v, j) => lerp(v, pts[i][j], k))};
    };
    const s = f * len;
    const w = at(s);
    out.stepId = null;
    out.station = null;
    out.next = seg.to.st;
    out.pos = w.p;
    const last = pts.length - 1;
    out.upright = w.i === 1 ? lerp(seg.from.upright, 0, smooth(w.k)) : w.i === last ? lerp(0, seg.to.upright, smooth(w.k)) : 0;
    // the operator walks the middle of the path and reaches into the tool at each end
    const o = at(clamp(s, cum[1], cum[last - 1])).p;
    const j = clamp(w.i, 2, last - 1);
    const dx = pts[j][0] - pts[j - 1][0];
    const dz = pts[j][2] - pts[j - 1][2];
    const fromSt = STATIONS[seg.from.st];
    const toSt = STATIONS[seg.to.st];
    let yaw = Math.atan2(dx, dz);
    const back = REACH;
    if (w.i === 1) yaw = fromSt.rot + Math.PI;
    else if (w.i === last) yaw = toSt.rot + Math.PI;
    out.operator = {x: o[0] - Math.sin(yaw) * back, z: o[2] - Math.cos(yaw) * back, yaw};
  }
  // tool states
  const R = REC.resist;
  out.spinAngle = 2 * Math.PI * (R.rpm / 60) * elapsed('spin', tau) * 60;
  out.spinning = out.stepId === 'spin' && f > 1e-4;
  out.inTube = out.stepId === 'oxide' ? smooth(f / 0.06) * smooth((1 - f) / 0.06) : 0;
  out.exposing = out.stepId === 'expose' && f > 1e-4;
  // the mask drops into contact in the first moments of the exposure
  out.maskGap = out.stepId === 'expose' ? 0.03 * (1 - smooth(f / 0.05)) : 0.03;
  out.depositing = out.stepId === 'metal' && f > 1e-4;
  out.probing = out.stepId === 'probe' ? smooth(f / 0.15) * smooth((1 - f) / 0.15) : 0;
  out.tank = out.stepId === 'clean' ? (f < 0.5 ? 'SC-1' : 'SC-2') : null;
  return out;
}

const n = (v, d = 0) => v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
export const clock = (min) => {
  const s = Math.round(min * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** The gauge rows for the current step: [label, value]. */
export function readouts(s) {
  const L = s.layers;
  const R = REC.resist;
  if (s.moving) {
    return [
      ['From', STATIONS[s.seg.from.st].name],
      ['To', STATIONS[s.seg.to.st].name],
      ['Path length', `${n(s.seg.path.len, 2)} m`],
      ['Walking speed', `${n(REC.walk, 1)} m/s`],
      ['Walked', `${n(s.f * s.seg.path.len, 2)} m`],
    ];
  }
  const t = s.tau - s.seg.tau0;
  switch (s.stepId) {
    case 'clean':
      return [['Bath', `${s.tank} at ${REC.clean.T} °C`], ['Time in SC-1', `${clock(Math.min(t, REC.clean.sc1))} of 10:00`], ['Time in SC-2', `${clock(Math.max(0, t - REC.clean.sc1))} of 10:00`], ['Oxide on wafer', `${n(L.ox)} nm`]];
    case 'oxide':
      return [['Tube temperature', `${n(REC.ox.T)} °C`], ['Ambient', 'steam (wet O2)'], ['Time at temperature', `${clock(t)} of ${clock(s.seg.step.dur)}`], ['Oxide thickness', `${n(L.ox)} nm`], ['Growth rate now', `${n(growthRate(t / 60), 1)} nm/min`]];
    case 'spin':
      return [['Spin speed', `${n(R.rpm)} rpm`], ['Edge speed', `${n((2 * Math.PI * R.rpm / 60) * (WAFER.d / 2), 1)} m/s`], ['Spin time', `${n(t * 60, 1)} of ${R.spin} s`], ['Resist thickness', `${n(resistThk(R.rpm), 2)} µm`]];
    case 'bake':
      return [['Plate temperature', `${R.bakeT} °C`], ['Bake time', `${n(t * 60)} of ${R.bake} s`], ['Resist thickness', `${n(L.resist / 1000, 2)} µm`]];
    case 'expose':
      return [['Lamp intensity', `${R.I} mW/cm²`], ['Shutter open', `${n(t * 60, 1)} of ${n(R.dose / R.I, 1)} s`], ['Dose delivered', `${n(L.dose)} of ${R.dose} mJ/cm²`], ['Mask gap', 'contact'], ['Mask pattern', `${REC.mask.line} µm lines, ${REC.mask.space} µm spaces`]];
    case 'develop':
      return [['Developer time', `${n(t * 60)} of ${R.dev} s`], ['Resist left in windows', `${n(L.resistWindow / 1000, 2)} µm`], ['Resist on lines', `${n(L.resist / 1000, 2)} µm`]];
    case 'etch':
      return [['Etch rate', `${REC.boe.rate} nm/min`], ['Etch time', `${clock(t)} of ${clock(s.seg.step.dur)}`], ['Oxide removed', `${n(L.etch)} nm`], ['Oxide left in windows', `${n(L.ox - L.etch)} nm`]];
    case 'strip':
      return [['Strip time', `${n(t * 60)} of ${R.strip} s`], ['Resist left', `${n(L.resist / 1000, 2)} µm`], ['Oxide lines', `${n(L.ox)} nm`]];
    case 'metal':
      return [['Deposition rate', `${REC.al.rate} nm/s`], ['Deposition time', `${clock(t)} of ${clock(s.seg.step.dur)}`], ['Aluminium thickness', `${n(L.al)} nm`], ['Sheet resistance', L.al > 1 ? `${n(L.rs, 3)} Ω/sq` : 'no film yet']];
    case 'probe': {
      const v = (REC.probe.I * L.rs) / REC.probe.k;
      return [['Forced current', `${n(REC.probe.I * 1000)} mA`], ['Measured voltage', s.probing > 0.99 ? `${n(v * 1000, 3)} mV` : 'probes moving'], ['Sheet resistance', `${n(L.rs, 4)} Ω/sq`], ['Aluminium thickness', `${n(L.al)} nm`]];
    }
  }
  return [];
}
/** d(thickness)/dt of Deal-Grove in nm/min at h hours. */
export const growthRate = (h) => {
  const {A, B} = REC.ox;
  return ((B / (A + 2 * dealGrove(h))) * 1000) / 60;
};

// ------------------------------------------------------------ where every number comes from
export const SOURCES = [
  ['Wafer', '100 mm diameter, 525 µm thick, 32.5 mm primary flat', 'standard', 'SEMI M1 for 100 mm wafers'],
  ['ISO class limits', '3,520 / 35,200 / 352,000 particles per m³ at ≥0.5 µm for ISO 5 / 6 / 7', 'standard', 'ISO 14644-1'],
  ['Filter face velocity', '0.45 m/s', 'typical', 'the usual design figure for laminar-flow filter units'],
  ['Fan filter unit', '1.2 m × 0.6 m', 'typical', 'the common 4 ft × 2 ft ceiling module'],
  ['Ceiling coverage', '60% ISO 5, 25% ISO 6, 10% ISO 7', 'typical', 'design rules of thumb, not a standard'],
  ['Room', '14 m × 8 m floor, 2.7 m ceiling, five zones', 'guess', 'a plausible teaching lab, not a survey of a real one'],
  ['Tool footprints', 'benches 0.75 to 0.9 m deep, furnace 2.6 m long', 'guess', 'sized by eye from common lab tools'],
  ['RCA clean', 'SC-1 10 min, SC-2 10 min, 75 °C', 'standard', 'the RCA recipe (Kern, 1970)'],
  ['Wet oxidation at 1100 °C', 'A = 0.11 µm, B = 0.51 µm²/h, no time offset', 'standard', 'Deal and Grove, 1965, (100) silicon'],
  ['Oxide target', '500 nm', 'guess', 'a common field-oxide thickness for a teaching run'],
  ['Furnace ramps', 'not modelled', 'guess', 'the clock counts time at temperature only; real runs add about an hour'],
  ['Resist', '1.3 µm at 4000 rpm, soft bake 115 °C for 60 s, 150 mJ/cm², develop 60 s', 'datasheet', 'Microposit S1813 with MF-319'],
  ['Thickness against spin speed', 'inverse square root of rpm', 'typical', 'an empirical fit, good near the datasheet point'],
  ['Aligner lamp', '15 mW/cm²', 'typical', 'a mercury-lamp contact aligner; measure yours'],
  ['Mask', '10 µm lines and spaces', 'guess', 'easy for a contact aligner to print'],
  ['Develop and strip', 'resist removed linearly in time, strip 120 s', 'guess', 'real removal is not linear'],
  ['BOE etch rate', '100 nm/min on thermal oxide at room temperature', 'typical', '6:1 BOE is usually quoted at 90 to 110 nm/min'],
  ['Evaporation', '0.5 nm/s to 200 nm; pump-down not modelled', 'typical', 'a common rate for aluminium; pump-down adds 30 to 60 min'],
  ['Aluminium resistivity', '2.65 × 10⁻⁸ Ω·m', 'standard', 'bulk value; an evaporated film reads 5 to 15% higher'],
  ['Four-point probe', 'V/I = Rs × ln2/π, at 10 mA', 'standard', 'collinear probe on a thin, wide film'],
  ['Walking speed', '0.5 m/s', 'guess', 'a slow walk with a wafer in tweezers'],
  ['Oxide colours', 'colour chart by thickness', 'typical', 'the standard thermal-oxide chart, approximate on a screen'],
];

// ------------------------------------------------------------ the walkthrough: one card per stop, written for high school,
// figures from the model. act is the control the student clicks on the machine: a tool-local point and what it does.
const fx = (v, d = 0) => v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
export const LESSONS = (() => {
  const R = REC.resist;
  const step = (id) => STEPS.find((s) => s.id === id);
  return {
    intro: {
      kicker: 'Welcome',
      title: 'Follow one wafer through a chip lab',
      what: `A wafer is a thin, shiny disc of pure silicon, ${WAFER.d * 1000} mm across and about half a millimetre thick (roughly five sheets of paper). Computer chips are built on wafers like this one. You will design a simple pattern, put on a cleanroom suit, then take the wafer through ${STEPS.length} steps that print the pattern and coat it with metal.`,
      why: 'This is the same basic process used to make the chips in phones and laptops, just with fewer layers and much bigger features.',
      watch: `At each station, read the card, then click the glowing control on the machine to run it yourself. When the step finishes, answer the short quiz. At the end you get a grade; ${PASS}% or more completes the training.`,
    },
    design: {
      kicker: 'Before the cleanroom',
      title: 'Design the pattern',
      what: `Engineers draw a chip's pattern on a computer. Ours is simple: stripes ${REC.mask.line} µm wide with ${REC.mask.space} µm gaps. A micrometre (µm) is a thousandth of a millimetre. A human hair is roughly 70 µm wide, so each stripe is about 7 times thinner than a hair.`,
      why: 'The drawing is used to make a photomask: a glass plate with the pattern printed in chrome, like a stencil. Later, light shines through the mask to copy the pattern onto the wafer.',
      watch: 'The striped pattern on the screen is what you will print later at the mask aligner.',
      act: {at: [0, 1.07, -0.17], label: 'Send the design to the mask shop', ok: 'Design sent: the mask shop will make the photomask'},
    },
    gown: {
      kicker: 'Entering the cleanroom',
      title: 'Suit up',
      what: 'Before going into the cleanroom you put on a full suit: shoe covers, a hood, a coverall, a face mask, safety glasses and gloves. You dress from the top down so dust from your head does not fall onto clean clothes.',
      why: 'Your body constantly sheds skin flakes, hair and dust: hundreds of thousands of tiny particles every minute. One speck landing on the wafer could connect two stripes and ruin the chip. The suit traps those particles.',
      watch: `Each room is cleaner than the last. The air here may hold up to ${fx(ISO_LIMIT[7])} particles per cubic metre; the lithography room allows only ${fx(ISO_LIMIT[5])}. Ordinary indoor air holds millions.`,
      act: {at: [-0.15, 1.25, -0.1], label: 'Put on the cleanroom suit', ok: 'Suited up: entering the cleanroom'},
    },
    clean: {
      title: 'Clean the wafer',
      what: `The wafer gets two hot chemical baths at ${REC.clean.T} °C, ${REC.clean.sc1} minutes each. The first bath (called SC-1) removes dust and greasy films. The second (SC-2) removes tiny traces of metal. Between baths it is rinsed in ultra-pure water.`,
      why: 'In the next step the wafer is heated to grow a glass layer. Any dirt left on the surface would be sealed in for good, so nearly every chip process starts with a clean like this. It is named after RCA, the company where it was invented in the 1960s.',
      watch: 'Halfway through, the wafer moves from the first tank to the second.',
      act: {at: [-0.4, 1.0, 0], label: 'Lower the wafer into the SC-1 bath', ok: 'Wafer lowered into the SC-1 bath'},
    },
    oxide: {
      title: 'Grow a glass layer',
      what: `The wafer stands in a quartz holder and slides into a tube heated to ${fx(REC.ox.T)} °C and filled with steam. At that heat, silicon on the surface reacts with oxygen and turns into silicon dioxide, the same material as glass and quartz sand. Growing a ${fx(REC.ox.target * 1000)} nm layer takes about ${fx(step('oxide').dur)} minutes.`,
      why: 'Silicon dioxide is an insulator: electricity cannot flow through it. It will hold our pattern and keep the metal from touching the silicon underneath. A nanometre (nm) is a thousandth of a micrometre.',
      watch: 'The layer grows fast at first, then slower, because oxygen has to push through the glass that is already there. Watch the growth rate drop. The wafer also changes colour as the layer thickens, the same effect that makes soap bubbles colourful.',
      act: {at: [-1.0, 1.22, 0.05], label: 'Push the boat into the furnace', ok: 'Boat moving into the 1,100 °C tube'},
    },
    spin: {
      title: 'Spin on a coating',
      what: `A few drops of photoresist go in the middle of the wafer, then it spins at ${fx(R.rpm)} rpm (revolutions per minute) for ${R.spin} seconds. The spinning flings off the extra and leaves a smooth, even coating ${fx(resistThk(R.rpm), 1)} µm thick.`,
      why: 'Photoresist is a light-sensitive coating, a bit like the film in an old camera. Where light hits it, it changes so it can be washed away later. That is how the pattern gets onto the wafer.',
      watch: `Faster spinning makes a thinner coat. Doubling the speed does not halve the thickness: it makes the coat about ${fx((1 - resistThk(2 * R.rpm) / resistThk(R.rpm)) * 100)}% thinner.`,
      act: {at: [0.34, 0.95, 0.2], label: 'Press START on the spin coater', ok: 'Spin coater starting'},
    },
    bake: {
      title: 'Bake the coating',
      what: `The wafer sits on a hot plate at ${R.bakeT} °C, a little hotter than boiling water, for ${R.bake} seconds. This dries the photoresist by driving out the liquid it was mixed in.`,
      why: 'Wet photoresist is sticky. It would glue itself to the mask in the next step and smear the pattern. Baked photoresist is firm.',
      watch: 'In real life the coating shrinks a little as it dries. This simulation keeps it the same thickness.',
      act: {at: [0.07, 0.9, 0.21], label: 'Turn on the hot plate', ok: 'Hot plate on'},
    },
    expose: {
      title: 'Print the pattern with UV light',
      what: `The mask is pressed against the wafer and an ultraviolet (UV) lamp shines through it for ${fx(R.dose / R.I)} seconds. Light passes through the clear stripes of the mask and hits the photoresist underneath. The chrome stripes block it.`,
      why: 'This is the moment the pattern is copied from the mask onto the wafer. The room has yellow lights because ordinary white light contains blue and violet, which would expose the photoresist by accident.',
      watch: `In the side view, the photoresist under the clear stripes changes colour as it soaks up light. It needs ${R.dose} millijoules of light energy on every square centimetre.`,
      act: {at: [-0.17, 0.84, 0.31], label: 'Press EXPOSE on the mask aligner', ok: 'Shutter open: UV exposure running'},
    },
    develop: {
      title: 'Develop the pattern',
      what: `The wafer goes into a liquid called developer for ${R.dev} seconds. It dissolves only the photoresist that was hit by UV light, a lot like developing a photo.`,
      why: 'Now the wafer has stripes of photoresist with gaps between them. In the gaps the glass layer is uncovered; under the stripes it is protected.',
      watch: 'In the side view, the photoresist disappears from every other stripe.',
      act: {at: [-0.3, 0.92, 0], label: 'Dip the wafer in the developer', ok: 'Wafer in the developer'},
    },
    etch: {
      title: 'Etch the glass',
      what: `The wafer goes into an acid bath called buffered oxide etch (BOE). It eats through silicon dioxide at about ${REC.boe.rate} nm per minute but cannot get through photoresist. After ${fx(step('etch').dur)} minutes the uncovered glass is gone, right down to the silicon.`,
      why: 'The pattern is now cut into the glass layer itself. BOE contains hydrofluoric acid, one of the most dangerous chemicals in the lab: it soaks through skin and attacks bone. That is why this hood keeps a special first-aid gel (calcium gluconate) right beside it.',
      watch: 'Watch the glass left in the gaps count down to zero.',
      act: {at: [0, 1.0, 0], label: 'Lower the wafer into the BOE tank', ok: 'Wafer lowered into the BOE etch'},
    },
    strip: {
      title: 'Remove the photoresist',
      what: `Acetone, the main ingredient in many nail polish removers, dissolves the leftover photoresist in about ${R.strip / 60} minutes. What is left is stripes of glass on bare silicon.`,
      why: 'The photoresist was only a temporary stencil. Leaving it on would contaminate the next step.',
      watch: 'The side view now shows just silicon and stripes of glass.',
      act: {at: [0.3, 0.92, 0], label: 'Dip the wafer in acetone', ok: 'Wafer in the acetone'},
    },
    metal: {
      title: 'Coat it with aluminium',
      what: `The wafer hangs upside down inside a vacuum chamber. An electric current heats a small piece of aluminium until it turns into vapour. The vapour rises and coats the wafer at ${REC.al.rate} nm per second. Building up ${REC.al.target} nm takes ${clock(step('metal').dur)} (minutes:seconds).`,
      why: 'The air is pumped out so the aluminium atoms fly straight to the wafer without bumping into air molecules. Metal layers are the wires that carry electricity around a chip.',
      watch: 'Sheet resistance, a measure of how hard it is for electricity to flow across the film, drops as the metal gets thicker.',
      act: {at: [0.33, 1.3, -0.2], label: 'Start the evaporation', ok: 'Evaporation running'},
    },
    probe: {
      title: 'Test the metal',
      what: `Four tiny needles touch the aluminium in a straight line, 1 mm apart. The outer two send a small current (${fx(REC.probe.I * 1000)} milliamps) through the metal. The inner two measure the voltage. From those two numbers you can work out the sheet resistance.`,
      why: `This test shows whether the metal came out right. ${REC.al.target} nm of aluminium should measure about ${fx(sheetR(REC.al.target), 3)} ohms per square. A higher number would mean the film is too thin or not pure.`,
      watch: `The voltage should settle around ${fx(((REC.probe.I * sheetR(REC.al.target)) / REC.probe.k) * 1000, 2)} millivolts. Sheet resistance = ${fx(REC.probe.k, 2)} × voltage ÷ current.`,
      act: {at: [0, 1.0, 0], label: 'Lower the probes onto the wafer', ok: 'Probes lowering onto the metal'},
    },
    done: {
      kicker: 'Run complete',
      title: 'You made a patterned, tested wafer',
      what: `You took one wafer through ${STEPS.length} steps: clean, grow glass, coat, bake, expose, develop, etch, strip, add metal and test. Here that took ${clock(TOTAL)} (minutes:seconds) of machine time. A real run takes a few hours more for heating up, cooling down and pumping out air.`,
      why: 'A real computer chip repeats this cycle dozens of times, with one mask for each layer, to build billions of transistors and the wires that connect them.',
      watch: 'Walk around the lab yourself with W A S D, open NUMBERS to see where every figure comes from, or run it again.',
    },
  };
})();

// ------------------------------------------------------------ the station quizzes and the grade
// Each question lists the right answer first; the order shown is shuffled once, the same for every student.
export const gradeOf = (pct) => (pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F');
const Q = (q, a, why) => ({q, a, why});
const QUIZ_SRC = {
  design: [Q(`A stripe on our mask is ${REC.mask.line} µm wide. A human hair is about 70 µm wide. About how many times thinner than a hair is the stripe?`, ['About 7 times', 'About 70 times', 'About 700 times', 'They are the same width'], `70 ÷ ${REC.mask.line} = 7.`)],
  gown: [Q('Why do you put the cleanroom suit on from the top down?', ['So dust from your head does not fall onto clean clothes', 'Because it is faster', 'So the gloves stay warm', 'Because the hood will not fit over the coverall'], 'Anything that falls from your hair or face lands on what you put on next, so the head goes first.')],
  clean: [
    Q('What does the SC-1 bath mainly remove?', ['Dust and greasy films', 'Metal atoms', 'The silicon itself', 'Photoresist'], 'SC-1 lifts particles and organic films. SC-2 is the one for metal atoms.'),
    Q('Why is the wafer cleaned before the oxide is grown?', ['Any dirt would be sealed under the glass for good', 'Cleaning makes the oxide grow twice as fast', 'Cleaning gives the wafer its colour', 'It cools the wafer down'], 'The glass layer grows over whatever is on the surface and traps it.'),
  ],
  oxide: [
    Q('What is silicon dioxide?', ['A glass that does not conduct electricity', 'A metal that carries current', 'A light-sensitive coating', 'An acid'], 'It is the same material as glass and quartz sand, and it is an insulator.'),
    Q('Why does the oxide grow more slowly as it gets thicker?', ['Oxygen has to travel through the glass that is already there', 'The furnace cools down', 'The steam runs out', 'The wafer is spinning slower'], 'The reaction happens at the silicon, under the glass, so every new layer takes longer to reach.'),
  ],
  spin: [
    Q('What happens to the photoresist coating if the wafer spins faster?', ['It gets thinner', 'It gets thicker', 'It stays the same', 'It turns into glass'], 'More speed throws off more liquid. Thickness goes as one over the square root of the speed.'),
    Q('Photoresist is most like which of these?', ['The film in an old camera', 'Paint primer', 'Superglue', 'Window glass'], 'Like camera film, it changes where light hits it.'),
  ],
  bake: [
    Q('What does the soft bake remove from the photoresist?', ['The liquid solvent', 'The pattern', 'The oxide underneath', 'Dust'], 'The heat drives out the solvent the resist was mixed in.'),
    Q('What could happen if the soft bake were skipped?', ['The sticky resist could glue itself to the mask and smear', 'The oxide would melt', 'The wafer would crack', 'Nothing at all'], 'Wet resist is sticky; baked resist is firm.'),
  ],
  expose: [
    Q('Where does the UV light reach the photoresist?', ['Under the clear parts of the mask', 'Under the chrome stripes', 'Everywhere equally', 'Nowhere: the mask blocks it all'], 'Chrome blocks UV; the clear glass lets it through.'),
    Q(`The lamp gives ${REC.resist.I} mW/cm² and the resist needs ${REC.resist.dose} mJ/cm². How long must the shutter stay open?`, [`${REC.resist.dose / REC.resist.I} seconds`, `${REC.resist.dose * REC.resist.I} seconds`, '1 second', '150 seconds'], `Dose = intensity × time, so time = ${REC.resist.dose} ÷ ${REC.resist.I} = ${REC.resist.dose / REC.resist.I} s.`),
  ],
  develop: [
    Q('S1813 is a positive photoresist. Which parts wash away in the developer?', ['The parts the UV light hit', 'The parts the UV light did not hit', 'All of it', 'None of it'], 'Positive resist: where the light hit, it washes away.'),
    Q('After developing, where is the glass layer uncovered?', ['In the gaps between the resist stripes', 'Under the resist stripes', 'Everywhere', 'Nowhere'], 'The resist stripes stay and protect the glass under them.'),
  ],
  etch: [
    Q(`The acid removes glass at ${REC.boe.rate} nm per minute. How long does it take to remove ${fx(REC.ox.target * 1000)} nm?`, [`${(REC.ox.target * 1000) / REC.boe.rate} minutes`, `${(REC.ox.target * 1000) / REC.boe.rate * 10} minutes`, '0.5 minutes', `${fx(REC.ox.target * 1000)} minutes`], `${fx(REC.ox.target * 1000)} ÷ ${REC.boe.rate} = ${(REC.ox.target * 1000) / REC.boe.rate} minutes.`),
    Q('Why does the etch hood keep calcium gluconate gel beside it?', ['It is first aid for hydrofluoric acid on skin', 'It cleans the tank', 'It removes photoresist', 'It cools the acid'], 'Hydrofluoric acid soaks through skin and attacks bone; the gel is the first-aid treatment.'),
  ],
  strip: [
    Q('What removes the leftover photoresist?', ['Acetone', 'The acid etch', 'Steam', 'UV light'], 'Acetone dissolves the photoresist but not the glass or silicon.'),
    Q('After the strip, what is left on the wafer?', ['Stripes of glass on bare silicon', 'Stripes of photoresist on glass', 'Stripes of metal', 'A smooth, unbroken glass layer'], 'The pattern is now in the glass itself.'),
  ],
  metal: [
    Q('Why is the aluminium evaporated inside a vacuum?', ['So the atoms fly straight to the wafer without hitting air molecules', 'To keep the wafer cold', 'To make the metal shiny', 'To remove the photoresist'], 'Without air in the way, the atoms travel in straight lines.'),
    Q('As the aluminium film gets thicker, its sheet resistance:', ['Goes down', 'Goes up', 'Stays the same', 'Becomes exactly zero'], 'More metal gives the current more room to flow.'),
  ],
  probe: [
    Q('In a four-point probe, what do the two inner needles measure?', ['Voltage', 'Current', 'Temperature', 'Thickness'], 'The outer pair pushes current through; the inner pair measures the voltage.'),
    Q(`${REC.al.target} nm of aluminium should read about ${fx(sheetR(REC.al.target), 3)} Ω per square. A much higher reading most likely means:`, ['The film is too thin or not pure', 'The film is perfect', 'The needles are too cold', 'The wafer is too clean'], 'Less metal, or dirtier metal, resists the current more.'),
  ],
};
export const QUIZ = Object.fromEntries(
  Object.entries(QUIZ_SRC).map(([stop, qs]) => [
    stop,
    qs.map((x, qi) => {
      // a fixed shuffle per question, so the right answer is not always first
      const order = x.a.map((_, i) => i);
      let seed = [...(stop + qi)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return {q: x.q, options: order.map((i) => x.a[i]), answer: order.indexOf(0), why: x.why};
    }),
  ]),
);
export const QUIZ_TOTAL = Object.values(QUIZ).reduce((n, qs) => n + qs.length, 0);
