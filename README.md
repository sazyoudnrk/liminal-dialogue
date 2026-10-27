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
2. 編集したら「ファイル」→「JSONをコピー」
3. 「GitHubでこのファイルを開く」から `data/<キャラID>.json` に貼り付けてコミット

## キャラクターを追加する

1. エディタの「ファイル」→「新しいキャラを作る」で作成し、JSONを書き出す
2. `data/<キャラID>.json` として置く
3. 立ち絵を `assets/images/<キャラID>/` に置く
4. `characters.json` にキャラIDを追加する（ここに並べた順で選択画面に出ます）
