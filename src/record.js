// The training record: student sign-in, the quiz at each station, the final grade and completion status, and the
// class results for the teacher. Each student's record is one document, results/<their id>, written as they go.
// Rules declared at publish let each student write only their own record and only the owner (and Editors) read
// them all. Where the page cannot save (opened outside claude.ai, signed out, or without write access), everything
// still works and the record stays in this browser, with a download of the results offered instead.
import {CHECK_SECONDS, PASS, QUIZ, QUIZ_TOTAL, STATIONS, STEPS, gradeOf} from './model.js';

const use = (name) => (window.claude?.use ? window.claude.use(name).then((x) => x || null, () => null) : Promise.resolve(null));
const LOCAL = 'microlab-record-v1';
const loadLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || 'null');
  } catch {
    return null;
  }
};
const saveLocal = (r) => {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(r));
  } catch {
    /* storage blocked: the record lives for this visit only */
  }
};
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : '');
/** Seconds as m:ss, or h:mm:ss past an hour. */
export const dur = (sec) => {
  const t = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s2 = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s2}` : `${m}:${s2}`;
};
const stationName = (stop) => {
  const step = STEPS.find((s) => s.id === stop);
  return step ? `${STEPS.indexOf(step) + 1}. ${step.name}` : STATIONS[stop].name;
};
const ORDER = ['design', 'gown', ...STEPS.map((s) => s.id)];

/** Score a set of answers: {key: chosenIndex}, key = stop:question. */
export function score(answers) {
  let correct = 0;
  let answered = 0;
  for (const stop of ORDER)
    QUIZ[stop].forEach((q, i) => {
      const a = answers[`${stop}:${i}`];
      if (a === undefined) return;
      answered++;
      if (a === q.answer) correct++;
    });
  const pct = Math.round((correct / QUIZ_TOTAL) * 100);
  const done = answered === QUIZ_TOTAL;
  const status = !done ? 'In progress' : pct >= PASS ? 'Complete' : 'Not passed';
  return {correct, answered, pct, grade: gradeOf(pct), status, done};
}

export function createRecord(root, {audio, onSignedIn, onSignedOut, goto, stopIndex}) {
  let db = null;
  let user = null;
  let downloads = null;
  let uid = null;
  let canWrite = true;
  let saveState = 'local'; // 'saved' | 'saving' | 'local' | 'failed'
  let writing = Promise.resolve();
  let rec = null; // {name, studentId, period, startedAt, answers, history}
  const api = {open: false};

  // ------------------------------------------------------------ capabilities, lit up when the viewer answers
  const ready = Promise.all([use('db'), use('user'), use('downloads')]).then(async ([d, u, dl]) => {
    db = d;
    user = u;
    downloads = dl;
    if (user) {
      uid = await user.id();
      const me = await user.me();
      if (me.name && nameIn && !nameIn.value) nameIn.value = me.name;
      if (await user.canEdit()) teacherBtn.hidden = false;
      const w = await user.can('data.write');
      if (w === false) canWrite = false;
    }
    // a record already saved for this student: pick up where they left off
    if (db && uid) {
      try {
        const snap = await db.doc(`results/${uid}`).get();
        if (snap.exists) {
          const d0 = snap.data();
          if (!rec) {
            nameIn.value = d0.name || nameIn.value;
            idIn.value = d0.studentId || '';
            periodIn.value = d0.period || '';
          }
        }
      } catch {
        /* reads failing just means no prefill */
      }
    }
    updateSaveLine();
  });

  // ------------------------------------------------------------ sign-in
  const signin = el(`<div class="signin"><form class="sbox" autocomplete="off">
    <div class="ph"><i></i>STUDENT SIGN-IN</div>
    <h2>Microelectronics Lab Simulation</h2>
    <p>Sign in so your quiz answers, grade and completion are recorded for your teacher. Every station ends with a timed check for understanding (${CHECK_SECONDS} seconds per question); you need ${PASS}% to complete the training.</p>
    <label for="si-name">Full name</label><input id="si-name" name="name" required maxlength="80" placeholder="First and last name">
    <div class="srow"><div><label for="si-id">Student ID</label><input id="si-id" name="sid" required maxlength="40" placeholder="e.g. 204518"></div>
    <div><label for="si-period">Class or period</label><input id="si-period" name="period" maxlength="40" placeholder="e.g. Period 3"></div></div>
    <div class="serr" hidden></div>
    <button type="submit" class="bt sgo">SIGN IN AND START ▶</button>
    <div class="snote"></div>
  </form></div>`);
  root.appendChild(signin);
  const form = signin.querySelector('form');
  const nameIn = signin.querySelector('#si-name');
  const idIn = signin.querySelector('#si-id');
  const periodIn = signin.querySelector('#si-period');
  const errEl = signin.querySelector('.serr');
  const noteEl = signin.querySelector('.snote');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameIn.value.trim();
    const sid = idIn.value.trim();
    if (name.length < 2 || !sid) {
      errEl.hidden = false;
      errEl.textContent = !sid ? 'Enter your student ID.' : 'Enter your full name.';
      return;
    }
    errEl.hidden = true;
    const prev = loadLocal();
    const same = prev && prev.studentId === sid && prev.name === name && !prev.finishedAt;
    rec = same ? prev : {name, studentId: sid, period: periodIn.value.trim(), startedAt: new Date().toISOString(), answers: {}, elapsed: 0, times: {}, history: prev && prev.studentId === sid ? prev.history || [] : []};
    rec.elapsed = rec.elapsed || 0;
    rec.times = rec.times || {};
    rec.period = periodIn.value.trim();
    saveLocal(rec);
    signin.hidden = true;
    api.open = false;
    chip.hidden = false;
    chip.querySelector('b').textContent = rec.name;
    chip.querySelector('span').textContent = `ID ${rec.studentId}${rec.period ? ' · ' + rec.period : ''}`;
    audio.unlock();
    audio.cue('done');
    save();
    onSignedIn();
  });
  api.showSignIn = () => {
    signin.hidden = false;
    api.open = true;
    nameIn.focus();
  };

  // the student chip in the header
  const chip = el(`<div class="stu" hidden><b></b><span></span><i class="tm" title="Time on the training"></i><div class="bt sout">SIGN OUT</div></div>`);
  const tmEl = chip.querySelector('.tm');
  root.appendChild(chip);
  chip.querySelector('.sout').addEventListener('click', () => {
    rec = null;
    chip.hidden = true;
    onSignedOut();
    api.showSignIn();
  });

  // ------------------------------------------------------------ saving
  const updateSaveLine = () => {
    const t = {
      saved: 'Saved to the class record.',
      saving: 'Saving to the class record…',
      local: db && uid ? 'Not saved yet.' : `This page cannot reach the class record here, so your results stay in this browser. ${downloads ? 'Download them at the end' : 'Show this screen to your teacher'}.`,
      failed: `Could not save to the class record (your account may not have permission). Your results stay in this browser. ${downloads ? 'Download them at the end' : 'Show this screen to your teacher'}.`,
    }[saveState];
    noteEl.textContent = db && uid && canWrite ? 'Your results are saved to the class record as you go.' : t;
    if (resultsSave) resultsSave.textContent = t;
  };
  function body() {
    const s = score(rec.answers);
    return {
      name: rec.name,
      studentId: rec.studentId,
      period: rec.period || '',
      startedAt: rec.startedAt,
      updatedAt: new Date().toISOString(),
      finishedAt: rec.finishedAt || null,
      answers: rec.answers,
      correct: s.correct,
      answered: s.answered,
      total: QUIZ_TOTAL,
      percent: s.pct,
      grade: s.done ? s.grade : '',
      status: s.status,
      history: (rec.history || []).slice(-10),
      activeSeconds: Math.round(rec.elapsed || 0),
      questionSeconds: rec.qtime || {},
      checks: Object.fromEntries(ORDER.map((stop) => {
        const c = checkOf(stop);
        return [stop, {correct: c.right, answered: c.n, of: c.of, seconds: Math.round(c.t)}];
      })),
      stationSeconds: Object.fromEntries(Object.entries(rec.times || {}).map(([k, v]) => [k, Math.round(v)])),
    };
  }
  /** Write the record: one write at a time, the latest state each time. */
  function save() {
    if (!rec) return;
    saveLocal(rec);
    if (!db || !uid || !canWrite) {
      saveState = db && uid ? 'failed' : 'local';
      updateSaveLine();
      return;
    }
    saveState = 'saving';
    updateSaveLine();
    writing = writing.then(async () => {
      try {
        await db.doc(`results/${uid}`).set(body());
        saveState = 'saved';
      } catch (e) {
        if (e && e.code === 'unavailable') {
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));
          try {
            await db.doc(`results/${uid}`).set(body());
            saveState = 'saved';
          } catch {
            saveState = 'failed';
          }
        } else {
          saveState = 'failed';
          if (e && e.code === 'invalid_argument') canWrite = false;
        }
      }
      updateSaveLine();
    });
  }

  // ------------------------------------------------------------ the check for understanding at each station
  // Timed and scored: CHECK_SECONDS per question on a countdown. Running out of time counts as incorrect. The time
  // taken on every question is recorded, and the station's score and time show when its check ends.
  const quizEl = el(`<div class="quiz" hidden><div class="qhead"><div class="qk"></div><div class="qclock"><b></b><i><s></s></i></div></div><div class="qq"></div><div class="qo"></div><div class="qf" hidden></div><div class="qb"><span class="qsum"></span><div class="bt qgo" hidden></div></div></div>`);
  root.appendChild(quizEl);
  const clockEl = quizEl.querySelector('.qclock');
  let live = null; // the question on the clock: {stop, i, left, reveal}
  api.needsQuiz = (stop) => !!rec && !!QUIZ[stop] && QUIZ[stop].some((_, i) => rec.answers[`${stop}:${i}`] === undefined);
  /** The station's check score and time so far. */
  const checkOf = (stop) => {
    const qs = QUIZ[stop];
    let right = 0;
    let t = 0;
    let n = 0;
    qs.forEach((q, i) => {
      const a = rec.answers[`${stop}:${i}`];
      if (a === undefined) return;
      n++;
      if (a === q.answer) right++;
      t += (rec.qtime && rec.qtime[`${stop}:${i}`]) || 0;
    });
    return {right, n, of: qs.length, t};
  };
  const drawClock = () => {
    const left = Math.max(0, live ? live.left : 0);
    clockEl.querySelector('b').textContent = `⏱ ${dur(Math.ceil(left))}`;
    clockEl.querySelector('s').style.width = `${(left / CHECK_SECONDS) * 100}%`;
    clockEl.classList.toggle('low', left <= 10);
  };
  /** Ask the unanswered questions for this station, then call done. */
  api.quiz = (stop, done) => {
    const qs = QUIZ[stop];
    const todo = qs.map((_, i) => i).filter((i) => rec.answers[`${stop}:${i}`] === undefined);
    if (!todo.length) return done();
    rec.qtime = rec.qtime || {};
    api.open = true;
    let n = 0;
    const ask = () => {
      const i = todo[n];
      const q = qs[i];
      const key = `${stop}:${i}`;
      quizEl.querySelector('.qk').textContent = `CHECK FOR UNDERSTANDING · ${stationName(stop).toUpperCase()} · QUESTION ${i + 1} OF ${qs.length}`;
      quizEl.querySelector('.qq').textContent = q.q;
      quizEl.querySelector('.qsum').textContent = '';
      const opts = quizEl.querySelector('.qo');
      opts.innerHTML = '';
      const fb = quizEl.querySelector('.qf');
      fb.hidden = true;
      const go = quizEl.querySelector('.qgo');
      go.hidden = true;
      clockEl.classList.remove('stop');
      /** Lock the answer: k is the option picked, or -1 when the time ran out. */
      const reveal = (k) => {
        if (rec.answers[key] !== undefined) return;
        rec.answers[key] = k;
        rec.qtime[key] = Math.round((CHECK_SECONDS - Math.max(0, live.left)) * 10) / 10;
        live = null;
        clockEl.classList.add('stop');
        const right = k === q.answer;
        [...opts.children].forEach((c, j) => {
          c.disabled = true;
          if (j === q.answer) c.classList.add('right');
          else if (j === k) c.classList.add('wrong');
        });
        fb.hidden = false;
        fb.className = `qf ${right ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${right ? '✓ Correct.' : k < 0 ? '⏱ Time is up.' : '✗ Not quite.'}</b> `;
        fb.appendChild(document.createTextNode(q.why));
        audio.cue(right ? 'right' : 'wrongq');
        const last = n >= todo.length - 1;
        if (last) {
          const c = checkOf(stop);
          quizEl.querySelector('.qsum').textContent = `Check score: ${c.right} of ${c.of} correct · ${dur(c.t)}`;
        }
        go.hidden = false;
        go.textContent = last ? 'CONTINUE ▶' : 'NEXT QUESTION ▶';
        go.focus();
        save();
      };
      q.options.forEach((t, k) => {
        const b = el(`<button class="qopt"><em>${'ABCD'[k]}</em><span></span></button>`);
        b.querySelector('span').textContent = t;
        b.addEventListener('click', () => reveal(k));
        opts.appendChild(b);
      });
      live = {left: CHECK_SECONDS, reveal, warned: 0};
      drawClock();
      quizEl.hidden = false;
      quizEl.classList.remove('in');
      void quizEl.offsetWidth;
      quizEl.classList.add('in');
    };
    quizEl.querySelector('.qgo').onclick = () => {
      n++;
      if (n < todo.length) return ask();
      quizEl.hidden = true;
      api.open = false;
      done();
    };
    ask();
  };
  /** Run the question clock: only while the page is on screen. */
  const tickCheck = (dt) => {
    if (!live || document.hidden) return;
    live.left -= dt;
    const whole = Math.ceil(live.left);
    if (whole <= 5 && whole > 0 && whole !== live.warned) {
      live.warned = whole;
      audio.cue('tick');
    }
    drawClock();
    if (live.left <= 0) live.reveal(-1);
  };

  // ------------------------------------------------------------ the results
  const resEl = el(`<div class="results cp" hidden></div>`);
  root.appendChild(resEl);
  let resultsSave = null;
  /** The final screen: grade, completion status and every station's answers. */
  api.results = ({onRetake, onWalk}) => {
    const s = score(rec.answers);
    if (s.done && !rec.finishedAt) {
      rec.finishedAt = new Date().toISOString();
      rec.history = [...(rec.history || []), {finishedAt: rec.finishedAt, percent: s.pct, grade: s.grade, status: s.status}];
    }
    save();
    api.open = true;
    const missing = ORDER.filter((stop) => QUIZ[stop].some((_, i) => rec.answers[`${stop}:${i}`] === undefined));
    const cls = s.status === 'Complete' ? 'ok' : s.status === 'Not passed' ? 'no' : 'mid';
    const rows = ORDER.map((stop) => {
      const marks = QUIZ[stop].map((q, i) => {
        const a = rec.answers[`${stop}:${i}`];
        return a === undefined ? '<i class="m skip">–</i>' : a === q.answer ? '<i class="m ok">✓</i>' : '<i class="m no">✗</i>';
      }).join('');
      const c = checkOf(stop);
      return `<tr><td>${esc(stationName(stop))}</td><td>${marks}</td><td class="tnum">${c.n ? `${c.right}/${c.of}` : '–'}</td><td class="tnum">${c.n ? dur(c.t) : '–'}</td><td class="tnum">${rec.times && rec.times[stop] ? dur(rec.times[stop]) : '–'}</td></tr>`;
    }).join('');
    resEl.innerHTML = `
      <div class="ph"><i></i>TRAINING RECORD</div>
      <div class="rtop">
        <div class="rwho"><b>${esc(rec.name)}</b><span>Student ID ${esc(rec.studentId)}${rec.period ? ' · ' + esc(rec.period) : ''}</span><span>Started ${esc(when(rec.startedAt))}${rec.finishedAt ? ' · Finished ' + esc(when(rec.finishedAt)) : ''}</span></div>
        <div class="rgrade"><em>GRADE</em><b>${s.done ? s.grade : '–'}</b></div>
        <div class="rscore"><em>SCORE</em><b>${s.correct} / ${QUIZ_TOTAL}</b><span>${s.pct}%</span></div>
        <div class="rtime"><em>TIME</em><b>${dur(rec.elapsed)}</b><span>active time${rec.finishedAt ? ' · ' + dur((new Date(rec.finishedAt) - new Date(rec.startedAt)) / 1000) + ' start to finish' : ''}</span></div>
        <div class="rstat ${cls}"><em>STATUS</em><b>${s.status === 'Complete' ? '✓ Complete' : s.status === 'Not passed' ? 'Not passed' : 'Incomplete'}</b><span>${s.status === 'Complete' ? 'Microelectronics Lab training passed' : s.status === 'Not passed' ? `${PASS}% needed. Retake the training.` : `${QUIZ_TOTAL - s.answered} questions left`}</span></div>
      </div>
      <div class="rbody"><table class="rtab"><tr><th>STATION</th><th>CHECK</th><th>SCORE</th><th>CHECK TIME</th><th>STATION TIME</th></tr>${rows}</table>
        <div class="rside"><div class="rnote"></div>
        <div class="rbtns"></div>
        <div class="rscale">Grades: A 90%+, B 80–89%, C 70–79%, D 60–69%, F below 60%. Each check gives ${CHECK_SECONDS} seconds per question; running out of time counts as incorrect. Completion needs every station's check and ${PASS}% or more.</div></div></div>`;
    resultsSave = resEl.querySelector('.rnote');
    updateSaveLine();
    const btns = resEl.querySelector('.rbtns');
    const add = (label, fn, cls2 = '') => {
      const b = el(`<div class="bt ${cls2}">${label}</div>`);
      b.addEventListener('click', fn);
      btns.appendChild(b);
      return b;
    };
    if (missing.length)
      add(`GO TO ${esc(stationName(missing[0]).toUpperCase())} ▶`, () => {
        resEl.hidden = true;
        api.open = false;
        goto(stopIndex(missing[0]));
      }, 'pri');
    if (downloads)
      add('DOWNLOAD MY RESULTS', async () => {
        const txt = [`Microelectronics Lab Simulation · training record`, `Name: ${rec.name}`, `Student ID: ${rec.studentId}`, `Class: ${rec.period || ''}`, `Started: ${rec.startedAt}`, `Finished: ${rec.finishedAt || 'not finished'}`, `Score: ${s.correct} / ${QUIZ_TOTAL} (${s.pct}%)`, `Grade: ${s.grade}`, `Status: ${s.status}`, '', ...ORDER.flatMap((stop) => QUIZ[stop].map((q, i) => {
          const a = rec.answers[`${stop}:${i}`];
          const t = rec.qtime && rec.qtime[`${stop}:${i}`];
          return `${stationName(stop)} Q${i + 1}: ${a === undefined ? 'not answered' : a === q.answer ? 'correct' : a < 0 ? 'time ran out' : 'incorrect'}${t !== undefined ? ` (${dur(t)})` : ''}`;
        }))].join('\n');
        try {
          await downloads.save({filename: `microlab-${rec.studentId}.txt`, data: txt});
        } catch {
          /* declined or unavailable: nothing to do */
        }
      });
    add('RETAKE TRAINING', () => {
      rec.answers = {};
      rec.qtime = {};
      rec.elapsed = 0;
      rec.times = {};
      rec.finishedAt = null;
      rec.startedAt = new Date().toISOString();
      save();
      resEl.hidden = true;
      api.open = false;
      onRetake();
    }, s.status === 'Not passed' ? 'pri' : '');
    add('WALK THE LAB', () => {
      resEl.hidden = true;
      api.open = false;
      onWalk();
    });
    resEl.hidden = false;
    resEl.classList.remove('in');
    void resEl.offsetWidth;
    resEl.classList.add('in');
    audio.cue(s.status === 'Complete' ? 'finish' : 'card');
  };

  // ------------------------------------------------------------ class results, for the teacher
  const teacherBtn = el(`<div class="bt" hidden>CLASS RESULTS</div>`);
  root.querySelector('.tg').prepend(teacherBtn);
  const classEl = el(`<div class="results cp classres" hidden></div>`);
  root.appendChild(classEl);
  let unsub = null;
  let rowsCache = [];
  const renderClass = (msg) => {
    const rows = rowsCache;
    const checkCell = (r, stop) => {
      const c = r.checks && r.checks[stop];
      return c && c.answered ? `${c.correct}/${c.of} in ${dur(c.seconds)}` : '';
    };
    const csv = () => [['Name', 'Student ID', 'Class', 'Score', 'Percent', 'Grade', 'Status', 'Active time', 'Active minutes', 'Started', 'Finished', ...ORDER.map((stop) => `Check: ${stationName(stop)}`)].join(','), ...rows.map((r) => [r.name, r.studentId, r.period, `${r.correct}/${r.total}`, r.percent, r.grade, r.status, dur(r.activeSeconds), ((r.activeSeconds || 0) / 60).toFixed(1), r.startedAt, r.finishedAt || '', ...ORDER.map((stop) => checkCell(r, stop))].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    classEl.innerHTML = `<div class="ph"><i></i>CLASS RESULTS</div>
      <div class="cbar"><span>${rows.length} student${rows.length === 1 ? '' : 's'} · ${rows.filter((r) => r.status === 'Complete').length} complete</span><div class="bt cdl"${downloads && rows.length ? '' : ' hidden'}>DOWNLOAD CSV</div><div class="bt ccl">CLOSE</div></div>
      ${msg ? `<div class="cmsg">${esc(msg)}</div>` : ''}
      <div class="cwrap"><table class="ctab"><tr><th>NAME</th><th>STUDENT ID</th><th>CLASS</th><th>SCORE</th><th>GRADE</th><th>STATUS</th><th>TIME</th><th>LAST ACTIVE</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.studentId)}</td><td>${esc(r.period)}</td><td>${r.correct}/${r.total} · ${r.percent}%</td><td><b>${esc(r.grade || '–')}</b></td><td><span class="pill ${r.status === 'Complete' ? 'ok' : r.status === 'Not passed' ? 'no' : 'mid'}">${esc(r.status)}</span></td><td class="tnum">${dur(r.activeSeconds)}</td><td>${esc(when(r.updatedAt))}</td></tr>`).join('')}
      </table>${rows.length ? '' : '<div class="cempty">No students have signed in yet. Results appear here as each student works through the stations.</div>'}</div>`;
    classEl.querySelector('.ccl').onclick = () => {
      classEl.hidden = true;
      api.open = false;
      if (unsub) unsub();
      unsub = null;
    };
    const dl = classEl.querySelector('.cdl');
    if (dl) dl.onclick = () => downloads.save({filename: 'microlab-class-results.csv', data: csv()}).catch(() => {});
  };
  teacherBtn.addEventListener('click', async () => {
    await ready;
    classEl.hidden = false;
    api.open = true;
    rowsCache = [];
    if (!db) return renderClass('The class record is only available when this page is opened in claude.ai.');
    renderClass('Loading…');
    const timer = setTimeout(() => renderClass('The class record cannot be reached right now.'), 10000);
    if (unsub) unsub();
    unsub = db.collection('results').onSnapshot(
      (snap) => {
        if (!snap.metadata.fromCache) clearTimeout(timer);
        rowsCache = snap.docs.map((d) => d.data()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        renderClass('');
      },
      () => {
        clearTimeout(timer);
        renderClass('The class record could not be loaded.');
      },
    );
  });

  // ------------------------------------------------------------ the timer: active time overall and at each station
  // Counts only while the page is on screen (a hidden tab or a closed laptop does not add time) and stops at the finish.
  let cur = null;
  let shownSec = -1;
  let localClock = 0;
  /** The student reached a station's card: its time starts counting. */
  api.at = (stop) => {
    if (!rec || !ORDER.includes(stop) || stop === cur) return;
    cur = stop;
    save();
  };
  api.tick = (dt) => {
    tickCheck(dt);
    if (!rec || rec.finishedAt || document.hidden || !signin.hidden) return;
    rec.elapsed = (rec.elapsed || 0) + dt;
    if (cur) rec.times[cur] = (rec.times[cur] || 0) + dt;
    const sec = Math.floor(rec.elapsed);
    if (sec !== shownSec) {
      shownSec = sec;
      tmEl.textContent = `⏱ ${dur(sec)}`;
    }
    localClock += dt;
    if (localClock > 5) {
      localClock = 0;
      saveLocal(rec);
    }
  };
  api.signedIn = () => !!rec;
  api.ready = ready;
  return api;
}
