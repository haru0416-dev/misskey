/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type I18nSlotTemplatePart = string | { arg: string };

/**
 * frontend と embed の `<I18n>` コンポーネントが、翻訳文の `{name}` を同名のスロットへ差し替えるための分割。
 * `{` が無くなるまで先頭から切り出すだけで、入れ子やエスケープは扱わない。
 */
export function splitI18nSlotTemplate(src: string): I18nSlotTemplatePart[] {
	let str = src;
	const value: I18nSlotTemplatePart[] = [];
	for (;;) {
		const nextBracketOpen = str.indexOf('{');
		const nextBracketClose = str.indexOf('}');

		if (nextBracketOpen === -1) {
			value.push(str);
			break;
		} else {
			if (nextBracketOpen > 0) {
				value.push(str.substring(0, nextBracketOpen));
			}
			value.push({
				arg: str.substring(nextBracketOpen + 1, nextBracketClose),
			});
		}

		str = str.substring(nextBracketClose + 1);
	}

	return value;
}
