// ============================================
// CONFIDENCE QUIZ — APP.JS
// ============================================

// ---------- State ----------
let role = null;          // "host" | "player"
let gamePin = null;
let hostId = null;        // random ID for this host session
let playerName = null;
let questions = [];       // host's quiz data
let gameUnsubscribe = null;
let playersUnsubscribe = null;
let timerInterval = null;
let confTimerInterval = null;
let playerAnswered = false;
let playerConfidenceChosen = false;
let playerCurrentQIndex = -1;

// ---------- Admin Auth ----------
const ADMIN_HASH = "60f9c4e008dddf5c1bfa41cf9fefb9167816f22ebc6c5983e05362fe44807fde";
let isAdmin = sessionStorage.getItem("cqAdmin") === "1";
let editingQuizId = null;

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Screen management ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

// ============================================
// HOST — QUIZ BUILDER
// ============================================

let questionCount = 0;

function addQuestionCard(data) {
  questionCount++;
  const num = questionCount;
  const container = document.getElementById("questions-builder");
  const card = document.createElement("div");
  card.className = "question-card";
  card.dataset.qnum = num;
  card.innerHTML = `
    <div class="question-card-header">
      <h4>Question ${num}</h4>
      <button class="question-card-remove" onclick="removeQuestion(this)">&times;</button>
    </div>
    <div class="q-field">
      <label>Question Text</label>
      <textarea rows="2" class="q-text" placeholder="Type your question...">${data ? data.text : ""}</textarea>
    </div>
    <div class="choices-grid">
      <div class="choice-input-row">
        <input type="radio" name="correct-${num}" value="a" ${data && data.correct === "a" ? "checked" : ""}>
        <span class="choice-dot choice-dot-a"></span>
        <input type="text" class="q-choice-a" placeholder="Choice A" value="${data ? data.choiceA : ""}">
      </div>
      <div class="choice-input-row">
        <input type="radio" name="correct-${num}" value="b" ${data && data.correct === "b" ? "checked" : ""}>
        <span class="choice-dot choice-dot-b"></span>
        <input type="text" class="q-choice-b" placeholder="Choice B" value="${data ? data.choiceB : ""}">
      </div>
      <div class="choice-input-row">
        <input type="radio" name="correct-${num}" value="c" ${data && data.correct === "c" ? "checked" : ""}>
        <span class="choice-dot choice-dot-c"></span>
        <input type="text" class="q-choice-c" placeholder="Choice C" value="${data ? data.choiceC : ""}">
      </div>
      <div class="choice-input-row">
        <input type="radio" name="correct-${num}" value="d" ${data && data.correct === "d" ? "checked" : ""}>
        <span class="choice-dot choice-dot-d"></span>
        <input type="text" class="q-choice-d" placeholder="Choice D" value="${data ? data.choiceD : ""}">
      </div>
      <div class="choice-input-row choice-e-row">
        <input type="radio" name="correct-${num}" value="e" ${data && data.correct === "e" ? "checked" : ""}>
        <span class="choice-dot choice-dot-e"></span>
        <span class="choice-e-fixed">Trick Question &#8212; None of the Above</span>
      </div>
    </div>
    <div class="q-bottom-row">
      <div class="q-field">
        <label>Points</label>
        <input type="number" class="q-points" min="1" value="${data ? data.points : 100}" placeholder="100">
      </div>
      <div class="q-field">
        <label>Time Limit (sec)</label>
        <input type="number" class="q-timelimit" min="5" value="${data ? data.timeLimit : 20}" placeholder="20">
      </div>
    </div>
  `;
  container.appendChild(card);
}

function removeQuestion(btn) {
  btn.closest(".question-card").remove();
  renumberQuestions();
}

function renumberQuestions() {
  const cards = document.querySelectorAll(".question-card");
  questionCount = 0;
  cards.forEach((card, i) => {
    questionCount = i + 1;
    card.dataset.qnum = questionCount;
    card.querySelector("h4").textContent = `Question ${questionCount}`;
    card.querySelectorAll('input[type="radio"]').forEach(r => {
      r.name = `correct-${questionCount}`;
    });
  });
}

function collectQuestions() {
  const cards = document.querySelectorAll(".question-card");
  const qs = [];
  let valid = true;
  cards.forEach(card => {
    const text = card.querySelector(".q-text").value.trim();
    const choiceA = card.querySelector(".q-choice-a").value.trim();
    const choiceB = card.querySelector(".q-choice-b").value.trim();
    const choiceC = card.querySelector(".q-choice-c").value.trim();
    const choiceD = card.querySelector(".q-choice-d").value.trim();
    const correctRadio = card.querySelector(`input[type="radio"]:checked`);
    const points = parseInt(card.querySelector(".q-points").value) || 100;
    const timeLimit = parseInt(card.querySelector(".q-timelimit").value) || 20;

    if (!text || !choiceA || !choiceB || !choiceC || !choiceD) { valid = false; return; }
    if (!correctRadio) { valid = false; return; }

    qs.push({ text, choiceA, choiceB, choiceC, choiceD,
      choiceE: "Trick Question \u2014 None of the Above",
      correct: correctRadio.value, points, timeLimit });
  });
  if (!valid || qs.length === 0) return null;
  return qs;
}

document.getElementById("add-question-btn").addEventListener("click", () => addQuestionCard());

// ============================================
// ADMIN AUTH + QUIZ MANAGEMENT
// ============================================

document.getElementById("go-admin-btn").addEventListener("click", () => {
  if (isAdmin) { loadMyQuizzes(); showScreen("screen-my-quizzes"); }
  else showScreen("screen-admin-login");
});

document.getElementById("admin-login-btn").addEventListener("click", async () => {
  const pw = document.getElementById("admin-password-input").value;
  const hash = await hashPassword(pw);
  if (hash === ADMIN_HASH) {
    isAdmin = true;
    sessionStorage.setItem("cqAdmin", "1");
    document.getElementById("admin-password-input").value = "";
    document.getElementById("login-error").classList.add("hidden");
    loadMyQuizzes();
    showScreen("screen-my-quizzes");
  } else {
    document.getElementById("login-error").classList.remove("hidden");
  }
});

document.getElementById("admin-password-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("admin-login-btn").click();
});

document.getElementById("admin-logout-btn").addEventListener("click", () => {
  isAdmin = false;
  sessionStorage.removeItem("cqAdmin");
  showScreen("screen-home");
});

document.getElementById("create-quiz-btn").addEventListener("click", () => openQuizBuilder());

async function loadMyQuizzes() {
  const list = document.getElementById("quiz-list");
  list.innerHTML = `<p class="quiz-list-msg">Loading...</p>`;
  try {
    const snap = await db.collection("quizzes").orderBy("createdAt", "desc").get();
    list.innerHTML = "";
    if (snap.empty) {
      list.innerHTML = `<p class="quiz-list-msg">No quizzes yet. Create your first one!</p>`;
      return;
    }
    snap.forEach(doc => {
      const data = doc.data();
      const card = document.createElement("div");
      card.className = "quiz-card";
      card.innerHTML = `
        <div class="quiz-card-info">
          <div class="quiz-card-title">${escapeHtml(data.title)}</div>
          <div class="quiz-card-meta">${data.questions.length} question${data.questions.length !== 1 ? "s" : ""}</div>
        </div>
        <div class="quiz-card-actions">
          <button class="btn btn-secondary btn-small quiz-edit-btn">Edit</button>
          <button class="btn btn-danger btn-small quiz-delete-btn">Delete</button>
          <button class="btn btn-host btn-small quiz-play-btn">&#9654; Play</button>
        </div>
      `;
      card.querySelector(".quiz-edit-btn").addEventListener("click", () => openQuizBuilder(doc.id, data));
      card.querySelector(".quiz-delete-btn").addEventListener("click", () => deleteQuiz(doc.id, data.title));
      card.querySelector(".quiz-play-btn").addEventListener("click", e => playQuiz(e, doc.id, data));
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = `<p class="quiz-list-msg">Error loading quizzes.</p>`;
  }
}

function openQuizBuilder(quizId = null, data = null) {
  editingQuizId = quizId;
  document.getElementById("quiz-title").value = data ? data.title : "";
  document.getElementById("setup-title").textContent = quizId ? "Edit Quiz" : "Create Quiz";
  document.getElementById("questions-builder").innerHTML = "";
  questionCount = 0;
  if (data && data.questions && data.questions.length > 0) {
    data.questions.forEach(q => addQuestionCard(q));
  } else {
    addQuestionCard();
  }
  document.getElementById("save-quiz-btn").textContent = quizId ? "Save Changes" : "Save Quiz";
  showScreen("screen-host-setup");
}

async function deleteQuiz(quizId, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  await db.collection("quizzes").doc(quizId).delete();
  loadMyQuizzes();
}

async function playQuiz(e, quizId, data) {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Starting...";
  try {
    const pin = await generatePin();
    if (!pin) { alert("Could not generate PIN. Try again."); btn.disabled = false; btn.innerHTML = "&#9654; Play"; return; }
    hostId = "host_" + Math.random().toString(36).slice(2, 10);
    gamePin = pin;
    questions = data.questions;
    role = "host";
    localStorage.setItem("cqHostSession", JSON.stringify({ gamePin: pin, hostId }));
    await db.collection("games").doc(pin).set({
      title: data.title,
      hostId,
      status: "lobby",
      phase: null,
      currentQuestionIndex: 0,
      questions: data.questions,
      questionStartedAt: null,
      confidenceStartedAt: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById("host-pin-code").textContent = pin;
    document.getElementById("lobby-quiz-title").textContent = `"${data.title}"`;
    showScreen("screen-host-lobby");
    listenToPlayers();
  } catch (err) {
    alert("Error starting game. Try again.");
  }
  btn.disabled = false;
  btn.innerHTML = "&#9654; Play";
}

document.getElementById("save-quiz-btn").addEventListener("click", async () => {
  const title = document.getElementById("quiz-title").value.trim();
  if (!title) { alert("Please enter a quiz title."); return; }
  const qs = collectQuestions();
  if (!qs) { alert("Please fill in all question fields and select a correct answer for each."); return; }

  const btn = document.getElementById("save-quiz-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    if (editingQuizId) {
      await db.collection("quizzes").doc(editingQuizId).update({
        title, questions: qs,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await db.collection("quizzes").add({
        title, questions: qs,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    loadMyQuizzes();
    showScreen("screen-my-quizzes");
  } catch (err) {
    alert("Error saving quiz. Try again.");
  }
  btn.disabled = false;
  btn.textContent = editingQuizId ? "Save Changes" : "Save Quiz";
});

// ============================================
// HOST — START GAME (create Firestore doc)
// ============================================

async function generatePin() {
  for (let i = 0; i < 50; i++) {
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    const doc = await db.collection("games").doc(pin).get();
    if (!doc.exists) return pin;
  }
  return null;
}


// ============================================
// HOST — LOBBY (listen for players)
// ============================================

function listenToPlayers() {
  if (playersUnsubscribe) playersUnsubscribe();
  playersUnsubscribe = db.collection("games").doc(gamePin).collection("players")
    .onSnapshot(snap => {
      const players = [];
      snap.forEach(doc => players.push(doc.data()));
      renderPlayerList(players);
    });
}

function renderPlayerList(players) {
  // Host lobby
  const listEl = document.getElementById("player-list");
  if (listEl) {
    listEl.innerHTML = "";
    players.forEach(p => {
      const chip = document.createElement("span");
      chip.className = "player-chip";
      chip.textContent = p.name;
      listEl.appendChild(chip);
    });
  }
  document.getElementById("player-count").textContent = players.length;

  // Player lobby
  const pListEl = document.getElementById("player-lobby-list");
  if (pListEl) {
    pListEl.innerHTML = "";
    players.forEach(p => {
      const chip = document.createElement("span");
      chip.className = "player-chip" + (playerName && p.name === playerName ? " player-chip-me" : "");
      chip.textContent = p.name;
      pListEl.appendChild(chip);
    });
  }
}

// ============================================
// HOST — BEGIN QUIZ
// ============================================

document.getElementById("begin-quiz-btn").addEventListener("click", async () => {
  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  if (snap.empty) { alert("No players have joined yet!"); return; }

  await db.collection("games").doc(gamePin).update({
    status: "playing",
    phase: "question",
    currentQuestionIndex: 0,
    questionStartedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  showHostQuestion(0);
});

// ============================================
// HOST — SHOW QUESTION
// ============================================

function showHostQuestion(idx) {
  const q = questions[idx];
  document.getElementById("host-q-counter").textContent = `Question ${idx + 1} / ${questions.length}`;
  document.getElementById("host-question-text").textContent = q.text;
  document.getElementById("host-choice-a").textContent = q.choiceA;
  document.getElementById("host-choice-b").textContent = q.choiceB;
  document.getElementById("host-choice-c").textContent = q.choiceC;
  document.getElementById("host-choice-d").textContent = q.choiceD;
  document.getElementById("host-phase-label").textContent = "Answer Phase";

  // Clear correct highlight
  document.querySelectorAll(".host-choice").forEach(el => el.classList.remove("correct-answer"));

  // Start timer
  startHostTimer(q.timeLimit, idx);
  showScreen("screen-host-question");

  // Listen for answer count
  listenToAnswerCount(idx);
}

function startHostTimer(seconds, qIdx) {
  clearInterval(timerInterval);
  let remaining = seconds;
  const el = document.getElementById("host-timer");
  el.textContent = remaining;
  el.classList.remove("urgent");

  timerInterval = setInterval(() => {
    remaining--;
    el.textContent = remaining;
    if (remaining <= 5) el.classList.add("urgent");
    if (remaining <= 0) {
      clearInterval(timerInterval);
      endAnswerPhase(qIdx);
    }
  }, 1000);
}

function listenToAnswerCount(qIdx) {
  if (playersUnsubscribe) playersUnsubscribe();
  playersUnsubscribe = db.collection("games").doc(gamePin).collection("players")
    .onSnapshot(snap => {
      let answered = 0;
      let total = 0;
      let confDone = 0;
      snap.forEach(doc => {
        total++;
        const d = doc.data();
        if (d.currentAnswer) answered++;
        if (d.currentConfidence) confDone++;
      });
      document.getElementById("host-answer-count").textContent =
        document.getElementById("host-phase-label").textContent === "Confidence Phase"
          ? `${confDone} / ${total} submitted confidence`
          : `${answered} / ${total} answered`;

      // Auto-advance: all answered during answer phase
      const phase = document.getElementById("host-phase-label").textContent;
      if (phase === "Answer Phase" && answered === total && total > 0) {
        clearInterval(timerInterval);
        endAnswerPhase(qIdx);
      }
      // Auto-advance: all confidence submitted
      if (phase === "Confidence Phase" && confDone === total && total > 0) {
        clearInterval(confTimerInterval);
        endConfidencePhase(qIdx);
      }
    });
}

document.getElementById("host-end-timer-btn").addEventListener("click", () => {
  clearInterval(timerInterval);
  // Figure out which phase we're in
  const phase = document.getElementById("host-phase-label").textContent;
  const gameRef = db.collection("games").doc(gamePin);
  gameRef.get().then(doc => {
    const idx = doc.data().currentQuestionIndex;
    if (phase === "Answer Phase") {
      endAnswerPhase(idx);
    } else if (phase === "Confidence Phase") {
      endConfidencePhase(idx);
    }
  });
});

// ============================================
// HOST — END ANSWER PHASE → CONFIDENCE
// ============================================

async function endAnswerPhase(qIdx) {
  clearInterval(timerInterval);
  document.getElementById("host-phase-label").textContent = "Confidence Phase";

  await db.collection("games").doc(gamePin).update({
    phase: "confidence",
    confidenceStartedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Confidence timer (10s)
  let remaining = 10;
  const el = document.getElementById("host-timer");
  el.textContent = remaining;
  el.classList.remove("urgent");

  confTimerInterval = setInterval(() => {
    remaining--;
    el.textContent = remaining;
    if (remaining <= 3) el.classList.add("urgent");
    if (remaining <= 0) {
      clearInterval(confTimerInterval);
      endConfidencePhase(qIdx);
    }
  }, 1000);
}

// ============================================
// HOST — END CONFIDENCE PHASE → CALCULATE SCORES
// ============================================

async function endConfidencePhase(qIdx) {
  clearInterval(confTimerInterval);
  document.getElementById("host-phase-label").textContent = "Calculating...";
  document.getElementById("host-timer").textContent = "—";

  const q = questions[qIdx];
  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const batch = db.batch();

  // Collect player data and compute deltas
  const allPlayers = [];
  snap.forEach(doc => {
    const d = doc.data();
    const answer = d.currentAnswer || null;
    const confidence = d.currentConfidence || "guessing";
    const isCorrect = !!answer && answer === q.correct;
    let delta = 0;
    if (answer) {
      if (isCorrect) {
        if (confidence === "guessing") delta = 0;
        else if (confidence === "kinda")   delta = Math.round(q.points * 0.4);
        else if (confidence === "pretty")  delta = Math.round(q.points * 0.7);
        else if (confidence === "certain") delta = q.points;
      } else {
        if (confidence === "guessing") delta = 0;
        else if (confidence === "kinda")   delta = -Math.round(q.points * 0.3);
        else if (confidence === "pretty")  delta = -Math.round(q.points * 0.5);
        else if (confidence === "certain") delta = -Math.round(q.points * 0.75);
      }
    }
    allPlayers.push({ ref: doc.ref, d, answer, confidence, isCorrect, delta });
  });

  // Compute old ranks (before this round)
  [...allPlayers].sort((a, b) => (b.d.score || 0) - (a.d.score || 0))
    .forEach((p, i) => { p.oldRank = i + 1; });

  // Compute new ranks (after this round)
  [...allPlayers].sort((a, b) => ((b.d.score || 0) + b.delta) - ((a.d.score || 0) + a.delta))
    .forEach((p, i) => { p.newRank = i + 1; });

  // Compute answer distribution
  const distribution = { a: 0, b: 0, c: 0, d: 0, e: 0 };
  let totalAnswered = 0;
  allPlayers.forEach(({ answer }) => {
    if (answer && answer in distribution) { distribution[answer]++; totalAnswered++; }
  });

  // Batch update with history and rank tracking
  allPlayers.forEach(({ ref, d, answer, confidence, isCorrect, delta, oldRank, newRank }) => {
    const history = d.history || [];
    history.push({ wasCorrect: isCorrect, confidence, answered: !!answer, delta, questionPoints: q.points });
    batch.update(ref, {
      score: (d.score || 0) + delta,
      pointsThisRound: delta,
      history,
      biggestRankGain: Math.max(d.biggestRankGain || 0, oldRank - newRank)
    });
  });

  await batch.commit();

  // Highlight correct answer on host screen
  const correctLetter = q.correct;
  document.querySelectorAll(".host-choice").forEach(el => el.classList.remove("correct-answer"));
  document.querySelector(`.host-choice.choice-${correctLetter}`).classList.add("correct-answer");

  await db.collection("games").doc(gamePin).update({ phase: "results" });

  // After 3 seconds, show leaderboard
  setTimeout(() => {
    showHostLeaderboard(qIdx, q, distribution, totalAnswered);
  }, 3500);
}

// ============================================
// HOST — LEADERBOARD
// ============================================

async function showHostLeaderboard(qIdx, q = null, distribution = null, totalAnswered = 0) {
  await db.collection("games").doc(gamePin).update({ phase: "leaderboard" });

  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const players = [];
  snap.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Render answer distribution
  const breakdownEl = document.getElementById("host-answer-breakdown");
  if (q && distribution) {
    const letters = ["a", "b", "c", "d", "e"];
    const colors = { a: "var(--choice-a)", b: "var(--choice-b)", c: "var(--choice-c)", d: "var(--choice-d)", e: "var(--choice-e)" };
    breakdownEl.innerHTML = `<h4 class="breakdown-title">Answer Distribution</h4>` +
      letters.map(letter => {
        const text = q["choice" + letter.toUpperCase()] || "";
        if (!text) return "";
        const count = distribution[letter] || 0;
        const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
        const isCorrect = letter === q.correct;
        return `<div class="breakdown-row${isCorrect ? " breakdown-correct" : ""}">
          <span class="breakdown-letter" style="background:${colors[letter]}">${letter.toUpperCase()}</span>
          <span class="breakdown-text">${text}</span>
          <div class="breakdown-bar-wrap">
            <div class="breakdown-bar" style="width:${pct}%;background:${isCorrect ? "var(--choice-d)" : colors[letter]}"></div>
          </div>
          <span class="breakdown-pct">${pct}%&nbsp;(${count})</span>
          ${isCorrect ? '<span class="breakdown-tick">&#10003;</span>' : ""}
        </div>`;
      }).join("");
  } else {
    breakdownEl.innerHTML = "";
  }

  renderLeaderboard(players, "host-leaderboard-list");
  showScreen("screen-host-leaderboard");

  // Show/hide Next vs End
  const isLast = qIdx >= questions.length - 1;
  document.getElementById("host-next-q-btn").classList.toggle("hidden", isLast);
  document.getElementById("host-end-game-btn").classList.toggle("hidden", !isLast);
}

// Tracks each player's previous rank per leaderboard container
const _lbPrevRank = {};

function renderLeaderboard(players, containerId, highlightName = null) {
  const container = document.getElementById(containerId);
  const prevRank = _lbPrevRank[containerId] || {};

  // Render new layout
  container.innerHTML = "";
  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "lb-row" + (highlightName && p.name === highlightName ? " lb-row-me" : "");
    row.dataset.lbName = p.name;
    row.dataset.lbRank = i;
    const delta = p.pointsThisRound || 0;
    const deltaClass = delta > 0 ? "positive" : delta < 0 ? "negative" : "zero";
    const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "0";
    const rankClass = i < 3 ? ` lb-rank-${i + 1}` : "";
    const newScore = p.score || 0;
    const oldScore = newScore - delta;
    row.innerHTML = `
      <span class="lb-rank${rankClass}">${i + 1}</span>
      <span class="lb-name">${escapeHtml(p.name)}</span>
      <span class="lb-score" data-new-score="${newScore}">${oldScore}</span>
      <span class="lb-delta ${deltaClass}">${deltaText}</span>
    `;
    container.appendChild(row);
  });

  // Save current ranks for next render
  _lbPrevRank[containerId] = {};
  players.forEach((p, i) => { _lbPrevRank[containerId][p.name] = i; });

  // FLIP: animate rows from previous rank to new rank.
  // We defer one rAF so showScreen() has already run and the container is visible,
  // letting us read the real row height for computing dy.
  if (Object.keys(prevRank).length > 0) {
    // Use setTimeout instead of rAF so the browser has time to commit display:flex
    // from showScreen() before we measure row height.
    setTimeout(() => {
      const firstRow = container.querySelector(".lb-row");
      const stride = firstRow ? firstRow.getBoundingClientRect().height + 8 : 0;
      if (stride < 10) return;

      container.querySelectorAll(".lb-row[data-lb-name]").forEach(row => {
        const oldIdx = prevRank[row.dataset.lbName];
        const newIdx = parseInt(row.dataset.lbRank, 10);
        if (oldIdx == null || oldIdx === newIdx) return;
        const dy = (oldIdx - newIdx) * stride;
        row.style.transition = "none";
        row.style.transform = `translateY(${dy}px)`;
      });

      // 500ms pause before sliding so players can read the leaderboard first
      setTimeout(() => {
        container.querySelectorAll(".lb-row[data-lb-name]").forEach(row => {
          if (!row.style.transform) return;
          row.style.transition = "transform 1.1s cubic-bezier(0.4, 0, 0.2, 1)";
          row.style.transform = "";
          row.addEventListener("transitionend", () => { row.style.transition = ""; }, { once: true });
        });
      }, 500);
    }, 80);
  }

  // Score count-up animation
  const duration = 2200;
  const startTime = performance.now();
  container.querySelectorAll(".lb-score[data-new-score]").forEach(el => {
    const from = parseInt(el.textContent, 10);
    const to = parseInt(el.dataset.newScore, 10);
    if (from === to) return;
    function tick(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// Host: next question
document.getElementById("host-next-q-btn").addEventListener("click", async () => {
  const gameRef = db.collection("games").doc(gamePin);
  const doc = await gameRef.get();
  const nextIdx = (doc.data().currentQuestionIndex || 0) + 1;

  // Reset player answers
  const snap = await gameRef.collection("players").get();
  const batch = db.batch();
  snap.forEach(d => {
    batch.update(d.ref, {
      currentAnswer: null,
      currentConfidence: null,
      pointsThisRound: 0
    });
  });
  await batch.commit();

  await gameRef.update({
    currentQuestionIndex: nextIdx,
    phase: "question",
    questionStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
    confidenceStartedAt: null
  });

  showHostQuestion(nextIdx);
});

// Host: end game
document.getElementById("host-end-game-btn").addEventListener("click", async () => {
  await db.collection("games").doc(gamePin).update({ status: "ended", phase: "ended" });
  showEndGame();
});

// ============================================
// PLAYER — JOIN
// ============================================

document.getElementById("join-game-btn").addEventListener("click", async () => {
  const name = document.getElementById("player-name-input").value.trim();
  const pin = document.getElementById("game-pin-input").value.trim();
  const errEl = document.getElementById("join-error");
  errEl.classList.add("hidden");

  if (!name) { errEl.textContent = "Please enter your name."; errEl.classList.remove("hidden"); return; }
  if (!pin || pin.length !== 4) { errEl.textContent = "Please enter a valid 4-digit PIN."; errEl.classList.remove("hidden"); return; }

  // Check game exists
  const gameDoc = await db.collection("games").doc(pin).get();
  if (!gameDoc.exists) { errEl.textContent = "Game not found. Check the PIN."; errEl.classList.remove("hidden"); return; }
  if (gameDoc.data().status !== "lobby") { errEl.textContent = "This game has already started."; errEl.classList.remove("hidden"); return; }

  // Check name not taken
  const existingPlayer = await db.collection("games").doc(pin).collection("players").doc(name).get();
  if (existingPlayer.exists) { errEl.textContent = "That name is taken. Choose another."; errEl.classList.remove("hidden"); return; }

  gamePin = pin;
  playerName = name;
  role = "player";
  localStorage.setItem("cqPlayerSession", JSON.stringify({ gamePin: pin, playerName: name }));

  await db.collection("games").doc(pin).collection("players").doc(name).set({
    name,
    score: 0,
    currentAnswer: null,
    currentConfidence: null,
    pointsThisRound: 0
  });

  document.getElementById("player-lobby-name").textContent = name;
  document.getElementById("player-lobby-pin").textContent = pin;
  showScreen("screen-player-lobby");
  listenToPlayers();
  listenToGameState();
});

// ============================================
// PLAYER — LISTEN TO GAME STATE
// ============================================

function listenToGameState() {
  if (gameUnsubscribe) gameUnsubscribe();
  gameUnsubscribe = db.collection("games").doc(gamePin).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();

    if (data.status === "playing") {
      if (data.phase === "question") {
        const idx = data.currentQuestionIndex;
        if (idx !== playerCurrentQIndex) {
          playerCurrentQIndex = idx;
          playerAnswered = false;
          playerConfidenceChosen = false;
          showPlayerQuestion(data);
        }
      } else if (data.phase === "confidence") {
        if (!playerAnswered) {
          // Didn't answer in time
          showScreen("screen-player-timesup");
        }
        // Players who answered are already on the confidence screen
      } else if (data.phase === "results") {
        clearInterval(confTimerInterval);
        if (playerAnswered) showPlayerResults(data);
        // Non-answerers stay on the Time's Up screen until leaderboard
      } else if (data.phase === "leaderboard") {
        showPlayerLeaderboard();
      }
    } else if (data.status === "ended") {
      if (data.phase === "stats") showStatsScreen();
      else showEndGame();
    }
  });
}

// ============================================
// PLAYER — QUESTION PHASE
// ============================================

function showPlayerQuestion(gameData) {
  const idx = gameData.currentQuestionIndex;
  const q = gameData.questions[idx];

  document.getElementById("player-q-counter").textContent = `Question ${idx + 1} / ${gameData.questions.length}`;
  document.getElementById("player-question-text").textContent = q.text;
  document.getElementById("player-choice-a").textContent = q.choiceA;
  document.getElementById("player-choice-b").textContent = q.choiceB;
  document.getElementById("player-choice-c").textContent = q.choiceC;
  document.getElementById("player-choice-d").textContent = q.choiceD;

  // Reset buttons
  document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.classList.remove("selected", "dimmed");
    btn.disabled = false;
  });

  showScreen("screen-player-question");

  // Timer from server timestamp
  startPlayerTimer(q.timeLimit, gameData.questionStartedAt);
}

function startPlayerTimer(timeLimit, startedAt) {
  clearInterval(timerInterval);
  const el = document.getElementById("player-timer");
  el.classList.remove("urgent");

  function tick() {
    if (!startedAt || !startedAt.seconds) {
      el.textContent = timeLimit;
      return;
    }
    const elapsed = Date.now() / 1000 - startedAt.seconds;
    const remaining = Math.max(0, Math.ceil(timeLimit - elapsed));
    el.textContent = remaining;
    if (remaining <= 5) el.classList.add("urgent");
    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }
  tick();
  timerInterval = setInterval(tick, 250);
}

// Player clicks an answer
document.querySelectorAll(".choice-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (playerAnswered) return;
    playerAnswered = true;

    const choice = btn.dataset.choice;

    // Visual feedback
    document.querySelectorAll(".choice-btn").forEach(b => {
      if (b === btn) b.classList.add("selected");
      else b.classList.add("dimmed");
      b.disabled = true;
    });

    // Save to Firestore
    await db.collection("games").doc(gamePin).collection("players").doc(playerName).update({
      currentAnswer: choice
    });

    // Go straight to confidence — don't wait for everyone else to answer
    showPlayerConfidence(null);
  });
});

// ============================================
// PLAYER — CONFIDENCE PHASE
// ============================================

function showPlayerConfidence(gameData) {
  if (playerConfidenceChosen) return;
  showScreen("screen-player-confidence");
  clearInterval(timerInterval);

  // Reset buttons
  document.querySelectorAll(".conf-btn").forEach(b => {
    b.classList.remove("selected", "dimmed");
    b.disabled = false;
  });

  // Start 10s confidence timer
  let remaining = 10;
  const el = document.getElementById("confidence-countdown");
  el.textContent = remaining;

  // Sync with server timestamp if the confidence phase has already started
  if (gameData && gameData.confidenceStartedAt && gameData.confidenceStartedAt.seconds) {
    const elapsed = Date.now() / 1000 - gameData.confidenceStartedAt.seconds;
    remaining = Math.max(0, Math.ceil(10 - elapsed));
    el.textContent = remaining;
  }

  clearInterval(confTimerInterval);
  confTimerInterval = setInterval(() => {
    remaining--;
    el.textContent = Math.max(0, remaining);
    if (remaining <= 0) {
      clearInterval(confTimerInterval);
      if (!playerConfidenceChosen) {
        submitConfidence("guessing");
      }
    }
  }, 1000);
}

document.querySelectorAll(".conf-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (playerConfidenceChosen) return;
    const conf = btn.dataset.conf;
    document.querySelectorAll(".conf-btn").forEach(b => {
      if (b === btn) b.classList.add("selected");
      else b.classList.add("dimmed");
      b.disabled = true;
    });
    submitConfidence(conf);
  });
});

async function submitConfidence(conf) {
  playerConfidenceChosen = true;
  clearInterval(confTimerInterval);
  await db.collection("games").doc(gamePin).collection("players").doc(playerName).update({
    currentConfidence: conf
  });
  showScreen("screen-player-waiting");
}

// ============================================
// PLAYER — RESULTS
// ============================================

async function showPlayerResults(gameData) {
  clearInterval(timerInterval);
  clearInterval(confTimerInterval);

  const playerDoc = await db.collection("games").doc(gamePin).collection("players").doc(playerName).get();
  if (!playerDoc.exists) return;
  const pData = playerDoc.data();

  const idx = gameData.currentQuestionIndex;
  const q = gameData.questions[idx];
  const isCorrect = pData.currentAnswer === q.correct;
  const delta = pData.pointsThisRound || 0;

  const icon = document.getElementById("result-icon");
  const heading = document.getElementById("result-heading");
  const correctEl = document.getElementById("result-correct-answer");
  const pointsEl = document.getElementById("result-points");
  const totalEl = document.getElementById("result-total-score");

  if (!pData.currentAnswer) {
    icon.textContent = "\u23F0";
    heading.textContent = "Time's Up!";
  } else if (isCorrect) {
    icon.textContent = "\u2705";
    heading.textContent = "Correct!";
  } else {
    icon.textContent = "\u274C";
    heading.textContent = "Wrong!";
  }

  const correctChoice = q.correct.toUpperCase();
  if (!isCorrect) {
    correctEl.textContent = `✓ Correct answer: ${correctChoice}) ${q["choice" + correctChoice]}`;
    correctEl.style.display = "";
  } else {
    correctEl.style.display = "none";
  }

  pointsEl.textContent = delta > 0 ? `+${delta} pts` : delta < 0 ? `${delta} pts` : "0 pts";
  pointsEl.className = "result-points " + (delta > 0 ? "positive" : delta < 0 ? "negative" : "zero");

  const confLabel = pData.currentConfidence === "certain" ? "Certain" :
                    pData.currentConfidence === "pretty"  ? "Pretty Sure" :
                    pData.currentConfidence === "kinda"   ? "Kinda Sure" : "Just Guessing";
  if (pData.currentAnswer) {
    const symbol = isCorrect ? "\u2713" : "\u2717";
    pointsEl.textContent += ` \u2014 ${confLabel} ${symbol}`;
  }

  totalEl.textContent = pData.score || 0;
  showScreen("screen-player-results");
}

// ============================================
// PLAYER — LEADERBOARD
// ============================================

async function showPlayerLeaderboard() {
  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const players = [];
  snap.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));

  renderLeaderboard(players, "player-leaderboard-list", playerName);
  document.getElementById("player-get-ready").textContent = "Get Ready...";
  showScreen("screen-player-leaderboard");
}

// ============================================
// END GAME — PODIUM + CONFETTI
// ============================================

async function showEndGame() {
  clearInterval(timerInterval);
  clearInterval(confTimerInterval);

  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const players = [];
  snap.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Podium
  [1, 2, 3].forEach(place => {
    const el = document.getElementById(`podium-${place}`);
    const p = players[place - 1];
    if (p) {
      const nameEl = el.querySelector(".podium-name");
      if (playerName && p.name === playerName) {
        nameEl.innerHTML = "<strong>You</strong>";
      } else {
        nameEl.textContent = p.name;
      }
      el.querySelector(".podium-score").textContent = `${p.score || 0} pts`;
      el.classList.remove("hidden");
    } else {
      el.querySelector(".podium-name").textContent = "—";
      el.querySelector(".podium-score").textContent = "";
    }
  });

  // 4th place onwards
  const restContainer = document.getElementById("endgame-rest");
  restContainer.innerHTML = "";
  if (players.length > 3) {
    players.slice(3).forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "lb-row" + (playerName && p.name === playerName ? " lb-row-me" : "");
      row.innerHTML = `
        <span class="lb-rank">${i + 4}</span>
        <span class="lb-name">${escapeHtml(p.name)}</span>
        <span class="lb-score">${p.score || 0}</span>
      `;
      restContainer.appendChild(row);
    });
  }

  localStorage.removeItem("cqPlayerSession");
  localStorage.removeItem("cqHostSession");
  showScreen("screen-endgame");
  startConfetti();

  // Show "Show Stats" button only for host
  document.getElementById("show-stats-btn").classList.toggle("hidden", role !== "host");
}

document.getElementById("show-stats-btn").addEventListener("click", async () => {
  await db.collection("games").doc(gamePin).update({ phase: "stats" });
  showStatsScreen(); // host sees it directly; players see it via the Firestore listener
});

document.getElementById("stats-play-again-btn").addEventListener("click", () => {
  stopConfetti();
  localStorage.removeItem("cqPlayerSession");
  localStorage.removeItem("cqHostSession");
  loadMyQuizzes();
  showScreen("screen-my-quizzes");
});

// ============================================
// STATS SCREEN
// ============================================

async function showStatsScreen() {
  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const players = [];
  snap.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));

  const confMap = { guessing: 0, kinda: 1, pretty: 2, certain: 3 };
  const confShort = ["Guessing", "Kinda Sure", "Pretty Sure", "Certain"];

  const tbody = document.getElementById("stats-tbody");
  tbody.innerHTML = "";

  players.forEach(p => {
    const history = p.history || [];
    const answered = history.filter(h => h.answered);
    const correct = answered.filter(h => h.wasCorrect);

    // Accuracy
    const accuracy = answered.length > 0
      ? `${correct.length}/${answered.length} (${Math.round(correct.length / answered.length * 100)}%)`
      : "—";

    // Avg confidence
    let avgConf = "—";
    if (answered.length > 0) {
      const avg = answered.reduce((s, h) => s + (confMap[h.confidence] || 0), 0) / answered.length;
      avgConf = confShort[Math.round(Math.min(3, Math.max(0, avg)))];
    }

    // Calibration: actual pts / max possible pts on correct answers
    const maxPts = correct.reduce((s, h) => s + (h.questionPoints || 0), 0);
    const calibration = maxPts > 0
      ? `${Math.round(answered.reduce((s, h) => s + (h.delta || 0), 0) / maxPts * 100)}%`
      : "—";

    // Best move
    const bestMove = (p.biggestRankGain || 0) > 0 ? `+${p.biggestRankGain}` : "—";

    // Highest streak
    let streak = 0, maxStreak = 0;
    history.forEach(h => {
      if (h.answered && h.wasCorrect) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else { streak = 0; }
    });

    const tr = document.createElement("tr");
    if (playerName && p.name === playerName) tr.className = "stats-row-me";
    tr.innerHTML = `
      <td class="stats-name">${escapeHtml(p.name)}</td>
      <td>${accuracy}</td>
      <td>${avgConf}</td>
      <td>${calibration}</td>
      <td>${bestMove}</td>
      <td>${maxStreak}</td>
    `;
    tbody.appendChild(tr);
  });

  showScreen("screen-stats");
  document.getElementById("stats-play-again-btn").classList.toggle("hidden", role !== "host");
}

// ============================================
// CONFETTI
// ============================================

let confettiAnimId = null;

function startConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  const pieces = [];
  const colors = ["#e84057", "#4488ee", "#e8c840", "#44bb66", "#ff77ff", "#77ddff"];

  for (let i = 0; i < 150; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 4 + 2,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 10
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotV;
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });
    confettiAnimId = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  const canvas = document.getElementById("confetti-canvas");
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}


// ============================================
// SESSION RESTORE ON REFRESH
// ============================================
(async function restoreSession() {
  // Only restore on refresh — not on fresh link opens
  const navType = performance.getEntriesByType("navigation")[0]?.type;
  if (navType === "navigate") {
    localStorage.removeItem("cqPlayerSession");
    localStorage.removeItem("cqHostSession");
    sessionStorage.removeItem("cqAdmin");
    isAdmin = false;
    return;
  }

  const playerSess = localStorage.getItem("cqPlayerSession");
  const hostSess = localStorage.getItem("cqHostSession");

  if (playerSess) {
    try {
      const { gamePin: pin, playerName: name } = JSON.parse(playerSess);
      const gameDoc = await db.collection("games").doc(pin).get();
      if (!gameDoc.exists || gameDoc.data().status === "ended") {
        localStorage.removeItem("cqPlayerSession"); return;
      }
      const playerDoc = await db.collection("games").doc(pin).collection("players").doc(name).get();
      if (!playerDoc.exists) { localStorage.removeItem("cqPlayerSession"); return; }

      gamePin = pin;
      playerName = name;
      role = "player";

      const pData = playerDoc.data();
      playerAnswered = pData.currentAnswer != null;
      playerConfidenceChosen = pData.currentConfidence != null;

      const gameData = gameDoc.data();
      if (playerAnswered && gameData.phase === "question") {
        playerCurrentQIndex = gameData.currentQuestionIndex;
      }

      document.getElementById("player-lobby-name").textContent = playerName;
      document.getElementById("player-lobby-pin").textContent = gamePin;

      listenToPlayers();
      listenToGameState();
    } catch(e) { localStorage.removeItem("cqPlayerSession"); }

  } else if (hostSess) {
    try {
      const { gamePin: pin, hostId: hid } = JSON.parse(hostSess);
      const gameDoc = await db.collection("games").doc(pin).get();
      if (!gameDoc.exists) { localStorage.removeItem("cqHostSession"); return; }
      const data = gameDoc.data();
      if (data.status === "ended") { localStorage.removeItem("cqHostSession"); return; }

      gamePin = pin;
      hostId = hid;
      role = "host";
      questions = data.questions || [];

      if (data.status === "lobby") {
        document.getElementById("host-pin-code").textContent = pin;
        document.getElementById("lobby-quiz-title").textContent = `"${data.title}"`;
        showScreen("screen-host-lobby");
        listenToPlayers();
      } else if (data.status === "playing") {
        const idx = data.currentQuestionIndex;
        if (data.phase === "leaderboard") {
          await showHostLeaderboard(idx);
        } else {
          showHostQuestion(idx);
        }
      }
    } catch(e) { localStorage.removeItem("cqHostSession"); }
  }
})();
