// The lab's sound, made in the browser with Web Audio: no files. A room tone of filter fans, a loop for each machine
// that follows the model (the spin coater's pitch is its rpm, the furnace roar is how far the boat is in), footsteps
// while the wafer is carried, and short cues for the student's actions. Browsers only allow sound after a click, so
// nothing plays until unlock() is called from one.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  const loops = {};
  let noiseBuf = null;
  let stepClock = 0;
  let popClock = 0;

  const now = () => ctx.currentTime;
  // looping noise sources for the machine loops, started together once the graph is built
  const started = [];
  const noise = () => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    started.push(src);
    return src;
  };
  const gain = (v = 0) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const filter = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const chain = (...nodes) => {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  };
  /** A loop's level, eased so nothing clicks. */
  const level = (name, v, tc = 0.15) => {
    const l = loops[name];
    if (l) l.out.gain.setTargetAtTime(v, now(), tc);
  };

  function build() {
    // one second of pink-ish noise, shared by every noisy sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    master = gain(muted ? 0 : 0.8);
    const comp = ctx.createDynamicsCompressor();
    chain(master, comp, ctx.destination);

    // room tone: the ceiling filter fans, a broad soft rush with a low motor hum under it
    {
      const out = gain(0);
      chain(noise(), filter('lowpass', 650), filter('highpass', 60), out, master);
      const hum = ctx.createOscillator();
      hum.frequency.value = 118;
      chain(hum, gain(0.12), filter('lowpass', 300), out);
      hum.start();
      loops.room = {out};
    }
    // furnace: a deep roar of burners and gas
    {
      const out = gain(0);
      chain(noise(), filter('lowpass', 220, 1.2), out, master);
      loops.furnace = {out};
    }
    // spin coater: a motor whine whose pitch follows the chuck, with air rushing past the bowl
    {
      const out = gain(0);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 40;
      chain(osc, filter('lowpass', 900, 2), gain(0.5), out);
      chain(noise(), filter('bandpass', 1400, 0.8), gain(0.6), out);
      out.connect(master);
      osc.start();
      loops.spin = {out, osc};
    }
    // UV lamp: the ballast hum of a mercury lamp
    {
      const out = gain(0);
      for (const [f, v] of [[120, 0.6], [240, 0.3], [360, 0.12]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        chain(o, gain(v), out);
        o.start();
      }
      out.connect(master);
      loops.uv = {out};
    }
    // hot plate: a faint electrical buzz
    {
      const out = gain(0);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 60;
      chain(o, filter('lowpass', 400), gain(0.15), out, master);
      o.start();
      loops.hot = {out};
    }
    // evaporator: the vacuum pump's thump and the source's electrical hiss
    {
      const out = gain(0);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 29;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5;
      const depth = gain(0.35);
      const amp = gain(0.6);
      chain(lfo, depth, amp.gain);
      chain(o, filter('lowpass', 180, 3), amp, out);
      chain(noise(), filter('highpass', 3000), gain(0.25), out);
      out.connect(master);
      o.start();
      lfo.start();
      loops.pump = {out};
    }
    // liquid: a soft slosh under the bubbles
    {
      const out = gain(0);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const f = filter('bandpass', 500, 1.5);
      const depth = gain(250);
      chain(lfo, depth, f.frequency);
      chain(noise(), f, out, master);
      lfo.start();
      loops.liquid = {out};
    }
    // start every noise source made above, each at a different point in the buffer
    for (const n of started) n.start(0, Math.random() * 2);
  }

  /** A short tone: f Hz, d seconds, with an envelope. */
  const tone = (f, d, v = 0.2, type = 'sine', at = 0, slide = 0) => {
    if (!ctx) return;
    const t = now() + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    chain(o, g, master);
    o.start(t);
    o.stop(t + d + 0.05);
  };
  /** A burst of filtered noise: a footstep, a click, a whoosh. */
  const burst = (f, d, v = 0.2, type = 'lowpass', at = 0, sweep = 0) => {
    if (!ctx) return;
    const t = now() + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const fl = filter(type, f, 1);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + d);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.02, d / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    chain(src, fl, g, master);
    src.start(t, Math.random());
    src.stop(t + d + 0.05);
  };

  const CUES = {
    // a button on the console
    ui: () => tone(1800, 0.04, 0.05, 'triangle'),
    // a card arrives
    card: () => {
      tone(660, 0.5, 0.07);
      tone(990, 0.6, 0.05, 'sine', 0.08);
    },
    // the student works a machine: a firm switch, then a confirming beep
    press: () => {
      burst(2500, 0.03, 0.25, 'bandpass');
      tone(880, 0.09, 0.12, 'square', 0.04);
      tone(1320, 0.14, 0.1, 'square', 0.13);
    },
    // a step finished
    done: () => [523, 659, 784].forEach((f, i) => tone(f, 0.45, 0.08, 'triangle', i * 0.09)),
    // the whole run finished
    finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.8, 0.09, 'triangle', i * 0.12)),
    // a quiz answer: right rises, wrong falls
    right: () => {
      tone(784, 0.18, 0.09, 'triangle');
      tone(1175, 0.35, 0.08, 'triangle', 0.1);
    },
    wrongq: () => {
      tone(220, 0.28, 0.08, 'square', 0, 0.8);
      tone(165, 0.35, 0.06, 'square', 0.14, 0.8);
    },
    // the design goes out: a short data chirp
    send: () => {
      for (let i = 0; i < 8; i++) tone(1200 + (i % 3) * 400, 0.05, 0.05, 'square', i * 0.07);
      tone(1568, 0.3, 0.08, 'sine', 0.65);
    },
    // a garment goes on
    cloth: (i = 0) => burst(1800, 0.25, 0.12, 'bandpass', i * 0.01, 0.4),
    // the furnace boat slides on its paddle
    slide: () => burst(900, 1.2, 0.1, 'bandpass', 0, 0.5),
    // the aligner's shutter
    shutter: () => {
      burst(4000, 0.02, 0.3, 'highpass');
      tone(200, 0.08, 0.1, 'square');
    },
    // the probe needles touch down
    touch: () => tone(1000, 0.12, 0.06, 'sine'),
    // a wafer goes into liquid
    dip: () => burst(700, 0.5, 0.15, 'bandpass', 0, 0.4),
  };

  return {
    /** Call from a click: browsers only start audio from a user gesture. */
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      build();
      level('room', 0.35, 1.5);
    },
    get on() {
      return !muted;
    },
    toggle() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, now(), 0.05);
      return !muted;
    },
    cue(name, arg) {
      if (ctx && !muted && CUES[name]) CUES[name](arg);
    },
    /** Each frame: set every machine loop from the model state. */
    tick(s, dt, playing) {
      if (!ctx) return;
      const run = playing ? 1 : 0;
      const id = s.stepId;
      level('furnace', 0.08 + 0.5 * s.inTube * (id === 'oxide' ? 1 : 0));
      // the chuck spins up over a second and down after; pitch from the real rpm
      const spin = id === 'spin' && s.spinning ? Math.min(1, s.f * 12, (1 - s.f) * 12) : 0;
      level('spin', 0.32 * spin * run);
      if (loops.spin) loops.spin.osc.frequency.setTargetAtTime(30 + spin * (4000 / 60) * 3, now(), 0.1);
      level('uv', id === 'expose' && s.exposing ? 0.14 * run : 0, 0.03);
      level('hot', id === 'bake' && s.f > 1e-4 ? 0.12 * run : 0);
      level('pump', id === 'metal' && s.depositing ? 0.4 * run : id === 'metal' ? 0.15 : 0);
      const wet = (id === 'clean' || id === 'etch' || id === 'develop' || id === 'strip') && s.f > 1e-4 ? run : 0;
      level('liquid', 0.22 * wet);
      // bubbles in a bath, crackle in the evaporator
      popClock -= dt;
      if (popClock <= 0) {
        if (wet && (id === 'clean' || id === 'etch')) {
          tone(700 + Math.random() * 900, 0.04, 0.03, 'sine', 0, 1.6);
          popClock = 0.04 + Math.random() * 0.12;
        } else if (id === 'metal' && s.depositing && run) {
          burst(5000, 0.015, 0.05, 'highpass');
          popClock = 0.05 + Math.random() * 0.2;
        } else popClock = 0.1;
      }
      // footsteps on the raised floor while the wafer is carried
      if (s.moving && run) {
        stepClock -= dt;
        if (stepClock <= 0) {
          burst(260, 0.12, 0.22, 'lowpass');
          burst(1800, 0.05, 0.03, 'bandpass', 0.01);
          stepClock = 0.5;
        }
      } else stepClock = 0.1;
    },
  };
}
