const STORAGE_KEY = "toeic_quiz_progress_v1";
const SETTINGS_KEY = "toeic_quiz_settings_v1";
const RECENT_LIMIT = 25;
const DEFAULT_SPEECH_RATE = 0.9;

const vocabulary = (Array.isArray(VOCABULARY) ? VOCABULARY : []).map((entry) => ({
  ...entry,
  key: entry.en.toLowerCase(),
  kind: entry.en.includes(" ") || entry.en.includes("-") ? "熟語" : "単語",
}));

const elements = {
  modeRadios: document.querySelectorAll("input[name='mode']"),
  quizStyleRadios: document.querySelectorAll("input[name='quiz-style']"),
  directionBadge: document.getElementById("direction-badge"),
  kindBadge: document.getElementById("kind-badge"),
  questionText: document.getElementById("question-text"),
  speakBtn: document.getElementById("speak-btn"),
  autoSpeak: document.getElementById("auto-speak"),
  voiceSelect: document.getElementById("voice-select"),
  speechRate: document.getElementById("speech-rate"),
  speechRateValue: document.getElementById("speech-rate-value"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  nextBtn: document.getElementById("next-btn"),
  skipBtn: document.getElementById("skip-btn"),
  resetBtn: document.getElementById("reset-btn"),
  statPracticed: document.getElementById("stat-practiced"),
  statTotalAccuracy: document.getElementById("stat-total-accuracy"),
  statSession: document.getElementById("stat-session"),
  statMastered: document.getElementById("stat-mastered"),
  weakList: document.getElementById("weak-list"),
};

const state = {
  mode: "mixed",
  currentQuestion: null,
  progress: loadProgress(),
  settings: loadSettings(),
  session: {
    answered: 0,
    correct: 0,
  },
  recentIds: [],
  speech: {
    supported: false,
    voice: null,
  },
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function loadSettings() {
  const defaults = {
    autoSpeak: false,
    quizStyle: "text",
    voiceURI: "",
    speechRate: DEFAULT_SPEECH_RATE,
  };

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    return {
      autoSpeak: Boolean(parsed.autoSpeak),
      quizStyle: parsed.quizStyle === "audio" ? "audio" : "text",
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : "",
      speechRate: clampSpeechRate(parsed.speechRate),
    };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function isSpeechSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function clampSpeechRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_SPEECH_RATE;
  }
  return Math.min(1.1, Math.max(0.8, num));
}

function formatSpeechRate(rate) {
  return `${rate.toFixed(2)}x`;
}

function updateSpeechRateUI() {
  const rate = clampSpeechRate(state.settings.speechRate);
  elements.speechRate.value = String(rate);
  elements.speechRateValue.textContent = formatSpeechRate(rate);
}

function getEnglishVoices() {
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith("en"));
}

function getVoiceScore(voice) {
  const name = voice.name.toLowerCase();
  const lang = (voice.lang || "").toLowerCase();
  let score = 0;

  if (!lang.startsWith("en")) {
    return -999;
  }

  // Chrome では Google 系の英語音声が比較的自然なことが多い。
  if (name.includes("google") && lang.startsWith("en-us")) {
    score += 130;
  } else if (name.includes("google")) {
    score += 95;
  }

  if (name.includes("female")) {
    score += 15;
  }
  if (name.includes("natural") || name.includes("neural") || name.includes("premium")) {
    score += 40;
  }
  if (lang.startsWith("en-us")) {
    score += 30;
  } else if (lang.startsWith("en-gb")) {
    score += 22;
  } else {
    score += 12;
  }
  if (voice.default) {
    score += 4;
  }

  return score;
}

function pickEnglishVoice(voices = getEnglishVoices()) {
  if (!voices.length) {
    return null;
  }

  if (state.settings.voiceURI) {
    const selected = voices.find((voice) => voice.voiceURI === state.settings.voiceURI);
    if (selected) {
      return selected;
    }
  }

  return [...voices].sort((a, b) => getVoiceScore(b) - getVoiceScore(a))[0] || null;
}

function renderVoiceSelect(voices) {
  elements.voiceSelect.innerHTML = "";

  if (!voices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "英語音声を取得中...";
    elements.voiceSelect.appendChild(option);
    elements.voiceSelect.disabled = true;
    return;
  }

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
  });

  const selectedVoice = pickEnglishVoice(voices);
  state.speech.voice = selectedVoice;
  elements.voiceSelect.value = selectedVoice ? selectedVoice.voiceURI : voices[0].voiceURI;
  elements.voiceSelect.disabled = false;
}

function setupSpeechVoiceOptions() {
  const voices = getEnglishVoices();
  renderVoiceSelect(voices);

  if (!state.settings.voiceURI && state.speech.voice) {
    state.settings.voiceURI = state.speech.voice.voiceURI;
    saveSettings();
  }
}

function setSpeechControlsEnabled(enabled) {
  elements.speechRate.disabled = !enabled;
  elements.autoSpeak.disabled = !enabled;
  if (!enabled) {
    elements.voiceSelect.disabled = true;
  }
}

function sanitizeSpeechText(text) {
  return text.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function syncQuizStyleRadios() {
  elements.quizStyleRadios.forEach((radio) => {
    radio.checked = radio.value === state.settings.quizStyle;
  });
}

function isAudioMode() {
  return state.settings.quizStyle === "audio";
}

function isAudioJaToEnQuestion(question) {
  return Boolean(question?.audioMode && question.direction === "jaToEn");
}

function shouldAutoSpeakQuestion(question) {
  if (!state.speech.supported || !question) {
    return false;
  }

  if (question.audioMode) {
    return question.direction === "enToJa";
  }

  return state.settings.autoSpeak;
}

function setupSpeech() {
  state.speech.supported = isSpeechSupported();
  elements.autoSpeak.checked = Boolean(state.settings.autoSpeak);
  updateSpeechRateUI();
  const audioRadio = [...elements.quizStyleRadios].find((radio) => radio.value === "audio");

  if (!state.speech.supported) {
    if (audioRadio) {
      audioRadio.disabled = true;
    }
    if (state.settings.quizStyle === "audio") {
      state.settings.quizStyle = "text";
      syncQuizStyleRadios();
      saveSettings();
    }
    setSpeechControlsEnabled(false);
    elements.speakBtn.disabled = true;
    elements.speakBtn.textContent = "読み上げ非対応";
    return;
  }

  if (audioRadio) {
    audioRadio.disabled = false;
  }

  const refreshVoice = () => {
    setupSpeechVoiceOptions();
  };

  refreshVoice();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoice);
  } else {
    window.speechSynthesis.onvoiceschanged = refreshVoice;
  }
  setSpeechControlsEnabled(true);
}

function stopSpeaking() {
  if (!state.speech.supported) {
    return;
  }
  window.speechSynthesis.cancel();
}

function speakEnglish(text) {
  if (!state.speech.supported || !text) {
    return;
  }

  const normalizedText = sanitizeSpeechText(text);
  const utterance = new SpeechSynthesisUtterance(normalizedText);
  const voice = state.speech.voice || pickEnglishVoice();
  utterance.lang = voice?.lang || "en-US";
  utterance.rate = clampSpeechRate(state.settings.speechRate);
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) {
    utterance.voice = voice;
  }

  stopSpeaking();
  window.speechSynthesis.speak(utterance);
}

function speakCurrentQuestion() {
  const question = state.currentQuestion;
  if (!question || isAudioJaToEnQuestion(question)) {
    return;
  }
  const text = question.term?.en;
  if (!text) {
    return;
  }
  speakEnglish(text);
}

function speakChoice(index) {
  const question = state.currentQuestion;
  if (!question || !isAudioJaToEnQuestion(question)) {
    return;
  }

  const choice = question.choices[index];
  if (!choice) {
    return;
  }
  speakEnglish(choice);
}

function ensureRecord(term) {
  if (!state.progress[term.key]) {
    state.progress[term.key] = {
      en: term.en,
      ja: term.ja,
      kind: term.kind,
      totalAttempts: 0,
      totalCorrect: 0,
      attemptsEnToJa: 0,
      correctEnToJa: 0,
      attemptsJaToEn: 0,
      correctJaToEn: 0,
      lastAnsweredAt: null,
    };
  }
  return state.progress[term.key];
}

function getDirectionLabel(direction) {
  return direction === "enToJa" ? "英 → 日" : "日 → 英";
}

function getDirection() {
  if (state.mode === "mixed") {
    return Math.random() < 0.5 ? "enToJa" : "jaToEn";
  }
  return state.mode;
}

function pickTerm(direction) {
  const candidates = vocabulary.map((term) => {
    const record = state.progress[term.key];
    const attempts =
      direction === "enToJa"
        ? record?.attemptsEnToJa ?? 0
        : record?.attemptsJaToEn ?? 0;
    const correct =
      direction === "enToJa" ? record?.correctEnToJa ?? 0 : record?.correctJaToEn ?? 0;

    const accuracy = attempts === 0 ? 0 : correct / attempts;
    let weight = attempts === 0 ? 7 : 1 + Math.round((1 - accuracy) * 5);

    if (attempts < 2) {
      weight += 2;
    }

    if (state.recentIds.includes(term.id)) {
      weight = Math.max(1, Math.floor(weight * 0.25));
    }

    return { term, weight };
  });

  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  let threshold = Math.random() * totalWeight;

  for (const item of candidates) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.term;
    }
  }

  return candidates[candidates.length - 1].term;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildChoices(term, direction) {
  if (direction === "enToJa") {
    const correct = term.ja;
    const pool = shuffle(
      [...new Set(vocabulary.map((item) => item.ja))].filter((value) => value !== correct),
    );
    return shuffle([correct, ...pool.slice(0, 3)]);
  }

  const correct = term.en;
  const pool = shuffle(
    [...new Set(vocabulary.map((item) => item.en))].filter((value) => value !== correct),
  );
  return shuffle([correct, ...pool.slice(0, 3)]);
}

function makeQuestion() {
  const direction = getDirection();
  const term = pickTerm(direction);
  const answer = direction === "enToJa" ? term.ja : term.en;
  const prompt = direction === "enToJa" ? term.en : term.ja;
  const choices = buildChoices(term, direction);
  const audioMode = isAudioMode();

  state.recentIds.unshift(term.id);
  if (state.recentIds.length > RECENT_LIMIT) {
    state.recentIds.length = RECENT_LIMIT;
  }

  return {
    direction,
    term,
    prompt,
    answer,
    choices,
    audioMode,
    answered: false,
  };
}

function renderTextChoices(question) {
  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-btn";
    button.style.setProperty("--idx", String(index));
    button.textContent = choice;
    button.addEventListener("click", () => answerQuestion(index));
    elements.choices.appendChild(button);
  });
}

function renderAudioChoices(question) {
  question.choices.forEach((choice, index) => {
    const choiceLabel = String.fromCharCode(65 + index);
    const row = document.createElement("div");
    row.className = "audio-choice";
    row.style.setProperty("--idx", String(index));

    const label = document.createElement("span");
    label.className = "audio-choice-label";
    label.textContent = choiceLabel;

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "audio-play-btn";
    playButton.textContent = `${choiceLabel} を再生`;
    playButton.addEventListener("click", () => speakChoice(index));

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "audio-select-btn";
    selectButton.textContent = `${choiceLabel} を選択`;
    selectButton.addEventListener("click", () => answerQuestion(index));

    row.append(label, playButton, selectButton);
    elements.choices.appendChild(row);
  });
}

function renderQuestion() {
  const q = state.currentQuestion;
  const audioEnToJa = q.audioMode && q.direction === "enToJa";
  const audioJaToEn = isAudioJaToEnQuestion(q);

  elements.directionBadge.textContent = getDirectionLabel(q.direction);
  elements.kindBadge.textContent = q.term.kind;
  elements.questionText.textContent = audioEnToJa
    ? "音声を聞いて、日本語の意味を選択してください。"
    : q.prompt;
  elements.speakBtn.setAttribute("aria-label", `英語を読み上げ: ${q.term.en}`);

  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "";
  elements.nextBtn.hidden = true;

  if (!state.speech.supported) {
    elements.speakBtn.disabled = true;
    elements.autoSpeak.disabled = true;
    elements.speakBtn.textContent = "読み上げ非対応";
  } else if (audioJaToEn) {
    elements.speakBtn.disabled = true;
    elements.speakBtn.textContent = "選択肢の音声を使用";
    elements.autoSpeak.disabled = true;
  } else {
    elements.speakBtn.disabled = false;
    elements.speakBtn.textContent = "英語を再生";
    elements.autoSpeak.disabled = q.audioMode;
  }

  elements.choices.innerHTML = "";
  if (audioJaToEn) {
    renderAudioChoices(q);
  } else {
    renderTextChoices(q);
  }
}

function formatRatio(correct, attempts) {
  if (attempts === 0) {
    return "0 / 0";
  }
  return `${correct} / ${attempts} (${Math.round((correct / attempts) * 100)}%)`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('\"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatWordList(words) {
  if (!Array.isArray(words) || words.length === 0) {
    return "-";
  }
  return words.map((word) => escapeHtml(word)).join(", ");
}

function encodeSpeechPayload(text) {
  return encodeURIComponent(String(text || ""));
}

function renderExplanationAudioButton(text, label) {
  if (!text) {
    return "";
  }

  const encoded = encodeSpeechPayload(text);
  const disabled = state.speech.supported ? "" : " disabled";
  return `<button type=\"button\" class=\"exp-audio-btn\" data-speech=\"${encoded}\" aria-label=\"${escapeHtml(label)}\"${disabled}>再生</button>`;
}

function buildEtymologySearchUrl(term) {
  const query = encodeURIComponent(`${String(term || "").trim()} etymology`);
  return `https://www.google.com/search?q=${query}`;
}

function renderEtymologySearchButton(term) {
  if (!term) {
    return "";
  }
  const href = buildEtymologySearchUrl(term);
  return `<a class=\"exp-link-btn\" href=\"${href}\" target=\"_blank\" rel=\"noopener noreferrer\">Googleで語源検索</a>`;
}

function renderExplanationHtml(term) {
  const explanation = term.explanation;
  if (!explanation) {
    return "";
  }

  const synonymSpeech = Array.isArray(explanation.synonyms) ? explanation.synonyms.join(", ") : "";
  const antonymSpeech = Array.isArray(explanation.antonyms) ? explanation.antonyms.join(", ") : "";

  return `
    <div class=\"explanation-block\">
      <p class=\"exp-line\"><strong>解説:</strong> ${escapeHtml(explanation.summary)}</p>
      <p class=\"exp-line exp-line-with-audio\"><strong>例文:</strong> ${escapeHtml(explanation.exampleEn)} ${renderExplanationAudioButton(explanation.exampleEn, "例文を再生")}</p>
      <p class=\"exp-line\"><strong>例文訳:</strong> ${escapeHtml(explanation.exampleJa)}</p>
      <p class=\"exp-line exp-line-with-audio\"><strong>類義語:</strong> ${formatWordList(explanation.synonyms)} ${renderExplanationAudioButton(synonymSpeech, "類義語を再生")}</p>
      <p class=\"exp-line exp-line-with-audio\"><strong>対義語:</strong> ${formatWordList(explanation.antonyms)} ${renderExplanationAudioButton(antonymSpeech, "対義語を再生")}</p>
      <p class=\"exp-line exp-line-with-audio\"><strong>語源:</strong> ${escapeHtml(explanation.etymology)} ${renderEtymologySearchButton(term.en)}</p>
    </div>
  `;
}

function bindFeedbackAudioEvents() {
  elements.feedback.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest(".exp-audio-btn");
    if (!button) {
      return;
    }

    const encoded = button.getAttribute("data-speech");
    if (!encoded) {
      return;
    }

    speakEnglish(decodeURIComponent(encoded));
  });
}

function answerQuestion(index) {
  const q = state.currentQuestion;
  if (!q || q.answered) {
    return;
  }

  q.answered = true;
  const selected = q.choices[index];
  const isCorrect = selected === q.answer;
  const audioJaToEn = isAudioJaToEnQuestion(q);

  const buttons = audioJaToEn
    ? [...elements.choices.querySelectorAll(".audio-select-btn")]
    : [...elements.choices.querySelectorAll(".choice-btn")];
  buttons.forEach((button) => {
    button.disabled = true;
  });

  buttons.forEach((button, buttonIndex) => {
    const value = q.choices[buttonIndex];
    if (value === q.answer) {
      button.classList.add("correct");
    }
  });

  if (!isCorrect && buttons[index]) {
    buttons[index].classList.add("incorrect");
  }

  if (audioJaToEn) {
    const rows = [...elements.choices.querySelectorAll(".audio-choice")];
    rows.forEach((row, rowIndex) => {
      if (q.choices[rowIndex] === q.answer) {
        row.classList.add("correct");
      }
    });
    if (!isCorrect && rows[index]) {
      rows[index].classList.add("incorrect");
    }
  }

  const record = updateProgress(q.term, q.direction, isCorrect);
  state.session.answered += 1;
  if (isCorrect) {
    state.session.correct += 1;
  }

  const resultText = isCorrect ? "正解" : "不正解";
  const paired = `${escapeHtml(q.term.en)} ＝ ${escapeHtml(q.term.ja)}`;
  const byDirection =
    q.direction === "enToJa"
      ? `英→日: ${formatRatio(record.correctEnToJa, record.attemptsEnToJa)}`
      : `日→英: ${formatRatio(record.correctJaToEn, record.attemptsJaToEn)}`;
  const explanationHtml = renderExplanationHtml(q.term);

  elements.feedback.hidden = false;
  elements.feedback.classList.add(isCorrect ? "ok" : "ng");
  elements.feedback.innerHTML = `<strong>${resultText}</strong><br>${paired}<br>${byDirection}${explanationHtml}`;

  elements.nextBtn.hidden = false;

  renderStats();
  renderWeakTerms();
}

function updateProgress(term, direction, isCorrect) {
  const record = ensureRecord(term);

  record.totalAttempts += 1;
  if (isCorrect) {
    record.totalCorrect += 1;
  }

  if (direction === "enToJa") {
    record.attemptsEnToJa += 1;
    if (isCorrect) {
      record.correctEnToJa += 1;
    }
  } else {
    record.attemptsJaToEn += 1;
    if (isCorrect) {
      record.correctJaToEn += 1;
    }
  }

  record.lastAnsweredAt = new Date().toISOString();
  saveProgress();
  return record;
}

function renderStats() {
  const records = Object.values(state.progress);

  const practiced = records.filter((record) => record.totalAttempts > 0).length;
  const totalAttempts = records.reduce((sum, record) => sum + record.totalAttempts, 0);
  const totalCorrect = records.reduce((sum, record) => sum + record.totalCorrect, 0);
  const totalAccuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);

  const mastered = records.filter(
    (record) => record.totalAttempts >= 4 && record.totalCorrect / record.totalAttempts >= 0.8,
  ).length;

  elements.statPracticed.textContent = `${practiced} / ${vocabulary.length}`;
  elements.statTotalAccuracy.textContent = `${totalAccuracy}%`;
  elements.statSession.textContent = `${state.session.correct} / ${state.session.answered}`;
  elements.statMastered.textContent = String(mastered);
}

function renderWeakTerms() {
  const rows = Object.values(state.progress)
    .filter((record) => record.totalAttempts >= 2)
    .map((record) => ({
      ...record,
      accuracy: record.totalCorrect / record.totalAttempts,
    }))
    .sort((a, b) => {
      if (a.accuracy === b.accuracy) {
        return b.totalAttempts - a.totalAttempts;
      }
      return a.accuracy - b.accuracy;
    })
    .slice(0, 10);

  elements.weakList.innerHTML = "";

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td colspan='4' class='placeholder'>まだデータがありません</td>";
    elements.weakList.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.en}<br><span class="weak-ja">${row.ja}</span></td>
      <td>${row.kind}</td>
      <td>${Math.round(row.accuracy * 100)}%</td>
      <td>${row.totalAttempts}</td>
    `;
    elements.weakList.appendChild(tr);
  });
}

function nextQuestion() {
  stopSpeaking();
  state.currentQuestion = makeQuestion();
  renderQuestion();
  if (shouldAutoSpeakQuestion(state.currentQuestion)) {
    speakCurrentQuestion();
  }
}

function bindEvents() {
  elements.modeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      state.mode = radio.value;
      nextQuestion();
    });
  });

  elements.quizStyleRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      state.settings.quizStyle = radio.value === "audio" ? "audio" : "text";
      saveSettings();
      nextQuestion();
    });
  });

  elements.nextBtn.addEventListener("click", () => {
    nextQuestion();
  });

  elements.skipBtn.addEventListener("click", () => {
    nextQuestion();
  });

  elements.speakBtn.addEventListener("click", () => {
    speakCurrentQuestion();
  });

  elements.autoSpeak.addEventListener("change", () => {
    state.settings.autoSpeak = elements.autoSpeak.checked;
    saveSettings();
    if (state.settings.autoSpeak && !isAudioMode()) {
      speakCurrentQuestion();
    }
  });

  elements.voiceSelect.addEventListener("change", () => {
    state.settings.voiceURI = elements.voiceSelect.value;
    state.speech.voice = pickEnglishVoice();
    saveSettings();
    if (state.currentQuestion) {
      speakCurrentQuestion();
    }
  });

  elements.speechRate.addEventListener("input", () => {
    state.settings.speechRate = clampSpeechRate(elements.speechRate.value);
    updateSpeechRateUI();
    saveSettings();
  });

  elements.speechRate.addEventListener("change", () => {
    if (state.currentQuestion) {
      speakCurrentQuestion();
    }
  });

  elements.resetBtn.addEventListener("click", () => {
    if (!window.confirm("保存済みの正解実績をすべて削除します。よろしいですか？")) {
      return;
    }
    state.progress = {};
    state.session = { answered: 0, correct: 0 };
    localStorage.removeItem(STORAGE_KEY);
    renderStats();
    renderWeakTerms();
    nextQuestion();
  });
}

function init() {
  if (vocabulary.length === 0) {
    elements.questionText.textContent = "語彙データの読み込みに失敗しました。";
    return;
  }

  syncQuizStyleRadios();
  bindEvents();
  bindFeedbackAudioEvents();
  setupSpeech();
  renderStats();
  renderWeakTerms();
  nextQuestion();
}

init();
