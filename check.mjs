// Hand checks against the model. Run: node microlab/check.mjs
import * as M from './src/model.js';

const ok = (name, got, want, tol) => {
  const pass = Math.abs(got - want) <= tol;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: model ${got.toFixed(4)}, by hand ${want}`);
  if (!pass) process.exitCode = 1;
};
// Deal-Grove: t = (x^2 + A x)/B = (0.25 + 0.055)/0.51 = 0.598 h = 35.9 min
ok('oxidation time for 500 nm (min)', M.oxHours(0.5) * 60, 35.88, 0.01);
// back through the forward formula: 4Bt/A^2 = 100.8, sqrt(101.8) = 10.09, 0.055 x 9.09 = 0.500 um
ok('oxide after that time (um)', M.dealGrove(0.598), 0.5, 0.001);
// spin: 1.3 um at 4000 rpm; at 3000 rpm 1.3 x sqrt(4/3) = 1.50 um
ok('resist at 3000 rpm (um)', M.resistThk(3000), 1.501, 0.001);
// exposure: 150 mJ/cm2 / 15 mW/cm2 = 10 s
ok('exposure time (s)', M.STEPS[4].dur * 60, 10, 1e-9);
// etch: 500 nm / 100 nm/min = 5 min
ok('etch time (min)', M.STEPS[6].dur, 5, 1e-9);
// metal: 200 nm / 0.5 nm/s = 400 s
ok('evaporation time (s)', M.STEPS[8].dur * 60, 400, 1e-9);
// sheet resistance: 2.65e-8 / 200e-9 = 0.1325 ohm/sq; V = 0.01 A x 0.1325 / 4.532 = 0.292 mV
ok('sheet resistance (ohm/sq)', M.sheetR(200), 0.1325, 1e-6);
ok('probe voltage (mV)', ((M.REC.probe.I * M.sheetR(200)) / M.REC.probe.k) * 1000, 0.2924, 0.0001);
// air, lithography bay: 22.5 m2 x 0.6 / 0.72 = 18.75 -> 19 units; 19 x 0.72 x 0.45 x 3600 = 22,162 m3/h; / (22.5 x 2.7) = 364.8
const litho = M.zoneAir(M.zoneOf('litho'));
ok('litho filter units', litho.n, 19, 0);
ok('litho air changes per hour', litho.ach, 364.8, 0.1);
const main = M.zoneAir(M.zoneOf('main'));
ok('process bay filter units', main.n, 18, 0);
ok('process bay air changes per hour', main.ach, 149.5, 0.1);
// end of run
const end = M.stateAt(M.TOTAL).layers;
ok('final oxide (nm)', end.ox, 500, 0.5);
ok('final aluminium (nm)', end.al, 200, 1e-6);
ok('oxide left in windows (nm)', end.ox - end.etch, 0, 0.5);

console.log(`\nrun: ${M.clock(M.TOTAL)} min:s on the process clock, ${M.SEGS.length} segments`);
for (const s of M.SEGS) console.log(s.kind === 'step' ? `  ${s.step.name.padEnd(24)} ${M.clock(s.step.dur).padStart(6)}` : `    walk ${s.path.len.toFixed(2)} m  ${M.clock(s.tau1 - s.tau0)}`);
for (const z of M.ZONES) {
  const a = M.zoneAir(z);
  console.log(`  ${z.name.padEnd(18)} ISO ${z.iso ?? '-'}  ${a.n} units  ${(a.coverage * 100).toFixed(0)}% cover  ${a.ach.toFixed(0)} ACH`);
}
