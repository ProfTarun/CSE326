/* =====================================================================
   CSE326 textbook reader
   ---------------------------------------------------------------------
   Loads data/book/index.json (the chapter list) and one chapter file at a
   time (data/book/chNN.html). Everything else - the table of contents,
   runnable examples, book-wide search, reading position and the
   audiobook - lives here. No server, no accounts: reading position is
   kept in localStorage on this device only.
   ===================================================================== */
"use strict";

var BOOK = null;          // { units: [...], chapters: [...] }
var CH = null;            // the chapter currently open (index.json entry)
var CACHE = {};           // chapter html by id, for search

/* ---------------------------------------------------------- storage -- */
var Store = (function () {
  var KEY = "cse326_book", d = null;
  function load() {
    if (d) return d;
    try { d = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { d = {}; }
    d.read = d.read || {};
    d.last = d.last || null;
    d.font = d.font || "";
    d.rate = d.rate || 1;
    d.voice = d.voice || "";
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) {}
  }
  return { get: load, save: save };
})();

/* ------------------------------------------------------------ helpers -- */
function chapterByN(n) {
  return BOOK.chapters.filter(function (c) { return c.n === n; })[0] || null;
}
function unitTitle(id) {
  var u = BOOK.units.filter(function (x) { return x.id === id; })[0];
  return u ? u.title : id;
}
function plain(html) {
  var t = document.createElement("div");
  t.innerHTML = html;
  return t.textContent || "";
}

/* ---------------------------------------------------------- sidebar -- */
function drawSide(filter) {
  var s = Store.get(), q = (filter || "").trim().toLowerCase();
  var h = '<button class="btn ghost sm toc-toggle" onclick="toggleToc()">' +
    "&#9776; Contents</button>" +
    '<div class="toc" id="toc">' +
    '<input class="toc-search" id="tocq" placeholder="Find a chapter or ' +
    'search the book&hellip;" value="' + esc(filter || "") + '" ' +
    'oninput="drawSide(this.value)" onkeydown="if(event.key===\'Enter\')' +
    'searchBook(this.value)">' +
    '<div class="toc-tools">' +
      '<button class="btn ghost sm" onclick="searchBook($(\'tocq\').value)">' +
      "&#128269; Search whole book</button>" +
      '<button class="btn ghost sm" title="Smaller text" onclick="font(-1)">A&minus;</button>' +
      '<button class="btn ghost sm" title="Larger text" onclick="font(1)">A+</button>' +
    "</div>" +
    '<a href="book.html" onclick="return go(event,0)" class="' +
    (CH ? "" : "on") + '"><span class="n">&#9783;</span><span>Cover and ' +
    "exam map</span></a>";

  BOOK.units.forEach(function (u) {
    var chs = BOOK.chapters.filter(function (c) {
      if (c.unit !== u.id) return false;
      if (!q) return true;
      return (c.title + " " + (c.keywords || []).join(" ")).toLowerCase()
        .indexOf(q) > -1;
    });
    if (!chs.length) return;
    h += '<div class="toc-unit">' + u.title + "</div>";
    chs.forEach(function (c) {
      var cls = (CH && CH.n === c.n ? "on" : "") + (s.read[c.id] ? " read" : "");
      h += '<a href="book.html?ch=' + c.n + '" class="' + cls + '" ' +
        'onclick="return go(event,' + c.n + ')"><span class="n">' +
        (s.read[c.id] ? "&#10003;" : c.n) + "</span><span>" + esc(c.title) +
        "</span></a>";
    });
  });
  h += "</div>";
  var side = $("side");
  // On a phone the contents list would push the chapter far down the
  // page, so it starts collapsed there and opens from the button.
  var wasCollapsed = side.dataset.init ? side.classList.contains("collapsed")
    : window.innerWidth <= 900;
  side.dataset.init = "1";
  side.innerHTML = h;
  side.classList.toggle("collapsed", wasCollapsed);
  if (filter !== undefined) {
    var inp = $("tocq");
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

function toggleToc() { $("side").classList.toggle("collapsed"); }

function font(d) {
  var s = Store.get(), steps = ["f-sm", "", "f-lg", "f-xl"];
  var i = Math.max(0, Math.min(steps.length - 1, steps.indexOf(s.font) + d));
  s.font = steps[i];
  Store.save();
  applyFont();
}
function applyFont() {
  var el = document.querySelector(".chapter");
  if (!el) return;
  el.classList.remove("f-sm", "f-lg", "f-xl");
  if (Store.get().font) el.classList.add(Store.get().font);
}

/* Links to book.html?ch=N (in the sidebar and inside chapters) load
   without a full page reload, so the audio bar and position survive. */
function go(e, n, hash) {
  if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) return true;
  if (e) e.preventDefault();
  if (n) openChapter(n, hash || ""); else showCover();
  return false;
}

/* ------------------------------------------------------------- cover -- */
function showCover() {
  TTS.stop();
  CH = null;
  var s = Store.get();
  history.replaceState(null, "", "book.html");
  document.title = "Textbook | CSE326 Internet Programming";
  var last = s.last && chapterByN(s.last.ch);
  var readN = Object.keys(s.read).length;

  var h = '<div class="cover"><div>' +
    '<p class="eyebrow">CSE326 &middot; Units 1 and 2 &middot; Textbook</p>' +
    "<h1>HTML, explained properly.</h1>" +
    "<p>Twenty-one chapters that cover every syllabus topic in Units 1 and 2 " +
    "the way a good book would: the idea first, then worked examples you can " +
    "run, diagrams and flowcharts for the parts people get wrong, and exam-" +
    "style checks at the end of every chapter. Read it, or press " +
    "<b>Listen</b> and let it read to you.</p>" +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">' +
    (last
      ? '<a class="btn saf" href="book.html?ch=' + last.n +
        '" onclick="return go(event,' + last.n + ')">Continue: Ch ' + last.n +
        " &middot; " + esc(last.title.slice(0, 30)) +
        (last.title.length > 30 ? "&hellip;" : "") + "</a>"
      : '<a class="btn saf" href="book.html?ch=1" onclick="return go(event,1)">' +
        "Start at Chapter 1 &rarr;</a>") +
    '<a class="btn ghost" href="test.html">Sit a mock test</a></div>' +
    '<p class="mut" style="font-size:13.5px;margin-top:12px">' + readN +
    " of " + BOOK.chapters.length + " chapters marked as read on this " +
    "device.</p></div>" +
    '<div class="art">' + coverArt() + "</div></div>";

  h += '<div class="units">';
  BOOK.units.forEach(function (u) {
    h += '<div class="unit-card"><h2>' + u.title + "</h2><p>" + esc(u.desc) +
      "</p><ol>";
    BOOK.chapters.filter(function (c) { return c.unit === u.id; })
      .forEach(function (c) {
        h += '<li value="' + c.n + '"' + (s.read[c.id] ? ' class="read"' : "") +
          '><a href="book.html?ch=' + c.n + '" onclick="return go(event,' +
          c.n + ')">' + esc(c.title) + "</a></li>";
      });
    h += "</ol></div>";
  });
  h += "</div>";

  h += '<div class="card"><h2>How to use this book</h2>' +
    '<ul style="line-height:1.8;margin:0;padding-left:22px;color:var(--ink-2)">' +
    "<li><b>Read a chapter end to end</b> before touching the drills. Each " +
    "one is 15&ndash;30 minutes. The theory is complete: you should not need " +
    "another website afterwards.</li>" +
    "<li><b>Run the examples.</b> Every code block with a &#9654; Run " +
    "button renders right there on the page. Change it in the Playground " +
    "if you want to experiment.</li>" +
    "<li><b>Open the exam-style checks</b> at the end of a chapter and " +
    "answer before you reveal. They are written in the CA2 style: four " +
    "options, one right, and a reason.</li>" +
    "<li><b>Use Listen.</b> The audiobook button reads the chapter aloud " +
    "in your browser's voice, highlighting each paragraph as it goes. " +
    "Good for revision on the bus.</li>" +
    "<li><b>Search the whole book</b> from the box on the left when you " +
    "half-remember a tag but not where it was explained.</li></ul></div>";

  h += '<div class="card" style="margin-top:16px"><h2>Exam map: where the ' +
    "CA2 paper comes from</h2>" +
    '<p style="line-height:1.7;color:var(--ink-2);margin:0 0 10px">The CA2 ' +
    "MCQ test has 30 questions from Units 1 and 2, one mark each, with " +
    "<b>&minus;0.25</b> for a wrong answer and 0 for a blank. Each question " +
    "is tagged with a course outcome and a level:</p>" +
    '<div class="tbl-wrap"><table class="tbl"><tr><th>Tag</th><th>Meaning' +
    "</th><th>Where in this book</th></tr>" +
    "<tr><td><b>CO1</b></td><td>HTML fundamentals</td><td>Chapters 1&ndash;12 " +
    "(Unit 1)</td></tr>" +
    "<tr><td><b>CO2</b></td><td>Semantic HTML, forms, tables, accessibility" +
    "</td><td>Chapters 13&ndash;21 (Unit 2)</td></tr>" +
    "<tr><td><b>L1</b></td><td>Remember: which tag, which attribute</td>" +
    "<td>The <i>Quick revision</i> table at the end of every chapter</td></tr>" +
    "<tr><td><b>L2</b></td><td>Understand: what it does and why</td>" +
    "<td>The main explanations and diagrams</td></tr>" +
    "<tr><td><b>L3</b></td><td>Apply: read a snippet, spot the mistake, pick " +
    "the fix</td><td>The worked examples and <i>Exam-style checks</i></td></tr>" +
    "</table></div></div>";

  $("main").innerHTML = h;
  drawSide();
  window.scrollTo(0, 0);
  setProg(0);
}

function coverArt() {
  return '<svg viewBox="0 0 420 300" role="img" aria-label="An open book ' +
    'showing HTML tags">' +
    '<defs><linearGradient id="cg" x1="0" x2="1"><stop offset="0" ' +
    'stop-color="#FF9933"/><stop offset="1" stop-color="#138808"/>' +
    "</linearGradient></defs>" +
    '<rect x="30" y="40" width="360" height="230" rx="16" fill="#fff" ' +
    'stroke="#E3E9F0"/>' +
    '<path d="M210 60 L210 250" stroke="#E3E9F0" stroke-width="2"/>' +
    '<rect x="48" y="62" width="150" height="10" rx="5" fill="url(#cg)"/>' +
    '<g font-family="Cascadia Code,Consolas,monospace" font-size="12" ' +
    'fill="#3C4A60">' +
    '<text x="48" y="96">&lt;!DOCTYPE html&gt;</text>' +
    '<text x="48" y="116">&lt;html lang="en"&gt;</text>' +
    '<text x="60" y="136">&lt;head&gt;</text>' +
    '<text x="72" y="156">&lt;title&gt;CSE326&lt;/title&gt;</text>' +
    '<text x="60" y="176">&lt;/head&gt;</text>' +
    '<text x="60" y="196">&lt;body&gt;</text>' +
    '<text x="72" y="216">&lt;h1&gt;Hello, web!&lt;/h1&gt;</text>' +
    '<text x="60" y="236">&lt;/body&gt;</text>' +
    "</g>" +
    '<rect x="228" y="62" width="110" height="10" rx="5" fill="#E9F7E7"/>' +
    '<rect x="228" y="90" width="150" height="8" rx="4" fill="#F1F4F8"/>' +
    '<rect x="228" y="106" width="130" height="8" rx="4" fill="#F1F4F8"/>' +
    '<rect x="228" y="122" width="140" height="8" rx="4" fill="#F1F4F8"/>' +
    '<rect x="228" y="150" width="150" height="70" rx="10" fill="#FFF1E0"/>' +
    '<circle cx="262" cy="185" r="18" fill="#FF9933"/>' +
    '<rect x="292" y="168" width="70" height="34" rx="6" fill="#138808"/>' +
    '<text x="228" y="246" font-size="12" fill="#6B7A90" ' +
    'font-family="Segoe UI,system-ui,sans-serif">Fig. what the browser draws' +
    "</text>" +
    '<path d="M30 270 Q210 290 390 270" fill="none" stroke="#0B2545" ' +
    'stroke-width="2.5"/></svg>';
}

/* ----------------------------------------------------------- chapter -- */
async function openChapter(n, hash) {
  var c = chapterByN(n);
  if (!c) { showCover(); return; }
  TTS.stop();
  CH = c;
  history.replaceState(null, "", "book.html?ch=" + n + (hash || ""));
  document.title = "Ch " + n + ": " + c.title + " | CSE326 textbook";
  $("main").innerHTML = '<div class="empty"><span class="spin"></span> ' +
    "Loading chapter " + n + "&hellip;</div>";
  drawSide();
  window.scrollTo(0, 0);

  var html;
  try {
    html = await fetchChapter(c);
  } catch (e) {
    $("main").innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    return;
  }

  var s = Store.get();
  var prev = chapterByN(n - 1), next = chapterByN(n + 1);
  $("main").innerHTML =
    listenBar() +
    html +
    '<div class="ch-nav">' +
    (prev ? '<a class="btn ghost" href="book.html?ch=' + prev.n +
      '" onclick="return go(event,' + prev.n + ')">&larr; Ch ' + prev.n +
      ": " + esc(prev.title) + "</a>" : "<span></span>") +
    '<button class="btn grn" id="markRead" onclick="markRead()">' +
    (s.read[c.id] ? "Marked as read &#10003;" : "Mark chapter as read") +
    "</button>" +
    (next ? '<a class="btn saf" href="book.html?ch=' + next.n +
      '" onclick="return go(event,' + next.n + ')">Ch ' + next.n + ": " +
      esc(next.title) + " &rarr;</a>" : '<a class="btn saf" href="test.html">' +
      "Finished! Sit a mock test &rarr;</a>") +
    "</div>";

  enhanceChapter();
  applyFont();
  TTS.bind();

  s.last = { ch: n, t: Date.now() };
  Store.save();

  if (hash) {
    var target = document.querySelector(hash);
    if (target) target.scrollIntoView({ block: "start" });
  } else {
    window.scrollTo(0, 0);
  }
  watchEnd();
}

async function fetchChapter(c) {
  if (CACHE[c.id]) return CACHE[c.id];
  // no-cache = revalidate with the server, so an updated chapter shows up
  // as soon as it is uploaded instead of after the browser's cache expires
  var r = await fetch("data/book/" + c.file, { cache: "no-cache" });
  if (!r.ok) throw new Error("Could not load " + c.file);
  var t = await r.text();
  CACHE[c.id] = t;
  return t;
}

/* Turn every <pre class="code" data-run> into a runnable example with a
   toolbar and a preview frame, and add a Listen button to each section. */
function enhanceChapter() {
  var root = document.querySelector(".chapter");
  if (!root) return;

  root.querySelectorAll("pre.code[data-run]").forEach(function (pre, i) {
    var wrap = document.createElement("div");
    wrap.className = "ex" + (pre.dataset.tall != null ? " tall" : "");
    var title = pre.dataset.title || "Example";
    wrap.innerHTML = '<div class="ex-bar"><span>' + esc(title) +
      '</span><span class="sp"></span>' +
      '<button class="btn saf" data-act="run">&#9654; Run</button>' +
      '<button class="btn ghost" data-act="copy">Copy</button>' +
      '<button class="btn ghost" data-act="play">Open in Playground</button>' +
      "</div>";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    var fr = document.createElement("iframe");
    fr.setAttribute("sandbox", "allow-scripts allow-forms allow-modals");
    fr.setAttribute("title", "Preview of " + title);
    if (pre.dataset.h) fr.style.height = pre.dataset.h + "px";
    wrap.appendChild(fr);
    wrap.querySelector('[data-act="run"]').onclick = function () {
      fr.srcdoc = pre.textContent;
      fr.classList.add("on");
      this.innerHTML = "&#8635; Run again";
    };
    wrap.querySelector('[data-act="copy"]').onclick = function () {
      var code = pre.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () {
          toast("Copied");
        }, function () { toast("Select the code and copy it manually"); });
      } else toast("Select the code and copy it manually");
    };
    wrap.querySelector('[data-act="play"]').onclick = function () {
      try { localStorage.setItem("cse326_play_seed", pre.textContent); }
      catch (e) {}
      window.open("playground.html?from=book", "_blank");
    };
  });

  // per-section listen buttons
  root.querySelectorAll("section > h2").forEach(function (h2) {
    if (!("speechSynthesis" in window)) return;
    var b = document.createElement("button");
    b.className = "sec-listen";
    b.innerHTML = "&#128264; Listen";
    b.title = "Read aloud from this section";
    b.setAttribute("data-tts", "skip");
    b.onclick = function () { TTS.playFrom(h2); };
    h2.appendChild(b);
  });

  // "Chapter 8" in the prose becomes a link to chapter 8
  linkChapterMentions(root);

  // links to other chapters stay inside the reader
  root.querySelectorAll('a[href^="book.html?ch="]').forEach(function (a) {
    var m = a.getAttribute("href").match(/ch=(\d+)(#[\w-]+)?/);
    if (!m) return;
    a.onclick = function (e) { return go(e, parseInt(m[1], 10), m[2] || ""); };
  });

  // wide tables scroll inside their own box
  root.querySelectorAll("table.tbl").forEach(function (t) {
    if (t.parentNode.classList.contains("tbl-wrap")) return;
    var w = document.createElement("div");
    w.className = "tbl-wrap";
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });
}

function linkChapterMentions(root) {
  var skip = /^(A|PRE|CODE|H1|SVG|SCRIPT|STYLE|BUTTON)$/;
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (t) {
      if (!/Chapters? \d/.test(t.nodeValue)) return NodeFilter.FILTER_REJECT;
      for (var e = t.parentNode; e && e !== root; e = e.parentNode) {
        if (skip.test(e.nodeName) || e.classList.contains("eyebrow") ||
            e.classList.contains("meta")) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function (t) {
    var frag = document.createDocumentFragment(), last = 0, m;
    var re = /Chapters? (\d{1,2})/g, s = t.nodeValue;
    while ((m = re.exec(s))) {
      var n = parseInt(m[1], 10);
      if (!chapterByN(n) || (CH && n === CH.n)) continue;
      frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      var a = document.createElement("a");
      a.href = "book.html?ch=" + n;
      a.textContent = m[0];
      a.title = "Go to chapter " + n;
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    if (!last) return;
    frag.appendChild(document.createTextNode(s.slice(last)));
    t.parentNode.replaceChild(frag, t);
  });
}

function markRead() {
  if (!CH) return;
  var s = Store.get();
  s.read[CH.id] = true;
  Store.save();
  var b = $("markRead");
  if (b) b.innerHTML = "Marked as read &#10003;";
  drawSide();
  toast("Chapter " + CH.n + " marked as read");
}

/* Reaching the end of a chapter counts as reading it. */
function watchEnd() {
  var nav = document.querySelector(".ch-nav");
  if (!nav || !("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (en) {
    if (en[0].isIntersecting && CH && !Store.get().read[CH.id]) {
      var s = Store.get();
      s.read[CH.id] = true;
      Store.save();
      var b = $("markRead");
      if (b) b.innerHTML = "Marked as read &#10003;";
      drawSide();
      io.disconnect();
    }
  }, { threshold: 0.6 });
  io.observe(nav);
}

/* ----------------------------------------------------- read progress -- */
function setProg(p) {
  var el = $("rprog");
  if (el) el.style.width = (p * 100) + "%";
}
window.addEventListener("scroll", function () {
  var art = document.querySelector(".chapter");
  if (!art) { setProg(0); return; }
  var top = art.offsetTop, h = art.offsetHeight - window.innerHeight;
  var p = h > 0 ? (window.scrollY - top) / h : 1;
  setProg(Math.max(0, Math.min(1, p)));
}, { passive: true });

/* ------------------------------------------------------------ search -- */
async function searchBook(q) {
  q = (q || "").trim();
  if (q.length < 2) { toast("Type at least two letters"); return; }
  TTS.stop();
  CH = null;
  drawSide(q);
  $("main").innerHTML = '<div class="empty"><span class="spin"></span> ' +
    "Searching all " + BOOK.chapters.length + " chapters&hellip;</div>";
  await Promise.all(BOOK.chapters.map(fetchChapter));

  var ql = q.toLowerCase(), hits = [];
  BOOK.chapters.forEach(function (c) {
    var doc = new DOMParser().parseFromString(CACHE[c.id], "text/html");
    var secs = doc.querySelectorAll(".chapter > section, .chapter > .ch-head");
    secs.forEach(function (sec) {
      var head = sec.querySelector("h1,h2");
      var htxt = head ? head.textContent.replace(/\s+/g, " ").trim() : c.title;
      var txt = sec.textContent.replace(/\s+/g, " ");
      var i = txt.toLowerCase().indexOf(ql);
      if (i < 0) return;
      var score = (htxt.toLowerCase().indexOf(ql) > -1 ? 10 : 0) +
        Math.min(9, txt.toLowerCase().split(ql).length - 1);
      var a = Math.max(0, i - 70), b = Math.min(txt.length, i + q.length + 90);
      var snip = (a ? "&hellip;" : "") + esc(txt.slice(a, b)) +
        (b < txt.length ? "&hellip;" : "");
      snip = snip.replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g,
        "\\$&"), "ig"), function (m) { return "<mark>" + m + "</mark>"; });
      hits.push({ c: c, id: sec.id, head: htxt, snip: snip, score: score });
    });
  });
  hits.sort(function (a, b) { return b.score - a.score; });

  var h = '<p class="eyebrow">Search</p><h1 class="sec-h" style="font-size:' +
    '24px">' + hits.length + " result" + (hits.length === 1 ? "" : "s") +
    " for &ldquo;" + esc(q) + "&rdquo;</h1>" +
    '<p class="sec-p">Click a result to open that part of the chapter.</p>';
  if (!hits.length) {
    h += '<div class="card">Nothing matched. Try a shorter word, or the tag ' +
      "name without angle brackets, e.g. <code>colspan</code> or " +
      "<code>figcaption</code>.</div>";
  }
  hits.slice(0, 60).forEach(function (r) {
    h += '<div class="sr" onclick="go(null,' + r.c.n + ",'" +
      (r.id ? "#" + r.id : "") + '\')"><div class="c">Chapter ' + r.c.n +
      " &middot; " + esc(r.c.title) + '</div><div class="h">' + esc(r.head) +
      '</div><div class="s">' + r.snip + "</div></div>";
  });
  $("main").innerHTML = h;
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------- audiobook ---- */
/* Reads the chapter aloud with the browser's own speech engine. Text is
   split into paragraph-sized blocks (highlighted as they are read) and
   each block into sentence-sized utterances, because Chrome cuts off any
   single utterance that runs longer than about fifteen seconds. */
var TTS = (function () {
  var ok = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  var synth = ok ? window.speechSynthesis : null;
  var blocks = [], idx = 0, playing = false, paused = false, cur = null;
  var voices = [], voice = null, rate = Store.get().rate || 1;
  var BLOCK_SEL = "h1,h2,h3,h4,p,li,figcaption,dt,dd,summary,blockquote," +
    ".callout,tr,.lead,.kt li";
  var STRICT = "h1,h2,h3,h4,p,figcaption,dt,dd,summary,blockquote,tr";

  function loadVoices() {
    if (!ok) return;
    voices = synth.getVoices().filter(function (v) {
      return /^en/i.test(v.lang);
    });
    if (!voices.length) voices = synth.getVoices();
    var want = Store.get().voice;
    voice = voices.filter(function (v) { return v.name === want; })[0] ||
      voices.filter(function (v) { return /en[-_]IN/i.test(v.lang); })[0] ||
      voices.filter(function (v) { return /en[-_]GB/i.test(v.lang); })[0] ||
      voices.filter(function (v) { return /en[-_]US/i.test(v.lang); })[0] ||
      voices[0] || null;
    var sel = $("ttsVoice");
    if (sel) {
      sel.innerHTML = voices.map(function (v) {
        return '<option value="' + esc(v.name) + '"' +
          (voice && v.name === voice.name ? " selected" : "") + ">" +
          esc(v.name.replace(/^Microsoft /, "").replace(/ - English/, ",")) +
          "</option>";
      }).join("") || "<option>Default voice</option>";
    }
  }
  if (ok) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== "undefined") {
      synth.onvoiceschanged = loadVoices;
    }
  }

  /* text that reads well aloud: <p> becomes "p tag", quotes vanish */
  function speakable(t) {
    return t.replace(/\s+/g, " ")
      .replace(/<\/([a-zA-Z][\w-]*)\s*>/g, " closing $1 tag ")
      .replace(/<!--.*?-->/g, " a comment ")
      .replace(/<!DOCTYPE html>/gi, " doctype html declaration ")
      .replace(/<([a-zA-Z][\w-]*)[^>]*\/?>/g, " $1 tag ")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "and")
      .replace(/["`]/g, "").replace(/\s*=\s*/g, " equals ")
      .replace(/&nbsp;/g, " ").replace(/→/g, " gives ")
      .replace(/\s+/g, " ").trim();
  }

  function ownText(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll("ul,ol,pre,svg,[data-tts=skip],.ex,script,style,table")
      .forEach(function (x) { x.parentNode.removeChild(x); });
    if (el.tagName === "TR") {
      return Array.prototype.map.call(el.querySelectorAll("th,td"),
        function (td) { return td.textContent.trim(); })
        .filter(Boolean).join(", ");
    }
    return c.textContent || "";
  }

  function collect() {
    var root = document.querySelector(".chapter");
    blocks = [];
    if (!root) return;
    var all = Array.prototype.slice.call(root.querySelectorAll(BLOCK_SEL));
    all.forEach(function (el) {
      if (el.closest("[data-tts=skip]") || el.closest(".ex-bar")) return;
      if (el.querySelector(STRICT)) return;          // children are read
      if (el.tagName === "LI" && el.closest("li") &&
          el.parentNode.closest("li") === el.closest("li")) { /* nested ok */ }
      var t = speakable(ownText(el));
      if (t.length < 2) return;
      if (el.tagName === "TR" && el.parentNode.tagName === "THEAD")
        t = "Table headings: " + t;
      if (el.tagName === "FIGCAPTION") t = "Figure. " + t;
      if (el.tagName === "H2") t = "Section. " + t;
      if (el.tagName === "SUMMARY") t = "Question. " + t;
      blocks.push({ el: el, text: t });
    });
    // code examples: announce them once, do not read the code
    root.querySelectorAll(".ex").forEach(function (ex) {
      var lab = ex.querySelector(".ex-bar span");
      var anchor = ex.previousElementSibling;
      var i = -1;
      for (var k = blocks.length - 1; k >= 0; k--) {
        if (blocks[k].el.compareDocumentPosition(ex) &
            Node.DOCUMENT_POSITION_FOLLOWING) { i = k; break; }
      }
      blocks.splice(i + 1, 0, { el: ex, text: "Code example on screen: " +
        (lab ? lab.textContent : "") + ". Press Run to see it." });
    });
    if (!anchorSafe()) return;
  }
  function anchorSafe() { return true; }

  function chunk(t) {
    var parts = t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t], out = [], cur = "";
    parts.forEach(function (p) {
      if ((cur + p).length > 190 && cur) { out.push(cur.trim()); cur = ""; }
      cur += p;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function status(t) {
    var el = $("ttsSt");
    if (el) el.textContent = t;
    var p = $("ttsProg");
    if (p) p.style.width = (blocks.length ? (idx / blocks.length) * 100 : 0) + "%";
  }
  function buttons() {
    var b = $("ttsPlay");
    if (!b) return;
    b.innerHTML = !playing ? "&#9654; Listen" : (paused ? "&#9654; Resume" :
      "&#10074;&#10074; Pause");
  }
  function highlight(el) {
    document.querySelectorAll(".tts-on").forEach(function (x) {
      x.classList.remove("tts-on");
    });
    if (!el) return;
    var d = el.closest("details");
    if (d && !d.open) d.open = true;
    el.classList.add("tts-on");
    var r = el.getBoundingClientRect();
    if (r.top < 150 || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function speakBlock() {
    if (!playing) return;
    if (idx >= blocks.length) { finish("Finished the chapter"); return; }
    var b = blocks[idx];
    highlight(b.el);
    status("Reading " + (idx + 1) + " of " + blocks.length);
    var parts = chunk(b.text), k = 0;
    function next() {
      if (!playing) return;
      if (k >= parts.length) { idx++; speakBlock(); return; }
      var u = new SpeechSynthesisUtterance(parts[k++]);
      u.rate = rate;
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-IN";
      u.onend = function () { if (playing && cur === u) next(); };
      u.onerror = function (e) {
        if (e.error === "interrupted" || e.error === "canceled") return;
        if (playing && cur === u) next();
      };
      cur = u;
      synth.speak(u);
    }
    next();
  }

  function finish(msg) {
    playing = false; paused = false; cur = null;
    highlight(null);
    idx = 0;
    status(msg || "");
    buttons();
  }

  return {
    ok: ok,
    bind: function () {
      var sel = $("ttsVoice"), rt = $("ttsRate");
      if (sel) {
        loadVoices();
        sel.onchange = function () {
          voice = voices.filter(function (v) { return v.name === sel.value; })[0]
            || voice;
          Store.get().voice = sel.value; Store.save();
          if (playing) { var i = idx; TTS.stop(); TTS.playAt(i); }
        };
      }
      if (rt) {
        rt.value = String(rate);
        rt.onchange = function () {
          rate = parseFloat(rt.value) || 1;
          Store.get().rate = rate; Store.save();
          if (playing) { var i = idx; TTS.stop(); TTS.playAt(i); }
        };
      }
      collect();
      status(blocks.length ? blocks.length + " passages" : "");
      buttons();
    },
    toggle: function () {
      if (!ok) return;
      if (!playing) { TTS.playAt(idx); return; }
      if (paused) { synth.resume(); paused = false; }
      else { synth.pause(); paused = true; }
      buttons();
    },
    playAt: function (i) {
      if (!ok) return;
      if (!blocks.length) collect();
      synth.cancel();
      idx = Math.max(0, Math.min(i || 0, blocks.length - 1));
      playing = true; paused = false;
      buttons();
      // a short delay lets cancel() settle in Chrome before speak()
      setTimeout(speakBlock, 60);
    },
    playFrom: function (el) {
      if (!blocks.length) collect();
      var i = 0;
      for (var k = 0; k < blocks.length; k++) {
        if (blocks[k].el === el ||
            (el.compareDocumentPosition(blocks[k].el) &
             Node.DOCUMENT_POSITION_FOLLOWING)) { i = k; break; }
      }
      TTS.playAt(i);
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY -
        140, behavior: "smooth" });
    },
    stop: function () {
      if (!ok) return;
      playing = false; paused = false; cur = null;
      synth.cancel();
      highlight(null);
      idx = 0;
      status("");
      buttons();
    },
    restart: function () { TTS.stop(); TTS.playAt(0); }
  };
})();

function listenBar() {
  if (!TTS.ok) {
    return '<div class="listen" data-tts="skip"><span class="lbl">Listen</span>' +
      '<span class="mut" style="font-size:13px">Your browser does not offer ' +
      "read-aloud voices. Chrome, Edge and Safari do.</span></div>";
  }
  return '<div class="listen" data-tts="skip">' +
    '<span class="lbl">&#127911; Audiobook</span>' +
    '<button class="btn saf sm" id="ttsPlay" onclick="TTS.toggle()">&#9654; ' +
    "Listen</button>" +
    '<button class="btn ghost sm" onclick="TTS.stop()" title="Stop">&#9632;' +
    "</button>" +
    '<select id="ttsRate" title="Reading speed"><option value="0.8">0.8&times; ' +
    'slow</option><option value="1">1&times; normal</option><option value="1.2">' +
    "1.2&times;</option><option value=\"1.4\">1.4&times; fast</option>" +
    '<option value="1.7">1.7&times;</option></select>' +
    '<select id="ttsVoice" title="Voice"></select>' +
    '<span class="st" id="ttsSt"></span>' +
    '<div class="prog"><i id="ttsProg"></i></div></div>';
}

window.addEventListener("beforeunload", function () { TTS.stop(); });

/* -------------------------------------------------------------- boot -- */
(async function () {
  mountShell("book.html");
  document.body.insertAdjacentHTML("afterbegin", '<div class="rprog" id="rprog"></div>');
  try {
    BOOK = await loadJSON("book/index.json");
  } catch (e) {
    $("main").innerHTML = '<div class="empty">' + esc(e.message) + "</div>";
    return;
  }
  var p = new URLSearchParams(location.search);
  var n = parseInt(p.get("ch"), 10);
  if (n) openChapter(n, location.hash); else showCover();
})();
