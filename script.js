// =====================
// 設定・状態
// =====================
let cache = {};
let charConfig = {};
let characterList = [];   // characters.json の内容
let currentCharacter = null;

let state = "idle";
let currentChunks = [];
let chunkIndex = 0;
let typingTimer = null;
let isTyping = false;
let fullText = "";
let currentNode = null;

// キャラクターごとに変化する進行状況
// switchCharacter() のたびに読み直される（固定constにしない）
let mainIndex = 0;
let talkCount = 0;
let seenIds = [];

const TYPE_SPEED = 35;
const LAST_CHARACTER_KEY = "lastCharacter";

// =====================
// localStorage キー（常に現在のキャラクター基準で組み立てる）
// =====================
function keyFor(name) {
  return `${name}_${currentCharacter}`;
}

function saveMainIndex() {
  localStorage.setItem(keyFor("mainIndex"), mainIndex);
}

function saveTalkCount() {
  localStorage.setItem(keyFor("talkCount"), talkCount);
}

function saveSeen() {
  localStorage.setItem(keyFor("seen"), JSON.stringify(seenIds));
}

function hasSeenFirst() {
  return localStorage.getItem(keyFor("seen_first")) === "true";
}

function markSeenFirst() {
  localStorage.setItem(keyFor("seen_first"), "true");
}

// 現在のキャラクターの保存済み進行状況をメモリに読み込む
function loadProgressFromStorage() {
  mainIndex = Number(localStorage.getItem(keyFor("mainIndex")) || 0);
  talkCount = Number(localStorage.getItem(keyFor("talkCount")) || 0);
  seenIds = JSON.parse(localStorage.getItem(keyFor("seen")) || "[]");
}

// =====================
// 読み込み
// =====================
async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

async function load(category) {
  const key = `${currentCharacter}_${category}`;
  if (cache[key]) return cache[key];

  const data = await fetchJson(`data/${currentCharacter}/${category}.json`);
  cache[key] = data;
  return data;
}

async function loadCharacterConfig(id) {
  return fetchJson(`data/${id}/config.json`);
}

async function loadCharacterList() {
  return fetchJson("characters.json");
}

// =====================
// ユーティリティ
// =====================
function resolveImage(key) {
  return charConfig.basePath + charConfig.images[key];
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function splitText(text) {
  return text.split("\n");
}

// =====================
// UI制御
// =====================
function openBox() {
  document.getElementById("message-box").classList.add("active");
}

function closeBox() {
  document.getElementById("message-box").classList.remove("active");
}

function clearIndicator() {
  const old = document.getElementById("indicator");
  if (old) old.remove();
}

function clearChoices() {
  const box = document.getElementById("choices");
  box.innerHTML = "";
  box.style.display = "none";
}

// =====================
// キャラクター選択画面
// =====================
async function renderSelectScreen() {
  const box = document.getElementById("character-select");
  box.innerHTML = "";

  for (const c of characterList) {
    const config = await loadCharacterConfig(c.id);

    const card = document.createElement("div");
    card.className = "character-card";
    card.dataset.id = c.id;

    const img = document.createElement("img");
    img.src = config.basePath + (config.images.idle || config.images.normal);
    img.alt = c.name;

    const label = document.createElement("div");
    label.className = "character-name";
    label.textContent = c.name;

    card.appendChild(img);
    card.appendChild(label);
    card.addEventListener("click", () => enterCharacter(c.id));

    box.appendChild(card);
  }
}

function showSelectScreen() {
  document.getElementById("select-screen").classList.remove("hidden");
  document.getElementById("game-screen").classList.add("hidden");
}

function showGameScreen() {
  document.getElementById("select-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
}

// 選択画面からキャラクターを選んでゲーム画面に入る
async function enterCharacter(id) {
  await switchCharacter(id);
  showGameScreen();
}

// 現在のキャラクターのゲームを終了して選択画面に戻る
function backToSelectScreen() {
  clearTimeout(typingTimer);
  isTyping = false;
  clearIndicator();
  clearChoices();
  closeBox();

  currentCharacter = null;
  showSelectScreen();
}

async function switchCharacter(id) {
  // 進行中のタイピングやタイマーを止めてから切り替える
  clearTimeout(typingTimer);
  isTyping = false;
  clearIndicator();
  clearChoices();
  closeBox();

  currentCharacter = id;
  localStorage.setItem(LAST_CHARACTER_KEY, id);

  charConfig = await loadCharacterConfig(id);
  document.getElementById("name").textContent = charConfig.name || "";

  loadProgressFromStorage();

  state = "idle";
  currentNode = null;
  showIdle();
}

// =====================
// セリフ表示
// =====================
function startLine(line) {
  currentNode = line;
  currentChunks = splitText(line.text);
  chunkIndex = 0;

  document.getElementById("character").src = resolveImage(line.image);

  showChunk();
}

function showChunk() {
  typeLine(currentChunks[chunkIndex]);
}

// =====================
// 進行
// =====================
function nextChunk() {
  if (skipTyping()) return;

  chunkIndex++;

  // まだ続きがある
  if (chunkIndex < currentChunks.length) {
    showChunk();
    return;
  }

  // ===== セリフ終了 =====

  // 分岐ノード対応（最優先）
  if (currentNode) {

    // 選択肢がある
    if (currentNode.choices) {
      renderChoices(currentNode.choices);
      return;
    }

    // 自動遷移
    if (currentNode.next) {
      runNode(currentNode.next);
      return;
    }
  }

  // 従来処理（fallback）
  if (state === "first") {
    state = "first_end";
    closeBox();
    showIdle();

  } else if (state === "talk") {
    state = "talk_end";

    talkCount++;
    saveTalkCount();

    closeBox();
    showIdle();
  }
}

// =====================
// タップ操作
// =====================
document.addEventListener("click", async (e) => {
  // キャラクター選択・リセット・戻るボタン自体のクリックはゲーム進行として扱わない
  if (e.target.closest("#character-select") || e.target.closest("#reset-button") || e.target.closest("#back-button")) {
    return;
  }

  if (document.getElementById("choices").children.length > 0) return;

  if (isTyping) {
    skipTyping();
    return;
  }

  switch (state) {
    case "idle":
      if (!hasSeenFirst()) {
        runNode("first_root");
        markSeenFirst();
      } else if (talkCount > 0 && talkCount % 5 === 0) {
        runNode("main_root");
      } else {
        runNodeByTalkCount();
      }
      break;

    case "first":
      nextChunk();
      break;

    case "first_end":
      runNode("main_root");
      break;

    case "talk":
      nextChunk();
      break;

    case "node":
      nextChunk();
      break;

    case "talk_end":
      state = "idle";
      showIdle();
      break;
  }
});

// =====================
// 初期化
// =====================
async function init() {
  document.getElementById("reset-button").addEventListener("click", resetGame);
  document.getElementById("back-button").addEventListener("click", backToSelectScreen);

  characterList = await loadCharacterList();

  if (characterList.length === 0) {
    console.error("characters.json にキャラクターが登録されていません");
    return;
  }

  await renderSelectScreen();
  showSelectScreen();
}

function selectTable(data) {
  if (talkCount === 0) return data.tables.first;
  if (talkCount < 10) return data.tables.early;
  if (talkCount < 30) return data.tables.mid;
  return data.tables.late;
}

function filterUnseen(lines) {
  return lines.filter(l => !seenIds.includes(l.id));
}

function parseText(text) {
  const regex = /{(.*?)}/g;
  let result = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const tag = match[1];

    if (tag.startsWith("face:")) {
      result.push({ type: "face", value: tag.split(":")[1] });
    } else if (tag.startsWith("bg:")) {
      result.push({ type: "bg", value: tag.split(":")[1] });
    } else if (tag.startsWith("wait:")) {
      result.push({ type: "wait", value: Number(tag.split(":")[1]) });
    } else if (tag === "shake") {
      result.push({ type: "shake" });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push({ type: "text", value: text.slice(lastIndex) });
  }

  return result;
}

function resetGame() {
  // 現在選択中のキャラクターの進行状況だけをリセットする
  localStorage.removeItem(keyFor("talkCount"));
  localStorage.removeItem(keyFor("seen"));
  localStorage.removeItem(keyFor("mainIndex"));
  localStorage.removeItem(keyFor("seen_first"));
  location.reload();
}

function showIdle() {
  const charEl = document.getElementById("character");
  charEl.alt = charConfig.name ? `${charConfig.name}（待機）` : "character";

  if (charConfig.images.idle) {
    charEl.src = resolveImage("idle");
  } else {
    // fallback（なければnormal）
    charEl.src = resolveImage("normal");
  }
}

function typeLine(text) {
  const textEl = document.getElementById("text");

  clearTimeout(typingTimer);
  isTyping = true;
  fullText = text;

  clearIndicator();
  textEl.innerText = "";

  const tokens = parseText(text);

  let tokenIndex = 0;
  let charIndex = 0;

  function loop() {
    if (!isTyping) return; // 暴走防止

    if (tokenIndex >= tokens.length) {
      isTyping = false;

      clearIndicator();
      const span = document.createElement("span");
      span.id = "indicator";
      span.innerText = "▼";
      textEl.appendChild(span);
      return;
    }

    const token = tokens[tokenIndex];

    if (token.type === "text") {
      textEl.innerText += token.value[charIndex++];
      if (charIndex >= token.value.length) {
        tokenIndex++;
        charIndex = 0;
      }
      typingTimer = setTimeout(loop, TYPE_SPEED);
    }

    else if (token.type === "face") {
      document.getElementById("character").src = resolveImage(token.value);
      tokenIndex++;
      loop();
    }

    else if (token.type === "bg") {
      const gameEl = document.getElementById("game");
      gameEl.style.backgroundImage = `url(${resolveImage(token.value)})`;
      tokenIndex++;
      loop();
    }

    else if (token.type === "wait") {
      tokenIndex++;
      typingTimer = setTimeout(loop, token.value);
    }

    else if (token.type === "shake") {
      const gameEl = document.getElementById("game");
      gameEl.classList.add("shake");
      setTimeout(() => gameEl.classList.remove("shake"), 300);
      tokenIndex++;
      loop();
    }
  }

  loop();
}

function skipTyping() {
  if (!isTyping) return false;

  isTyping = false;
  clearTimeout(typingTimer);

  const textEl = document.getElementById("text");

  clearIndicator();

  const clean = fullText.replace(/{.*?}/g, "");
  textEl.innerText = clean;

  const span = document.createElement("span");
  span.id = "indicator";
  span.innerText = "▼";
  textEl.appendChild(span);

  return true;
}

async function runNode(id) {

  // main_rootは順番に選ぶ
  if (id === "main_root") {
    const data = await load("talk");
    const list = data.mainStory;
    if (mainIndex >= list.length) {
      runNodeByTalkCount();
      return;
    }
    const next = list[mainIndex];
    mainIndex++;
    saveMainIndex();
    return runNode(next);
  }

  const data = await load("talk");
  const node = data.nodes[id];

  if (!node) {
    console.warn("node not found:", id);
    return;
  }

  // randomは未読フィルタしてランダム選択
  if (node.random) {
    let candidates = node.random.filter(id => !seenIds.includes(id));
    if (candidates.length === 0) {
      candidates = node.random;
    }
    const next = pickRandom(candidates);
    const nextNode = data.nodes[next];
    if (nextNode && nextNode.text) {
      seenIds.push(next);
      saveSeen();
    }
    return runNode(next);
  }

  // idle処理
  if (node.action === "idle") {
    talkCount++;
    saveTalkCount();
    state = "idle";
    closeBox();
    showIdle();
    return;
  }

  // セリフ表示
  currentNode = node;
  openBox();
  startLine(node);
  state = "node";
}

function runNodeByTalkCount() {
  if (talkCount < 10) runNode("early_root");
  else if (talkCount < 30) runNode("normal_root");
  else runNode("late_root");
}

function handleChoice(next) {
  clearChoices();

  // クリックイベントの伝播を止める必要があるので
  // 少し遅延してrunNodeを呼ぶ
  setTimeout(() => runNode(next), 0);
}

function renderChoices(choices) {
  const box = document.getElementById("choices");
  box.innerHTML = "";

  choices.forEach(c => {
    const btn = document.createElement("button");
    btn.innerText = c.text;
    btn.onclick = () => handleChoice(c.next);
    box.appendChild(btn);
  });

  box.style.display = "block";
}

init();
