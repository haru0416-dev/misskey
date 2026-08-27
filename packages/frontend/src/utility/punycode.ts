/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toUnicodeHost } from '@shared/utility/punycode.js';
import { miLocalStorage } from '@/local-storage.js';

/**
 * ホスト名の Punycode を、表示しても紛らわしくない場合に限って Unicode へ戻す。
 * 判定にはクライアントの表示言語を使う (未設定ならブラウザの言語設定)。
 */
export function toUnicode(host: string): string {
	const lang = miLocalStorage.getItem('lang');
	const locales = [...(lang == null ? [] : [lang]), ...(navigator.languages ?? [navigator.language])];
	return toUnicodeHost(host, locales.length > 0 ? locales : undefined);
}
