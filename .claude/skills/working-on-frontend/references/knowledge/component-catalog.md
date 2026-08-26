# コンポーネントカタログ (`*.stories.impl.ts`)

`packages/frontend/catalog` はコンポーネントを一覧・確認するための小さな Vite アプリ。
Storybook は 2026-08-26 に撤去した (実行時にストーリーが一つも描画できない状態が続いていたため)。

## 起動と検証

| 用途 | コマンド |
| --- | --- |
| カタログを開く (http://127.0.0.1:6006/) | `bun run --bun --filter frontend catalog` |
| 静的ビルド (CI が実行) | `bun run --filter frontend catalog:build` |
| `play` を実ブラウザで検証 | `bun run --bun --filter frontend test:stories` |

## story の置き方

`MyComponent.vue` の隣に `MyComponent.stories.impl.ts` を置く。`render` は Vue の
コンポーネントオプションを返す。

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

- 使えるキー: `args` / `render` / `decorators` / `parameters` / `play`
- `parameters.layout`: `centered` / `fullscreen` / `padded`
- `parameters.msw`: msw のハンドラ。共通ハンドラ (`@/stories/mocks.js`) の上に重なる
- `decorators`: `(story, context) => ({ template: '<div ...><story/></div>' })`。先頭ほど内側
- イベント記録は `@/stories/action.js` の `action()`。カタログ下部の一覧に出る
- fixture は `@/stories/fakes.js` / `fake-utils.js` / `charts.js`

## `play` を書くとき

`play` を持つ story だけが `test:stories` で実行される。`expect` / `within` /
`userEvent` / `waitFor` は **`@/stories/test.js`** から import する (vitest + Testing Library)。

```ts
async play({ canvasElement }) {
	const canvas = within(canvasElement);
	await expect(canvas.getByRole('button')).toBeInTheDocument();
}
```

**罠**: `os.popup` / `os.popupMenu` が開く要素は `canvasElement` の内側に描画される。
`document.body` を直接探さないこと。story 間で popup が残ると `getByRole` が複数一致して
落ちるため、ハーネスが story ごとに `popups` を空にしている。

## `play` を書くときの罠 (実測)

- **`os.confirm` / `os.contextMenu` を挟む操作は答えるまで進まない。** 同意スイッチ等は
  クリックしただけでは値が立たない。確認ダイアログの OK (`i18n.ts.ok`) を押すこと
- **開いた直後のダイアログは `pointer-events: none`。** フェードイン中なので
  `await waitFor(() => userEvent.click(ok))` で押せるまで待つ
- **`os.contextMenu` は component を動的 import する。** `getByRole('menu')` では取れないので
  `findByRole` を使う
- **装飾画像 (`alt=""`) は `getByRole('img')` で引けない。** role は `presentation` になる。
  リンクの唯一の中身が装飾画像だとリンク名が無くなるので、その場合はコンポーネント側が誤り
- **汎用の `MkInput` は `textbox`。** autocomplete を付けても `combobox` にはならない
- **時刻に依存する story は `origin` を明示する。** 相対表示は基準時刻を渡さないと実時刻になり、
  書いた当時は未来だった日付が過去になって落ちる

## バリエーションは story として表に出す

「スナップショット時だけ静止させる」ような隠れた条件分岐は置かない (Chromatic 撤去で
`isChromatic()` が恒久的に死に、story が実時刻基準になって落ちた前例がある)。
見せたい状態が複数あるなら **別の story として export する**。

```ts
export const Default = { /* アニメーションあり */ } satisfies StoryObj<typeof MkLoading>;

export const Static = {
	...Default,
	args: { ...Default.args, static: true },
} satisfies StoryObj<typeof MkLoading>;
```

時刻に依存するコンポーネントも同様に、実時刻の `Default` と固定時刻の `FixedTime` を並べる。
