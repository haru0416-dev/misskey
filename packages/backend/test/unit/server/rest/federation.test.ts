/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createInstanceInDatabase, listFederationInstancesFromDatabase } from '@/core/instance/instance-store.js';
import type { FederationInstancesSort } from '@/core/instance/instance-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRedisClient, createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	handleApiFederationShowInstance,
	tryLockFetchInstanceMetadata,
	unlockFetchInstanceMetadata,
} from '@/server/rest/activitypub/federation.js';

describe('federation metadata lock', () => {
	test('独立したクライアントのうち一方だけが取得でき、解除後は再取得できる', async () => {
		const config = loadConfig();
		const first = createRedisClient(config);
		const second = createRedisClient(config);
		const host = `mutex-${genId()}.example.test`;

		try {
			const results = await Promise.all([
				tryLockFetchInstanceMetadata({ redis: first }, host),
				tryLockFetchInstanceMetadata({ redis: second }, host),
			]);
			expect(results.filter((result) => result === null)).toHaveLength(1);
			// 取得したプロセスが解除前に落ちても、ロックは期限で消える。
			const ttl = await first.ttl(`fetchInstanceMetadata:mutex:v2:${host}`);
			expect(ttl).toBeGreaterThan(0);
			expect(ttl).toBeLessThanOrEqual(30);
			expect(await tryLockFetchInstanceMetadata({ redis: first }, host)).not.toBeNull();
			expect(await tryLockFetchInstanceMetadata({ redis: second }, host)).not.toBeNull();

			await unlockFetchInstanceMetadata({ redis: first }, host);
			expect(await tryLockFetchInstanceMetadata({ redis: second }, host)).toBeNull();
		} finally {
			try {
				await unlockFetchInstanceMetadata({ redis: first }, host);
			} finally {
				first.disconnect();
				second.disconnect();
			}
		}
	});
});

describe('federation instances host lists', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('ブロック・サイレンスの絞り込みと表示は、ポートや下位ドメインが違っても同じホスト名を該当にする', async () => {
		const base = `listed-${genId()}.example`;
		const hosts = [`${base}:8443`, `sub.${base}:8443`];
		for (const host of hosts) {
			await createInstanceInDatabase(runtime.db, { id: genId(), host, firstRetrievedAt: new Date() });
		}
		const list = (filter: { blocked?: boolean; silenced?: boolean }) =>
			listFederationInstancesFromDatabase(runtime.db, {
				host: base,
				blockedHosts: [base],
				silencedHosts: [base],
				limit: 10,
				offset: 0,
				sort: null as unknown as FederationInstancesSort,
				...filter,
			}).then((rows) => rows.map((row) => row.host).sort());

		expect(await list({ blocked: true })).toEqual([...hosts].sort());
		expect(await list({ blocked: false })).toEqual([]);
		expect(await list({ silenced: true })).toEqual([...hosts].sort());
		expect(await list({ silenced: false })).toEqual([]);

		const deps = {
			...runtime,
			meta: { ...runtime.meta, blockedHosts: [base], silencedHosts: [base], mediaSilencedHosts: [base] },
		};
		const ported = await handleApiFederationShowInstance(deps, null, { host: hosts[0]! });
		expect(ported).toMatchObject({ isBlocked: true, isSilenced: true, isMediaSilenced: true });
		// メディアサイレンスは投稿・リアクション・ドライブでの適用と同じく下位ドメインを含めない。
		const subdomain = await handleApiFederationShowInstance(deps, null, { host: hosts[1]! });
		expect(subdomain).toMatchObject({ isBlocked: true, isSilenced: true, isMediaSilenced: false });
	});
});
