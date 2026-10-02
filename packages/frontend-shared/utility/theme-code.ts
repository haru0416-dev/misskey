/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 利用者が書いたテーマ (JSON5) を読む。テーマの編集・導入の画面から使い、起動時の読み込みには乗せない。
// サーバーが渡すデフォルトテーマは JSON に変換済みなので theme.ts の parseThemeJsonOrNull で読む。

import JSON5 from 'json5';
import { parseThemeValue } from '@shared/utility/theme.js';
import type { Theme } from '@shared/utility/theme.js';

export function parseThemeCode(code: string): Theme {
	let theme: unknown;

	try {
		theme = JSON5.parse(code);
	} catch (_) {
		throw new Error('Failed to parse theme json', { cause: _ });
	}

	return parseThemeValue(theme);
}

export function parseThemeOrNull(code: string | null | undefined): Theme | null {
	if (code == null) {
		return null;
	}

	try {
		return parseThemeCode(code);
	} catch {
		return null;
	}
}
