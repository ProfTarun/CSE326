# CSE326 &mdash; Internet Programming

A self-study portal for CSE326 students. Open it, practise, get marked.
No sign-up, no password, nothing to install.

**Live site: https://proftarun.github.io/CSE326/**

---

## What is in it

| | |
|---|---|
| **21 textbook chapters** | Units 1&ndash;2 in full: theory, diagrams and flowcharts, runnable examples, exam-style checks, and a read-aloud audiobook mode |
| **22 step-by-step lessons** | Units 1&ndash;3: HTML fundamentals, semantic HTML and forms, CSS |
| **110 command drills** | One short drill for every tag, attribute, input type and CSS property that can appear in the paper |
| **6 lab practicals** | The prescribed Unit 7 experiments, with the marking scheme visible |
| **Tag reference** | Every examinable tag, searchable, with syntax and an example |
| **Mock test** | Marked the way CA2 is, including the 0.25 penalty for a wrong answer |
| **Progress tracking** | 138 exercises, all marked automatically |

Every practice task is checked line by line and tells you exactly what to
fix &mdash; not just pass or fail.

---

## How it works

Everything runs in your own browser. There is no server, no database and
no account.

- Your code never leaves your device.
- Progress is saved in your browser's local storage.
- Because of that, progress does **not** follow you from your phone to a
  lab computer, and clearing your browsing data resets it. There is a
  **Download my progress** button on the Progress page if you want a copy.

---

## For students

Just open the link. Suggested order:

1. **Textbook** &mdash; read the chapter for the topic (or press *Listen*)
2. **Lessons** &mdash; work through a unit
3. **Command drills** &mdash; two minutes each, until the syntax is automatic
4. **Practicals** &mdash; build the prescribed experiments before the lab
5. **Mock test** &mdash; find out what guessing costs you; every explanation
   links back to the chapter to revise

Everything is marked automatically, so you always know where you stand.

---

## For teachers

The content is generated from a Python source project and exported to
`data/*.json`. Each check is a small declarative rule, so adding a lesson or
a drill means adding data, not code.

```
data/lessons.json      22 lessons, 171 checks, 22 quizzes
data/drills.json       110 drills, 207 checks
data/practicals.json   6 practicals, 80 checks
data/slips.json        generic mistake detector
data/book/index.json   the textbook's chapter list (title, unit, keywords)
data/book/chNN.html    one file per chapter: plain HTML fragments
js/check.js            the marking engine
js/app.js              shared UI, progress, practice pad
js/book.js             the textbook reader: contents, search, audiobook
```

### The textbook

Each chapter is an ordinary HTML fragment in `data/book/`, so editing a
chapter means editing one file; no build step. Conventions inside a chapter:

- `<pre class="code" data-run data-title="...">` becomes a runnable example
  with Run, Copy and Open-in-Playground buttons (escape `<` as `&lt;`).
- `<figure class="fig">` holds an inline SVG diagram; the shared arrowheads
  and colour classes (`box`, `edge`, `dec`, `t`) are defined in `book.html`
  and `css/book.css`.
- `<details class="q">` is an exam-style check; the summary is the question,
  the `.a` div the answer.
- `<div class="callout exam|warn|why">` are the highlighted notes.

The 21 chapters cover every Unit 1 and Unit 2 syllabus topic, and every
question in the CA2 paper sets and the mock-test bank has its fact stated in
the corresponding chapter (checked by script before release). The audiobook
uses the browser's own speech engine (Web Speech API): nothing is downloaded
and no key is needed.

Every drill and practical was validated before export: its own model answer
must pass its own checks, and an empty answer must fail them. The browser
marking engine was checked against the original Python engine across 342
comparisons with zero disagreements.

---

## Syllabus coverage

- **Unit 1** &mdash; HTML fundamentals: internet and web, client-server,
  HTML5, document structure, elements and attributes, text formatting,
  lists, links and images, SVG, multimedia, SEO, best practice
  (textbook chapters 1&ndash;12)
- **Unit 2** &mdash; Semantic HTML, page structure and layout, accessibility
  fundamentals, forms, input types, validation, tables, accessibility
  standards (WCAG), responsive content structuring
  (textbook chapters 13&ndash;21)
- **Unit 3** &mdash; CSS: selectors, specificity, the box model, units,
  positioning, Flexbox, Grid, responsive design, pseudo-classes and
  pseudo-elements, variables, transitions, animations

Units 4&ndash;6 (JavaScript, the DOM, deployment) are not here yet.

---

## Licence

Course material &copy; Tarun Jangwal. Released for the use of CSE326
students. See `LICENSE`.
