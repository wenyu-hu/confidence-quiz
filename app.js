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

    qs.push({ text, choiceA, choiceB, choiceC, choiceD, correct: correctRadio.value, points, timeLimit });
  });
  if (!valid || qs.length === 0) return null;
  return qs;
}

document.getElementById("add-question-btn").addEventListener("click", () => addQuestionCard());

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

document.getElementById("start-game-btn").addEventListener("click", async () => {
  const title = document.getElementById("quiz-title").value.trim();
  if (!title) { alert("Please enter a quiz title."); return; }

  const qs = collectQuestions();
  if (!qs) { alert("Please fill in all question fields and select a correct answer for each."); return; }

  const btn = document.getElementById("start-game-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  const pin = await generatePin();
  if (!pin) { alert("Could not generate a unique PIN. Try again."); btn.disabled = false; btn.textContent = "Start Game"; return; }

  hostId = "host_" + Math.random().toString(36).slice(2, 10);
  gamePin = pin;
  questions = qs;
  role = "host";

  await db.collection("games").doc(pin).set({
    title,
    hostId,
    status: "lobby",
    phase: null,
    currentQuestionIndex: 0,
    questions: qs,
    questionStartedAt: null,
    confidenceStartedAt: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("host-pin-code").textContent = pin;
  document.getElementById("lobby-quiz-title").textContent = `"${title}"`;
  showScreen("screen-host-lobby");
  listenToPlayers();

  btn.disabled = false;
  btn.textContent = "Start Game";
});

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
      chip.className = "player-chip";
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

  snap.forEach(doc => {
    const d = doc.data();
    const answer = d.currentAnswer || null;
    const confidence = d.currentConfidence || "guessing";
    const isCorrect = answer === q.correct;
    let delta = 0;

    if (answer) {
      if (isCorrect) {
        if (confidence === "guessing") delta = 0;
        else if (confidence === "kinda") delta = Math.round(q.points * 0.6);
        else if (confidence === "very") delta = q.points;
      } else {
        if (confidence === "guessing") delta = 0;
        else if (confidence === "kinda") delta = -Math.round(q.points * 0.4);
        else if (confidence === "very") delta = -Math.round(q.points * 0.75);
      }
    }

    batch.update(doc.ref, {
      score: (d.score || 0) + delta,
      pointsThisRound: delta
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
    showHostLeaderboard(qIdx);
  }, 3500);
}

// ============================================
// HOST — LEADERBOARD
// ============================================

async function showHostLeaderboard(qIdx) {
  await db.collection("games").doc(gamePin).update({ phase: "leaderboard" });

  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const players = [];
  snap.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));

  renderLeaderboard(players, "host-leaderboard-list");
  showScreen("screen-host-leaderboard");

  // Show/hide Next vs End
  const isLast = qIdx >= questions.length - 1;
  document.getElementById("host-next-q-btn").classList.toggle("hidden", isLast);
  document.getElementById("host-end-game-btn").classList.toggle("hidden", !isLast);
}

function renderLeaderboard(players, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "lb-row";
    const delta = p.pointsThisRound || 0;
    const deltaClass = delta > 0 ? "positive" : delta < 0 ? "negative" : "zero";
    const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "0";
    const rankClass = i < 3 ? ` lb-rank-${i + 1}` : "";
    row.innerHTML = `
      <span class="lb-rank${rankClass}">${i + 1}</span>
      <span class="lb-name">${escapeHtml(p.name)}</span>
      <span class="lb-score">${p.score || 0}</span>
      <span class="lb-delta ${deltaClass}">${deltaText}</span>
    `;
    container.appendChild(row);
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
        showPlayerQuestion(data);
      } else if (data.phase === "confidence") {
        if (!playerAnswered) {
          // Didn't answer in time
          showScreen("screen-player-timesup");
        } else if (!playerConfidenceChosen) {
          showPlayerConfidence(data);
        }
      } else if (data.phase === "results") {
        clearInterval(confTimerInterval);
        showPlayerResults(data);
      } else if (data.phase === "leaderboard") {
        showPlayerLeaderboard();
      }
    } else if (data.status === "ended") {
      showEndGame();
    }
  });
}

// ============================================
// PLAYER — QUESTION PHASE
// ============================================

function showPlayerQuestion(gameData) {
  playerAnswered = false;
  playerConfidenceChosen = false;

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

  // Sync with server timestamp
  if (gameData.confidenceStartedAt && gameData.confidenceStartedAt.seconds) {
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
  const correctText = q["choice" + correctChoice.toUpperCase()];
  correctEl.textContent = `Correct answer: ${correctChoice}) ${q[`choice${correctChoice}`]}`;

  pointsEl.textContent = delta > 0 ? `+${delta} pts` : delta < 0 ? `${delta} pts` : "0 pts";
  pointsEl.className = "result-points " + (delta > 0 ? "positive" : delta < 0 ? "negative" : "zero");

  const confLabel = pData.currentConfidence === "very" ? "Very Sure" :
                    pData.currentConfidence === "kinda" ? "Kinda Sure" : "Just Guessing";
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

  renderLeaderboard(players, "player-leaderboard-list");
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
      el.querySelector(".podium-name").textContent = p.name;
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
      row.className = "lb-row";
      row.innerHTML = `
        <span class="lb-rank">${i + 4}</span>
        <span class="lb-name">${escapeHtml(p.name)}</span>
        <span class="lb-score">${p.score || 0}</span>
      `;
      restContainer.appendChild(row);
    });
  }

  showScreen("screen-endgame");
  startConfetti();

  // Show play again only for host
  document.getElementById("play-again-btn").classList.toggle("hidden", role !== "host");
}

// Play again
document.getElementById("play-again-btn").addEventListener("click", async () => {
  // Reset player scores
  const snap = await db.collection("games").doc(gamePin).collection("players").get();
  const batch = db.batch();
  snap.forEach(doc => {
    batch.update(doc.ref, {
      score: 0,
      currentAnswer: null,
      currentConfidence: null,
      pointsThisRound: 0
    });
  });
  await batch.commit();

  await db.collection("games").doc(gamePin).update({
    status: "lobby",
    phase: null,
    currentQuestionIndex: 0,
    questionStartedAt: null,
    confidenceStartedAt: null
  });

  showScreen("screen-host-lobby");
  stopConfetti();
});

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

// Add a default question card on page load
addQuestionCard();
