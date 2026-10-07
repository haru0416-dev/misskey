# 文書の監査結果

69 文書を確認し、記載をソース、変更履歴、公開設定と比べました。**初回起動、旧 DB の更新、非公開の脆弱性報告先には修正が必要です。** 文体を整える前に、利用者や開発者の操作を誤らせる説明を直す必要があります。

## 対象

監査したソースの revision は `51a7eaa5a46544d0a51909a1a0132d03d326b279` です。追跡された文書候補 71 件のうち、API Extractor の生成レポートと endpoint の snapshot 2 件は文章の校正対象から除きました。残る 68 文書に、既知の非公開調査メモ 1 件を加えています。追跡対象外で ignore されていない文書はありませんでした。

生成された指示文書 6 件は、元の文書との一致を検査しています。ビルド成果物や依存パッケージ内のコピー、アップロードされた利用者のデータ、本番設定の秘密情報は対象にしていません。非公開メモの本文と再現条件は、この報告へ転記していません。

この会話では `CHANGELOG.md` と `packages/frontend/src/README.md` への AI の編集を確認できます。ほかの文書については、Git の著者名や文体だけから AI の関与を決めていません。出所が不明な文書も読んだため、AI が書いた文書だけを推測で選んで除くことはしていません。

## 起動と更新

`README.md:30-38` は起動コマンドの後に設定の準備を説明しています。初回の環境では `.config/docker.env` がまだなく、Compose の設定を読み込めません。文書の Compose 定義を一時ディレクトリへコピーし、`docker compose ... config --quiet` を実行したところ、終了コードは 1、理由は `docker.env not found` でした。コンテナの起動や DB の変更は行っていません。

`README.md:38` と `CONTRIBUTING.md:66` は、追跡されていない `.config/default.yml` とローカルのポート番号を配布済みの設定として説明しています。設定例のコピー、DB の認証情報、ホストで実行する Bun に渡す環境変数を、起動コマンドより前に案内する必要があります。Compose の `env_file` は、ホストのシェルへ環境変数を設定しません。

`CHANGELOG.md:24` の「既存 DB の migration 履歴と更新経路を保持」は、現在の journal と一致しません。journal は `0000_init` と `0001_plain_cerise` の 2 件で、現在の runner に旧履歴を新しい baseline へ移す処理はありません。旧 DB への適用試験は行っていませんが、更新経路を保持するという説明は現行ソースで裏付けられません。同じ Note の Bun 1.4.0 と Docker 1.4.0 系も、現在の 1.4.2 に合わせる必要があります。

## 非公開の報告先

`SECURITY.md:8-13` は GitHub の非公開報告を案内していますが、公開 API は `{"enabled":false}` を返しました。確認先は <https://api.github.com/repos/haru0416-dev/misskey/private-vulnerability-reporting> です。案内された機能を、外部の発見者が使える状態にする必要があります。

非公開報告を有効にするか、管理者が承認した別の非公開連絡先を記載する必要があります。今回、GitHub の設定は変更していません。通常の Issue や PR に詳細を書かないという指示は維持します。

## 実装の説明

backend の API 追加手順には、投げるエラーが `meta.errors` に型で制約されるという説明があります。実際に型付けされるのは戻り値とエラーの factory です。任意の `throw` まで TypeScript が制約する説明にはできません。`requiredRolePolicy` についても、匿名利用者を基本ポリシーで判定する処理と、管理者ロールの許可が文書から抜けています。

frontend の query README は、`QueryCacheView` が使用中だけ observer を持つと説明しています。実装は生成時から `dispose()` まで cache の変更を購読します。observer を持つのは別クラスの `QueryBackedCache` で、初回の取得で有効になるしくみです。`useInfiniteQuery` のページ数制限や、型検査の対象を説明する箇所にも限定が必要です。

連合テスト README の 172 行は、正常な署名も副作用を生まないと読めます。テストは改変した署名を拒否した後、正常な POST による reaction を確認しています。e2e のファイル名、初回だけ行う migration、DB runtime と複数の pool の違いにも、現在の実装に沿った補足が必要です。

## 運用とパッケージ

nginx の手順は設定キーを `url` としていますが、現行の設定は `instance.url` です。60 秒の ping によってデフォルトの 60 秒 timeout で切断されないという説明も、タイマーの遅延を含む保証にはできません。証明書を用意する順序、必要な nginx の版と module も補足が必要です。

SDK の文書には、型テストが `tsd` で動く説明、すべての失敗が `APIError` になる説明、namespace import では tree shaking できない説明があります。現在の型テストは TypeScript の型検査です。通信や JSON 解析の失敗は `APIError` に限りません。実際の SDK を Bun 1.4.2 で browser 向けに bundle した小さな例では、静的な namespace 参照と named import は同じ 129 B になりました。すべての bundle で同じになるという測定ではありません。

i18n の `watch` と `verify`、アイコンの全フォントへの fallback、Sonar の環境変数と無効にしたルール、MiAuth の承認と token の取得、API generator の出力コピーにも説明の不足を確認しました。各文書の確認範囲と訂正候補は、この報告の確認一覧に記載しています。

## 文体

69 文書で Japanese writing の lint と文末検査を実行しました。機械検査の候補は WARN 70 件、INFO 29 件、NOTE 155 件です。生成された指示のコピーも含む件数で、固有の誤りの数ではありません。

`CONTRIBUTING.md` の点数は 12/100 でした。ただし、英語のコード導入に使うコロンにも警告が出ています。英語の書式、手順の箇条書き、指示文書の常体を、一律に日本語の記事の形へ変える必要はありません。常体と敬体が混在する日本語の節、長い変更内容の列挙、「2 つの権威」「正本」などは修正候補です。AI が書いたかどうかを、この点数から判定していません。

今回 AI が追加したスタイルの節にも補足が必要です。MFM の keyframe 名は `global-tada` と `mfm-*` を区別します。Vite の通常の asset と、固定名で出力して本番では HTML に埋め込む boot loader も分けて説明します。文書は未編集のため、修正前後の点数比較は行っていません。

## 根拠と未確認事項

nginx や CHANGELOG の過去の速度、CPU、メモリ、画質の比較には、測定した revision、反復回数、コマンド、元の結果への参照が不足しています。数値を虚偽とは判定していません。ソースの処理変更や回帰テストの成功だけでは、過去の改善率を証明できません。

upstream の変更履歴と AiScript から引き継いだ文章は、AI の誤記とは扱っていません。歴史的な記述を現在の API と比べて削ることもしていません。過去の変更履歴は全体の構造と出所を調べていますが、各リリースのすべての動作を独立に再検証した結果ではありません。

`bun run lint:doc-links` は 67/67 件、`bun run lint:agent-instructions` は生成先 6/6 件の一致を確認しました。リンクが存在することと、リンク先の説明が正しいことは別に確かめています。今回の監査では DB、配信、全 UI の再試験や、過去の benchmark の再測定は行っていません。

監査対象の既存文書、コード、公開設定は変更していません。このファイルは監査結果の保存だけを目的としています。修正は、非公開報告先と起動・更新手順、実装の説明、根拠のない保証、文体の順に進めるのが適切です。


## 確認方法

行番号と実装の説明は、監査した revision の時点のものです。公開設定は監査時の応答であり、後日変更される可能性があります。以下に、再確認に使うソースと確認条件を残します。

| 確認事項 | ソースまたは確認条件 |
| --- | --- |
| 初回の設定準備 | `deploy/compose.local-db.yml` を一時ディレクトリの `deploy/` にコピーし、`.config/docker.env` を用意せず `docker compose -f <一時ディレクトリ>/deploy/compose.local-db.yml config --quiet` を実行。終了コード 1、env file 不在のエラー。コンテナと DB は未操作 |
| 旧 DB の更新説明 | `packages/backend/migration/meta/_journal.json` の 2 件と `packages/backend/src/migration-runner.ts:98-148` を比較。旧 DB への適用は未実行 |
| 非公開の報告先 | 本文の GitHub API を GET。監査時の応答は `{"enabled":false}`。設定変更や報告の送信は未実行 |
| API の型 | `packages/backend/src/server/rest/endpoint-contract.ts:48-74` と API 追加手順を比較 |
| 匿名利用者の policy | `packages/backend/src/core/role/role-policy.ts:281-298` と meta の説明を比較 |
| 購読の寿命 | `packages/frontend/src/query/cache.ts:19-124` の constructor、activate、dispose を比較 |
| 正常な署名 | `packages/backend/test-federation/test/resilience.test.ts:208-243` の拒否と正常 POST の assertion を確認。連合テストの再実行は未実施 |
| namespace import | build 済みの SDK に対する静的な `Misskey.acct.toString` と named import を、それぞれ Bun 1.4.2 の browser target、minify 有効、write 無効で 1 回 bundle。各 129 B、出力一致。速度やすべての bundler の保証は未測定 |
| 指示とリンク | `bun run lint:agent-instructions` と `bun run lint:doc-links` を実行。監査時点で 6/6 件一致、67/67 件のリンクを確認 |
| 日本語 | Japanese writing の lint と文末検査を 69 文書へ実行。生成されたコピーも件数に含め、警告を著者判定や固有の不具合数には使用しない |

実行結果の数字は、サブエージェントの完了報告だけから採っていません。確認コマンドの出力と生成した bundle を確認しています。個別の実装照合を、全 UI や API の動作が正しいという保証にはしていません。

## 文書ごとの確認範囲

公開文書 68 件の確認範囲を示します。「不一致なし」は今回読んだ範囲で指摘がなかったという意味です。各機能の再試験や、過去のすべての数値の証明まで済んだという意味にはしません。非公開調査メモ 1 件は確認数に含めていますが、名前、本文、対象経路、状態、再現条件を掲載しません。

| 文書 | 確認範囲と訂正候補 |
| --- | --- |
| [`.agents/skills/context-budget/SKILL.md`](../.agents/skills/context-budget/SKILL.md) | 生成物として全文または生成元との完全一致を確認。同期検査で 6/6 件が一致。独立の著者判定や手編集は行わない。 |
| [`.agents/skills/creating-issues-and-prs/SKILL.md`](../.agents/skills/creating-issues-and-prs/SKILL.md) | 生成物として全文または生成元との完全一致を確認。同期検査で 6/6 件が一致。独立の著者判定や手編集は行わない。 |
| [`.agents/skills/shipping-misskey-change/SKILL.md`](../.agents/skills/shipping-misskey-change/SKILL.md) | 生成物として全文または生成元との完全一致を確認。同期検査で 6/6 件が一致。独立の著者判定や手編集は行わない。 |
| [`.agents/skills/working-on-backend/SKILL.md`](../.agents/skills/working-on-backend/SKILL.md) | 生成物として全文または生成元との完全一致を確認。同期検査で 6/6 件が一致。独立の著者判定や手編集は行わない。 |
| [`.agents/skills/working-on-frontend/SKILL.md`](../.agents/skills/working-on-frontend/SKILL.md) | 生成物として全文または生成元との完全一致を確認。同期検査で 6/6 件が一致。独立の著者判定や手編集は行わない。 |
| [`.claude/agents/misskey-api-reviewer.md`](../.claude/agents/misskey-api-reviewer.md) | 変更なし推奨。read-only、基準 revision、共通 guard と独自認証の区別、未実行の扱い、情報公開・transaction・再実行のレビュー指示は現行構成と整合。実行や安全の保証ではない。 |
| [`.claude/agents/README.md`](../.claude/agents/README.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/agents/vue-component-reviewer.md`](../.claude/agents/vue-component-reviewer.md) | 読み取り専用、実UI証拠優先、未実行を成功扱いしない指示は整合。router.ts:23-84、di.ts:11-68、query/keys.ts:13-25、store.ts:61-104、useStreamingNotesTimeline.ts:208-295で対象境界を確認。変更推奨なし。 |
| [`.claude/commands/harness-audit.md`](../.claude/commands/harness-audit.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/commands/quality-gate.md`](../.claude/commands/quality-gate.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/commands/README.md`](../.claude/commands/README.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/skills/context-budget/SKILL.md`](../.claude/skills/context-budget/SKILL.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/skills/creating-issues-and-prs/SKILL.md`](../.claude/skills/creating-issues-and-prs/SKILL.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/skills/README.md`](../.claude/skills/README.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/skills/shipping-misskey-change/references/tasks/changelog-update.md`](../.claude/skills/shipping-misskey-change/references/tasks/changelog-update.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/skills/shipping-misskey-change/references/tasks/regenerate-misskey-js.md`](../.claude/skills/shipping-misskey-change/references/tasks/regenerate-misskey-js.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`.claude/skills/shipping-misskey-change/SKILL.md`](../.claude/skills/shipping-misskey-change/SKILL.md) | 元の文書と生成先の同期、全script経路を照合。27行の「元の文書」は語の統一候補。既存の必須検証・送信許可・DB保護条件は維持。 |
| [`.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md`](../.claude/skills/working-on-backend/references/knowledge/api-meta-paramdef.md) | requiredRolePolicy の匿名利用と administrator bypass の説明に確定誤り。その他 guard、validation、res 非実行時検証、undeclared ApiError の注意は source と照合。 |
| [`.claude/skills/working-on-backend/references/knowledge/backend-testing.md`](../.claude/skills/working-on-backend/references/knowledge/backend-testing.md) | e2e include pattern と毎回 migration を行う説明が旧実装。shared pool 説明は現在の二つのプールを明示するとよい。package scripts、ポート隔離、Bun Vitest runner、controller 起動経路を確認。 |
| [`.claude/skills/working-on-backend/references/knowledge/db-models-and-migrations.md`](../.claude/skills/working-on-backend/references/knowledge/db-models-and-migrations.md) | 基本的に変更なし推奨。schema/model/journal の区別、reserved session、advisory lock、check の CREATE 副作用・timestamp-only 判定、forward-only、concurrent index 制約を確認。 |
| [`.claude/skills/working-on-backend/references/knowledge/endpoint-registration.md`](../.claude/skills/working-on-backend/references/knowledge/endpoint-registration.md) | 『JSON API はすべて』は独自認証 JSON routes にもかかる過大一般化。未宣言 ApiError のテスト時 500 は共通エラー例外を省略。category registration、methods、204、errors factory は現行 source を確認。 |
| [`.claude/skills/working-on-backend/references/knowledge/naming.md`](../.claude/skills/working-on-backend/references/knowledge/naming.md) | 変更なし推奨。命名規則は規範として扱い、既存ファイルの例外を直ちに誤記とはしない。user-store 関数名、mfm factory、e2e/unit discovery、CONTRIBUTING の対応見出しを照合。 |
| [`.claude/skills/working-on-backend/references/knowledge/service-architecture.md`](../.claude/skills/working-on-backend/references/knowledge/service-architecture.md) | 『DB 接続を 1 つ』が現在の通常/plan-cache の二 pool 構成を隠す。note/poll/outbox transaction と scheduled draft の row lock・fingerprint 再検証・削除の原子性は source と整合。 |
| [`.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md`](../.claude/skills/working-on-backend/references/tasks/adding-api-endpoint.md) | 『投げるエラーは meta.errors に型で縛られる』は誤り。実装 context.errors の型と任意 throw の保証を区別する必要あり。root SDK generation script の build/OpenAPI/autogen/types pipeline を照合。 |
| [`.claude/skills/working-on-backend/references/tasks/creating-migration.md`](../.claude/skills/working-on-backend/references/tasks/creating-migration.md) | 基本手順は整合。NODE_ENV=test を各コマンドに付ける方針は維持すべきだが drizzle.config.ts は非 test compiled config を固定参照するという補足注意が必要。migrate/check built runner、check の変更副作用、専用 DB・データ保持の強い指示を確認。 |
| [`.claude/skills/working-on-backend/SKILL.md`](../.claude/skills/working-on-backend/SKILL.md) | 変更なし推奨。8 本の参照先と API reviewer への案内を確認。Hono、明示依存、drizzle は現行 source/package と整合。指示の箇条書き・命令文を文章欠陥とは扱わない。 |
| [`.claude/skills/working-on-frontend/references/knowledge/component-catalog.md`](../.claude/skills/working-on-frontend/references/knowledge/component-catalog.md) | package.json:9-15、vite.catalog.config.ts:23-59、vitest.stories.config.ts:60-72、stories.browser.ts:20-150、stories/environment.ts:25-137、seed-account.ts:6-15で配置、runner、fixture、canvas popup、除外storyを照合。記載は整合。実際のplay成功・表示品質は未確認。 |
| [`.claude/skills/working-on-frontend/references/knowledge/component-conventions.md`](../.claude/skills/working-on-frontend/references/knowledge/component-conventions.md) | MkInput.vue:70-116、MkSelect.vue:80-111でgeneric/defineModelを照合。store.ts:61-104、persisted-state.ts:13-58,179-214、preferences.ts:22-59、query/keys.ts:13-25、misskey-api.ts:112-140、useStreamingNotesTimeline.ts:208-295で所有者・分離・終了を確認。新規実装の規範として妥当。操作保証は実行未確認。 |
| [`.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md`](../.claude/skills/working-on-frontend/references/knowledge/frontend-testing.md) | frontend/package.json:11-17、vitest.config.ts:24-76、test/init.ts:6-49、root package.json:28-36,59-61、test-frontend.yml:78-92,118-124,170-176、tests/e2e/playwright.config.ts:8-9,37-38で全コマンドとNode/Chromium分離を照合。happy-dom記載なし。前提・専用DB・既存server注意は妥当。実行はしていない。 |
| [`.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md`](../.claude/skills/working-on-frontend/references/knowledge/i18n-usage.md) | i18n.ts:6-16、shared/utility/i18n.ts:22-79,81-87,102-117,133-179でts/tsx、単純補間、型、診断、非escapeを照合。参照API・テスト専用updateI18nの記載は整合。『切り分け』は文体候補に留め、契約変更不要。 |
| [`.claude/skills/working-on-frontend/references/knowledge/os-api.md`](../.claude/skills/working-on-frontend/references/knowledge/os-api.md) | os.ts:86-134,136-181,212-252,332-368でapiWithDialogの元Promise返却、同期popup、非同期popupAsync、done/closedの分離、取消unionを確認。指示の強さと寿命契約を保持すべき。実UIのfocus復帰は未確認。 |
| [`.claude/skills/working-on-frontend/references/knowledge/scss-modules.md`](../.claude/skills/working-on-frontend/references/knowledge/scss-modules.md) | design-tokens.scss:6-53、style.scss:137-139,273-288、embed/style.scss:19-29,96-99,127-144でトークン・公開alias・focus・_buttonの範囲を照合。固定値の転記を避ける指示は妥当。motion値を一律統合・global classを削除する根拠にはしてはならない。 |
| [`.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md`](../.claude/skills/working-on-frontend/references/tasks/adding-i18n-key.md) | i18n/package.json:17-24でgenerate/build/watchコマンド、frontend/package.json:16でtypecheckを確認。locale source・生成物の役割分離、他言語手動編集禁止、assertionで隠さない規範は整合。Crowdin実配信・画面反映は未実行。 |
| [`.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md`](../.claude/skills/working-on-frontend/references/tasks/adding-mk-component.md) | componentsの実ディレクトリとindex.tsの存在、featuresディレクトリ一覧、boot/entry.ts:18-29、queryと状態実装、catalog/test設定で現行構成を照合。配置規範、全caller移行、実UI確認要求を弱める必要なし。 |
| [`.claude/skills/working-on-frontend/SKILL.md`](../.claude/skills/working-on-frontend/SKILL.md) | 入口8参照、shared/embed/swへの波及範囲、限定的なレビュー委譲は整合。vite.embed.config.ts:19-78で独立bundleを確認。25行の「本体の大半」は定量証拠がないため留保対象。 |
| [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) | 生成物として全文または生成元との完全一致を確認。同期検査で 6/6 件が一致。独立の著者判定や手編集は行わない。 |
| [`.github/pull_request_template.md`](../.github/pull_request_template.md) | 実装事実の誤りなし。What/Why、ローカル確認、catalog/CHANGELOG/tests の条件付き checklist は CONTRIBUTING と整合。二言語コメント・箇条書き・短い指示を文体不良や AI 著作判定として扱わず、変更不要。 |
| [`AGENTS.md`](../AGENTS.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`CHANGELOG.md`](../CHANGELOG.md) | 545 行すべてが Unreleased 配下です。root に過去のリリース節はありません。全文を読み、要件・削除済み機能との衝突・数値・安全性・互換性を分類し、主要境界を現行ソースと照合しました。下記 report に具体的な問題と未確認範囲を記載しています。 |
| [`CLAUDE.md`](../CLAUDE.md) | 参照先と現在のscript、作業の対象、読み取り専用/外部送信/DB安全/検証条件を照合。常体と命令文は指示文書の用途として保持。語の統一と長い列挙は文体候補に限定。 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | 503 行すべて確認済み。要修正: checked-in default.yml、Devcontainer のツールチェーン前提、削除済み ref sugar、Sonar とは無関係な一般実装注意書きの enum/markRaw/index の誤説明。テスト・migration・型生成コマンドは現行 scripts に存在し、設定を保存する ensure-test-config の説明も一致。Cloudflare WARP の一律断定は根拠不足。 |
| [`deploy/cap.md`](../deploy/cap.md) | Compose の Cap/widget/WASM pins、管理キー、Valkey 永続化、widget に secret を渡さないこと、siteverify、保存前の検証を確認。mCaptcha 更新時に旧キー削除・有効状態維持という現在の upgrade 説明は現行 migration で裏付けられず、対象 revision を明記する必要があります。 |
| [`deploy/nginx.md`](../deploy/nginx.md) | 要修正: instance.url の旧キー表記、初回 certbot 手順の順序、nginx バージョン/HTTP3 module の前提、60 秒 ping による60秒 timeout回避の断定、数値比較の再現可能性。XFF 上書き、body limit、loopback 公開、圧縮、HSTS の大筋はソースと一致。 |
| [`dev/sonarqube/README.md`](../dev/sonarqube/README.md) | 要修正: profile コマンドは .env を自動読込しない、NEW_PASSWORD 未定義、password 保存説明、gitignore による非コミット保証の過剰断定、現行 nofile 要件不足、認知的複雑度検出という目的と無効化 profile の不一致。local-only binding、自動起動 scanner、破棄コマンドの副作用表示、CI 非導入は一致。 |
| [`docs/archive/upstream-changelog.md`](../docs/archive/upstream-changelog.md) | 3802 行のアーカイブです。2026.6.0 から 12.86.0 (2021/08/11) まで、全 release heading・外部/相対リンク・異常マーカー・秘密情報候補を検索しました。歴史的な機能契約を HEAD の実装と比較して誤りとする監査は行っていません。 |
| [`locales/README.md`](../locales/README.md) | 日本語だけ手動編集する強い規則と Crowdin mapping は維持。verify が built locale を読むため、編集直後の検査には i18n build が先に必要です。Crowdin 実サービスの同期稼働はリポジトリから証明できず、設定上の流れと実稼働を分けると安全です。 |
| [`packages/aiscript/docs/parser/overview.md`](../packages/aiscript/docs/parser/overview.md) | Scanner と parse の流れを確認。先読みと template 構文の例外に補足が必要です。文章は upstream にもあります。 |
| [`packages/aiscript/docs/parser/scanner.md`](../packages/aiscript/docs/parser/scanner.md) | 先読み、token の消費、遅延した読み取りを確認。変更を求める不一致はありませんでした。 |
| [`packages/aiscript/docs/parser/token-streams.md`](../packages/aiscript/docs/parser/token-streams.md) | template の token 列と解析を確認。TokenStrem は TokenStream の誤記で、upstream にも同じ表記があります。 |
| [`packages/aiscript/docs/README.md`](../packages/aiscript/docs/README.md) | リンクと parser 文書の役割を確認。upstream の言語仕様が fork のすべての拡張を保証するとは扱っていません。 |
| [`packages/aiscript/README.md`](../packages/aiscript/README.md) | 公開 API、license、実行 script を確認。start と parse の作業ディレクトリと build の前提に補足が必要です。 |
| [`packages/backend/migration/_legacy/README.md`](../packages/backend/migration/_legacy/README.md) | 変更なし推奨。実際に up/down JavaScript が存在し、現行 runner は journal SQL のみ読む。『含まれる』は legacy 適用後の最終 schema の統合という意味なら妥当で、全過去 DDL を現行に再現する意味にはしない。 |
| [`packages/backend/README.md`](../packages/backend/README.md) | Bun/Hono/drizzle/BullMQ、process budget、queue cleanup 数値・権限を照合。initial SQL の『種別順』説明は実際の table/index 交互構成と不一致。migration 実行の副作用と既存 schema 拒否の実装表現には補足余地。 |
| [`packages/backend/src/misc/prelude/README.md`](../packages/backend/src/misc/prelude/README.md) | 変更なしでも機能概要は真。ただし array.ts の unique/maximum/toArray/toSingle が一覧から漏れる。time/url/xml の関数と Misskey 依存がないことを確認。 |
| [`packages/backend/test-federation/README.md`](../packages/backend/test-federation/README.md) | 正常署名が副作用を生まないという表の誤記、Compose 最低 patch version、鍵 permission/setup の旧説明、CI が終了コードも保存するという過大説明を確認。fork/upstream の分離・digest pin と『結果保証しない』留保は正しい。local upstream report は note 12 ケース限定で全体互換性を証明しない。 |
| [`packages/frontend/builder/README.txt`](../packages/frontend/builder/README.txt) | 1行の記載した3Vite入口・stories設定・boot-loader・locale inlinerは存在。Vite8設定はrolldownOptionsなので『Vite/rollup plugins』は旧用語として修正候補。 |
| [`packages/frontend/src/features/README.md`](../packages/frontend/src/features/README.md) | 表の39機能名を実際のfeatures子ディレクトリ一覧と照合し、追加漏れ・不存在なし。配置と依存は規範文として読める。既存の直接内部importがあることだけで規範を誤りと判定しない。変更推奨なし。 |
| [`packages/frontend/src/query/README.md`](../packages/frontend/src/query/README.md) | query/api.ts、keys.ts、client.ts、cache.ts、updates.ts、streaming.ts、account-caches.ts、misskey-api.ts、paginator.ts、query.browser.test.tsを照合。35行のQueryCacheView observer説明は誤り。43行のuseInfiniteQuery機能限定は過剰。31行の型保証はemoji prefix例外がある。27行の4 endpoint制限は自動misskeyApiキャッシュに限定して読む必要あり。 |
| [`packages/frontend/src/README.md`](../packages/frontend/src/README.md) | 83行のlibはnirax.tsのみ、components直下はindex.tsのみ、7分類、boot/router/store/preferences入口を照合。75-83行のAI参加が会話で証明されたstyle節も独立照合。providerはmixinのみ、main/embed独立、:is specificity、error内容更新とstyle一度挿入は支持。asset hash説明はloader例外が漏れている。73行のStorybookは現行catalog名称に更新候補。 |
| [`packages/i18n/README.md`](../packages/i18n/README.md) | exports、build、watch、verify の入力と出力を確認。watch の初期生成と verify の build 前提・検査範囲に補足が必要です。 |
| [`packages/icons-subsetter/README.md`](../packages/icons-subsetter/README.md) | 走査、font と CSS の生成を確認。glyph の fallback と class の content 定義を分け、import type の除外範囲も限定する必要があります。 |
| [`packages/mfm-js/README.md`](../packages/mfm-js/README.md) | 公開関数、full/simple parser、scripts、license を確認。変更を求める不一致はありませんでした。 |
| [`packages/misskey-js/CONTRIBUTING.md`](../packages/misskey-js/CONTRIBUTING.md) | 型生成、API Extractor、型テストを確認。tsd という実行ツールの説明を直す必要があります。 |
| [`packages/misskey-js/generator/README.md`](../packages/misskey-js/generator/README.md) | schema の入力と生成先を確認。単独で生成するときの api.json のコピーを明記する必要があります。 |
| [`packages/misskey-js/README.md`](../packages/misskey-js/README.md) | exports、API と streaming の実装を確認。tree shaking、例外の型、MiAuth で token を取得する流れに訂正が必要です。 |
| [`packages/slacc/README.md`](../packages/slacc/README.md) | native API、license、backend の利用箇所を確認。バイト列の署名と protocol の組み立てを区別し、生成側の参照先を補う必要があります。 |
| [`README.md`](../README.md) | 要修正: 初回設定の順序、存在しない checked-in default.yml のポート、テンプレートの必須環境変数、Compose 運用時の設定・bind mount 権限の説明不足。Bun/PG18/Valkey8、Docker 内 Rust、主要 package 構成、MIT 例外のライセンス表示はソースと一致。 |
| [`SECURITY.md`](../SECURITY.md) | 重大な運用不一致: GitHub GET /repos/haru0416-dev/misskey/private-vulnerability-reporting が enabled:false を返しました。非公開報告・通常 Issue/PR 禁止という文意は維持すべきです。現時点で実際に使える代替非公開窓口は本文にありません。 |

文章の校正対象から除いた生成物は、`packages/misskey-js/etc/misskey-js.api.md`、`packages/backend/test/unit/server/rest/endpoint-params.snap.txt`、`packages/backend/test/unit/server/rest/endpoint-security.snap.txt` の 3 件です。生成された型や契約のデータは、文体のために手で書き換えません。
