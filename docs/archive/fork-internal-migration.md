# フォーク内部移行の記録

upstream Misskey `2026.6.0` から分岐したあと、backend を NestJS + Fastify + TypeORM から
Hono + drizzle-orm へ、実行環境を Node.js + pnpm から Bun へ置き換えた。その過程で
一度失われ、後から直した機能をここに記録する。

これらを `CHANGELOG.md` に置いていない理由: **upstream から見た差分がゼロ**だから。
「Hono サーバーで inbox が存在せず」のような項目は、このリポジトリの移行途中でだけ壊れていたもので、
upstream には存在せず、このフォークが公開したビルドにも一度も含まれていない。
リリースノートに並べると、実際には誰も踏んでいない不具合が起きたように読める。

移行そのものの設計と現在の姿は [CONTRIBUTING.md](../../CONTRIBUTING.md) と
`.claude/skills/working-on-backend/` を参照。

---

## 移行作業

- Enhance: バックエンドのデータベースアクセスを TypeORM から Drizzle に移行
- Enhance: ジョブキュー処理 (配送、受信箱、Webhook、エクスポート/インポート等) を NestJS から Hono ベースの実装に移行
- Enhance: WebSocket ストリーミング・ジョブキュー処理の NestJS 実装のうち Hono 移行により不要になったものを削除
- Enhance: REST API エンドポイントの NestJS 実装から NestJS 依存コードを完全に除去 (OpenAPI 仕様生成・misskey-js コード生成用のデータのみ保持)
- Enhance: 起動用 CLI (`bun run cli`) の NestJS 依存を除去し、関数型実装に移行

## 移行中に失われ、後から復旧した機能

- Fix: NestJS廃止後にChart集計などの定期systemジョブが登録されなくなっていた問題を修正
- Fix: リクエストボディのサイズ制限を復元 (NestJS→Hono 移行で Fastify の bodyLimit が失われ、JSON API のボディが Node ランタイムで無制限になっていた。JSON/OAuth は upstream と同じ 1 MiB、multipart は maxFileSize+1MiB を実バイト数で強制し超過は 413。chunked 転送による content-length 回避も防止)
- Fix: 通常の通知 (リアクション・フォロー・メンション・返信・引用等) が Service Worker push で配信されず、ブラウザを閉じている間のプッシュ通知が一切届かなかった問題を修正 (NestJS→Hono 移行時の移植漏れ。チャットのみ移植されていた。通知の既読同期 `readAllNotifications` push も復元)
- Fix: 開発モード (`bun run dev`) で `/vite/` が vite dev サーバーへプロキシされず、フロントエンドが一切表示されなかった問題を修正 (NestJS→Hono 移行時に dev プロキシが失われていた)
- Fix: `GET /api/hashtags/trend` が 404 を返し、トレンドウィジェットが表示されなかった問題を修正 (NestJS→Hono 移行時に allowGet エンドポイントのうちこの1件だけ GET ルートが登録漏れしていた)
- Fix: Hono サーバーでリレーへのアクティビティ配信 (LD 署名付き) が行われず、公開投稿・投稿削除・投票更新・ピン留め変更・アカウント移行がリレーに一切流れていなかった問題を修正
- Fix: Hono サーバーでハッシュタグのトレンド集計 (ランキング/チャートの Redis 書き込み) が行われず、`hashtags/trend` が常に空の結果を返していた問題を修正
- Fix: Hono サーバーでクライアントのベース HTML を返せるように
- Fix: Hono サーバーでユーザーの Atom/RSS/JSON feed を返せるように
- Fix: マイグレーションの統合により欠落していた誕生日検索用のデータベース関数 (`get_birthday_date`) を復元し、`users/following` の `birthday` パラメータや `users/get-following-users-by-birthday` が動作しなくなっていた問題を修正
- Fix: Hono サーバーで `users/update-memo` が動作せず、`users/show` 等のレスポンスでパーソナルメモ (`memo`) が常に `null` になっていた問題を修正
- Fix: Hono サーバーで ActivityPub の inbox エンドポイント (`/inbox`, `/users/:user/inbox`) が存在せず、リモートからの配送 (フォロー、リアクション等) を一切受け付けられなくなっていた問題を修正
- Fix: Hono サーバーで投稿のストリーミング配信 (ホーム/ローカル/グローバル/ハイブリッドタイムライン、ハッシュタグ、チャンネル、ユーザーリスト、アンテナ) が Redis 経由のイベント配送形式の不整合により一切機能していなかった問題を修正
- Fix: Bun ランタイムで実行した際、WebSocket ストリーミング (`/streaming`) が接続開始 (ハンドシェイク) の時点で無応答のまま永久にハングし、一切利用できなくなっていた問題を修正。Bun の `node:http` 互換レイヤーが `'upgrade'` イベントで生ソケットに書き込む方式だと、同一プロセス内に他のソケット接続 (DB 接続プールや Redis クライアント等、実運用では常に存在する) が1つでもあるとレスポンスがクライアントに届かなくなる Bun 側の既知の制約を踏んでいたため、Bun 実行時は `Bun.serve()` のネイティブ WebSocket API を使うように変更
- Fix: Hono サーバーでリモートアクターの引っ越し (`movedTo`) を検知した際、フォロワーの自動移行やブロック/ミュート/ロール/リストの引き継ぎが行われていなかった問題を修正
- Fix: Hono サーバーでノート作成時のアンテナへの振り分け (キーワードマッチング・タイムライン書き込み・ストリーミング配信) が行われず、アンテナ機能が一切動作していなかった問題を修正
- Fix: Hono サーバーでユーザー詳細レスポンス (`users/show` 等) からロール・バッヂロール・リレーション (`isFollowing` / `isBlocking` 等)・ピン止めノート・サイレンス状態・モデレーションノート・2要素認証関連のフィールドが欠落していた問題を修正
- Fix: Hono サーバーで `i` のレスポンスの `securityKeysList` が常に空になり、登録済みセキュリティキーの一覧・名前変更・削除が行えなかった問題を修正
- Fix: Hono サーバーでタイムライン取得 (`notes/timeline`, `notes/local-timeline`, `notes/hybrid-timeline`, `users/notes`) が fanout タイムライン (Redis) を読まず常にデータベースから取得しており、自分への返信やフォロー中ユーザーの返信 (withReplies) がタイムラインに含まれない・ユーザータイムラインの返信フィルタが効かない問題を修正
- Fix: Hono サーバーで ActivityPub オブジェクトの GET 配信 (`/users/:id`, `/@:username`, `/notes/:id` の AP 表現、outbox、followers/following、featured、publickey) が一切存在せず、リモートサーバーからこのサーバーのユーザーやノートを照会できなかった問題を修正
- Fix: Hono サーバーでユーザー・ノート・Pages・Play・クリップ・ギャラリーの各ページが専用の OGP/meta タグ付き HTML を返さず汎用ページのみ返していた問題、および `/users/:id` が `/@:username` にリダイレクトしなかった問題を修正
- Fix: Hono サーバーでアカウント作成時に `userCreated` の SystemWebhook が送出されなかった問題を修正
- Fix: Hono サーバーで API のエラー応答に `WWW-Authenticate: Bearer ... error="invalid_request"` ヘッダが付与されず、`Authorization` ヘッダのスキーム名 (`Bearer`) の大文字小文字を区別していなかった問題を修正
- Fix: Hono サーバーがビルド済みフロントエンドアセット (`/vite/`, `/embed_vite/`) を配信せず、クライアントが `APP_IMPORT` エラーで一切起動できなかった問題を修正
- Fix: misskey-js の `Stream` が Bun ランタイムで一切接続できなかった問題を修正 (reconnecting-websocket の既定 `binaryType: 'blob'` が Bun の ws 互換実装で例外になるため、テキスト専用プロトコルで安全な `'arraybuffer'` を既定に変更)
- Fix: Bun ランタイムで外部リクエスト (`HttpRequestService`) の private アドレスブロック (SSRF 対策) が一切機能していなかった問題を修正。Bun の `node:http` 互換レイヤーはカスタム `http.Agent.createConnection` を呼ばないため、`node-fetch` の `agent` オプション経由の socket レベル遮断が無効化されていた。宛先ホスト名を送信前に DNS 解決して private/非ユニキャストアドレスを遮断する事前チェックに変更し、あわせて `node-fetch` をグローバル `fetch` に置き換えて本番依存から除去 (レスポンスサイズ上限も自前実装で維持)
