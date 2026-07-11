# Image editor

画像加工、フレーム、透かし処理をまとめたfeature。

- `components/`: editor dialogsと編集フォーム
- `core/`: WebGL compositorとshader/program管理
- `effects/`: compositor用画像effectとGLSL
- `effect/`: effect一覧とUI定義
- `frame/`: 画像フレームrenderer
- `watermark/`: 透かしrenderer

このfeatureのrendererはWebGL resourceを所有する。生成した側が必ず`destroy()`を呼び、動的に作成した`ImageBitmap`も転送後に解放する。
