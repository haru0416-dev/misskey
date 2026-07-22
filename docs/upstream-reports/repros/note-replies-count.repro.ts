/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// REPRO: 返信ノートの並行削除で親ノートの repliesCount が二重減算され負値化する。
// upstream develop の core/NoteDeleteService.ts:67 (無条件 decrement) + :113 (未ガード delete) を忠実に再現。
process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DataSource } from 'typeorm';
import { loadConfig } from '@/config.js';
import { entities } from '@/postgres.js';
import { MiUser } from '@/models/User.js';
import { MiNote } from '@/models/Note.js';

describe('REPRO upstream #5 repliesCount double-decrement on concurrent reply delete', () => {
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

	test('返信削除 1 件に対応する親 repliesCount の減算は 1 回のみ', async () => {
		const users = db.getRepository(MiUser);
		const notes = db.getRepository(MiNote);

		const uid = 'reprouser0000000000000';
		await users.insert({ id: uid, username: 'reprouser', usernameLower: 'reprouser' });

		const parentId = 'reproparent000000000000';
		await notes.insert({ id: parentId, userId: uid, visibility: 'public' });
		await notes.update({ id: parentId }, { repliesCount: 1 }); // 返信 1 件ぶん

		const replyId = 'reproreply0000000000000';
		await notes.insert({ id: replyId, userId: uid, visibility: 'public', replyId: parentId, replyUserId: uid });

		// 返信削除リクエストが 2 本同時に来て、両方が返信を非null観測してから各自 decrement+delete する並行スケジュール。
		// NoteDeleteService.delete() の該当ロジック:
		//   67:  await this.notesRepository.decrement({ id: note.replyId }, 'repliesCount', 1);  (無条件)
		//   113: await this.notesRepository.delete({ id: note.id, userId: note.userId });        (affected 未検査)
		const [r1, r2] = await Promise.all([
			notes.findOneBy({ id: replyId }),
			notes.findOneBy({ id: replyId }),
		]);
		await Promise.all([
			(async () => {
				if (r1?.replyId) await notes.decrement({ id: r1.replyId }, 'repliesCount', 1);
				await notes.delete({ id: replyId, userId: uid });
			})(),
			(async () => {
				if (r2?.replyId) await notes.decrement({ id: r2.replyId }, 'repliesCount', 1);
				await notes.delete({ id: replyId, userId: uid });
			})(),
		]);

		const parent = await notes.findOneBy({ id: parentId });
		// eslint-disable-next-line no-console
		console.log('[#5] parent.repliesCount after 1 reply-delete raced x2:', parent?.repliesCount);

		// 正: 返信 1 件ぶんしか消えないので 0 (負値化しない)
		expect(parent?.repliesCount).toBe(0);
	});
});
