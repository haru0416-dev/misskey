/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiFollowing } from '@/models/Following.js';

const {
	listFollowingsMock,
	listFollowersMock,
	listOutgoingRequestsMock,
	listIncomingRequestsMock,
	listBlockeesMock,
	listBlockersMock,
	listMuteesMock,
	listRenoteMuteesMock,
} = vi.hoisted(() => ({
	listFollowingsMock: vi.fn(),
	listFollowersMock: vi.fn(),
	listOutgoingRequestsMock: vi.fn(),
	listIncomingRequestsMock: vi.fn(),
	listBlockeesMock: vi.fn(),
	listBlockersMock: vi.fn(),
	listMuteesMock: vi.fn(),
	listRenoteMuteesMock: vi.fn(),
}));

vi.mock('@/core/FollowingStore.js', () => ({
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase: vi.fn(),
	followingExistsInDatabase: vi.fn(),
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase: listFollowersMock,
	listFollowingsByFollowerIdAndFolloweeIdsFromDatabase: listFollowingsMock,
}));

vi.mock('@/core/FollowRequestStore.js', () => ({
	followRequestExistsInDatabase: vi.fn(),
	listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase: listOutgoingRequestsMock,
	listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase: listIncomingRequestsMock,
}));

vi.mock('@/core/BlockingStore.js', () => ({
	blockingExistsInDatabase: vi.fn(),
	listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase: listBlockeesMock,
	listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase: listBlockersMock,
}));

vi.mock('@/core/MutingStore.js', () => ({
	mutingExistsInDatabase: vi.fn(),
	listMuteeIdsByMuterIdAndMuteeIdsFromDatabase: listMuteesMock,
}));

vi.mock('@/core/RenoteMutingStore.js', () => ({
	renoteMutingExistsInDatabase: vi.fn(),
	listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase: listRenoteMuteesMock,
}));

import { handleHonoApiUsersRelation } from '@/server/rest/user.js';

const ids = Array.from({ length: 9 }, (_, index) => `019f587c6bc4785ead8d511d603959f${index}`);
const [meId, followingId, followerId, outgoingRequestId, incomingRequestId, blockingId, blockerId, mutingId, renoteMutingId] = ids as [string, string, string, string, string, string, string, string, string];
const db = {} as MiDrizzleDatabase;
const following = {
	id: 'following',
	followerId: meId,
	followeeId: followingId,
	notify: 'normal',
	withReplies: true,
} as MiFollowing;

type Relation = {
	id: string;
	following: MiFollowing | null;
	isFollowing: boolean;
	isFollowed: boolean;
	hasPendingFollowRequestFromYou: boolean;
	hasPendingFollowRequestToYou: boolean;
	isBlocking: boolean;
	isBlocked: boolean;
	isMuted: boolean;
	isRenoteMuted: boolean;
};

type RelationFlag = 'isFollowing' | 'isFollowed' | 'hasPendingFollowRequestFromYou' | 'hasPendingFollowRequestToYou' | 'isBlocking' | 'isBlocked' | 'isMuted' | 'isRenoteMuted';

describe('users/relation batch loading', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listFollowingsMock.mockResolvedValue([following]);
		listFollowersMock.mockResolvedValue([followerId]);
		listOutgoingRequestsMock.mockResolvedValue([outgoingRequestId]);
		listIncomingRequestsMock.mockResolvedValue([incomingRequestId]);
		listBlockeesMock.mockResolvedValue([blockingId]);
		listBlockersMock.mockResolvedValue([blockerId]);
		listMuteesMock.mockResolvedValue([mutingId]);
		listRenoteMuteesMock.mockResolvedValue([renoteMutingId]);
	});

	test('loads only requested targets while preserving every relation flag', async () => {
		const targets = [followingId, followerId, outgoingRequestId, incomingRequestId, blockingId, blockerId, mutingId, renoteMutingId];
		const result = await handleHonoApiUsersRelation({ db }, { id: meId }, { userId: [...targets, renoteMutingId] }) as Relation[];
		const byId = new Map(result.map(relation => [relation.id, relation]));
		const expectedFlagById = new Map<string, RelationFlag>([
			[followingId, 'isFollowing'],
			[followerId, 'isFollowed'],
			[outgoingRequestId, 'hasPendingFollowRequestFromYou'],
			[incomingRequestId, 'hasPendingFollowRequestToYou'],
			[blockingId, 'isBlocking'],
			[blockerId, 'isBlocked'],
			[mutingId, 'isMuted'],
			[renoteMutingId, 'isRenoteMuted'],
		]);
		const flags: RelationFlag[] = ['isFollowing', 'isFollowed', 'hasPendingFollowRequestFromYou', 'hasPendingFollowRequestToYou', 'isBlocking', 'isBlocked', 'isMuted', 'isRenoteMuted'];

		expect(result).toHaveLength(targets.length);
		expect(byId.get(followingId)?.following).toEqual(following);
		for (const target of targets) {
			const relation = byId.get(target)!;
			for (const flag of flags) {
				expect(relation[flag]).toBe(flag === expectedFlagById.get(target));
			}
		}

		for (const mock of [
			listFollowingsMock,
			listFollowersMock,
			listOutgoingRequestsMock,
			listIncomingRequestsMock,
			listBlockeesMock,
			listBlockersMock,
			listMuteesMock,
			listRenoteMuteesMock,
		]) {
			expect(mock).toHaveBeenCalledWith(db, meId, targets);
		}
	});

	test('does not query relation tables for an empty target list', async () => {
		const result = await handleHonoApiUsersRelation({ db }, { id: meId }, { userId: [] });

		expect(result).toEqual([]);
		for (const mock of [
			listFollowingsMock,
			listFollowersMock,
			listOutgoingRequestsMock,
			listIncomingRequestsMock,
			listBlockeesMock,
			listBlockersMock,
			listMuteesMock,
			listRenoteMuteesMock,
		]) {
			expect(mock).not.toHaveBeenCalled();
		}
	});
});
