/* =====================================================================
   Browser-side AI - the student's own key, called directly
   ---------------------------------------------------------------------
   Verified working from this site: Gemini, Groq and OpenRouter all accept
   cross-origin requests from a browser, so a static site on GitHub Pages
   can use AI with no server and no tunnel.

   Why the student's OWN key rather than a shared one:
     - a key in a public repo would be stolen within hours
     - free tiers are per-key, so a shared key runs out for everyone
     - their key stays in their browser and is sent only to the provider

   The key lives in localStorage on their device. It is never uploaded,
   never logged, and never leaves the browser except to the provider they
   chose.
   ===================================================================== */
"use strict";

var AI = (function () {

  var KEY = "cse326_ai";

  var PROVIDERS = {
    groq: {
      label: "Groq",
      url: "https://console.groq.com/keys",
      free: "Best free tier and very fast. Recommended.",
      model: "llama-3.3-70b-versatile",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      style: "openai"
    },
    gemini: {
      label: "Google Gemini",
      url: "https://aistudio.google.com/apikey",
      free: "Easy if you have a Google account. About 20-50 requests a day.",
      model: "gemini-3.1-flash-lite",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
      style: "gemini"
    },
    openrouter: {
      label: "OpenRouter",
      url: "https://openrouter.ai/keys",
      free: "One key, many models. Some are free.",
      model: "meta-llama/llama-3.3-70b-instruct:free",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      style: "openai"
    },
    mistral: {
      label: "Mistral",
      url: "https://console.mistral.ai/api-keys",
      free: "Free tier available.",
      model: "mistral-small-latest",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      style: "openai"
    }
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function save(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function configured() { var c = load(); return !!(c.provider && c.key); }
  function masked() {
    var k = (load().key || "");
    return k.length > 10 ? k.slice(0, 4) + "*".repeat(8) + k.slice(-4) : "";
  }

  /* ------------------------------------------------------------- ask -- */
  async function ask(system, user, opts) {
    opts = opts || {};
    var cfg = load();
    if (!cfg.provider || !cfg.key) {
      throw new Error("No AI key saved yet. Open the AI tutor page and add " +
                      "a free key - it takes two minutes.");
    }
    var p = PROVIDERS[cfg.provider];
    if (!p) throw new Error("Unknown provider: " + cfg.provider);
    var model = cfg.model || p.model;
    var maxTokens = opts.maxTokens || 900;

    var url, body, headers = { "Content-Type": "application/json" };

    if (p.style === "gemini") {
      url = p.endpoint + model + ":generateContent?key=" +
            encodeURIComponent(cfg.key);
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.3,
          // Gemini's Flash models spend hidden "thinking" tokens out of the
          // same budget, so the answer needs headroom or it comes back empty.
          maxOutputTokens: maxTokens + 800,
          thinkingConfig: { thinkingBudget: 0 }
        }
      };
    } else {
      url = p.endpoint;
      headers["Authorization"] = "Bearer " + cfg.key;
      body = {
        model: model,
        temperature: 0.3,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system },
                   { role: "user", content: user }]
      };
    }

    var r;
    try {
      r = await fetch(url, { method: "POST", headers: headers,
                             body: JSON.stringify(body) });
    } catch (e) {
      throw new Error("Could not reach " + p.label +
                      ". Check your internet connection.");
    }

    var text = await r.text();
    if (!r.ok) throw new Error(friendly(p.label, r.status, text));

    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error(p.label + " sent a reply we could not read."); }

    var out = "";
    if (p.style === "gemini") {
      var cand = (data.candidates || [])[0] || {};
      var parts = (cand.content || {}).parts || [];
      out = parts.map(function (x) { return x.text || ""; }).join("");
      if (!out && cand.finishReason === "MAX_TOKENS") {
        throw new Error("Gemini ran out of budget before answering. Try a " +
                        "shorter question.");
      }
    } else {
      out = (((data.choices || [])[0] || {}).message || {}).content || "";
    }
    if (!out) throw new Error(p.label + " returned an empty answer.");
    return { text: out, provider: p.label, model: model };
  }

  /* Turn an HTTP status into something a student can act on. */
  function friendly(who, status, body) {
    if (status === 401 || status === 403) {
      return who + " rejected the key. Check it was pasted in full, with no " +
             "spaces.";
    }
    if (status === 429) {
      return who + " free limit reached. Wait a minute, or add a key from a " +
             "different provider.";
    }
    if (status === 404) {
      return who + " does not recognise that model. Clear the model box to " +
             "use the default.";
    }
    if (status >= 500) return who + " is busy. Try again in a moment.";
    var msg = "";
    try { msg = (JSON.parse(body).error || {}).message || ""; } catch (e) {}
    return who + " error " + status + (msg ? ": " + msg.slice(0, 120) : "");
  }

  /* --------------------------------------------------------- prompts -- */
  var TUTOR = "You are a patient teacher on CSE326 Internet Programming, a " +
    "first-year B.Tech course covering HTML, CSS and JavaScript. Explain " +
    "simply and concretely. Use markdown. Never invent facts. Keep to the " +
    "topic asked.";

  /* Review the student's OWN code and comment on it like a marker would. */
  async function review(code, brief) {
    var user =
      "A student is learning HTML and CSS.\n" +
      (brief ? "The task was:\n" + brief + "\n\n" : "") +
      "This is the code they wrote:\n\n```\n" + code + "\n```\n\n" +
      "Give feedback the way a good teacher would, in this order:\n" +
      "1. **What works** - one or two genuine strengths.\n" +
      "2. **What to fix** - the most important problems, most serious " +
      "first, each with the reason it matters.\n" +
      "3. **One thing to try next** - a single concrete improvement.\n\n" +
      "Be encouraging but honest. Point at their actual code, quoting the " +
      "lines you mean. Do NOT rewrite the whole thing for them - they " +
      "learn by fixing it themselves. Under 300 words.";
    return ask(TUTOR, user, { maxTokens: 800 });
  }

  async function explain(topic, goal, differently) {
    var user =
      "Subject: HTML and CSS for web pages, NOT any other programming " +
      "language.\nTopic: " + topic + "\n" +
      (goal ? "Learning goal: " + goal + "\n" : "") +
      "\nExplain this to a student who found the lecture too fast. Simple " +
      "language, short paragraphs, a real code example with tags, and end " +
      "with three common mistakes. Use markdown headings." +
      (differently ? " Explain it in a completely different way this time, " +
                     "leading with an everyday analogy." : "");
    return ask(TUTOR, user, { maxTokens: 1100 });
  }

  async function quiz(topic, n) {
    var user =
      "Write " + (n || 5) + " multiple-choice questions on the HTML/CSS " +
      "topic \"" + topic + "\" for a first-year B.Tech exam.\n\n" +
      "Rules: exactly four options each, exactly one correct, include at " +
      "least one code-based question, and vary the difficulty.\n\n" +
      "Return ONLY valid JSON, no prose and no code fence, in this shape:\n" +
      '[{"q":"question text","options":["A","B","C","D"],"answer":0,' +
      '"why":"why the answer is right"}]';
    var r = await ask("You output only valid JSON. No commentary.", user,
                      { maxTokens: 1600 });
    return { questions: parseQuiz(r.text), provider: r.provider };
  }

  /* Models often wrap JSON in a fence or add a sentence. Recover anyway. */
  function parseQuiz(text) {
    var t = String(text || "").trim();
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    var start = t.indexOf("["), end = t.lastIndexOf("]");
    if (start > -1 && end > start) t = t.slice(start, end + 1);
    var arr;
    try { arr = JSON.parse(t); }
    catch (e) { throw new Error("The AI's questions were not valid JSON. " +
                                "Press generate again."); }
    if (!Array.isArray(arr)) throw new Error("Unexpected reply shape.");
    return arr.filter(function (x) {
      return x && x.q && Array.isArray(x.options) && x.options.length === 4 &&
             typeof x.answer === "number" && x.answer >= 0 && x.answer < 4;
    });
  }

  async function test(provider, key, model) {
    var before = load();
    save({ provider: provider, key: key, model: model || "" });
    try {
      var r = await ask("Reply with one word.", "Say OK", { maxTokens: 40 });
      return { ok: true, reply: r.text.trim().slice(0, 40),
               provider: r.provider, model: r.model };
    } catch (e) {
      save(before);                    // roll back a key that does not work
      throw e;
    }
  }

  return { PROVIDERS: PROVIDERS, load: load, save: save, clear: clear,
           configured: configured, masked: masked, ask: ask, review: review,
           explain: explain, quiz: quiz, test: test, TUTOR: TUTOR };
})();
