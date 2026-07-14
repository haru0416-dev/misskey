/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

const {
	fetchUserByIdOrFailFromDatabaseMock,
	followingExistsInDatabaseMock,
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock,
} = vi.hoisted(() => ({
	fetchUserByIdOrFailFromDatabaseMock: vi.fn(),
	followingExistsInDatabaseMock: vi.fn(),
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock: vi.fn(),
}));

vi.mock('@/core/FollowingStore.js', () => ({
	followingExistsInDatabase: followingExistsInDatabaseMock,
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase: listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock,
	listFollowingsByFollowerIdsAndFolloweeIdsFromDatabase: vi.fn(),
}));

vi.mock('@/core/UserStore.js', () => ({
	fetchUserByIdOrFailFromDatabase: fetchUserByIdOrFailFromDatabaseMock,
}));

import { filterVisibleNotesForHonoApi } from '@/server/rest/note.js';

const viewerId = '019f587c6bc4785ead8d511d603959f0';
const followedId = '019f587c6bc4785ead8d511d603959f1';
const strangerId = '019f587c6bc4785ead8d511d603959f2';
const remoteId = '019f587c6bc4785ead8d511d603959f3';

function createNote(id: string, userId: string, visibility: MiNote['visibility'], options: Partial<MiNote> = {}): MiNote {
	return {
		id,
		userId,
		userHost: null,
		visibility,
		visibleUserIds: [],
		mentions: [],
		reply: null,
		...options,
	} as unknown as MiNote;
}

describe('filterVisibleNotesForHonoApi', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock.mockResolvedValue([followedId]);
		fetchUserByIdOrFailFromDatabaseMock.mockResolvedValue({ id: viewerId, host: null } as MiUser);
	});

	test('batches followers visibility lookups across notes', async () => {
		const publicNote = createNote('public', strangerId, 'public');
		const followedNote = createNote('followed', followedId, 'followers');
		const strangerNote = createNote('stranger', strangerId, 'followers');
		const remoteNote = createNote('remote', remoteId, 'followers', { userHost: 'remote.example' });
		const ownNote = createNote('own', viewerId, 'followers');
		const mentionedNote = createNote('mentioned', strangerId, 'followers', { mentions: [viewerId] });

		const visibleNotes = await filterVisibleNotesForHonoApi(
			{ db: {} as MiDrizzleDatabase } as Parameters<typeof filterVisibleNotesForHonoApi>[0],
			[publicNote, followedNote, strangerNote, remoteNote, ownNote, mentionedNote],
			viewerId,
		);

		expect(visibleNotes).toEqual([publicNote, followedNote, ownNote, mentionedNote]);
		expect(listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock).toHaveBeenCalledOnce();
		expect(listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock).toHaveBeenCalledWith(
			expect.anything(),
			viewerId,
			[followedId, strangerId, remoteId],
		);
		expect(fetchUserByIdOrFailFromDatabaseMock).toHaveBeenCalledOnce();
		expect(followingExistsInDatabaseMock).not.toHaveBeenCalled();
	});

	test('preserves remote-to-remote followers visibility', async () => {
		const remoteNote = createNote('remote', remoteId, 'followers', { userHost: 'remote.example' });
		fetchUserByIdOrFailFromDatabaseMock.mockResolvedValue({ id: viewerId, host: 'viewer.example' } as MiUser);
		listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock.mockResolvedValue([]);

		const visibleNotes = await filterVisibleNotesForHonoApi(
			{ db: {} as MiDrizzleDatabase } as Parameters<typeof filterVisibleNotesForHonoApi>[0],
			[remoteNote],
			viewerId,
		);

		expect(visibleNotes).toEqual([remoteNote]);
	});

	test('does not query relationships for anonymous viewers', async () => {
		const publicNote = createNote('public', strangerId, 'public');
		const followersNote = createNote('followers', followedId, 'followers');

		const visibleNotes = await filterVisibleNotesForHonoApi(
			{ db: {} as MiDrizzleDatabase } as Parameters<typeof filterVisibleNotesForHonoApi>[0],
			[publicNote, followersNote],
			null,
		);

		expect(visibleNotes).toEqual([publicNote]);
		expect(listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabaseMock).not.toHaveBeenCalled();
		expect(fetchUserByIdOrFailFromDatabaseMock).not.toHaveBeenCalled();
		expect(followingExistsInDatabaseMock).not.toHaveBeenCalled();
	});
});
