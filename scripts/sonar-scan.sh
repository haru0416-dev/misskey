#!/usr/bin/env bash
# SonarQube (SonarJS) 解析を sonar-scanner-cli コンテナで実行する。
# セットアップと結果の見方は dev/sonarqube/README.md を参照。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo_root/dev/sonarqube/.env"
compose_file="$repo_root/dev/sonarqube/compose.yml"

if [ ! -f "$env_file" ]; then
	echo "error: $env_file がありません。dev/sonarqube/README.md の「認証情報」を実施してください。" >&2
	exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

if [ -z "${SONAR_TOKEN:-}" ]; then
	echo "error: SONAR_TOKEN が $env_file に定義されていません。" >&2
	exit 1
fi

if ! curl -sf http://127.0.0.1:9000/api/system/status | grep -q '"status":"UP"'; then
	echo "SonarQube が起動していません。起動して UP になるまで待機します..."
	docker compose -f "$compose_file" up -d
	until curl -sf http://127.0.0.1:9000/api/system/status 2>/dev/null | grep -q '"status":"UP"'; do
		sleep 5
	done
fi

# コンテナ内から SonarQube へは compose のネットワーク経由で到達する
network="$(docker compose -f "$compose_file" ps --format '{{.Name}}' sonarqube | head -1 | xargs -r docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"

# SonarJS のアナライザは sonar.exclusions を無視してプロジェクト全体を走査するため、
# federation テストが残す root 所有のコンテナボリュームで EACCES になる。
# 空の tmpfs を被せて隠す (ホスト側のデータには触れない)。
exec docker run --rm \
	--network "$network" \
	-u "$(id -u):$(id -g)" \
	-e SONAR_HOST_URL=http://sonarqube:9000 \
	-e SONAR_TOKEN="$SONAR_TOKEN" \
	-e SONAR_USER_HOME=/tmp/.sonar \
	-v "$repo_root:/usr/src" \
	--tmpfs /usr/src/packages/backend/test-federation/volumes \
	sonarsource/sonar-scanner-cli "$@"
