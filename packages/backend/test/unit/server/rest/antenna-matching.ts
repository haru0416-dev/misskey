/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';

const {
	followingExistsInDatabaseMock,
	listActiveAntennasFromDatabaseMock,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock,
	listUserListIdsContainingUserFromDatabaseMock,
} = vi.hoisted(() => ({
	followingExistsInDatabaseMock: vi.fn(),
	listActiveAntennasFromDatabaseMock: vi.fn(),
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock: vi.fn(),
	listUserListIdsContainingUserFromDatabaseMock: vi.fn(),
}));

vi.mock('@/core/AntennaStore.js', () => ({
	appendUserToAntennasInDatabase: vi.fn(),
	countAntennasByUserIdFromDatabase: vi.fn(),
	createAntennaInDatabase: vi.fn(),
	deleteAntennaFromDatabase: vi.fn(),
	fetchAntennaByIdAndUserIdFromDatabase: vi.fn(),
	fetchAntennaByIdOrFailFromDatabase: vi.fn(),
	listActiveAntennasFromDatabase: listActiveAntennasFromDatabaseMock,
	listAntennasByIdsFromDatabase: vi.fn(),
	listAntennasByUserIdFromDatabase: vi.fn(),
	updateAntennaInDatabase: vi.fn(),
}));

vi.mock('@/core/FollowingStore.js', () => ({
	followingExistsInDatabase: followingExistsInDatabaseMock,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase: listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock,
}));

vi.mock('@/core/UserListMembershipStore.js', () => ({
	listUserListIdsContainingUserFromDatabase: listUserListIdsContainingUserFromDatabaseMock,
	userListMembershipExistsInDatabase: vi.fn(),
}));

import { addNoteToAntennasForHonoApi, checkHitAntennaForHonoApi } from '@/server/rest/antennas.js';

const authorId = '019f587c6bc4785ead8d511d603959f0';
const followerId = '019f587c6bc4785ead8d511d603959f1';
const strangerId = '019f587c6bc4785ead8d511d603959f2';

function createAntenna(id: string, userId: string): MiAntenna {
	return {
		id,
		userId,
		src: 'all',
		userListId: null,
		users: [],
		keywords: [],
		excludeKeywords: [],
		caseSensitive: false,
		excludeBots: false,
		withReplies: true,
		withFile: false,
		localOnly: false,
		excludeNotesInSensitiveChannel: false,
	} as unknown as MiAntenna;
}

describe('addNoteToAntennasForHonoApi', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listUserListIdsContainingUserFromDatabaseMock.mockResolvedValue([]);
		listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock.mockResolvedValue([followerId]);
	});

	test('batches followers visibility checks for antenna owners', async () => {
		const followerAntenna = createAntenna('follower-antenna', followerId);
		const strangerAntenna = createAntenna('stranger-antenna', strangerId);
		const authorAntenna = createAntenna('author-antenna', authorId);
		listActiveAntennasFromDatabaseMock.mockResolvedValue([followerAntenna, strangerAntenna, authorAntenna]);
		const publishAntennaStream = vi.fn();
		const pipeline = {
			lrem: vi.fn(),
			lpush: vi.fn(),
			ltrim: vi.fn(),
			exec: vi.fn(async () => []),
		};
		const note = {
			id: genId(),
			userId: authorId,
			visibility: 'followers',
			visibleUserIds: [],
			replyId: null,
			text: 'followers note',
			cw: null,
			fileIds: [],
			channel: null,
		} as unknown as MiNote;

		await addNoteToAntennasForHonoApi(
			{
				config: { runtime: { host: 'local.example' } } as Parameters<typeof addNoteToAntennasForHonoApi>[0]['config'],
				db: {} as MiDrizzleDatabase,
				redisForTimelines: {
					pipeline: vi.fn(() => pipeline),
				} as unknown as Parameters<typeof addNoteToAntennasForHonoApi>[0]['redisForTimelines'],
				publishAntennaStream,
			},
			note,
			{ id: authorId, username: 'author', host: null, isBot: false },
		);

		expect(listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock).toHaveBeenCalledOnce();
		expect(listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock).toHaveBeenCalledWith(
			expect.anything(),
			authorId,
			[followerId, strangerId],
		);
		expect(followingExistsInDatabaseMock).not.toHaveBeenCalled();
		expect(publishAntennaStream).toHaveBeenCalledTimes(2);
		expect(publishAntennaStream).toHaveBeenCalledWith(followerAntenna.id, 'note', note);
		expect(publishAntennaStream).toHaveBeenCalledWith(authorAntenna.id, 'note', note);
	});

	test('skips the followers query when every candidate fails an earlier condition', async () => {
		const antenna = createAntenna('bot-excluding-antenna', followerId);
		antenna.excludeBots = true;
		listActiveAntennasFromDatabaseMock.mockResolvedValue([antenna]);
		const pipeline = {
			lrem: vi.fn(),
			lpush: vi.fn(),
			ltrim: vi.fn(),
			exec: vi.fn(async () => []),
		};
		const note = {
			id: genId(),
			userId: authorId,
			visibility: 'followers',
			visibleUserIds: [],
			replyId: null,
			text: 'bot followers note',
			cw: null,
			fileIds: [],
			channel: null,
		} as unknown as MiNote;

		await addNoteToAntennasForHonoApi(
			{
				config: { runtime: { host: 'local.example' } } as Parameters<typeof addNoteToAntennasForHonoApi>[0]['config'],
				db: {} as MiDrizzleDatabase,
				redisForTimelines: {
					pipeline: vi.fn(() => pipeline),
				} as unknown as Parameters<typeof addNoteToAntennasForHonoApi>[0]['redisForTimelines'],
			},
			note,
			{ id: authorId, username: 'bot', host: null, isBot: true },
		);

		expect(listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock).not.toHaveBeenCalled();
		expect(followingExistsInDatabaseMock).not.toHaveBeenCalled();
		expect(pipeline.lpush).not.toHaveBeenCalled();
	});

	test('falls back to an individual following check without a followers hint', async () => {
		const antenna = createAntenna('standalone-antenna', followerId);
		const note = {
			userId: authorId,
			visibility: 'followers',
			replyId: null,
			channel: null,
			text: 'standalone followers note',
			cw: null,
			fileIds: [],
		} as unknown as MiNote;
		followingExistsInDatabaseMock.mockResolvedValue(true);

		const hit = await checkHitAntennaForHonoApi(
			{
				config: { runtime: { host: 'local.example' } } as Parameters<typeof checkHitAntennaForHonoApi>[0]['config'],
				db: {} as MiDrizzleDatabase,
			},
			antenna,
			note,
			{ id: authorId, username: 'author', host: null, isBot: false },
			{ listMembershipUserListIds: new Set() },
		);

		expect(hit).toBe(true);
		expect(followingExistsInDatabaseMock).toHaveBeenCalledOnce();
		expect(followingExistsInDatabaseMock).toHaveBeenCalledWith(expect.anything(), followerId, authorId);
	});
});
