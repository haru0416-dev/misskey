/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	countAntennasByUserIdFromDatabase,
	createAntennasWithinLimitInDatabase,
	listAntennasByUserIdFromDatabase,
} from '@/core/AntennaStore.js';
import { countClipNotesByClipIdFromDatabase, createClipNoteWithinLimitInDatabase } from '@/core/ClipNoteStore.js';
import {
	countClipsByUserIdFromDatabase,
	createClipInDatabase,
	createClipWithinLimitInDatabase,
} from '@/core/ClipStore.js';
import { fetchNoteByIdOrFailFromDatabase } from '@/core/NoteStore.js';
import {
	countRegistrationTicketsCreatedSinceFromDatabase,
	createRegistrationTicketWithinLimitInDatabase,
} from '@/core/RegistrationTicketStore.js';
import {
	createUserNotePiningWithinLimitInDatabase,
	listUserNotePiningsByUserIdFromDatabase,
} from '@/core/UserNotePiningStore.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { post, signup } from '../utils.js';
import type * as Misskey from 'misskey-js';

const barrierKeys = {
	pin: 72_101,
	antenna: 72_102,
	clip: 72_103,
	clipNote: 72_104,
	invitation: 72_105,
} as const;

describe('count-check-insert limits', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let user: Misskey.entities.SignupResponse;

	async function runBehindInsertBarrier<T>(key: number, action: () => Promise<T>): Promise<T> {
		const blocker = await pool.connect();
		try {
			await blocker.query('BEGIN');
			await blocker.query('SELECT pg_advisory_xact_lock($1)', [key]);
			const result = action();

			for (;;) {
				const waiting = await pool.query<{ count: string }>(
					`
					SELECT count(*)::text AS count
					FROM pg_locks
					WHERE locktype = 'advisory'
						AND objid = $1
						AND NOT granted
				`,
					[key],
				);
				if (Number(waiting.rows[0]?.count ?? 0) > 0) break;
				await new Promise<void>((resolve) => setImmediate(resolve));
			}

			await blocker.query('COMMIT');
			return await result;
		} finally {
			blocker.release();
		}
	}

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		user = await signup({ username: 'limit_insert_races' });

		await pool.query(`
			CREATE OR REPLACE FUNCTION test_limit_insert_barrier() RETURNS trigger AS $$
			BEGIN
				IF NEW.id LIKE 'limit-race-%' THEN
					PERFORM pg_advisory_xact_lock(TG_ARGV[0]::integer);
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql
		`);
		for (const [table, key] of [
			['user_note_pining', barrierKeys.pin],
			['antenna', barrierKeys.antenna],
			['clip', barrierKeys.clip],
			['clip_note', barrierKeys.clipNote],
			['registration_ticket', barrierKeys.invitation],
		] as const) {
			await pool.query(`
				CREATE TRIGGER test_limit_insert_barrier
				BEFORE INSERT ON "${table}"
				FOR EACH ROW EXECUTE FUNCTION test_limit_insert_barrier('${key}')
			`);
		}
	});

	afterAll(async () => {
		for (const table of ['user_note_pining', 'antenna', 'clip', 'clip_note', 'registration_ticket']) {
			await pool.query(`DROP TRIGGER IF EXISTS test_limit_insert_barrier ON "${table}"`);
		}
		await pool.query('DROP FUNCTION IF EXISTS test_limit_insert_barrier()');
		await pool.end();
	});

	test('account pin limit serializes concurrent inserts', async () => {
		const notes = await Promise.all([post(user, { text: 'pin race 1' }), post(user, { text: 'pin race 2' })]);
		const results = await runBehindInsertBarrier(
			barrierKeys.pin,
			async () =>
				await Promise.all(
					notes.map((note, index) =>
						createUserNotePiningWithinLimitInDatabase(
							db,
							{
								id: `limit-race-pin-${index}`,
								userId: user.id,
								noteId: note.id,
							},
							1,
						),
					),
				),
		);

		expect(results.sort()).toStrictEqual(['created', 'limitExceeded']);
		expect((await listUserNotePiningsByUserIdFromDatabase(db, user.id)).length).toBe(1);
	});

	test('antenna create limit serializes concurrent inserts', async () => {
		const results = await runBehindInsertBarrier(
			barrierKeys.antenna,
			async () =>
				await Promise.all(
					[0, 1].map((index) =>
						createAntennasWithinLimitInDatabase(
							db,
							user.id,
							[
								{
									id: `limit-race-antenna-${index}`,
									lastUsedAt: new Date(),
									name: `race ${index}`,
									src: 'all',
									users: [],
									keywords: [['race']],
									excludeKeywords: [],
									withFile: false,
								},
							],
							async () => 1,
						),
					),
				),
		);

		expect(results.map((result) => result.status).sort()).toStrictEqual(['created', 'limitExceeded']);
		expect(await countAntennasByUserIdFromDatabase(db, user.id)).toBe(1);
	});

	test('antenna bulk import is atomic against a concurrent create', async () => {
		const bulkUser = await signup({ username: 'limit_bulk_antennas' });
		const createValues = (id: string) => ({
			id,
			lastUsedAt: new Date(),
			name: id,
			src: 'all' as const,
			users: [],
			keywords: [['race']],
			excludeKeywords: [],
			withFile: false,
		});
		const results = await runBehindInsertBarrier(
			barrierKeys.antenna,
			async () =>
				await Promise.all([
					createAntennasWithinLimitInDatabase(
						db,
						bulkUser.id,
						[createValues('limit-race-antenna-bulk-1'), createValues('limit-race-antenna-bulk-2')],
						async () => 2,
					),
					createAntennasWithinLimitInDatabase(
						db,
						bulkUser.id,
						[createValues('limit-race-antenna-single')],
						async () => 2,
					),
				]),
		);

		expect(results.map((result) => result.status).sort()).toStrictEqual(['created', 'limitExceeded']);
		const imported = await listAntennasByUserIdFromDatabase(db, bulkUser.id);
		const bulkCount = imported.filter((item) => item.id.startsWith('limit-race-antenna-bulk-')).length;
		assert.ok(bulkCount === 0 || bulkCount === 2, `bulk import was partially committed: ${bulkCount}`);
		assert.ok(imported.length <= 2);
	});

	test('clip create limit serializes concurrent inserts', async () => {
		const results = await runBehindInsertBarrier(
			barrierKeys.clip,
			async () =>
				await Promise.all(
					[0, 1].map((index) =>
						createClipWithinLimitInDatabase(
							db,
							{
								id: `limit-race-clip-${index}`,
								userId: user.id,
								name: `race ${index}`,
							},
							1,
						),
					),
				),
		);

		expect(results.filter((result) => result != null).length).toBe(1);
		expect(await countClipsByUserIdFromDatabase(db, user.id)).toBe(1);
	});

	test('clip note limit serializes concurrent inserts and keeps counters atomic', async () => {
		const owner = await signup({ username: 'limit_clip_notes' });
		const clip = await createClipInDatabase(db, {
			id: 'clip-note-race-owner',
			userId: owner.id,
			name: 'race owner',
		});
		const notes = await Promise.all([post(owner, { text: 'clip race 1' }), post(owner, { text: 'clip race 2' })]);
		const results = await runBehindInsertBarrier(
			barrierKeys.clipNote,
			async () =>
				await Promise.all(
					notes.map((note, index) =>
						createClipNoteWithinLimitInDatabase(
							db,
							{
								id: `limit-race-clip-note-${index}`,
								clipId: clip.id,
								noteId: note.id,
							},
							1,
						),
					),
				),
		);

		expect(results.sort()).toStrictEqual(['created', 'tooManyClipNotes']);
		expect(await countClipNotesByClipIdFromDatabase(db, clip.id)).toBe(1);
		const clippedCounts = await Promise.all(
			notes.map(async (note) => (await fetchNoteByIdOrFailFromDatabase(db, note.id)).clippedCount),
		);
		expect(clippedCounts.reduce((sum, count) => sum + count, 0)).toBe(1);
	});

	test('invitation create limit serializes concurrent inserts', async () => {
		const results = await runBehindInsertBarrier(
			barrierKeys.invitation,
			async () =>
				await Promise.all(
					[0, 1].map((index) =>
						createRegistrationTicketWithinLimitInDatabase(
							db,
							{
								id: `limit-race-invite-${index}`,
								createdById: user.id,
								code: `limit-race-code-${index}`,
								expiresAt: null,
							},
							{ sinceId: '', limit: 1 },
						),
					),
				),
		);

		expect(results.filter((result) => result != null).length).toBe(1);
		expect(await countRegistrationTicketsCreatedSinceFromDatabase(db, { createdById: user.id, sinceId: '' })).toBe(1);
	});
});
