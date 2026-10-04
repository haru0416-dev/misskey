# 連合テスト

Docker の中に 2 台のサーバー(`a.test` と `b.test`)を立てて、ActivityPub の連合を実際の通信で確かめるテストです。TLS、nginx、inbox、ジョブキューまでを通ります。

- `a.test` は、常にこのチェックアウトのコードです。
- `b.test` の相手は、環境変数 `FEDERATION_PEER_B_KIND` で選びます。`fork` は `a.test` と同じコード、`upstream` は独立してビルドされた公式の Misskey です。
- `fork` と `upstream` は、別々の実行(セル)として行います。同じシナリオを、`a.test` から `b.test` への向きと、`b.test` から `a.test` への向きの両方で実行します。

同じ fork どうしのテストが通っても、独立した実装との互換性の証明にはなりません。そのため、upstream の相手との実行を別に持っています。

## 構成

| ファイル | 内容 |
| --- | --- |
| `test/*.test.ts` | シナリオ。`acceptance.test.ts` と `resilience.test.ts` が、連合の主な挙動と、障害からの回復を確かめる |
| `test/utils.ts` | ヘルパー(管理者の用意、アカウントの作成、配送の完了待ち、署名付きリクエスト、障害の注入) |
| `compose.matrix.yml` | 2 台のサーバー、DB、Valkey、nginx、障害を注入するプロキシ、テストの実行役(`tester`)の構成 |
| `compose.matrix.fork.yml` `compose.matrix.upstream.yml` | `b.test` の相手の定義 |
| `upstream.json` `upstream.config.yml` | 固定した公式 Misskey の識別情報と、その設定 |
| `known-upstream-failures.json` | upstream の実装側の不具合で、いま失敗する既知のシナリオ |
| `fault-proxy.ts` | inbox への配送に、障害を起こすプロキシ |
| `setup.sh` | テスト用の CA と証明書、各サーバーの設定の生成 |
| `results/` | 実行の結果の出力先。git では追跡しない |
| `compose.yml` `compose.a.yml` `compose.b.yml` `compose.tpl.yml` | 旧来の、fork どうしの 2 台の構成。`compose.matrix.yml` が、`tester` と共通の定義を使う |

署名やキューの観測には、DB への私的な接続が要ります。障害を注入するテストには、`FEDERATION_FAULT_URL` が要ります。どちらも `compose.matrix.yml` が用意するので、すべてのシナリオを動かすには `compose.matrix.yml` を使ってください。

## 保証の範囲

公式の upstream は、`upstream.json` で、Misskey の特定のリリース、コミット、コンテナイメージのダイジェストに固定しています。`latest` は使いません。固定しているのは相手の身元で、互換性の結果ではありません。

結果が保証するのは、成功した実行が対象にした、リビジョンと送信の向きだけです。実行していないテスト、前提の不足、タイムアウト、失敗、スキップは、区別して扱います。

## 準備

必要なものは次のとおりです。

- ルートの `.bun-version` と同じ Bun
- Docker Engine と、`include` と `extends` が使える Docker Compose(2.20 以上)
- OpenSSL

Docker のサブネットとして `172.20.0.0/16`(連合用)と `10.231.0.0/22`(DB、インターネット、デフォルトの各ネットワーク)を使います。2 つのセルを、同じ Docker デーモンで同時に動かさないでください。CI では別々のランナーで動かします。Compose はネットワークを並行して作るので、自動で割り当てられるネットワークが `172.20.0.0/16` を先に取らないよう、すべてのネットワークに明示的なサブネットを指定しています。ホストのポートは公開しません。

リポジトリのルートで、次の順に実行します。

```sh
bun install --frozen-lockfile
bun run --filter slacc build
bun run build-pre
bun run build:backend-deps
bun run --bun --filter backend build
export BUN_VERSION="$(cat .bun-version)"
cd packages/backend/test-federation
bash ./setup.sh
```

`setup.sh` は、テスト用の CA と、各サーバーの証明書、サーバーごとの設定を作り直します。実行する前に、このチェックアウトを使っているサーバーをすべて止めてください。CI の新しい証明書では、upstream のイメージの非 root のユーザーが鍵を読めるよう、`chmod 644 certificates/*.test.key` が要ります。これらはテスト専用の鍵です。本番の認証情報や鍵を、この構成に入れないでください。テストの設定ファイルは、`tester` のコンテナに `/misskey/.config/test.yml` としてマウントします。リポジトリの `.config/test.yml` は変更しません。

## 実行

セルごとに、順番に、新しいプロジェクト名で実行します。

```sh
export FEDERATION_PEER_B_KIND=fork  # 終わったら upstream でも繰り返す
export COMPOSE_FILE=compose.matrix.yml
export COMPOSE_PROJECT_NAME=federation-fork  # upstream では別の名前にする

docker compose config
docker compose up -d --wait --wait-timeout 240 --scale tester=0
docker compose run --no-deps --rm tester
```

1 つのファイルだけを動かすときは、同じ環境と構成のまま、`tester` にコマンドを渡します。

```sh
docker compose run --no-deps --rm tester bun run --bun --filter backend test:fed test-federation/test/acceptance.test.ts
```

結果は `results/<相手の種類>.json` に出力されます。あとで再現できるよう、次の記録も一緒に残します。CI は、セルが失敗しても、これらをアップロードします。

- `git rev-parse HEAD`
- `docker compose config`
- `docker compose images --format json`
- `upstream.json`
- テストの終了コード
- `docker compose logs --no-color`(`docker compose down` の前に取る)

実行したプロジェクトのテストの状態を捨てるときは、そのプロジェクトの環境変数のまま `docker compose down --volumes` を実行します。既存のデプロイに向けて実行しないでください。

## 合否の判定

fork のセルは、すべてのシナリオが成功したときだけ合格です。

upstream のセルは、テストの失敗をそのまま残したうえで、`scripts/check-federation-known-failures.mjs` が、結果と `known-upstream-failures.json` を突き合わせて合否を決めます。次のどれかに当たると、セルは失敗です。

- 一覧にない失敗がある。
- 一覧にある失敗が、成功した、または結果に現れない(一覧と、この README を直す)。
- スキップまたは todo のシナリオがある。
- シナリオの外でスイートがエラーになった。
- 結果のファイルが書かれていない。

upstream の既知のエラーは、機能として失敗した結果のままです。そのエラーを再現できても、互換性が確かめられたことにはなりません。期待される失敗として包んだり、スキップしたり、アサーションを弱めたりしないでください。公式の相手には手を加えません。

`results/upstream-identity.json` は、固定した相手の識別情報の記録です。テストのレポーターが上書きしてはいけません。

### いまの既知の失敗

原因は、いずれも upstream の受信側にあります。詳しい理由は `known-upstream-failures.json` にあります。

- Move で、upstream 側にある移行先を指定したとき。公式の受信側が、移行先の `uri`(null になりうる)と、正規の actor の URI を比べる。
- ブロックを解除したあとの Follow と Reaction。公式の HTTP プロセスのブロックのキャッシュが、DB の行と Redis のキャッシュが消えたあとも残る。
- 凍結を解除したあとの Follow。公式の API が、削除済みのユーザー ID を通して actor を引き、古いプロフィールを組み立てられずに失敗する。

## テストの仕組み

### 相手の違いの吸収

`hostKind()` が、ホストが fork か upstream かを返します。upstream の管理者の用意は、明示したセットアップのパスワードで行います。どちらの相手も、同じ形の `signin-flow` の応答を返し、アカウントの作成には、管理者の API が返したトークンを使います。プロトコルの操作は、ドライバ側で置き換えません。

テストの管理用のデーモンが、fork のサインインのレート制限を消す処理は、テスト専用です。upstream では、サポートされているテスト用の設定(`enableIpRateLimit: false`)を使います。

内部のエンティティ全体を比べる代わりに、`assertNoteContent`、`assertUserProfile`、`assertAttachment` が、外から観測できるノート・プロフィール・添付の内容を比べます。

### 配送の完了待ち

`deliveryBarrier(senderHost)` は、次をすべて観測して、配送が落ち着いたことを確かめます。

- 両方のサーバーの deliver、inbox、db、relationship の各キューの件数(遅延しているジョブも含む)
- fork の outbox の状態(`deadLetter` があれば失敗にする)
- 障害を注入するプロキシで処理中のリクエスト

受信側の処理が終わったあとに、送信側をもう一度確かめます。受信側の処理の失敗で再試行を待っている inbox のジョブがあると、バックオフを待たず、そのジョブの内容と理由を付けてすぐに失敗にします。現在のテストファイルより前に作られたジョブは、前のファイルの結果として扱い、待ち直しません。

受信側の状態のアサーションは、完了待ちのあとに行います。HTTP の 202 だけで、最終的な効果が出たとは判断しません。ポーリングの間隔が空いても、何も起きなかったことの証明にはなりません。

障害からの回復のテストは、送信側の遅延した deliver のジョブを `admin/queue/promote-jobs` で前倒しします。同じジョブが再試行されるので、再配送と冪等性を確かめたまま、バックオフの待ち時間だけを省けます。本番の再試行のスケジュールは変えません。そのため、回復のテストは 8 分、キューの完了待ちは 6 分を上限にします。

fork の永続的な配送の失敗、dead-letter、アカウント削除の調整役は、`test/unit/queue/{deliver,queue-outbox,delete-account}.test.ts` が守ります。連合のテストでは代わりになりません。

### 署名付きのリクエスト

`signedRequest()` は、署名する側のアクターの本物の鍵を、隔離した相手の DB から読み、通常の RSA の HTTP 署名つきのリクエストを、TLS、nginx、inbox を通して送ります。鍵を変更せず、本番の署名用のエンドポイントも作りません。署名後の本文、アクター、ID、Host の改変と、正しく署名された、アクターと ID の食い違いは、別のケースです。

### 障害の注入

`fault-proxy.ts` は、inbox への POST だけを転送します。制御用の待ち受けは、Docker の私的なネットワークからしか届かず、ホストのポートも Docker のソケットも使いません。

| モード | 動作 |
| --- | --- |
| `outage` | 転送せずに 503 を返す |
| `response-loss` | 相手が受け付けた成功の応答を読み捨て、送信側へ向かうソケットを閉じる。nginx と送信側からは通信の失敗に見えるが、相手は活動を受け付けている |

テストは、`response-loss` で成功した転送が 2 回あり、実際に再試行されてから、通常の配送に戻します。`pass` に戻しても、カウンタは保たれます。新しい障害を始めると、リセットされます。障害の絞り込みは、宛先と活動の種類で選ぶため、ファイルは直列に動かします。

## 確かめる項目とテスト

| 確かめること | テスト |
| --- | --- |
| 独立した固定の相手、fork どうし、状態と成果物の分離 | `compose.matrix.yml`、`compose.matrix.{fork,upstream}.yml`、`upstream.json`。CI の 2 つの独立したセル |
| 2 つの送信の向きで、同じ意味になること | `acceptance` と `resilience` の `describe.each`。相手の種類ごとの JSON のレポート |
| actor の解決 | `acceptance`: `resolves the actor by handle and canonical URI...` |
| Follow、Accept、Undo | `acceptance`: `locked Follow remains pending until explicit Accept...` |
| 添付と返信 | `acceptance`: `delivers attachments and replies...`。既存の drive・note の各ケース |
| Reaction と Undo | `acceptance`: `Reaction and Undo converge...` |
| Announce、Undo、Delete | `acceptance`: `Announce and Undo remove only the renote...`。既存のノート削除のケース |
| プロフィールの Update | `acceptance`: `profile Update changes the cached remote actor...` |
| Move、alias、フォロワーの移行 | `acceptance`: `Move honors destination alias and transfers local and remote followers`。source の移行先、local/remote の関係と正規 URL を同じ移行シナリオで確認 |
| すべての公開範囲、許可された宛先と拒否された宛先、署名つきと署名なしの取得、outbox、featured | `acceptance`: `%s preserves allowed delivery...`、`outbox pagination retains public/home notes...` |
| 非公開の親を露出しないこと | `acceptance`: `reply visibility and public collections never expose an inaccessible parent or attachment`、`specified reply reaches its own recipient...` |
| 正しい署名と、改変された署名が、最終的な副作用を生まないこと | `resilience`: 正しい署名の GET と POST、`%s causes no final side effect...` |
| 一時的な障害と、応答の喪失からの収束 | `resilience`: `outage` と `response-loss`。それぞれ `Note`、`Follow`、`Reaction`、`Delete` を、両方の向きで |
| 何も起きなかったことは、進行と最終状態で示す | キュー、outbox、プロキシの観測。正確なリモートのノート、リアクション、フォロワー、削除の確認 |

CI は、ロックファイル、Bun のバージョンと設定、ルートの manifest、パッチ、ネイティブの slacc、backend の依存、ビルドのスクリプトが変わったときにも、このテストを動かします([.github/workflows/test-federation.yml](../../../.github/workflows/test-federation.yml))。
