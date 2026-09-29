/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase, fetchNoteByUriFromDatabase } from '@/core/note/NoteStore.js';
import { createPollInDatabase } from '@/core/note/PollStore.js';
import { createDriveFileInDatabase, fetchDriveFileByIdFromDatabase } from '@/core/drive/DriveFileStore.js';
import { fetchHashtagByNameFromDatabase } from '@/core/hashtag/HashtagStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { performOneActivityForApi } from '@/server/activitypub/inbox-dispatch.js';
import type { ApiInboxDependencies } from '@/server/activitypub/inbox-dispatch.js';
import type { MiNote } from '@/models/Note.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import type { ICreate, IObject, IUpdate } from '@/core/activitypub/type.js';

// リモートで編集されたノート (Update(Note)) を受け取り、既に取り込んだノートの中身を書き換える。
describe('Update(Note) の受信', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiInboxDependencies;
	const published = vi.fn();

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = {
			...runtime,
			logger: runtime.loggerService.getLogger('test-ap-update-note'),
			publishNoteStream: published,
		} as ApiInboxDependencies;
		// 新規テスト DB の meta.federation は既定で 'none' で、全ホストを拒否する。
		runtime.meta.federation = 'all';
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createRemoteUser(host = 'edit.example.com'): Promise<MiRemoteUser> {
		const id = genId();
		return (await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id,
				username: `editor${id}`,
				usernameLower: `editor${id}`,
				host,
				uri: `https://${host}/users/${id}`,
				inbox: `https://${host}/users/${id}/inbox`,
				lastFetchedAt: new Date(),
			},
			profile: { userId: id },
		})) as MiRemoteUser;
	}

	async function createLocalUser(): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: { id, username: `mentioned${id}`, usernameLower: `mentioned${id}` },
			profile: { userId: id },
		});
	}

	async function createRemoteNote(actor: MiRemoteUser, values: Partial<MiNote> = {}): Promise<MiNote> {
		const id = genId();
		const note = {
			id,
			uri: `https://${actor.host}/notes/${id}`,
			userId: actor.id,
			userHost: actor.host,
			text: 'original',
			visibility: 'public' as const,
			...values,
		};
		await createNoteInDatabase(deps.db, note);
		return (await fetchNoteByIdFromDatabase(deps.db, id))!;
	}

	function update(actor: MiRemoteUser, object: Record<string, unknown>): IUpdate {
		return {
			type: 'Update',
			id: `${actor.uri}#updates/${genId()}`,
			actor: actor.uri,
			object: object as unknown as IObject,
		};
	}

	function editedNote(actor: MiRemoteUser, note: MiNote, values: Record<string, unknown>): Record<string, unknown> {
		return {
			type: 'Note',
			id: note.uri,
			attributedTo: actor.uri,
			to: ['https://www.w3.org/ns/activitystreams#Public'],
			...values,
		};
	}

	test('本文と CW を書き換えて編集の日時を残し、編集の合図を配る', async () => {
		const actor = await createRemoteUser();
		const note = await createRemoteNote(actor);
		published.mockClear();

		const result = await performOneActivityForApi(
			deps,
			actor,
			update(
				actor,
				editedNote(actor, note, { content: '<p>edited</p>', summary: 'cw', updated: '2026-01-02T03:04:05Z' }),
			),
			new Set(),
		);

		expect(result).toBe('ok: Note updated');
		const saved = (await fetchNoteByIdFromDatabase(deps.db, note.id))!;
		expect(saved.text).toBe('edited');
		expect(saved.cw).toBe('cw');
		expect(new Date(saved.updatedAt!).toISOString()).toBe('2026-01-02T03:04:05.000Z');
		expect(published).toHaveBeenCalledWith(expect.objectContaining({ id: note.id }), 'edited', {
			updatedAt: new Date('2026-01-02T03:04:05Z'),
		});
	});

	test('投稿者以外・updated の無いもの・知らないノートでは何もしない', async () => {
		const actor = await createRemoteUser();
		const other = await createRemoteUser();
		const note = await createRemoteNote(actor);

		// 別の利用者が同じホストの他人のノートを書き換えようとする。
		expect(
			await performOneActivityForApi(
				deps,
				other,
				update(other, editedNote(other, note, { content: 'hijacked', updated: '2026-01-02T00:00:00Z' })),
				new Set(),
			),
		).toMatch(/^skip:/);
		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, editedNote(actor, note, { content: 'no date' })),
				new Set(),
			),
		).toBe('skip: not an edit (no updated)');
		const unknownUri = `https://${actor.host}/notes/${genId()}`;
		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, {
					type: 'Note',
					id: unknownUri,
					attributedTo: actor.uri,
					content: 'new',
					updated: '2026-01-02T00:00:00Z',
				}),
				new Set(),
			),
		).toBe('skip: note not found');

		expect((await fetchNoteByIdFromDatabase(deps.db, note.id))!.text).toBe('original');
		expect(await fetchNoteByUriFromDatabase(deps.db, unknownUri)).toBeNull();
	});

	test('followers のノートでは編集でメンションを増やさない (公開のノートでは増える)', async () => {
		const actor = await createRemoteUser();
		const mentioned = await createLocalUser();
		const mention = {
			type: 'Mention',
			href: `${deps.config.instance.url}/users/${mentioned.id}`,
			name: `@${mentioned.username}`,
		};
		const followersOnly = await createRemoteNote(actor, { visibility: 'followers' });
		const publicNote = await createRemoteNote(actor);

		for (const note of [followersOnly, publicNote]) {
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, editedNote(actor, note, { content: 'hi', tag: [mention], updated: '2026-01-02T00:00:00Z' })),
				new Set(),
			);
		}

		expect((await fetchNoteByIdFromDatabase(deps.db, followersOnly.id))!.mentions).toEqual([]);
		expect((await fetchNoteByIdFromDatabase(deps.db, followersOnly.id))!.text).toBe('hi');
		expect((await fetchNoteByIdFromDatabase(deps.db, publicNote.id))!.mentions).toEqual([mentioned.id]);
	});

	test('禁止ワードを含む編集は捨てる', async () => {
		const actor = await createRemoteUser();
		const note = await createRemoteNote(actor);
		const prohibitedWords = runtime.meta.prohibitedWords;
		runtime.meta.prohibitedWords = ['forbiddenword'];
		try {
			const result = await performOneActivityForApi(
				deps,
				actor,
				update(actor, editedNote(actor, note, { content: 'a forbiddenword here', updated: '2026-01-02T00:00:00Z' })),
				new Set(),
			);
			expect(result).toBe('skip: Note contains prohibited words');
		} finally {
			runtime.meta.prohibitedWords = prohibitedWords;
		}
		expect((await fetchNoteByIdFromDatabase(deps.db, note.id))!.text).toBe('original');
	});

	test('Update(Question) は updated があるときだけ本文も書き換える', async () => {
		const actor = await createRemoteUser();
		const note = await createRemoteNote(actor, { hasPoll: true });
		await createPollInDatabase(deps.db, {
			noteId: note.id,
			userId: actor.id,
			userHost: actor.host,
			noteVisibility: 'public',
			choices: ['a', 'b'],
			votes: [0, 0],
			multiple: false,
			expiresAt: null,
		});
		const question = (values: Record<string, unknown>) =>
			editedNote(actor, note, {
				type: 'Question',
				oneOf: [
					{ type: 'Note', name: 'a', replies: { type: 'Collection', totalItems: 1 } },
					{ type: 'Note', name: 'b', replies: { type: 'Collection', totalItems: 0 } },
				],
				...values,
			});

		expect(
			await performOneActivityForApi(deps, actor, update(actor, question({ content: 'votes only' })), new Set()),
		).toBe('ok: Question updated');
		expect((await fetchNoteByIdFromDatabase(deps.db, note.id))!.text).toBe('original');

		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, question({ content: 'edited poll', updated: '2026-01-02T00:00:00Z' })),
				new Set(),
			),
		).toBe('ok: Note updated');
		expect((await fetchNoteByIdFromDatabase(deps.db, note.id))!.text).toBe('edited poll');
	});

	test('空白だけの本文への編集で引用を単なるリノートにしない (返信つきの引用は空にできる)', async () => {
		const actor = await createRemoteUser();
		const target = await createRemoteNote(actor);
		const replied = await createRemoteNote(actor);
		const quote = await createRemoteNote(actor, { renoteId: target.id, text: 'quote' });
		const quoteReply = await createRemoteNote(actor, { renoteId: target.id, replyId: replied.id, text: 'quote reply' });

		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(
					actor,
					editedNote(actor, quote, { content: '<p> </p>', _misskey_content: ' ', updated: '2026-01-02T00:00:00Z' }),
				),
				new Set(),
			),
		).toBe('skip: the edit would turn a quote into a renote');
		expect((await fetchNoteByIdFromDatabase(deps.db, quote.id))!.text).toBe('quote');

		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, editedNote(actor, quoteReply, { content: '', updated: '2026-01-02T00:00:00Z' })),
				new Set(),
			),
		).toBe('ok: Note updated');
		expect((await fetchNoteByIdFromDatabase(deps.db, quoteReply.id))!.text).toBeNull();
	});

	test('相手の時計が進んでいても、後着の古い編集と同じ編集の再送を捨てる', async () => {
		const actor = await createRemoteUser();
		const note = await createRemoteNote(actor);
		const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
		const earlier = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		const newer = update(actor, editedNote(actor, note, { content: 'newer', updated: later }));

		expect(await performOneActivityForApi(deps, actor, newer, new Set())).toBe('ok: Note updated');
		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, editedNote(actor, note, { content: 'older', updated: earlier })),
				new Set(),
			),
		).toBe('skip: older or same edit');
		expect(await performOneActivityForApi(deps, actor, newer, new Set())).toBe('skip: older or same edit');

		const saved = (await fetchNoteByIdFromDatabase(deps.db, note.id))!;
		expect(saved.text).toBe('newer');
		expect(new Date(saved.updatedAt!).toISOString()).toBe(later);
	});

	test('編集済みのノートを取り込むと編集日時を残し、それより古い編集で巻き戻さない', async () => {
		const actor = await createRemoteUser();
		const create = (id: string, updated: string): ICreate =>
			({
				type: 'Create',
				id: `${actor.uri}#creates/${genId()}`,
				actor: actor.uri,
				object: {
					type: 'Note',
					id,
					attributedTo: actor.uri,
					to: ['https://www.w3.org/ns/activitystreams#Public'],
					content: 'v2',
					published: '2026-01-01T00:00:00Z',
					updated,
				},
			}) as unknown as ICreate;
		const editedUri = `https://${actor.host}/notes/${genId()}`;
		const uneditedUri = `https://${actor.host}/notes/${genId()}`;

		await performOneActivityForApi(deps, actor, create(editedUri, '2026-01-03T00:00:00Z'), new Set());
		// 編集していなくても published と同じ updated を付ける実装がある。
		await performOneActivityForApi(deps, actor, create(uneditedUri, '2026-01-01T00:00:00Z'), new Set());

		const edited = (await fetchNoteByUriFromDatabase(deps.db, editedUri))!;
		expect(new Date(edited.updatedAt!).toISOString()).toBe('2026-01-03T00:00:00.000Z');
		expect((await fetchNoteByUriFromDatabase(deps.db, uneditedUri))!.updatedAt).toBeNull();
		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(actor, editedNote(actor, edited, { content: 'v1', updated: '2026-01-02T00:00:00Z' })),
				new Set(),
			),
		).toBe('skip: older or same edit');
		expect((await fetchNoteByIdFromDatabase(deps.db, edited.id))!.text).toBe('v2');
	});

	test('編集で添付の代替テキストを直し、増えたタグをハッシュタグ一覧に載せる', async () => {
		const actor = await createRemoteUser();
		const url = `https://${actor.host}/media/${genId()}.png`;
		const fileId = genId();
		await createDriveFileInDatabase(deps.db, {
			id: fileId,
			md5: null,
			name: 'image.png',
			type: 'image/png',
			size: 1,
			storedInternal: false,
			isLink: true,
			url,
			uri: url,
			comment: 'old alt',
			userId: actor.id,
			userHost: actor.host,
		});
		const note = await createRemoteNote(actor, { fileIds: [fileId], attachedFileTypes: ['image/png'] });
		const tag = `edittag${genId().replaceAll('-', '')}`;
		const altOnly = (content: string, updated: string) =>
			update(
				actor,
				editedNote(actor, note, {
					content,
					attachment: [{ type: 'Document', mediaType: 'image/png', url, name: 'new alt' }],
					updated,
				}),
			);

		// 捨てる編集では代替テキストも変えない。
		const prohibitedWords = runtime.meta.prohibitedWords;
		runtime.meta.prohibitedWords = ['forbiddenalt'];
		try {
			expect(
				await performOneActivityForApi(deps, actor, altOnly('forbiddenalt', '2026-01-01T00:00:00Z'), new Set()),
			).toBe('skip: Note contains prohibited words');
		} finally {
			runtime.meta.prohibitedWords = prohibitedWords;
		}
		expect((await fetchDriveFileByIdFromDatabase(deps.db, fileId))!.comment).toBe('old alt');

		expect(
			await performOneActivityForApi(
				deps,
				actor,
				update(
					actor,
					editedNote(actor, note, {
						content: `hi #${tag}`,
						attachment: [{ type: 'Document', mediaType: 'image/png', url, name: 'new alt' }],
						tag: [{ type: 'Hashtag', name: `#${tag}`, href: `https://${actor.host}/tags/${tag}` }],
						updated: '2026-01-02T00:00:00Z',
					}),
				),
				new Set(),
			),
		).toBe('ok: Note updated');

		expect((await fetchNoteByIdFromDatabase(deps.db, note.id))!.fileIds).toEqual([fileId]);
		expect((await fetchDriveFileByIdFromDatabase(deps.db, fileId))!.comment).toBe('new alt');
		expect((await fetchHashtagByNameFromDatabase(deps.db, tag))?.mentionedRemoteUsersCount).toBe(1);
	});

	test('流行の集計 (Redis) が失敗しても、編集は保存して合図も配る', async () => {
		const actor = await createRemoteUser();
		const note = await createRemoteNote(actor);
		const tag = `rankfail${genId().replaceAll('-', '')}`;
		const failingRedis = new Proxy(runtime.redis, {
			get(target, key) {
				if (key === 'pipeline') {
					return () => {
						throw new Error('redis is down');
					};
				}
				const value = Reflect.get(target, key);
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		published.mockClear();
		try {
			const result = await performOneActivityForApi(
				{ ...deps, redis: failingRedis },
				actor,
				update(
					actor,
					editedNote(actor, note, {
						content: `hi #${tag}`,
						tag: [{ type: 'Hashtag', name: `#${tag}`, href: `https://${actor.host}/tags/${tag}` }],
						updated: '2026-01-02T00:00:00Z',
					}),
				),
				new Set(),
			);
			expect(result).toBe('ok: Note updated');
			expect(errors).toHaveBeenCalled();
		} finally {
			errors.mockRestore();
		}
		expect(published).toHaveBeenCalledWith(expect.objectContaining({ id: note.id }), 'edited', expect.anything());
		expect((await fetchNoteByIdFromDatabase(deps.db, note.id))!.text).toBe(`hi #${tag}`);
		expect(await fetchHashtagByNameFromDatabase(deps.db, tag)).not.toBeNull();
	});
});
