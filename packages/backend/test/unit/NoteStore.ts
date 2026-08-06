/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	createNoteInDatabase,
	listChildNotesFromDatabase,
	listGlobalTimelineNotesFromDatabase,
	listHybridTimelineNotesFromDatabase,
	listLocalTimelineNotesFromDatabase,
	listUserTimelineNotesFromDatabase,
} from '@/core/NoteStore.js';
import { createRenoteMutingInDatabase } from '@/core/RenoteMutingStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';

describe('NoteStore renote filtering', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('treats CW-only and reply-only renotes as quotes in database queries', async () => {
		const userId = genId();
		const user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id: userId, username: `notestorerenote${userId}`, usernameLower: `notestorerenote${userId}` },
			profile: { userId },
		});
		const sourceId = genId();
		const replyTargetId = genId();
		const pureRenoteId = genId();
		const cwQuoteId = genId();
		const replyQuoteId = genId();
		const fileQuoteId = genId();
		const pollQuoteId = genId();

		await createNoteInDatabase(runtime.db, {
			id: sourceId,
			text: 'source',
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteInDatabase(runtime.db, {
			id: replyTargetId,
			text: 'reply target',
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteInDatabase(runtime.db, {
			id: pureRenoteId,
			renoteId: sourceId,
			renoteUserId: user.id,
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteInDatabase(runtime.db, {
			id: cwQuoteId,
			cw: 'content warning',
			renoteId: sourceId,
			renoteUserId: user.id,
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteInDatabase(runtime.db, {
			id: replyQuoteId,
			replyId: replyTargetId,
			replyUserId: user.id,
			renoteId: sourceId,
			renoteUserId: user.id,
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteInDatabase(runtime.db, {
			id: fileQuoteId,
			fileIds: [genId()],
			renoteId: sourceId,
			renoteUserId: user.id,
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});
		await createNoteInDatabase(runtime.db, {
			id: pollQuoteId,
			hasPoll: true,
			renoteId: sourceId,
			renoteUserId: user.id,
			userId: user.id,
			userHost: null,
			visibility: 'public',
		});

		const timeline = await listUserTimelineNotesFromDatabase(runtime.db, {
			userId: user.id,
			limit: 20,
			withChannelNotes: false,
			withFiles: false,
			withRenotes: false,
			me: null,
			blockedHosts: [],
			mutingChannelIds: [],
		});
		const timelineIds = new Set(timeline.map((note) => note.id));
		expect(timelineIds.has(pureRenoteId)).toBe(false);
		expect(timelineIds.has(cwQuoteId)).toBe(true);
		expect(timelineIds.has(replyQuoteId)).toBe(true);
		expect(timelineIds.has(fileQuoteId)).toBe(true);
		expect(timelineIds.has(pollQuoteId)).toBe(true);

		const children = await listChildNotesFromDatabase(runtime.db, {
			noteId: sourceId,
			limit: 20,
			me: null,
			blockedHosts: [],
		});
		const childIds = new Set(children.map((note) => note.id));
		expect(childIds.has(pureRenoteId)).toBe(false);
		expect(childIds.has(cwQuoteId)).toBe(true);
		expect(childIds.has(replyQuoteId)).toBe(true);
		expect(childIds.has(fileQuoteId)).toBe(true);
		expect(childIds.has(pollQuoteId)).toBe(true);

		const localTimeline = await listLocalTimelineNotesFromDatabase(runtime.db, {
			limit: 20,
			withFiles: false,
			withReplies: true,
			withRenotes: false,
			me: null,
			blockedHosts: [],
		});
		const localTimelineIds = new Set(localTimeline.map((note) => note.id));
		expect(localTimelineIds.has(pureRenoteId)).toBe(false);
		expect(localTimelineIds.has(cwQuoteId)).toBe(true);
		expect(localTimelineIds.has(replyQuoteId)).toBe(true);

		const hybridTimeline = await listHybridTimelineNotesFromDatabase(runtime.db, {
			me: user,
			followeeIds: [],
			followingChannelIds: [],
			mutingChannelIds: [],
			limit: 20,
			includeMyRenotes: true,
			includeRenotedMyNotes: true,
			includeLocalRenotes: true,
			withFiles: false,
			withRenotes: false,
			withReplies: true,
			blockedHosts: [],
		});
		const hybridTimelineIds = new Set(hybridTimeline.map((note) => note.id));
		expect(hybridTimelineIds.has(pureRenoteId)).toBe(false);
		expect(hybridTimelineIds.has(cwQuoteId)).toBe(true);
		expect(hybridTimelineIds.has(replyQuoteId)).toBe(true);
	});

	test('renote muting excludes only pure renotes', async () => {
		const viewerId = genId();
		const authorId = genId();
		const viewer = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id: viewerId, username: `notestoreviewer${viewerId}`, usernameLower: `notestoreviewer${viewerId}` },
			profile: { userId: viewerId },
		});
		const author = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id: authorId, username: `notestoreauthor${authorId}`, usernameLower: `notestoreauthor${authorId}` },
			profile: { userId: authorId },
		});
		await createRenoteMutingInDatabase(runtime.db, {
			id: genId(),
			muterId: viewer.id,
			muteeId: author.id,
		});
		const sourceId = genId();
		const pureRenoteId = genId();
		const cwQuoteId = genId();
		const replyQuoteId = genId();
		const fileQuoteId = genId();
		const pollQuoteId = genId();
		await createNoteInDatabase(runtime.db, {
			id: sourceId,
			text: 'muted source',
			userId: author.id,
			userHost: null,
			visibility: 'public',
		});
		for (const values of [
			{ id: pureRenoteId },
			{ id: cwQuoteId, cw: 'content warning' },
			{ id: replyQuoteId, replyId: sourceId, replyUserId: author.id },
			{ id: fileQuoteId, fileIds: [genId()] },
			{ id: pollQuoteId, hasPoll: true },
		]) {
			await createNoteInDatabase(runtime.db, {
				...values,
				renoteId: sourceId,
				renoteUserId: author.id,
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
		}

		const timeline = await listGlobalTimelineNotesFromDatabase(runtime.db, {
			limit: 20,
			withFiles: false,
			withRenotes: true,
			me: viewer,
			blockedHosts: [],
		});
		const timelineIds = new Set(timeline.map((note) => note.id));
		expect(timelineIds.has(pureRenoteId)).toBe(false);
		expect(timelineIds.has(cwQuoteId)).toBe(true);
		expect(timelineIds.has(replyQuoteId)).toBe(true);
		expect(timelineIds.has(fileQuoteId)).toBe(true);
		expect(timelineIds.has(pollQuoteId)).toBe(true);
	});
});
