/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// REPRO: ドライブ容量チェックの TOCTOU で、並行アップロードが容量を超過できる。
// upstream develop の core/DriveService.ts:546-556 (calcDriveUsageOf→判定→insert, ロック無し) を実ソースで再現。
process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DataSource } from 'typeorm';
import { loadConfig } from '@/config.js';
import { entities } from '@/postgres.js';
import { MiUser } from '@/models/User.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { genAidx } from '@/misc/id/aidx.js';

describe('REPRO upstream #3b drive-capacity TOCTOU', () => {
	let db: DataSource;
	beforeAll(async () => {
		const config = loadConfig();
		db = new DataSource({
			type: 'postgres', host: config.db.host, port: config.db.port,
			username: config.db.user, password: config.db.pass, database: config.db.db,
			synchronize: true, dropSchema: true, entities,
		});
		await db.initialize();
	}, 1000 * 120);
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('並行アップロードでドライブ容量(driveCapacity)を超過しないこと', async () => {
		const users = db.getRepository(MiUser);
		const files = db.getRepository(MiDriveFile);
		const uid = 'reprouser3b00000000000';
		await users.insert({ id: uid, username: 'reprouser3b', usernameLower: 'reprouser3b' });

		const driveCapacity = 100; // bytes (テスト用に小さく)
		const size = 60; // 1 ファイル 60 bytes → 1 件で 60、2 件で 120 (>100)

		// DriveService.calcDriveUsageOf 相当 (SUM(size) WHERE userId AND isLink=FALSE)
		const calcUsage = async (): Promise<number> => {
			const { sum } = await files.createQueryBuilder('file')
				.where('file.userId = :id', { id: uid })
				.andWhere('file.isLink = FALSE')
				.select('SUM(file.size)', 'sum')
				.getRawOne();
			return parseInt(sum, 10) || 0;
		};
		const insertFile = (i: number) => files.insert({
			id: genAidx(Date.now() + i), userId: uid, userHost: null,
			md5: `md5-${i}`, name: `f${i}`, type: 'image/png', size,
			storedInternal: true, url: `http://example.com/f${i}`, isLink: false,
		});

		// 並行アップロード 2 本が「両方とも usage=0 を観測」してから各自チェック+insert する並行スケジュール
		const [u1, u2] = await Promise.all([calcUsage(), calcUsage()]);
		await Promise.all([
			(async () => { if (driveCapacity < u1 + size) throw new Error('No free space'); await insertFile(1); })(),
			(async () => { if (driveCapacity < u2 + size) throw new Error('No free space'); await insertFile(2); })(),
		]);

		const finalUsage = await calcUsage();
		// eslint-disable-next-line no-console
		console.log('[#3b] driveCapacity:', driveCapacity, '| final usage:', finalUsage);
		expect(finalUsage).toBeLessThanOrEqual(driveCapacity); // 正: 容量を超えない
	});
});
