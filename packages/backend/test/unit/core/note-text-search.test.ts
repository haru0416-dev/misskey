/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	createNoteInDatabase,
	defaultNoteTextSearchTuning,
	NoteSearchTimedOutError,
	searchNotesByTextFromDatabase,
} from '@/core/note/note-store.js';
import type { NoteTextSearchTuning } from '@/core/note/note-store.js';
import { createBlockingInDatabase } from '@/core/user/blocking-store.js';
import { createFollowingInDatabase } from '@/core/user/following-store.js';
import { createMutingInDatabase } from '@/core/user/muting-store.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/user-store.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiNote } from '@/models/Note.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';

type SearchOptions = Omit<
	Parameters<typeof searchNotesByTextFromDatabase>[1],
	'query' | 'usePgroonga' | 'useTextIndex'
>;

const HOUR = 60 * 60 * 1000;

// 本文検索は窓の結果と語の見積もりで経路を変える (窓・一致を集めて並べる・範囲に区切る)。
// どの経路でも、trigram index を使わない検索 (全件を新しい順に読んで照合する) と同じ投稿を同じ順で返し、
// ページ送りの続きも一致することを見る。少ない投稿で各経路を通すため、経路を分ける件数を小さくする。
describe('NoteStore text search paths', () => {
	let runtime: RuntimeDependencies;
	const marker = `qz${genId().slice(-10)}`;
	// 一致のほとんどがミュート中の利用者の投稿で、見える一致は古い 1 件だけの語。
	const mutedMarker = `qm${genId().slice(-10)}`;
	let visibleMutedMarkerNoteId: string;
	let me: { id: string };
	const statements: string[] = [];
	let transactions = 0;

	const createUser = async (name: string) => {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `${name}${id}`, usernameLower: `${name}${id}` },
			profile: { userId: id },
		});
	};

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		const db = runtime.db;
		me = await createUser('searcher');
		const [plain, muted, blocker, followee, stranger] = await Promise.all([
			createUser('plain'),
			createUser('muted'),
			createUser('blocker'),
			createUser('followee'),
			createUser('stranger'),
		]);
		await createMutingInDatabase(db, { id: genId(), muterId: me.id, muteeId: muted.id, expiresAt: null });
		await createBlockingInDatabase(db, { id: genId(), blockerId: blocker.id, blockeeId: me.id });
		await createFollowingInDatabase(db, {
			id: genId(),
			followerId: me.id,
			followeeId: followee.id,
			followerHost: null,
			followeeHost: null,
		});

		// 一致する投稿を直近から約 1 年前まで、間隔を不揃いに置く。古い側に固まった塊も作る。
		const authors = [plain, muted, plain, blocker, followee, plain, stranger, plain, me];
		const now = Date.now();
		for (let index = 0; index < 72; index++) {
			const hoursAgo = index < 48 ? index * index * 3 + 5 : 8_000 + index;
			const author = authors[index % authors.length]!;
			const visibility = author === followee || author === stranger ? 'followers' : index % 5 === 0 ? 'home' : 'public';
			await createNoteInDatabase(db, {
				id: genId(now - hoursAgo * HOUR),
				userId: author.id,
				userHost: null,
				visibility,
				text: index % 4 === 0 ? `old ${marker.toUpperCase()} ${index}` : `note ${index} ${marker}`,
				cw: index % 3 === 0 ? 'cw' : null,
			});
			// 一致しない投稿を挟み、窓と範囲に一致の無い区間を作る。
			await createNoteInDatabase(db, {
				id: genId(now - hoursAgo * HOUR - 1),
				userId: plain.id,
				userHost: null,
				visibility: 'public',
				text: `filler ${index}`,
			});
		}
		for (let index = 0; index < 40; index++) {
			await createNoteInDatabase(db, {
				id: genId(now - (index * 37 + 3) * HOUR),
				userId: muted.id,
				userHost: null,
				visibility: 'public',
				text: `muted ${mutedMarker} ${index}`,
			});
		}
		visibleMutedMarkerNoteId = genId(now - 9_000 * HOUR);
		await createNoteInDatabase(db, {
			id: visibleMutedMarkerNoteId,
			userId: plain.id,
			userHost: null,
			visibility: 'public',
			text: `visible ${mutedMarker}`,
		});
		// 最新の投稿は一致しないので、小さい窓は一致を含まない。
		for (let index = 0; index < 5; index++) {
			await createNoteInDatabase(db, {
				id: genId(),
				userId: plain.id,
				userHost: null,
				visibility: 'public',
				text: 'latest',
			});
		}

		// 経路を通ったことを、発行した文 (transaction の中を含む) と transaction の回数で確かめる。
		type RecordedClient = {
			unsafe: (...args: unknown[]) => unknown;
			begin: (callback: (client: RecordedClient) => Promise<unknown>) => Promise<unknown>;
		};
		const record = (client: RecordedClient) => {
			const unsafe = client.unsafe;
			client.unsafe = function (this: unknown, ...args: unknown[]): unknown {
				statements.push(String(args[0]));
				return unsafe.apply(this, args);
			};
		};
		const client = (db as unknown as { $client: RecordedClient }).$client;
		record(client);
		const begin = client.begin;
		client.begin = (callback) => {
			transactions++;
			return begin((tx) => {
				record(tx);
				return callback(tx);
			});
		};
	}, 60_000);

	afterAll(async () => {
		await runtime.dispose();
	});

	// 範囲の一致の id を集める問い合わせ。
	const isRangeMatchQuery = (statement: string) => /^\s*SELECT "note"\."id" FROM "note"\s+WHERE/.test(statement);

	const tunings: Record<string, Partial<NoteTextSearchTuning>> = {
		// 窓が全件を覆う
		window: { windowPerResult: 1_000_000 },
		gin: { windowPerResult: 1, denseTermEstimatedMatches: Number.POSITIVE_INFINITY },
		// 範囲の幅を 1ms から広げるので、範囲の数が多く、一致の無い範囲も通る
		ranges: { windowPerResult: 1, denseTermEstimatedMatches: 0, minimumRangeSpanMs: 1 },
		rangesWide: { windowPerResult: 2, denseTermEstimatedMatches: 0, minimumRangeSpanMs: 2_000 * HOUR },
		// 範囲の一致を 1 件ずつ集め始めるので、同じ範囲を読み直す
		rangesSmallBatch: {
			windowPerResult: 1,
			denseTermEstimatedMatches: 0,
			minimumRangeSpanMs: 2_000 * HOUR,
			rangeMatchBatch: 1,
		},
	};

	const searchPages = async (
		options: SearchOptions,
		useTextIndex: boolean,
		tuning: NoteTextSearchTuning,
		pages: number,
	): Promise<MiNote['id'][][]> => {
		const result: MiNote['id'][][] = [];
		let cursor = options;
		const ascending = options.sinceId != null && options.untilId == null;
		for (let page = 0; page < pages; page++) {
			const notes = await searchNotesByTextFromDatabase(
				runtime.db,
				{ ...cursor, query: marker, usePgroonga: false, useTextIndex },
				tuning,
			);
			result.push(notes.map((note) => note.id));
			const last = notes.at(-1);
			if (last == null) break;
			cursor = ascending ? { ...cursor, sinceId: last.id } : { ...cursor, untilId: last.id };
		}
		return result;
	};

	const optionSets = (): [string, SearchOptions, number][] => [
		['signed in', { me, blockedHosts: [], limit: 3 }, 30],
		['signed in, larger page', { me, blockedHosts: [], limit: 7 }, 12],
		['signed out', { me: null, blockedHosts: [], limit: 4 }, 20],
		['with cw only', { me, blockedHosts: [], limit: 3, withCw: true }, 12],
		['public only', { me, blockedHosts: [], limit: 5, visibility: 'public' }, 12],
		[
			'within a period',
			{
				me,
				blockedHosts: [],
				limit: 3,
				rangeStartId: genId(Date.now() - 2_000 * HOUR),
				rangeEndId: genId(Date.now() - 50 * HOUR),
			},
			12,
		],
		[
			'between ids',
			{
				me,
				blockedHosts: [],
				limit: 3,
				sinceId: genId(Date.now() - 9_000 * HOUR),
				untilId: genId(Date.now() - 100 * HOUR),
			},
			12,
		],
		['oldest first', { me, blockedHosts: [], limit: 3, sinceId: genId(Date.now() - 9_000 * HOUR) }, 12],
		['without sensitive files', { me, blockedHosts: [], limit: 5, withSensitiveFiles: false }, 12],
		['with sensitive files only', { me, blockedHosts: [], limit: 5, withSensitiveFiles: true }, 2],
	];

	for (const [name, tuning] of Object.entries(tunings)) {
		test(`${name}: finds the same notes in the same order on every page`, async () => {
			const effective = { ...defaultNoteTextSearchTuning, ...tuning };
			let compared = 0;
			for (const [label, options, pages] of optionSets()) {
				const expected = await searchPages(options, false, effective, pages);
				const actual = await searchPages(options, true, effective, pages);
				expect(actual, label).toStrictEqual(expected);
				compared += expected.flat().length;
			}
			// 比べた件数が少ないと、経路の違いを見分けられない。
			expect(compared).toBeGreaterThan(80);
		});
	}

	// 前段の一致はほぼ全てミュートで落ちる。集める件数を増やしながら読み直して、古い 1 件にたどり着く。
	test('reaches the only visible match behind matches that are all muted', async () => {
		const search = (useTextIndex: boolean, tuning: Partial<NoteTextSearchTuning>) =>
			searchNotesByTextFromDatabase(
				runtime.db,
				{ me, blockedHosts: [], limit: 3, query: mutedMarker, usePgroonga: false, useTextIndex, timeLimitMs: 10_000 },
				{ ...defaultNoteTextSearchTuning, ...tuning },
			);
		expect((await search(false, {})).map((note) => note.id)).toStrictEqual([visibleMutedMarkerNoteId]);
		expect((await search(true, tunings['ranges']!)).map((note) => note.id)).toStrictEqual([visibleMutedMarkerNoteId]);
		statements.length = 0;
		expect((await search(true, tunings['rangesSmallBatch']!)).map((note) => note.id)).toStrictEqual([
			visibleMutedMarkerNoteId,
		]);
		// 1 件ずつ集め始めても、同じ範囲を読み直すたびに集める件数を増やすので、40 件の一致を 1 件ずつ読み直さない。
		expect(statements.filter(isRangeMatchQuery).length).toBeLessThan(12);
	});

	// 投稿の行だけで判定できる条件は範囲の一致を集める段にも載せ、全件が後段で落ちる読み直しを起こさない。
	test('filters sensitive files while collecting range matches', async () => {
		statements.length = 0;
		const notes = await searchNotesByTextFromDatabase(
			runtime.db,
			{
				me,
				blockedHosts: [],
				limit: 3,
				query: marker,
				usePgroonga: false,
				useTextIndex: true,
				withSensitiveFiles: true,
			},
			{ ...defaultNoteTextSearchTuning, ...tunings['ranges']! },
		);
		expect(notes).toStrictEqual([]);
		expect(statements.some(isRangeMatchQuery)).toBe(true);
		expect(statements.filter((statement) => statement.includes('"note"."id" = ANY('))).toHaveLength(0);
	});

	test('gives up with NoteSearchTimedOutError when the ranges exceed the time limit', async () => {
		await expect(
			searchNotesByTextFromDatabase(
				runtime.db,
				{ me, blockedHosts: [], limit: 3, query: mutedMarker, usePgroonga: false, useTextIndex: true, timeLimitMs: 0 },
				{ ...defaultNoteTextSearchTuning, ...tunings['ranges']! },
			),
		).rejects.toBeInstanceOf(NoteSearchTimedOutError);
	});

	test('each tuning takes its intended path', async () => {
		const run = async (tuning: Partial<NoteTextSearchTuning>) => {
			statements.length = 0;
			transactions = 0;
			await searchNotesByTextFromDatabase(
				runtime.db,
				{ me, blockedHosts: [], limit: 3, query: marker, usePgroonga: false, useTextIndex: true },
				{ ...defaultNoteTextSearchTuning, ...tuning },
			);
			return {
				window: statements.some((statement) => statement.includes('(SELECT * FROM "note" WHERE')),
				gin: statements.some((statement) => statement.includes(`("note"."id" || '')`)),
				ranges: statements.some((statement) => statement.includes(`set_config('enable_indexscan', 'off', true)`)),
				transactions,
			};
		};
		expect(await run(tunings['window']!)).toStrictEqual({ window: true, gin: false, ranges: false, transactions: 0 });
		expect(await run(tunings['gin']!)).toStrictEqual({ window: true, gin: true, ranges: false, transactions: 0 });
		expect(await run(tunings['ranges']!)).toStrictEqual({ window: true, gin: false, ranges: true, transactions: 1 });
	});
});
