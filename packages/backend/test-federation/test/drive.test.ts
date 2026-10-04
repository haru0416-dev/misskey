import { describe, test, beforeAll } from 'vitest';
import assert, { strictEqual } from 'node:assert';
import type * as Misskey from 'misskey-js';
import {
	createAccount,
	assertAttachment,
	deliveryBarrier,
	fetchAdmin,
	resolveRemoteNote,
	uploadFile,
} from './utils.js';
import type { LoginUser } from './utils.js';

const bAdmin = await fetchAdmin('b.test');

describe('Drive', () => {
	describe('Upload image in a.test and resolve from b.test', () => {
		let uploader: LoginUser;

		beforeAll(async () => {
			uploader = await createAccount('a.test');
		});

		let image: Misskey.entities.DriveFile, imageInB: Misskey.entities.DriveFile;

		describe('Upload', () => {
			beforeAll(async () => {
				image = await uploadFile('a.test', uploader);
				const noteWithImage = (await uploader.client.request('notes/create', { fileIds: [image.id] })).createdNote;
				const noteInB = await resolveRemoteNote('a.test', noteWithImage.id, bAdmin);
				assert(noteInB.files != null);
				strictEqual(noteInB.files.length, 1);
				const resolvedImage = noteInB.files[0];
				assert(resolvedImage);
				imageInB = resolvedImage;
			});

			test('Check consistency of DriveFile', () => {
				assertAttachment(imageInB, image);
			});
		});

		let reupdatedImageInB: Misskey.entities.DriveFile;

		describe('Re-update with attaching to Note', () => {
			beforeAll(async () => {
				await uploader.client.request('drive/files/update', {
					fileId: image.id,
					name: 'updated_192.jpg',
					isSensitive: true,
				});
				const noteWithUpdatedImage = (await uploader.client.request('notes/create', { fileIds: [image.id] }))
					.createdNote;
				const noteWithUpdatedImageInB = await resolveRemoteNote('a.test', noteWithUpdatedImage.id, bAdmin);
				assert(noteWithUpdatedImageInB.files != null);
				strictEqual(noteWithUpdatedImageInB.files.length, 1);
				const resolvedImage = noteWithUpdatedImageInB.files[0];
				assert(resolvedImage);
				reupdatedImageInB = resolvedImage;
			});

			test('Check consistency', () => {
				strictEqual(reupdatedImageInB.isSensitive, true);
				strictEqual(reupdatedImageInB.name, '192.jpg');
			});
		});
	});

	describe('Sensitive flag', () => {
		// https://github.com/misskey-dev/misskey/issues/12208
		describe('isSensitive is federated in replying', () => {
			let alice: LoginUser, bob: LoginUser;

			beforeAll(async () => {
				[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);
			});

			test('Alice uploads sensitive image and it is shown as sensitive from Bob', async () => {
				const bobNote = (await bob.client.request('notes/create', { text: "I'm Bob" })).createdNote;

				const file = await uploadFile('a.test', alice);
				await alice.client.request('drive/files/update', { fileId: file.id, isSensitive: true });
				const bobNoteInA = await resolveRemoteNote('b.test', bobNote.id, alice);
				const note = (
					await alice.client.request('notes/create', { text: 'sensitive', fileIds: [file.id], replyId: bobNoteInA.id })
				).createdNote;
				await deliveryBarrier('a.test');

				const noteInB = await resolveRemoteNote('a.test', note.id, bob);
				assert(noteInB.files != null);
				strictEqual(noteInB.files.length, 1);
				strictEqual(noteInB.files[0]?.isSensitive, true);
			});
		});
	});
});
