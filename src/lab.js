// The lab's geometry, built from code in metres from model.js. update(state, display, cam, dt) poses it.
// Each tool is shaped after the common real form of its kind; the comments name it.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {DOORWAYS, FFU, REC, ROOM, STATIONS, WAFER, WALLS, ZONES, ffuLayout, lerp, sheetR, toWorld} from './model.js';

export const COL = {bg: '#FAFBFD', ground: '#E0E5EC', ink: '#0B0F19', accent: '#FF6700', uv: '#8a5cff', hot: '#ff6a1f'};

export function createLab(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  renderer.setClearColor(COL.bg, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 200);
  // a neutral studio to reflect in the steel and glass
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight('#ffffff', '#cfd6e2', 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 1.7);
  sun.position.set(4, 18, 9);
  sun.target.position.set(7, 0, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 40});
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // the lithography bay runs under yellow light: blue and UV would expose the resist
  const amber = new THREE.PointLight('#ffc21a', 0, 9, 1.2);
  amber.position.set(11.75, 2.3, 2.5);
  scene.add(amber);

  // ------------------------------------------------------------ materials and helpers
  const edgeMat = new THREE.LineBasicMaterial({color: COL.ink, transparent: true, opacity: 0.32});
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.7, metalness: 0, ...o});
  const MAT = {
    pp: mat('#f2f1ec', {roughness: 0.5}), // white polypropylene, the wet-bench plastic
    paint: mat('#d5d9dc', {roughness: 0.55}), // equipment grey powder coat
    beige: mat('#ddd6c6', {roughness: 0.55}),
    blue: mat('#00358E', {roughness: 0.5}),
    steel: mat('#c3c8cd', {roughness: 0.32, metalness: 0.9}),
    black: mat('#1f2226', {roughness: 0.5}),
    rubber: mat('#2e3136', {roughness: 0.9}),
    granite: mat('#3a3c40', {roughness: 0.25, metalness: 0.1}),
    accent: mat(COL.accent, {roughness: 0.6}),
    red: mat('#c8281e', {roughness: 0.45}),
    yellow: mat('#f0c419', {roughness: 0.5}),
    green: mat('#2c8a4f', {roughness: 0.5}),
    copper: mat('#b87333', {roughness: 0.35, metalness: 0.9}),
    glass: mat('#cfe3ea', {transparent: true, opacity: 0.2, roughness: 0.05, depthWrite: false}),
    liquid: mat('#8cc3df', {transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false}),
    quartz: mat('#eef5f7', {transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide}),
    ptfe: mat('#fbfbf7', {transparent: true, opacity: 0.8, roughness: 0.4, depthWrite: false}),
    ldpe: mat('#f4f4ee', {transparent: true, opacity: 0.75, roughness: 0.4}),
    wood: mat('#d9c7a6'),
    amber: mat('#8a4f12', {roughness: 0.3, transparent: true, opacity: 0.85}),
    fabric: mat('#fbfbf8', {roughness: 0.95}),
    chair: mat('#3b4250', {roughness: 0.9}),
  };
  const finish = (m, edges) => {
    m.castShadow = true;
    m.receiveShadow = true;
    if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edgeMat));
    return m;
  };
  /** A box whose bottom centre sits at (x, y, z). r rounds its edges. */
  const box = (parent, w, h, d, x, y, z, m, edges = true, r = 0) => {
    const geo = r ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    const mesh = finish(new THREE.Mesh(geo, m), edges && !r);
    mesh.position.set(x, y + h / 2, z);
    parent.add(mesh);
    return mesh;
  };
  /** A cylinder whose base centre sits at (x, y, z). axis 'y' stands up; 'x' and 'z' lie down, centred on the point. */
  const cyl = (parent, r, h, x, y, z, m, edges = true, open = false, axis = 'y') => {
    const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 36, 1, open), m), edges);
    if (axis === 'y') mesh.position.set(x, y + h / 2, z);
    else {
      mesh.position.set(x, y, z);
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      else mesh.rotation.x = Math.PI / 2;
    }
    parent.add(mesh);
    return mesh;
  };
  /** A flat sign or screen facing local +z, centred on (x, y, z). glow makes it a lit display. */
  const sign = (parent, text, w, h, x, y, z, o = {}) => {
    const {bg = '#ffffff', fg = '#16181b', ry = 0, rx = 0, size = 0.6, glow = false, draw} = o;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = Math.max(16, Math.round((256 * h) / w));
    const c = cv.getContext('2d');
    c.fillStyle = bg;
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = fg;
    const lines = text ? text.split('\n') : [];
    c.font = `700 ${(cv.height * size) / Math.max(1, lines.length)}px "JetBrains Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, 128, (cv.height * (i + 0.5)) / lines.length, 240));
    if (draw) draw(c, cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow ? new THREE.MeshBasicMaterial({map: tex}) : new THREE.MeshStandardMaterial({map: tex, roughness: 0.6}));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    parent.add(m);
    return m;
  };
  const LCD = {bg: '#0c1512', fg: '#5cf2a0', glow: true};
  const LED = {bg: '#1a0b08', fg: '#ff5a3c', glow: true};
  /** A bench: a top slab on four legs. */
  const table = (g, w, h, d, top, leg, thick = 0.06) => {
    box(g, w, thick, d, 0, h - thick, 0, top, true, 0.012);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, h - thick, 0.06, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), leg, false);
    box(g, w - 0.14, 0.04, 0.04, 0, 0.18, -(d / 2 - 0.06), leg, false);
  };
  /** An emergency-off mushroom button on its yellow plate, facing +z. */
  const emo = (g, x, y, z) => {
    cyl(g, 0.034, 0.008, x, y, z, MAT.yellow, false, false, 'z');
    cyl(g, 0.022, 0.03, x, y, z + 0.015, MAT.red, false, false, 'z');
  };
  /** A wash bottle with a coloured cap. */
  const bottle = (g, x, y, z, cap) => {
    cyl(g, 0.032, 0.14, x, y, z, MAT.ldpe, false);
    cyl(g, 0.014, 0.03, x, y + 0.14, z, cap, false);
  };

  // ------------------------------------------------------------ floor
  {
    const cv = document.createElement('canvas');
    const S = 96;
    cv.width = ROOM.W * S;
    cv.height = ROOM.D * S;
    const g = cv.getContext('2d');
    const tint = {design: '#d3dbe8', gown: '#E3EDFC', main: '#F1F4F8', litho: '#efe3a6', test: '#F1F4F8'};
    for (const z of ZONES) {
      g.fillStyle = tint[z.id];
      g.fillRect(z.x0 * S, z.z0 * S, (z.x1 - z.x0) * S, (z.z1 - z.z0) * S);
      if (!z.iso) continue;
      // 0.6 m raised-floor tiles, perforated
      g.strokeStyle = 'rgba(83,97,122,.22)';
      g.lineWidth = 1.5;
      g.fillStyle = 'rgba(83,97,122,.12)';
      for (let x = z.x0; x < z.x1 - 1e-6; x += 0.6)
        for (let y = z.z0; y < z.z1 - 1e-6; y += 0.6) {
          g.strokeRect(x * S, y * S, 0.6 * S, 0.6 * S);
          for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) g.fillRect((x + i * 0.1) * S - 1.5, (y + j * 0.1) * S - 1.5, 3, 3);
        }
    }
    // the sticky mat inside the gowning room door
    g.fillStyle = '#00358E';
    g.fillRect(1.05 * S, 4.15 * S, 0.9 * S, 0.6 * S);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D), new THREE.MeshStandardMaterial({map: tex, roughness: 0.6}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM.W / 2, 0, ROOM.D / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({color: COL.ground, roughness: 1}));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ROOM.W / 2, -0.02, ROOM.D / 2);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ------------------------------------------------------------ walls: cut low for the floor plan, full height on foot
  const walls = [];
  const lintels = new THREE.Group();
  scene.add(lintels);
  {
    const t = ROOM.wall;
    const wallMat = mat('#F7F9FC', {roughness: 0.6});
    const capMat = mat(COL.ink);
    for (const [x0, z0, x1, z1] of WALLS) {
      const w = Math.abs(x1 - x0) + t;
      const d = Math.abs(z1 - z0) + t;
      const geo = new THREE.BoxGeometry(w, ROOM.H, d);
      geo.translate(0, ROOM.H / 2, 0);
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      m.receiveShadow = true;
      const cap = box(scene, w, 0.012, d, (x0 + x1) / 2, ROOM.cut, (z0 + z1) / 2, capMat, false);
      cap.castShadow = false;
      // a grey kick strip so the white walls read at eye level
      const along = w > d;
      for (const s of [-1, 1]) {
        const k = box(scene, along ? w : 0.006, 0.1, along ? 0.006 : d, (x0 + x1) / 2 + (along ? 0 : s * (t / 2 + 0.003)), 0, (z0 + z1) / 2 + (along ? s * (t / 2 + 0.003) : 0), MAT.paint, false);
        k.castShadow = false;
      }
      scene.add(m);
      walls.push({m, cap});
    }
    for (const [x0, z0, x1, z1] of DOORWAYS) {
      const w = Math.abs(x1 - x0) + t;
      const d = Math.abs(z1 - z0) + t;
      box(lintels, w, ROOM.H - 2.1, d, (x0 + x1) / 2, 2.1, (z0 + z1) / 2, wallMat, false).castShadow = false;
    }
    // the outside door to the design office stays shut
    box(lintels, 0.05, 2.1, 1.0, 0, 0, 2, MAT.paint, false).castShadow = false;
    // door signs
    sign(lintels, 'GOWNING · ISO 7', 0.8, 0.14, 1.5, 2.3, 3.94, {ry: Math.PI});
    sign(lintels, 'PROCESS BAY · ISO 6', 0.9, 0.14, 2.94, 2.3, 6.1, {ry: -Math.PI / 2});
    sign(lintels, 'LITHOGRAPHY · ISO 5\nYELLOW LIGHT ONLY', 0.9, 0.28, 9.44, 2.38, 2.5, {ry: -Math.PI / 2, bg: '#f0c419'});
    sign(lintels, 'TEST BAY · ISO 6', 0.76, 0.14, 9.44, 2.3, 6.3, {ry: -Math.PI / 2});
  }
  // room safety: shower and eyewash, extinguisher, nitrogen cylinders
  {
    const g = new THREE.Group();
    scene.add(g);
    cyl(g, 0.02, 2.2, 3.22, 0, 3.6, MAT.yellow, false);
    cyl(g, 0.02, 0.5, 3.45, 2.2, 3.6, MAT.yellow, false, false, 'x');
    cyl(g, 0.11, 0.03, 3.68, 2.15, 3.6, MAT.yellow, false);
    cyl(g, 0.13, 0.05, 3.3, 1.0, 3.25, MAT.yellow, false);
    sign(g, 'SAFETY SHOWER\nEYEWASH', 0.4, 0.2, 3.06, 1.7, 3.4, {ry: Math.PI / 2, bg: '#2c8a4f', fg: '#ffffff'});
    cyl(g, 0.07, 0.5, 3.2, 0.3, 4.6, MAT.red, false);
    for (const z of [7.45, 7.7]) {
      cyl(g, 0.115, 1.45, 9.25, 0, z, MAT.paint, false);
      cyl(g, 0.03, 0.12, 9.25, 1.45, z, MAT.steel, false);
    }
    box(g, 0.06, 0.04, 0.6, 9.36, 1.0, 7.575, MAT.black, false);
    sign(g, 'N2', 0.16, 0.12, 9.13, 0.9, 7.45, {ry: -Math.PI / 2, bg: '#1f2226', fg: '#ffffff'});
  }

  // ------------------------------------------------------------ ceiling: tiles and fan filter units from the model
  const ceil = new THREE.Group();
  scene.add(ceil);
  const ffus = [];
  const tiles = [];
  {
    const face = mat('#dfe9ee', {roughness: 0.5});
    const light = new THREE.MeshBasicMaterial({color: '#ffffff'});
    const lightAmber = new THREE.MeshBasicMaterial({color: '#ffcf33'});
    for (const z of ZONES) {
      const lit = z.id === 'litho';
      const tile = mat(lit ? '#f3e7b0' : '#f4f3ee', {transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false});
      tiles.push(tile);
      const W = z.x1 - z.x0;
      const D = z.z1 - z.z0;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W, D), tile);
      p.rotation.x = -Math.PI / 2;
      p.position.set((z.x0 + z.x1) / 2, ROOM.H, (z.z0 + z.z1) / 2);
      ceil.add(p);
      const list = ffuLayout(z);
      for (const [x, zz] of list) {
        const b = box(ceil, FFU.w, FFU.h, FFU.d, x, ROOM.H, zz, MAT.pp);
        b.castShadow = false;
        box(ceil, FFU.w - 0.06, 0.014, FFU.d - 0.06, x, ROOM.H - 0.014, zz, face, false).castShadow = false;
        ffus.push([x, zz]);
      }
      // light strips between the filters
      const n = Math.max(1, Math.round(D / 2));
      for (let i = 0; i < n; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, 0.08), lit ? lightAmber : light);
        s.rotation.x = Math.PI / 2;
        s.position.set((z.x0 + z.x1) / 2, ROOM.H - 0.02, z.z0 + ((i + 0.5) * D) / n + 0.42);
        ceil.add(s);
      }
    }
  }
  // down-flow streaks: 6 under each unit, falling at the real face velocity
  const STREAKS = 6;
  const air = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.22, 0.012), new THREE.MeshBasicMaterial({color: '#5aa7d6', transparent: true, opacity: 0.7}), ffus.length * STREAKS);
  air.frustumCulled = false;
  scene.add(air);
  const dummy = new THREE.Object3D();

  // ------------------------------------------------------------ stations
  const shells = {};
  const parts = {};
  const station = (id, build) => {
    const st = STATIONS[id];
    const g = new THREE.Group();
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.rot;
    const shell = new THREE.Group();
    g.add(shell);
    const sm = {pp: MAT.pp.clone(), paint: MAT.paint.clone(), steel: MAT.steel.clone(), glass: MAT.glass.clone()};
    for (const m of Object.values(sm)) m.userData.base = m.opacity;
    shells[id] = {group: shell, mats: Object.values(sm), k: 0};
    build(g, shell, sm);
    scene.add(g);
  };
  /** The top of a fume hood or wet bench: lit canopy, glass sides and a sash, all in the shell. */
  const hood = (shell, sm, w, d, deck) => {
    box(shell, w, 0.24, d, 0, 1.95, 0, sm.pp, true, 0.015);
    box(shell, 0.03, 1.95 - deck, d, -w / 2 + 0.015, deck, 0, sm.glass, false);
    box(shell, 0.03, 1.95 - deck, d, w / 2 - 0.015, deck, 0, sm.glass, false);
    box(shell, w, 0.45, 0.012, 0, 1.5, d / 2 - 0.02, sm.glass, false);
    box(shell, w, 0.03, 0.03, 0, 1.49, d / 2 - 0.02, sm.steel, false);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 0.1), new THREE.MeshBasicMaterial({color: '#fffbe8'}));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 1.945, 0.05);
    shell.add(lamp);
  };
  /** The body of a polypropylene wet bench: cabinet doors, kick plate, control fascia, exhaust plenum. */
  const wetBody = (g, w, d, deck) => {
    box(g, w, deck, d, 0, 0, 0, MAT.pp, true, 0.01);
    box(g, w, 0.1, 0.012, 0, 0, d / 2 + 0.002, MAT.rubber, false);
    for (let i = 0; i < 3; i++) {
      box(g, w / 3 - 0.03, deck - 0.3, 0.012, (i - 1) * (w / 3), 0.13, d / 2 + 0.003, MAT.pp, true);
      box(g, 0.02, 0.1, 0.02, (i - 1) * (w / 3) + w / 6 - 0.06, 0.35, d / 2 + 0.016, MAT.steel, false);
    }
    box(g, w, 0.11, 0.03, 0, deck - 0.13, d / 2 + 0.012, MAT.paint, false);
    emo(g, w / 2 - 0.1, deck - 0.075, d / 2 + 0.03);
    // rim round the deck and the exhaust plenum behind it
    box(g, w, 0.035, 0.03, 0, deck, d / 2 - 0.015, MAT.pp, false);
    box(g, w, 1.2, 0.06, 0, deck, -d / 2 + 0.03, MAT.pp, true);
    for (let i = 0; i < 7; i++) box(g, w - 0.3, 0.012, 0.004, 0, deck + 0.08 + i * 0.035, -d / 2 + 0.062, MAT.rubber, false).castShadow = false;
  };
  /** A heated bath: tank, liquid, steel frame, its controller on the fascia. */
  const bath = (g, x, deck, d, label, tankMat, temp) => {
    box(g, 0.3, 0.25, 0.3, x, deck, 0, tankMat, true).castShadow = false;
    box(g, 0.27, 0.19, 0.27, x, deck + 0.01, 0, MAT.liquid, false).castShadow = false;
    box(g, 0.34, 0.012, 0.34, x, deck, 0, MAT.steel, false);
    sign(g, label, 0.26, 0.07, x, deck + 0.42, -d / 2 + 0.064, {bg: '#16181b', fg: '#ffffff'});
    if (temp) sign(g, temp, 0.12, 0.05, x, deck - 0.075, d / 2 + 0.029, LED);
  };
  const faucet = (g, x, deck, z) => {
    cyl(g, 0.012, 0.26, x, deck, z, MAT.steel, false);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), MAT.steel);
    arc.position.set(x, deck + 0.26, z + 0.06);
    arc.rotation.y = Math.PI / 2;
    g.add(arc);
  };

  // an office desk with a CAD workstation
  station('design', (g) => {
    table(g, 1.6, 0.74, 0.8, MAT.wood, MAT.black, 0.04);
    box(g, 0.2, 0.42, 0.45, 0.95, 0, 0, MAT.black, true, 0.01);
    box(g, 0.22, 0.012, 0.16, 0, 0.74, -0.2, MAT.black, false);
    box(g, 0.04, 0.14, 0.03, 0, 0.75, -0.2, MAT.black, false);
    box(g, 0.66, 0.4, 0.025, 0, 0.87, -0.2, MAT.black, true, 0.008);
    // the screen shows the mask: lines and spaces at the model's pitch
    sign(g, '', 0.62, 0.36, 0, 1.07, -0.186, {bg: '#10151b', glow: true, draw: (c, w, h) => {
      c.fillStyle = COL.accent;
      for (let i = 0; i < 9; i++) c.fillRect(24 + i * 24, h * 0.14, 12, h * 0.62);
      c.fillStyle = '#8fa3b8';
      c.font = '600 11px monospace';
      c.textAlign = 'left';
      c.fillText(`MASK 1 · ${REC.mask.line} um LINE / ${REC.mask.space} um SPACE`, 24, h * 0.9);
    }});
    box(g, 0.44, 0.016, 0.14, -0.05, 0.74, 0.12, MAT.black, true, 0.006);
    box(g, 0.06, 0.03, 0.1, 0.32, 0.74, 0.12, MAT.black, false, 0.012);
    // a task chair
    cyl(g, 0.28, 0.03, 0, 0.04, 0.85, MAT.black, false);
    cyl(g, 0.03, 0.4, 0, 0.06, 0.85, MAT.steel, false);
    box(g, 0.46, 0.07, 0.44, 0, 0.45, 0.85, MAT.chair, false, 0.03);
    box(g, 0.42, 0.5, 0.06, 0, 0.58, 1.08, MAT.chair, false, 0.03);
  });
  // a gowning bench with the garment rack and supply shelves
  station('gown', (g) => {
    table(g, 1.4, 0.45, 0.4, MAT.steel, MAT.steel, 0.03);
    cyl(g, 0.012, 1.3, -0.15, 1.72, -0.16, MAT.steel, false, false, 'x');
    for (let i = 0; i < 5; i++) {
      const suit = finish(new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.75, 4, 12), MAT.fabric), false);
      suit.position.set(-0.7 + i * 0.26, 1.2, -0.14);
      suit.scale.z = 0.45;
      g.add(suit);
    }
    for (let i = 0; i < 3; i++) {
      box(g, 0.5, 0.02, 0.26, 1.05, 0.5 + i * 0.4, -0.1, MAT.steel, false);
      box(g, 0.2, 0.16, 0.22, 0.93, 0.52 + i * 0.4, -0.1, MAT.blue, false, 0.01);
      box(g, 0.2, 0.16, 0.22, 1.17, 0.52 + i * 0.4, -0.1, MAT.pp, false, 0.01);
    }
    sign(g, 'BOOTIES · HOOD · COVERALL · GLOVES', 1.1, 0.1, -0.15, 1.95, -0.2, {bg: '#00358E', fg: '#ffffff'});
  });
  // a polypropylene wet station: two heated quartz baths and a rinse sink under a lit canopy
  station('wet', (g, sh, sm) => {
    wetBody(g, 1.8, 0.9, 0.75);
    bath(g, -0.4, 0.75, 0.9, 'SC-1', MAT.quartz, `${REC.clean.T}°C`);
    bath(g, 0.4, 0.75, 0.9, 'SC-2', MAT.quartz, `${REC.clean.T}°C`);
    box(g, 0.26, 0.012, 0.3, 0, 0.75, 0.02, MAT.rubber, false);
    faucet(g, 0, 0.75, -0.26);
    sign(g, 'DI RINSE', 0.2, 0.06, 0, 1.17, -0.386, {bg: '#00358E', fg: '#ffffff'});
    hood(sh, sm, 1.8, 0.9, 0.75);
  });
  // a horizontal three-tube furnace stack: load station on the left, tubes in the cabinet, gas panel on the right
  station('furnace', (g, sh, sm) => {
    box(g, 2.0, 0.7, 0.8, 0.3, 0, 0, MAT.paint, true, 0.01);
    for (let i = 0; i < 6; i++) box(g, 0.5, 0.014, 0.004, 0.9, 0.2 + i * 0.05, 0.402, MAT.rubber, false).castShadow = false;
    box(g, 0.6, 1.1, 0.8, -1.0, 0, 0, MAT.paint, true, 0.01);
    box(g, 0.6, 0.9, 0.04, -1.0, 1.1, -0.38, MAT.paint, false);
    // the cabinet around the hot zone, with an access panel for each tube: the shell
    box(sh, 2.0, 1.0, 0.8, 0.3, 0.7, 0, sm.paint, true, 0.012);
    for (let i = 0; i < 3; i++) box(sh, 1.5, 0.2, 0.012, 0.5, 0.86 + i * 0.25, 0.402, sm.paint, true);
    box(sh, 2.0, 0.05, 0.006, 0.3, 0.74, 0.404, MAT.blue, false).castShadow = false;
    sign(sh, `TUBE 2 · WET OX\n${REC.ox.T}°C`, 0.3, 0.16, -0.5, 1.5, 0.41, LED);
    emo(sh, -0.5, 1.3, 0.405);
    box(sh, 0.6, 0.14, 0.8, -1.0, 1.95, 0, sm.pp, true, 0.012);
    // three quartz tubes, 180 mm outside diameter, along the tool's x. The middle one is ours.
    parts.coilMat = mat('#6b4a3a', {emissive: COL.hot, emissiveIntensity: 0, roughness: 0.6});
    const idle = mat('#6b4a3a', {emissive: COL.hot, emissiveIntensity: 0.15, roughness: 0.6});
    for (const [i, y] of [0.95, 1.2, 1.45].entries()) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.8, 36, 1, true), MAT.quartz);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0.35, y, 0);
      g.add(tube);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 10, 36), MAT.steel);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(-0.56, y, 0);
      g.add(ring);
      for (let k = 0; k < 12; k++) {
        const c = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.01, 8, 32), i === 1 ? parts.coilMat : idle);
        c.rotation.y = Math.PI / 2;
        c.position.set(-0.3 + k * 0.118, y, 0);
        g.add(c);
      }
    }
    for (const x of [-0.62, 1.25]) box(g, 0.05, 0.98, 0.5, x, 0.71, 0, MAT.steel, false);
    // the gas panel: a steam bubbler flask and its lines
    const flask = finish(new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), MAT.quartz), false);
    flask.position.set(1.16, 0.83, 0.26);
    g.add(flask);
    cyl(g, 0.008, 0.42, 1.16, 0.9, 0.26, MAT.steel, false);
    // the quartz boat on its paddle
    parts.boat = box(g, 0.14, 0.02, 0.09, -1.0, 1.125, 0, MAT.quartz);
    parts.boat.castShadow = false;
    parts.paddle = cyl(g, 0.012, 0.5, -1.3, 1.12, 0, MAT.black, false, false, 'x');
  });
  // a benchtop spin coater in a fume hood: bowl, vacuum chuck, hinged clear lid, keypad
  station('spin', (g, sh, sm) => {
    wetBody(g, 1.2, 0.75, 0.85);
    const bowlMat = MAT.pp.clone();
    bowlMat.side = THREE.DoubleSide;
    const bowl = finish(new THREE.Mesh(new THREE.LatheGeometry([[0.19, 0], [0.19, 0.12], [0.15, 0.12], [0.15, 0.02], [0.045, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 40), bowlMat), false);
    bowl.position.set(0, 0.85, 0);
    g.add(bowl);
    parts.chuck = cyl(g, 0.04, 0.1, 0, 0.85, 0, MAT.black, false);
    const lid = finish(new THREE.Mesh(new THREE.SphereGeometry(0.19, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), sm.glass), false);
    lid.position.set(0, 0.86, 0);
    lid.castShadow = false;
    sh.add(lid);
    box(g, 0.2, 0.07, 0.14, 0.34, 0.85, 0.2, MAT.paint, true, 0.01);
    sign(g, `${REC.resist.rpm} RPM\n${REC.resist.spin} s`, 0.14, 0.07, 0.34, 0.922, 0.2, {...LCD, rx: -Math.PI / 2});
    cyl(g, 0.035, 0.17, -0.4, 0.85, -0.15, MAT.amber, false);
    cyl(g, 0.014, 0.03, -0.4, 1.02, -0.15, MAT.black, false);
    sign(g, 'S1813', 0.06, 0.05, -0.4, 0.93, -0.114, {});
    cyl(g, 0.01, 0.3, 0.25, 0.86, -0.25, MAT.rubber, false, false, 'x');
    hood(sh, sm, 1.2, 0.75, 0.85);
  });
  // a digital hot plate in the same style of hood
  station('bake', (g, sh, sm) => {
    wetBody(g, 1.0, 0.75, 0.85);
    box(g, 0.28, 0.07, 0.36, 0, 0.85, 0.02, MAT.paint, true, 0.012);
    parts.plateMat = mat('#e9e6df', {emissive: COL.hot, emissiveIntensity: 0, roughness: 0.4});
    box(g, 0.22, 0.012, 0.22, 0, 0.92, -0.02, parts.plateMat, false);
    sign(g, `${REC.resist.bakeT}°C`, 0.09, 0.035, -0.05, 0.895, 0.201, LED);
    cyl(g, 0.014, 0.02, 0.07, 0.895, 0.205, MAT.black, false, false, 'z');
    box(g, 0.1, 0.06, 0.03, 0.3, 0.85, 0.1, MAT.black, false, 0.008);
    hood(sh, sm, 1.0, 0.75, 0.85);
  });
  // a manual contact mask aligner on a vibration table: stage with micrometers, split-field microscope, lamp house
  station('align', (g, sh, sm) => {
    table(g, 1.2, 0.75, 1.0, MAT.granite, MAT.black, 0.1);
    box(g, 0.45, 0.4, 0.5, -0.25, 0, 0.1, MAT.paint, true, 0.01); // lamp power supply under the table
    sign(g, '350 W Hg', 0.2, 0.06, -0.25, 0.3, 0.352, LCD);
    box(g, 0.7, 0.2, 0.6, 0, 0.75, 0, MAT.beige, true, 0.015);
    for (let i = 0; i < 5; i++) cyl(g, 0.014, 0.012, -0.24 + i * 0.07, 0.83, 0.303, [MAT.green, MAT.yellow, MAT.red, MAT.black, MAT.black][i], false, false, 'z');
    sign(g, 'CONTACT\n10.0 s', 0.14, 0.07, 0.22, 0.86, 0.302, LCD);
    cyl(g, 0.07, 0.04, 0, 0.95, 0, MAT.black, false);
    // x, y and theta micrometers on the stage
    cyl(g, 0.012, 0.1, 0.14, 0.965, 0, MAT.steel, false, false, 'x');
    cyl(g, 0.012, 0.1, 0, 0.965, 0.14, MAT.steel, false, false, 'z');
    cyl(g, 0.012, 0.1, -0.14, 0.965, 0.05, MAT.steel, false, false, 'x');
    // the column and the microscope bridge behind the stage
    box(g, 0.16, 0.95, 0.16, 0, 0.95, -0.38, MAT.beige, true, 0.012);
    box(g, 0.34, 0.07, 0.1, 0, 1.2, -0.25, MAT.black, false, 0.01);
    for (const s of [-1, 1]) {
      const obj = cyl(g, 0.018, 0.1, s * 0.07, 1.13, -0.2, MAT.steel, false);
      obj.rotation.x = 0.35;
      const eye = cyl(g, 0.016, 0.14, 0, 0, 0, MAT.black, false);
      eye.rotation.x = 0.9;
      eye.position.set(s * 0.035, 1.33, -0.14);
    }
    // the mask in its holder: drops into contact for the exposure
    parts.mask = new THREE.Group();
    box(parts.mask, 0.2, 0.012, 0.2, 0, 0, 0, MAT.black);
    box(parts.mask, 0.15, 0.004, 0.15, 0, 0.012, 0, mat('#5a3d2a', {transparent: true, opacity: 0.7, roughness: 0.1}), false);
    g.add(parts.mask);
    // the exposure head over the stage: the shell. The lamp house with its cooling fins sits behind.
    box(sh, 0.5, 0.36, 0.55, 0, 1.4, -0.12, sm.paint, true, 0.015);
    box(g, 0.24, 0.5, 0.22, 0.38, 0.75, -0.36, MAT.black, true, 0.01);
    for (let i = 0; i < 7; i++) box(g, 0.26, 0.008, 0.24, 0.38, 0.82 + i * 0.06, -0.36, MAT.black, false);
    sign(g, 'UV', 0.1, 0.07, 0.38, 1.05, -0.248, {bg: '#f0c419'});
    parts.uv = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 32, 1, true), new THREE.MeshBasicMaterial({color: COL.uv, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false}));
    parts.uv.position.set(0, 1.21, 0);
    g.add(parts.uv);
  });
  // a solvent hood: developer and strip dishes, wash bottles, a timer
  station('develop', (g, sh, sm) => {
    wetBody(g, 1.5, 0.8, 0.85);
    for (const x of [-0.3, 0.3]) {
      cyl(g, 0.085, 0.04, x, 0.85, 0, MAT.quartz, false).castShadow = false;
      cyl(g, 0.078, 0.025, x, 0.855, 0, MAT.liquid, false).castShadow = false;
    }
    sign(g, 'MF-319 DEVELOPER', 0.3, 0.06, -0.3, 1.27, -0.336, {bg: '#16181b', fg: '#ffffff'});
    sign(g, 'ACETONE STRIP', 0.3, 0.06, 0.3, 1.27, -0.336, {bg: '#c8281e', fg: '#ffffff'});
    bottle(g, -0.62, 0.85, -0.2, MAT.red);
    bottle(g, -0.54, 0.85, -0.24, MAT.blue);
    bottle(g, 0.6, 0.85, -0.22, MAT.pp);
    box(g, 0.09, 0.03, 0.07, 0, 0.85, 0.2, MAT.black, false, 0.008);
    sign(g, '60', 0.06, 0.04, 0, 0.881, 0.2, {...LCD, rx: -Math.PI / 2});
    box(g, 0.2, 0.09, 0.12, 0.05, 0.85, -0.22, MAT.pp, false, 0.01); // wipes
    hood(sh, sm, 1.5, 0.8, 0.85);
  });
  // an acid wet bench for buffered oxide etch: plastic tanks, never glass, with its HF warning
  station('etch', (g, sh, sm) => {
    wetBody(g, 1.8, 0.9, 0.75);
    bath(g, 0, 0.75, 0.9, 'BOE 6:1', MAT.ptfe, null);
    bath(g, 0.55, 0.75, 0.9, 'DI RINSE', MAT.ptfe, null);
    sign(g, 'DANGER\nHYDROFLUORIC ACID', 0.5, 0.2, -0.55, 1.5, -0.386, {bg: '#f0c419', fg: '#16181b'});
    bottle(g, -0.62, 0.75, -0.2, MAT.pp);
    box(g, 0.14, 0.05, 0.1, -0.5, 0.75, 0.2, MAT.blue, false, 0.01); // calcium gluconate kit
    faucet(g, 0.3, 0.75, -0.28);
    hood(sh, sm, 1.8, 0.9, 0.75);
  });
  // a bell-jar thermal evaporator: cabinet with the pumps, the jar on its base plate, a hoist, an instrument rack
  station('evap', (g, sh, sm) => {
    box(g, 1.0, 0.9, 1.0, 0, 0, 0, MAT.paint, true, 0.012);
    box(g, 0.56, 0.6, 0.012, -0.16, 0.14, 0.502, MAT.paint, true);
    cyl(g, 0.34, 0.03, 0, 0.9, 0, MAT.steel, false);
    // the vacuum jar with its viewport: the shell
    cyl(sh, 0.3, 0.6, 0, 0.93, 0, sm.steel, false);
    const dome = finish(new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), sm.steel), false);
    dome.scale.y = 0.35;
    dome.position.set(0, 1.53, 0);
    sh.add(dome);
    cyl(sh, 0.075, 0.03, 0, 1.25, 0.298, sm.glass, false, false, 'z');
    // hoist
    box(g, 0.06, 1.05, 0.06, -0.42, 0.9, -0.42, MAT.steel, false);
    const arm = box(g, 0.6, 0.05, 0.05, -0.2, 1.9, -0.2, MAT.steel, false);
    arm.rotation.y = -Math.PI / 4;
    // source: a boat between two copper posts
    for (const s of [-1, 1]) cyl(g, 0.012, 0.06, s * 0.05, 0.93, 0, MAT.copper, false);
    parts.crucibleMat = mat('#5a5148', {emissive: COL.hot, emissiveIntensity: 0});
    box(g, 0.1, 0.012, 0.03, 0, 0.972, 0, parts.crucibleMat, false);
    // the wafer holder and the crystal monitor beside it
    cyl(g, 0.085, 0.012, 0, 1.43, 0, MAT.steel, false);
    cyl(g, 0.008, 0.2, 0, 1.44, 0, MAT.steel, false);
    cyl(g, 0.02, 0.03, 0.14, 1.36, 0, MAT.copper, false);
    parts.vapour = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.44, 32, 1, true), new THREE.MeshBasicMaterial({color: '#9fb4c8', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false}));
    parts.vapour.rotation.x = Math.PI;
    parts.vapour.position.set(0, 1.2, 0);
    g.add(parts.vapour);
    // instrument rack: deposition controller, vacuum gauge, source power
    box(g, 0.3, 0.6, 0.26, 0.33, 0.9, -0.34, MAT.black, true, 0.01);
    sign(g, `${REC.al.rate} nm/s\n${REC.al.target} nm`, 0.22, 0.12, 0.33, 1.38, -0.208, LCD);
    sign(g, '2E-6 Torr', 0.22, 0.07, 0.33, 1.22, -0.208, LED);
    for (let i = 0; i < 3; i++) cyl(g, 0.02, 0.02, 0.25 + i * 0.08, 1.05, -0.2, MAT.paint, false, false, 'z');
    emo(g, 0.38, 0.75, 0.505);
  });
  // a manual probe station: isolation table, platen and chuck, stereo microscope on a boom, four manipulators, analyser
  station('probe', (g, sh, sm) => {
    table(g, 1.4, 0.75, 0.8, MAT.granite, MAT.black, 0.08);
    box(g, 0.5, 0.12, 0.5, 0, 0.75, 0, MAT.steel, true, 0.01);
    cyl(g, 0.07, 0.08, 0, 0.87, 0, MAT.black, false);
    cyl(g, 0.025, 0.75, 0, 0.87, -0.22, MAT.steel, false);
    box(g, 0.06, 0.05, 0.3, 0, 1.45, -0.09, MAT.black, false, 0.01);
    // the microscope head: the shell
    box(sh, 0.16, 0.14, 0.2, 0, 1.3, 0.02, sm.pp, true, 0.02);
    cyl(sh, 0.03, 0.1, 0, 1.2, 0.02, sm.steel, false);
    const ringLight = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 24), new THREE.MeshBasicMaterial({color: '#fffbe8'}));
    ringLight.rotation.x = Math.PI / 2;
    ringLight.position.set(0, 1.195, 0.02);
    sh.add(ringLight);
    for (const s of [-1, 1]) {
      const eye = cyl(sh, 0.016, 0.12, 0, 0, 0, MAT.black, false);
      eye.rotation.x = 0.8;
      eye.position.set(s * 0.035, 1.47, 0.1);
    }
    // four micromanipulators on magnetic bases
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(g, 0.07, 0.07, 0.08, sx * 0.17, 0.87, sz * 0.05, MAT.black, false, 0.008);
      cyl(g, 0.01, 0.03, sx * 0.215, 0.905, sz * 0.05, MAT.steel, false, false, 'x');
      cyl(g, 0.01, 0.03, sx * 0.17, 0.94, sz * 0.05, MAT.steel, false);
    }
    // the needles: 1 mm apart at the tips, lowered by the model
    parts.probes = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      const tip = new THREE.Vector3((i - 1.5) * 0.001, 0, 0);
      const base = new THREE.Vector3(side * 0.135, 0.045, i % 2 ? 0.05 : -0.05);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0004, base.distanceTo(tip), 8), MAT.steel);
      n.position.copy(base).add(tip).multiplyScalar(0.5);
      n.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), base.clone().sub(tip).normalize());
      parts.probes.add(n);
    }
    g.add(parts.probes);
    // the source-measure unit and its screen: the reading the model predicts
    box(g, 0.4, 0.2, 0.36, 0.48, 0.75, -0.12, MAT.beige, true, 0.012);
    sign(g, `Rs ${sheetR(REC.al.target).toFixed(4)} Ω/sq\nI ${REC.probe.I * 1000} mA`, 0.24, 0.13, 0.42, 0.855, 0.062, LCD);
    for (let i = 0; i < 2; i++) cyl(g, 0.02, 0.02, 0.61, 0.82 + i * 0.07, 0.066, MAT.black, false, false, 'z');
    sign(g, '4-POINT PROBE', 0.3, 0.05, -0.45, 0.752, 0.2, {rx: -Math.PI / 2, bg: '#16181b', fg: '#ffffff'});
  });

  // ------------------------------------------------------------ the wafer, its tweezers, its marker and the operator
  const wafer = new THREE.Group();
  const waferMat = mat('#8f969d', {roughness: 0.18, metalness: 0.7});
  {
    const r = WAFER.d / 2;
    const a = Math.asin(WAFER.flat / 2 / r);
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r, -Math.PI / 2 + a, -Math.PI / 2 - a + 2 * Math.PI, false);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, {depth: WAFER.t, bevelEnabled: false, curveSegments: 48});
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -WAFER.t / 2, 0);
    parts.disc = finish(new THREE.Mesh(geo, waferMat), true);
    wafer.add(parts.disc);
  }
  scene.add(wafer);
  const tweezers = new THREE.Group();
  for (const s of [-1, 1]) {
    const t = box(tweezers, 0.006, 0.002, 0.16, 0, s * 0.002, 0.11, MAT.steel, false);
    t.castShadow = false;
  }
  scene.add(tweezers);
  const pin = new THREE.Group();
  {
    const m = new THREE.MeshBasicMaterial({color: COL.accent});
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 6), m);
    stem.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), m);
    head.position.y = 0.5;
    pin.add(stem, head);
  }
  scene.add(pin);
  // the operator in a bunny suit: hood, face mask, goggles, gloves, booties
  const operator = new THREE.Group();
  {
    const part = (geo, m, x, y, z) => {
      const p = finish(new THREE.Mesh(geo, m), false);
      p.position.set(x, y, z);
      operator.add(p);
      return p;
    };
    part(new THREE.CapsuleGeometry(0.17, 0.5, 6, 16), MAT.fabric, 0, 1.12, 0).scale.z = 0.7;
    for (const s of [-1, 1]) {
      part(new THREE.CapsuleGeometry(0.075, 0.62, 4, 12), MAT.fabric, s * 0.09, 0.48, 0);
      part(new THREE.BoxGeometry(0.11, 0.07, 0.25), MAT.blue, s * 0.09, 0.035, 0.04);
      part(new THREE.CapsuleGeometry(0.05, 0.42, 4, 10), MAT.fabric, s * 0.23, 1.18, 0.06).rotation.x = -0.35;
    }
    const fore = part(new THREE.CapsuleGeometry(0.045, 0.3, 4, 10), MAT.fabric, 0.2, 1.06, 0.3);
    fore.rotation.x = Math.PI / 2;
    part(new THREE.SphereGeometry(0.05, 12, 10), MAT.blue, 0.2, 1.06, 0.48);
    part(new THREE.SphereGeometry(0.125, 20, 16), MAT.fabric, 0, 1.58, 0);
    part(new THREE.BoxGeometry(0.17, 0.05, 0.05), MAT.black, 0, 1.6, 0.1);
    part(new THREE.BoxGeometry(0.14, 0.07, 0.04), MAT.blue, 0, 1.53, 0.105);
  }
  scene.add(operator);

  // ------------------------------------------------------------ action effects: bubbles in a bath, a drop of resist
  const BUBBLES = 36;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({color: '#ffffff', transparent: true, opacity: 0.85, roughness: 0.05, emissive: '#cfe8ff', emissiveIntensity: 0.25}), BUBBLES);
  bubbles.frustumCulled = false;
  bubbles.visible = false;
  scene.add(bubbles);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), MAT.amber);
  drop.visible = false;
  scene.add(drop);
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  /** Where bubbles rise for the current step: [station, local x, local y, half width, rise height, size]. */
  const bathOf = (s) => {
    if (s.f <= 1e-4) return null;
    if (s.stepId === 'clean') return [STATIONS.wet, s.tank === 'SC-1' ? -0.4 : 0.4, 0.77, 0.12, 0.2, 0.01];
    if (s.stepId === 'etch') return [STATIONS.etch, 0, 0.77, 0.12, 0.2, 0.009];
    if (s.stepId === 'develop') return [STATIONS.develop, -0.3, 0.86, 0.06, 0.03, 0.003];
    if (s.stepId === 'strip') return [STATIONS.develop, 0.3, 0.86, 0.06, 0.03, 0.003];
    return null;
  };

  // ------------------------------------------------------------ camera
  let W = 1600;
  let H = 900;
  const resize = (w, h, pr) => {
    W = w;
    H = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the free area between the panels is left of centre and above it
    camera.setViewOffset(w, h, 46, 22, w, h);
    camera.updateProjectionMatrix();
  };
  const v = new THREE.Vector3();
  const project = (p) => {
    v.set(p[0], p[1], p[2]).project(camera);
    return {x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, visible: v.z < 1, dist: Math.hypot(p[0] - camera.position.x, p[2] - camera.position.z)};
  };

  const view = {ceil: 0, explode: 0, fp: 0};
  /**
   * s: model state. d: {xray, explode, ceiling, airflow, focus, T, fp, hideOperator}.
   * cam: {pos, target, fov}. On foot (fp) the walls stand full height under a closed ceiling.
   */
  function update(s, d, cam, dt) {
    const ease = 1 - Math.exp(-dt / 0.18);
    view.fp += ((d.fp ? 1 : 0) - view.fp) * ease;
    view.ceil += ((d.ceiling || d.fp ? 1 : 0) - view.ceil) * ease;
    view.explode += ((d.explode ? 1 : 0) - view.explode) * ease;
    const fp = view.fp;
    ceil.visible = view.ceil > 0.02;
    ceil.position.y = (1 - view.ceil) * 1.2 + view.explode * 2.0;
    for (const t of tiles) t.opacity = lerp(0.22, 1, fp);
    const wallH = lerp(ROOM.cut, ROOM.H, fp);
    for (const w of walls) {
      w.m.scale.y = wallH / ROOM.H;
      w.m.castShadow = fp < 0.5;
      w.cap.position.y = wallH;
      w.cap.visible = fp < 0.9;
    }
    lintels.visible = fp > 0.5;
    edgeMat.opacity = 0.32 * (1 - fp);
    edgeMat.visible = fp < 0.97;
    amber.intensity = 14 * fp;
    hemi.intensity = lerp(0.75, 1.0, fp);
    scene.environmentIntensity = lerp(0.55, 0.8, fp);

    for (const [id, sh] of Object.entries(shells)) {
      const want = Math.max(d.xray ? 1 : 0, d.focus === id ? 1 : 0);
      sh.k += (want - sh.k) * ease;
      sh.group.position.y = view.explode * 0.7;
      for (const m of sh.mats) {
        const tr = sh.k > 0.02 || m.userData.base < 1;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.opacity = m.userData.base * lerp(1, 0.1, sh.k);
        m.depthWrite = m.userData.base >= 1 && sh.k < 0.5;
      }
    }

    // the wafer: standing wafers face along the tool's x (the furnace tube axis); 2 is face down
    const yaw = s.station ? STATIONS[s.station].rot : s.operator.yaw + Math.PI;
    wafer.position.set(...s.pos);
    wafer.rotation.set(0, yaw, (s.upright * Math.PI) / 2, 'YXZ');
    parts.disc.rotation.y = s.spinning ? s.spinAngle : 0;
    waferMat.color.setRGB(...s.colour, THREE.SRGBColorSpace);
    waferMat.metalness = s.layers.resist > 0 && s.layers.al === 0 ? 0.2 : 0.7;
    tweezers.visible = s.moving;
    tweezers.position.set(...s.pos);
    tweezers.rotation.y = yaw;
    pin.position.set(s.pos[0], s.pos[1], s.pos[2]);
    pin.visible = fp < 0.5;
    operator.visible = !d.hideOperator;
    operator.position.set(s.operator.x, 0, s.operator.z);
    operator.rotation.y = s.operator.yaw;

    // tools
    parts.chuck.rotation.y = s.spinning ? s.spinAngle : 0;
    parts.coilMat.emissiveIntensity = 0.35 + 1.4 * s.inTube;
    parts.plateMat.emissiveIntensity = s.stepId === 'bake' && s.f > 1e-4 ? 0.3 : 0;
    parts.mask.position.y = 0.994 + s.maskGap;
    parts.uv.visible = s.exposing;
    parts.vapour.visible = s.depositing;
    parts.crucibleMat.emissiveIntensity = s.depositing ? 1.8 : 0;
    parts.probes.position.y = 0.9535 + 0.03 * (1 - s.probing);
    const bx = s.stepId === 'oxide' ? s.local[0] : -1.0;
    parts.boat.position.set(bx, 1.135, 0);
    parts.paddle.position.x = bx - 0.3;

    // bubbles rise through the active bath
    const bath = bathOf(s);
    bubbles.visible = !!bath;
    if (bath) {
      const [st, bx, by, hw, hgt, r] = bath;
      for (let i = 0; i < BUBBLES; i++) {
        const k = (d.T * (0.5 + hash(i) * 0.6) + hash(i + 50)) % 1;
        const p = toWorld(st, [bx + (hash(i + 100) * 2 - 1) * hw, by + k * hgt, (hash(i + 200) * 2 - 1) * hw]);
        dummy.position.set(p[0], p[1], p[2]);
        dummy.scale.setScalar(r * (0.6 + hash(i + 300)) * (1 - k * 0.3));
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    }
    // a drop of resist falls onto the wafer as the spin coater starts
    const dk = s.stepId === 'spin' && s.f > 1e-4 ? s.f / 0.08 : 2;
    drop.visible = dk < 1;
    if (drop.visible) {
      const p = toWorld(STATIONS.spin, [0, lerp(1.13, 0.958, dk * dk), 0]);
      drop.position.set(p[0], p[1], p[2]);
    }

    // air
    air.visible = !!d.airflow;
    if (d.airflow) {
      const top = ROOM.H + view.explode * 2.0;
      let i = 0;
      for (const [x, z] of ffus)
        for (let k = 0; k < STREAKS; k++) {
          const ph = ((i * 0.618) % 1) * ROOM.H;
          const fall = (FFU.v * d.T + ph) % ROOM.H;
          dummy.position.set(x + ((k % 3) - 1) * 0.36, top - fall, z + (k < 3 ? -0.15 : 0.15));
          dummy.updateMatrix();
          air.setMatrixAt(i++, dummy.matrix);
        }
      air.instanceMatrix.needsUpdate = true;
    }

    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(...cam.pos);
    camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    renderer.render(scene, camera);
  }

  /** Where a station's label hangs, world. */
  const labelPoint = (id) => toWorld(STATIONS[id], [0, id === 'design' || id === 'gown' ? 1.45 : 2.25, 0]);
  return {renderer, scene, camera, resize, project, update, labelPoint};
}
