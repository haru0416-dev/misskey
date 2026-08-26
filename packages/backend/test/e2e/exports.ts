/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// jobQueue() が呼ぶ createRuntimeDependencies() は UrlPreviewService を構築する。同サービスは
// rolldown の `define` で注入される _SUMMALY_VERSION_ を参照するが、このファイルは jobQueue() を
// (test-server 経由でなく) vitest プロセス内で直接呼ぶため、ビルド時injectionが効かない。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
	openTestDatabase,
	type TestDatabase,
	updateDriveFileInDatabase,
} from '../fixtures.js';
import {
	api,
	POLL,
	post,
	relativeFetch,
	resolveTargetUrl,
	role,
	signup,
	startJobQueue,
	type TestJobQueueRuntime,
	uploadFile,
} from '../utils.js';
import type * as misskey from 'misskey-js';

describe('export-clips', () => {
	let queue: TestJobQueueRuntime;
	let db: TestDatabase;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;

	async function pollFirstDriveFile(): Promise<any> {
		// エクスポートはジョブ側でドライブへ書き出すため、ファイルが現れるまで待つ。
		const file = await vi.waitFor(
			async () => {
				const filesResponse = await api('drive/files', {}, alice);
				expect(filesResponse.status).toBe(200);
				const files = filesResponse.body;
				expect(files).toHaveLength(1);
				const found = files[0];
				assert.ok(found);
				return found;
			},
			{ ...POLL, timeout: 30_000 },
		);

		const fileResponse = await api('drive/files/show', { fileId: file.id }, alice);
		expect(fileResponse.status).toBe(200);
		const res = await relativeFetch(new URL(fileResponse.body.url).pathname);
		expect(res.status).toBe(200);
		return await res.json();
	}

	beforeAll(
		async () => {
			db = openTestDatabase();
			queue = await startJobQueue();
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await queue.close();
		await db.close();
	});

	beforeEach(async () => {
		const clips = (await api('clips/list', {}, alice)).body;
		await Promise.all(
			clips.map(async (clip) => {
				const res = await api('clips/delete', { clipId: clip.id }, alice);
				if (res.status !== 204) {
					throw new Error('Failed to delete clip');
				}
			}),
		);
		const files = (await api('drive/files', {}, alice)).body;
		await Promise.all(
			files.map(async (file) => {
				const res = await api('drive/files/delete', { fileId: file.id }, alice);
				if (res.status !== 204) {
					throw new Error('Failed to delete file');
				}
			}),
		);
	});

	test('basic export', async () => {
		const res1 = await api(
			'clips/create',
			{
				name: 'foo',
				description: 'bar',
			},
			alice,
		);
		expect(res1.status).toBe(200);

		const res2 = await api('i/export-clips', {}, alice);
		expect(res2.status).toBe(204);

		const exported = await pollFirstDriveFile();
		expect(exported[0].name).toBe('foo');
		expect(exported[0].description).toBe('bar');
		expect(exported[0].clipNotes.length).toBe(0);
	});

	test('export with notes', async () => {
		const res = await api(
			'clips/create',
			{
				name: 'foo',
				description: 'bar',
			},
			alice,
		);
		expect(res.status).toBe(200);
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
			const res2 = await api(
				'clips/add-note',
				{
					clipId: clip.id,
					noteId: note.id,
				},
				alice,
			);
			expect(res2.status).toBe(204);
		}

		const res3 = await api('i/export-clips', {}, alice);
		expect(res3.status).toBe(204);

		const exported = await pollFirstDriveFile();
		expect(exported[0].name).toBe('foo');
		expect(exported[0].description).toBe('bar');
		expect(exported[0].clipNotes.length).toBe(2);
		expect(exported[0].clipNotes[0].note.text).toBe('baz1');
		expect(exported[0].clipNotes[1].note.text).toBe('baz2');
		expect(exported[0].clipNotes[1].note.poll.choices[0]).toStrictEqual('sakura');
	});

	test('multiple clips', async () => {
		const res1 = await api(
			'clips/create',
			{
				name: 'kawaii',
				description: 'kawaii',
			},
			alice,
		);
		expect(res1.status).toBe(200);
		const clip1 = res1.body;

		const res2 = await api(
			'clips/create',
			{
				name: 'yuri',
				description: 'yuri',
			},
			alice,
		);
		expect(res2.status).toBe(200);
		const clip2 = res2.body;

		const note1 = await post(alice, {
			text: 'baz1',
		});

		const note2 = await post(alice, {
			text: 'baz2',
		});

		{
			const res = await api(
				'clips/add-note',
				{
					clipId: clip1.id,
					noteId: note1.id,
				},
				alice,
			);
			expect(res.status).toBe(204);
		}

		{
			const res = await api(
				'clips/add-note',
				{
					clipId: clip2.id,
					noteId: note2.id,
				},
				alice,
			);
			expect(res.status).toBe(204);
		}

		{
			const res = await api('i/export-clips', {}, alice);
			expect(res.status).toBe(204);
		}

		const exported = await pollFirstDriveFile();
		expect(exported[0].name).toBe('kawaii');
		expect(exported[0].clipNotes.length).toBe(1);
		expect(exported[0].clipNotes[0].note.text).toBe('baz1');
		expect(exported[1].name).toBe('yuri');
		expect(exported[1].clipNotes.length).toBe(1);
		expect(exported[1].clipNotes[0].note.text).toBe('baz2');
	});

	test("Clipping other user's note (followers only notes are excluded when not following)", async () => {
		const res = await api(
			'clips/create',
			{
				name: 'kawaii',
				description: 'kawaii',
			},
			alice,
		);
		expect(res.status).toBe(200);
		const clip = res.body;

		const note = await post(bob, {
			text: 'baz',
			visibility: 'followers',
		});

		const res2 = await api(
			'clips/add-note',
			{
				clipId: clip.id,
				noteId: note.id,
			},
			alice,
		);
		expect(res2.status).toBe(204);

		const res3 = await api('i/export-clips', {}, alice);
		expect(res3.status).toBe(204);

		const exported = await pollFirstDriveFile();
		expect(exported[0].clipNotes.length).toBe(0);
	});

	test("Clipping other user's note (followers only notes are included when following)", async () => {
		await api('following/create', { userId: bob.id }, alice);

		const res = await api(
			'clips/create',
			{
				name: 'kawaii',
				description: 'kawaii',
			},
			alice,
		);
		expect(res.status).toBe(200);
		const clip = res.body;

		const note = await post(bob, {
			text: 'baz',
			visibility: 'followers',
		});

		const res2 = await api(
			'clips/add-note',
			{
				clipId: clip.id,
				noteId: note.id,
			},
			alice,
		);
		expect(res2.status).toBe(204);

		const res3 = await api('i/export-clips', {}, alice);
		expect(res3.status).toBe(204);

		const exported = await pollFirstDriveFile();
		expect(exported[0].name).toBe('kawaii');
		expect(exported[0].clipNotes.length).toBe(1);
		expect(exported[0].clipNotes[0].note.text).toBe('baz');
		expect(exported[0].clipNotes[0].note.user.username).toBe('bob');
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
			const res = await api(
				'notes/favorites/create',
				{
					noteId: note.id,
				},
				alice,
			);
			expect(res.status).toBe(204);
		}

		const exportRes = await api('i/export-favorites', {}, alice);
		expect(exportRes.status).toBe(204);

		const exported = await pollFirstDriveFile();
		expect(exported.length).toBe(2);
		expect(exported[0].note.text).toBe('favorite1');
		expect(exported[1].note.text).toBe('favorite2');
		expect(exported[1].note.poll.choices[0]).toStrictEqual('sakura');
	});

	test("export notes includes only the requesting user's notes", async () => {
		const aliceNote1 = await post(alice, { text: 'exported-note-1' });
		const aliceNote2 = await post(alice, { text: 'exported-note-2' });
		const bobNote = await post(bob, { text: 'must-not-be-exported' });

		const exportRes = await api('i/export-notes', {}, alice);
		expect(exportRes.status).toBe(204);

		const exported = await pollFirstDriveFile();
		assert.ok(Array.isArray(exported));
		assert.ok(exported.some((note) => note.id === aliceNote1.id && note.text === aliceNote1.text));
		assert.ok(exported.some((note) => note.id === aliceNote2.id && note.text === aliceNote2.text));
		assert.ok(!exported.some((note) => note.id === bobNote.id || note.text === bobNote.text));
	});

	test('import blocking processes valid rows despite malformed and self rows', async () => {
		const suffix = Date.now().toString(36).slice(-8);
		const importer = await signup({ username: `importer${suffix}` });
		const target = await signup({ username: `target${suffix}` });
		const importRole = await role(
			alice,
			{ name: `import blocking ${suffix}` },
			{
				canImportBlocking: { priority: 0, useDefault: false, value: true },
			},
		);
		const assignRes = await api('admin/roles/assign', { roleId: importRole.id, userId: importer.id }, alice);
		expect(assignRes.status).toBe(204);

		const csv = ['not a valid acct', `${importer.username}@misskey.local`, `${target.username}@misskey.local`].join(
			'\n',
		);
		const uploaded = await uploadFile(importer, {
			name: `blocking-${suffix}.csv`,
			blob: new Blob([csv], { type: 'text/csv' }),
		});
		expect(uploaded.status).toBe(200);
		assert.ok(uploaded.body);
		const uploadedPath = new URL(uploaded.body.url).pathname;
		await updateDriveFileInDatabase(db, uploaded.body.id, {
			url: resolveTargetUrl(uploadedPath).toString(),
		});
		const uploadedContent = await relativeFetch(uploadedPath);
		expect(uploadedContent.status).toBe(200);
		expect(await uploadedContent.text()).toBe(csv);

		const importRes = await api('i/import-blocking', { fileId: uploaded.body.id }, importer);
		expect(importRes.status).toBe(204);

		await vi.waitFor(
			async () => {
				const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(db, importer.id, target.id);
				assert.ok(blocking);
				expect(blocking.blockerId).toBe(importer.id);
				expect(blocking.blockeeId).toBe(target.id);
				expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(db, importer.id, importer.id)).toBe(null);
			},
			{ timeout: 30_000, interval: 250 },
		);
	}, 60_000);
});
