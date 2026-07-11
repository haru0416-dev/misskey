/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type EmojiDef =
	| {
			emoji: string;
			name: string;
			url: string;
			aliasOf?: string;
	  }
	| {
			emoji: string;
			name: string;
			aliasOf?: string;
			isCustomEmoji?: true;
	  };
type EmojiScore = { emoji: EmojiDef; score: number };

function canonicalName(emoji: EmojiDef): string {
	return emoji.aliasOf ?? emoji.name;
}

function appendUnique(target: Map<string, EmojiDef>, candidates: EmojiDef[], max: number): void {
	for (const emoji of candidates) {
		const key = canonicalName(emoji);
		if (!target.has(key)) {
			target.set(key, emoji);
			if (target.size === max) return;
		}
	}
}

export function searchEmoji(query: string | null, emojiDb: EmojiDef[], max = 30): EmojiDef[] {
	if (!query || max <= 0) {
		return [];
	}

	const exact: EmojiDef[] = [];
	const exactAliases: EmojiDef[] = [];
	const prefixes: EmojiDef[] = [];
	const prefixAliases: EmojiDef[] = [];
	const partials: EmojiDef[] = [];

	// 入力のたびに大きな絵文字DBを何度も走査しないよう、優先度別の候補を1回で分類する。
	for (const emoji of emojiDb) {
		const name = emoji.name;
		if (name === query) {
			(emoji.aliasOf ? exactAliases : exact).push(emoji);
		} else if (name.startsWith(query)) {
			(emoji.aliasOf ? prefixAliases : prefixes).push(emoji);
		} else if (name.includes(query)) {
			partials.push(emoji);
		}
	}

	const matched = new Map<string, EmojiDef>();
	appendUnique(matched, exact, max);
	if (matched.size < max) appendUnique(matched, exactAliases, max);
	if (matched.size < max) appendUnique(matched, prefixes, max);
	if (matched.size < max) appendUnique(matched, prefixAliases, max);
	if (matched.size < max) appendUnique(matched, partials, max);

	// 簡易あいまい検索（3文字以上）
	if (matched.size < max && query.length > 3) {
		const queryChars = [...query];
		const hitEmojis = new Map<string, EmojiScore>();

		for (const x of emojiDb) {
			// 文字列の位置を進めながら、クエリの文字を順番に探す

			let pos = 0;
			let hit = 0;
			for (const c of queryChars) {
				pos = x.name.indexOf(c, pos);
				if (pos <= -1) break;
				hit++;
			}

			// 半分以上の文字が含まれていればヒットとする
			if (hit > Math.ceil(queryChars.length / 2) && !matched.has(canonicalName(x))) {
				hitEmojis.set(canonicalName(x), { emoji: x, score: hit - 2 });
			}
		}

		// ヒットしたものを全部追加すると雑多になるので、先頭の6件程度だけにしておく（6件＝オートコンプリートのポップアップのサイズ分）
		[...hitEmojis.values()]
			.sort((x, y) => y.score - x.score)
			.slice(0, 6)
			.forEach((it) => {
				if (matched.size < max) matched.set(canonicalName(it.emoji), it.emoji);
			});
	}

	return [...matched.values()];
}

export function searchEmojiExact(query: string | null, emojiDb: EmojiDef[], max = 30): EmojiDef[] {
	if (!query || max <= 0) {
		return [];
	}

	const exact: EmojiDef[] = [];
	const aliases: EmojiDef[] = [];
	for (const emoji of emojiDb) {
		if (emoji.name === query) {
			(emoji.aliasOf ? aliases : exact).push(emoji);
		}
	}

	const matched = new Map<string, EmojiDef>();
	appendUnique(matched, exact, max);
	if (matched.size < max) appendUnique(matched, aliases, max);
	return [...matched.values()];
}
