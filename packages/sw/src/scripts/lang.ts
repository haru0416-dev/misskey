/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * Language manager for SW
 */
import { get, set } from 'idb-keyval';
import { I18n } from '@shared/utility/i18n.js';
import { FETCH_TIMEOUT_MS } from '@/const.js';
import type { Locale } from 'i18n';

export const MISSKEY_CACHE_PREFIX = 'mk-cache-';

export class SwLang {
	public cacheName = `${MISSKEY_CACHE_PREFIX}${_VERSION_}`;

	public lang: Promise<string> = get('lang').then(async prelang => {
		if (!prelang) return 'en-US';
		return prelang;
	});

	public async setLang(newLang: string): Promise<I18n<Locale>> {
		this.lang = Promise.resolve(newLang);
		try {
			await set('lang', newLang);
		} catch (error) {
			if (_DEV_) console.warn('language persistence failed', error);
		}
		return await this.fetchLocale();
	}

	public i18n: Promise<I18n<Locale>> | null = null;

	public fetchLocale(): Promise<I18n<Locale>> {
		return (this.i18n = this._fetch());
	}

	private async _fetch(): Promise<I18n<Locale>> {
		// Service Workerは何度も起動しそのたびにlocaleを読み込むので、CacheStorageを使う
		const localeUrl = `/assets/locales/${await this.lang}.${_VERSION_}.json`;
		let localeRes = await caches.match(localeUrl);

		// _DEV_がtrueの場合は常に最新化
		if (!localeRes || _DEV_) {
			const controller = new AbortController();
			const timeout = globalThis.setTimeout(() => {
				controller.abort('locale-fetch-timeout');
			}, FETCH_TIMEOUT_MS);

			try {
				localeRes = await fetch(localeUrl, { signal: controller.signal });

				const clone = localeRes.clone();
				if (!clone.clone().ok) throw new Error('locale fetching error');

				try {
					await caches.open(this.cacheName).then(cache => cache.put(localeUrl, clone));
				} catch (error) {
					if (_DEV_) console.warn('locale cache write failed', error);
				}
			} finally {
				globalThis.clearTimeout(timeout);
			}
		}

		return new I18n<Locale>(await localeRes.json());
	}
}

export const swLang = new SwLang();
