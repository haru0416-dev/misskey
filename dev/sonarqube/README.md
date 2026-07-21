# SonarQube (SonarJS) ローカル解析

oxlint では拾えない種類の問題 — 認知的複雑度、重複コード、コピペ関数、到達不能な分岐、
セキュリティ hotspot — を SonarJS で検出するためのローカル環境。CI には組み込んでいない。

解析対象の定義はリポジトリルートの [`sonar-project.properties`](../../sonar-project.properties)。

## 前提

- Docker / Docker Compose
- 空きメモリ 3GB 程度 (Elasticsearch + Web + Compute Engine の常駐分)
- `vm.max_map_count >= 524288` (このVPSは 1048576 で設定済み)

サーバーは `127.0.0.1:9000` にのみバインドしている。Docker の `-p` は ufw を素通りするため、
外部公開したい場合でもポートを開けず Tailscale か SSH ポートフォワードを使うこと。

## 起動

```sh
docker compose -f dev/sonarqube/compose.yml up -d
```

初回起動は 2 分ほどかかる。`{"status":"UP"}` になるまで待つ:

```sh
until curl -sf http://127.0.0.1:9000/api/system/status | grep -q '"status":"UP"'; do sleep 5; done
```

## 認証情報

`dev/sonarqube/.env` (mode 600 / gitignore 済) に置く。初回のみ以下で初期化する:

```sh
# 1. 初期パスワード admin/admin を変更 (SonarQube は大小英字・数字・記号を要求する)
curl -sf -u admin:admin -X POST http://127.0.0.1:9000/api/users/change_password \
  --data-urlencode login=admin \
  --data-urlencode previousPassword=admin \
  --data-urlencode "password=$NEW_PASSWORD"

# 2. スキャナ用トークンを発行
curl -sf -u "admin:$NEW_PASSWORD" -X POST http://127.0.0.1:9000/api/user_tokens/generate \
  --data-urlencode name=misskey-local-scanner
```

生成された値を `.env` に `SONARQUBE_ADMIN_PASSWORD` / `SONAR_TOKEN` として保存する。

## 解析

```sh
bun run lint:sonar
```

実体はリポジトリルートの [`scripts/sonar-scan.sh`](../../scripts/sonar-scan.sh)。
sonar-scanner-cli をコンテナで走らせるので、ホストに Java や scanner を入れる必要はない。

結果は http://127.0.0.1:9000/dashboard?id=misskey で確認する。

## 有効ルールの調整

このリポジトリでノイズ・誤検出になるルールは [`rule-overrides.json`](rule-overrides.json) に理由付きで
列挙してある。`Sonar way` を複製した `Misskey way` プロファイルからそれらだけを落とす方式なので、
**現状 0 件のルールは有効なまま残り、将来の退行を検出できる**。

JSON を編集したら反映する:

```sh
bun run lint:sonar:profile   # プロファイルへ適用 (サーバー側の状態を書き換える)
bun run lint:sonar           # 再スキャン
```

無効化するほどではないが特定のファイル種別でだけ誤検出するものは、プロファイルではなく
`sonar-project.properties` の `sonar.issue.ignore.multicriteria` で絞る。
リモートから見る場合は SSH ポートフォワード:

```sh
ssh -L 9000:127.0.0.1:9000 <this-vps>
```

## 停止 / 破棄

```sh
docker compose -f dev/sonarqube/compose.yml stop          # 常駐メモリを解放
docker compose -f dev/sonarqube/compose.yml down -v       # 解析履歴ごと破棄
```
