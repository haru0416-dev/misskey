# Code

ソースコードの表示、インライン表示、編集、syntax highlightingをまとめたfeature。

- `components/MkCode.vue`: 遅延読み込みを行うblock code表示
- `components/MkCode.Core.vue`: highlighterを使うcode renderer本体
- `components/MkCodeInline.vue`: MFMなどで使うinline code表示
- `components/MkCodeEditor.vue`: code入力用editor
- `code-highlighter.ts`: Shiki instance、language、themeの遅延読み込み
- `aiscript.tmLanguage.json`: AiScript用TextMate grammar

languageとthemeは必要になるまで読み込まず、利用側はhighlighterを直接初期化しない。
