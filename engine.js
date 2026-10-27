// =====================================================
// Liminal Dialogue エンジン（ゲーム本体とエディタのプレビューで共用）
// データ形式の詳しい説明は FORMAT.md を参照
// =====================================================
(function (global) {
  "use strict";

  const FORMAT = "liminal-dialogue/2";
  const SPECIAL_POOLS = ["first", "story", "hidden"];
  const MAX_HOPS = 200; // セリフのないシーンが延々と続く（無限ループ）防止

  // ---------------------------------------------
  // 式（条件 / 変数操作）
  // ---------------------------------------------
  // 条件:  "trust >= 3 && met"  "seen.e1 || !angry"  "talkCount > 20"
  // 操作:  "trust += 1, met = true"
  function readValue(token, ctx) {
    const t = token.trim();
    if (t === "") return 0;
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1);
    return readName(t, ctx);
  }

  function readName(name, ctx) {
    if (name === "talkCount") return ctx.talkCount || 0;
    if (name.startsWith("seen.")) return ctx.seen.has(name.slice(5));
    if (Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name];
    return 0;
  }

  const CMP = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

  function evalClause(clause, ctx) {
    let c = clause.trim();
    if (c === "") return true;
    let negate = false;
    while (c.startsWith("!") && !c.startsWith("!=")) { negate = !negate; c = c.slice(1).trim(); }
    let result;
    const m = c.match(CMP);
    if (m) {
      const a = readValue(m[1], ctx), b = readValue(m[3], ctx);
      switch (m[2]) {
        case "==": result = a == b; break; // eslint-disable-line eqeqeq
        case "!=": result = a != b; break; // eslint-disable-line eqeqeq
        case ">=": result = a >= b; break;
        case "<=": result = a <= b; break;
        case ">": result = a > b; break;
        case "<": result = a < b; break;
      }
    } else {
      result = !!readValue(c, ctx);
    }
    return negate ? !result : result;
  }

  // && は || より強く結びつく（括弧は使えない）
  function evalCond(expr, ctx) {
    if (!expr || !String(expr).trim()) return true;
    return String(expr).split("||").some(or => or.split("&&").every(and => evalClause(and, ctx)));
  }

  const SET = /^([A-Za-z_][\w]*)\s*(\+=|-=|=)\s*(.+)$/;

  function applySet(expr, ctx) {
    if (!expr || !String(expr).trim()) return;
    for (const stmt of String(expr).split(/[,;\n]/)) {
      const s = stmt.trim();
      if (!s) continue;
      const m = s.match(SET);
      if (!m) { console.warn("[LD] 変数操作を読めません:", s); continue; }
      const [, name, op, rhs] = m;
      const v = readValue(rhs, ctx);
      const cur = readName(name, ctx);
      if (op === "=") ctx.vars[name] = v;
      else if (op === "+=") ctx.vars[name] = Number(cur) + Number(v);
      else ctx.vars[name] = Number(cur) - Number(v);
    }
  }

  // 式の中に出てくる変数名（検証用）
  function namesIn(expr) {
    if (!expr) return [];
    const out = [];
    String(expr).replace(/"[^"]*"|'[^']*'|[A-Za-z_][\w.]*/g, w => {
      if (/^["']/.test(w) || w === "true" || w === "false") return w;
      out.push(w);
      return w;
    });
    return out;
  }

  // ---------------------------------------------
  // 進行状況
  // ---------------------------------------------
  function newProgress(doc) {
    return { talkCount: 0, seen: [], firstDone: false, vars: Object.assign({}, doc.vars || {}) };
  }

  function makeCtx(doc, progress) {
    const vars = Object.assign({}, doc.vars || {}, progress.vars || {});
    progress.vars = vars;
    return { vars, talkCount: progress.talkCount, seen: new Set(progress.seen) };
  }

  // ---------------------------------------------
  // トピック選択
  // ---------------------------------------------
  function topicsIn(doc, pool) {
    return doc.topics.filter(t => (t.pools || []).includes(pool));
  }

  function available(topic, ctx) {
    if (topic.once && ctx.seen.has(topic.id)) return false;
    return evalCond(topic.if, ctx);
  }

  function pickFromPool(doc, pool, ctx) {
    const cands = topicsIn(doc, pool).filter(t => available(t, ctx));
    if (!cands.length) return null;
    const unseen = cands.filter(t => !ctx.seen.has(t.id));
    const list = unseen.length ? unseen : cands;
    return list[Math.floor(Math.random() * list.length)];
  }

  function currentStage(doc, talkCount) {
    const stages = (doc.rules && doc.rules.stages) || [];
    for (const s of stages) {
      if (s.until == null || talkCount < s.until) return s;
    }
    return stages[stages.length - 1] || null;
  }

  // 次に話すトピックを決める。{ topic, reason } を返す
  function pickTopic(doc, progress) {
    const ctx = makeCtx(doc, progress);
    const rules = doc.rules || {};

    if (!progress.firstDone) {
      const t = pickFromPool(doc, "first", ctx);
      if (t) return { topic: t, reason: "first" };
    }

    const every = Number(rules.storyEvery) || 0;
    if (every > 0 && progress.talkCount > 0 && progress.talkCount % every === 0) {
      const story = topicsIn(doc, "story").find(t => !ctx.seen.has(t.id) && evalCond(t.if, ctx));
      if (story) return { topic: story, reason: "story" };
    }

    const stages = rules.stages || [];
    const cur = currentStage(doc, progress.talkCount);
    if (cur) {
      const t = pickFromPool(doc, cur.id, ctx);
      if (t) return { topic: t, reason: cur.id };
      // 今の段階に出せる話がなければ、前の段階 → 後の段階の順に探す
      const i = stages.indexOf(cur);
      const order = stages.slice(0, i).reverse().concat(stages.slice(i + 1));
      for (const s of order) {
        const t2 = pickFromPool(doc, s.id, ctx);
        if (t2) return { topic: t2, reason: s.id };
      }
    }
    return { topic: null, reason: "none" };
  }

  // ---------------------------------------------
  // 会話の再生
  // ---------------------------------------------
  // const run = new Runner(doc, progress);
  // run.start(topic) → step を返す
  // step: { kind:"line", text, face } / { kind:"choice", options:[{label,index}] } / { kind:"end" }
  // run.next() でセリフを進め、run.choose(index) で選択肢を選ぶ
  class Runner {
    constructor(doc, progress, opts) {
      this.doc = doc;
      this.progress = progress;
      this.opts = opts || {};
      this.trace = []; // デバッグ・プレビュー用の通過記録
    }

    defaultFace() {
      const faces = Object.keys((this.doc.images && this.doc.images.faces) || {});
      return faces.find(f => f !== this.doc.images.idle) || faces[0] || null;
    }

    start(topic, sceneId) {
      this.ctx = makeCtx(this.doc, this.progress);
      this.rootTopic = topic;
      this.topic = topic;
      this.visited = [topic.id];
      this.face = this.defaultFace();
      this.hops = 0;
      this.ended = false;
      this.trace = [];
      return this.enter(sceneId || (topic.scenes[0] && topic.scenes[0].id));
    }

    log(msg) { this.trace.push(msg); }

    findScene(id) {
      return this.topic.scenes.find(s => s.id === id);
    }

    resolve(target) {
      if (!target || target === "end") return this.finish();
      if (target.startsWith("topic:")) {
        const id = target.slice(6);
        const t = this.doc.topics.find(x => x.id === id);
        if (!t) { this.log(`⚠ トピック ${id} がありません`); return this.finish(); }
        this.topic = t;
        if (!this.visited.includes(t.id)) this.visited.push(t.id);
        this.log(`→ トピック ${t.id}`);
        return this.enter(t.scenes[0] && t.scenes[0].id);
      }
      return this.enter(target);
    }

    enter(sceneId) {
      if (++this.hops > MAX_HOPS) { this.log("⚠ ループが止まらないので終了しました"); return this.finish(); }
      const scene = this.findScene(sceneId);
      if (!scene) { this.log(`⚠ シーン ${sceneId} がありません`); return this.finish(); }
      this.scene = scene;
      this.lineIndex = -1;
      this.log(`[${this.topic.id}/${scene.id}]`);
      if (scene.set) { applySet(scene.set, this.ctx); this.log(`  ${scene.set}`); }
      return this.next();
    }

    next() {
      if (this.ended) return { kind: "end" };
      if (this.pendingChoice) return this.pendingChoice;
      const lines = this.scene.lines || [];
      this.lineIndex++;
      if (this.lineIndex < lines.length) {
        this.hops = 0;
        const line = lines[this.lineIndex];
        if (line.face) this.face = line.face;
        return { kind: "line", text: line.text || "", face: this.face, scene: this.scene.id, topic: this.topic.id, index: this.lineIndex };
      }
      return this.afterLines();
    }

    afterLines() {
      const nx = this.scene.next || { type: "end" };
      switch (nx.type) {
        case "goto":
          return this.resolve(nx.goto);
        case "choice": {
          const options = (nx.options || [])
            .map((o, i) => ({ label: o.label, index: i, ok: evalCond(o.if, this.ctx) }))
            .filter(o => o.ok)
            .map(({ label, index }) => ({ label, index }));
          if (!options.length) { this.log("⚠ 表示できる選択肢がありません"); return this.finish(); }
          this.pendingChoice = { kind: "choice", options };
          return this.pendingChoice;
        }
        case "branch": {
          const hit = (nx.cases || []).find(c => evalCond(c.if, this.ctx));
          return this.resolve(hit ? hit.goto : nx.else);
        }
        case "random": {
          const cands = (nx.cases || []).filter(c => evalCond(c.if, this.ctx));
          if (!cands.length) return this.finish();
          const total = cands.reduce((s, c) => s + (Number(c.weight) || 1), 0);
          let r = Math.random() * total;
          for (const c of cands) {
            r -= Number(c.weight) || 1;
            if (r < 0) return this.resolve(c.goto);
          }
          return this.resolve(cands[cands.length - 1].goto);
        }
        default:
          return this.finish();
      }
    }

    choose(index) {
      if (!this.pendingChoice) return this.next();
      const opt = this.scene.next.options[index];
      this.pendingChoice = null;
      if (!opt) return this.finish();
      this.log(`  選択: ${opt.label}`);
      if (opt.set) { applySet(opt.set, this.ctx); this.log(`  ${opt.set}`); }
      return this.resolve(opt.goto);
    }

    finish() {
      if (this.ended) return { kind: "end" };
      this.ended = true;
      this.pendingChoice = null;
      const p = this.progress;
      p.vars = this.ctx.vars;
      if (!this.opts.dryRun) {
        p.talkCount = (p.talkCount || 0) + 1;
        for (const id of this.visited) if (!p.seen.includes(id)) p.seen.push(id);
        if ((this.rootTopic.pools || []).includes("first")) p.firstDone = true;
      }
      this.log("（終了）");
      return { kind: "end" };
    }
  }

  // ---------------------------------------------
  // 文中の演出タグ  {wait:500}  {shake}
  // ---------------------------------------------
  function parseText(text) {
    const out = [];
    const re = /\{(.*?)\}/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
      const tag = m[1].trim();
      if (tag.startsWith("wait:")) out.push({ type: "wait", value: Number(tag.slice(5)) || 0 });
      else if (tag === "shake") out.push({ type: "shake" });
      else out.push({ type: "text", value: m[0] });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ type: "text", value: text.slice(last) });
    return out;
  }

  function stripTags(text) {
    return parseText(text).filter(t => t.type === "text").map(t => t.value).join("");
  }

  // ---------------------------------------------
  // 検証（エディタ用）
  // ---------------------------------------------
  function validate(doc) {
    const issues = [];
    const add = (level, msg, at) => issues.push({ level, msg, at: at || null });
    const faces = (doc.images && doc.images.faces) || {};
    const stageIds = ((doc.rules && doc.rules.stages) || []).map(s => s.id);
    const pools = SPECIAL_POOLS.concat(stageIds);
    const topicIds = new Set();
    const declared = new Set(Object.keys(doc.vars || {}));
    const BUILTIN = n => n === "talkCount" || n.startsWith("seen.");

    for (const t of doc.topics || []) {
      if (topicIds.has(t.id)) add("error", `トピックID「${t.id}」が重複しています`, { topic: t.id });
      topicIds.add(t.id);
    }

    const checkExpr = (expr, at, isSet) => {
      if (!expr) return;
      for (const n of namesIn(expr)) {
        if (BUILTIN(n)) {
          if (isSet) add("error", `「${n}」は書き換えできません`, at);
          else if (n.startsWith("seen.") && !topicIds.has(n.slice(5))) add("warn", `「${n}」のトピックがありません`, at);
          continue;
        }
        if (!declared.has(n)) add("warn", `変数「${n}」が変数一覧にありません（初期値0として扱います）`, at);
      }
      if (isSet) {
        for (const s of String(expr).split(/[,;\n]/)) if (s.trim() && !SET.test(s.trim())) add("error", `変数操作「${s.trim()}」の書き方が違います`, at);
      }
    };

    for (const t of doc.topics || []) {
      const at = { topic: t.id };
      if (!t.pools || !t.pools.length) add("warn", "出現場所が未設定なので、ジャンプ以外では出てきません", at);
      for (const p of t.pools || []) if (!pools.includes(p)) add("error", `出現場所「${p}」は存在しません`, at);
      checkExpr(t.if, at);
      if (!t.scenes || !t.scenes.length) { add("error", "シーンがありません", at); continue; }

      const ids = new Set();
      for (const s of t.scenes) {
        if (ids.has(s.id)) add("error", `シーンID「${s.id}」が重複しています`, { topic: t.id, scene: s.id });
        ids.add(s.id);
      }
      const targetOk = (g, sat) => {
        if (!g || g === "end") return;
        if (g.startsWith("topic:")) { if (!topicIds.has(g.slice(6))) add("error", `ジャンプ先のトピック「${g.slice(6)}」がありません`, sat); return; }
        if (!ids.has(g)) add("error", `行き先のシーン「${g}」がありません`, sat);
      };

      const reach = new Set([t.scenes[0].id]);
      const edges = {};
      for (const s of t.scenes) {
        const sat = { topic: t.id, scene: s.id };
        checkExpr(s.set, sat, true);
        (s.lines || []).forEach((l, i) => {
          if (l.face && !faces[l.face]) add("error", `表情「${l.face}」が画像一覧にありません`, Object.assign({ line: i }, sat));
          if (!l.text || !l.text.trim()) add("warn", "空のセリフがあります", Object.assign({ line: i }, sat));
          else if (l.text.trim() === "テキスト") add("info", "仮テキストのままです", Object.assign({ line: i }, sat));
        });
        const nx = s.next || { type: "end" };
        const targets = [];
        if (nx.type === "goto") targets.push(nx.goto);
        if (nx.type === "choice") {
          if (!(nx.options || []).length) add("error", "選択肢が1つもありません", sat);
          (nx.options || []).forEach(o => { targets.push(o.goto); checkExpr(o.if, sat); checkExpr(o.set, sat, true); if (!o.label) add("warn", "選択肢の文言が空です", sat); });
        }
        if (nx.type === "branch") {
          (nx.cases || []).forEach(c => { targets.push(c.goto); checkExpr(c.if, sat); });
          targets.push(nx.else);
        }
        if (nx.type === "random") {
          if (!(nx.cases || []).length) add("error", "ランダムの行き先が1つもありません", sat);
          (nx.cases || []).forEach(c => { targets.push(c.goto); checkExpr(c.if, sat); });
        }
        if (!(s.lines || []).length && nx.type === "end") add("warn", "セリフも行き先もない空のシーンです", sat);
        targets.forEach(g => targetOk(g, sat));
        edges[s.id] = targets.filter(g => g && g !== "end" && !g.startsWith("topic:"));
      }
      const queue = [t.scenes[0].id];
      while (queue.length) {
        const id = queue.shift();
        for (const g of edges[id] || []) if (!reach.has(g)) { reach.add(g); queue.push(g); }
      }
      for (const s of t.scenes) if (!reach.has(s.id)) add("warn", `シーン「${s.id}」にはどこからも来られません`, { topic: t.id, scene: s.id });
    }

    if (!topicsIn(doc, "first").length) add("info", "初回（first）のトピックがありません");
    for (const id of stageIds) if (!topicsIn(doc, id).length) add("warn", `段階「${id}」に出るトピックがありません`);
    return issues;
  }

  // ---------------------------------------------
  // 読みやすいJSON出力（短い要素は1行にまとめる）
  // ---------------------------------------------
  function stringify(value) {
    const LIMIT = 100;
    function inline(v) {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      if (Array.isArray(v)) return "[" + v.map(inline).join(", ") + "]";
      if (!Object.keys(v).some(k => v[k] !== undefined)) return "{}";
      return "{ " + Object.keys(v).filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ": " + inline(v[k])).join(", ") + " }";
    }
    function fmt(v, indent) {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      const flat = inline(v);
      if (flat.length + indent.length <= LIMIT && !hasDeepObject(v)) return flat;
      const inner = indent + "  ";
      if (Array.isArray(v)) {
        if (!v.length) return "[]";
        return "[\n" + v.map(x => inner + fmt(x, inner)).join(",\n") + "\n" + indent + "]";
      }
      const keys = Object.keys(v).filter(k => v[k] !== undefined);
      if (!keys.length) return "{}";
      return "{\n" + keys.map(k => inner + JSON.stringify(k) + ": " + fmt(v[k], inner)).join(",\n") + "\n" + indent + "}";
    }
    function hasDeepObject(v) {
      // 2段以上入れ子になったものは1行にしない（行き先の一覧などは見やすく展開）
      return Object.values(v).some(x => x && typeof x === "object" && Object.values(x).some(y => y && typeof y === "object"));
    }
    return fmt(value, "") + "\n";
  }

  global.LD = {
    FORMAT, SPECIAL_POOLS,
    evalCond, applySet, namesIn,
    newProgress, pickTopic, currentStage, topicsIn,
    Runner, parseText, stripTags, validate, stringify,
  };
})(typeof window !== "undefined" ? window : globalThis);
