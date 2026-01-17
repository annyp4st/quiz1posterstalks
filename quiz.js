/* global QUIZ_DATA */

const quizChoiceEl = document.getElementById("quizChoice");
const chooseOldQuizBtn = document.getElementById("chooseOldQuiz");
const chooseNewQuizBtn = document.getElementById("chooseNewQuiz");

// Текущий выбранный квиз (по умолчанию null)
let currentQuiz = null;
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const nextBtn = document.getElementById("nextBtn");
const quizEl = document.getElementById("quiz");
const resultEl = document.getElementById("result");
const answersEl = document.getElementById("answers");
const questionTitleEl = document.getElementById("questionTitle");
const questionPromptEl = document.getElementById("questionPrompt");
const feedbackEl = document.getElementById("feedback");
const feedbackStatusEl = document.getElementById("feedbackStatus");
const feedbackExplainEl = document.getElementById("feedbackExplain");
const progressTextEl = document.getElementById("progressText");
const progressStarsEl = document.getElementById("progressStars");
const resultTextEl = document.getElementById("resultText");
const resultDetailsEl = document.getElementById("resultDetails");
const rewardEl = document.getElementById("reward");
const rewardImgEl = document.getElementById("rewardImg");
const rewardCaptionEl = document.getElementById("rewardCaption");
const downloadBtn = document.getElementById("downloadBtn");
let currentAnswerControl = null;
let currentCheckBtn = null;

const studentNameEl = document.getElementById("studentName");
const studentClassEl = document.getElementById("studentClass");

let idx = 0;
let started = false;
let selectedOptionId = null;
let results = [];
let textAnswerValue = "";
let posterWrapEl = null;

function getCorrectText(q) {
  if (q.type === "choice") {
    const correctOpt = (q.options ?? []).find((o) => o.correct);
    return correctOpt?.text ?? "—";
  }
  // text/year
  const acc = q.acceptableAnswers ?? [];
  if (acc.length === 0) return "—";
  return acc.join(" / ");
}

function normalizeAnswer(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replaceAll(/[“”"«»'’`]/g, "")
    .replaceAll(/[.,!?:;()[\]{}]/g, " ")
    .replaceAll(/[\s\u00A0]+/g, " ")
    .trim();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function renderProgressStars() {
  if (!progressStarsEl) return;
  const total = QUIZ_DATA.questions.length;
  progressStarsEl.innerHTML = "";
  for (let i = 0; i < total; i += 1) {
    const qId = QUIZ_DATA.questions[i]?.id;
    const r = qId ? results.find((x) => x.id === qId) : null;
    const answered = Boolean(r);
    const isCorrect = Boolean(r?.correct);

    const s = document.createElement("span");
    if (i === idx) {
      s.className = `star ${answered ? (isCorrect ? "starCorrect" : "starWrong") : "starCurrent"}`;
    } else if (i < idx) {
      s.className = `star ${answered ? (isCorrect ? "starCorrect" : "starWrong") : "starTodo"}`;
    } else {
      s.className = "star starTodo";
    }
    s.textContent = "★";
    progressStarsEl.appendChild(s);
  }
}

function buildStarLine() {
  const total = QUIZ_DATA.questions.length;
  const parts = [];
  for (let i = 0; i < total; i += 1) {
    const qId = QUIZ_DATA.questions[i]?.id;
    const r = qId ? results.find((x) => x.id === qId) : null;
    parts.push(r?.correct ? "★" : "✩");
  }
  return parts.join(" ");
}

function getPraise(correct, total) {
  if (total <= 0) return "Спасибо за участие!";
  const ratio = correct / total;
  if (ratio >= 0.85) return "Молодец! Ты отлично знаешь тему.";
  if (ratio >= 0.6) return "Очень хорошо! Ты многое знаешь — продолжай.";
  return "Ничего страшного — тебя много интересного ждёт впереди. Попробуй ещё раз!";
}

function pickReward(ratio) {
  const list = QUIZ_DATA.rewards ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const sorted = [...list].sort((a, b) => (b.minRatio ?? 0) - (a.minRatio ?? 0));
  return sorted.find((r) => ratio >= (r.minRatio ?? 0)) ?? sorted[sorted.length - 1];
}

function setReward(reward) {
  if (!rewardEl) return;
  if (!reward) {
    rewardEl.classList.add("hidden");
    return;
  }
  rewardEl.classList.remove("hidden");
  if (rewardImgEl) {
    rewardImgEl.src = reward.image || "";
    rewardImgEl.alt = reward.title || "Плакат";
    rewardImgEl.onerror = () => {
      rewardImgEl.style.display = "none";
    };
    rewardImgEl.onload = () => {
      rewardImgEl.style.display = "";
    };
  }
  if (rewardCaptionEl) {
    rewardCaptionEl.textContent = reward.caption ? `${reward.title}: ${reward.caption}` : `${reward.title}`;
  }
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function ensurePosterWrap() {
  if (posterWrapEl) return posterWrapEl;
  const wrap = document.createElement("div");
  wrap.className = "posterWrap hidden";
  wrap.id = "posterWrap";

  const img = document.createElement("img");
  img.className = "posterImg";
  img.id = "posterImg";
  img.alt = "";

  const cap = document.createElement("div");
  cap.className = "posterCaption";
  cap.id = "posterCaption";

  wrap.appendChild(img);
  wrap.appendChild(cap);

  answersEl.parentNode.insertBefore(wrap, answersEl);
  posterWrapEl = wrap;
  return wrap;
}

function hidePosterCaption(q) {
  const wrap = ensurePosterWrap();
  const cap = wrap.querySelector("#posterCaption");
  if (!cap) return;
  wrap.dataset.caption = String(q?.imageCaption ?? "");
  cap.textContent = "";
  cap.hidden = true;
}

function revealPosterCaption(q) {
  if (!posterWrapEl) return;
  const cap = posterWrapEl.querySelector("#posterCaption");
  if (!cap) return;
  const txt = String(q?.imageCaption ?? posterWrapEl.dataset.caption ?? "").trim();
  if (!txt) {
    cap.textContent = "";
    cap.hidden = true;
    return;
  }
  cap.textContent = txt;
  cap.hidden = false;
}

function setQuestionPoster(q) {
  const wrap = ensurePosterWrap();
  const img = wrap.querySelector("#posterImg");
  const cap = wrap.querySelector("#posterCaption");

  const src = q?.image;
  if (!src) {
    wrap.classList.add("hidden");
    if (img) img.removeAttribute("src");
    if (cap) {
      cap.textContent = "";
      cap.hidden = true;
    }
    wrap.dataset.caption = "";
    return;
  }

  wrap.classList.remove("hidden");
  if (img) {
    img.src = src;
    img.alt = q?.imageAlt || q?.title || "Плакат";
    img.onerror = () => {
      wrap.classList.add("hidden");
    };
  }
  // ВАЖНО: подпись к картинке показываем только ПОСЛЕ ответа, чтобы не подсказывать.
  hidePosterCaption(q);
}

function resetState() {
  idx = 0;
  started = false;
  selectedOptionId = null;
  results = [];
  hide(quizEl);
  hide(resultEl);
  feedbackEl.classList.add("hidden");
  nextBtn.disabled = true;
  resetBtn.disabled = true;
  
  // Показываем выбор квиза, скрываем кнопку "Начать"
  show(quizChoiceEl);
  hide(startBtn);
  currentQuiz = null;
  
  // Сбрасываем подсветку выбранных квизов
  chooseOldQuizBtn.classList.remove("selected");
  chooseNewQuizBtn.classList.remove("selected");
}

function renderQuestion() {
  const q = QUIZ_DATA.questions[idx];
  progressTextEl.textContent = `Вопрос ${idx + 1}/${QUIZ_DATA.questions.length}`;
  renderProgressStars();

  questionTitleEl.textContent = q.title;
  questionPromptEl.textContent = q.prompt || "";

  setQuestionPoster(q);

  answersEl.innerHTML = "";
  feedbackEl.classList.add("hidden");
  selectedOptionId = null;
  textAnswerValue = "";
  nextBtn.disabled = true;
  currentAnswerControl = null;
  currentCheckBtn = null;

  if (q.type === "text" || q.type === "year") {
    const wrap = document.createElement("div");
    wrap.className = "textAnswerWrap";

    let control;
    if (q.type === "year") {
      const select = document.createElement("select");
      select.className = "input";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = q.placeholder || "Выбери год…";
      placeholder.disabled = true;
      placeholder.selected = true;
      // Не скрываем placeholder: иначе некоторые браузеры показывают первый год,
      // но фактически оставляют value="" (и ответ считается пустым).
      placeholder.hidden = false;
      select.appendChild(placeholder);

      const years = q.years ?? ["1941", "1942", "1943", "1944", "1945"];
      years.forEach((y) => {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        select.appendChild(opt);
      });
      select.value = "";
      select.addEventListener("change", () => {
        textAnswerValue = select.value;
      });
      control = select;
    } else {
      const input = document.createElement("input");
      input.className = "input";
      input.type = "text";
      input.placeholder = q.placeholder || "Введите ответ…";
      input.autocomplete = "off";
      input.addEventListener("input", () => {
        textAnswerValue = input.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          checkTextAnswer();
        }
      });
      control = input;
      setTimeout(() => input.focus(), 0);
    }

    control.classList.remove("inputCorrect", "inputWrong");
    control.disabled = false;
    currentAnswerControl = control;

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "btn btnGhost";
    checkBtn.textContent = "Проверить";
    checkBtn.addEventListener("click", () => checkTextAnswer());
    currentCheckBtn = checkBtn;

    wrap.appendChild(control);
    wrap.appendChild(checkBtn);
    answersEl.appendChild(wrap);
    return;
  }

  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "answerBtn";
    btn.textContent = opt.text;
    btn.addEventListener("click", () => {
      const qNow = QUIZ_DATA.questions[idx];
      if (results.find((r) => r.id === qNow.id)) return;
      selectedOptionId = opt.id;
      [...answersEl.querySelectorAll(".answerBtn")].forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      gradeAndExplain(btn);
    });
    answersEl.appendChild(btn);
  });
}

function gradeAndExplain(clickedBtn) {
  const q = QUIZ_DATA.questions[idx];
  const chosen = q.options.find((o) => o.id === selectedOptionId);
  if (!chosen) return;

  const ok = Boolean(chosen.correct);
  feedbackEl.classList.remove("hidden");
  feedbackStatusEl.textContent = ok ? "Верно" : "Неверно";
  feedbackStatusEl.className = `feedbackStatus ${ok ? "good" : "bad"}`;
  feedbackExplainEl.textContent = q.explain || "";
  revealPosterCaption(q);
  nextBtn.disabled = false;

  if (clickedBtn) clickedBtn.classList.add(ok ? "answerCorrect" : "answerWrong");
  [...answersEl.querySelectorAll(".answerBtn")].forEach((b) => (b.disabled = true));

  const existing = results.find((r) => r.id === q.id);
  const record = { id: q.id, title: q.title, chosenId: chosen.id, chosenText: chosen.text, correct: ok };
  if (existing) Object.assign(existing, record);
  else results.push(record);
  renderProgressStars();
}

function checkTextAnswer() {
  const q = QUIZ_DATA.questions[idx];
  if (results.find((r) => r.id === q.id)) return;
  const raw = textAnswerValue ?? "";
  const given = normalizeAnswer(raw);

  if (q.type === "year" && !given) {
    feedbackEl.classList.remove("hidden");
    feedbackStatusEl.textContent = "Выбери год";
    feedbackStatusEl.className = "feedbackStatus bad";
    feedbackExplainEl.textContent = "";
    nextBtn.disabled = true;
    return;
  }

  const acceptable = (q.acceptableAnswers ?? []).map(normalizeAnswer);
  const ok = acceptable.includes(given);

  feedbackEl.classList.remove("hidden");
  feedbackStatusEl.textContent = ok ? "Верно" : "Неверно";
  feedbackStatusEl.className = `feedbackStatus ${ok ? "good" : "bad"}`;
  feedbackExplainEl.textContent = q.explain || "";
  revealPosterCaption(q);
  nextBtn.disabled = false;

  if (currentAnswerControl) {
    currentAnswerControl.classList.remove("inputCorrect", "inputWrong");
    currentAnswerControl.classList.add(ok ? "inputCorrect" : "inputWrong");
    currentAnswerControl.disabled = true;
  }
  if (currentCheckBtn) currentCheckBtn.disabled = true;

  const existing = results.find((r) => r.id === q.id);
  const record = { id: q.id, title: q.title, chosenId: "text", chosenText: raw.trim() ? raw.trim() : "—", correct: ok };
  if (existing) Object.assign(existing, record);
  else results.push(record);
  renderProgressStars();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function finalize() {
  const total = QUIZ_DATA.questions.length;
  const correct = results.filter((r) => r.correct).length;
  const name = studentNameEl.value?.trim();
  const cls = studentClassEl.value?.trim();
  const who = name || "________";
  const classText = cls || "____";
  const ratio = total > 0 ? correct / total : 0;
  const reward = pickReward(ratio);
  setReward(reward);

  const header = [
    `Результат квиза «${QUIZ_DATA.title ?? "Квиз"}»`,
    `Участник/команда: ${who}`,
    `Класс: ${classText}`,
    `Дата: ${new Date().toLocaleString("ru-RU")}`,
    `Итог: ${correct}/${total}`,
    `Звёзды: ${buildStarLine()}`,
    getPraise(correct, total),
    reward?.title ? `Плакат‑награда: ${reward.title}` : null,
  ].filter(Boolean);

  resultTextEl.textContent = header.join("\n");

  resultDetailsEl.innerHTML = "";
  QUIZ_DATA.questions.forEach((q, i) => {
    const r = results.find((x) => x.id === q.id);
    const div = document.createElement("div");
    div.className = "resultItem";
    div.innerHTML = `
      <div><strong>${i + 1}. ${escapeHtml(q.title)}</strong></div>
      <div>Ваш ответ: ${escapeHtml(r?.chosenText ?? "—")}</div>
      <div>Правильный: ${escapeHtml(getCorrectText(q))}</div>
    `;
    resultDetailsEl.appendChild(div);
  });

  hide(quizEl);
  show(resultEl);
}

function buildExportText() {
  const total = QUIZ_DATA.questions.length;
  const correct = results.filter((r) => r.correct).length;
  const name = studentNameEl.value?.trim();
  const cls = studentClassEl.value?.trim();
  const who = name || "________";
  const classText = cls || "____";
  const ratio = total > 0 ? correct / total : 0;
  const reward = pickReward(ratio);
  const lines = [];

  lines.push(`Результат квиза «${QUIZ_DATA.title ?? "Квиз"}»`);
  lines.push(`Участник/команда: ${who}`);
  lines.push(`Класс: ${classText}`);
  lines.push(`Дата: ${new Date().toLocaleString("ru-RU")}`);
  lines.push(`Итог: ${correct}/${total}`);
  lines.push(`Звёзды: ${buildStarLine()}`);
  lines.push(getPraise(correct, total));
  if (reward?.title) lines.push(`Плакат‑награда: ${reward.title}`);
  lines.push("");

  QUIZ_DATA.questions.forEach((q, i) => {
    const r = results.find((x) => x.id === q.id);
    lines.push(`${i + 1}. ${q.title}`);
    lines.push(`   Ваш ответ: ${r?.chosenText ?? "—"}`);
    lines.push(`   Правильный: ${getCorrectText(q)}`);
    lines.push("");
  });
  return lines.join("\n");
}

function wrapLines(ctx, text, maxWidthPx) {
  const out = [];
  const rawLines = String(text).replaceAll("\r\n", "\n").split("\n");
  for (const raw of rawLines) {
    if (!raw) {
      out.push("");
      continue;
    }
    const words = raw.split(" ");
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (ctx.measureText(candidate).width <= maxWidthPx) line = candidate;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function downloadPng(filename, text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    alert("Не удалось сохранить картинкой на этом устройстве.");
    return;
  }

  const width = 1080;
  const padding = 60;
  const fontSize = 26;
  const lineHeight = Math.round(fontSize * 1.35);

  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  const maxTextWidth = width - padding * 2;
  const lines = wrapLines(ctx, text, maxTextWidth);
  const height = padding * 2 + 56 + lines.length * lineHeight + 20;

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#121c33";
  ctx.fillRect(0, 0, width, 56);
  ctx.fillStyle = "#eef3ff";
  ctx.font = `700 20px "Segoe UI", system-ui, -apple-system, Arial, sans-serif`;
  ctx.fillText("Результат квиза (скрин для учителя)", padding, 36);

  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  ctx.fillStyle = "#eef3ff";
  let y = padding + 56;
  for (const line of lines) {
    y += lineHeight;
    ctx.fillText(line, padding, y);
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// Обработчики выбора квиза
chooseOldQuizBtn.addEventListener("click", () => {
  window.QUIZ_DATA = window.QUIZ_DATA_OLD;
  currentQuiz = "old";
  hide(quizChoiceEl);
  show(startBtn);
  chooseOldQuizBtn.classList.add("selected");
  chooseNewQuizBtn.classList.remove("selected");
});

chooseNewQuizBtn.addEventListener("click", () => {
  window.QUIZ_DATA = window.QUIZ_DATA_NEW;
  currentQuiz = "new";
  hide(quizChoiceEl);
  show(startBtn);
  chooseNewQuizBtn.classList.add("selected");
  chooseOldQuizBtn.classList.remove("selected");
});

startBtn.addEventListener("click", () => {
  if (started || !currentQuiz) return;
  started = true;
  resetBtn.disabled = false;
  hide(startBtn);
  show(quizEl);
  hide(resultEl);
  renderQuestion();
});

resetBtn.addEventListener("click", () => {
  resetState();
});

nextBtn.addEventListener("click", () => {
  const q = QUIZ_DATA.questions[idx];
  if (q.type === "choice" && !selectedOptionId) return;
  if ((q.type === "text" || q.type === "year") && results.find((r) => r.id === q.id) == null) return;
  if (idx < QUIZ_DATA.questions.length - 1) {
    idx += 1;
    renderQuestion();
  } else {
    finalize();
  }
});

downloadBtn.addEventListener("click", () => {
  const txt = buildExportText();
  const safeDate = new Date().toISOString().slice(0, 10);
  downloadPng(`result_quiz_${safeDate}.png`, txt);
});

// Инициализация при загрузке
document.addEventListener("DOMContentLoaded", () => {
  // Убедимся, что данные квизов определены
  if (!window.QUIZ_DATA_OLD || !window.QUIZ_DATA_NEW) {
    console.error("Данные квизов не найдены!");
    return;
  }
  
  resetState();
});
