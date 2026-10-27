# 会話データ形式（liminal-dialogue/2）

1キャラ = 1ファイル（`data/<キャラID>.json`）。基本は `talk-editor.html` で編集します。

## 全体

```json
{
  "format": "liminal-dialogue/2",
  "id": "syochou",
  "name": "所長",
  "images": {
    "base": "assets/images/syochou/",
    "idle": "idle",
    "faces": { "normal": "normal.png", "smile": "smile.png", "idle": "idle.png" },
    "notes": { "normal": "口開き" }
  },
  "rules": {
    "storyEvery": 5,
    "stages": [
      { "id": "early", "label": "序盤", "until": 10 },
      { "id": "normal", "label": "中盤", "until": 30 },
      { "id": "late", "label": "終盤" }
    ]
  },
  "vars": { "trust": 0, "met": false },
  "topics": [ … ]
}
```

| 項目 | 意味 |
|---|---|
| `images.faces` | 表情キー → 画像ファイル名 |
| `images.idle` | 待機中に使う表情キー |
| `images.notes` | 表情のメモ（エディタ表示用） |
| `rules.storyEvery` | 何回話すごとにストーリーを挟むか（0 = 挟まない） |
| `rules.stages` | 会話回数で切り替わる段階。`until` 回未満のあいだその段階。最後の段階は `until` なし |
| `vars` | 変数と初期値（数値または true/false） |

## トピック（話題 1つ分）

```json
{
  "id": "e1",
  "pools": ["early"],
  "title": "消費が怖い",
  "if": "trust >= 0",
  "once": false,
  "memo": "",
  "scenes": [ … ]
}
```

- `pools`: どこで出てくるか。`first`（初回）/ `story`（ストーリー）/ 段階ID / `hidden`（ジャンプ専用）。複数指定できます
- `if`: 出現条件（省略 = いつでも）
- `once`: true にすると一度見たら二度と出ない
- 同じ段階の中では、まだ見ていないトピックが優先して選ばれます
- ストーリーは `topics` に並んでいる順に、まだ見ていない最初のものが出ます

## シーン

トピックは1つ以上のシーンでできていて、最初のシーンから始まります。

```json
{
  "id": "start",
  "set": "met = true",
  "lines": [
    { "face": "normal", "text": "久々に面白い小説を見つけた。" },
    { "text": "何かを消費してしまうのって怖くないか？{wait:500}" }
  ],
  "next": { "type": "choice", "options": [ … ] }
}
```

- `lines`: 1行 = 1回のタップ。`face` を省略すると前の行の表情のまま
- 文中タグ: `{wait:500}`（ミリ秒止まる）`{shake}`（画面が揺れる）
- `set`: このシーンに入ったときの変数操作
- セリフ0行のシーンも作れます（条件分岐だけを行う中継点など）

### next（セリフのあと）

| type | 書き方 |
|---|---|
| `end` | `{ "type": "end" }` 会話を終える |
| `goto` | `{ "type": "goto", "goto": "b" }` |
| `choice` | `{ "type": "choice", "options": [{ "label": "はい", "goto": "a", "if": "…", "set": "…" }] }` |
| `branch` | `{ "type": "branch", "cases": [{ "if": "trust >= 3", "goto": "high" }], "else": "low" }` 上から順に判定 |
| `random` | `{ "type": "random", "cases": [{ "goto": "a", "weight": 3, "if": "…" }] }` 重み付き抽選 |

行き先（`goto` / `else`）に書けるもの:

- シーンID（同じトピック内）
- `end`（会話を終える）
- `topic:<トピックID>`（別トピックの最初のシーンへ）

選択肢の `if` を満たさないものは表示されません。`set` は選んだときに実行されます。

## 条件と変数操作

- 条件: `trust >= 3` `met` `!angry` `seen.e1` `talkCount > 20`
- 組み合わせ: `&&`（かつ）、`||`（または）。`&&` が先に結びつきます。括弧は使えません
- 比較: `==` `!=` `>=` `<=` `>` `<`
- 変数操作: `trust += 1` `trust -= 2` `met = true`。カンマで複数書けます
- `seen.<トピックID>` はそのトピックを見たことがあるか、`talkCount` は会話回数（どちらも読み取り専用）
- 変数一覧にない名前は初期値 0 として扱います（エディタのチェックで警告が出ます）

## 進行の決まり方

1. まだ初回トピックを見ていなければ `first` から1つ
2. 会話回数が `storyEvery` の倍数なら、未読のストーリーを順番に1つ
3. それ以外は、会話回数に応じた段階から1つ（出せるものがなければ前の段階、次に後の段階から探します）

トピックが終わると会話回数が1増え、通ったトピックが既読になります。

## 進行状況の保存

ブラウザの localStorage に `liminal-dialogue:v2:<キャラID>` という名前で保存します。

```json
{ "talkCount": 7, "seen": ["f1", "e3", "main1"], "firstDone": true, "vars": { "trust": 2 } }
```

旧形式の保存データ（`talkCount_<id>` `seen_<id>` `mainIndex_<id>` `seen_first_<id>`）は消さずに残しています。トピックIDは旧データのノードIDと同じなので、引き継ぐときは次のように変換できます（引き継ぎ機能はまだ実装していません）。

- `talkCount_<id>` → `talkCount`
- `seen_<id>` → `seen`
- `mainIndex_<id>` = N → ストーリーの先頭N個を `seen` に追加
- `seen_first_<id>` → `firstDone`
