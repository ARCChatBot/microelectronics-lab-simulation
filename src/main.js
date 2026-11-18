// The lab as a page you stand in, run as a guided walkthrough. The run stops at every station with a card that says
// what happens there and why; Continue plays the step and carries the wafer on to the next stop. Three ways to see it:
// through the operator's eyes, on foot (W A S D or the arrow keys, drag to look), or from above as a floor plan.
import {createAudio} from './audio.js';
import {createCloseup} from './closeup.js';
import {createRecord} from './record.js';
import {createLab} from './lab.js';
import {LESSONS, SEGS, STATIONS, STATION_ORDER, STEPS, U_TOTAL, ZONES, blocked, clamp, stateAt, tauOfU, toWorld} from './model.js';
import {TL, TOGGLES, createUI} from './ui.js';

const W = 1600;
const H = 900;
const RATE = 0.11; // display units per second: a step plays in about 9 s, a walk in about 4 s
const EYE = 1.62;
const FOV = {fp: 66, plan: 34};
const D2R = Math.PI / 180;
// tools whose work is hidden inside a housing open up while you are at them
const OPENS = {furnace: 1, evap: 1};

const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'gl';
app.appendChild(canvas);
const lab = createLab(canvas);
const ui = createUI(app);
// ------------------------------------------------------------ sound and feedback
const audio = createAudio();
addEventListener('pointerdown', () => audio.unlock(), {capture: true});
addEventListener('keydown', () => audio.unlock(), {capture: true});
addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('.bt')) audio.cue('ui');
});
const soundBtn = document.createElement('div');
soundBtn.className = 'bt on snd';
soundBtn.textContent = '♪ SOUND ON';
ui.root.querySelector('.tg').prepend(soundBtn);
soundBtn.addEventListener('click', () => {
  const on = audio.toggle();
  soundBtn.textContent = on ? '♪ SOUND ON' : '♪ SOUND OFF';
  soundBtn.classList.toggle('on', on);
});
const toastEl = document.createElement('div');
toastEl.className = 'toast';
toastEl.hidden = true;
ui.root.appendChild(toastEl);
let toastTimer = 0;
/** A confirmation that slides in under the header. */
const toast = (text, kind = 'go') => {
  toastEl.hidden = false;
  toastEl.className = `toast ${kind}`;
  toastEl.innerHTML = `<i>${kind === 'done' ? '✓' : '▶'}</i>${text}`;
  void toastEl.offsetWidth;
  toastEl.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('in'), 2600);
};
/** Rings that burst out from where the student clicked. */
const burstAt = (x, y) => {
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = `${x}px`;
  b.style.top = `${y}px`;
  b.innerHTML = '<i></i><i></i><b>✓</b>';
  ui.root.appendChild(b);
  setTimeout(() => b.remove(), 900);
};
const closeup = createCloseup(ui.root);
const rec = createRecord(ui.root, {
  audio,
  onSignedIn: () => showCard(0),
  onSignedOut: () => {
    hideCard();
    playing = false;
    u = 0;
    setMode('plan');
  },
  goto: (i) => showCard(i),
  stopIndex: (stop) => STOPS.indexOf(stop),
});
/** The end of the run: the grade and completion status. */
function finish() {
  playing = false;
  hideCard();
  rec.results({onRetake: () => showCard(1), onWalk: () => startWalking()});
}
const seqEl = document.createElement('div');
seqEl.className = 'seq cp';
seqEl.hidden = true;
ui.root.appendChild(seqEl);

const note = document.createElement('div');
note.className = 'turn';
note.textContent = 'Turn your phone sideways for the full console';
document.body.appendChild(note);

// ------------------------------------------------------------ fit and quality
const TIERS = [2, 1.5, 1];
let tier = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700 ? 2 : 0;
let scale = 1;
const fit = () => {
  scale = Math.min(innerWidth / W, innerHeight / H);
  app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
  lab.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier]));
};
fit();
addEventListener('resize', fit);
const toStage = (cx) => (cx - app.getBoundingClientRect().left) / scale;

// ------------------------------------------------------------ state
let T = 0;
let u = 0;
let playing = false;
let speed = 1;
let mode = 'plan'; // 'ride' the operator's eyes, 'walk' on foot, 'plan' from above
let focus = null;
const display = {ceiling: true, explode: false, xray: false, airflow: true, labels: true, numbers: false};
const player = {x: 6.5, z: 4, yaw: Math.PI, pitch: -0.1};
const look = {yaw: 0, pitch: 0, zoom: 1}; // the head turned away from the work while riding
const orbit = {az: 0, el: 0, k: 1};
const PLAN = {tx: 7.0, ty: 0.3, tz: 4.2, az: 22, el: 46, d: 23.5};
const cam = {pos: [14, 17, 20], target: [7, 0.3, 4.2], fov: FOV.plan};
const keys = new Set();

const dirOf = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
const setMode = (m) => {
  mode = m;
  focus = null;
  Object.assign(look, {yaw: 0, pitch: 0, zoom: 1});
  Object.assign(orbit, {az: 0, el: 0, k: 1});
};
let state = stateAt(0);
/** Step off the operator's spot onto your own feet. */
const startWalking = () => {
  if (mode === 'walk') return;
  if (mode === 'ride') Object.assign(player, {x: cam.pos[0], z: cam.pos[2], yaw: Math.atan2(cam.target[0] - cam.pos[0], cam.target[2] - cam.pos[2]), pitch: -0.2});
  else Object.assign(player, {x: 6.5, z: 4, yaw: Math.PI, pitch: -0.1});
  setMode('walk');
};

// ------------------------------------------------------------ the walkthrough
const STOPS = ['intro', 'design', 'gown', ...STEPS.map((s) => s.id), 'done'];
const stepSeg = (id) => SEGS.find((s) => s.kind === 'step' && s.step.id === id);
let card = null; // index into STOPS while a card is up
let pre = null; // 'design' or 'gown' while the operator stands there, before the first step
const cardEl = document.createElement('div');
cardEl.className = 'card';
cardEl.hidden = true;
cardEl.innerHTML = `<div class="ck"></div><div class="ct"><b></b><span></span></div>
  <div class="cc"><div><h4>WHAT'S HAPPENING</h4><p class="w1"></p></div><div><h4>WHY IT MATTERS</h4><p class="w2"></p></div><div><h4>LOOK FOR</h4><p class="w3"></p></div></div>
  <div class="cb"><div class="bt cback">◀ BACK</div><div class="bt calt"></div><div class="bt cgo"></div></div>
  <div class="turn"><i></i><b>YOUR TURN</b><span></span></div>`;
ui.root.appendChild(cardEl);
const $ = (s) => cardEl.querySelector(s);
// the control on the machine the student clicks to run this station
const hot = document.createElement('button');
hot.className = 'hot';
hot.innerHTML = '<i></i><span></span>';
ui.root.appendChild(hot);
const actOf = (i) => (i === null ? null : LESSONS[STOPS[i]].act || null);
const actWorld = () => {
  const a = actOf(card);
  if (!a) return null;
  const id = STOPS[card];
  const step = STEPS.find((s) => s.id === id);
  return toWorld(STATIONS[step ? step.st : id], a.at);
};
const nudge = () => {
  hot.classList.remove('nudge');
  void hot.offsetWidth;
  hot.classList.add('nudge');
};
function showCard(i) {
  card = i;
  rec.at(STOPS[i]);
  const id = STOPS[i];
  const L = LESSONS[id];
  const step = STEPS.find((s) => s.id === id);
  playing = false;
  pre = id === 'design' || id === 'gown' ? id : null;
  if (id === 'intro') {
    u = 0;
    setMode('plan');
    Object.assign(display, {ceiling: true, airflow: true});
  } else {
    if (mode === 'plan') setMode('ride');
    Object.assign(display, {ceiling: false, airflow: false});
    if (step) u = stepSeg(id).u0 + 1e-6;
    else if (id === 'done') u = U_TOTAL;
    else u = 0;
  }
  $('.ck').textContent = step ? `STOP ${i + 1} OF ${STOPS.length} · PROCESS STEP ${STEPS.indexOf(step) + 1} OF ${STEPS.length}` : `STOP ${i + 1} OF ${STOPS.length} · ${L.kicker.toUpperCase()}`;
  $('.ct b').textContent = L.title;
  $('.ct span').textContent = step ? STATIONS[step.st].name : pre ? STATIONS[pre].name : '';
  $('.w1').textContent = L.what;
  $('.w2').textContent = L.why;
  $('.w3').textContent = L.watch;
  $('.cback').hidden = i === 0;
  $('.calt').hidden = id !== 'done' && id !== 'intro';
  $('.calt').textContent = 'WALK AROUND';
  $('.cgo').textContent = id === 'intro' ? 'START ▶' : 'RUN AGAIN ▶';
  const act = L.act;
  $('.cgo').hidden = !!act;
  $('.turn').hidden = !act;
  if (act) {
    $('.turn span').textContent = `${act.label}: click the glowing control on the machine.`;
    hot.querySelector('span').textContent = act.label;
  }
  cardEl.classList.toggle('acting', !!act);
  cardEl.hidden = false;
  cardEl.classList.remove('in');
  void cardEl.offsetWidth;
  cardEl.classList.add('in');
  audio.cue(id === 'done' ? 'finish' : 'card');
}
function hideCard() {
  card = null;
  cardEl.hidden = true;
  hot.hidden = true;
}
/** Continue: read the next card, or play the step this card introduced. */
function proceed() {
  if (card === null) return;
  const id = STOPS[card];
  if (id === 'done') return showCard(1);
  if (STEPS.some((s) => s.id === id)) {
    pre = null;
    hideCard();
    playing = true;
    return;
  }
  showCard(card + 1);
}
$('.cgo').addEventListener('click', proceed);
// the sound each machine makes as the student works it
const ACT_CUE = {clean: 'dip', etch: 'dip', develop: 'dip', strip: 'dip', oxide: 'slide', expose: 'shutter'};
let busy = false;
let closeOn = false;
hot.addEventListener('click', (e) => {
  e.stopPropagation();
  if (busy || card === null || rec.open) return;
  const id = STOPS[card];
  const act = LESSONS[id].act;
  burstAt(parseFloat(hot.style.left), parseFloat(hot.style.top));
  audio.cue('press');
  if (ACT_CUE[id]) setTimeout(() => audio.cue(ACT_CUE[id]), 180);
  toast(act.ok);
  if (id === 'design' || id === 'gown') return runSequence(id);
  // the card slides away, then the step runs
  busy = true;
  hot.hidden = true;
  cardEl.classList.add('out');
  setTimeout(() => {
    cardEl.classList.remove('out');
    busy = false;
    proceed();
  }, 380);
});
/** The design and gowning stops have no machine step: a short animated sequence plays instead. */
function runSequence(id) {
  busy = true;
  hot.hidden = true;
  cardEl.classList.add('out');
  setTimeout(() => (cardEl.hidden = true), 380);
  const items = id === 'design'
    ? ['Checking line widths: 10 µm', 'Checking gaps: 10 µm', 'Uploading pattern file', 'Mask shop: order received']
    : ['Shoe covers', 'Hood', 'Coverall', 'Face mask', 'Safety glasses', 'Gloves'];
  seqEl.innerHTML = `<div class="ph"><i></i>${id === 'design' ? 'SENDING TO THE MASK SHOP' : 'SUITING UP · TOP TO BOTTOM'}</div>` +
    items.map((t) => `<div class="si"><b></b>${t}</div>`).join('') + `<div class="sbar"><i></i></div>`;
  seqEl.hidden = false;
  const rows = [...seqEl.querySelectorAll('.si')];
  const gap = id === 'design' ? 450 : 380;
  if (id === 'design') audio.cue('send');
  rows.forEach((r, i) =>
    setTimeout(() => {
      r.classList.add('ok');
      seqEl.querySelector('.sbar i').style.width = `${((i + 1) / rows.length) * 100}%`;
      audio.cue(id === 'design' ? 'touch' : 'cloth', i);
    }, 250 + i * gap),
  );
  setTimeout(() => {
    seqEl.hidden = true;
    cardEl.classList.remove('out');
    busy = false;
    toast(id === 'design' ? 'Photomask ordered' : 'Suited up', 'done');
    audio.cue('done');
    const next = card + 1;
    cardEl.hidden = true;
    if (rec.needsQuiz(id)) rec.quiz(id, () => showCard(next));
    else showCard(next);
  }, 450 + rows.length * gap + 500);
}
$('.cback').addEventListener('click', () => showCard(Math.max(0, card - 1)));
$('.calt').addEventListener('click', () => {
  hideCard();
  pre = null;
  startWalking();
});

// ------------------------------------------------------------ controls
ui.btn.ride.addEventListener('click', () => setMode('ride'));
ui.btn.walk.addEventListener('click', () => startWalking());
ui.btn.plan.addEventListener('click', () => setMode('plan'));
for (const id of STATION_ORDER)
  ui.btn[id].addEventListener('click', () => {
    if (rec.open || busy || !rec.signedIn()) return;
    const step = STEPS.find((s) => s.st === id);
    if (mode !== 'walk') setMode('ride');
    showCard(STOPS.indexOf(step ? step.id : id));
    if (mode === 'walk') {
      // stand in front of the tool, facing it
      const st = STATIONS[id];
      let p;
      for (let back = 1.0; back < 2.6; back += 0.15) {
        p = toWorld(st, [0, 0, st.size[1] / 2 + back]);
        if (!blocked(p[0], p[2])) break;
      }
      Object.assign(player, {x: p[0], z: p[2], yaw: st.rot + Math.PI, pitch: -0.3});
      focus = id;
    }
  });
for (const [k] of TOGGLES) ui.btn[k].addEventListener('click', () => (display[k] = !display[k]));
ui.btn.play.addEventListener('click', () => {
  if (rec.open || !rec.signedIn()) return;
  if (card !== null) return actOf(card) ? nudge() : proceed();
  if (u >= U_TOTAL - 1e-3) return showCard(1);
  playing = !playing;
});
for (const b of ui.btn.speed) b.addEventListener('click', () => (speed = b.speed));
{
  const d = document.createElement('div');
  d.className = 'hit';
  Object.assign(d.style, {left: '-8px', top: '-8px', width: `${TL.w + 16}px`, height: '52px'});
  const move = (e) => {
    u = clamp((toStage(e.clientX) - TL.x) / TL.w) * U_TOTAL;
  };
  d.addEventListener('pointerdown', (e) => {
    if (rec.open || busy || !rec.signedIn()) return;
    hideCard();
    pre = null;
    playing = false;
    if (mode === 'plan') setMode('ride');
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    move(e);
  });
  ui.tl.appendChild(d);
}
const MOVE = {w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1};
addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if ((e.target.closest && e.target.closest('input,textarea,select,button')) || rec.open) return;
  const key = e.key.toLowerCase();
  if ((key === 'enter' || key === ' ') && card !== null && document.activeElement !== hot) {
    e.preventDefault();
    return actOf(card) ? nudge() : proceed();
  }
  if (MOVE[key]) {
    keys.add(key);
    if (mode !== 'walk') {
      hideCard();
      pre = null;
      startWalking();
    }
    e.preventDefault();
    return;
  }
  if (key === 'shift') return void keys.add(key);
  const map = {' ': 'play', o: 'plan', r: 'ride', c: 'ceiling', e: 'explode', x: 'xray', f: 'airflow', l: 'labels', n: 'numbers'};
  if (map[key]) ui.btn[map[key]].click();
  else if (/^[1-9]$/.test(key)) ui.btn[STATION_ORDER[+key + 1]].click();
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = {x: e.clientX, y: e.clientY};
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / scale;
  const dy = (e.clientY - drag.y) / scale;
  drag = {x: e.clientX, y: e.clientY};
  if (mode === 'plan') {
    orbit.az -= dx * 0.3;
    orbit.el = clamp(orbit.el + dy * 0.2, -40, 42);
  } else {
    // drag the scene: the view turns the other way, as on a phone
    const o = mode === 'walk' ? player : look;
    o.yaw += dx * 0.004;
    o.pitch = clamp(o.pitch + dy * 0.004, -1.3, 1.3);
  }
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('drag');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (mode === 'plan') orbit.k = clamp(orbit.k * Math.exp(e.deltaY * 0.0012), 0.3, 2.2);
    else look.zoom = clamp(look.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 1.25);
  },
  {passive: false},
);

// ------------------------------------------------------------ the frame
const zoneCentre = Object.fromEntries(ZONES.map((z) => ['z:' + z.id, [(z.x0 + z.x1) / 2, 0.02, (z.z0 + z.z1) / 2]]));
const labelAt = (id) => {
  if (id === 'wafer') return mode === 'ride' ? null : lab.project([state.pos[0], state.pos[1] + (mode === 'plan' ? 0.58 : 0.12), state.pos[2]]);
  if (zoneCentre[id]) return mode === 'plan' ? lab.project(zoneCentre[id]) : null;
  const p = lab.project(lab.labelPoint(id));
  return mode === 'plan' || p.dist < 7 ? p : null;
};
const walk = (dt) => {
  const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  player.yaw += ((keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0)) * 1.8 * dt;
  if (f || r) {
    const v = ((keys.has('shift') ? 3 : 1.5) * dt) / Math.hypot(f, r);
    const dx = (Math.sin(player.yaw) * f - Math.cos(player.yaw) * r) * v;
    const dz = (Math.cos(player.yaw) * f + Math.sin(player.yaw) * r) * v;
    if (!blocked(player.x + dx, player.z + dz)) {
      player.x += dx;
      player.z += dz;
    } else if (!blocked(player.x + dx, player.z)) player.x += dx;
    else if (!blocked(player.x, player.z + dz)) player.z += dz;
  }
  if (focus && Math.hypot(player.x - STATIONS[focus].x, player.z - STATIONS[focus].z) > 2.8) focus = null;
};

let last = performance.now();
const perf = {n: 0, sum: 0};
const frame = (now) => {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  // drop the pixel ratio on a slow GPU
  if (tier < TIERS.length - 1 && T > 1.5) {
    perf.sum += dt;
    if (++perf.n >= 45) {
      if (perf.sum / perf.n > 0.024) {
        tier++;
        fit();
      }
      perf.n = 0;
      perf.sum = 0;
    }
  }
  advance(dt);
  requestAnimationFrame(frame);
};
const advance = (dt) => {
  T += dt;
  rec.tick(dt);
  if (playing) {
    const prev = u;
    u += dt * RATE * speed;
    // a step finished: say so
    const fin = SEGS.find((s) => s.kind === 'step' && prev < s.u1 && u >= s.u1);
    let quizNow = false;
    if (fin) {
      toast(`${LESSONS[fin.step.id].title}: done`, 'done');
      audio.cue('done');
      // the station's quiz before the wafer moves on
      if (rec.needsQuiz(fin.step.id)) {
        quizNow = true;
        u = fin.u1;
        playing = false;
        setTimeout(() => rec.quiz(fin.step.id, () => (playing = true)), 700);
      }
    }
    // stop at the start of the next step and explain it
    const next = SEGS.find((s) => s.kind === 'step' && prev < s.u0 && u >= s.u0);
    if (quizNow);
    else if (next) showCard(STOPS.indexOf(next.step.id));
    else if (u >= U_TOTAL) finish();
  }
  if (mode === 'walk') walk(dt);
  closeOn = card === null && !busy && !rec.open && !!state.stepId && !state.moving && u < U_TOTAL - 1e-6;
  const prevProbe = state.probing;
  state = stateAt(tauOfU(u));
  if (prevProbe < 0.99 && state.probing >= 0.99) audio.cue('touch');
  audio.tick(state, dt, playing);

  // where the camera wants to be
  let pos;
  let target;
  let lag;
  if (mode === 'plan') {
    const az = (PLAN.az + orbit.az + (card === 0 ? 4 * Math.sin(T * 0.25) : 0)) * D2R;
    const el = clamp(PLAN.el + orbit.el, 6, 88) * D2R;
    const d = PLAN.d * orbit.k;
    target = [PLAN.tx, PLAN.ty, PLAN.tz];
    pos = [PLAN.tx + d * Math.cos(el) * Math.sin(az), PLAN.ty + d * Math.sin(el), PLAN.tz + d * Math.cos(el) * Math.cos(az)];
    lag = 0.4;
  } else {
    let yaw;
    let pitch;
    if (mode === 'walk') {
      pos = [player.x, EYE, player.z];
      yaw = player.yaw;
      pitch = player.pitch;
      lag = 0.06;
    } else if (pre) {
      // standing at the design desk or the gowning bench before the first step
      const st = STATIONS[pre];
      const p = toWorld(st, [0, 0, st.size[1] / 2 + (pre === 'design' ? 0.8 : 1.6)]);
      let t = toWorld(st, [0, pre === 'design' ? 1.0 : 0.95, 0]);
      const aw = actWorld();
      if (aw) t = t.map((v, i) => (v + aw[i]) / 2);
      pos = [p[0], EYE, p[2]];
      yaw = Math.atan2(t[0] - p[0], t[2] - p[2]) + look.yaw;
      pitch = clamp(Math.atan2(t[1] - EYE, Math.hypot(t[0] - p[0], t[2] - p[2])) + look.pitch, -1.3, 1.3);
      lag = 0.3;
    } else {
      // the operator's eyes: on the wafer at a tool, down the path while carrying it
      const o = state.operator;
      pos = [o.x, EYE, o.z];
      if (state.moving) {
        yaw = o.yaw;
        pitch = -0.34;
      } else {
        const aw = actWorld();
        const w = aw ? state.pos.map((v, i) => (v + aw[i]) / 2) : state.pos;
        const dx = w[0] - o.x;
        const dz = w[2] - o.z;
        yaw = Math.atan2(dx, dz);
        pitch = Math.atan2(w[1] + 0.12 - EYE, Math.hypot(dx, dz));
      }
      yaw += look.yaw;
      pitch = clamp(pitch + look.pitch, -1.3, 1.3);
      lag = 0.5;
    }
    // while a card covers the bottom of the view, look a little lower so the machine sits above it
    if (mode === 'ride' && (card !== null || closeOn || rec.open)) pitch -= 0.2;
    const d = dirOf(yaw, pitch);
    target = pos.map((v, i) => v + d[i] * 3);
  }
  const k = 1 - Math.exp(-dt / lag);
  for (let i = 0; i < 3; i++) {
    cam.pos[i] += (pos[i] - cam.pos[i]) * k;
    cam.target[i] += (target[i] - cam.target[i]) * k;
  }
  const fov = mode === 'plan' ? FOV.plan : FOV.fp * look.zoom;
  cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt / 0.3));

  const at = mode === 'ride' ? pre || state.station : focus;
  const open = at && OPENS[at] ? at : null;
  lab.update(state, {...display, focus: open, T, fp: mode !== 'plan', hideOperator: mode === 'ride'}, cam, dt);
  ui.update({state, u, mode, focus: at, display, speed, playing, tour: false, labelAt});
  // pin the control to its spot on the machine; at the edge of the view it points the way
  const aw = actWorld();
  let show = false;
  if (aw && mode !== 'plan') {
    const p = lab.project(aw);
    show = p.visible || p.dist < 4;
    if (show) {
      const X = [262, 1248];
      const Y = [96, 572];
      let x = p.visible ? p.x : W - p.x;
      let y = p.visible ? p.y : Y[1];
      const edge = x < X[0] || x > X[1] || y < Y[0] || y > Y[1] || !p.visible;
      x = clamp(x, X[0], X[1]);
      y = clamp(y, Y[0], Y[1]);
      hot.style.left = `${x}px`;
      hot.style.top = `${y}px`;
      hot.classList.toggle('edge', edge);
      hot.classList.toggle('flip', x > 1000);
    }
  }
  hot.hidden = !show || busy;
  closeup.update(state, T, closeOn);
};
rec.showSignIn();
requestAnimationFrame(frame);
window.LIVE = {lab, cam, player, audio, rec, finish, setMode, showCard, proceed, run: (sec) => {
  for (let i = 0; i < sec * 30; i++) advance(1 / 30);
}, get card() {
  return card;
}, get u() {
  return u;
}, set u(v) {
  u = v;
}};
