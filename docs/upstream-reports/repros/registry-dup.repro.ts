/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// REPRO: registry の同一 (userId,domain,scope,key) への並行 set で重複行が生じる。
// upstream develop の core/RegistryApiService.ts:27- (getOne→insert/update, ロック無し) +
// models/RegistryItem.ts (unique 制約なし・TODO あり) を実ソースで再現。
process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DataSource } from 'typeorm';
import { loadConfig } from '@/config.js';
import { entities } from '@/postgres.js';
import { MiUser } from '@/models/User.js';
import { MiRegistryItem } from '@/models/RegistryItem.js';
import { genAidx } from '@/misc/id/aidx.js';

describe('REPRO upstream #6 registry duplicate rows on concurrent set', () => {
	let db: DataSource;
	beforeAll(async () => {
		const config = loadConfig();
		db = new DataSource({
			type: 'postgres',
			host: config.db.host,
			port: config.db.port,
			username: config.db.user,
			password: config.db.pass,
			database: config.db.db,
			synchronize: true,
			dropSchema: true,
			entities,
		});
		await db.initialize();
	}, 1000 * 120);
	afterAll(async () => {
		if (db?.isInitialized) await db.destroy();
	});

	test('同一キーへの並行 set で行は 1 つに収束すること', async () => {
		const users = db.getRepository(MiUser);
		const reg = db.getRepository(MiRegistryItem);
		const uid = 'reprouser6000000000000';
		await users.insert({ id: uid, username: 'reprouser6', usernameLower: 'reprouser6' });

		const scope = ['client', 'base'];
		const key = 'theme';
		// RegistryApiService.set の getOne クエリ相当
		const findExisting = () =>
			reg
				.createQueryBuilder('item')
				.where('item.domain IS NULL')
				.andWhere('item.userId = :userId', { userId: uid })
				.andWhere('item.key = :key', { key })
				.andWhere('item.scope = :scope', { scope })
				.getOne();

		// 並行 set 2 本が「両方とも existing=null を観測」してから各自 insert する並行スケジュール
		const [e1, e2] = await Promise.all([findExisting(), findExisting()]);
		await Promise.all([
			e1
				? reg.update(e1.id, { updatedAt: new Date(), value: 'dark' })
				: reg.insert({
						id: genAidx(Date.now()),
						updatedAt: new Date(),
						userId: uid,
						domain: null,
						scope,
						key,
						value: 'dark',
					}),
			e2
				? reg.update(e2.id, { updatedAt: new Date(), value: 'light' })
				: reg.insert({
						id: genAidx(Date.now() + 1),
						updatedAt: new Date(),
						userId: uid,
						domain: null,
						scope,
						key,
						value: 'light',
					}),
		]);

		const rows = await reg.findBy({ userId: uid });
		// eslint-disable-next-line no-console
		console.log(
			'[#6] rows for same key:',
			rows.length,
			rows.map((r) => r.value),
		);
		expect(rows.length).toBe(1); // 正: 同一キーは 1 行のみ
	});
});
