// The console over the lab, laid out at 1600 x 900. Every figure it shows comes from model.js.
import {REC, SEGS, SOURCES, STATIONS, STATION_ORDER, STEPS, TOTAL, U_TOTAL, ZONES, clock, readouts, resistThk, zoneAir} from './model.js';

export const TOGGLES = [['ceiling', 'CEILING'], ['explode', 'EXPLODE'], ['xray', 'X-RAY'], ['airflow', 'AIRFLOW'], ['labels', 'LABELS'], ['numbers', 'NUMBERS']];
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
export const TL = {x: 318, w: 930};

export function createUI(app) {
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h, parent = ui) => {
    const n = el(h);
    parent.appendChild(n);
    return n;
  };
  const btn = {};

  // ------------------------------------------------------------ title
  add(`<div><div style="position:absolute;left:16px;top:12px;width:3px;height:40px;background:#FF6700"></div><div style="position:absolute;left:28px;top:11px"><div style="font:700 10px Inter,sans-serif;letter-spacing:2.2px;color:#00358E">OPERATION SEMI / MI-CHIPS</div><div style="font-size:23px;font-weight:800;letter-spacing:-.6px;line-height:1;margin-top:5px;color:#0B0F19">Microelectronics Lab Simulation</div></div></div>`);

  // ------------------------------------------------------------ stations
  const left = add(`<div class="cp" style="left:16px;top:66px;width:212px;padding:12px 12px 10px"><div class="ph"><i></i>STATIONS</div></div>`);
  btn.ride = add(`<div class="bt"><em>●</em>BE THE OPERATOR</div>`, left);
  btn.walk = add(`<div class="bt"><em>➜</em>WALK AROUND</div>`, left);
  btn.plan = add(`<div class="bt"><em>◎</em>FLOOR PLAN</div>`, left);
  add(`<div style="height:6px"></div>`, left);
  let nStep = 0;
  for (const id of STATION_ORDER) {
    const hasStep = STEPS.some((s) => s.st === id);
    btn[id] = add(`<div class="bt"><em>${hasStep ? ++nStep : '·'}</em>${STATIONS[id].name.toUpperCase()}<u></u></div>`, left);
  }
  const desc = add(`<div class="desc"></div>`, left);

  // ------------------------------------------------------------ toggles
  const tg = add(`<div class="tg"></div>`);
  for (const [k, label] of TOGGLES) btn[k] = add(`<div class="bt">${label}</div>`, tg);

  // ------------------------------------------------------------ now, cross-section, air
  const right = add(`<div class="cp" style="right:16px;top:56px;width:304px;padding:12px 14px"><div class="ph"><i></i>NOW</div><div class="now"></div><div class="where"></div><div class="rows"></div></div>`);
  const now = right.querySelector('.now');
  const where = right.querySelector('.where');
  const rows = right.querySelector('.rows');
  const xs = add(`<div class="cp" style="right:16px;top:318px;width:304px;padding:12px 14px"><div class="ph"><i></i>WAFER CROSS-SECTION</div><canvas width="552" height="330" style="width:276px;height:165px;display:block"></canvas></div>`);
  const cv = xs.querySelector('canvas');
  const airBox = add(`<div class="cp" style="right:16px;top:544px;width:304px;padding:12px 14px"><div class="ph"><i></i>CLEANROOM AIR</div></div>`);
  {
    let h = `<table class="air"><tr><th>ZONE</th><th>ISO</th><th>FILTERS</th><th>AIR CHG/H</th><th>LIMIT /m³</th></tr>`;
    for (const z of ZONES) {
      const a = zoneAir(z);
      h += `<tr><td>${z.name}</td><td>${z.iso ?? 'none'}</td><td>${a.n}</td><td>${a.n ? Math.round(a.ach) : 'n/a'}</td><td>${a.limit ? a.limit.toLocaleString('en-US') : 'n/a'}</td></tr>`;
    }
    add(h + `</table>`, airBox);
    add(`<div style="font-size:10.5px;color:#53617A;margin-top:7px;line-height:1.4">Filters blow down at ${0.45} m/s. Limit is particles of 0.5 µm and larger.</div>`, airBox);
  }

  // ------------------------------------------------------------ timeline
  const bar = add(`<div class="cp" style="left:16px;right:16px;bottom:14px;height:74px"></div>`);
  btn.play = add(`<div class="bt" style="position:absolute;left:14px;top:14px;width:64px;height:44px;justify-content:center;font-size:16px"></div>`, bar);
  const clk = add(`<div style="position:absolute;left:92px;top:13px;width:196px"><div class="mo" style="font-size:9px;letter-spacing:1.4px;color:#53617A">PROCESS CLOCK</div><div class="mo" style="font-size:21px;font-weight:700;margin-top:2px"></div></div>`, bar);
  const clkV = clk.lastElementChild;
  const tl = add(`<div style="position:absolute;left:${TL.x - 16}px;top:16px;width:${TL.w}px;height:44px"></div>`, bar);
  const fills = SEGS.map((s) => {
    const x = (s.u0 / U_TOTAL) * TL.w;
    const w = ((s.u1 - s.u0) / U_TOTAL) * TL.w;
    const d = add(`<div class="seg ${s.kind}" style="left:${x + 1}px;width:${w - 2}px"><i></i></div>`, tl);
    if (s.kind === 'step') add(`<div class="segl" style="left:${x}px;width:${w}px">${STATIONS[s.step.st].short === 'DEVELOP' && s.step.id === 'strip' ? 'STRIP' : STATIONS[s.step.st].short}</div>`, tl);
    return d.firstElementChild;
  });
  const head = add(`<div style="position:absolute;top:-4px;width:2px;height:30px;background:#0B0F19"></div>`, tl);
  const sp = add(`<div style="position:absolute;right:14px;top:13px;display:flex;gap:4px;align-items:center"><span class="mo" style="font-size:9px;letter-spacing:1.4px;color:#53617A;margin-right:6px">SPEED</span></div>`, bar);
  btn.speed = [0.5, 1, 2, 4].map((v) => Object.assign(add(`<div class="bt" style="margin:0;height:44px;padding:0 11px">${v}×</div>`, sp), {speed: v}));

  // ------------------------------------------------------------ labels and overlays
  const labels = {};
  for (const id of STATION_ORDER) labels[id] = add(`<div class="lab">${STATIONS[id].name.toUpperCase()}</div>`);
  for (const z of ZONES) labels['z:' + z.id] = add(`<div class="lab zone">${z.name.toUpperCase()}${z.iso ? ' · ISO ' + z.iso : ''}</div>`);
  labels.wafer = add(`<div class="lab w">WAFER</div>`);
  const tourChip = add(`<div class="tourchip"></div>`);
  const nums = add(`<div class="cp nums"><div class="ph"><i></i>WHERE EVERY NUMBER COMES FROM</div><div style="font-size:12px;color:#53617A;margin-bottom:10px">Standard: a published standard or textbook constant. Datasheet: a product figure. Typical: common for this kind of tool. Guess: chosen for this model, not measured.</div></div>`);
  {
    let h = '<table>';
    for (const [name, value, kind, src] of SOURCES) h += `<tr><td>${name}</td><td>${value}</td><td><span class="kind ${kind}">${kind}</span></td><td style="color:#53617A">${src}</td></tr>`;
    add(h + '</table>', nums);
  }

  // ------------------------------------------------------------ the cross-section, drawn from the film stack
  const g = cv.getContext('2d');
  function drawSection(L) {
    const Wc = 552;
    const Hc = 330;
    g.clearRect(0, 0, Wc, Hc);
    const x0 = 14;
    const span = 400; // px for 40 um: two lines and two spaces
    const pxUm = span / (2 * (REC.mask.line + REC.mask.space));
    const pxNm = 0.1; // vertical: 100 px per um
    const base = 262;
    g.fillStyle = '#53617A';
    g.fillRect(x0, base, span, 52);
    g.fillStyle = '#FFFFFF';
    g.font = '600 20px Inter, sans-serif';
    g.fillText('Si · 525 µm, cut short', x0 + 10, base + 33);
    const period = REC.mask.line + REC.mask.space;
    const col = (i, open) => {
      const x = x0 + i * pxUm * (open ? 1 : 1);
      return x;
    };
    void col;
    for (let i = 0; i < 4; i++) {
      const open = i % 2 === 1; // the mask's clear spaces: resist is exposed here
      const x = x0 + ((i >> 1) * period + (open ? REC.mask.line : 0)) * pxUm;
      const w = (open ? REC.mask.space : REC.mask.line) * pxUm;
      let y = base;
      const ox = (open ? L.ox - L.etch : L.ox) * pxNm;
      g.fillStyle = '#73C5FB';
      g.fillRect(x, y - ox, w, ox);
      y -= ox;
      const rs = (open ? L.resistWindow : L.resist) * pxNm;
      if (rs > 0.2) {
        g.fillStyle = open && L.doseK > 0 ? `rgb(${Math.round(197 + 40 * L.doseK)},${Math.round(85 + 90 * L.doseK)},${Math.round(58 + 60 * L.doseK)})` : '#c5553a';
        g.fillRect(x, y - rs, w, rs);
        y -= rs;
      }
      const al = L.al * pxNm;
      if (al > 0.2) {
        g.fillStyle = '#A6AFC1';
        g.fillRect(x, y - al, w, al);
        g.strokeStyle = '#0B0F19';
        g.lineWidth = 1.5;
        g.strokeRect(x, y - al, w, al);
      }
    }
    g.strokeStyle = '#0B0F19';
    g.lineWidth = 2;
    g.strokeRect(x0, base, span, 52);
    // the key
    const key = [['#A6AFC1', 'Al', L.al, 'nm'], ['#c5553a', 'resist', L.resist / 1000, 'µm'], ['#73C5FB', 'SiO2', L.ox, 'nm']];
    key.forEach(([c, name, v, unit], i) => {
      const y = 14 + i * 62;
      g.fillStyle = c;
      g.fillRect(430, y, 20, 20);
      g.strokeStyle = '#0B0F19';
      g.lineWidth = 1;
      g.strokeRect(430, y, 20, 20);
      g.fillStyle = '#0B0F19';
      g.font = '600 22px Inter, sans-serif';
      g.fillText(name, 458, y + 18);
      g.font = '600 20px Inter, sans-serif';
      g.fillStyle = '#53617A';
      g.fillText(`${unit === 'nm' ? Math.round(v) : v.toFixed(2)} ${unit}`, 430, y + 44);
    });
    g.fillStyle = '#53617A';
    g.font = '500 19px Inter, sans-serif';
    g.fillText(`10 µm`, x0 + REC.mask.line * pxUm + 10, 22);
    g.fillRect(x0, 14, REC.mask.line * pxUm, 3);
    g.fillText(`height ×${(pxNm * 1000 / pxUm).toFixed(0)}`, 430, 300);
  }
  void resistThk;

  let lastRows = '';
  function update(f) {
    const s = f.state;
    // station buttons
    for (const id of STATION_ORDER) {
      btn[id].classList.toggle('on', f.mode === 'walk' && f.focus === id);
      btn[id].classList.toggle('here', s.station === id);
    }
    for (const m of ['ride', 'walk', 'plan']) btn[m].classList.toggle('on', f.mode === m);
    for (const [k] of TOGGLES) btn[k].classList.toggle('on', !!f.display[k]);
    for (const b of btn.speed) b.classList.toggle('on', b.speed === f.speed);
    btn.play.textContent = f.playing ? '❚❚' : '▶';
    const focus = STATIONS[f.focus];
    const hint = f.mode === 'walk' ? 'W A S D or the arrow keys to walk, Shift to hurry. Drag to look around.' : f.mode === 'plan' ? 'Drag to orbit, scroll to zoom. Pick a station to stand at it.' : 'You are the operator. Drag to look around; press W to walk off on your own.';
    desc.textContent = focus && f.mode !== 'ride' ? focus.desc : f.mode === 'ride' && focus ? `${focus.desc} ${hint}` : hint;
    // now
    now.textContent = s.moving ? 'Carrying the wafer' : `${s.seg.i + 1}. ${s.seg.step.name}`;
    where.textContent = s.moving ? `to ${STATIONS[s.seg.to.st].name}` : STATIONS[s.station].name;
    const h = readouts(s).map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    if (h !== lastRows) {
      rows.innerHTML = h;
      lastRows = h;
    }
    drawSection(s.layers);
    // timeline
    clkV.textContent = `${clock(s.tau)} / ${clock(TOTAL)}`;
    SEGS.forEach((sg, i) => (fills[i].style.width = `${Math.min(1, Math.max(0, (f.u - sg.u0) / (sg.u1 - sg.u0))) * 100}%`));
    head.style.left = `${(f.u / U_TOTAL) * TL.w - 1}px`;
    // labels
    for (const [id, n] of Object.entries(labels)) {
      const p = f.labelAt(id);
      const show = f.display.labels && p && p.visible && p.x > 250 && p.x < 1240 && p.y > 64 && p.y < 800;
      n.style.display = show ? '' : 'none';
      if (show) {
        n.style.left = `${p.x}px`;
        n.style.top = `${p.y}px`;
      }
    }
    nums.classList.toggle('on', !!f.display.numbers);
    if (tourChip.dataset.on !== String(f.tour)) {
      tourChip.dataset.on = String(f.tour);
      tourChip.classList.toggle('on', f.tour);
      tourChip.innerHTML = f.tour ? '<i></i>AUTO TOUR · CLICK ANYWHERE TO TAKE OVER' : '▶ RESUME TOUR';
    }
  }
  return {root: ui, btn, update, tourChip, tl};
}
