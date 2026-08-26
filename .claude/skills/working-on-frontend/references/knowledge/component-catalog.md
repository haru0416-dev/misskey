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

## 既知の未達

`test:stories` は 62 件中 41 件が通る。残り 21 件 (MkA / MkAd / MkTime / MkDialog /
MkSignupDialog.Rules / MkAutocomplete / MkGalleryPostPreview) は Storybook 時代に一度も
実行されておらず、主張が現状と合っているか未確認。**この 21 件はまだ CI に載せていない。**
