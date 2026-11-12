const { parseHTML } = require("linkedom");
const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "peiping.html"), "utf8"),
  growth = fs.readFileSync(path.join(root, "learning.js"), "utf8");
const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const quiz = main.slice(main.indexOf("/* ============ 3."));
function app(store = new Map(), blocked = false) {
  const { window } = parseHTML(html);
  window.innerWidth = 1000;
  window.innerHeight = 800;
  window.matchMedia = () => ({ matches: true });
  const document = window.document;
  const timers = [];
  let reloaded = false;
  const localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => {
      if (blocked) throw Error("blocked");
      store.set(k, v);
    },
    removeItem: (k) => store.delete(k),
  };
  const ctx = vm.createContext({
    window,
    document,
    localStorage,
    location: {
      reload() {
        reloaded = true;
      },
    },
    confirm: () => true,
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {},
    console,
  });
  vm.runInContext(growth, ctx);
  vm.runInContext(quiz, ctx);
  return {
    ctx,
    window,
    document,
    store,
    click(id) {
      document.getElementById(id).click();
    },
    input(id, value) {
      const el = document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new window.Event("input"));
    },
    state() {
      return JSON.parse(store.get("peiping_growth_v1"));
    },
    legacy(key) {
      return JSON.parse(store.get(key));
    },
    text(id) {
      return document.getElementById(id).textContent;
    },
    reloaded: () => reloaded,
  };
}
let a = app();
assert(a.text("storageStatus").includes("自动保存"));
a.input("ans-left-0", "2");
a.input("ans-left-1", "1");
a.input("ans-right-0", "2");
a.click("btnCheck");
assert(a.text("feedback").includes("3 星"));
assert(a.document.querySelector("#equation-display .mini-scale"));
assert.equal(a.document.querySelectorAll("#feedback .atom-check").length, 2);
const score = a.legacy("peiping_quiz").score;
a.click("btnCheck");
assert.equal(
  a.legacy("peiping_quiz").score,
  score,
  "duplicate does not farm points",
);
assert.equal(a.legacy("peiping_quiz").combo, 1);
a = app(a.store);
assert.equal(a.document.getElementById("ans-left-0").value, "2");
assert(a.text("stars-balance").includes("★★★"));
assert.equal(a.text("statScore"), String(score));
a.click("btnNext");
a.input("ans-left-0", "2");
a.input("ans-left-1", "1");
a.input("ans-right-0", "1");
a.click("btnCheck");
assert(a.document.querySelector("#feedback .mismatch"));
a = app(a.store);
a.input("ans-left-0", "1");
a.click("btnCheck");
assert(a.text("feedback").includes("2 星"), "wrong attempt survives reload");
a.click("btnNext");
a.click("btnHint");
a.input("ans-left-0", "1");
a.input("ans-left-1", "1");
a.input("ans-right-0", "1");
a.click("btnCheck");
assert(a.text("feedback").includes("1 星"));
a.document.querySelector("#stars-balance button").click();
a.input("ans-left-0", "1");
a.input("ans-left-1", "1");
a.input("ans-right-0", "1");
a.click("btnCheck");
assert(a.text("stars-balance").includes("★★★"), "retry upgrades best stars");
a.click("quizReset");
assert(a.text("stars-balance").includes("★★★"));
assert.equal(a.text("statSolved"), "3/34", "review keeps mastery");
// Formula question binding is replaced rather than accumulated on one reused input.
a.input("wInput", "O2");
a.click("wCheck");
assert(a.text("wFeedback").includes("3 星"));
a.click("wNext");
a.input("wInput", "H");
a.click("wCheck");
a = app(a.store);
a.input("wInput", "H2");
a.click("wCheck");
assert(a.text("wFeedback").includes("2 星"), "no-hint retry earns two stars");
const f = a.state().groups.formula;
assert.equal(
  f.sessions.O2.draft.wInput,
  "O2",
  "editing next question does not overwrite prior draft",
);
// Full equation, valid coefficients and drafts, settings rerender.
const terms = [
  ["2", "KMnO4"],
  ["1", "K2MnO4"],
  ["1", "MnO2"],
  ["1", "O2"],
];
terms.forEach((t, i) => {
  a.input("e-coef-" + i, t[0]);
  a.input("e-fml-" + i, t[1]);
});
a.click("eCheck");
assert(a.text("eFeedback").includes("3 星"));
assert(a.document.querySelector("#eLine .mini-scale"));
a = app(a.store);
assert.equal(a.document.getElementById("e-fml-0").value, "KMnO4");
assert(a.text("stars-equation").includes("★★★"));
// Legacy migration and malformed / unavailable storage.
let legacy = new Map([
  [
    "peiping_quiz",
    JSON.stringify({
      cur: 1,
      score: 20,
      combo: 0,
      best: 2,
      solved: { 0: true, 9999: true, garbage: true },
      winShown: false,
    }),
  ],
]);
let migrated = app(legacy);
assert.equal(migrated.text("statSolved"), "1/34");
assert(migrated.state().groups.balance.records["H2+O2>H2O"].stars === 1);
let bad = app(
  new Map([
    ["peiping_growth_v1", "oops"],
    ["peiping_quiz", "null"],
  ]),
);
assert(bad.text("growthStars").includes("0"));
let unavailable = app(new Map(), true);
assert(unavailable.text("storageStatus").includes("无法写入"));
unavailable.input("wInput", "O2");
unavailable.click("wCheck");
assert(unavailable.text("wFeedback").includes("3 星"));
// Badge thresholds use distinct questions, survive reload, never downgrade.
let b = app();
const g = b.ctx.PeipingGrowth;
const keys = Array.from({ length: 34 }, (_, i) => "test-" + i);
g.register("balance", keys, {});
for (let i = 0; i < 10; i++) g.attempt("balance", keys[i], true);
let state = b.state();
assert(state.badges.starter && state.badges.simple && state.badges.conserve);
const stamp = state.badges.starter;
g.attempt("balance", keys[9], true);
assert.equal(b.state().badges.starter, stamp);
g.register(
  "formula",
  Array.from({ length: 20 }, (_, i) => "f" + i),
  {},
);
for (let i = 0; i < 20; i++) g.attempt("formula", "f" + i, true);
assert(b.state().badges.formula && b.state().badges.nohint);
g.register("equation", ["e"], {});
g.attempt("equation", "e", true);
assert(b.state().badges.equation);
console.log(
  "PASS: all three quizzes, drafts/reload, legacy migration, 1/2/3 stars, retry upgrade, no point farming, review, badge thresholds, corrupted/blocked storage, success visuals and diagnostic counts.",
);
// Confetti accompanies local feedback, with a modest increase on each fifth new completion.
let paced = app();
paced.window.matchMedia = () => ({ matches: false });
const bursts = [];
paced.window.burst = (count) => bursts.push(count);
for (const [index, answer] of [
  [0, [2, 1, 2]],
  [1, [1, 1, 1]],
  [2, [1, 1, 1]],
  [3, [2, 1, 2]],
  [4, [2, 1, 2]],
]) {
  paced.input("ans-left-0", String(answer[0]));
  paced.input("ans-left-1", String(answer[1]));
  paced.input("ans-right-0", String(answer[2]));
  paced.click("btnCheck");
  if (index < 2)
    assert.equal(paced.document.querySelectorAll(".local-particles").length, 0);
  if (index === 2) assert(paced.document.querySelector(".local-particles"));
  if (index < 4) paced.click("btnNext");
}
assert(
  paced.document
    .getElementById("quizArea")
    .classList.contains("milestone-flash"),
);
assert.deepEqual(bursts, [20, 20, 20, 20, 40]);
paced.click("btnCheck");
assert.equal(bursts.length, 5, "repeat submit does not stack confetti");
paced.window.matchMedia = () => ({ matches: true });
paced.click("btnNext");
paced.input("ans-left-0", "2");
paced.input("ans-left-1", "1");
paced.input("ans-right-0", "2");
paced.click("btnCheck");
assert.equal(bursts.length, 5, "reduced motion suppresses confetti");
assert(paced.state().badges.conserve);
// Stars inside navigation chips must be clickable.
paced.document.querySelector('#qmap .map-chip[data-i="7"] .map-stars').click();
assert(paced.text("qno").includes("8 /"));
// Equation-only errors show the specific mismatched atoms and decimal coefficients are rejected.
a.input("e-coef-0", "4");
a.click("eCheck");
assert(a.document.querySelector("#eFeedback .mismatch"));
a.input("e-coef-0", "1.5");
a.click("eCheck");
assert(a.text("eFeedback").includes("正整数"));
// An explicit hint gives one star; all drafts can be reset without losing mastery.
a.click("wNext");
a.click("wShowHint");
a.input("wInput", "N2");
a.click("wCheck");
assert(a.text("wFeedback").includes("1 星"));
a.click("btnClearAllProgress");
assert(a.reloaded());
for (const key of [
  "peiping_quiz",
  "peiping_write",
  "peiping_eq",
  "peiping_growth_v1",
])
  assert(!a.store.has(key));
console.log(
  "PASS: milestone/local effect pacing, nested map click, coefficient diagnostics, explicit hint, full clear.",
);
