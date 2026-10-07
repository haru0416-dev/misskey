/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import {
	createAntennaInDatabase,
	deactivateAntennasNotUsedSinceFromDatabase,
	deleteAntennaFromDatabase,
	listActiveAntennasFromDatabaseCachedByVersion,
	updateAntennaInDatabase,
} from '@/core/antenna/antenna-store.js';
import {
	createNoteWithAuthorAndInlineJobsInDatabase,
	fetchNotePostCreateSnapshotFromDatabase,
} from '@/core/note/note-store.js';
import { createUserListInDatabase } from '@/core/user/user-list-store.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/user-store.js';
import { cacheVersion } from '@/db/schema/cache-version.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resetDb } from '@/misc/reset-db.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';

/*
 * アンテナ一覧のプロセス内キャッシュは DB トリガが進める世代番号で新旧を判定する。
 * 書き込みが Store 関数・生 SQL・外部キーの連鎖のどれでも (= 別プロセスの API や e2e のフィクスチャと
 * 同じ形でも) 世代が進み、次の照合で新しい一覧になることを確かめる。
 */
describe('antenna cache version', () => {
	let runtime: RuntimeDependencies;
	let db: MiDrizzleDatabase;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		db = runtime.db;
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function currentVersion(database: MiDrizzleDatabase = db): Promise<number | null> {
		const [row] = await database
			.select({ version: cacheVersion.version })
			.from(cacheVersion)
			.where(eq(cacheVersion.key, 'antennas'));
		return row?.version ?? null;
	}

	/** 世代が進んだことを確かめ、その世代でキャッシュ経由に読んだ有効なアンテナの id を返す。 */
	async function expectAdvancedFrom(previous: number): Promise<{ version: number; ids: string[] }> {
		const version = await currentVersion();
		expect(version).toBeGreaterThan(previous);
		const antennas = await listActiveAntennasFromDatabaseCachedByVersion(db, version!);
		return { version: version!, ids: antennas.map((antenna) => antenna.id) };
	}

	async function createUser(): Promise<string> {
		const id = genId();
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id, username: `antennacache${id}`, usernameLower: `antennacache${id}` },
			profile: { userId: id },
		});
		return id;
	}

	function antennaValues(userId: string, overrides: Partial<Parameters<typeof createAntennaInDatabase>[1]> = {}) {
		return {
			id: genId(),
			userId,
			name: 'cache version',
			src: 'all' as const,
			keywords: [['before']],
			withFile: false,
			lastUsedAt: new Date(),
			...overrides,
		};
	}

	test('store writes advance the version except for lastUsedAt-only updates', async () => {
		const userId = await createUser();
		const v0 = (await currentVersion())!;
		const before = await listActiveAntennasFromDatabaseCachedByVersion(db, v0);

		const created = await createAntennaInDatabase(db, antennaValues(userId));
		// 古い世代を渡す限り、読み直さずに同じ一覧を返す。
		expect(await listActiveAntennasFromDatabaseCachedByVersion(db, v0)).toBe(before);
		const v1 = await expectAdvancedFrom(v0);
		expect(v1.ids).toContain(created.id);
		const cached = await listActiveAntennasFromDatabaseCachedByVersion(db, v1.version);
		expect(Object.isFrozen(cached)).toBe(true);
		expect(Object.isFrozen(cached.find((antenna) => antenna.id === created.id))).toBe(true);

		// antennas/notes が閲覧のたびに書く更新では進まない。
		await updateAntennaInDatabase(db, created.id, { lastUsedAt: new Date(Date.now() + 1000) });
		await updateAntennaInDatabase(db, created.id, { isActive: true, lastUsedAt: new Date(Date.now() + 2000) });
		expect(await currentVersion()).toBe(v1.version);

		await updateAntennaInDatabase(db, created.id, { keywords: [['after']] });
		const v2 = await expectAdvancedFrom(v1.version);
		const updated = (await listActiveAntennasFromDatabaseCachedByVersion(db, v2.version)).find(
			(antenna) => antenna.id === created.id,
		);
		expect(updated?.keywords).toEqual([['after']]);

		await updateAntennaInDatabase(db, created.id, { isActive: false });
		const v3 = await expectAdvancedFrom(v2.version);
		expect(v3.ids).not.toContain(created.id);

		await updateAntennaInDatabase(db, created.id, { isActive: true, lastUsedAt: new Date(0) });
		const v4 = await expectAdvancedFrom(v3.version);
		expect(v4.ids).toContain(created.id);
		await deactivateAntennasNotUsedSinceFromDatabase(db, new Date(1000));
		const v5 = await expectAdvancedFrom(v4.version);
		expect(v5.ids).not.toContain(created.id);

		await deleteAntennaFromDatabase(db, created.id);
		await expectAdvancedFrom(v5.version);
	});

	test('raw SQL writes and foreign key cascades advance the version', async () => {
		const userId = await createUser();
		const listId = genId();
		await createUserListInDatabase(db, { id: listId, userId, name: 'cache version' });

		const v0 = (await currentVersion())!;
		const rawId = genId();
		await db.execute(
			sql`INSERT INTO "antenna" ("id", "lastUsedAt", "userId", "name", "src", "withFile") VALUES (${rawId}, now(), ${userId}, 'raw', 'all', false)`,
		);
		const v1 = await expectAdvancedFrom(v0);
		expect(v1.ids).toContain(rawId);

		await db.execute(sql`UPDATE "antenna" SET "excludeBots" = true WHERE "id" = ${rawId}`);
		const v2 = await expectAdvancedFrom(v1.version);
		expect(
			(await listActiveAntennasFromDatabaseCachedByVersion(db, v2.version)).find((antenna) => antenna.id === rawId)
				?.excludeBots,
		).toBe(true);

		const listAntenna = await createAntennaInDatabase(db, antennaValues(userId, { src: 'list', userListId: listId }));
		const v3 = await expectAdvancedFrom(v2.version);
		expect(v3.ids).toContain(listAntenna.id);

		// リストを消すと、そのリストを指すアンテナが連鎖で消える。
		await db.execute(sql`DELETE FROM "user_list" WHERE "id" = ${listId}`);
		const v4 = await expectAdvancedFrom(v3.version);
		expect(v4.ids).not.toContain(listAntenna.id);
		expect(v4.ids).toContain(rawId);

		// 利用者を消すと、その利用者のアンテナが連鎖で消える。
		await db.execute(sql`DELETE FROM "user" WHERE "id" = ${userId}`);
		const v5 = await expectAdvancedFrom(v4.version);
		expect(v5.ids).not.toContain(rawId);
	});

	test('note persistence and the post-create snapshot carry the version read in the same statement', async () => {
		const userId = await createUser();
		const noteId = genId();
		const { antennasVersion } = await createNoteWithAuthorAndInlineJobsInDatabase(
			db,
			{
				id: noteId,
				uri: null,
				url: null,
				fileIds: [],
				replyId: null,
				renoteId: null,
				channelId: null,
				threadId: null,
				name: null,
				text: 'antenna cache version',
				hasPoll: false,
				cw: null,
				tags: [],
				emojis: [],
				userId,
				localOnly: false,
				reactionAcceptance: null,
				reactions: {},
				reactionAndUserPairCache: [],
				renoteCount: 0,
				repliesCount: 0,
				clippedCount: 0,
				pageCount: 0,
				visibility: 'public',
				visibleUserIds: [],
				mentions: [],
				mentionedRemoteUsers: '[]',
				attachedFileTypes: [],
				replyUserId: null,
				replyUserHost: null,
				renoteUserId: null,
				renoteUserHost: null,
				renoteChannelId: null,
				userHost: null,
				updatedAt: null,
			},
			[],
			{},
		);
		expect(antennasVersion).toBe(await currentVersion());
		expect((await fetchNotePostCreateSnapshotFromDatabase(db, noteId))?.antennasVersion).toBe(antennasVersion);

		// 同じ transaction の書き込みは snapshot に見え、世代の行が無ければキャッシュを使わない (null)。
		const rollback = new Error('discard antenna cache version changes');
		await expect(
			db.transaction(async (tx) => {
				await createAntennaInDatabase(tx, antennaValues(userId));
				const inTransaction = await currentVersion(tx);
				expect(inTransaction).toBeGreaterThan(antennasVersion!);
				expect((await fetchNotePostCreateSnapshotFromDatabase(tx, noteId))?.antennasVersion).toBe(inTransaction);
				await tx.delete(cacheVersion).where(eq(cacheVersion.key, 'antennas'));
				expect((await fetchNotePostCreateSnapshotFromDatabase(tx, noteId))?.antennasVersion).toBeNull();
				throw rollback;
			}),
		).rejects.toBe(rollback);
		expect(await currentVersion()).toBe(antennasVersion);
	});

	test('resetting test data preserves and advances the version so new antennas invalidate the cache', async () => {
		const oldUserId = await createUser();
		const old = await createAntennaInDatabase(db, antennaValues(oldUserId));
		const beforeReset = (await currentVersion())!;
		expect((await listActiveAntennasFromDatabaseCachedByVersion(db, beforeReset)).map((a) => a.id)).toContain(old.id);

		await resetDb(db);
		const afterReset = await expectAdvancedFrom(beforeReset);
		expect(afterReset.ids).toEqual([]);

		const newUserId = await createUser();
		const created = await createAntennaInDatabase(db, antennaValues(newUserId));
		const afterCreate = await expectAdvancedFrom(afterReset.version);
		expect(afterCreate.ids).toEqual([created.id]);
	});
});
