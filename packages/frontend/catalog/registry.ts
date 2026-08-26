/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@/stories/types.js';

export type StoryEntry = {
	/** 一覧とURLで使う識別子。`components/global/MkAcct--Default` の形。 */
	id: string;
	/** `src/` からの階層。サイドバーの見出しに使う。 */
	title: string;
	name: string;
	load: () => Promise<StoryObj>;
};

const modules = import.meta.glob<Record<string, unknown>>('../src/**/*.stories.impl.ts');

function titleOf(path: string): string {
	return path.replace(/^\.\.\/src\//, '').replace(/\.stories\.impl\.ts$/, '');
}

/**
 * story を列挙する。名前の確定には各モジュールの評価が要るので、一覧の構築自体が非同期になる。
 */
export async function loadStories(): Promise<StoryEntry[]> {
	const entries: StoryEntry[] = [];

	await Promise.all(
		Object.entries(modules).map(async ([path, load]) => {
			const title = titleOf(path);
			let module: Record<string, unknown>;
			try {
				module = await load();
			} catch (err) {
				console.error(`[catalog] ${title} の読み込みに失敗しました`, err);
				return;
			}

			for (const [name, value] of Object.entries(module)) {
				// 既定 story を持たないスタブや、型だけの export を弾く。
				if (value == null || typeof value !== 'object') continue;
				const story = value as StoryObj;
				if (story.render == null && story.args == null) continue;

				entries.push({
					id: `${title}--${name}`,
					title,
					name,
					load: async () => (await load())[name] as StoryObj,
				});
			}
		}),
	);

	return entries.sort((a, b) => a.id.localeCompare(b.id));
}
