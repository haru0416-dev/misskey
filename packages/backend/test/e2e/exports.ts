/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
// jobQueue() が呼ぶ createRuntimeDependencies() は UrlPreviewService を構築する。同サービスは
// rolldown の `define` で注入される _SUMMALY_VERSION_ を参照するが、このファイルは jobQueue() を
// (test-server 経由でなく) vitest プロセス内で直接呼ぶため、ビルド時injectionが効かない。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { updateDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { api, port, post, role, signup, startJobQueue, uploadFile } from '../utils.js';
import type { JobQueueRuntime } from '@/boot/common.js';
import type * as misskey from 'misskey-js';

describe('export-clips', () => {
	let queue: JobQueueRuntime;
	let db: MiDrizzleDatabase;
	let pool: MiDrizzlePool;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	// XXX: Any better way to get the result?
	async function pollFirstDriveFile(): Promise<any> {
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			const filesResponse = await api('drive/files', {}, alice);
			assert.strictEqual(filesResponse.status, 200);
			const files = filesResponse.body;
			if (!files.length) {
				await new Promise(r => setTimeout(r, 100));
				continue;
			}
			if (files.length > 1) {
				throw new Error('Too many files?');
			}
			const fileResponse = await api('drive/files/show', { fileId: files[0].id }, alice);
			assert.strictEqual(fileResponse.status, 200);
			const file = fileResponse.body;
			const res = await fetch(new URL(new URL(file.url).pathname, `http://127.0.0.1:${port}`));
			assert.strictEqual(res.status, 200);
			return await res.json();
		}
		assert.fail('Timed out waiting for exported drive file');
	}

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		queue = await startJobQueue();
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await queue.close();
		await pool.end();
	});

	beforeEach(async () => {
		// Clean all clips and files of alice
		const clips = (await api('clips/list', {}, alice)).body;
		await Promise.all(clips.map(async clip => {
			const res = await api('clips/delete', { clipId: clip.id }, alice);
			if (res.status !== 204) {
				throw new Error('Failed to delete clip');
			}
		}));
		const files = (await api('drive/files', {}, alice)).body;
		await Promise.all(files.map(async file => {
			const res = await api('drive/files/delete', { fileId: file.id }, alice);
			if (res.status !== 204) {
				throw new Error('Failed to delete file');
			}
		}));
	});

	test('basic export', async () => {
		const res1 = await api('clips/create', {
			name: 'foo',
			description: 'bar',
		}, alice);
		assert.strictEqual(res1.status, 200);

		const res2 = await api('i/export-clips', {}, alice);
		assert.strictEqual(res2.status, 204);

		const exported = await pollFirstDriveFile();
		assert.strictEqual(exported[0].name, 'foo');
		assert.strictEqual(exported[0].description, 'bar');
		assert.strictEqual(exported[0].clipNotes.length, 0);
	});

	test('export with notes', async () => {
		const res = await api('clips/create', {
			name: 'foo',
			description: 'bar',
		}, alice);
		assert.strictEqual(res.status, 200);
		const clip = res.body;

		const note1 = await post(alice, {
			text: 'baz1',
		});

		const note2 = await post(alice, {
			text: 'baz2',
			poll: {
				choices: ['sakura', 'izumi', 'ako'],
			},
		});

		for (const note of [note1, note2]) {
			const res2 = await api('clips/add-note', {
				clipId: clip.id,
				noteId: note.id,
			}, alice);
			assert.strictEqual(res2.status, 204);
		}

		const res3 = await api('i/export-clips', {}, alice);
		assert.strictEqual(res3.status, 204);

		const exported = await pollFirstDriveFile();
		assert.strictEqual(exported[0].name, 'foo');
		assert.strictEqual(exported[0].description, 'bar');
		assert.strictEqual(exported[0].clipNotes.length, 2);
		assert.strictEqual(exported[0].clipNotes[0].note.text, 'baz1');
		assert.strictEqual(exported[0].clipNotes[1].note.text, 'baz2');
		assert.deepStrictEqual(exported[0].clipNotes[1].note.poll.choices[0], 'sakura');
	});

	test('multiple clips', async () => {
		const res1 = await api('clips/create', {
			name: 'kawaii',
			description: 'kawaii',
		}, alice);
		assert.strictEqual(res1.status, 200);
		const clip1 = res1.body;

		const res2 = await api('clips/create', {
			name: 'yuri',
			description: 'yuri',
		}, alice);
		assert.strictEqual(res2.status, 200);
		const clip2 = res2.body;

		const note1 = await post(alice, {
			text: 'baz1',
		});

		const note2 = await post(alice, {
			text: 'baz2',
		});

		{
			const res = await api('clips/add-note', {
				clipId: clip1.id,
				noteId: note1.id,
			}, alice);
			assert.strictEqual(res.status, 204);
		}

		{
			const res = await api('clips/add-note', {
				clipId: clip2.id,
				noteId: note2.id,
			}, alice);
			assert.strictEqual(res.status, 204);
		}

		{
			const res = await api('i/export-clips', {}, alice);
			assert.strictEqual(res.status, 204);
		}

		const exported = await pollFirstDriveFile();
		assert.strictEqual(exported[0].name, 'kawaii');
		assert.strictEqual(exported[0].clipNotes.length, 1);
		assert.strictEqual(exported[0].clipNotes[0].note.text, 'baz1');
		assert.strictEqual(exported[1].name, 'yuri');
		assert.strictEqual(exported[1].clipNotes.length, 1);
		assert.strictEqual(exported[1].clipNotes[0].note.text, 'baz2');
	});

	test('Clipping other user\'s note (followers only notes are excluded when not following)', async () => {
		const res = await api('clips/create', {
			name: 'kawaii',
			description: 'kawaii',
		}, alice);
		assert.strictEqual(res.status, 200);
		const clip = res.body;

		const note = await post(bob, {
			text: 'baz',
			visibility: 'followers',
		});

		const res2 = await api('clips/add-note', {
			clipId: clip.id,
			noteId: note.id,
		}, alice);
		assert.strictEqual(res2.status, 204);

		const res3 = await api('i/export-clips', {}, alice);
		assert.strictEqual(res3.status, 204);

		const exported = await pollFirstDriveFile();
		assert.strictEqual(exported[0].clipNotes.length, 0);
	});

	test('Clipping other user\'s note (followers only notes are included when following)', async () => {
		// Alice follows Bob
		await api('following/create', { userId: bob.id }, alice);

		const res = await api('clips/create', {
			name: 'kawaii',
			description: 'kawaii',
		}, alice);
		assert.strictEqual(res.status, 200);
		const clip = res.body;

		const note = await post(bob, {
			text: 'baz',
			visibility: 'followers',
		});

		const res2 = await api('clips/add-note', {
			clipId: clip.id,
			noteId: note.id,
		}, alice);
		assert.strictEqual(res2.status, 204);

		const res3 = await api('i/export-clips', {}, alice);
		assert.strictEqual(res3.status, 204);

		const exported = await pollFirstDriveFile();
		assert.strictEqual(exported[0].name, 'kawaii');
		assert.strictEqual(exported[0].clipNotes.length, 1);
		assert.strictEqual(exported[0].clipNotes[0].note.text, 'baz');
		assert.strictEqual(exported[0].clipNotes[0].note.user.username, 'bob');
	});

	test('export favorites with notes', async () => {
		const note1 = await post(alice, {
			text: 'favorite1',
		});

		const note2 = await post(alice, {
			text: 'favorite2',
			poll: {
				choices: ['sakura', 'izumi', 'ako'],
			},
		});

		for (const note of [note1, note2]) {
			const res = await api('notes/favorites/create', {
				noteId: note.id,
			}, alice);
			assert.strictEqual(res.status, 204);
		}

		const exportRes = await api('i/export-favorites', {}, alice);
		assert.strictEqual(exportRes.status, 204);

		const exported = await pollFirstDriveFile();
		assert.strictEqual(exported.length, 2);
		assert.strictEqual(exported[0].note.text, 'favorite1');
		assert.strictEqual(exported[1].note.text, 'favorite2');
		assert.deepStrictEqual(exported[1].note.poll.choices[0], 'sakura');
	});

	test('export notes includes only the requesting user\'s notes', async () => {
		const aliceNote1 = await post(alice, { text: 'exported-note-1' });
		const aliceNote2 = await post(alice, { text: 'exported-note-2' });
		const bobNote = await post(bob, { text: 'must-not-be-exported' });

		const exportRes = await api('i/export-notes', {}, alice);
		assert.strictEqual(exportRes.status, 204);

		const exported = await pollFirstDriveFile();
		assert.ok(Array.isArray(exported));
		assert.ok(exported.some(note => note.id === aliceNote1.id && note.text === aliceNote1.text));
		assert.ok(exported.some(note => note.id === aliceNote2.id && note.text === aliceNote2.text));
		assert.ok(!exported.some(note => note.id === bobNote.id || note.text === bobNote.text));
	});

	test('import blocking processes valid rows despite malformed and self rows', async () => {
		const suffix = Date.now().toString(36).slice(-8);
		const importer = await signup({ username: `importer${suffix}` });
		const target = await signup({ username: `target${suffix}` });
		const importRole = await role(alice, { name: `import blocking ${suffix}` }, {
			canImportBlocking: { priority: 0, useDefault: false, value: true },
		});
		const assignRes = await api('admin/roles/assign', { roleId: importRole.id, userId: importer.id }, alice);
		assert.strictEqual(assignRes.status, 204);

		const csv = [
			'not a valid acct',
			`${importer.username}@misskey.local`,
			`${target.username}@misskey.local`,
		].join('\n');
		const uploaded = await uploadFile(importer, {
			name: `blocking-${suffix}.csv`,
			blob: new Blob([csv], { type: 'text/csv' }),
		});
		assert.strictEqual(uploaded.status, 200);
		assert.ok(uploaded.body);
		const uploadedPath = new URL(uploaded.body.url).pathname;
		await updateDriveFileInDatabase(db, uploaded.body.id, {
			url: `http://127.0.0.1:${port}${uploadedPath}`,
		});
		const uploadedContent = await fetch(`http://127.0.0.1:${port}${uploadedPath}`);
		assert.strictEqual(uploadedContent.status, 200);
		assert.strictEqual(await uploadedContent.text(), csv);

		const importRes = await api('i/import-blocking', { fileId: uploaded.body.id }, importer);
		assert.strictEqual(importRes.status, 204);

		const deadline = Date.now() + 30_000;
		while (true) {
			const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(db, importer.id, target.id);
			if (blocking != null) {
				assert.strictEqual(blocking.blockerId, importer.id);
				assert.strictEqual(blocking.blockeeId, target.id);
				assert.strictEqual(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(db, importer.id, importer.id), null);
				break;
			}
			if (Date.now() >= deadline) {
				assert.fail('Timed out waiting for imported blocking relationship');
			}
			await new Promise(resolve => setTimeout(resolve, 250));
		}
	}, 60_000);
});
