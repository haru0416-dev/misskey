/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lang, version } from '@shared/utility/config.js';
import type { Locale } from 'i18n';

// ビルド時に const locale = JSON.parse("...") の形へ置き換えられ、top-level await は残らない。
export let locale: Locale = await window
	.fetch(`/assets/locales/${lang}.${version}.json`, {
		cache: _DEV_ ? 'no-store' : 'default',
	})
	.then(
		(r) => r.json(),
		() => null,
	);

export function updateLocale(newLocale: Locale): void {
	locale = newLocale;
}
