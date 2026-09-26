/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { SQL as NativeSqlClient } from 'bun';
import { loadConfig } from '@/config.js';
import { createBunSqlClient, createBunSqlDatabase } from '@/db/bun-sql.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchHashtagByNameFromDatabase, recordHashtagUsagesInDatabase } from '@/core/hashtag/HashtagStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';

// タグを使った利用者は hashtag_user に 1 人 1 行で持ち、*UsersCount はそこから重複なく数える。
// 以前は hashtag の行に利用者 ID の配列を持たせていて、同じ人がまた使うだけで配列全体を書き直していた。
describe('recordHashtagUsagesInDatabase', () => {
	let pool: NativeSqlClient;
	let db: MiDrizzleDatabase;

	beforeAll(() => {
		const config = loadConfig();
		pool = createBunSqlClient(config);
		db = createBunSqlDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.close();
	});

	const createUser = async (host: string | null = null) => {
		const id = genId();
		const username = `hashtaguser${id}`;
		await createUserWithProfileAndPublickeyInDatabase(db, {
			user: { id, username, usernameLower: username, host },
			profile: { userId: id },
		});
		return id;
	};
	const record = (
		userId: string,
		names: string[],
		options: { remote?: boolean; attached?: boolean; increment?: boolean } = {},
	) =>
		recordHashtagUsagesInDatabase(db, {
			entries: names.map((name) => ({ id: genId(), name })),
			userId,
			isLocalUser: !options.remote,
			isRemoteUser: options.remote === true,
			isUserAttached: options.attached === true,
			increment: options.increment ?? true,
		});
	const rowVersion = async (name: string) =>
		((await pool.unsafe(`SELECT xmin::text AS v FROM hashtag WHERE name = $1`, [name])) as { v: string }[])[0]?.v;

	test('同じ人は 1 人と数え、2 回目以降は hashtag を書き換えない', async () => {
		const [tagA, tagB] = [`hta${genId()}`, `htb${genId()}`];
		const local = await createUser();
		const remote = await createUser('remote.example');

		await record(local, [tagA, tagB]);
		expect(await fetchHashtagByNameFromDatabase(db, tagA)).toMatchObject({
			mentionedUsersCount: 1,
			mentionedLocalUsersCount: 1,
			mentionedRemoteUsersCount: 0,
			attachedUsersCount: 0,
		});

		const before = await rowVersion(tagA);
		await record(local, [tagA, tagB]);
		expect(await rowVersion(tagA)).toBe(before);
		expect((await fetchHashtagByNameFromDatabase(db, tagA))?.mentionedUsersCount).toBe(1);

		await record(remote, [tagA], { remote: true });
		expect(await fetchHashtagByNameFromDatabase(db, tagA)).toMatchObject({
			mentionedUsersCount: 2,
			mentionedLocalUsersCount: 1,
			mentionedRemoteUsersCount: 1,
		});
		expect((await fetchHashtagByNameFromDatabase(db, tagB))?.mentionedUsersCount).toBe(1);
	});

	test('プロフィールのタグは別に数え、外すと減らす (投稿のタグは減らさない)', async () => {
		const tag = `htc${genId()}`;
		const user = await createUser();
		await record(user, [tag]);
		await record(user, [tag], { attached: true });
		expect(await fetchHashtagByNameFromDatabase(db, tag)).toMatchObject({
			mentionedUsersCount: 1,
			attachedUsersCount: 1,
			attachedLocalUsersCount: 1,
		});

		await record(user, [tag], { attached: true, increment: false });
		expect(await fetchHashtagByNameFromDatabase(db, tag)).toMatchObject({
			mentionedUsersCount: 1,
			attachedUsersCount: 0,
			attachedLocalUsersCount: 0,
		});
		// 付けていないタグを外しても減らさない。
		await record(user, [tag], { attached: true, increment: false });
		expect((await fetchHashtagByNameFromDatabase(db, tag))?.attachedUsersCount).toBe(0);
	});

	test('同じ新しいタグを別の人が同時に使っても、両方を数える', async () => {
		const tag = `htd${genId()}`;
		const users = await Promise.all(Array.from({ length: 8 }, () => createUser()));
		await Promise.all(users.map((user) => record(user, [tag])));
		expect(await fetchHashtagByNameFromDatabase(db, tag)).toMatchObject({
			mentionedUsersCount: 8,
			mentionedLocalUsersCount: 8,
		});
	});
});
