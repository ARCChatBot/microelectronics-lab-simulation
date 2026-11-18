# Microelectronics Lab Simulation

A first-person 3D training simulation of a teaching cleanroom, written for high school students. Students sign in, follow one 100 mm silicon wafer through the lab, run each machine themselves, answer a short quiz at every station, and finish with a timed grade and a completion status.

**Play it:** https://arcchatbot.github.io/microelectronics-lab-simulation/

## What's in it

- **Ten process steps** on equipment modelled after the real thing: RCA clean, wet oxidation, spin coat, soft bake, UV exposure, develop, oxide etch, resist strip, aluminium evaporation and a four-point probe test, plus design and gowning stops.
- **Hands-on stations:** each step starts only when the student clicks the glowing control on the machine.
- **Microscope close-up** of what is physically happening to the wafer at each step, with layer thicknesses from the model.
- **Sound:** filter-fan room tone, machine loops, footsteps and action cues, all generated in the browser.
- **Station quizzes:** 22 questions with feedback, graded A–F; 70% completes the training.
- **Timing:** active time overall and at each station.
- **Three views:** the operator's eyes, walking (W A S D), and a floor plan.

## One model behind every number

`src/model.js` holds the recipe and the physics: Deal–Grove oxidation, spin-speed thickness, exposure dose, etch and deposition rates, sheet resistance. Every gauge, card and close-up reads from it. `check.mjs` compares the model to hand calculations:

```bash
npm install
npm run check
```

## Run it

Open `index.html` in a browser through any static server, for example:

```bash
python3 -m http.server 8080
```

then visit http://localhost:8080.

## Build it

```bash
npm install
npm run build
```

This bundles `src/` into a single self-contained `index.html`.

## Saving results

The page saves sign-ins, quiz answers, grades and times through the claude.ai artifact runtime when it is opened as a published Claude artifact. Opened anywhere else, such as from this repository, everything still works but results stay in the student's browser.

## Files

| File | What it does |
|---|---|
| `src/model.js` | The recipe, the physics, the station lessons and the quizzes |
| `src/lab.js` | The 3D lab and equipment (three.js) |
| `src/closeup.js` | The microscope close-up of the wafer |
| `src/record.js` | Sign-in, quizzes, grading, timing and the class record |
| `src/audio.js` | Generated sound |
| `src/ui.js` | The console panels |
| `src/main.js` | The walkthrough, camera and controls |
| `check.mjs` | Hand checks against the model |
