/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import * as assert from 'node:assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { api, initTestDb, post, signup } from '../utils.js';
import type * as Misskey from 'misskey-js';

const deleteBlockers = {
	note: {
		functionName: 'test_block_note_delete',
		triggerName: 'test_block_note_delete',
		advisoryLockKey: 71001,
		queryPattern: 'delete from "note"%',
	},
	clip_note: {
		functionName: 'test_block_clip_note_delete',
		triggerName: 'test_block_clip_note_delete',
		advisoryLockKey: 71002,
		queryPattern: 'delete from "clip_note"%',
	},
} as const;

async function waitForBlockedDeletes(pool: MiDrizzlePool, queryPattern: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const result = await pool.query<{ count: number }>(`
			SELECT count(*)::int AS count
			FROM pg_stat_activity
			WHERE datname = current_database()
				AND wait_event = 'advisory'
				AND query LIKE $1
		`, [queryPattern]);
		if (result.rows[0]?.count === 2) return;
		await new Promise<void>(resolve => setImmediate(resolve));
	}

	throw new Error(`Timed out waiting for concurrent deletes matching ${queryPattern}`);
}

async function runAfterBothDeletesStart<T>(
	pool: MiDrizzlePool,
	table: keyof typeof deleteBlockers,
	actions: readonly [() => Promise<T>, () => Promise<T>],
): Promise<[T, T]> {
	const blocker = deleteBlockers[table];
	const lockClient = await pool.connect();
	let lockHeld = false;

	await pool.query(`
		CREATE OR REPLACE FUNCTION "${blocker.functionName}"() RETURNS trigger AS $$
		BEGIN
			PERFORM pg_advisory_xact_lock(${blocker.advisoryLockKey});
			RETURN NULL;
		END;
		$$ LANGUAGE plpgsql
	`);
	await pool.query(`
		CREATE TRIGGER "${blocker.triggerName}"
		BEFORE DELETE ON "${table}"
		FOR EACH STATEMENT EXECUTE FUNCTION "${blocker.functionName}"()
	`);

	try {
		await lockClient.query('BEGIN');
		await lockClient.query('SELECT pg_advisory_xact_lock($1)', [blocker.advisoryLockKey]);
		lockHeld = true;

		const pending = actions.map(action => action()) as [Promise<T>, Promise<T>];
		await waitForBlockedDeletes(pool, blocker.queryPattern);
		await lockClient.query('COMMIT');
		lockHeld = false;

		return await Promise.all(pending);
	} finally {
		if (lockHeld) await lockClient.query('ROLLBACK');
		lockClient.release();
		await pool.query(`DROP TRIGGER IF EXISTS "${blocker.triggerName}" ON "${table}"`);
		await pool.query(`DROP FUNCTION IF EXISTS "${blocker.functionName}"()`);
	}
}

describe('counter integrity under concurrent deletion', () => {
	let db: MiDrizzleDatabase;
	let pool: MiDrizzlePool;
	let owner: Misskey.entities.SignupResponse;

	beforeAll(async () => {
		const config = loadConfig();
		await initTestDb(true);
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		owner = await signup({ username: 'counter_integrity' });
	}, 120_000);

	afterAll(async () => {
		await pool.end();
	});

	test('concurrent deletion of the same reply decrements repliesCount once', async () => {
		const parent = await post(owner, { text: 'parent' });
		const reply = await post(owner, { text: 'reply', replyId: parent.id });

		const responses = await runAfterBothDeletesStart(pool, 'note', [
			async () => await api('notes/delete', { noteId: reply.id }, owner),
			async () => await api('notes/delete', { noteId: reply.id }, owner),
		]);

		assert.deepStrictEqual(responses.map(response => response.status), [204, 204]);
		const storedParent = await fetchNoteByIdFromDatabase(db, parent.id);
		assert.ok(storedParent);
		assert.strictEqual(storedParent.repliesCount, 0);
	});

	test('concurrent clip removals decrement clippedCount once', async () => {
		const note = await post(owner, { text: 'clip target' });
		const clip = await api('clips/create', { name: 'counter integrity' }, owner);
		assert.strictEqual(clip.status, 200);
		assert.strictEqual((await api('clips/add-note', { clipId: clip.body.id, noteId: note.id }, owner)).status, 204);

		const responses = await runAfterBothDeletesStart(pool, 'clip_note', [
			async () => await api('clips/remove-note', { clipId: clip.body.id, noteId: note.id }, owner),
			async () => await api('clips/remove-note', { clipId: clip.body.id, noteId: note.id }, owner),
		]);

		assert.deepStrictEqual(responses.map(response => response.status), [204, 204]);
		const storedNote = await fetchNoteByIdFromDatabase(db, note.id);
		assert.ok(storedNote);
		assert.strictEqual(storedNote.clippedCount, 0);
	});
});
