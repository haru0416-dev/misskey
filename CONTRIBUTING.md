# Contribution guide

このリポジトリは [Misskey](https://github.com/misskey-dev/misskey) から分岐したフォークで、upstream への追従は行っていない。
Issue / PR はこのリポジトリに対して出すこと (upstream の Issue・Discussions・Discord は対象外)。

ここには開発環境の作り方と、コードを書くうえでの決まりごとをまとめている。
AI コーディングエージェント向けの規約は [AGENTS.md](./AGENTS.md) にある。

## Issues

- 重複を避けるため、同じ内容の Issue が既にないか検索してから作成する
- Issue は要望・提案・不具合の報告に使う。質問やトラブルシュートには使わない
- 解決しそうな Issue でも、実際に解決するコミットがマージされるまではクローズしない
- **脆弱性は Issue / PR に書かない**。[SECURITY.md](./SECURITY.md) の手順に従う

## Pull Request

- タイトルには種類が分かる prefix を付ける (`fix` / `refactor` / `feat` / `enhance` / `perf` / `chore` 等)
- ひとつの PR に複数の種類の変更や関心を混ぜない
- 対応する Issue がある場合は本文から参照する
- 利用者に影響のある変更は [`CHANGELOG.md`](/CHANGELOG.md) の `## Unreleased` に 1 行追記する。リファクタリングなど利用者に影響しない変更では不要
- 機能追加・バグ修正には可能な限りテストを足す
- 事前に `bun run lint` とテストを通す ([Testing](#testing) 参照)
- UI の変更を含む場合はスクリーンショットを貼る

本文の雛形は [.github/pull_request_template.md](.github/pull_request_template.md)。

### ActivityPub payload を変更するとき

連合先には他実装や古いバージョンが含まれるため、拡張プロパティ (拡張として独自に足すプロパティ) には制約がある。

- 名前は `_misskey_` を prefix する (例: `_misskey_quote`)。プロトコル上の識別子は互換性のため Misskey 由来の名前を維持する
- `packages/backend/src/core/activitypub/type.ts` での宣言は **必ず optional** にする (拡張プロパティを持たない payload が届くため)
- context 定義 (`packages/backend/src/core/activitypub/misc/contexts.ts`) にも追加する。キーは拡張プロパティ名と同じ、値は short IRI (`misskey:<拡張プロパティ名>`)
- 他実装が既に定義しているプロパティを再定義したり、well-known なプロパティへ独自の値を足したりしない

## Localization (l10n)

`locales/ja-JP.yml` **以外の locale YAML を手動編集しない**。他言語ファイルは Crowdin からの配信先として扱われており
([crowdin.yml](crowdin.yml) の `ja-JP.yml` → `locales/%locale%.yml` マッピング)、手動編集は次の同期で失われる。
詳細は [locales/README.md](locales/README.md)。

## Development
### Setup
Before developing, you have to set up environment. Misskey requires Valkey, PostgreSQL, and FFmpeg.

You would want to install Meilisearch to experiment related features. Technically, meilisearch is not strict requirement, but some features and tests require it.

There are a few ways to proceed.

#### Use system-wide software
You could install them in system-wide (such as from package manager).

#### Use `docker compose`
You could obtain middleware container by typing `docker compose -f $PROJECT_ROOT/deploy/compose.local-db.yml up -d`.

#### Use Devcontainer
Devcontainer also has necessary setting. This method can be done by connecting from VSCode.

Instead of running Bun locally, you can use Dev Container to set up your development environment.
To use Dev Container, open the project directory on VSCode with Dev Containers installed.
**Note:** If you are using Windows, please clone the repository with WSL. Using Git for Windows will result in broken files due to the difference in how newlines are handled.

It will run the following command automatically inside the container.
``` bash
bun install --frozen-lockfile
cp .devcontainer/devcontainer.yml .config/default.yml
bun run build
bun run migrate
```

After finishing the migration, you can proceed.

#### Cloudflare tunnel
Cloudflare tunnelを使うとローカルのMisskeyサーバーをインターネットに公開できます。
HTTPSでしか動作しない機能を検証したい時や、スマホなど別のデバイスからローカルのMisskeyサーバーを検証したい時に便利です。

##### Cloudflare warpと併用する際のtips

> cloudflared (Cloudflare Tunnel) は region1.v2.argotunnel.com / region2.v2.argotunnel.com に QUIC/HTTP2 でアウトバウンド接続するのですが、WARP を有効化するとこのトラフィックが WARP 経由になってループ/切断します。これら 2 ホストを WARP のトンネル除外（split tunnel）に追加することで、cloudflared だけは WARP をバイパスして直接 Cloudflare エッジへ接続できるようになります。

### Start developing
During development, it is useful to use the
```
bun run dev
```
command.

- Server-side source files and automatically builds them if they are modified. Automatically start the server process(es).
- Service Worker is watched by esbuild.
- Vite HMR (just the `vite` command) is available. The behavior may be different from production.
- Vite runs behind the backend (the backend will proxy Vite at /vite and /embed_vite except for websocket used for HMR).
- You can see Misskey by accessing `http://localhost:3000` (Replace `3000` with the port configured at `server.listen.tcp.port` in `.config/default.yml`).

## Testing
You can run non-backend tests by executing following commands:
```sh
bun run --bun --filter frontend test
bun run --bun --filter misskey-js test
```

Backend tests require manual preparation of servers. See the next section for more on this.

### Backend
There are three types of test codes for the backend:
- Unit tests: [`/packages/backend/test/unit`](/packages/backend/test/unit)
- Single-server E2E tests: [`/packages/backend/test/e2e`](/packages/backend/test/e2e)
- Multiple-server E2E tests: [`/packages/backend/test-federation`](/packages/backend/test-federation)

#### Running Unit Tests or Single-server E2E Tests
1. Create a config file:
```sh
cp .github/misskey/test.yml .config/
```

2. Start DB and Valkey servers for testing:
```sh
docker compose -f packages/backend/test/compose.yml up
```
Instead, you can prepare an empty (data can be erased) DB and edit `.config/test.yml` appropriately.

3. Run all tests:
```sh
bun run --bun --filter backend test     # unit tests
bun run --bun --filter backend test:e2e # single-server E2E tests
```
If you want to run a specific test, run as a following command:
```sh
bun run --bun --filter backend test -- packages/backend/test/unit/misc/cache.ts
bun run --bun --filter backend test:e2e -- packages/backend/test/e2e/nodeinfo.ts
```

`test` and `test:e2e` run vitest on the Bun runtime, with the application under test in the same process. `test:e2e:bun` runs the same E2E suite against a server booted as a separate process, so the assertions go through a real HTTP boundary:
```sh
bun run --bun --filter backend test:e2e:bun
```

#### Running Multiple-server E2E Tests
See [`/packages/backend/test-federation/README.md`](/packages/backend/test-federation/README.md).

## Environment Variable

- `MISSKEY_CONFIG_YML`: Specify the file path of config.yml instead of default.yml (e.g. `2nd.yml`).
- `MISSKEY_WEBFINGER_USE_HTTP`: If it's set true, WebFinger requests will be http instead of https, useful for testing federation between servers in localhost. NEVER USE IN PRODUCTION.

## Continuous integration
Misskey uses GitHub Actions for executing automated tests.
Configuration files are located in [`/.github/workflows`](/.github/workflows).

## Vue
Misskey uses Vue(v3) as its front-end framework.
- Use TypeScript.
- **When creating a new component, please use the Composition API (with [setup sugar](https://v3.vuejs.org/api/sfc-script-setup.html) and [ref sugar](https://github.com/vuejs/rfcs/discussions/369)) instead of the Options API.**
	- Some of the existing components are implemented in the Options API, but it is an old implementation. Refactors that migrate those components to the Composition API are also welcome.

## Tabler Icons
アイコンは、Production Build時に使用されていないものが削除されるようになっています。

**アイコンを動的に設定する際には、 `ti-${someVal}` のような、アイコン名のみを動的に変化させる実装を行わないでください。**
必ず `ti-xxx` のような完全なクラス名を含めるようにしてください。

## nirax
niraxは、Misskeyで使用しているオリジナルのフロントエンドルーティングシステムです。
**vue-routerから影響を多大に受けているので、まずはvue-routerについて学ぶことをお勧めします。**

### ルート定義
実装は [`/packages/frontend/src/lib/nirax.ts`](/packages/frontend/src/lib/nirax.ts)、
ルート定義そのものは [`/packages/frontend/src/router.definition.ts`](/packages/frontend/src/router.definition.ts) にあります。

ルート定義は以下の形式のオブジェクトの配列です。

```ts
{
	path: string;
	name?: string;
	query?: Record<string, string>;
	loginRequired?: boolean;
	hash?: string;
	children?: RouteDef[];
}
```

これに加えて、描画するルートは `component: Component` を、リダイレクトするルートは
`redirect: string | ((props: Map<string, string | boolean>) => string)` を持ちます (両者のユニオンが `RouteDef`)。

> [!WARNING]
> 現状、ルートは定義された順に評価されます。
> たとえば、`/foo/:id`ルート定義の次に`/foo/bar`ルート定義がされていた場合、後者がマッチすることはありません。

### 複数のルーター
vue-routerとの最大の違いは、niraxは複数のルーターが存在することを許可している点です。
これにより、アプリ内ウィンドウでブラウザとは個別にルーティングすることなどが可能になります。

## コンポーネントカタログ

`packages/frontend/catalog` は、コンポーネントを一覧して手元で確認するための小さな Vite アプリ。
Storybook は使っていない (実行時に描画できない状態が続いたため 2026-08-26 に置き換えた)。

### 起動

```bash
bun run --bun --filter misskey-js build
bun run --bun --filter frontend catalog
```

http://127.0.0.1:6006/ が開く。左のサイドバーで story を選ぶと右に描画され、
`os.popup` 等で開くダイアログもそのまま出る。テーマは右上で切り替えられる。

### story の書き方

コンポーネント `MyComponent.vue` の隣に `MyComponent.stories.impl.ts` を置く。
`render` が返すのは Vue のコンポーネントオプション。

```ts
import type { StoryObj } from '@/stories/types.js';
import MyComponent from './MyComponent.vue';

export const Default = {
	render: (args) => ({
		components: { MyComponent },
		setup: () => ({ args }),
		template: '<MyComponent v-bind="args" />',
	}),
	args: {},
} satisfies StoryObj<typeof MyComponent>;
```

使えるキーは `args` / `render` / `decorators` / `parameters` / `play`。
`parameters.layout` は `centered` / `fullscreen` / `padded`、`parameters.msw` には
msw のハンドラを渡す (共通ハンドラの上に重なる)。イベントの記録は
`@/stories/action.js` の `action()` を使うとカタログ下部の一覧に出る。

### play の検証

`play` を書いた story は実ブラウザ (Chromium) で実行される。

```bash
bun run --bun --filter frontend test:stories
```

`expect` / `within` / `userEvent` / `waitFor` は `@/stories/test.js` から import する
(中身は vitest + Testing Library)。カタログ側は play を実行しない。


## Notes

### Misskeyのドメイン固有の概念は`Mi`をprefixする
例えばGoogleが自社サービスをMap、Earth、DriveではなくGoogle Map、Google Earth、Google Driveのように命名するのと同じ
コード上でMisskeyのドメイン固有の概念には`Mi`をprefixすることで、他のドメインの同様の概念と区別できるほか、名前の衝突を防ぐ。
ただし、文脈上Misskeyのものを指すことが明らかであり、名前の衝突の恐れがない場合は、一時的なローカル変数に限って`Mi`を省略してもよい。

### Misskey.jsの型生成
```bash
bun run build-misskey-js-with-types
```

### How to resolve conflictions occurred at bun.lock?

Just execute `bun install` to fix it.

### `sql`テンプレートに生の配列を埋め込まない
drizzleの`sql`テンプレートにJSの配列をそのまま埋め込むと、要素ごとに別々のプレースホルダへ展開されてしまう
``` ts
sql`${note.userId} = ANY(${userIds})`
// → "note"."userId" = ANY(($1, $2, $3))  ← 配列ではないので不正
```
配列を1個の配列パラメータとして渡すには`sql.param()`で包む
``` ts
sql`${note.userId} = ANY(${sql.param(userIds)})`
// → "note"."userId" = ANY($1)
```
`= ANY(sql.param(...))`は要素数が変わってもプレースホルダの数が変わらないので、prepared statementを使い回す場合にも都合が良い

### `null` in SQL
`eq()`に`null`を渡しても`IS NULL`にはならず、`col = $1`(パラメータが`null`)というクエリになって何にもマッチしない
`null`になり得る値と比較するときは`isNull()` / `isNotNull()`で出し分けること
``` ts
// NG: ps.folderIdがnullだと常に0件になる
.where(eq(driveFile.folderId, ps.folderId))

// OK
.where(ps.folderId != null ? eq(driveFile.folderId, ps.folderId) : isNull(driveFile.folderId))
```

### `[]` in SQL
`inArray()` / `notInArray()`は空配列を渡すとそれぞれ`false` / `true`にコンパイルされるので、`IN ()`のような壊れたSQLにはならない
ただし結果が自明なクエリをDBへ往復させることになるので、空になり得る場合は問い合わせ自体を省くのが望ましい
``` ts
const users = userIds.length > 0
	? await db.select().from(userTable).where(inArray(userTable.id, userIds))
	: [];
```
手書きの`sql`テンプレートで`IN (...)`を組み立てる場合はこの保護が働かないので、自分で空配列を弾くこと

### 配列のインデックス in SQL
SQLでは配列のインデックスは**1始まり**。
`[a, b, c]`の `a`にアクセスしたいなら`[0]`ではなく`[1]`と書く

### null IN
nullが含まれる可能性のあるカラムにINするときは、そのままだとおかしくなるのでORなどでnullのハンドリングをしよう。

### enumの削除は気をつける
enumの列挙の内容の削除は、その値をもつレコードを全て削除しないといけない

削除が重たかったり不可能だったりする場合は、削除しないでおく

### Migration作成方法
`packages/backend/src/db/schema/*.ts` (drizzle-orm) を編集した後、ルートで:
```sh
bun run --filter backend db:generate
```

- `packages/backend/migration/` に差分SQLファイルが自動生成される
- 拡張機能・関数・`INCLUDE`句などdrizzle-kitが検出できないDDLは `bun run --filter backend db:generate:custom` で空ファイルを作り手書きする
- 生成されたSQLの中身を必ず確認すること(特にenum変更・列リネームは対話プロンプトでの判定に依存する)
- forward-onlyのため`down`migrationの概念は無い

### コネクションには`markRaw`せよ
**Vueのコンポーネントのdataオプションとして**misskey.jsのコネクションを設定するとき、必ず`markRaw`でラップしてください。インスタンスが不必要にリアクティブ化されることで、misskey.js内の処理で不具合が発生するとともに、パフォーマンス上の問題にも繋がる。なお、Composition APIを使う場合はこの限りではない(リアクティブ化はマニュアルなため)。

### JSONのimportに気を付けよう
TypeScriptでjsonをimportすると、tscでコンパイルするときにそのjsonファイルも一緒にdistディレクトリに吐き出されてしまう。この挙動により、意図せずファイルの書き換えが発生することがあるので、jsonをimportするときは書き換えられても良いものかどうか確認すること。書き換えされて欲しくない場合は、importで読み込むのではなく、`fs.readFileSync`などの関数を使って読み込むようにすればよい。

### コンポーネントのスタイル定義でmarginを持たせない
コンポーネント自身がmarginを設定するのは問題の元となることはよく知られている
marginはそのコンポーネントを使う側が設定する

### 命名規則

本来それが略称であっても、通常それでひとつのワードとして用いられるものは、略称として扱わない。

#### 例: IP address

Good: `ipAddress` / `IpAddress`

Bad: `IPAddress`

#### 例: User ID

Good: `userId` / `UserId`

Bad: `userID` / `UserID`

#### 例: XMLなHTTPのRequest

Good: `xmlHttpRequest` / `XmlHttpRequest`

Bad: `XMLHttpRequest` / `XMLHTTPRequest`

### 関数化の基準

汎用性が低く(例えばそれを関数化したとしてもその呼び出しが元の場所一か所しか存在しない)、内容も短い処理(例えば10行以下)は、かえって読みにくくなるため、関数化しない。

また、関数化する場合でも、呼び出しがある特定のスコープに限られる場合は、そのスコープ内に閉じ込めた方が分かりやすく簡潔になる場合がある(ただし本来その処理に不要であっても、構造上親のスコープにある関係のない変数や引数にもアクセスできるようになるため、必ずしもそうすれば設計上綺麗になるというわけでもない。状況に応じて判断すべし)。

Bad:

``` ts
function withBrankets(x) {
	return `(${x})`;
}

function formatPercent(x) {
	return `${x}%`;
}

function formatValue(x) {
	return withBrankets(formatPercent(x));
}

function showData(a, b) {
	console.log(formatValue(a));
	console.log(formatValue(b));
}
```

Good:

``` ts
function formatValue(x) {
	return `(${x}%)`;
}

function showData(a, b) {
	console.log(formatValue(a));
	console.log(formatValue(b));
}
```

or

``` ts
function showData(a, b) {
	function formatValue(x) {
		return `(${x}%)`;
	}

	console.log(formatValue(a));
	console.log(formatValue(b));
}
```

or

``` ts
function showData(a, b) {
	console.log(`(${a}%)`);
	console.log(`(${b}%)`);
}
```

## その他
### HTMLのクラス名で follow という単語は使わない
広告ブロッカーで誤ってブロックされる

### indexというファイル名を使うな
ESMではディレクトリインポートは廃止されているのと、ディレクトリインポートせずともファイル名が index だと何故か一部のライブラリ？でディレクトリインポートだと見做されてエラーになる

## CSS Recipe

### Lighten CSS vars

``` css
color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
```

### Darken CSS vars

``` css
color: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
```

### Add alpha to CSS vars

``` css
color: color(from var(--MI_THEME-accent) srgb r g b / 0.5);
```

## 考え方
### DRYに囚われるな
必要なのは一般化ではなく抽象化と考えます。
盲信せず、誤った・不必要な共通化は避け、それが自然だと感じる場合は重複させる勇気を持ちましょう。

### Misskeyを複雑にしない実装
それがいくら複雑であっても、Misskey固有のコンテキストと関心が分離されている(もしくは事実上分離されていると見做すことができる)実装であれば、それはMisskeyのコードベースに対する複雑性に影響を与えないと考えます。

例えるなら、VueやAiScriptといったMisskeyが使用しているライブラリの内部実装がいくら複雑だったとしても、「それを使用しているからMisskeyの実装は複雑である」ということにはならないのと同じです。

Misskeyのドメイン知識から関心が分離されているということは、Misskeyの実装について考える時にそれらの内部実装を考慮する必要が無く、認知負荷を増やさないからです。

また重要な点は、その実装が、Misskeyリポジトリの外部にあるか・内部にあるかということや、Misskeyがメンテナンスするものか・第三者がメンテナンスするものかといったことは複雑性を考える上ではほとんど無視できるという点です。

もちろんその実装がMisskeyリポジトリにあり、Misskeyがメンテナンスしなければならないものは、保守のコストはかかります。
しかし、Misskeyの本質的な設計・実装という観点で見たときは、その実装は実質的に外部ライブラリのように振る舞います。
換言すれば「たまたまMisskeyの開発者と同じ人たちがメンテナンスしているし、たまたまMisskeyのリポジトリ内に置いてあるだけの外部ライブラリ」です。

そのため、実装をなるべくMisskeyのドメイン知識から独立したものにすれば、Misskeyのコードベースの複雑性を上げることなく機能実装を行うことができ、お得であると言えます。
もちろんそれにこだわって、些細な実装でもそのように分離してしまうとかえって認知負荷が増えたり、実装量が増えてメリットをデメリットが上回る場合もあるので、ケースバイケースではあります。
