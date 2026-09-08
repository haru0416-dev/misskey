# Capの設定

Cap StandaloneはMisskeyとは別サービスとして動かします。mCaptchaのキーは使用できません。

1. 管理用のランダムなキーを`CAP_ADMIN_KEY`環境変数に設定し、起動します。

   ```sh
   export CAP_ADMIN_KEY="$(openssl rand -hex 32)"
   docker compose -f deploy/compose.cap.yml up -d
   ```

   再作成時にも同じキーを環境変数で渡してください。Capのサイトキー・設定・トークンは専用Valkeyの`cap-data`ボリュームに保存します。

2. `127.0.0.1:7493`へHTTPSリバースプロキシを設定し、ブラウザとMisskeyサーバーの両方からアクセスできるURL（例: `https://cap.example.com`）を用意します。プロキシから送る`X-Forwarded-For`は接続元IPで上書きしてください。

3. Capの管理画面で`CAP_ADMIN_KEY`を使ってログインし、サイトキーとシークレットキーを発行します。サイトキーの許可originにはMisskeyの公開originを設定します。

4. Misskeyの「コントロールパネル → セキュリティ → Botプロテクション」でCapを選び、サーバーURL・サイトキー・シークレットキーを入力します。プレビューの検証を完了して保存してください。

ComposeはCap 3.1.11、ウィジェット0.1.57、WASM 0.0.7を指定しています。`ENABLE_ASSETS_SERVER=true`が必要です。ブラウザはCapの`/assets/widget.js`と`/assets/cap_wasm_bg.wasm`を読み込み、`/<サイトキー>/challenge`と`/<サイトキー>/redeem`へ接続します。Capサーバーは起動時に配信用資産を取得するため、外向きのネットワーク接続が必要です。

Misskeyは`/<サイトキー>/siteverify`でトークンを検証します。Capウィジェットへシークレットキーは渡しません。登録・ログイン・設定保存ごとに新しいトークンが必要です。

mCaptchaから更新する際は旧キーと旧URLが削除されます。CAPTCHAの有効状態は維持されるため、Capの設定を完了するまでCAPTCHAを必要とする登録・ログインは通りません。更新前に管理者セッションを確保してください。

CapのAPI仕様: https://trycap.dev/guide/standalone/
