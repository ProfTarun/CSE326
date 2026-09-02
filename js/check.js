/* =====================================================================
   Marking engine - browser port
   ---------------------------------------------------------------------
   A faithful port of check_code() and find_slips() from the server. The
   same 171 checks that ran in Python now run in the student's browser, so
   practice is still marked line by line with the same specific hints and
   no server is needed.

   Python -> JavaScript regex notes that matter here:
     re.I | re.S       ->  flags "is"  (dotAll)
     "case": true      ->  flags "s"   (case-sensitive on purpose)
     (?:(?!x)[\s\S])*? ->  identical syntax, works unchanged
     \1 backreference  ->  identical syntax
   ===================================================================== */
"use strict";

var Check = (function () {

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rx(pattern, caseSensitive) {
    // Python compiles with re.I|re.S unless the check opts out with "case".
    return new RegExp(pattern, caseSensitive ? "s" : "is");
  }

  function countTags(code, tag) {
    var m = code.match(new RegExp("<\\s*" + escapeRe(tag) + "\\b", "gi"));
    return m ? m.length : 0;
  }

  function runOne(code, chk) {
    var kind = chk.kind;

    if (kind === "tag") {
      return countTags(code, chk.tag) >= (chk.min == null ? 1 : chk.min);
    }

    if (kind === "attr") {
      var pat = "<\\s*" + escapeRe(chk.tag) + "\\b[^>]*\\b" +
                escapeRe(chk.attr) + "\\s*=";
      return new RegExp(pat, "i").test(code);
    }

    if (kind === "re" || kind === "not_re") {
      var hit = rx(chk.pattern, !!chk.case).test(code);
      return kind === "re" ? hit : !hit;
    }

    if (kind === "order") {
      var lower = code.toLowerCase();
      var a = lower.indexOf(String(chk.first).toLowerCase());
      var b = lower.indexOf(String(chk.then).toLowerCase());
      return a !== -1 && b !== -1 && a < b;
    }

    if (kind === "text") {
      var t = escapeRe(chk.inside);
      var m = new RegExp("<\\s*" + t + "\\b[^>]*>(.*?)<\\s*/\\s*" + t +
                         "\\s*>", "is").exec(code);
      return !!(m && m[1].trim());
    }

    return false;
  }

  /* Run every check and report ALL failures, not just the first - a
     student should see the whole picture rather than play whack-a-mole. */
  function code(src, checks) {
    src = src || "";
    checks = checks || [];
    var results = [], passed = 0;
    for (var i = 0; i < checks.length; i++) {
      var ok = false;
      try { ok = runOne(src, checks[i]); }
      catch (e) { ok = false; }          // a bad pattern must not crash
      if (ok) passed++;
      results.push({ ok: ok, label: checks[i].label || "",
                     hint: ok ? "" : (checks[i].hint || "") });
    }
    return { passed: passed, total: checks.length,
             all_ok: checks.length > 0 && passed === checks.length,
             results: results };
  }

  /* The generic mistakes that produce a blank or broken page with no
     error message anywhere. Loaded from slips.json. */
  var SLIPS = [];
  function setSlips(list) { SLIPS = list || []; }

  function slips(src) {
    var out = [];
    for (var i = 0; i < SLIPS.length; i++) {
      try {
        if (new RegExp(SLIPS[i].pattern, "i").test(src || "")) {
          out.push(SLIPS[i].note);
        }
      } catch (e) { /* ignore a bad rule */ }
    }
    return out;
  }

  return { code: code, slips: slips, setSlips: setSlips, runOne: runOne };
})();
