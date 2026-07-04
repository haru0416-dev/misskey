/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import { createFollowRequestInDatabase, fetchFollowRequestFromDatabase } from '@/core/FollowRequestStore.js';
import { fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { fetchNoteReactionByUserAndNoteFromDatabase } from '@/core/NoteReactionStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { performOneActivityForHonoApi, type HonoApiInboxDependencies } from '@/server/hono-ap-inbox.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import type { IObject } from '@/core/activitypub/type.js';

function asRemote(user: MiUser): MiRemoteUser {
	return user as MiRemoteUser;
}

async function createTestLocalUser(deps: HonoApiInboxDependencies, prefix: string, options: { isLocked?: boolean } = {}): Promise<MiUser> {
	const id = genId(deps.config);
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: {
			id,
			username: `${prefix}${id}`,
			usernameLower: `${prefix}${id}`.toLowerCase(),
			isLocked: options.isLocked,
		},
		profile: { userId: id },
	});
}

async function createTestRemoteUser(deps: HonoApiInboxDependencies, prefix: string, host: string): Promise<MiUser> {
	const id = genId(deps.config);
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: {
			id,
			username: `${prefix}${id}`,
			usernameLower: `${prefix}${id}`.toLowerCase(),
			host,
			uri: `https://${host}/users/${id}`,
			inbox: `https://${host}/users/${id}/inbox`,
			// lastFetchedAt を「直近」にしておき、validateAlsoKnownAsForHonoApi 等の
			// 「10秒以上古ければ再取得」ロジックによる実ネットワークフェッチ (テスト環境では
			// 到達不能なダミードメインへの接続になる) をスキップさせる。
			lastFetchedAt: new Date(),
		},
		profile: { userId: id },
	});
}

function localUserUri(deps: HonoApiInboxDependencies, user: MiUser): string {
	return `${deps.config.url}/users/${user.id}`;
}

describe('hono-ap-inbox performOneActivityForHonoApi', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoApiInboxDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-ap-inbox') };
		// 新規テストDBでは meta.federation が既定で 'none' になっており、そのままだと
		// isFederationAllowedUri がすべてのホストを拒否してしまう (updatePersonForHonoApi 経由の
		// リモート再取得が "Instance is blocked" で失敗する) ため、テスト用に全許可へ上書きする。
		runtime.meta.federation = 'all';
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('Follow: リモートアクターがローカルユーザーをフォローする', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxfollow', 'hono-inbox-follow.example.com');
		const followee = await createTestLocalUser(deps, 'honoinboxfollowee');

		const activity: IObject = {
			type: 'Follow',
			id: `https://hono-inbox-follow.example.com/follows/${genId(deps.config)}`,
			actor: actor.uri!,
			object: localUserUri(deps, followee),
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, actor.id, followee.id);
		expect(following).not.toBeNull();
	});

	test('Follow: 鍵アカウントへのフォローはフォローリクエストを作る', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxfollowlock', 'hono-inbox-follow-lock.example.com');
		const followee = await createTestLocalUser(deps, 'honoinboxfolloweelock', { isLocked: true });

		const activity: IObject = {
			type: 'Follow',
			id: `https://hono-inbox-follow-lock.example.com/follows/${genId(deps.config)}`,
			actor: actor.uri!,
			object: localUserUri(deps, followee),
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, actor.id, followee.id);
		expect(following).toBeNull();

		const request = await fetchFollowRequestFromDatabase(deps.db, actor.id, followee.id);
		expect(request).not.toBeNull();
	});

	test('Undo(Follow): 既存のフォローリクエストを取り消す', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxundofollow', 'hono-inbox-undo-follow.example.com');
		const followee = await createTestLocalUser(deps, 'honoinboxundofollowee');

		await createFollowRequestInDatabase(deps.db, {
			id: genId(deps.config),
			followerId: actor.id,
			followeeId: followee.id,
		});

		const activity: IObject = {
			type: 'Undo',
			id: `https://hono-inbox-undo-follow.example.com/undo/${genId(deps.config)}`,
			actor: actor.uri!,
			object: {
				type: 'Follow',
				actor: actor.uri!,
				object: localUserUri(deps, followee),
			},
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok: follow request canceled');

		const request = await fetchFollowRequestFromDatabase(deps.db, actor.id, followee.id);
		expect(request).toBeNull();
	});

	test('Block: リモートアクターがローカルユーザーをブロックする', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxblock', 'hono-inbox-block.example.com');
		const blockee = await createTestLocalUser(deps, 'honoinboxblockee');

		const activity: IObject = {
			type: 'Block',
			id: `https://hono-inbox-block.example.com/blocks/${genId(deps.config)}`,
			actor: actor.uri!,
			object: localUserUri(deps, blockee),
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, actor.id, blockee.id);
		expect(blocking).not.toBeNull();
	});

	test('Undo(Block): 既存のブロックを解除する', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxunblock', 'hono-inbox-unblock.example.com');
		const blockee = await createTestLocalUser(deps, 'honoinboxunblockee');

		const activity: IObject = {
			type: 'Block',
			id: `https://hono-inbox-unblock.example.com/blocks/${genId(deps.config)}`,
			actor: actor.uri!,
			object: localUserUri(deps, blockee),
		} as IObject;
		await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, actor.id, blockee.id)).not.toBeNull();

		const undoActivity: IObject = {
			type: 'Undo',
			id: `https://hono-inbox-unblock.example.com/undo/${genId(deps.config)}`,
			actor: actor.uri!,
			object: {
				type: 'Block',
				actor: actor.uri!,
				object: localUserUri(deps, blockee),
			},
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), undoActivity, new Set());
		expect(result).toBe('ok');
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, actor.id, blockee.id)).toBeNull();
	});

	test('Like: リモートアクターがローカルノートにリアクションする', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxlike', 'hono-inbox-like.example.com');
		const noteOwner = await createTestLocalUser(deps, 'honoinboxlikeowner');
		const noteId = genId(deps.config);
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'hono-ap-inbox like test',
			userId: noteOwner.id,
			userHost: null,
			visibility: 'public',
		});

		const activity: IObject = {
			type: 'Like',
			id: `https://hono-inbox-like.example.com/likes/${genId(deps.config)}`,
			actor: actor.uri!,
			object: `${deps.config.url}/notes/${noteId}`,
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const reaction = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, actor.id, noteId);
		expect(reaction).not.toBeNull();
	});

	test('Undo(Like): 既存のリアクションを取り消す', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxunlike', 'hono-inbox-unlike.example.com');
		const noteOwner = await createTestLocalUser(deps, 'honoinboxunlikeowner');
		const noteId = genId(deps.config);
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'hono-ap-inbox unlike test',
			userId: noteOwner.id,
			userHost: null,
			visibility: 'public',
		});

		const likeActivity: IObject = {
			type: 'Like',
			id: `https://hono-inbox-unlike.example.com/likes/${genId(deps.config)}`,
			actor: actor.uri!,
			object: `${deps.config.url}/notes/${noteId}`,
		} as IObject;
		await performOneActivityForHonoApi(deps, asRemote(actor), likeActivity, new Set());
		expect(await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, actor.id, noteId)).not.toBeNull();

		const undoActivity: IObject = {
			type: 'Undo',
			id: `https://hono-inbox-unlike.example.com/undo/${genId(deps.config)}`,
			actor: actor.uri!,
			object: {
				type: 'Like',
				actor: actor.uri!,
				object: `${deps.config.url}/notes/${noteId}`,
			},
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), undoActivity, new Set());
		expect(result).toBe('ok');
		expect(await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, actor.id, noteId)).toBeNull();
	});

	test('Delete: リモートアクターが自分のノートを削除する', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxdelete', 'hono-inbox-delete.example.com');
		const noteId = genId(deps.config);
		const noteUri = `https://hono-inbox-delete.example.com/notes/${noteId}`;
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'hono-ap-inbox delete test',
			userId: actor.id,
			userHost: actor.host,
			uri: noteUri,
			visibility: 'public',
		});

		const activity: IObject = {
			type: 'Delete',
			id: `https://hono-inbox-delete.example.com/deletes/${genId(deps.config)}`,
			actor: actor.uri!,
			object: noteUri,
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok: note deleted');
		expect(await fetchNoteByIdFromDatabase(deps.db, noteId)).toBeNull();
	});

	test('未知のアクティビティタイプは unrecognized として返す', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxunknown', 'hono-inbox-unknown.example.com');

		const activity: IObject = {
			type: 'SomeUnknownType',
			id: `https://hono-inbox-unknown.example.com/x/${genId(deps.config)}`,
			actor: actor.uri!,
			object: actor.uri!,
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(actor), activity, new Set());
		expect(result).toContain('unrecognized activity type');
	});

	test('actorがisSuspendedの場合は何もしない', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxsuspended', 'hono-inbox-suspended.example.com');
		const suspendedActor = { ...actor, isSuspended: true };

		const activity: IObject = {
			type: 'Follow',
			id: `https://hono-inbox-suspended.example.com/follows/${genId(deps.config)}`,
			actor: actor.uri!,
			object: actor.uri!,
		} as IObject;

		const result = await performOneActivityForHonoApi(deps, asRemote(suspendedActor), activity, new Set());
		expect(result).toBeUndefined();
	});
});
