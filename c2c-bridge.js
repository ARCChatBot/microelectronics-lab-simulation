// Connects this page to the C2C training record (saved in Airtable) without changing the built app.
// Needs c2c-connect.js from the C2C site, loaded before this file (see index.html and build.mjs).
//  - Sign-in: pre-fills the student shared across C2C sites, requires a V# (V00 + 6 numbers),
//    and logs the sign-in.
//  - Completion: when the final results screen records a finish, sends the percent score.
(function () {
    'use strict';
    var SYSTEM = '3D Simulation';
    var TRACK = 'Microelectronics Lab Simulation';
    var RECORD_KEY = 'microlab-record-v1';   // where the app keeps the record (localStorage)
    var SENT_KEY = 'c2c-microlab-sent';      // finishes already sent, so each is sent once
    var C = function () { return window.C2C || null; };

    function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }

    function toast(text, ok) {
        var t = document.createElement('div');
        t.setAttribute('role', 'status');
        t.textContent = text;
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;max-width:90vw;padding:10px 16px;border-radius:10px;font:600 13px Inter,system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);background:' + (ok ? '#00358E' : '#b45309');
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 6000);
    }

    // ---- sign-in
    function hookSignIn() {
        var id = document.getElementById('si-id');
        var n = document.getElementById('si-name');
        if (!id || !n || !id.form) return false;
        var form = id.form;
        var label = form.querySelector('label[for="si-id"]');
        if (label) label.textContent = 'Student ID (V#)';
        id.placeholder = 'V00123456';
        var s = C() && C().student();
        if (s && !n.value && !id.value) { n.value = C().fullName(s); id.value = s.v; }
        // Capture phase on document runs before the app's own submit handler.
        document.addEventListener('submit', function (e) {
            if (e.target !== form || !C()) return;
            var v = C().normalizeV(id.value);
            if (!C().isValidV(v)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var err = form.querySelector('.serr');
                if (err) { err.hidden = false; err.textContent = C().V_HINT; }
                id.focus();
                return;
            }
            id.value = v;
            var name = n.value.trim();
            if (name.length >= 2) { C().rememberStudent(v, name); C().recordSignIn(SYSTEM); }
        }, true);
        return true;
    }

    // ---- completion
    function checkDone() {
        var rec = readJSON(RECORD_KEY);
        if (!rec || !rec.finishedAt || !C() || !C().connected) return;
        var studentId = C().normalizeV(rec.studentId);
        if (!C().isValidV(studentId)) return; // signed in before the V# rule; nothing valid to send
        var sent = readJSON(SENT_KEY) || {};
        var key = studentId + '|' + rec.finishedAt;
        if (sent[key]) return;
        sent[key] = true;
        try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch (e) {}
        var last = (rec.history || []).filter(function (h) { return h.finishedAt === rec.finishedAt; }).pop() || {};
        var label = TRACK + (last.status ? ' (' + last.status + ')' : '');
        C().saveResult({ system: SYSTEM, track: label, score: last.percent || 0, studentId: studentId, fullName: rec.name })
            .then(function (res) {
                if (res.ok) toast('Your result is saved to your C2C training record.', true);
                else if (res.queued) toast('The training server did not answer; your result will be re-sent automatically.', false);
                else toast('Your result could not be saved (' + (res.message || 'server error') + '). Show this screen to your teacher.', false);
            });
    }

    var tries = 0;
    var hooked = false;
    var timer = setInterval(function () {
        if (!hooked) hooked = hookSignIn();
        checkDone();
        if (++tries > 3600) clearInterval(timer); // stop after about two hours
    }, 2000);
})();
