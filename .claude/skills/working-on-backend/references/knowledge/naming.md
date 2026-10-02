# 名前の付け方

ファイル、関数、型、定数に新しい名前を付けるときと、既存の名前をそろえるときに読む。ここに書いた規則は、`packages/backend` と、`packages/frontend` のうちバックエンドと共通の部分に適用する。

## ファイル名

| 場所 | 形式 | 例 |
| --- | --- | --- |
| `packages/backend/src` の `core/` `server/` `queue/` `db/` `misc/` | kebab-case | `user-store.ts`、`file-info-service.ts` |
| `packages/backend/src/models/` | PascalCase。エンティティ型の `Mi` を除いた名前 | `User.ts`(`MiUser`) |
| `packages/backend/test` | 対象のファイル名に `.test.ts` を付ける | `test/unit/core/user-store.test.ts` |
| `packages/frontend` の Vue コンポーネント(`components/`) | PascalCase | `MkButton.vue` |
| `packages/frontend` の画面(`pages/`)と、コンポーネントでない `.ts` | kebab-case | `about-toneriko.vue`、`get-note-menu.ts` |
| composable | camelCase で `use` から始める | `useTooltip.ts` |

`core/` のファイル名は、役割を表す語尾で終える。DB を読み書きする関数は `-store`、依存を受けて関数群を返す factory は `-service`、状態を持たない処理は `-logic` とする。クラスや `Error` のサブクラスを含んでいても、関数を中心とするファイルなら kebab-case にする。クラスをエンティティとして定義する `models/` だけが PascalCase。

### フォルダ名

小文字で書き、複数の語はハイフンでつなぐ(`avatar-decoration`)。大文字とアンダースコアは使わない。例外は、TypeScript の型の置き場の `@types` と、先頭が数字の `2fa` だけ。

領域(1 つの機能やエンティティ)を表すフォルダは、単数形にする。backend の `core/note`、`server/rest/clip`、frontend の `features/note`、`features/custom-emoji` がこれにあたる。同じ種類のファイルを集めたフォルダは、複数形にする(`components/`、`composables/`、`types/`、`contracts/`、`handlers/`)。

`frontend/src/pages/` は、一覧の画面を複数形、1 件の画面を単数形にして区別する(`channels.vue` と `channel.vue`、`my-clips/` と `clip.vue`)。

### 特別な名前

- `index.ts` と `index.vue` は、パッケージの入口と、`pages/` で、そのディレクトリのルートの画面を表す場合だけに使う。理由は [CONTRIBUTING.md](../../../../../CONTRIBUTING.md) の「indexというファイル名は、入口にだけ使う」にある。バレルのファイルには、中身を表す名前を付ける(`models/entities.ts`)。
- 先頭が `_` のファイルは、Sass の partial(`_avatar.scss`)と、`server/web/views/` の部分テンプレート(`_head.tsx`)に限る。名前の前後を `_` で囲まない。
- テストのファイルは、`.test.ts` で終える。backend の `test/unit/` と `test/e2e/` では、vitest の `include` が `*.test.ts` を探すので、テストでないファイルはここに置かない。
- コンポーネントに付ける補助のファイルは、コンポーネント名の PascalCase に拡張子を足す(`MkButton.stories.impl.ts`、`MkSortOrderEditor.define.ts`)。
- `scripts/` と `packages/*/scripts/` のファイルは kebab-case にする(`run-unit.js`)。

## 識別子の形式

- 関数、変数、引数、プロパティは camelCase。型、クラス、interface、enum は PascalCase。
- ファイルの先頭に置く、設定値・上限・タイムアウトなどの定数は UPPER_SNAKE_CASE(`DB_MAX_NOTE_TEXT_LENGTH`)。Lua や SQL の本文を持つ定数は、関数に近い性質なので camelCase でもよい(`releaseLockScript`)。
- 略語は 1 語として扱う。`userId`、`apiUrl`、`parseHtml`、`DbExportAntennasData`。根拠は [CONTRIBUTING.md](../../../../../CONTRIBUTING.md) の「命名規則」。次の名前は例外として残す。
  - DOM と標準の名前(`HTMLElement`、`toJSON`、`toSQL`)
  - WebAuthn などの仕様の用語(`credentialID`、`clientDataJSON`)
  - Playwright の設定名(`baseURL`)
  - misskey-js の公開名(`APIError`、`requestAPI`)
- 依存をまとめて受ける引数は `deps`。認証済みユーザーは `me`。

## 関数の先頭の語

呼び出し側が、その関数の副作用と待ち時間を名前から見分けられるようにする。

| 先頭の語 | 意味 | 例 |
| --- | --- | --- |
| `get` | 同期。メモリ上の値を返すか、計算して返す | `getApId` |
| `fetch` | 非同期。DB、Redis、外部 HTTP、queue に問い合わせる | `fetchUserRoles`、`fetchRolePolicies` |
| `list` | 非同期。複数件を取る | `listSigninHistoryFromDatabase` |
| `create` | 新しい値や行を作る。DB に入れるときは `InDatabase` を付ける | `createNoteInDatabase` |
| `is` `has` | 述語。真偽値を返す | `isLocalUsernameTaken` |
| `handle` | HTTP や queue のハンドラ | `handleApiNotesCreate` |

HTTP の GET そのものを表す `getJson`、`getHtml`、`getActivityJson` は、メソッド名に合わせて `get` のまま使う。`fetch` の関数が Promise を返さず、別の値を作るだけの場合は、`create` に改める(`createRssFetchFailedError`)。

## DB を触る関数の語尾

`core/` の store が公開する関数は、何をするかで語尾を決める。

| 操作 | 語尾 | 例 |
| --- | --- | --- |
| 取得、一覧、件数、削除 | `FromDatabase` | `fetchUserByIdFromDatabase`、`deleteAdFromDatabase` |
| 作成、更新、加算・減算 | `InDatabase` | `updateUserProfileInDatabase`、`adjustInstanceUsersCountInDatabase` |

削除は、行を消す操作なので `FromDatabase`。削除と同じ transaction で別の行のカウンタを更新する関数も、主な操作が削除なら `FromDatabase`。キャッシュを挟む関数は、語尾の後ろに `Cached` や `CachedByVersion` を付ける(`fetchUserKeypairFromDatabaseCached`)。DB を触らない関数には付けない。

## REST 層

`server/rest` と `server/activitypub` の関数と型に、`ForApi` や `Api` の接頭辞・接尾辞は付けない。ファイルの場所がすでに層を表している。`core/` の関数を呼ぶ薄い関数が同じ名前になるときは、役割を表す語を足す(`punyHostOfUrl`、`blockUser`、`AdminQueueEndpointDependencies`)。ローカル変数が関数名を隠す場合も、関数のほうの名前を変える。

`ApiError` は、グローバルの `Error` を隠さないために `Api` を残している。

## まだそろえていない点

次はコード全体で混在していて、書き手の判断に任せている。新しく書くときは、周囲のファイルに合わせる。

- 真偽値の変数名の接頭辞(`isReady` と `ready`)
- 例外の変数名(`err` と `error`)
- フロントエンドの関数の先頭の語。Vue の画面では、`fetch` を Promise を返す矢印関数に使い、`get` を同期の取得に使う混在がある
