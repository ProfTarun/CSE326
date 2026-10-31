/* Running JavaScript examples inside sandboxed frames.

   Every runnable example in the portal - the textbook's Run button, the
   class screen's live demo, the class log and the word-by-word walkthrough -
   runs in an <iframe sandbox="allow-scripts"> so an example can never touch
   the page around it. Two things then go missing, and this file gives them
   back:

   1. The console. console.log() inside a frame goes to DevTools, which a
      student watching the projector cannot see. RUN_SHIM forwards every
      console call, and every uncaught error, to the parent page as a
      message; RunConsole draws them as lines in a console panel.
   2. Web Storage. A sandboxed frame has no origin of its own, so touching
      localStorage throws. RUN_SHIM swaps in an in-memory stand-in with the
      same methods, so storage examples run - they simply forget on reload.

   RUN_SHIM is a <script> string to put at the very top of the frame's
   document (runWrap does that); RunConsole.attach(frame, panel) listens for
   that frame's messages and writes them into panel. */
(function () {
  var SHIM = "(" + function () {
    var post = function (kind, args) {
      try { parent.postMessage({ __runshim: 1, kind: kind, args: args }, "*"); } catch (e) {}
    };
    var show = function (v, depth) {
      depth = depth || 0;
      try {
        /* like Chrome's console: bare at the top level, 'quoted' inside arrays and objects */
        if (typeof v === "string") return depth ? "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'" : v;
        if (v === undefined) return "undefined";
        if (v === null) return "null";
        if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint")
          return String(v) + (typeof v === "bigint" ? "n" : "");
        if (typeof v === "symbol") return v.toString();
        if (typeof v === "function") return "ƒ " + (v.name || "anonymous") + "()";
        if (v instanceof Error) return v.name + ": " + v.message;
        if (typeof Node !== "undefined" && v instanceof Node) {
          if (v.nodeType === 1) {
            var s = "<" + v.nodeName.toLowerCase();
            if (v.id) s += ' id="' + v.id + '"';
            if (v.className && typeof v.className === "string") s += ' class="' + v.className + '"';
            return s + ">";
          }
          return v.nodeName;
        }
        if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toString();
        if (v instanceof RegExp) return String(v);
        if (depth > 2) return Array.isArray(v) ? "[...]" : "{...}";
        if (Array.isArray(v)) {
          return "[" + v.map(function (x) { return show(x, depth + 1); }).join(", ") + "]";
        }
        if (typeof v.length === "number" && typeof v.item === "function") {   /* NodeList, HTMLCollection */
          var items = [];
          for (var i = 0; i < v.length; i++) items.push(show(v[i], depth + 1));
          return (v.constructor && v.constructor.name || "List") + "(" + v.length + ") [" + items.join(", ") + "]";
        }
        if (v instanceof Map) {
          var m = [];
          v.forEach(function (val, key) { m.push(show(key, depth + 1) + " => " + show(val, depth + 1)); });
          return "Map(" + v.size + ") {" + m.join(", ") + "}";
        }
        if (v instanceof Set) {
          var st = [];
          v.forEach(function (val) { st.push(show(val, depth + 1)); });
          return "Set(" + v.size + ") {" + st.join(", ") + "}";
        }
        if (typeof Promise !== "undefined" && v instanceof Promise) return "Promise {<pending>}";
        var keys = Object.keys(v);
        var name = v.constructor && v.constructor !== Object && v.constructor.name ? v.constructor.name + " " : "";
        return name + "{" + keys.map(function (k) {
          return (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + show(v[k], depth + 1);
        }).join(", ") + "}";
      } catch (e) { return String(v); }
    };
    var table = function (data) {
      try {
        var rows = Array.isArray(data) ? data : Object.keys(data).map(function (k) { return data[k]; });
        var idx = Array.isArray(data) ? data.map(function (_, i) { return String(i); }) : Object.keys(data);
        var cols = [];
        rows.forEach(function (r) {
          if (r && typeof r === "object") Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
        });
        var head = ["(index)"].concat(cols.length ? cols : ["Value"]);
        var body = rows.map(function (r, i) {
          return [idx[i]].concat(cols.length ? cols.map(function (k) { return r && typeof r === "object" && k in r ? show(r[k], 1) : ""; })
                                             : [show(r, 1)]);
        });
        post("table", [JSON.stringify({ head: head, body: body })]);
      } catch (e) { post("log", [show(data)]); }
    };
    ["log", "info", "warn", "error", "debug"].forEach(function (k) {
      var orig = console[k];
      console[k] = function () {
        var a = [].slice.call(arguments);
        /* printf-style %s %d %o substitutions are rare in teaching code; join plainly */
        post(k, a.map(function (x) { return show(x); }));
        if (orig) try { orig.apply(console, a); } catch (e) {}
      };
    });
    var origTable = console.table;
    console.table = function (d) { table(d); if (origTable) try { origTable.apply(console, arguments); } catch (e) {} };
    console.clear = function () { post("clear", []); };
    window.addEventListener("error", function (e) {
      var err = e.error;
      var msg = err && err.name ? err.name + ": " + err.message : String(e.message || "Error");
      if (!/^Uncaught/.test(msg)) msg = "Uncaught " + msg;
      post("error", [msg + (e.lineno ? "  (line " + e.lineno + ")" : "")]);
    });
    window.addEventListener("unhandledrejection", function (e) {
      var r = e.reason;
      post("error", ["Uncaught (in promise) " + (r && r.name ? r.name + ": " + r.message : show(r))]);
    });
    /* Web Storage stand-in for frames with no origin */
    var memory = function () {
      var d = Object.create(null);
      var api = {
        getItem: function (k) { k = String(k); return k in d ? d[k] : null; },
        setItem: function (k, v) { d[String(k)] = String(v); },
        removeItem: function (k) { delete d[String(k)]; },
        clear: function () { d = Object.create(null); },
        key: function (i) { var ks = Object.keys(d); return i < ks.length ? ks[i] : null; }
      };
      Object.defineProperty(api, "length", { get: function () { return Object.keys(d).length; } });
      return api;
    };
    ["localStorage", "sessionStorage"].forEach(function (n) {
      try { window[n].getItem("__probe"); }
      catch (e) {
        try { Object.defineProperty(window, n, { value: memory(), configurable: true }); } catch (e2) {}
      }
    });
  } + ")();";
  /* one line, so line numbers in error messages still match the example */
  SHIM = SHIM.replace(/\s*\n\s*/g, " ");

  window.RUN_SHIM = "<script>" + SHIM + "<\/script>";

  /* Put the shim first in a document, whether or not it has a head. */
  window.runWrap = function (code) {
    code = String(code || "");
    var m = code.match(/<head(?:\s[^>]*)?>/i);   /* not <header> */
    if (m) return code.replace(m[0], m[0] + window.RUN_SHIM);
    var d = code.match(/^\s*<!doctype[^>]*>/i);
    if (d) return d[0] + window.RUN_SHIM + code.slice(d[0].length);
    return window.RUN_SHIM + code;
  };

  /* A console panel fed by one frame's messages. */
  var FRAMES = [];
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || !d.__runshim) return;
    for (var i = 0; i < FRAMES.length; i++) {
      var f = FRAMES[i];
      if (f.frame.contentWindow === e.source) { f.write(d.kind, d.args || []); return; }
    }
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  window.RunConsole = {
    /* frame: the iframe; panel: an element that receives .rc-line rows.
       opts.onFirst(): called when the first line arrives (to reveal the panel). */
    attach: function (frame, panel, opts) {
      opts = opts || {};
      var rec = {
        frame: frame, panel: panel, count: 0,
        lineOffset: 0,      /* lines a wrapper added above the student's code */
        write: function (kind, args) {
          if (kind === "clear") { panel.innerHTML = ""; rec.count = 0; return; }
          var ph = panel.querySelector(".rc-empty");          /* "nothing logged yet" */
          if (ph) ph.parentNode.removeChild(ph);
          var line = document.createElement("div");
          line.className = "rc-line rc-" + kind;
          if (kind === "table") {
            try {
              var t = JSON.parse(args[0]);
              line.innerHTML = "<table class=\"rc-table\"><tr>" + t.head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
                "</tr>" + t.body.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
                "</table>";
            } catch (err) { line.textContent = args.join(" "); }
          } else {
            var text = args.join(" ");
            if (kind === "error" && rec.lineOffset) {
              text = text.replace(/\(line (\d+)\)/, function (m, n) {
                var k = parseInt(n, 10) - rec.lineOffset;
                return k > 0 ? "(line " + k + ")" : "";
              });
            }
            line.textContent = text;
          }
          panel.appendChild(line);
          rec.count++;
          if (rec.count === 1 && opts.onFirst) opts.onFirst();
          if (rec.count > 500) panel.removeChild(panel.firstChild);
          panel.scrollTop = panel.scrollHeight;
        },
        clear: function () { panel.innerHTML = ""; rec.count = 0; }
      };
      FRAMES = FRAMES.filter(function (f) { return f.frame !== frame && document.contains(f.frame); });
      FRAMES.push(rec);
      return rec;
    }
  };

  /* Example pictures and media are handed to frames inline, as data: a
     frame with no origin may be refused any file from the server. */
  var INLINE = {}, PENDING = 0, WAIT = [];
  window.runAssets = function (list) {
    list.forEach(function (p) {
      if (INLINE[p] || !window.fetch) return;
      PENDING++;
      fetch(p).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
        if (!b) return null;
        return new Promise(function (res) {
          var fr = new FileReader();
          fr.onload = function () { res(fr.result); };
          fr.onerror = function () { res(null); };
          fr.readAsDataURL(b);
        });
      }).then(function (url) {
        if (url) INLINE[p] = url;
      }).catch(function () {}).then(function () {
        PENDING--;
        if (!PENDING) { var w = WAIT; WAIT = []; w.forEach(function (fn) { fn(); }); }
      });
    });
  };
  window.runInline = function (code) {
    Object.keys(INLINE).forEach(function (p) {
      code = code.split(p).join(INLINE[p]);
    });
    return code;
  };
  window.runAssetsReady = function (fn) { if (!PENDING) fn(); else WAIT.push(fn); };
})();
