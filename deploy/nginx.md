# nginx の設定

Misskey は HTTP/1.1 を平文で待ち受けるだけなので、HTTPS・HTTP/2 は前段のリバースプロキシで付けます。設定例は [`nginx.conf.example`](nginx.conf.example) です。

1. nginx と certbot を入れ、証明書を取得します。

   ```sh
   sudo apt install nginx certbot
   sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/misskey.conf
   # example.tld を公開するドメインに置き換える
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot certonly --webroot -w /var/www/html -d example.tld
   ```

   証明書を取得するまでは 443 の `server` を読み込めないので、初回だけ 443 のブロックを外して 80 だけで起動し、取得後に戻します。更新は certbot のタイマーが行います。更新後に nginx へ読み込ませるには `--deploy-hook "systemctl reload nginx"` を付けます。

2. `.config/default.yml` の `url` を `https://example.tld` にします。nginx が同じホストにあれば、`server.reverseProxy.trustedNetworks` はデフォルトのまま (`127.0.0.1/32` を含む) で、`X-Forwarded-For` から接続元の IP を読みます。

3. ファイアウォールで TCP 80・443 を開けます。アプリの 3000 番は外に開けません (`compose.example.yml` は `127.0.0.1` だけで待ち受けます)。

## 設定例で決めていること

- **アプリへの接続を使い回す**: `upstream` の `keepalive` と、通常のリクエストで `Connection` を空にする `map`。`Connection: close` を送るとリクエストごとに TCP をつなぎ直します。
- **ストリーミング**: `/streaming` の WebSocket に `Upgrade` を渡します。アプリが ping を送るので、nginx のデフォルトのタイムアウト (60 秒) で切られません (100 秒放置後も受信できることを確認)。
- **アップロード上限**: `client_max_body_size` はアプリの `server.http.maximumRequestBodySize` (デフォルト 251MiB) と同じにします。nginx のデフォルト 1MB のままだと、それを超える添付が 413 になります。
- **一時ファイルを使わない**: `proxy_request_buffering off` と `proxy_buffering off` で、アップロードと大きい応答を nginx の一時ファイルに書かずに流します。SD カードのような書き込みの遅いストレージで、同じ内容を 2 回書かないためです。
- **接続元の IP**: `X-Forwarded-For` はクライアントが送った値を捨て、接続元で上書きします。IP ごとの回数制限はこの値で数えます。CDN を前に置く場合は、CDN から来た値だけを残すよう書き換えてください。
- **圧縮と HSTS はアプリ側**: nginx で gzip を重ねません。`Strict-Transport-Security` はアプリが `server.http.hsts` (デフォルト true) に従って付けます。

## HTTP/3

`nginx.conf.example` のコメントにある 3 行を有効にし、UDP 443 を開けると使えます。デフォルトでは無効にしています。ラズパイ相当の枠で測った初回表示 (ログイン済み、往復 150ms・1.6Mbps) は次のとおりで、損失のない回線では差がなく、損失 2% では nginx の HTTP/3 がばらつきました。

| 回線 | HTTP/2 | HTTP/3 |
|---|---|---|
| 往復 150ms・1.6Mbps | 3.3 秒 | 3.2 秒 |
| 同 + 損失 2% | 3.3〜4.8 秒 (中央 3.8) | 3.2〜7.7 秒 (中央 4.7) |

同じ条件で Caddy とも比べました。表示速度は同等で、nginx のほうが CPU (API 1 件あたり 0.20ms 対 0.49ms) とメモリ (8〜11MiB 対 24〜35MiB) が軽くなります。
