/* My learning report.
 *
 * The teacher's app publishes one locked file per student in
 * data/learning/<test>/s/<id>.bin. A file is found by a hash of the
 * registration number and opened with a key made from the registration number
 * and the student's code - all in this browser; nothing is sent anywhere.
 * What opens is the student's marks, analysis and AI-written learning report,
 * set next to the chapters of this textbook that teach what they got wrong.
 */
"use strict";
mountShell("learning.html");

var TESTS = [], BOOK = null;

function utf8(s) { return new TextEncoder().encode(s); }
function hex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
function unhex(h) {
  var b = new Uint8Array(h.length / 2);
  for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
  return b;
}
function normReg(s) { return String(s || "").replace(/[^0-9]/g, ""); }
function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function round(v) { return Math.round(v); }
function fmt(v) { return (Math.round(v * 100) / 100).toString(); }

async function fetchJSON(path) {
  var r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? "missing" : "Could not load " + path);
  return r.json();
}

/* ------------------------------------------------------------ opening ---- */
async function openReport(test, reg, code) {
  var base = "data/learning/" + encodeURIComponent(test.id) + "/";
  var man = await fetchJSON(base + "manifest.json");
  var id = hex(await crypto.subtle.digest("SHA-256", utf8(man.kdf.salt + ":" + reg))).slice(0, 24);
  var r = await fetch(base + "s/" + id + ".bin", { cache: "no-store" });
  if (r.status === 404) { var e = new Error("notfound"); e.kind = "notfound"; throw e; }
  if (!r.ok) throw new Error("Could not load your report (" + r.status + ")");
  var buf = new Uint8Array(await r.arrayBuffer());
  var s1 = unhex(man.kdf.salt), s2 = utf8(id), salt = new Uint8Array(s1.length + s2.length);
  salt.set(s1, 0); salt.set(s2, s1.length);
  var pw = await crypto.subtle.importKey("raw", utf8(reg + ":" + code), "PBKDF2", false, ["deriveKey"]);
  var key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: man.kdf.iter, hash: "SHA-256" },
    pw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  var plain;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  } catch (x) { var w = new Error("badcode"); w.kind = "badcode"; throw w; }
  var text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return { man: man, data: JSON.parse(text) };
}

/* ------------------------------------------------- the textbook link ---- */
var STOP = { the: 1, and: 1, "of": 1, "in": 1, to: 1, a: 1, an: 1, "is": 1, "for": 1, "with": 1, which: 1,
  what: 1, does: 1, this: 1, that: 1, these: 1, html: 1, css: 1 };

function words(s) {
  return String(s || "").toLowerCase().replace(/<[^>]*>/g, " ").replace(/[^a-z0-9#.:\- ]+/g, " ")
    .split(/\s+/).filter(function (w) { return w.length > 2 && !STOP[w]; });
}

/* The chapters that teach a topic: keyword phrases found in the topic name and
   its questions, longer phrases counting more; the title helps break ties. */
/* Lower case, punctuation gone, plurals made singular ("headings" finds the
   chapter keyed "heading"). */
function flat(s) {
  return " " + String(s || "").toLowerCase().replace(/[^a-z0-9#-]+/g, " ").trim().split(/\s+/).map(function (w) {
    return w.length > 4 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w;
  }).join(" ") + " ";
}

function chaptersFor(topic, questions) {
  if (!BOOK) return [];
  var tn = flat(topic), qn = flat(questions.join(" "));
  var scored = [];
  BOOK.chapters.forEach(function (c) {
    if (c.unit === "ap") return;
    var s = 0;
    (c.keywords || []).forEach(function (k) {
      var kk = flat(k);
      if (kk.length < 4) return;
      var weight = 1 + kk.trim().split(" ").length;
      if (tn.indexOf(kk) >= 0) s += 3 * weight;
      else if (qn.indexOf(kk) >= 0) s += weight;
    });
    words(c.title).map(function (w) { return flat(w).trim(); }).forEach(function (w) {
      if (tn.indexOf(" " + w + " ") >= 0) s += 3;
      else if (qn.indexOf(" " + w + " ") >= 0) s += 1;
    });
    if (s >= 3) scored.push({ c: c, s: s });
  });
  scored.sort(function (a, b) { return b.s - a.s; });
  var top = scored.slice(0, 2);
  if (top.length === 2 && top[1].s < 0.5 * top[0].s) top.pop();
  return top.map(function (x) { return x.c; });
}

var LEADS = {};
async function leadOf(c) {
  if (LEADS[c.id] !== undefined) return LEADS[c.id];
  try {
    var r = await fetch("data/book/" + c.file);
    var doc = new DOMParser().parseFromString(await r.text(), "text/html");
    var p = doc.querySelector(".lead");
    var t = p ? p.textContent.trim() : "";
    LEADS[c.id] = t.length > 300 ? t.slice(0, 297).replace(/\s+\S*$/, "") + "…" : t;
  } catch (e) { LEADS[c.id] = ""; }
  return LEADS[c.id];
}

/* ------------------------------------------------------------ drawing ---- */
function kpi(big, small, cls) {
  return '<div class="kpi ' + (cls || "") + '"><b>' + esc(big) + "</b><span>" + esc(small) + "</span></div>";
}

async function render(test, man, d) {
  var cls = d.pct >= 70 ? "good" : d.pct >= d.passMark ? "mid" : "low";
  var det = [];
  if (d.section) det.push("Section " + d.section);
  Object.keys(d.details || {}).forEach(function (k) { det.push(k + " " + d.details[k]); });
  var h = '<div class="card"><div class="who"><div><h2>' + esc(d.name || d.reg) + "</h2>" +
    '<div class="sub">Reg. ' + esc(d.reg) + " &middot; Set " + esc(d.set) + (det.length ? " &middot; " + esc(det.join(" · ")) : "") +
    "</div></div><div style=\"text-align:right\"><span class=\"pill " + cls + "\">" + esc(d.band) + "</span>" +
    '<div class="sub">' + esc(man.title) + (man.date ? " &middot; " + esc(man.date) : "") + "</div></div></div>" +
    '<div class="kpis">' +
    kpi(fmt(d.score) + " / " + fmt(d.max), "your marks", cls) +
    kpi(round(d.pct) + "%", "of the maximum", cls) +
    kpi(d.rank + " of " + d.n, "rank in the class") +
    kpi(fmt(d.classMeanMarks) + " (" + round(d.classMean) + "%)", "class average") +
    kpi(d.right + " / " + d.wrong + " / " + d.blank, "right / wrong / blank") +
    "</div></div>";

  if (d.advice && d.advice.length)
    h += '<div class="card"><h2>What to work on</h2><ul class="adv">' +
      d.advice.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></div>";

  if (d.topics && d.topics.length > 1) {
    h += '<div class="card"><h2>Topics &mdash; you against the class</h2><div class="bars">';
    d.topics.forEach(function (t) {
      var c = t.pct >= 70 ? "good" : t.pct >= d.passMark ? "mid" : "low";
      h += '<div class="bar"><span>' + esc(t.name) + '</span><span class="bt"><i class="' + c + '" style="width:' +
        round(t.pct) + '%"></i><em style="left:' + round(t.classPct) + '%" title="class average"></em></span>' +
        '<span class="bv">' + round(t.pct) + "%</span></div>";
    });
    h += '</div><p class="hint">Bar: your share of the marks on the topic. Dark line: the class average.</p></div>';
  }

  // the plan: per topic, the questions to revise and the chapters that teach them
  var byTopic = {}, order = [];
  (d.todo || []).forEach(function (q) {
    if (!byTopic[q.topic]) { byTopic[q.topic] = { qs: [], lost: 0 }; order.push(q.topic); }
    byTopic[q.topic].qs.push(q);
    byTopic[q.topic].lost += q.worth || 1;
  });
  order.sort(function (a, b) { return byTopic[b].lost - byTopic[a].lost; });
  if (order.length) {
    h += '<div class="card"><h2>Your learning plan</h2><p class="hint" style="margin-top:0">One topic at a time: ' +
      "see what went wrong, read the chapter of the textbook, then work through the same topic in your " +
      "learning report below &mdash; explanations, a live simulation and questions to try again.</p>";
    for (var i = 0; i < order.length; i++) {
      var t = order[i], g = byTopic[t];
      h += '<div class="topic"><h3>' + (i + 1) + ". " + esc(t) + '</h3><div class="lost">' + g.qs.length +
        (g.qs.length === 1 ? " question" : " questions") + " &middot; " + fmt(g.lost) + (g.lost === 1 ? " mark" : " marks") +
        ' to win back</div><ul class="qs">';
      g.qs.forEach(function (q) {
        var yours = q.outcome === "blank" ? "left blank" : q.outcome === "two" ? "two bubbles filled"
          : q.yours + (q.yoursText ? ". " + q.yoursText : "");
        h += "<li><b>Q" + q.q + ".</b> " + esc(q.text) + '<div class="ans">Your answer: <b class="bad">' + esc(yours) +
          '</b> &middot; Right answer: <b class="ok">' + esc(q.correct + (q.correctText ? ". " + q.correctText : "")) +
          "</b></div></li>";
      });
      h += '</ul><div class="book" id="bk' + i + '"></div></div>';
    }
    h += "</div>";
  } else {
    h += '<div class="card"><h2>Every question right</h2><p>Nothing to revise from this test &mdash; well done.</p></div>';
  }

  h += '<div class="card"><h2>Your learning report</h2>' +
    '<p class="hint" style="margin-top:0">Written for you from the answers you gave: why each one was not right, the ' +
    "lesson behind it, live simulations to try, and the question again until you find the right option.</p>" +
    '<iframe class="rep" id="rep" sandbox="allow-scripts allow-popups" title="Learning report"></iframe>' +
    '<div class="acts"><button class="btn ghost sm" id="save" type="button">Save my report (opens offline)</button>' +
    '<button class="btn ghost sm" id="prt" type="button">Print</button>' +
    '<button class="btn ghost sm" id="lock" type="button">Lock it again</button></div>' +
    '<p class="lock">Locking clears it from this screen. Your code is never stored on this device.</p></div>';

  $("out").innerHTML = h;

  // the report itself, sized to its content
  var sizer = "<scr" + "ipt>(function(){function h(){parent.postMessage({lrH:Math.max(document.documentElement.scrollHeight," +
    "document.body?document.body.scrollHeight:0)},\"*\")}addEventListener(\"load\",h);setTimeout(h,500);" +
    "if(window.ResizeObserver)new ResizeObserver(h).observe(document.documentElement)})()<\/scr" + "ipt>";
  var rep = $("rep");
  // this site has no dark theme, so the report keeps its light one too
  // and its summary is already on this page: show only the topic lessons here
  var only = "<style>header.top,main>section:not(.topic){display:none}</style>";
  rep.srcdoc = d.html.split("@media (prefers-color-scheme:dark)").join("@media (max-width:0px)") + only + sizer;
  $("save").onclick = function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([d.html], { type: "text/html" }));
    a.download = "learning-report-" + (d.reg || "me") + ".html";
    a.click();
  };
  $("prt").onclick = function () { window.print(); };
  $("lock").onclick = function () { $("out").innerHTML = ""; $("code").value = ""; $("gate").style.display = ""; window.scrollTo(0, 0); };

  // the textbook, topic by topic
  for (var j = 0; j < order.length; j++) {
    var tp = order[j], list = chaptersFor(tp, byTopic[tp].qs.map(function (q) { return q.text + " " + q.correctText; }));
    var box = $("bk" + j);
    if (!list.length) { box.innerHTML = ""; continue; }
    var html = "";
    for (var k = 0; k < list.length; k++) {
      var c = list[k], lead = await leadOf(c);
      html += '<div class="bk"><span class="n">' + c.n + "</span><div><b>Read in your textbook: Chapter " + c.n + ". " +
        esc(c.title) + "</b>" + (lead ? "<p>" + esc(lead) + "</p>" : "") + '<a href="book.html?ch=' + c.n + '">Open chapter ' +
        c.n + " &rarr;</a> <span class=\"lock\">&middot; about " + (c.minutes || "") + " minutes</span></div></div>";
    }
    box.innerHTML = html;
  }
}

window.addEventListener("message", function (e) {
  var h = e.data && e.data.lrH;
  var f = $("rep");
  if (typeof h !== "number" || !f || e.source !== f.contentWindow) return;
  f.style.height = Math.min(30000, Math.max(400, h + 20)) + "px";
});

/* -------------------------------------------------------------- start ---- */
function say(text) { $("msg").innerHTML = text ? '<div class="err">' + text + "</div>" : ""; }

async function go() {
  var t = TESTS[$("test").selectedIndex];
  var reg = normReg($("reg").value), code = normCode($("code").value);
  if (!t) { say("No test has been published yet."); return; }
  if (reg.length < 4) { say("Type your registration number."); return; }
  if (code.length < 8) { say("Type the 8-character code from your teacher."); return; }
  say("");
  var b = $("open");
  b.disabled = true; b.textContent = "Opening…";
  try {
    try { localStorage.setItem("cse326_learning_reg", reg); } catch (e) {}
    var r = await openReport(t, reg, code);
    $("gate").style.display = "none";
    await render(t, r.man, r.data);
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.kind === "notfound") say("There is no report for registration number <b>" + esc(reg) + "</b> in " + esc(t.title) +
      ". Check the number, or choose another test.");
    else if (e.kind === "badcode") say("That code does not open the report for " + esc(reg) + ". Check each character " +
      "(there is no letter O, I or L and no digit 0 or 1 in a code).");
    else say(esc(e.message || String(e)));
  } finally {
    b.disabled = false; b.textContent = "Open my report";
  }
}

(async function () {
  if (!window.crypto || !crypto.subtle || typeof DecompressionStream === "undefined") {
    say("This browser is too old to open the report. Use a current Chrome, Edge, Firefox or Safari.");
    return;
  }
  try { $("reg").value = localStorage.getItem("cse326_learning_reg") || ""; } catch (e) {}
  try {
    var list = await fetchJSON("data/learning/tests.json");
    TESTS = (list.tests || []).slice().sort(function (a, b) { return (b.published || "").localeCompare(a.published || ""); });
  } catch (e) { TESTS = []; }
  var sel = $("test");
  sel.innerHTML = TESTS.length ? TESTS.map(function (t) {
    return "<option>" + esc(t.title + (t.date ? " — " + t.date : "")) + "</option>";
  }).join("") : "<option>No test published yet</option>";
  if (TESTS.length <= 1) $("testRow").style.display = TESTS.length ? "none" : "";
  try { BOOK = await loadJSON("book/index.json"); } catch (e) { BOOK = null; }
  $("open").onclick = go;
  $("code").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
})();
