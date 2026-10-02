# SonarQube のローカル解析

oxlint では見つけにくい種類の問題を、SonarJS で調べるためのローカル環境です。見つけるのは、認知的複雑度、重複したコード、コピー&ペーストされた関数、到達できない分岐、セキュリティ上の hotspot です。CI には組み込んでいません。

解析の対象は、リポジトリのルートにある [`sonar-project.properties`](../../sonar-project.properties) で定義しています。

## 前提

- Docker と Docker Compose
- 空きメモリ 3GB ほど(Elasticsearch、Web、Compute Engine が常駐します)
- ホストの `vm.max_map_count` が 524288 以上(Elasticsearch の要件です)

SonarQube は `127.0.0.1:9000` にだけ待ち受けます。Docker の `-p` は、ufw などのホストのファイアウォールの設定を通りません。外部に公開したいときも、ポートは開けず、Tailscale か SSH のポートフォワードを使ってください。

```sh
ssh -L 9000:127.0.0.1:9000 <サーバー>
```

## 起動

```sh
docker compose -f dev/sonarqube/compose.yml up -d
```

初回の起動には 2 分ほどかかります。次のコマンドは、`{"status":"UP"}` になるまで待ちます。

```sh
until curl -sf http://127.0.0.1:9000/api/system/status | grep -q '"status":"UP"'; do sleep 5; done
```

## 認証情報

認証情報は `dev/sonarqube/.env` に置きます。ファイルの権限は 600 にします。`.gitignore` に入っているので、コミットされません。初回に、次の手順で用意します。

```sh
# 1. 初期パスワード(admin/admin)を変更する。SonarQube は、大文字・小文字・数字・記号を要求する
curl -sf -u admin:admin -X POST http://127.0.0.1:9000/api/users/change_password \
  --data-urlencode login=admin \
  --data-urlencode previousPassword=admin \
  --data-urlencode "password=$NEW_PASSWORD"

# 2. スキャナ用のトークンを発行する
curl -sf -u "admin:$NEW_PASSWORD" -X POST http://127.0.0.1:9000/api/user_tokens/generate \
  --data-urlencode name=misskey-local-scanner
```

出力された値を、`.env` に `SONARQUBE_ADMIN_PASSWORD` と `SONAR_TOKEN` として保存します。

## 解析する

```sh
bun run lint:sonar
```

実体は [`scripts/sonar-scan.sh`](../../scripts/sonar-scan.sh) です。sonar-scanner-cli をコンテナで実行するので、ホストに Java やスキャナを入れる必要はありません。SonarQube が起動していなければ、自動で起動して待ちます。

結果は http://127.0.0.1:9000/dashboard?id=misskey で見られます。

## 有効にするルールの調整

このリポジトリでノイズや誤検出になるルールは、理由を付けて [`rule-overrides.json`](rule-overrides.json) に並べてあります。`Sonar way` を複製した `Misskey way` のプロファイルから、そこに挙げたルールだけを外す方式です。いまは 0 件のルールも有効のまま残るので、将来の退行を検出できます。

JSON を編集したら、次のコマンドで SonarQube に反映して、再度スキャンします。

```sh
bun run lint:sonar:profile  # プロファイルへ適用する。サーバー側の状態を書き換える
bun run lint:sonar          # 再スキャン
```

無効にするほどではなくても、特定の種類のファイルでだけ誤検出するルールは、`sonar-project.properties` の `sonar.issue.ignore.multicriteria` で絞ります。プロファイルからは外しません。

## 停止と破棄

```sh
docker compose -f dev/sonarqube/compose.yml stop     # 常駐しているメモリを解放する
docker compose -f dev/sonarqube/compose.yml down -v  # 解析の履歴ごと破棄する
```

再起動後は、自動では復帰しません。
