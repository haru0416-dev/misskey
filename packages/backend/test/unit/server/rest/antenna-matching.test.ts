/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fc from 'fast-check';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';

const {
	listActiveAntennasFromDatabaseMock,
	listActiveAntennasFromDatabaseCachedByVersionMock,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock,
	listUserListIdsContainingUserFromDatabaseMock,
} = vi.hoisted(() => ({
	listActiveAntennasFromDatabaseMock: vi.fn(),
	listActiveAntennasFromDatabaseCachedByVersionMock: vi.fn(),
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock: vi.fn(),
	listUserListIdsContainingUserFromDatabaseMock: vi.fn(),
}));

vi.mock('@/core/antenna/antenna-store.js', () => ({
	appendUserToAntennasInDatabase: vi.fn(),
	countAntennasByUserIdFromDatabase: vi.fn(),
	createAntennaInDatabase: vi.fn(),
	deleteAntennaFromDatabase: vi.fn(),
	fetchAntennaByIdAndUserIdFromDatabase: vi.fn(),
	fetchAntennaByIdOrFailFromDatabase: vi.fn(),
	listActiveAntennasFromDatabase: listActiveAntennasFromDatabaseMock,
	listActiveAntennasFromDatabaseCachedByVersion: listActiveAntennasFromDatabaseCachedByVersionMock,
	listAntennasByIdsFromDatabase: vi.fn(),
	listAntennasByUserIdFromDatabase: vi.fn(),
	updateAntennaInDatabase: vi.fn(),
}));

vi.mock('@/core/user/following-store.js', () => ({
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase: listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock,
}));

vi.mock('@/core/user/user-list-membership-store.js', () => ({
	listUserListIdsContainingUserFromDatabase: listUserListIdsContainingUserFromDatabaseMock,
}));

import { addNoteToAntennas, antennaUsersIncludes } from '@/core/antenna/antenna-delivery.js';

const authorId = '019f587c6bc4785ead8d511d603959f0';
const followerId = '019f587c6bc4785ead8d511d603959f1';
const strangerId = '019f587c6bc4785ead8d511d603959f2';

const config = { runtime: { host: 'local.example' } } as Parameters<typeof addNoteToAntennas>[0]['config'];

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

function createDeps(pushFanoutTimelines = vi.fn(async () => 0), publishAntennaStream = vi.fn()) {
	return {
		config,
		db: {} as MiDrizzleDatabase,
		redisForTimelines: {
			defineCommand: vi.fn(),
			tonerikoPushFanoutTimelines: pushFanoutTimelines,
		} as unknown as Parameters<typeof addNoteToAntennas>[0]['redisForTimelines'],
		publishAntennaStream,
	};
}

describe('addNoteToAntennas', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listUserListIdsContainingUserFromDatabaseMock.mockResolvedValue(new Set());
		listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock.mockResolvedValue([followerId]);
	});

	test('batches followers visibility checks for antenna owners', async () => {
		const followerAntenna = createAntenna('follower-antenna', followerId);
		const strangerAntenna = createAntenna('stranger-antenna', strangerId);
		const authorAntenna = createAntenna('author-antenna', authorId);
		listActiveAntennasFromDatabaseMock.mockResolvedValue([followerAntenna, strangerAntenna, authorAntenna]);
		const publishAntennaStream = vi.fn();
		const pushFanoutTimelines = vi.fn(async () => 0);
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

		await addNoteToAntennas(
			createDeps(pushFanoutTimelines, publishAntennaStream),
			note,
			{ id: authorId, username: 'author', host: null, isBot: false },
			null,
		);

		expect(listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock).toHaveBeenCalledOnce();
		expect(listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock).toHaveBeenCalledWith(
			expect.anything(),
			authorId,
			[followerId, strangerId],
		);
		expect(publishAntennaStream).toHaveBeenCalledTimes(2);
		expect(publishAntennaStream).toHaveBeenCalledWith(followerAntenna.id, 'note', note);
		expect(publishAntennaStream).toHaveBeenCalledWith(authorAntenna.id, 'note', note);
		expect(pushFanoutTimelines).toHaveBeenCalledOnce();
		expect(pushFanoutTimelines).toHaveBeenCalledWith(
			2,
			`list:antennaTimeline:${followerAntenna.id}`,
			`list:antennaTimeline:${authorAntenna.id}`,
			note.id,
			'1',
			200,
			200,
		);
	});

	test('skips the followers query when every candidate fails an earlier condition', async () => {
		const antenna = createAntenna('bot-excluding-antenna', followerId);
		antenna.excludeBots = true;
		listActiveAntennasFromDatabaseMock.mockResolvedValue([antenna]);
		const pushFanoutTimelines = vi.fn(async () => 0);
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

		await addNoteToAntennas(
			createDeps(pushFanoutTimelines),
			note,
			{ id: authorId, username: 'bot', host: null, isBot: true },
			null,
		);

		expect(listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock).not.toHaveBeenCalled();
		expect(pushFanoutTimelines).not.toHaveBeenCalled();
	});

	test('reads the list through the version cache only when the version is known', async () => {
		const antenna = createAntenna('cached-antenna', followerId);
		listActiveAntennasFromDatabaseCachedByVersionMock.mockResolvedValue([antenna]);
		listActiveAntennasFromDatabaseMock.mockResolvedValue([]);
		const publishAntennaStream = vi.fn();
		const note = {
			id: genId(),
			userId: authorId,
			visibility: 'public',
			visibleUserIds: [],
			replyId: null,
			text: 'cached',
			cw: null,
			fileIds: [],
			channel: null,
		} as unknown as MiNote;
		const noteUser = { id: authorId, username: 'author', host: null, isBot: false };

		await addNoteToAntennas(createDeps(undefined, publishAntennaStream), note, noteUser, 7);
		expect(listActiveAntennasFromDatabaseCachedByVersionMock).toHaveBeenCalledWith(expect.anything(), 7);
		expect(listActiveAntennasFromDatabaseMock).not.toHaveBeenCalled();
		expect(publishAntennaStream).toHaveBeenCalledWith(antenna.id, 'note', note);

		vi.clearAllMocks();
		listUserListIdsContainingUserFromDatabaseMock.mockResolvedValue(new Set());
		await addNoteToAntennas(createDeps(undefined, publishAntennaStream), note, noteUser, null);
		expect(listActiveAntennasFromDatabaseMock).toHaveBeenCalledOnce();
		expect(listActiveAntennasFromDatabaseCachedByVersionMock).not.toHaveBeenCalled();
		expect(publishAntennaStream).not.toHaveBeenCalled();
	});
});

/*
 * 同期照合 (DB を引かず、キーワードの前処理をアンテナごとに使い回す形) が、
 * 1 アンテナずつ DB でフォロー・リスト所属を確かめていた照合と同じ結果になることを確かめる。
 * referenceCheckHitAntenna は前処理の共有・hint を持たない照合をそのまま写したもので、
 * DB の参照だけを relations の引き当てに置き換えている。
 */
type Relations = {
	/** 投稿者をフォローしている利用者 */
	followerIds: Set<string>;
	/** 投稿者が入っているリスト */
	listIds: Set<string>;
};

type NoteUser = { id: string; username: string; host: string | null; isBot: boolean };

function referenceCheckHitAntenna(antenna: MiAntenna, note: MiNote, noteUser: NoteUser, relations: Relations) {
	if (antenna.excludeNotesInSensitiveChannel && note.channel?.isSensitive) return false;
	if (antenna.excludeBots && noteUser.isBot) return false;
	if (antenna.localOnly && noteUser.host != null) return false;
	if (!antenna.withReplies && note.replyId != null) return false;

	if (note.visibility === 'specified') {
		if (note.userId !== antenna.userId) {
			if (note.visibleUserIds == null) return false;
			if (!note.visibleUserIds.includes(antenna.userId)) return false;
		}
	}
	if (note.visibility === 'followers') {
		const isFollowing = relations.followerIds.has(antenna.userId);
		if (!isFollowing && antenna.userId !== note.userId) return false;
	}

	if (antenna.src === 'home') {
		if (note.userId !== antenna.userId) {
			if (!relations.followerIds.has(antenna.userId)) return false;
		}
	} else if (antenna.src === 'list') {
		if (antenna.userListId == null) return false;
		if (!relations.listIds.has(antenna.userListId)) return false;
	} else if (antenna.src === 'users') {
		if (!antennaUsersIncludes(config, antenna.users, noteUser)) return false;
	} else if (antenna.src === 'users_blacklist') {
		if (antennaUsersIncludes(config, antenna.users, noteUser)) return false;
	}

	const compact = (matrix: string[][]) =>
		matrix.map((group) => group.filter((keyword) => keyword !== '')).filter((group) => group.length > 0);
	const matches = (text: string, matrix: string[][], caseSensitive: boolean) => {
		const haystack = caseSensitive ? text : text.toLowerCase();
		return matrix.some((group) =>
			group.every((keyword) => haystack.includes(caseSensitive ? keyword : keyword.toLowerCase())),
		);
	};
	const keywords = compact(antenna.keywords);
	const excludeKeywords = compact(antenna.excludeKeywords);
	if (keywords.length > 0 || excludeKeywords.length > 0) {
		if (note.text == null && note.cw == null) return false;
		const text = (note.text ?? '') + '\n' + (note.cw ?? '');
		if (keywords.length > 0 && !matches(text, keywords, antenna.caseSensitive)) return false;
		if (excludeKeywords.length > 0 && matches(text, excludeKeywords, antenna.caseSensitive)) return false;
	}

	if (antenna.withFile && note.fileIds?.length === 0) return false;
	return true;
}

describe('synchronous antenna matching against the per-antenna reference', () => {
	const userIds = ['user-0', 'user-1', 'user-2', 'user-3'];
	const listIds = ['list-0', 'list-1', 'list-2'];
	// 大文字小文字の変換で長さや形が変わる文字 (ß, İ) と、区切りの空白を混ぜる。
	const word = fc.string({ unit: fc.constantFrom('a', 'A', 'b', 'B', 'ß', 'İ', 'i', ' '), maxLength: 3 });
	const keywordMatrix = fc.array(fc.array(word, { maxLength: 3 }), { maxLength: 3 });
	// 絞り込みの条件が全部同じ確率で立つと、ほとんどのアンテナが前段で外れてキーワード照合まで届かない。
	const rarely = fc.constantFrom(false, false, false, true);
	const antennaArbitrary = fc.record({
		userId: fc.constantFrom(...userIds),
		src: fc.constantFrom('home', 'all', 'users', 'list', 'users_blacklist'),
		userListId: fc.option(fc.constantFrom(...listIds)),
		users: fc.subarray([
			'author',
			'@author',
			'AUTHOR@local.example',
			'author@remote.example',
			'*@remote.example',
			'*@local.example',
			'other@remote.example',
		]),
		keywords: keywordMatrix,
		excludeKeywords: keywordMatrix,
		caseSensitive: fc.boolean(),
		excludeBots: rarely,
		withReplies: fc.constantFrom(true, true, true, false),
		withFile: rarely,
		localOnly: rarely,
		excludeNotesInSensitiveChannel: rarely,
	});
	const noteArbitrary = fc.record({
		visibility: fc.constantFrom('public', 'home', 'followers', 'specified'),
		visibleUserIds: fc.option(fc.subarray(userIds), { nil: null }),
		replyId: fc.option(fc.constant('reply-id'), { nil: null }),
		text: fc.option(
			fc.string({ unit: fc.constantFrom('a', 'A', 'b', 'B', 'ß', 'ss', 'İ', 'i̇', 'i', ' '), maxLength: 8 }),
			{
				nil: null,
			},
		),
		cw: fc.option(fc.string({ unit: fc.constantFrom('a', 'B', 'İ', ' '), maxLength: 4 }), { nil: null }),
		fileIds: fc.constantFrom([], ['file-id']),
		channel: fc.option(fc.record({ isSensitive: fc.boolean() }), { nil: null }),
	});

	test('every antenna, note and relation gives the same hits', async () => {
		let hits = 0;
		let misses = 0;
		let keywordDecided = 0;
		await fc.assert(
			fc.asyncProperty(
				fc.array(antennaArbitrary, { minLength: 1, maxLength: 12 }),
				fc.array(noteArbitrary, { minLength: 1, maxLength: 4 }),
				fc.record({
					authorId: fc.constantFrom(...userIds),
					username: fc.constantFrom('author', 'Author', 'other'),
					host: fc.constantFrom(null, 'remote.example', 'REMOTE.example'),
					isBot: fc.boolean(),
				}),
				fc.subarray(userIds),
				fc.subarray(listIds),
				async (antennaValues, noteValues, author, followerIds, memberListIds) => {
					// キャッシュした一覧と同じく、凍結した同じオブジェクトを複数の投稿で使い回す。
					const antennas = Object.freeze(
						antennaValues.map((values, index) => Object.freeze({ ...values, id: `antenna-${index}` }) as MiAntenna),
					);
					const relations: Relations = { followerIds: new Set(followerIds), listIds: new Set(memberListIds) };
					const noteUser: NoteUser = {
						id: author.authorId,
						username: author.username,
						host: author.host,
						isBot: author.isBot,
					};
					listActiveAntennasFromDatabaseCachedByVersionMock.mockResolvedValue(antennas);
					listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabaseMock.mockImplementation(
						async (_db: unknown, followeeId: string, candidates: string[]) => {
							expect(followeeId).toBe(noteUser.id);
							return candidates.filter((candidate) => relations.followerIds.has(candidate));
						},
					);
					listUserListIdsContainingUserFromDatabaseMock.mockImplementation(
						async (_db: unknown, userId: string, candidates: string[]) => {
							expect(userId).toBe(noteUser.id);
							return new Set(candidates.filter((candidate) => relations.listIds.has(candidate)));
						},
					);

					for (const values of noteValues) {
						const note = { ...values, id: genId(), userId: noteUser.id } as unknown as MiNote;
						const publishAntennaStream = vi.fn();
						await addNoteToAntennas(createDeps(undefined, publishAntennaStream), note, noteUser, 1);

						const expected = antennas
							.filter((antenna) => referenceCheckHitAntenna(antenna, note, noteUser, relations))
							.map((antenna) => antenna.id);
						expect(publishAntennaStream.mock.calls.map(([antennaId]) => antennaId)).toEqual(expected);

						hits += expected.length;
						misses += antennas.length - expected.length;
						for (const antenna of antennas) {
							const withoutKeywords = { ...antenna, keywords: [], excludeKeywords: [] } as MiAntenna;
							if (
								referenceCheckHitAntenna(withoutKeywords, note, noteUser, relations) !==
								referenceCheckHitAntenna(antenna, note, noteUser, relations)
							) {
								keywordDecided++;
							}
						}
					}
				},
			),
			{ numRuns: 1000 },
		);
		// 前段の条件だけで全件が外れると、キーワード照合の差を見ないまま通る。
		expect(hits).toBeGreaterThan(500);
		expect(misses).toBeGreaterThan(5000);
		expect(keywordDecided).toBeGreaterThan(700);
	});
});
