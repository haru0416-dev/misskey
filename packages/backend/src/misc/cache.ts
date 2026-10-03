/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type MemoryKVCache<T> = ReturnType<typeof createMemoryKVCache<T>>;

export function createMemoryKVCache<T>(lifetime: number, limit?: number) {
	if (limit !== undefined && (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0)) {
		throw new TypeError('limit must be a positive finite integer');
	}
	const maxEntries = limit ?? Infinity;
	const cache = new Map<string, { date: number; value: T }>();
	const pendingFetches = new Map<string, Promise<T | undefined>>();

	function set(key: string, value: T): void {
		if (maxEntries !== Infinity) {
			// 期限切れの掃除は interval の gc() に任せる。ここで gc() を呼ぶと set のたびに全件走査になり、
			// 常に満杯の MFM パースキャッシュ (1000 件) では notes/create の CPU を無視できない割合で消費する。
			// 上限超過分は挿入順の先頭 (最も古く参照されたもの) から落とす。
			cache.delete(key);

			while (cache.size >= maxEntries) {
				const oldestKey = cache.keys().next().value;
				if (oldestKey === undefined) {
					break;
				}
				cache.delete(oldestKey);
			}
		}

		cache.set(key, {
			date: Date.now(),
			value,
		});
	}

	function get(key: string): T | undefined {
		const cached = cache.get(key);
		if (cached == null) {
			return undefined;
		}
		if (Date.now() - cached.date > lifetime) {
			cache.delete(key);
			return undefined;
		}
		if (maxEntries !== Infinity) {
			cache.delete(key);
			cache.set(key, cached);
		}
		return cached.value;
	}

	function gc(): void {
		const now = Date.now();

		for (const [key, { date }] of cache.entries()) {
			const age = now - date;
			if (age >= lifetime) {
				cache.delete(key);
			}
		}
	}

	// 期限は get でも検査するため、メモリ回収だけのタイマーでプロセスを生存させない。
	const gcIntervalHandle = setInterval(gc, 1000 * 60 * 3).unref();

	return {
		set,
		get,
		gc,

		delete(key: string): void {
			cache.delete(key);
		},

		async fetch(key: string, fetcher: () => Promise<T>, validator?: (cachedValue: T) => boolean): Promise<T> {
			const cachedValue = get(key);
			if (cachedValue !== undefined) {
				if (validator) {
					if (validator(cachedValue)) {
						return cachedValue;
					}
				} else {
					return cachedValue;
				}
			}

			const value = await fetcher();
			set(key, value);
			return value;
		},

		async fetchMaybe(
			key: string,
			fetcher: () => Promise<T | undefined>,
			validator?: (cachedValue: T) => boolean,
		): Promise<T | undefined> {
			const cachedValue = get(key);
			if (cachedValue !== undefined) {
				if (validator) {
					if (validator(cachedValue)) {
						return cachedValue;
					}
				} else {
					return cachedValue;
				}
			}

			const pendingFetch = pendingFetches.get(key);
			if (pendingFetch !== undefined) {
				return pendingFetch;
			}

			const fetchPromise = fetcher()
				.then((value) => {
					if (value !== undefined) {
						set(key, value);
					}
					return value;
				})
				.finally(() => {
					if (pendingFetches.get(key) === fetchPromise) {
						pendingFetches.delete(key);
					}
				});
			pendingFetches.set(key, fetchPromise);
			return fetchPromise;
		},

		dispose(): void {
			clearInterval(gcIntervalHandle);
		},

		get entries() {
			return cache.entries();
		},
	};
}

export type MemorySingleCache<T> = ReturnType<typeof createMemorySingleCache<T>>;

export function createMemorySingleCache<T>(lifetime: number) {
	let cachedAt: number | null = null;
	let value: T | undefined;

	function set(newValue: T): void {
		cachedAt = Date.now();
		value = newValue;
	}

	function get(): T | undefined {
		if (cachedAt == null) {
			return undefined;
		}
		if (Date.now() - cachedAt > lifetime) {
			value = undefined;
			cachedAt = null;
			return undefined;
		}
		return value;
	}

	return {
		set,
		get,

		delete(): void {
			value = undefined;
			cachedAt = null;
		},

		/** validator が false を返した既存値は再利用しない。 */
		async fetch(fetcher: () => Promise<T>, validator?: (cachedValue: T) => boolean): Promise<T> {
			const cachedValue = get();
			if (cachedValue !== undefined) {
				if (validator) {
					if (validator(cachedValue)) {
						return cachedValue;
					}
				} else {
					return cachedValue;
				}
			}

			const fetched = await fetcher();
			set(fetched);
			return fetched;
		},

		/** validator が false を返した既存値は再利用しない。 */
		async fetchMaybe(
			fetcher: () => Promise<T | undefined>,
			validator?: (cachedValue: T) => boolean,
		): Promise<T | undefined> {
			const cachedValue = get();
			if (cachedValue !== undefined) {
				if (validator) {
					if (validator(cachedValue)) {
						return cachedValue;
					}
				} else {
					return cachedValue;
				}
			}

			const fetched = await fetcher();
			if (fetched !== undefined) {
				set(fetched);
			}
			return fetched;
		},
	};
}
