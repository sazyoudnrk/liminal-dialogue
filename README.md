# Liminal Dialogue

公開URL: https://sazyoudnrk.github.io/liminal-dialogue/

## マルチキャラクター対応版

## フォルダ構成

```
index.html
style.css
script.js
characters.json          ← キャラクター一覧（表示名とID）
data/
  syochou/
    config.json           ← 立ち絵パスなどキャラ固有設定
    talk.json              ← セリフ・分岐データ
assets/
  images/
    syochou/
      idle.png / normal.png / normal2.png / smile.png
```

## 新しいキャラクターを追加する手順

1. `data/<新しいid>/config.json` と `data/<新しいid>/talk.json` を用意する
   （`data/syochou/` の中身をコピーして書き換えるのが早いです）
2. `assets/images/<新しいid>/` に立ち絵画像を置く
3. `characters.json` に1行追加する

```json
[
  { "id": "syochou", "name": "所長" },
  { "id": "新しいid", "name": "表示名" }
]
```

これだけで画面上部にキャラクター選択ボタンが自動で増え、進行状況（会話回数・既読フラグなど）もキャラクターごとに個別のlocalStorageキーで保存されます。

## 主な変更点（レビュー対応）

- `skipTyping()` が2回定義されていた重複を解消
- `mainIndex` / `talkCount` / `seenIds` がキャラクター固定になっていた問題を修正し、`switchCharacter()` で毎回読み直すように変更
- コメントアウトされた死んだコード（`startFirst`）を削除
- `fetch` にエラーハンドリングを追加（データが見つからない場合に例外を投げる）
- リセットボタンを `onclick` 属性から `addEventListener` に変更し、現在選択中のキャラクターのみリセットするように修正
- キャラクター切り替え時にタイピングやタイマーを確実に止めるように修正
- 立ち絵の `alt` 属性をキャラクター名と状態に応じて動的に設定

## talk.json エディタ

`talk-editor.html` で talk.json を作成・編集できます。
公開URL: https://sazyoudnrk.github.io/liminal-dialogue/talk-editor.html
