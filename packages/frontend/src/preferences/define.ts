/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PreferencesDefinitionRecord } from './store.js';

// 設定の定義 (def.ts) に型を付ける。store.ts は定義を読むので、ここを store.ts に置くと値の循環になる。
export function definePreferences<T extends Record<string, unknown>>(x: {
	[K in keyof T]: PreferencesDefinitionRecord<T[K]>;
}): {
	[K in keyof T]: PreferencesDefinitionRecord<T[K]>;
} {
	return x;
}
