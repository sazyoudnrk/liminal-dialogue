# Liminal Dialogue

キャラクターとタップで会話するゲーム。

- ゲーム: https://sazyoudnrk.github.io/liminal-dialogue/
- 会話エディタ: https://sazyoudnrk.github.io/liminal-dialogue/talk-editor.html

## ファイル構成

```
index.html / style.css / script.js   ゲーム画面
engine.js                            会話の進行・条件判定（ゲームとエディタで共用）
talk-editor.html                     会話エディタ
characters.json                      キャラクターの並び順（キャラIDの配列）
data/<キャラID>.json                 キャラ1人分のデータ（画像設定・進行ルール・変数・会話）
assets/images/<キャラID>/            立ち絵
FORMAT.md                            データ形式の説明
```

## 会話を編集する

1. 会話エディタを開いてキャラを選ぶ（編集内容は端末に自動で下書き保存されます）
2. 右上の「保存」→「保存してゲームに反映」で GitHub に直接保存（1〜2分で反映）
   - 初回だけ GitHub のトークン設定が必要です（保存を押すと手順が出ます）
   - トークンを使わない場合は「≡」→「JSONをコピー」→「GitHubでこのファイルを開く」から貼り付けて保存

## キャラクターを追加する

1. エディタの「≡」→「新しいキャラを作る」で作成し、「保存」する（`characters.json` にも自動で追加されます）
2. 立ち絵を `assets/images/<キャラID>/` に置く
