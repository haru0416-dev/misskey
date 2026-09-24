/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { genId } from '@/misc/id/gen-id.js';
import { createNoteInDatabase, openTestDatabase } from '../fixtures.js';
import type { TestDatabase } from '../fixtures.js';
import { api, role, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

// limit 1 の検索は、まず新しい順に 500 件だけ読んで探し、そろわなければ全体を探す。
// その境目の前後を通すため、窓より多い投稿を用意する。
const NEWER_NOTES = 510;

describe('notes/search の窓と全体検索', () => {
	let db: TestDatabase;
	let searcher: misskey.entities.SignupResponse;
	let author: misskey.entities.SignupResponse;
	let muted: misskey.entities.SignupResponse;
	const suffix = Date.now().toString(36).slice(-6);
	const beyondTerm = `beyond${suffix}`;
	const filteredTerm = `filtered${suffix}`;
	const denseTerm = `dense${suffix}`;
	let beyondNoteId: string;
	let filteredOldNoteId: string;
	const denseNoteIds: string[] = [];

	const insertNote = async (userId: string, text: string) => {
		const id = genId();
		await createNoteInDatabase(db, { id, userId, userHost: null, text, visibility: 'public' });
		return id;
	};

	beforeAll(async () => {
		db = openTestDatabase();
		const root = await signup({ username: 'root' });
		searcher = await signup({ username: 'searcher' });
		author = await signup({ username: 'author' });
		muted = await signup({ username: 'muted' });
		const searchRole = await role(root, {}, { canSearchNotes: { priority: 1, useDefault: false, value: true } });
		await api('admin/roles/assign', { userId: searcher.id, roleId: searchRole.id }, root);
		await api('mute/create', { userId: muted.id }, searcher);

		// 窓の外 (古い側) にだけ一致する投稿。
		beyondNoteId = await insertNote(author.id, `old ${beyondTerm}`);
		filteredOldNoteId = await insertNote(author.id, `old ${filteredTerm}`);
		for (let index = 0; index < NEWER_NOTES; index++) {
			await insertNote(author.id, index % 2 === 0 ? `filler ${index}` : `filler ${index} ${denseTerm}`);
		}
		// 窓の中の一致はミュート中の利用者のものだけ。
		await insertNote(muted.id, `new ${filteredTerm}`);
		for (const id of await Promise.all([
			insertNote(author.id, `new ${denseTerm} 1`),
			insertNote(author.id, `new ${denseTerm} 2`),
		])) {
			denseNoteIds.push(id);
		}
		denseNoteIds.sort().reverse();
	}, 120_000);

	afterAll(async () => {
		await db.close();
	});

	const search = async (params: { query: string } & Record<string, unknown>) => {
		const result = await api('notes/search', { limit: 1, ...params }, searcher);
		expect(result.status).toBe(200);
		return result.body.map((note) => note.id);
	};

	test('窓の中で見つかる語は最新の一致を返し、次のページへ進める', async () => {
		expect(await search({ query: denseTerm })).toStrictEqual([denseNoteIds[0]]);
		expect(await search({ query: denseTerm, untilId: denseNoteIds[0] })).toStrictEqual([denseNoteIds[1]]);
	});

	test('窓の外にしか無い語は全体から探す', async () => {
		expect(await search({ query: beyondTerm })).toStrictEqual([beyondNoteId]);
	});

	test('窓の中の一致がミュートで全て除かれると、全体から次に新しい一致を探す', async () => {
		expect(await search({ query: filteredTerm })).toStrictEqual([filteredOldNoteId]);
	});
});
