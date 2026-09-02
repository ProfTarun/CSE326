/* =====================================================================
   CSE326 student site - shared application code
   ---------------------------------------------------------------------
   Everything runs in the browser. No server, no accounts, no sign-in.
   Progress lives in localStorage, so it is per-device and private to the
   student - nothing about them is ever sent anywhere.
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------- helpers -- */
function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
             "'": "&#39;" }[c];
  });
}

function toast(t) {
  var e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("on");
  setTimeout(function () { e.classList.remove("on"); }, 2200);
}

/* Data files sit beside the pages, so a relative path works whether the
   site is at the domain root or under /CSE326/ on GitHub Pages. */
async function loadJSON(name) {
  var r = await fetch("data/" + name);
  if (!r.ok) throw new Error("Could not load " + name);
  return await r.json();
}

/* ---------------------------------------------------------- progress -- */
/* One key holds everything, so a student can export or clear it in one go.
   Wrapped in try/catch because private-browsing modes throw on write. */
var Progress = (function () {
  var KEY = "cse326_progress";
  var data = null;

  function load() {
    if (data) return data;
    try { data = JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { data = {}; }
    data.lessons = data.lessons || {};
    data.drills = data.drills || {};
    data.practicals = data.practicals || {};
    data.quiz = data.quiz || {};
    data.log = data.log || [];
    data.started = data.started || new Date().toISOString().slice(0, 10);
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); }
    catch (e) { /* storage full or blocked - progress just will not stick */ }
  }

  function mark(kind, id, ok) {
    var d = load();
    if (!d[kind]) d[kind] = {};
    // Never downgrade a solved item back to unsolved.
    if (ok || !d[kind][id]) d[kind][id] = ok ? "done" : "tried";
    logIt(kind, id, ok);
    save();
  }

  function logIt(kind, id, ok) {
    var d = load();
    d.log.push({ t: Date.now(), kind: kind, id: id, ok: !!ok });
    if (d.log.length > 500) d.log = d.log.slice(-500);
  }

  function status(kind, id) { return load()[kind][id] || ""; }

  function count(kind, only) {
    var d = load()[kind] || {}, n = 0;
    for (var k in d) if (!only || d[k] === only) n++;
    return n;
  }

  function days() {
    var d = load(), set = {};
    d.log.forEach(function (e) {
      set[new Date(e.t).toISOString().slice(0, 10)] = 1;
    });
    return Object.keys(set).length;
  }

  function streak() {
    var d = load(), set = {};
    d.log.forEach(function (e) {
      set[new Date(e.t).toISOString().slice(0, 10)] = 1;
    });
    var n = 0, day = new Date();
    // Count back from yesterday too, so a student who has not practised
    // YET today still sees the streak they earned.
    if (!set[day.toISOString().slice(0, 10)]) day.setDate(day.getDate() - 1);
    while (set[day.toISOString().slice(0, 10)]) {
      n++;
      day.setDate(day.getDate() - 1);
    }
    return n;
  }

  function reset() {
    data = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function exportText() {
    var d = load();
    return JSON.stringify(d, null, 2);
  }

  return { mark: mark, status: status, count: count, days: days,
           streak: streak, reset: reset, all: load, save: save,
           exportText: exportText };
})();

/* ------------------------------------------------------------- nav ---- */
var NAV = [
  ["index.html", "Home"],
  ["learn.html", "Lessons"],
  ["drills.html", "Command drills"],
  ["practicals.html", "Practicals"],
  ["reference.html", "Tag reference"],
  ["test.html", "Mock test"],
  ["progress.html", "My progress"]
];

function topbar(current) {
  return '<div class="topbar">' +
    '<a class="logo" href="index.html"><span class="mark"></span>CSE326</a>' +
    "<nav>" + NAV.map(function (n) {
      return '<a href="' + n[0] + '"' +
        (n[0] === current ? ' class="on"' : "") + ">" + n[1] + "</a>";
    }).join("") + "</nav><span class=\"sp\"></span>" +
    '<span class="who" id="who"></span></div>';
}

function footer() {
  return '<div class="foot">CSE326 Internet Programming &middot; ' +
    "self-study portal<br>Everything runs in your browser &mdash; " +
    "<b>your work never leaves this device</b>.</div>";
}

function mountShell(current) {
  document.body.insertAdjacentHTML("afterbegin", topbar(current));
  document.body.insertAdjacentHTML("beforeend", footer());
  document.body.insertAdjacentHTML("beforeend",
    '<div class="toast" id="toast"></div>');
}

/* ------------------------------------------------- practice widget ---- */
/* Used identically by lessons, drills and practicals - one editor, a live
   preview, and marking against the same check schema. */
function PracticePad(opts) {
  // opts: mount, id, kind, starter, checks, solution, onSolved
  var wrap = opts.mount;
  var uid = "p_" + Math.random().toString(36).slice(2, 8);
  var draftKey = "cse326_draft_" + opts.kind + "_" + opts.id;
  var saved = "";
  try { saved = sessionStorage.getItem(draftKey) || ""; } catch (e) {}

  wrap.innerHTML =
    '<div class="lab">' +
      '<div class="pane"><div class="pbar">Your code</div>' +
        '<textarea id="' + uid + '_code" spellcheck="false"></textarea></div>' +
      '<div class="pane"><div class="pbar">Live preview</div>' +
        '<iframe id="' + uid + '_pv" sandbox="allow-scripts"></iframe>' +
      "</div></div>" +
    '<div class="acts">' +
      '<button class="btn saf" id="' + uid + '_run">&#9654; Run</button>' +
      '<button class="btn grn" id="' + uid + '_chk">&#10003; Check my work' +
      "</button>" +
      '<button class="btn ghost" id="' + uid + '_hint">Show a hint</button>' +
      '<button class="btn ghost" id="' + uid + '_sol">Show the answer' +
      "</button>" +
      '<button class="btn ghost" id="' + uid + '_rst">Start over</button>' +
    "</div><div id=\"" + uid + "_res\"></div>";

  var code = $(uid + "_code"), pv = $(uid + "_pv"), res = $(uid + "_res");
  code.value = saved || opts.starter || "";

  function run() { pv.srcdoc = code.value; }

  var t;
  code.addEventListener("input", function () {
    try { sessionStorage.setItem(draftKey, code.value); } catch (e) {}
    clearTimeout(t);
    t = setTimeout(run, 400);
  });

  $(uid + "_run").onclick = run;
  $(uid + "_rst").onclick = function () {
    code.value = opts.starter || "";
    try { sessionStorage.removeItem(draftKey); } catch (e) {}
    res.innerHTML = "";
    run();
  };
  $(uid + "_hint").onclick = function () {
    var r = Check.code(code.value, opts.checks);
    var first = r.results.filter(function (x) { return !x.ok; })[0];
    res.innerHTML = first
      ? '<div class="note"><b>Hint:</b> ' + esc(first.hint) + "</div>"
      : '<div class="win">Nothing left to fix - press Check my work.</div>';
  };
  $(uid + "_sol").onclick = function () {
    if (!opts.solution) { toast("No worked answer for this one"); return; }
    res.innerHTML = '<div class="note"><b>One correct answer.</b> Read it, ' +
      "then close it and type your own - copying it teaches nothing.</div>" +
      "<pre class=\"code\">" + esc(opts.solution) + "</pre>";
  };

  $(uid + "_chk").onclick = function () {
    run();
    var r = Check.code(code.value, opts.checks);
    var pct = r.total ? Math.round(r.passed / r.total * 100) : 0;
    var h = '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="mut" style="margin:0 0 10px;font-weight:600">' +
      r.passed + " of " + r.total + " requirements met</p>" +
      r.results.map(function (x) {
        return '<div class="chk ' + (x.ok ? "ok" : "no") + '">' +
          '<span class="ic">' + (x.ok ? "&#10003;" : "&#10007;") +
          "</span><span>" + esc(x.label) +
          (x.ok ? "" : " &mdash; " + esc(x.hint)) + "</span></div>";
      }).join("");

    Check.slips(code.value).forEach(function (n) {
      h += '<div class="note"><b>Also spotted:</b> ' + esc(n) + "</div>";
    });

    if (r.all_ok) {
      h += '<div class="win"><b>All checks passed.</b> Saved to your ' +
        "progress.</div>";
    }
    res.innerHTML = h;

    Progress.mark(opts.kind, opts.id, r.all_ok);
    if (r.all_ok && opts.onSolved) opts.onSolved();
  };

  run();
}
