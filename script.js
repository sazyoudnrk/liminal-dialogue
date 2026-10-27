// =====================================================
// Liminal Dialogue ゲーム本体
// 会話の進め方は engine.js、データ形式は FORMAT.md を参照
// =====================================================
const TYPE_SPEED = 35;
const SAVE_PREFIX = "liminal-dialogue:v2:";
const LAST_CHARACTER_KEY = "liminal-dialogue:lastCharacter";

const $ = id => document.getElementById(id);

const game = {
  doc: null,        // 現在のキャラクターデータ
  progress: null,   // 現在のキャラクターの進行状況
  runner: null,     // 再生中の会話（なければ null = 待機中）
  step: null,       // 表示中のステップ
  typing: false,
  timer: null,
};

// ---------------------------------------------
// 読み込み・保存
// ---------------------------------------------
const docCache = {};

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} を読み込めません (${res.status})`);
  return res.json();
}

async function loadDoc(id) {
  if (!docCache[id]) docCache[id] = await fetchJson(`data/${id}.json`);
  return docCache[id];
}

// 旧形式（mainIndex_xxx / talkCount_xxx など）の保存データは消さずに残している。
// 引き継ぎ機能を作るときは、ここで旧キーを読んで新形式に変換する。
function loadProgress(doc) {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + doc.id);
    if (raw) {
      const p = JSON.parse(raw);
      return Object.assign(LD.newProgress(doc), p, { vars: Object.assign({}, doc.vars || {}, p.vars || {}) });
    }
  } catch (e) {
    console.warn("進行状況を読み込めませんでした", e);
  }
  return LD.newProgress(doc);
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_PREFIX + game.doc.id, JSON.stringify(game.progress));
  } catch (e) {
    console.warn("進行状況を保存できませんでした", e);
  }
}

function imageUrl(doc, face) {
  const file = doc.images.faces[face];
  return file ? doc.images.base + file : "";
}

// ---------------------------------------------
// 画面切り替え
// ---------------------------------------------
async function renderSelectScreen(ids) {
  const box = $("character-select");
  box.innerHTML = "";
  for (const id of ids) {
    let doc;
    try {
      doc = await loadDoc(id);
    } catch (e) {
      console.error(e);
      continue;
    }
    const card = document.createElement("button");
    card.className = "character-card";
    const img = document.createElement("img");
    img.src = imageUrl(doc, doc.images.idle) || imageUrl(doc, Object.keys(doc.images.faces)[0]);
    img.alt = doc.name;
    const label = document.createElement("div");
    label.className = "character-name";
    label.textContent = doc.name;
    card.append(img, label);
    card.addEventListener("click", () => enterCharacter(id));
    box.appendChild(card);
  }
}

function showScreen(name) {
  $("select-screen").classList.toggle("hidden", name !== "select");
  $("game-screen").classList.toggle("hidden", name !== "game");
}

async function enterCharacter(id) {
  stopTyping();
  game.doc = await loadDoc(id);
  game.progress = loadProgress(game.doc);
  try { localStorage.setItem(LAST_CHARACTER_KEY, id); } catch (e) { /* 保存できなくても続行 */ }
  $("name").textContent = game.doc.name;
  showIdle();
  showScreen("game");
}

function backToSelect() {
  stopTyping();
  game.runner = null;
  game.doc = null;
  showScreen("select");
}

// ---------------------------------------------
// 表示
// ---------------------------------------------
function setFace(face) {
  const el = $("character");
  const url = imageUrl(game.doc, face);
  if (url) el.src = url;
  el.alt = `${game.doc.name}（${face}）`;
}

function showIdle() {
  game.runner = null;
  game.step = null;
  $("message-box").classList.remove("active");
  clearChoices();
  setFace(game.doc.images.idle);
}

function clearChoices() {
  const box = $("choices");
  box.innerHTML = "";
  box.style.display = "none";
}

function showIndicator() {
  const span = document.createElement("span");
  span.id = "indicator";
  span.textContent = "▼";
  $("text").appendChild(span);
}

function stopTyping() {
  clearTimeout(game.timer);
  game.typing = false;
}

function typeLine(text) {
  const el = $("text");
  stopTyping();
  el.textContent = "";
  const tokens = LD.parseText(text);
  let ti = 0, ci = 0;
  game.typing = true;

  const loop = () => {
    if (!game.typing) return;
    if (ti >= tokens.length) {
      game.typing = false;
      showIndicator();
      return;
    }
    const tk = tokens[ti];
    if (tk.type === "text") {
      el.textContent += tk.value[ci++] || "";
      if (ci >= tk.value.length) { ti++; ci = 0; }
      game.timer = setTimeout(loop, TYPE_SPEED);
    } else if (tk.type === "wait") {
      ti++;
      game.timer = setTimeout(loop, tk.value);
    } else if (tk.type === "shake") {
      const g = $("game");
      g.classList.remove("shake");
      void g.offsetWidth; // アニメーションを毎回やり直す
      g.classList.add("shake");
      ti++;
      loop();
    }
  };
  loop();
}

function skipTyping() {
  if (!game.typing) return false;
  stopTyping();
  $("text").textContent = LD.stripTags(game.step.text);
  showIndicator();
  return true;
}

function showStep(step) {
  game.step = step;
  if (step.kind === "line") {
    $("message-box").classList.add("active");
    setFace(step.face);
    typeLine(step.text);
  } else if (step.kind === "choice") {
    renderChoices(step.options);
  } else {
    saveProgress();
    showIdle();
  }
}

function renderChoices(options) {
  const box = $("choices");
  box.innerHTML = "";
  for (const o of options) {
    const btn = document.createElement("button");
    btn.textContent = o.label;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      clearChoices();
      showStep(game.runner.choose(o.index));
    });
    box.appendChild(btn);
  }
  box.style.display = "block";
}

// ---------------------------------------------
// 操作
// ---------------------------------------------
function startTalk() {
  const { topic } = LD.pickTopic(game.doc, game.progress);
  if (!topic) {
    console.warn("話せるトピックがありません");
    return;
  }
  game.runner = new LD.Runner(game.doc, game.progress);
  showStep(game.runner.start(topic));
}

function onTap(e) {
  if (!game.doc) return;
  if (e.target.closest("button")) return; // ボタン類はそれぞれの処理に任せる
  if (game.step && game.step.kind === "choice") return;
  if (skipTyping()) return;
  if (!game.runner) startTalk();
  else showStep(game.runner.next());
}

function resetProgress() {
  if (!game.doc) return;
  try { localStorage.removeItem(SAVE_PREFIX + game.doc.id); } catch (e) { /* noop */ }
  stopTyping();
  game.progress = LD.newProgress(game.doc);
  showIdle();
}

async function init() {
  $("back-button").addEventListener("click", backToSelect);
  $("reset-button").addEventListener("click", resetProgress);
  $("game-screen").addEventListener("click", onTap);

  const ids = await fetchJson("characters.json");
  if (!ids.length) {
    console.error("characters.json にキャラクターが登録されていません");
    return;
  }
  await renderSelectScreen(ids);
  showScreen("select");
}

init();
