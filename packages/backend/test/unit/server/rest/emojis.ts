/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	fetchEmojiByIdFromDatabase,
	fetchEmojiByIdOrFailFromDatabase,
	fetchEmojiByNameAndHostFromDatabaseCached,
	insertEmojiInDatabase,
} from '@/core/emoji/EmojiStore.js';
import { listModerationLogsFromDatabase } from '@/core/moderation/ModerationLogStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiLocalUser } from '@/models/User.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	handleApiAdminEmojiAddAliasesBulk,
	handleApiAdminEmojiDeleteBulk,
	handleApiAdminEmojiRemoveAliasesBulk,
	handleApiAdminEmojiSetAliasesBulk,
	handleApiAdminEmojiSetCategoryBulk,
	handleApiAdminEmojiSetLicenseBulk,
	type ApiEmojiDependencies,
} from '@/server/rest/emoji/emojis.js';

describe('emoji bulk operations', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createEmoji(prefix: string, aliases: string[] = []): Promise<MiEmoji> {
		const id = genId();
		return await insertEmojiInDatabase(runtime.db, {
			id,
			updatedAt: null,
			name: `bulktest_${prefix}_${id}`,
			host: null,
			aliases,
			category: null,
			originalUrl: `https://example.test/${id}.webp`,
			publicUrl: '',
			license: null,
			isSensitive: false,
			localOnly: false,
			roleIdsThatCanBeUsedThisEmojiAsReaction: [],
		});
	}

	function createDeps(publishBroadcastStream = vi.fn()): ApiEmojiDependencies {
		return { ...runtime, publishBroadcastStream } as unknown as ApiEmojiDependencies;
	}

	test('updates aliases and metadata atomically while preserving alias order', async () => {
		const first = await createEmoji('first', ['base', null as unknown as string]);
		const second = await createEmoji('second');
		const publishBroadcastStream = vi.fn();
		const deps = createDeps(publishBroadcastStream);

		await handleApiAdminEmojiAddAliasesBulk(deps, {
			ids: [second.id, first.id, second.id],
			aliases: ['added', 'base'],
		});
		expect((await fetchEmojiByIdOrFailFromDatabase(runtime.db, first.id)).aliases).toEqual(['base', null, 'added']);
		expect((await fetchEmojiByIdOrFailFromDatabase(runtime.db, second.id)).aliases).toEqual(['added', 'base']);
		expect(publishBroadcastStream).toHaveBeenNthCalledWith(1, 'emojiUpdated', {
			emojis: [
				expect.objectContaining({ id: second.id }),
				expect.objectContaining({ id: first.id }),
				expect.objectContaining({ id: second.id }),
			],
		});

		await handleApiAdminEmojiRemoveAliasesBulk(deps, {
			ids: [first.id, second.id],
			aliases: ['base'],
		});
		expect((await fetchEmojiByIdOrFailFromDatabase(runtime.db, first.id)).aliases).toEqual([null, 'added']);
		expect((await fetchEmojiByIdOrFailFromDatabase(runtime.db, second.id)).aliases).toEqual(['added']);

		await handleApiAdminEmojiSetAliasesBulk(deps, {
			ids: [second.id],
			aliases: ['final'],
		});
		await handleApiAdminEmojiSetCategoryBulk(deps, {
			ids: [first.id, second.id],
			category: 'bulk',
		});
		expect((await fetchEmojiByNameAndHostFromDatabaseCached(runtime.db, first.name, first.host))?.license).toBeNull();
		await handleApiAdminEmojiSetLicenseBulk(deps, {
			ids: [first.id, second.id],
			license: 'test license',
		});
		expect((await fetchEmojiByNameAndHostFromDatabaseCached(runtime.db, first.name, first.host))?.license).toBe(
			'test license',
		);

		const updatedFirst = await fetchEmojiByIdOrFailFromDatabase(runtime.db, first.id);
		const updatedSecond = await fetchEmojiByIdOrFailFromDatabase(runtime.db, second.id);
		expect(updatedFirst.category).toBe('bulk');
		expect(updatedSecond.aliases).toEqual(['final']);
		expect(updatedSecond.license).toBe('test license');
		expect(updatedFirst.updatedAt).not.toBeNull();
		expect(publishBroadcastStream).toHaveBeenCalledTimes(5);

		publishBroadcastStream.mockClear();
		const missingId = genId();
		await fetchEmojiByNameAndHostFromDatabaseCached(runtime.db, first.name, first.host);
		await expect(
			handleApiAdminEmojiSetCategoryBulk(deps, {
				ids: [first.id, missingId],
				category: 'must-roll-back',
			}),
		).rejects.toMatchObject({
			status: 400,
			code: 'NO_SUCH_EMOJI',
			id: '756e37b2-8e81-421c-9d18-740a6932d57f',
		});
		expect((await fetchEmojiByIdOrFailFromDatabase(runtime.db, first.id)).category).toBe('bulk');
		expect((await fetchEmojiByNameAndHostFromDatabaseCached(runtime.db, first.name, first.host))?.category).toBe(
			'bulk',
		);
		expect(publishBroadcastStream).not.toHaveBeenCalled();
	});

	test('deletes rows and moderation logs in one transaction', async () => {
		const first = await createEmoji('delete-first');
		const second = await createEmoji('delete-second');
		const moderatorId = genId();
		const moderator = (await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id: moderatorId, username: `emojibulk${moderatorId}`, usernameLower: `emojibulk${moderatorId}` },
			profile: { userId: moderatorId },
		})) as MiLocalUser;
		const publishBroadcastStream = vi.fn();
		const deps = createDeps(publishBroadcastStream);
		const missingId = genId();

		await handleApiAdminEmojiDeleteBulk(deps, moderator, { ids: [missingId] });
		expect(publishBroadcastStream).toHaveBeenCalledWith('emojiDeleted', { emojis: [] });
		publishBroadcastStream.mockClear();

		await expect(
			handleApiAdminEmojiDeleteBulk(deps, { id: genId() } as MiLocalUser, {
				ids: [first.id, second.id],
			}),
		).rejects.toThrow();
		expect(await fetchEmojiByIdFromDatabase(runtime.db, first.id)).not.toBeNull();
		expect(await fetchEmojiByIdFromDatabase(runtime.db, second.id)).not.toBeNull();
		expect(publishBroadcastStream).not.toHaveBeenCalled();

		await handleApiAdminEmojiDeleteBulk(deps, moderator, {
			ids: [second.id, first.id],
		});
		expect(await fetchEmojiByIdFromDatabase(runtime.db, first.id)).toBeNull();
		expect(await fetchEmojiByIdFromDatabase(runtime.db, second.id)).toBeNull();
		const deleted = publishBroadcastStream.mock.calls.find((call) => call[0] === 'emojiDeleted')?.[1].emojis as
			| { id: string }[]
			| undefined;
		expect(deleted).toHaveLength(2);
		expect(new Set(deleted?.map((emoji) => emoji.id))).toEqual(new Set([first.id, second.id]));

		const logs = await listModerationLogsFromDatabase(runtime.db, {
			limit: 10,
			order: 'desc',
			type: 'deleteCustomEmoji',
			userId: moderator.id,
		});
		expect(new Set(logs.map((log) => (log.info as { emojiId?: string }).emojiId))).toEqual(
			new Set([first.id, second.id]),
		);
	});
});
