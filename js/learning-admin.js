/* Teacher page for the learning reports.
 *
 * Takes the ZIP the OMR app makes and publishes it into this site's own GitHub
 * repository in ONE commit through the GitHub API: the manifest, one locked file
 * per student, and the updated list of tests. Every student file is already
 * encrypted by the app with that student's registration number and code, so
 * nothing readable is ever uploaded.
 *
 * GitHub Pages runs no server code, so the sign-in below can only hide this page;
 * what actually allows a publish is the GitHub token, which stays in this browser.
 */
"use strict";
mountShell("");

var OWNER = "ProfTarun", REPO = "CSE326", BRANCH = "main", ROOT = "data/learning";
var LOGIN = "e6df240a74a09d9f31647efd93c7db508fa309e6f740442dcc5f283c28c7bfbc";   // sha-256 of the sign-in
var PACK = null;            // {manifest, files: {path: Uint8Array}}

function utf8(s) { return new TextEncoder().encode(s); }
async function sha256hex(s) {
  var d = await crypto.subtle.digest("SHA-256", utf8(s));
  return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
function note(id, text, kind) { $(id).innerHTML = text ? '<div class="msg ' + (kind || "info") + '">' + text + "</div>" : ""; }

/* -------------------------------------------------------------- sign in -- */
async function signIn() {
  var h = await sha256hex("cse326-admin:" + $("user").value.trim() + ":" + $("pass").value);
  if (h !== LOGIN) { note("loginMsg", "That user name and password do not match.", "bad"); return; }
  try { sessionStorage.setItem("cse326_admin", "1"); } catch (e) {}
  showPanel();
}

function showPanel() {
  $("login").style.display = "none";
  $("panel").style.display = "";
  try { $("tok").value = localStorage.getItem("cse326_gh_token") || ""; $("remember").checked = !!$("tok").value; } catch (e) {}
  listTests();
}

function token() {
  var t = $("tok").value.trim();
  try {
    if ($("remember").checked && t) localStorage.setItem("cse326_gh_token", t);
    else localStorage.removeItem("cse326_gh_token");
  } catch (e) {}
  return t;
}

/* ------------------------------------------------------------- GitHub ---- */
async function gh(method, path, body) {
  var t = token();
  if (!t) throw new Error("Paste the GitHub token in step 1 first.");
  var r = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO + path, {
    method: method,
    headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  if (r.status === 404 && method === "GET") return null;
  if (!r.ok) {
    var m = "";
    try { m = (await r.json()).message || ""; } catch (e) {}
    if (r.status === 401) throw new Error("GitHub did not accept the token (" + m + "). Make a new one - step 1.");
    if (r.status === 403) throw new Error("The token may not change this repository (" + m + "). It needs Contents: Read and write on CSE326.");
    throw new Error("GitHub said " + r.status + (m ? ": " + m : ""));
  }
  return r.status === 204 ? {} : r.json();
}

function b64(bytes) {
  var s = "", CH = 0x8000;
  for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function unb64(s) {
  var bin = atob(String(s).replace(/\s/g, "")), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function checkAccess() {
  try {
    var r = await gh("GET", "");
    if (!r) throw new Error("Repository not found - the token cannot see ProfTarun/CSE326.");
    if (r.permissions && !r.permissions.push) throw new Error("The token can read the repository but not change it. Give it Contents: Read and write.");
    note("tokMsg", "Access is fine - this token can publish to ProfTarun/CSE326.", "ok");
  } catch (e) { note("tokMsg", esc(e.message), "bad"); }
}

/* The list of tests as GitHub has it now (the live site can lag a minute). */
async function readTests() {
  var f = await gh("GET", "/contents/" + ROOT + "/tests.json?ref=" + BRANCH);
  if (!f) return { tests: [] };
  try { return JSON.parse(new TextDecoder().decode(unb64(f.content))); } catch (e) { return { tests: [] }; }
}

/* One commit: new and changed files, and files to delete (sha null). */
async function commit(changes, message, progress) {
  var ref = await gh("GET", "/git/ref/heads/" + BRANCH);
  var head = ref.object.sha;
  var base = (await gh("GET", "/git/commits/" + head)).tree.sha;
  var tree = [], done = 0, todo = changes.filter(function (c) { return c.bytes; }).length;
  var queue = changes.slice();
  async function worker() {
    while (queue.length) {
      var c = queue.shift();
      if (c.bytes) {
        var blob = await gh("POST", "/git/blobs", { content: b64(c.bytes), encoding: "base64" });
        tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
        done++;
        if (progress) progress(done / Math.max(1, todo));
      } else tree.push({ path: c.path, mode: "100644", type: "blob", sha: null });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  var nt = await gh("POST", "/git/trees", { base_tree: base, tree: tree });
  var nc = await gh("POST", "/git/commits", { message: message, tree: nt.sha, parents: [head] });
  await gh("PATCH", "/git/refs/heads/" + BRANCH, { sha: nc.sha });
  return nc.sha;
}

/* ---------------------------------------------------------- the ZIP ---- */
/* A small reader for the app's ZIP: stored and deflated entries, sizes taken
   from the central directory. */
async function readZip(buf) {
  var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), n = buf.length, eocd = -1;
  for (var i = n - 22; i >= Math.max(0, n - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This is not a ZIP file.");
  var count = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), files = {};
  for (var k = 0; k < count; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error("The ZIP is damaged.");
    var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
    var nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    var lho = dv.getUint32(off + 42, true);
    var name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    var data = buf.subarray(start, start + csize);
    if (method === 8) {
      data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    } else if (method !== 0) throw new Error("The ZIP uses a compression this page cannot read.");
    files[name] = data;
  }
  return files;
}

async function pick() {
  PACK = null;
  $("publish").disabled = true;
  note("pubMsg", "");
  var f = $("zip").files[0];
  if (!f) { $("zipInfo").innerHTML = ""; return; }
  try {
    var files = await readZip(new Uint8Array(await f.arrayBuffer()));
    if (!files["manifest.json"]) throw new Error("This ZIP has no manifest.json - is it the website pack from the OMR app?");
    var man = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    if (man.format !== "omr-learning-web-1") throw new Error("This is not a learning pack from the OMR app (format " + esc(man.format) + ").");
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(man.testId || "")) throw new Error("The pack has an unusable test id.");
    var bins = Object.keys(files).filter(function (p) { return /^s\/[0-9a-f]{24}\.bin$/.test(p); });
    if (!bins.length) throw new Error("The pack has no student files.");
    PACK = { manifest: man, files: files, bins: bins };
    $("zipInfo").innerHTML = '<div class="sum">' +
      "<div><b>" + esc(man.title) + "</b><span>test</span></div>" +
      "<div><b>" + bins.length + "</b><span>student reports, each locked</span></div>" +
      "<div><b>" + esc(man.date || "-") + "</b><span>date</span></div>" +
      "<div><b>" + (man.hasLearningPack ? "yes" : "no") + "</b><span>AI learning pack inside</span></div></div>";
    $("publish").disabled = false;
  } catch (e) {
    $("zipInfo").innerHTML = '<div class="msg bad">' + esc(e.message) + "</div>";
  }
}

async function publish() {
  if (!PACK) return;
  var man = PACK.manifest, dir = ROOT + "/" + man.testId + "/";
  var b = $("publish");
  b.disabled = true;
  $("prog").style.display = "block";
  $("progBar").style.width = "2%";
  note("pubMsg", "Publishing " + PACK.bins.length + " reports&hellip;", "info");
  try {
    // students who were in an earlier upload of this test but not in this one
    var old = await gh("GET", "/contents/" + ROOT + "/" + man.testId + "/s?ref=" + BRANCH);
    var keep = {};
    PACK.bins.forEach(function (p) { keep[dir + p] = 1; });
    var changes = [{ path: dir + "manifest.json", bytes: PACK.files["manifest.json"] }];
    PACK.bins.forEach(function (p) { changes.push({ path: dir + p, bytes: PACK.files[p] }); });
    (Array.isArray(old) ? old : []).forEach(function (f) { if (!keep[f.path]) changes.push({ path: f.path, bytes: null }); });
    var list = await readTests();
    list.tests = (list.tests || []).filter(function (t) { return t.id !== man.testId; });
    list.tests.push({ id: man.testId, title: man.title, course: man.course || "", assessment: man.assessment || "",
      date: man.date || "", students: PACK.bins.length, published: new Date().toISOString() });
    changes.push({ path: ROOT + "/tests.json", bytes: utf8(JSON.stringify(list, null, 1)) });
    await commit(changes, "Learning reports: " + man.title + " (" + PACK.bins.length + " students)", function (p) {
      $("progBar").style.width = Math.round(4 + 92 * p) + "%";
    });
    $("progBar").style.width = "100%";
    note("pubMsg", "Published. Students can open their reports at <a href=\"learning.html\">learning.html</a> in about a " +
      "minute, once GitHub Pages has rebuilt the site.", "ok");
    listTests();
  } catch (e) {
    note("pubMsg", esc(e.message), "bad");
  } finally {
    b.disabled = false;
  }
}

/* ------------------------------------------------------ published ---- */
async function listTests() {
  var box = $("tests");
  if (!$("tok").value.trim()) {
    try {
      var r = await fetch("data/learning/tests.json", { cache: "no-store" });
      var l = r.ok ? await r.json() : { tests: [] };
      box.innerHTML = draw(l.tests || [], false) + '<p class="hint">Add the token in step 1 to remove a test.</p>';
    } catch (e) { box.textContent = "None yet."; }
    return;
  }
  try { box.innerHTML = draw((await readTests()).tests || [], true); }
  catch (e) { box.innerHTML = '<div class="msg bad">' + esc(e.message) + "</div>"; }
  box.querySelectorAll("[data-del]").forEach(function (btn) {
    btn.onclick = function () { removeTest(btn.getAttribute("data-del"), btn.getAttribute("data-title")); };
  });
}

function draw(tests, canDelete) {
  if (!tests.length) return "None yet.";
  tests = tests.slice().sort(function (a, b) { return (b.published || "").localeCompare(a.published || ""); });
  return '<table class="t"><tr><th>Test</th><th>Students</th><th>Published</th><th></th></tr>' +
    tests.map(function (t) {
      return "<tr><td><b>" + esc(t.title) + "</b><br><span class=\"hint\">" + esc(t.date || "") + " &middot; " + esc(t.id) +
        "</span></td><td>" + (t.students || "") + "</td><td>" + esc((t.published || "").slice(0, 10)) + "</td><td>" +
        (canDelete ? '<button class="btn ghost sm" data-del="' + esc(t.id) + '" data-title="' + esc(t.title) + '">Remove</button>' : "") +
        "</td></tr>";
    }).join("") + "</table>";
}

async function removeTest(id, title) {
  if (!confirm("Remove \"" + title + "\" from the site? Students will no longer be able to open these reports.")) return;
  try {
    var dir = ROOT + "/" + id;
    var files = await gh("GET", "/contents/" + dir + "/s?ref=" + BRANCH);
    var changes = [{ path: dir + "/manifest.json", bytes: null }];
    (Array.isArray(files) ? files : []).forEach(function (f) { changes.push({ path: f.path, bytes: null }); });
    var list = await readTests();
    list.tests = (list.tests || []).filter(function (t) { return t.id !== id; });
    changes.push({ path: ROOT + "/tests.json", bytes: utf8(JSON.stringify(list, null, 1)) });
    await commit(changes, "Learning reports: remove " + title);
    listTests();
  } catch (e) { alert(e.message); }
}

/* -------------------------------------------------------------- start ---- */
$("signin").onclick = signIn;
$("pass").addEventListener("keydown", function (e) { if (e.key === "Enter") signIn(); });
$("check").onclick = function () { checkAccess().then(listTests); };
$("zip").onchange = pick;
$("publish").onclick = publish;
try { if (sessionStorage.getItem("cse326_admin") === "1") showPanel(); } catch (e) {}
