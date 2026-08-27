/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as dns from 'node:dns';
import type * as net from 'node:net';

type ResolvedAddress = { address: string; family: 4 | 6 };

type CacheEntry = { expiresAt: number; addresses: ResolvedAddress[] | null };

export type CachedResolver = {
	/** ホスト名を解決する。失敗も短時間だけ覚える。 */
	resolve(hostname: string): Promise<ResolvedAddress[]>;
	/** `http.Agent` の `lookup` に渡せる形。 */
	lookup: net.LookupFunction;
	/** テスト用。 */
	clear(): void;
};

const MAX_ENTRIES = 4096;

/**
 * ホスト名の解決結果を TTL 付きで覚える。
 *
 * SSRF 検査と実際の接続で同じ解決結果を使うために、解決した IP を呼び出し側へ返す
 * (`node:dns` の `lookup` は結果を返すだけでキャッシュしないので、ここで持つ)。
 */
export function createCachedResolver(options: { successTtlMs: number; failureTtlMs: number }): CachedResolver {
	const cache = new Map<string, CacheEntry>();

	function readCache(hostname: string): CacheEntry | null {
		const entry = cache.get(hostname);
		if (entry == null) return null;
		if (entry.expiresAt <= Date.now()) {
			cache.delete(hostname);
			return null;
		}
		return entry;
	}

	function writeCache(hostname: string, addresses: ResolvedAddress[] | null): void {
		if (cache.size >= MAX_ENTRIES) {
			const oldest = cache.keys().next().value;
			if (oldest !== undefined) cache.delete(oldest);
		}
		cache.set(hostname, {
			addresses,
			expiresAt: Date.now() + (addresses == null ? options.failureTtlMs : options.successTtlMs),
		});
	}

	async function resolve(hostname: string): Promise<ResolvedAddress[]> {
		const cached = readCache(hostname);
		if (cached != null) {
			if (cached.addresses == null) throw new Error(`Failed to resolve ${hostname}`);
			return cached.addresses;
		}

		let addresses: ResolvedAddress[];
		try {
			// verbatim: DNS が返した順序を保つ (Node 17 以降の既定)。
			const found = await dns.promises.lookup(hostname, { all: true, verbatim: true });
			addresses = found.map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));
		} catch (err) {
			writeCache(hostname, null);
			throw err;
		}

		if (addresses.length === 0) {
			writeCache(hostname, null);
			throw new Error(`Failed to resolve ${hostname}`);
		}

		writeCache(hostname, addresses);
		return addresses;
	}

	const lookup = ((hostname, optionsOrCallback, maybeCallback) => {
		const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
		const opts = typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback ?? {});
		if (callback == null) return;

		resolve(hostname).then(
			(addresses) => {
				const family = typeof opts === 'number' ? opts : (opts.family ?? 0);
				const matched = family === 0 ? addresses : addresses.filter((a) => a.family === family);
				const usable = matched.length > 0 ? matched : addresses;

				if (typeof opts !== 'number' && opts.all === true) {
					(callback as (err: null, addresses: ResolvedAddress[]) => void)(null, usable);
					return;
				}
				const first = usable[0]!;
				(callback as (err: null, address: string, family: number) => void)(null, first.address, first.family);
			},
			(err: Error) => {
				(callback as (err: Error) => void)(err);
			},
		);
	}) as net.LookupFunction;

	return { resolve, lookup, clear: () => cache.clear() };
}
