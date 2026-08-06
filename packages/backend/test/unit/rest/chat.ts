/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiChatMessage } from '@/models/ChatMessage.js';
import type { MiUser } from '@/models/User.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { countPoolQueries, type QueryCounter } from '../../query-counter.js';
import { packChatMessageDetailedForHonoApi, packChatMessagesDetailedForHonoApi, type HonoApiChatDependencies } from '@/server/rest/chat.js';

describe('chat message packing', () => {
	let runtime: RuntimeDependencies;
	let queries: QueryCounter;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		queries = countPoolQueries(runtime.drizzlePool);
	});

	afterAll(async () => {
		queries.restore();
		await runtime.dispose();
	});

	async function createUser(prefix: string): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `chatpack${prefix}${id}`, usernameLower: `chatpack${prefix}${id}` },
			profile: { userId: id },
		});
	}

	test('batches participants and reaction users while omitting missing reactors', async () => {
		const [sender, recipient, reactor1, reactor2] = await Promise.all([
			createUser('sender'),
			createUser('recipient'),
			createUser('reactor1'),
			createUser('reactor2'),
		]);
		const deletedReactorId = genId();
		const message: MiChatMessage = {
			id: genId(),
			fromUserId: sender.id,
			fromUser: null,
			toUserId: recipient.id,
			toUser: null,
			toRoomId: null,
			toRoom: null,
			text: 'reaction pack',
			uri: null,
			reads: [],
			fileId: null,
			file: null,
			reactions: [`${reactor1.id}/👍`, `${deletedReactorId}/❌`, `${reactor2.id}/⭐`],
		};

		const deps = runtime as unknown as HonoApiChatDependencies;

		queries.reset();
		const packedSingle = await packChatMessageDetailedForHonoApi(deps, message, sender);
		expect(queries.count()).toBe(1);
		expect(packedSingle.reactions.map(reaction => [reaction.user.id, reaction.reaction])).toEqual([
			[reactor1.id, '👍'],
			[reactor2.id, '⭐'],
		]);

		queries.reset();
		const secondMessage = { ...message, id: genId(), reactions: [`${reactor2.id}/⭐`, `${reactor1.id}/👍`] };
		const [packedMany, packedSecond] = await packChatMessagesDetailedForHonoApi(deps, [message, secondMessage], sender);
		expect(queries.count()).toBe(1);
		expect(packedMany!.reactions).toEqual(packedSingle.reactions);
		expect(packedSecond!.reactions.map(reaction => reaction.user.id)).toEqual([reactor2.id, reactor1.id]);

		queries.reset();
		const packedWithPartialHint = await packChatMessageDetailedForHonoApi(deps, message, sender, {
			_hint_: { packedUsers: new Map([[reactor1.id, packedSingle.reactions[0]!.user]]) },
		});
		expect(queries.count()).toBe(1);
		expect(packedWithPartialHint.reactions).toEqual(packedSingle.reactions);

		const explicitSenderMessage = { ...message, fromUser: sender, reactions: [`${sender.id}/👍`] };
		const packedWithStaleMissingHint = await packChatMessageDetailedForHonoApi(deps, explicitSenderMessage, sender, {
			_hint_: { missingUserIds: new Set([sender.id]) },
		});
		expect(packedWithStaleMissingHint.reactions[0]!.user.id).toBe(sender.id);
	});

	test('still rejects a missing required participant', async () => {
		const sender = await createUser('missing');
		const message = {
			id: genId(),
			fromUserId: sender.id,
			fromUser: null,
			toUserId: genId(),
			toUser: null,
			toRoomId: null,
			toRoom: null,
			text: null,
			uri: null,
			reads: [],
			fileId: null,
			file: null,
			reactions: [],
		} satisfies MiChatMessage;

		const deps = runtime as unknown as HonoApiChatDependencies;

		queries.reset();
		await expect(packChatMessageDetailedForHonoApi(deps, message, sender)).rejects.toMatchObject({
			name: 'EntityNotFoundError',
		});
		expect(queries.count()).toBe(1);
	});
});
