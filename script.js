"use strict";
const $ = (sel) => document.querySelector(sel);
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.toggle("active", s.id === id));
  window.scrollTo(0, 0);
}
function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function blink(el, kind) {
  el.classList.remove("f-good", "f-bad");
  retrigger(el, kind === "good" ? "f-good" : "f-bad");
}
function fillFacts(list, facts) {
  list.innerHTML = "";
  facts.forEach(([k, v]) => {
    const d = document.createElement("div");
    d.innerHTML = "<dt></dt><dd></dd>";
    d.firstChild.textContent = k;
    d.lastChild.textContent = v;
    list.appendChild(d);
  });
}
function fillResults(grid, cards) {
  grid.innerHTML = "";
  cards.forEach(([label, value, hl]) => {
    const c = document.createElement("div");
    c.className = "result-card" + (hl ? " hl" : "");
    c.innerHTML = `<span class="lbl"></span><strong></strong>`;
    c.firstChild.textContent = label;
    c.lastChild.textContent = value;
    grid.appendChild(c);
  });
}
function markLevelButtons(buttons, difficulty) {
  buttons.forEach((b) => b.classList.toggle("active", b.dataset.level === difficulty));
}
function initBubbles() {
  const LEVELS = {
    easy: {
      label: "Easy",
      letters: "ASDFGHJKL",
      letterNote: "Home row (9 letters)",
      speed: 42, // base upward speed, px / second
      spawn: 1.45, // seconds between new bubbles
      min: 5, // at least this many bubbles on screen
      max: 7, // at most this many (grows with level)
      missLimit: 8,
      penalty: 2,
    },
    medium: {
      label: "Medium",
      letters: "QWERTYUIOPASDFGHJKL",
      letterNote: "Home + top row (19)",
      speed: 62,
      spawn: 1.1,
      min: 5,
      max: 9,
      missLimit: 6,
      penalty: 4,
    },
    hard: {
      label: "Hard",
      letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      letterNote: "All 26 letters",
      speed: 88,
      spawn: 0.8,
      min: 6,
      max: 12,
      missLimit: 5,
      penalty: 6,
    },
  };
  const POINTS = 10;
  const LEVEL_EVERY = 5; // level up every 5 pops
  const COLORS = ["#3d8bfd", "#8b5cf6", "#ef7b45", "#16a6a1", "#db5a91", "#2f9e6b"];
  const field = $("#playfield"),
    layer = $("#bubbleLayer");
  const scoreEl = $("#score"),
    levelEl = $("#level"),
    timeEl = $("#time"),
    poppedEl = $("#popped"),
    streakEl = $("#streak"),
    missEl = $("#misses");
  const messageEl = $("#message"),
    diffBadge = $("#diffBadge"),
    diffInfo = $("#diffInfo");
  const segButtons = document.querySelectorAll(".seg-btn");
  let state = "home"; // home | running | ended
  let difficulty = "medium";
  let cfg = LEVELS[difficulty];
  let score, level, misses, popped, wrongKeys, streak, bestStreak, elapsed, spawnClock;
  let bubbles = [];
  let rafId = null; // the ONLY animation loop
  let lastTs = 0;
  let fieldW = 0,
    fieldH = 0,
    bubbleSize = 60;
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function setMsg(text, kind) {
    messageEl.textContent = text;
    messageEl.className = kind || "";
  }
  function measure() {
    fieldW = field.clientWidth;
    fieldH = field.clientHeight;
    bubbleSize = fieldW < 520 ? 50 : 62;
  }
  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    poppedEl.textContent = popped;
    streakEl.textContent = streak;
    missEl.textContent = `${misses} / ${cfg.missLimit}`;
    timeEl.textContent = fmtTime(elapsed);
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function startLoop() {
    stopLoop(); // never two loops at once
    lastTs = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function frame(ts) {
    rafId = null;
    if (state !== "running") return;
    const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    elapsed += dt;
    const speed = cfg.speed * Math.min(2.2, 1 + (level - 1) * 0.1);
    const spawnGap = Math.max(0.4, cfg.spawn * Math.pow(0.93, level - 1));
    const maxActive = Math.min(cfg.max + Math.floor((level - 1) / 2), cfg.letters.length - 1);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= speed * b.v * dt;
      if (b.y <= 0) {
        missBubble(b, i);
        if (state !== "running") return; // game ended on this miss
        continue;
      }
      b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    }
    spawnClock += dt;
    if (
      (bubbles.length < cfg.min && spawnClock > 0.3) ||
      (spawnClock >= spawnGap && bubbles.length < maxActive)
    ) {
      spawnBubble();
      spawnClock = 0;
    }
    updateHud();
    rafId = requestAnimationFrame(frame);
  }
  function spawnBubble(startY) {
    const used = new Set(bubbles.map((b) => b.letter)); // letters are unique on screen
    const free = [...cfg.letters].filter((c) => !used.has(c));
    const pool = free.length ? free : [...cfg.letters];
    const letter = pool[Math.floor(Math.random() * pool.length)];
    const size = bubbleSize;
    const y = startY === undefined ? fieldH + 4 : startY;
    const x = 10 + Math.random() * Math.max(0, fieldW - size - 20);
    const el = document.createElement("div");
    el.className = "bubble";
    el.style.setProperty("--c", COLORS[Math.floor(Math.random() * COLORS.length)]);
    el.style.width = el.style.height = size + "px";
    el.style.fontSize = Math.round(size * 0.45) + "px";
    el.innerHTML = '<span class="face"></span>';
    el.firstChild.textContent = letter;
    el.style.transform = `translate(${x}px, ${y}px)`;
    layer.appendChild(el);
    bubbles.push({ el, letter, x, y, size, v: 0.85 + Math.random() * 0.3 });
  }
  function handleLetter(letter) {
    const hits = bubbles.filter((b) => b.letter === letter);
    if (hits.length) {
      hits.sort((a, b) => a.y - b.y); // pop the one closest to the top first
      popBubble(hits[0]);
    } else {
      wrongPress(letter);
    }
  }
  function popBubble(b) {
    bubbles.splice(bubbles.indexOf(b), 1);
    popped++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    score += POINTS;
    b.el.classList.add("popped");
    setTimeout(() => b.el.remove(), 300);
    blink(field, "good");
    const oldLevel = level;
    level = 1 + Math.floor(popped / LEVEL_EVERY);
    if (level > oldLevel) {
      setMsg(`Level ${level}! Bubbles are faster and there are more of them.`, "level");
    } else {
      setMsg(`Nice! “${b.letter}” popped · +${POINTS}`, "good");
    }
    updateHud();
  }
  function wrongPress(letter) {
    wrongKeys++;
    streak = 0;
    score = Math.max(0, score - cfg.penalty); // penalty, score never below 0
    blink(field, "bad");
    retrigger(layer, "shake");
    setMsg(`No “${letter}” bubble on screen! −${cfg.penalty} points`, "bad");
    updateHud();
  }
  function missBubble(b, index) {
    bubbles.splice(index, 1);
    misses++;
    streak = 0;
    b.el.remove();
    blink(field, "bad");
    setMsg(`Missed “${b.letter}” — it reached the top! (${misses}/${cfg.missLimit} misses)`, "bad");
    updateHud();
    if (misses >= cfg.missLimit) endGame();
  }
  function endGame() {
    state = "ended";
    stopLoop();
    showResults();
  }
  function resetState() {
    score = 0;
    level = 1;
    misses = popped = wrongKeys = streak = bestStreak = 0;
    elapsed = spawnClock = 0;
    bubbles = [];
    layer.innerHTML = "";
    field.classList.remove("f-good", "f-bad");
    diffBadge.textContent = cfg.label;
    setMsg("Pop the bubbles! Type the letter shown on a bubble.", "");
    updateHud();
  }
  function startGame() {
    stopLoop();
    cfg = LEVELS[difficulty];
    resetState();
    showScreen("gameScreen");
    measure();
    if (document.activeElement) document.activeElement.blur();
    state = "running";
    const n = cfg.min; // start with `min` (>= 5) bubbles already on screen
    for (let i = 0; i < n; i++) spawnBubble(fieldH * (0.5 + 0.42 * (i / Math.max(1, n - 1))));
    startLoop();
  }
  function resetGame() {
    stopLoop();
    cfg = LEVELS[difficulty];
    resetState();
    state = "home";
    showScreen("homeScreen");
    renderHome();
  }
  function showResults() {
    const total = popped + wrongKeys;
    fillResults($("#resultGrid"), [
      ["Score", score, true],
      ["Bubbles popped", popped],
      ["Wrong keypresses", wrongKeys],
      ["Misses", `${misses} / ${cfg.missLimit}`],
      ["Accuracy", total ? Math.round((popped / total) * 100) + "%" : "—"],
      ["Best streak", bestStreak],
      ["Level reached", level],
      ["Time played", fmtTime(elapsed)],
      ["Difficulty", cfg.label],
    ]);
    $("#resultIcon").textContent = "💥";
    $("#resultTitle").textContent = "Game Over";
    $("#resultReason").textContent = `${cfg.missLimit} bubbles escaped through the top — miss limit reached.`;
    showScreen("resultsScreen");
  }
  function renderHome() {
    fillFacts(diffInfo, [
      ["Speed", `${cfg.speed} px/s`],
      ["Letters", cfg.letterNote],
      ["Misses allowed", cfg.missLimit],
      ["Wrong key", `−${cfg.penalty} pts`],
    ]);
    markLevelButtons(segButtons, difficulty);
  }
  segButtons.forEach((b) =>
    b.addEventListener("click", () => {
      difficulty = b.dataset.level;
      cfg = LEVELS[difficulty];
      renderHome();
    }),
  );
  $("#startBtn").addEventListener("click", startGame);
  $("#restartBtn").addEventListener("click", startGame);
  $("#playAgainBtn").addEventListener("click", startGame);
  $("#resetBtn").addEventListener("click", resetGame);
  $("#homeBtn").addEventListener("click", resetGame);
  document.addEventListener("keydown", (e) => {
    if (state !== "running" || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault(); // don't trigger a focused button by accident
      return;
    }
    if (/^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      handleLetter(e.key.toUpperCase());
    }
  });
  field.addEventListener("pointerdown", (e) => {
    if (state !== "running") return;
    const el = e.target.closest(".bubble");
    const b = el && bubbles.find((o) => o.el === el);
    if (b) popBubble(b);
  });
  window.addEventListener("resize", measure);
  resetState();
  renderHome();
}
function initKeyMagnet() {
  const KEY_SETS = {
    practice: { label: "Practice — home row (A S D F J K L)", keys: ["A", "S", "D", "F", "J", "K", "L"] },
    top: { label: "Top row (Q W E R T Y U I O P)", keys: [..."QWERTYUIOP"] },
    bottom: { label: "Bottom row (Z X C V B N M)", keys: [..."ZXCVBNM"] },
    letters: { label: "All letters (A–Z)", keys: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] },
    mixed: { label: "Letters + numbers (A–Z, 0–9)", keys: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"] },
  };
  const LEVELS = {
    easy: { label: "Easy", set: "practice", time: 60, keyLimit: 0, hint: "key", penalty: 2 },
    medium: { label: "Medium", set: "letters", time: 45, keyLimit: 3, hint: "row", penalty: 4 },
    hard: { label: "Hard", set: "mixed", time: 30, keyLimit: 2, hint: "none", penalty: 6 },
  };
  const HINT_TEXT = { key: "Target key glows", row: "Target row highlighted", none: "No hints" };
  const POINTS = 10;
  const ROWS = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const stage = $("#stage"),
    targetEl = $("#targetKey"),
    feedbackEl = $("#feedback");
  const keyTimerWrap = $("#keyTimerWrap"),
    keyTimerBar = $("#keyTimerBar"),
    keyTimerNote = $("#keyTimerNote");
  const scoreEl = $("#score"),
    timeEl = $("#time"),
    timeCell = $("#timeCell"),
    correctEl = $("#correct"),
    incorrectEl = $("#incorrect"),
    averageEl = $("#average"),
    streakEl = $("#streak");
  const keyboardEl = $("#keyboard"),
    diffBadge = $("#diffBadge"),
    setBadge = $("#setBadge"),
    diffInfo = $("#diffInfo");
  const keySetSelect = $("#keySetSelect"),
    keySetKeys = $("#keySetKeys");
  const segButtons = document.querySelectorAll(".seg-btn");
  let state = "home"; // home | running | ended
  let difficulty = "medium";
  let keySet = LEVELS[difficulty].set;
  let cfg = LEVELS[difficulty];
  let activeKeys = KEY_SETS[keySet].keys;
  let score, correct, incorrect, timeouts, streak, bestStreak;
  let responseTimes, mistakes, target, timeLeft;
  let runStart = 0,
    targetStart = 0;
  let rafId = null; // the ONLY animation loop
  const keyButtons = new Map(); // letter -> on-screen key button
  const rowOf = (ch) => ROWS.findIndex((r) => r.includes(ch));
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  function setFeedback(text, kind) {
    feedbackEl.textContent = text;
    feedbackEl.className = kind || "";
  }
  function updateHud() {
    scoreEl.textContent = score;
    correctEl.textContent = correct;
    incorrectEl.textContent = incorrect;
    streakEl.textContent = streak;
    averageEl.textContent = responseTimes.length ? `${avg(responseTimes)} ms` : "—";
    const sec = Math.ceil(timeLeft);
    timeEl.textContent = sec + "s";
    timeCell.classList.toggle("low", sec <= 10 && state === "running");
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function applySettings() {
    cfg = LEVELS[difficulty];
    activeKeys = KEY_SETS[keySet].keys;
  }
  function buildKeyboard() {
    ROWS.forEach((letters) => {
      const row = document.createElement("div");
      row.className = "key-row";
      [...letters].forEach((ch) => {
        const btn = document.createElement("button");
        btn.className = "key";
        btn.type = "button";
        btn.textContent = ch;
        btn.setAttribute("aria-label", `Key ${ch}`);
        btn.addEventListener("click", () => handleKey(ch));
        row.appendChild(btn);
        keyButtons.set(ch, btn);
      });
      keyboardEl.appendChild(row);
    });
  }
  function markActiveKeys() {
    keyButtons.forEach((btn, ch) => btn.classList.toggle("off", !activeKeys.includes(ch)));
  }
  function updateHints() {
    keyButtons.forEach((btn, ch) => {
      btn.classList.toggle("glow", cfg.hint === "key" && ch === target);
      btn.classList.toggle("rowhint", cfg.hint === "row" && rowOf(ch) === rowOf(target));
    });
  }
  function startLoop() {
    stopLoop(); // never two loops at once
    runStart = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function frame(ts) {
    rafId = null;
    if (state !== "running") return;
    timeLeft = cfg.time - (ts - runStart) / 1000;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
      return;
    }
    if (cfg.keyLimit) {
      const used = (ts - targetStart) / 1000;
      if (used >= cfg.keyLimit) keyTimeout(); // too slow on this key
      const left = Math.max(0, 1 - (ts - targetStart) / 1000 / cfg.keyLimit);
      keyTimerBar.style.transform = `scaleX(${left})`;
      keyTimerWrap.classList.toggle("low", left < 0.3);
    }
    updateHud();
    rafId = requestAnimationFrame(frame);
  }
  function chooseTarget() {
    let next;
    do {
      next = activeKeys[Math.floor(Math.random() * activeKeys.length)];
    } while (activeKeys.length > 1 && next === target);
    target = next;
    targetStart = performance.now();
    targetEl.textContent = target;
    keyTimerBar.style.transform = "scaleX(1)";
    keyTimerWrap.classList.remove("low");
    updateHints();
  }
  function handleKey(ch) {
    if (state !== "running" || !keyButtons.has(ch)) return;
    if (ch === target) onCorrect(ch);
    else onWrong(ch);
  }
  function onCorrect(ch) {
    const rt = Math.round(performance.now() - targetStart);
    responseTimes.push(rt);
    correct++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    score += POINTS;
    retrigger(keyButtons.get(ch), "ok");
    blink(stage, "good");
    setFeedback(`Correct! +${POINTS} · ${rt} ms`, "good");
    chooseTarget();
    updateHud();
  }
  function onWrong(ch) {
    incorrect++;
    streak = 0;
    mistakes[target] = (mistakes[target] || 0) + 1;
    score = Math.max(0, score - cfg.penalty); // penalty, score never below 0
    retrigger(keyButtons.get(ch), "no");
    retrigger(targetEl, "nope");
    blink(stage, "bad");
    setFeedback(`Wrong key: you pressed ${ch}. Find ${target}! −${cfg.penalty} points`, "bad");
    updateHud();
  }
  function keyTimeout() {
    incorrect++;
    timeouts++;
    streak = 0;
    mistakes[target] = (mistakes[target] || 0) + 1;
    score = Math.max(0, score - cfg.penalty);
    retrigger(targetEl, "nope");
    blink(stage, "bad");
    setFeedback(`Too slow! The key was ${target}. −${cfg.penalty} points`, "bad");
    chooseTarget();
    updateHud();
  }
  function endGame() {
    state = "ended";
    stopLoop();
    updateHud();
    showResults();
  }
  function resetState() {
    applySettings();
    score = correct = incorrect = timeouts = streak = bestStreak = 0;
    responseTimes = [];
    mistakes = {};
    target = "";
    timeLeft = cfg.time;
    keyButtons.forEach((btn) => btn.classList.remove("off", "glow", "rowhint", "ok", "no"));
    stage.classList.remove("f-good", "f-bad");
    targetEl.textContent = "?";
    diffBadge.textContent = cfg.label;
    setBadge.textContent = KEY_SETS[keySet].label.split(" (")[0];
    keyTimerBar.style.transform = "scaleX(1)";
    keyTimerWrap.classList.remove("low");
    keyTimerWrap.classList.toggle("off", !cfg.keyLimit);
    keyTimerNote.textContent = cfg.keyLimit
      ? `${cfg.keyLimit.toFixed(1)} s allowed per key`
      : "No time limit per key";
    setFeedback("Press the key shown above.", "");
    updateHud();
  }
  function startGame() {
    stopLoop();
    resetState();
    showScreen("gameScreen");
    if (document.activeElement) document.activeElement.blur();
    state = "running";
    markActiveKeys();
    chooseTarget();
    startLoop();
  }
  function resetGame() {
    stopLoop();
    resetState();
    state = "home";
    showScreen("homeScreen");
    renderHome();
  }
  function showResults() {
    const total = correct + incorrect;
    const acc = total ? Math.round((correct / total) * 100) : 0;
    const worst = Object.entries(mistakes).sort((a, b) => b[1] - a[1])[0];
    const has = responseTimes.length > 0;
    let icon = "🌱",
      title = "Keep Practising!";
    if (correct >= 5) {
      if (acc >= 95) [icon, title] = ["🏆", "Keyboard Master!"];
      else if (acc >= 85) [icon, title] = ["🥇", "Sharp Typist!"];
      else if (acc >= 70) [icon, title] = ["👍", "Getting There!"];
    }
    $("#resultIcon").textContent = icon;
    $("#resultTitle").textContent = title;
    $("#resultReason").textContent =
      `Time's up! ${cfg.label} · ${KEY_SETS[keySet].label.split(" (")[0]} · ${cfg.time} seconds.`;
    fillResults($("#resultGrid"), [
      ["Score", score, true],
      ["Correct", correct],
      ["Incorrect", incorrect],
      ["Timeouts", cfg.keyLimit ? timeouts : "n/a"],
      ["Accuracy", total ? acc + "%" : "—"],
      ["Avg response", has ? avg(responseTimes) + " ms" : "—"],
      ["Fastest", has ? Math.min(...responseTimes) + " ms" : "—"],
      ["Slowest", has ? Math.max(...responseTimes) + " ms" : "—"],
      ["Best streak", bestStreak],
      ["Most missed key", worst ? `${worst[0]} (${worst[1]}×)` : "None 🎉"],
    ]);
    showScreen("resultsScreen");
  }
  function renderHome() {
    fillFacts(diffInfo, [
      ["Session", `${cfg.time} seconds`],
      ["Time per key", cfg.keyLimit ? `${cfg.keyLimit.toFixed(1)} s` : "Unlimited"],
      ["Hints", HINT_TEXT[cfg.hint]],
      ["Wrong key", `−${cfg.penalty} pts`],
      ["Keys in play", KEY_SETS[keySet].keys.length],
    ]);
    markLevelButtons(segButtons, difficulty);
    keySetSelect.value = keySet;
    keySetKeys.textContent = KEY_SETS[keySet].keys.join("  ");
  }
  segButtons.forEach((b) =>
    b.addEventListener("click", () => {
      difficulty = b.dataset.level;
      keySet = LEVELS[difficulty].set;
      applySettings();
      renderHome();
    }),
  );
  keySetSelect.addEventListener("change", () => {
    keySet = keySetSelect.value;
    applySettings();
    renderHome();
  });
  $("#startBtn").addEventListener("click", startGame);
  $("#restartBtn").addEventListener("click", startGame);
  $("#playAgainBtn").addEventListener("click", startGame);
  $("#resetBtn").addEventListener("click", resetGame);
  $("#homeBtn").addEventListener("click", resetGame);
  document.addEventListener("keydown", (e) => {
    if (state !== "running" || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      return;
    }
    if (/^[a-z0-9]$/i.test(e.key)) {
      e.preventDefault();
      handleKey(e.key.toUpperCase());
    }
  });
  Object.entries(KEY_SETS).forEach(([id, s]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = s.label;
    keySetSelect.appendChild(o);
  });
  buildKeyboard();
  resetState();
  renderHome();
}
const themeButton = document.createElement("button");
themeButton.type = "button";
themeButton.className = "theme-toggle";
themeButton.setAttribute("aria-label", "Toggle dark mode");
document.body.appendChild(themeButton);
function setTheme(dark) {
  document.body.classList.toggle("dark-mode", dark);
  themeButton.textContent = dark ? "☀ Light Mode" : "🌙 Dark Mode";
  themeButton.setAttribute("aria-pressed", String(dark));
  localStorage.setItem("typing-theme", dark ? "dark" : "light");
}
setTheme(localStorage.getItem("typing-theme") === "dark");
themeButton.addEventListener("click", () =>
  setTheme(!document.body.classList.contains("dark-mode"))
);
const PAGE = document.body.dataset.page;
if (PAGE === "bubbles") initBubbles();
else if (PAGE === "keymagnet") initKeyMagnet();
