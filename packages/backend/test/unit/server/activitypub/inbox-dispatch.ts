/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義を避けるため、テスト用の固定値を注入する。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdOrFailFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import {
	createFollowingInDatabase,
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
} from '@/core/user/FollowingStore.js';
import { createFollowRequestInDatabase, fetchFollowRequestFromDatabase } from '@/core/user/FollowRequestStore.js';
import { fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/user/BlockingStore.js';
import { createNoteInDatabase, fetchNoteByIdFromDatabase, fetchNoteByUriFromDatabase } from '@/core/note/NoteStore.js';
import { fetchNoteReactionByUserAndNoteFromDatabase } from '@/core/note/NoteReactionStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { performOneActivityForApi } from '@/server/activitypub/inbox-dispatch.js';
import type { ApiInboxDependencies } from '@/server/activitypub/inbox-dispatch.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import type { IFollow, IMove, IObject } from '@/core/activitypub/type.js';
import { createNoteFromApForApi } from '@/server/rest/activitypub/ap-note.js';
import { StatusError } from '@/misc/status-error.js';

function asRemote(user: MiUser): MiRemoteUser {
	return user as MiRemoteUser;
}

async function createTestLocalUser(
	deps: ApiInboxDependencies,
	prefix: string,
	options: { isLocked?: boolean; isSuspended?: boolean } = {},
): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: {
			id,
			username: `${prefix}${id}`,
			usernameLower: `${prefix}${id}`.toLowerCase(),
			isLocked: options.isLocked,
			isSuspended: options.isSuspended,
		},
		profile: { userId: id },
	});
}

async function createTestRemoteUser(deps: ApiInboxDependencies, prefix: string, host: string): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: {
			id,
			username: `${prefix}${id}`,
			usernameLower: `${prefix}${id}`.toLowerCase(),
			host,
			uri: `https://${host}/users/${id}`,
			inbox: `https://${host}/users/${id}/inbox`,
			// lastFetchedAt を「直近」にしておき、validateAlsoKnownAsForApi 等の
			// 「10秒以上古ければ再取得」ロジックによる実ネットワークフェッチ (テスト環境では
			// 到達不能なダミードメインへの接続になる) をスキップさせる。
			lastFetchedAt: new Date(),
		},
		profile: { userId: id },
	});
}

function localUserUri(deps: ApiInboxDependencies, user: MiUser): string {
	return `${deps.config.instance.url}/users/${user.id}`;
}

describe('hono-ap-inbox performOneActivityForApi', () => {
	let runtime: RuntimeDependencies;
	let deps: ApiInboxDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-ap-inbox') };
		// 新規テストDBでは meta.federation が既定で 'none' になっており、そのままだと
		// isFederationAllowedUri がすべてのホストを拒否してしまう (updatePersonForApi 経由の
		// リモート再取得が "Instance is blocked" で失敗する) ため、テスト用に全許可へ上書きする。
		runtime.meta.federation = 'all';
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test.each(['source', 'other', null])(
		'Move: 移行先の承認に従ってフォロワーを引き継ぎ、同じ通知では重複処理しない (別名=%s)',
		async (alias) => {
			const actor = await createTestRemoteUser(deps, 'movesource', 'move-cache.example.com');
			const destination = await createTestLocalUser(deps, 'movedestination');
			const destinationUri = localUserUri(deps, destination);
			await updateUserInDatabase(deps.db, destination.id, {
				alsoKnownAs:
					alias === 'source' ? actor.uri : alias === 'other' ? 'https://move-cache.example.com/users/other' : null,
			});
			const follower = await createTestLocalUser(deps, 'movefollower');
			await createFollowingInDatabase(deps.db, {
				id: genId(),
				followerId: follower.id,
				followeeId: actor.id,
				followerHost: null,
				followeeHost: actor.host,
			});
			const moveDeps = {
				...deps,
				meta: { ...deps.meta, signToActivityPubGet: false },
				httpRequestService: Object.assign(Object.create(deps.httpRequestService), {
					getActivityJson: vi.fn().mockResolvedValue({
						'@context': 'https://www.w3.org/ns/activitystreams',
						type: 'Person',
						id: actor.uri,
						preferredUsername: actor.username,
						inbox: actor.inbox,
					}),
				}),
			};
			const activity: IMove = {
				type: 'Move',
				actor: actor.uri!,
				object: actor.uri!,
				target: destinationUri,
			};
			await performOneActivityForApi(moveDeps, asRemote(actor), activity, new Set());
			const movedActor = asRemote(await fetchUserByIdOrFailFromDatabase(deps.db, actor.id));
			expect(movedActor.movedToUri).toBe(destinationUri);
			expect(movedActor.movedAt).not.toBeNull();
			const getFollowTargets = async () => {
				const jobs = await deps.relationshipQueue.getJobs(['waiting', 'delayed']);
				return jobs
					.filter((job) => job.name === 'follow' && job.data.from.id === follower.id)
					.map((job) => job.data.to.id);
			};
			expect(await getFollowTargets()).toEqual(alias === 'source' ? [destination.id] : []);
			if (alias === 'source') {
				await performOneActivityForApi(moveDeps, movedActor, activity, new Set());
				expect(await getFollowTargets()).toEqual([destination.id]);
				expect((await fetchUserByIdOrFailFromDatabase(deps.db, actor.id)).movedAt).toEqual(movedActor.movedAt);
			}
		},
	);

	test.each([403, 404, 410])('Create: 返信元が HTTP %i でも宛先付き返信を保存する', async (status) => {
		const actor = await createTestRemoteUser(deps, 'replyactor', 'private-reply.example.com');
		const recipient = await createTestLocalUser(deps, 'replyrecipient');
		const parentUri = `https://${actor.host}/notes/${genId()}`;
		const replyUri = `https://${actor.host}/notes/${genId()}`;
		const getActivityJson = vi.fn().mockRejectedValue(new StatusError('unavailable parent', status));
		const noteDeps = {
			...deps,
			meta: { ...deps.meta, signToActivityPubGet: false },
			httpRequestService: Object.assign(Object.create(deps.httpRequestService), { getActivityJson }),
		};
		const reply = await createNoteFromApForApi(
			noteDeps,
			{
				type: 'Note',
				id: replyUri,
				attributedTo: actor.uri!,
				content: 'visible reply',
				to: [localUserUri(deps, recipient)],
				inReplyTo: {
					type: 'Note',
					id: parentUri,
					attributedTo: actor.uri!,
					content: 'private parent body',
					to: [],
				},
			},
			asRemote(actor),
			new Set(),
			true,
		);

		expect(reply).toMatchObject({
			uri: replyUri,
			text: 'visible reply',
			replyId: null,
			visibility: 'specified',
			visibleUserIds: [recipient.id],
		});
		expect(getActivityJson).toHaveBeenCalledWith(parentUri, undefined, expect.anything());
		expect(await fetchNoteByUriFromDatabase(deps.db, parentUri)).toBeNull();
	});

	test.each([429, 451, 500, 503])('Create: 返信元の HTTP %i は握りつぶさない', async (status) => {
		const actor = await createTestRemoteUser(deps, 'retryreply', 'retry-reply.example.com');
		const replyUri = `https://${actor.host}/notes/${genId()}`;
		const error = new StatusError('parent failure', status);
		const noteDeps = {
			...deps,
			meta: { ...deps.meta, signToActivityPubGet: false },
			httpRequestService: Object.assign(Object.create(deps.httpRequestService), {
				getActivityJson: vi.fn().mockRejectedValue(error),
			}),
		};
		await expect(
			createNoteFromApForApi(
				noteDeps,
				{
					type: 'Note',
					id: replyUri,
					attributedTo: actor.uri!,
					content: 'retry reply',
					to: ['https://www.w3.org/ns/activitystreams#Public'],
					inReplyTo: `https://${actor.host}/notes/${genId()}`,
				},
				asRemote(actor),
				new Set(),
				true,
			),
		).rejects.toBe(error);
		expect(await fetchNoteByUriFromDatabase(deps.db, replyUri)).toBeNull();
	});

	test('Create: 保存済みの非公開返信元との関連を維持する', async () => {
		const actor = await createTestRemoteUser(deps, 'knownreply', 'known-reply.example.com');
		const recipient = await createTestLocalUser(deps, 'knownrecipient');
		const parent = {
			id: genId(),
			uri: `https://${actor.host}/notes/${genId()}`,
			userId: actor.id,
			userHost: actor.host,
			text: 'known parent',
			visibility: 'specified' as const,
			visibleUserIds: [recipient.id],
		};
		await createNoteInDatabase(deps.db, parent);
		const reply = await createNoteFromApForApi(
			deps,
			{
				type: 'Note',
				id: `https://${actor.host}/notes/${genId()}`,
				attributedTo: actor.uri!,
				content: 'known reply',
				to: [localUserUri(deps, recipient)],
				inReplyTo: parent.uri!,
			},
			asRemote(actor),
			new Set(),
			true,
		);
		expect(reply?.replyId).toBe(parent.id);
	});

	test('Follow: リモートアクターがローカルユーザーをフォローする', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxfollow', 'hono-inbox-follow.example.com');
		const followee = await createTestLocalUser(deps, 'honoinboxfollowee');

		const activity: IObject = {
			type: 'Follow',
			id: `https://hono-inbox-follow.example.com/follows/${genId()}`,
			actor: actor.uri!,
			object: localUserUri(deps, followee),
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, actor.id, followee.id);
		expect(following).not.toBeNull();
	});

	test.each([false, true])('Follow: 凍結中のローカルユーザーは Reject を返す (locked=%s)', async (isLocked) => {
		const actor = await createTestRemoteUser(deps, 'suspendedfollow', 'suspended-follow.example.com');
		const followee = await createTestLocalUser(deps, 'suspendedfollowee', { isSuspended: true, isLocked });
		const activity: IFollow = {
			type: 'Follow',
			id: `https://${actor.host}/follows/${genId()}`,
			actor: actor.uri!,
			object: localUserUri(deps, followee),
		};
		const deliver = vi.spyOn(deps.deliverQueue, 'add').mockResolvedValue({} as never);
		try {
			await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, actor.id, followee.id)).toBeNull();
			expect(await fetchFollowRequestFromDatabase(deps.db, actor.id, followee.id)).toBeNull();
			expect(deliver).toHaveBeenCalledOnce();
			const delivery = deliver.mock.calls[0]![1];
			expect(delivery.to).toBe(actor.inbox);
			expect(JSON.parse(delivery.content)).toMatchObject({
				type: 'Reject',
				actor: localUserUri(deps, followee),
				object: { type: 'Follow', id: activity.id, actor: actor.uri, object: localUserUri(deps, followee) },
			});
		} finally {
			deliver.mockRestore();
		}
	});

	test('Follow: 鍵アカウントへのフォローはフォローリクエストを作る', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxfollowlock', 'hono-inbox-follow-lock.example.com');
		const followee = await createTestLocalUser(deps, 'honoinboxfolloweelock', { isLocked: true });

		const activity: IObject = {
			type: 'Follow',
			id: `https://hono-inbox-follow-lock.example.com/follows/${genId()}`,
			actor: actor.uri!,
			object: localUserUri(deps, followee),
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
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
			id: genId(),
			followerId: actor.id,
			followeeId: followee.id,
		});

		const activity: IObject = {
			type: 'Undo',
			id: `https://hono-inbox-undo-follow.example.com/undo/${genId()}`,
			actor: actor.uri!,
			object: {
				type: 'Follow',
				actor: actor.uri!,
				object: localUserUri(deps, followee),
			},
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok: follow request canceled');

		const request = await fetchFollowRequestFromDatabase(deps.db, actor.id, followee.id);
		expect(request).toBeNull();
	});

	test('Block: リモートアクターがローカルユーザーをブロックする', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxblock', 'hono-inbox-block.example.com');
		const blockee = await createTestLocalUser(deps, 'honoinboxblockee');

		const activity: IObject = {
			type: 'Block',
			id: `https://hono-inbox-block.example.com/blocks/${genId()}`,
			actor: actor.uri!,
			object: localUserUri(deps, blockee),
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, actor.id, blockee.id);
		expect(blocking).not.toBeNull();
	});

	test('Undo(Block): 既存のブロックを解除する', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxunblock', 'hono-inbox-unblock.example.com');
		const blockee = await createTestLocalUser(deps, 'honoinboxunblockee');

		const activity: IObject = {
			type: 'Block',
			id: `https://hono-inbox-unblock.example.com/blocks/${genId()}`,
			actor: actor.uri!,
			object: localUserUri(deps, blockee),
		} as IObject;
		await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, actor.id, blockee.id)).not.toBeNull();

		const undoActivity: IObject = {
			type: 'Undo',
			id: `https://hono-inbox-unblock.example.com/undo/${genId()}`,
			actor: actor.uri!,
			object: {
				type: 'Block',
				actor: actor.uri!,
				object: localUserUri(deps, blockee),
			},
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), undoActivity, new Set());
		expect(result).toBe('ok');
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, actor.id, blockee.id)).toBeNull();
	});

	test('Like: リモートアクターがローカルノートにリアクションする', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxlike', 'hono-inbox-like.example.com');
		const noteOwner = await createTestLocalUser(deps, 'honoinboxlikeowner');
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'hono-ap-inbox like test',
			userId: noteOwner.id,
			userHost: null,
			visibility: 'public',
		});

		const activity: IObject = {
			type: 'Like',
			id: `https://hono-inbox-like.example.com/likes/${genId()}`,
			actor: actor.uri!,
			object: `${deps.config.instance.url}/notes/${noteId}`,
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok');

		const reaction = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, actor.id, noteId);
		expect(reaction).not.toBeNull();
	});

	test('Undo(Like): 既存のリアクションを取り消す', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxunlike', 'hono-inbox-unlike.example.com');
		const noteOwner = await createTestLocalUser(deps, 'honoinboxunlikeowner');
		const noteId = genId();
		await createNoteInDatabase(deps.db, {
			id: noteId,
			text: 'hono-ap-inbox unlike test',
			userId: noteOwner.id,
			userHost: null,
			visibility: 'public',
		});

		const likeActivity: IObject = {
			type: 'Like',
			id: `https://hono-inbox-unlike.example.com/likes/${genId()}`,
			actor: actor.uri!,
			object: `${deps.config.instance.url}/notes/${noteId}`,
		} as IObject;
		await performOneActivityForApi(deps, asRemote(actor), likeActivity, new Set());
		expect(await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, actor.id, noteId)).not.toBeNull();

		const undoActivity: IObject = {
			type: 'Undo',
			id: `https://hono-inbox-unlike.example.com/undo/${genId()}`,
			actor: actor.uri!,
			object: {
				type: 'Like',
				actor: actor.uri!,
				object: `${deps.config.instance.url}/notes/${noteId}`,
			},
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), undoActivity, new Set());
		expect(result).toBe('ok');
		expect(await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, actor.id, noteId)).toBeNull();
	});

	test('Delete: リモートアクターが自分のノートを削除する', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxdelete', 'hono-inbox-delete.example.com');
		const noteId = genId();
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
			id: `https://hono-inbox-delete.example.com/deletes/${genId()}`,
			actor: actor.uri!,
			object: noteUri,
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(result).toBe('ok: note deleted');
		expect(await fetchNoteByIdFromDatabase(deps.db, noteId)).toBeNull();
	});

	test('未知のアクティビティタイプは unrecognized として返す', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxunknown', 'hono-inbox-unknown.example.com');

		const activity: IObject = {
			type: 'SomeUnknownType',
			id: `https://hono-inbox-unknown.example.com/x/${genId()}`,
			actor: actor.uri!,
			object: actor.uri!,
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(actor), activity, new Set());
		expect(result).toContain('unrecognized activity type');
	});

	test('actorがisSuspendedの場合は何もしない', async () => {
		const actor = await createTestRemoteUser(deps, 'honoinboxsuspended', 'hono-inbox-suspended.example.com');
		const suspendedActor = { ...actor, isSuspended: true };

		const activity: IObject = {
			type: 'Follow',
			id: `https://hono-inbox-suspended.example.com/follows/${genId()}`,
			actor: actor.uri!,
			object: actor.uri!,
		} as IObject;

		const result = await performOneActivityForApi(deps, asRemote(suspendedActor), activity, new Set());
		expect(result).toBeUndefined();
	});
});
