/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { acquireApObjectLock } from '@/misc/distributed-lock.js';
import { concat, toArray, toSingle, unique } from '@/misc/prelude/array.js';
import { StatusError } from '@/misc/status-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import { queueRetentionOptions } from '@/queue/const.js';
import {
	getApHrefNullable,
	getApId,
	getApIds,
	getApType,
	isAccept,
	isActor,
	isAdd,
	isAnnounce,
	isBlock,
	isCollection,
	isCollectionOrOrderedCollection,
	isCreate,
	isDelete,
	isFlag,
	isFollow,
	isLike,
	isMove,
	isPost,
	isReject,
	isRemove,
	isTombstone,
	isUndo,
	isUpdate,
	validActor,
	validPost,
	type IAccept,
	type IAdd,
	type IAnnounce,
	type IBlock,
	type ICreate,
	type IDelete,
	type IFlag,
	type IFollow,
	type ILike,
	type IMove,
	type IObject,
	type IPost,
	type IReject,
	type IRemove,
	type IUndo,
	type IUpdate,
} from '@/core/activitypub/type.js';
import { parseId } from '@/misc/id/parse-id.js';
import { followRequestExistsInDatabase } from '@/core/user/FollowRequestStore.js';
import { followingExistsInDatabase } from '@/core/user/FollowingStore.js';
import { fetchNoteByUriAndUserIdFromDatabase } from '@/core/note/NoteStore.js';
import { listUsersByIdsFromDatabase, updateUserDeletedStateIfNotDeletedInDatabase } from '@/core/user/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { type DbQueue } from '@/core/queue/queues.js';
import { enqueueDbJobInOutbox, publishDbOutboxRowEagerly } from '@/core/queue/QueueOutboxStore.js';
import type { Config } from '@/config.js';
import type { MiRemoteUser } from '@/models/User.js';
import {
	extractDbHost,
	getNoteFromApIdForHonoApi,
	getUserFromApIdForHonoApi,
	isFederationAllowedUri,
	resolveApObjectForHonoApi,
	type HonoApiApResolveDependencies,
} from '@/server/rest/activitypub/ap-resolve.js';
import {
	extractEmojisForHonoApi,
	updatePersonForHonoApi,
	type HonoApiApPersonDependencies,
} from '@/server/rest/activitypub/ap-person.js';
import {
	createNoteFromApForHonoApi,
	parseAudienceForHonoApi,
	resolveNoteForHonoApi,
	updateQuestionFromApForHonoApi,
	type HonoApiApNoteDependencies,
} from '@/server/rest/activitypub/ap-note.js';
import { createNoteForHonoApi, type CreateNoteData } from '@/server/rest/note/notes-create.js';
import { deleteNoteForHonoApi, type HonoApiNotesDeleteDependencies } from '@/server/rest/note/notes-delete.js';
import {
	createNoteReactionForHonoApi,
	deleteNoteReactionForHonoApi,
	type HonoApiNotesReactionsDependencies,
} from '@/server/rest/note/notes-reactions.js';
import { isVisibleForMeForHonoApi, packNoteForHonoApi } from '@/server/rest/note/note.js';
import {
	blockForHonoApi,
	cancelFollowRequest,
	remoteRejectForHonoApi,
	unblockForHonoApi,
	unfollow,
	type HonoApiAccountBlockingDependencies,
} from '@/server/rest/account/account-blocking.js';
import {
	followWithSideEffectsForHonoApi,
	type HonoQueueRelationshipDependencies,
} from '../../queue/handlers/relationship.js';
import { acceptFollowRequestForHonoApi, type HonoApiFollowingDependencies } from '@/server/rest/user/following.js';
import {
	addPinnedForHonoApi,
	removePinnedForHonoApi,
	type HonoApiAccountPinDependencies,
} from '@/server/rest/account/account-pin.js';
import {
	isRelayActorForHonoApi,
	relayAcceptedForHonoApi,
	relayRejectedForHonoApi,
	type HonoApiAdminRelaysDependencies,
} from '@/server/rest/admin/admin-relays.js';
import { reportAbuseForHonoApi, type HonoApiUsersReportAbuseDependencies } from '@/server/rest/admin/admin-abuse-reports.js';
import type {
	HonoApiInternalEventPublisher,
	HonoApiNotesStreamPublisher,
	HonoApiNoteStreamPublisher,
} from '../rest/events.js';
import type { HonoChartWriters } from '../chart-runtime.js';

export type HonoApiInboxDependencies = HonoApiApResolveDependencies &
	HonoApiApPersonDependencies &
	HonoApiApNoteDependencies &
	HonoApiNotesDeleteDependencies &
	HonoApiNotesReactionsDependencies &
	HonoApiAccountBlockingDependencies &
	HonoQueueRelationshipDependencies &
	HonoApiFollowingDependencies &
	HonoApiAccountPinDependencies &
	HonoApiAdminRelaysDependencies &
	HonoApiUsersReportAbuseDependencies & {
		config: Config;
		db: MiDrizzleDatabase;
		redis: Redis.Redis;
		dbQueue: DbQueue;
		chartWriters: HonoChartWriters;
		publishInternalEvent?: HonoApiInternalEventPublisher;
		publishNoteStream?: HonoApiNoteStreamPublisher;
		publishNotesStream?: HonoApiNotesStreamPublisher;
	};

export async function performActivityForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IObject,
): Promise<string | void> {
	let result: string | void = undefined;

	if (isCollectionOrOrderedCollection(activity)) {
		const history = new Set<string>();
		const results: [string, string | void][] = [];
		const items = toArray(isCollection(activity) ? activity.items : activity.orderedItems);
		if (items.length >= 256) {
			throw new Error(`skipping activity: collection would surpass recursion limit: ${extractDbHost(actor.uri)}`);
		}

		for (const item of items) {
			const act = await resolveApObjectForHonoApi(deps, item, FetchAllowSoftFailMask.Strict, history);
			if (act.id == null || extractDbHost(act.id) !== extractDbHost(actor.uri)) {
				continue;
			}
			try {
				results.push([getApId(item), await performOneActivityForHonoApi(deps, actor, act, history)]);
			} catch (err) {
				if (!(err instanceof Error) && typeof err !== 'string') {
					throw err;
				}
			}
		}

		const hasReason = results.some(([, reason]) => reason != null && !reason.startsWith('ok'));
		if (hasReason) {
			result = results.map(([id, reason]) => `${id}: ${reason}`).join('\n');
		}
	} else {
		result = await performOneActivityForHonoApi(deps, actor, activity, new Set());
	}

	if (actor.uri) {
		if (actor.lastFetchedAt == null || Date.now() - actor.lastFetchedAt.getTime() > 1000 * 60 * 60 * 24) {
			void updatePersonForHonoApi(deps, actor.uri, actor).catch(() => {});
		}
	}

	return result;
}

export async function performOneActivityForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IObject,
	history: Set<string>,
): Promise<string | void> {
	if (actor.isSuspended) return;

	if (isCreate(activity)) return await createFromApForHonoApi(deps, actor, activity, history);
	if (isDelete(activity)) return await deleteFromApForHonoApi(deps, actor, activity);
	if (isUpdate(activity)) return await updateFromApForHonoApi(deps, actor, activity, history);
	if (isFollow(activity)) return await followFromApForHonoApi(deps, actor, activity);
	if (isAccept(activity)) return await acceptFromApForHonoApi(deps, actor, activity, history);
	if (isReject(activity)) return await rejectFromApForHonoApi(deps, actor, activity, history);
	if (isAdd(activity)) return await addFromApForHonoApi(deps, actor, activity, history);
	if (isRemove(activity)) return await removeFromApForHonoApi(deps, actor, activity, history);
	if (isAnnounce(activity)) return await announceFromApForHonoApi(deps, actor, activity, history);
	if (isLike(activity)) return await likeFromApForHonoApi(deps, actor, activity);
	if (isUndo(activity)) return await undoFromApForHonoApi(deps, actor, activity, history);
	if (isBlock(activity)) return await blockFromApForHonoApi(deps, actor, activity);
	if (isFlag(activity)) return await flagFromApForHonoApi(deps, actor, activity);
	if (isMove(activity)) return await moveFromApForHonoApi(deps, actor, activity, history);

	return `unrecognized activity type: ${activity.type}`;
}

async function followFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IFollow,
): Promise<string> {
	const followee = await getUserFromApIdForHonoApi(deps, activity.object);
	if (followee == null) return 'skip: followee not found';
	if (followee.host != null) return 'skip: フォローしようとしているユーザーはローカルユーザーではありません';

	// タイムアウト時に送信元が再試行する可能性があるため、キューへ積まない。
	await followWithSideEffectsForHonoApi(
		deps,
		actor,
		followee,
		activity.id === undefined ? {} : { requestId: activity.id },
	);
	return 'ok';
}

async function likeFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: ILike,
): Promise<string> {
	const targetUri = getApId(activity.object);

	const note = await getNoteFromApIdForHonoApi(deps, targetUri);
	if (!note) return `skip: target note not found ${targetUri}`;

	await extractEmojisForHonoApi(deps, activity.tag ?? [], actor.host ?? '').catch(() => null);

	try {
		await createNoteReactionForHonoApi(
			deps,
			actor,
			note,
			activity._misskey_reaction ?? activity.content ?? activity.name,
		);
		return 'ok';
	} catch (err) {
		if (err instanceof IdentifiableError && err.id === '51c42bb4-931a-456b-bff7-e5a8a70dd298') {
			return 'skip: already reacted';
		}
		throw err;
	}
}

async function acceptFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IAccept,
	history: Set<string>,
): Promise<string> {
	const object = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);

	if (isFollow(object)) return await acceptFollowFromApForHonoApi(deps, actor, object);

	return `skip: Unknown Accept type: ${getApType(object)}`;
}

async function acceptFollowFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IFollow,
): Promise<string> {
	// ※ activityはこっちから投げたフォローリクエストなので、activity.actorは存在するローカルユーザーである必要がある
	const follower = await getUserFromApIdForHonoApi(deps, activity.actor);
	if (follower == null) return 'skip: follower not found';
	if (follower.host != null) return 'skip: follower is not a local user';

	const match = activity.id?.match(/follow-relay\/(\w+)/);
	if (match) return await relayAcceptedForHonoApi(deps, match[1]!);

	await acceptFollowRequestForHonoApi(deps, actor, follower);
	return 'ok';
}

async function addFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IAdd,
	history: Set<string>,
): Promise<string | void> {
	if (actor.uri !== getApId(activity.actor)) return 'invalid actor';
	if (activity.target == null) return 'target is null';

	if (activity.target === actor.featured) {
		const note = await resolveNoteForHonoApi(deps, activity.object, { resolver: history });
		if (note == null) return 'note not found';
		await addPinnedForHonoApi(deps, actor, note.id);
		return;
	}

	return `unknown target: ${activity.target}`;
}

async function announceFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IAnnounce,
	history: Set<string>,
): Promise<string | void> {
	if (!activity.object) return 'skip: activity has no object property';
	const targetUri = getApId(activity.object);
	if (targetUri.startsWith('bear:')) return 'skip: bearcaps url not supported.';

	const target = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);

	if (isPost(target)) return await announceNoteFromApForHonoApi(deps, actor, activity, target, history);

	return `skip: unknown object type ${getApType(target)}`;
}

async function announceNoteFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IAnnounce,
	target: IPost,
	history: Set<string>,
): Promise<string | void> {
	if (actor.isSuspended) return;

	// リレーからのAnnounceかチェック
	const fromRelay = await isRelayActorForHonoApi(deps, actor);
	const uri = getApId(fromRelay ? target : activity);

	// アナウンス先が許可されているかチェック
	if (!isFederationAllowedUri(deps.config, deps.meta, uri)) return;

	const activityUri = getApId(activity);
	const unlock = await acquireApObjectLock(deps.redis, activityUri);

	try {
		// 既に同じURIを持つものが登録されていないかチェック
		const exist = await getNoteFromApIdForHonoApi(deps, uri);
		if (exist) return;

		// Announce対象をresolve
		let renote;
		try {
			renote = await resolveNoteForHonoApi(deps, target, { resolver: history });
			if (renote == null) return 'announce target is null';
		} catch (err) {
			if (err instanceof StatusError) {
				if (!err.isRetryable) {
					return `Ignored announce target ${target.id} - ${err.statusCode}`;
				}
				return `Error in announce target ${target.id} - ${err.statusCode}`;
			}
			throw err;
		}

		// リレーからのAnnounceはリノートを作成せず、ノートを直接公開する
		if (fromRelay) {
			const noteObj = await packNoteForHonoApi(deps, renote, null, {
				skipHide: true,
				withReactionAndUserPairCache: true,
			});
			deps.publishNotesStream?.(noteObj);
			return;
		}

		if (!(await isVisibleForMeForHonoApi(deps, renote, actor.id))) {
			return 'skip: invalid actor for this activity';
		}

		const activityAudience = await parseAudienceForHonoApi(deps, actor, activity.to, activity.cc, history);
		const createdAt = activity.published ? new Date(activity.published) : null;

		if (createdAt && createdAt < parseId(renote.id).date) {
			return 'skip: malformed createdAt';
		}

		const data: CreateNoteData = {
			createdAt,
			files: [],
			reply: null,
			renote,
			cw: null,
			text: null,
			localOnly: false,
			reactionAcceptance: null,
			visibility: activityAudience.visibility,
			visibleUsers: activityAudience.visibleUsers,
			channel: null,
			apMentions: [],
			apMentionRawCount: 0,
			apHashtags: [],
			apEmojis: [],
			poll: null,
			uri,
			url: null,
		};

		await createNoteForHonoApi(deps, actor, data, false);
	} finally {
		unlock();
	}
}

async function blockFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IBlock,
): Promise<string> {
	// ※ activity.objectにブロック対象があり、それは存在するローカルユーザーのはず
	const blockee = await getUserFromApIdForHonoApi(deps, activity.object);
	if (blockee == null) return 'skip: blockee not found';
	if (blockee.host != null) return 'skip: ブロックしようとしているユーザーはローカルユーザーではありません';

	await blockForHonoApi(deps, actor, blockee);
	return 'ok';
}

async function createFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: ICreate,
	history: Set<string>,
): Promise<string | void> {
	if (!activity.object) return 'skip: activity has no object property';
	const targetUri = getApId(activity.object);
	if (targetUri.startsWith('bear:')) return 'skip: bearcaps url not supported.';

	// Activity と object の audience を相互にコピーする。
	if (typeof activity.object === 'object') {
		const to = unique(concat([toArray(activity.to), toArray(activity.object.to)]));
		const cc = unique(concat([toArray(activity.cc), toArray(activity.object.cc)]));

		activity.to = to;
		activity.cc = cc;
		activity.object.to = to;
		activity.object.cc = cc;
	}

	// attributedTo がなければ Activity の actor を使う。
	if (typeof activity.object === 'object' && !activity.object.attributedTo) {
		activity.object.attributedTo = activity.actor;
	}

	const object = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);

	if (isPost(object)) {
		return await createNoteWithLockFromApForHonoApi(deps, actor, object, history);
	}
	return `Unknown type: ${getApType(object)}`;
}

async function createNoteWithLockFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	note: IObject,
	history: Set<string>,
	silent = false,
): Promise<string> {
	const uri = getApId(note);

	if (typeof note === 'object') {
		if (actor.uri !== note.attributedTo) return 'skip: actor.uri !== note.attributedTo';

		if (typeof note.id === 'string') {
			if (extractDbHost(actor.uri) !== extractDbHost(note.id)) return 'skip: host in actor.uri !== note.id';
		} else {
			return 'skip: note.id is not a string';
		}
	}

	const unlock = await acquireApObjectLock(deps.redis, uri);
	try {
		const exist = await getNoteFromApIdForHonoApi(deps, note);
		if (exist) return 'skip: note exists';

		await createNoteFromApForHonoApi(deps, note, actor, history, silent);
		return 'ok';
	} catch (err) {
		if (err instanceof StatusError && !err.isRetryable) {
			return `skip ${err.statusCode}`;
		}
		throw err;
	} finally {
		unlock();
	}
}

async function deleteFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IDelete,
): Promise<string> {
	if (actor.uri !== getApId(activity.actor)) return 'invalid actor';

	// 削除対象objectのtype
	let formerType: string | undefined;

	if (typeof activity.object === 'string') {
		formerType = undefined;
	} else {
		const object = activity.object;
		formerType = isTombstone(object) ? toSingle(object.formerType) : toSingle(object.type);
	}

	const uri = getApId(activity.object);

	// type不明でもactorとobjectが同じならばそれはPersonに違いない
	if (!formerType && actor.uri === uri) formerType = 'Person';

	// それでもなかったらおそらくNote
	if (!formerType) formerType = 'Note';

	if (validPost.includes(formerType)) return await deleteNoteFromApForHonoApi(deps, actor, uri);
	if (validActor.includes(formerType)) return await deleteActorFromApForHonoApi(deps, actor, uri);
	return `Unknown type ${formerType}`;
}

async function deleteActorFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	uri: string,
): Promise<string> {
	if (actor.uri !== uri) return `skip: delete actor ${actor.uri} !== ${uri}`;

	const outboxId = await deps.db.transaction(async (transaction) => {
		if (!(await updateUserDeletedStateIfNotDeletedInDatabase(transaction as MiDrizzleDatabase, actor.id, true)))
			return null;

		return await enqueueDbJobInOutbox(
			transaction as MiDrizzleDatabase,
			'deleteAccount',
			{
				user: { id: actor.id },
			},
			queueRetentionOptions(deps.config),
		);
	});

	if (outboxId == null) {
		return 'skip: already deleted or actor not found';
	}

	void publishDbOutboxRowEagerly(deps.db, deps.dbQueue, outboxId, {
		name: 'deleteAccount',
		data: { user: { id: actor.id } },
		opts: queueRetentionOptions(deps.config),
	});
	deps.publishInternalEvent?.('remoteUserUpdated', { id: actor.id });

	return `ok: queued deleteAccount outbox-${outboxId}`;
}

async function deleteNoteFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	uri: string,
): Promise<string> {
	const unlock = await acquireApObjectLock(deps.redis, uri);
	try {
		const note = await getNoteFromApIdForHonoApi(deps, uri);
		if (note == null) return 'message not found';
		if (note.userId !== actor.id) return '投稿を削除しようとしているユーザーは投稿の作成者ではありません';

		await deleteNoteForHonoApi(deps, actor, note);
		return 'ok: note deleted';
	} finally {
		unlock();
	}
}

async function flagFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IFlag,
): Promise<string> {
	// objectは `(User|Note) | (User|Note)[]` だけど、全パターンDBスキーマと対応させられないので
	// 対象ユーザーは一番最初のユーザー として あとはコメントとして格納する
	const uris = getApIds(activity.object);

	const userIds = uris
		.filter((uri) => uri.startsWith(deps.config.instance.url + '/users/'))
		.map((uri) => uri.split('/').at(-1))
		.filter((x): x is string => x != null);
	const users = await listUsersByIdsFromDatabase(deps.db, userIds, { includeSuspended: true });
	if (users.length < 1) return 'skip';

	await reportAbuseForHonoApi(deps, [
		{
			targetUserId: users[0]!.id,
			targetUserHost: users[0]!.host,
			reporterId: actor.id,
			reporterHost: actor.host,
			comment: `${activity.content}\n${JSON.stringify(uris, null, 2)}`,
		},
	]);

	return 'ok';
}

/** 移行カスケードは updatePersonForHonoApi が movedToUri の新規出現・変更を検知したときに実行する。 */
async function moveFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IMove,
	history: Set<string>,
): Promise<string> {
	const targetUri = getApHrefNullable(activity.target);
	if (!targetUri) return 'skip: invalid activity target';

	await updatePersonForHonoApi(deps, actor.uri, actor);
	return 'ok';
}

async function rejectFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IReject,
	history: Set<string>,
): Promise<string> {
	const object = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);

	if (isFollow(object)) return await rejectFollowFromApForHonoApi(deps, actor, object);

	return `skip: Unknown Reject type: ${getApType(object)}`;
}

async function rejectFollowFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IFollow,
): Promise<string> {
	// ※ activityはこっちから投げたフォローリクエストなので、activity.actorは存在するローカルユーザーである必要がある
	const follower = await getUserFromApIdForHonoApi(deps, activity.actor);
	if (follower == null) return 'skip: follower not found';
	if (follower.host != null) return 'skip: follower is not a local user';

	const match = activity.id?.match(/follow-relay\/(\w+)/);
	if (match) return await relayRejectedForHonoApi(deps, match[1]!);

	await remoteRejectForHonoApi(deps, actor, follower);
	return 'ok';
}

async function removeFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IRemove,
	history: Set<string>,
): Promise<string | void> {
	if (actor.uri !== getApId(activity.actor)) return 'invalid actor';
	if (activity.target == null) return 'target is null';

	if (activity.target === actor.featured) {
		const note = await resolveNoteForHonoApi(deps, activity.object, { resolver: history });
		if (note == null) return 'note not found';
		await removePinnedForHonoApi(deps, actor, note.id);
		return;
	}

	return `unknown target: ${activity.target}`;
}

async function updateFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IUpdate,
	history: Set<string>,
): Promise<string> {
	if (actor.uri !== getApId(activity.actor)) return 'skip: invalid actor';

	const object = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);

	if (isActor(object)) {
		// 解決済みオブジェクトを使う。再フェッチすると中間キャッシュ (nginx 等、Cache-Control: max-age=180)
		// の古い Person を取得して更新を反映できない。
		await updatePersonForHonoApi(deps, actor.uri, actor, [], object);
		return 'ok: Person updated';
	} else if (getApType(object) === 'Question') {
		await updateQuestionFromApForHonoApi(deps, object, actor, history).catch((err) => console.error(err));
		return 'ok: Question updated';
	} else {
		return `skip: Unknown type: ${getApType(object)}`;
	}
}

async function undoFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IUndo,
	history: Set<string>,
): Promise<string> {
	if (actor.uri !== getApId(activity.actor)) return 'invalid actor';

	// タイムアウト時に送信元が再試行する可能性があるため、キューへ積まない。
	const object = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);

	if (isFollow(object)) return await undoFollowFromApForHonoApi(deps, actor, object);
	if (isBlock(object)) return await undoBlockFromApForHonoApi(deps, actor, object);
	if (isLike(object)) return await undoLikeFromApForHonoApi(deps, actor, object);
	if (isAnnounce(object)) return await undoAnnounceFromApForHonoApi(deps, actor, object);
	if (isAccept(object)) return await undoAcceptFromApForHonoApi(deps, actor, object, history);

	return `skip: unknown object type ${getApType(object)}`;
}

async function undoAcceptFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IAccept,
	history: Set<string>,
): Promise<string> {
	if (actor.uri !== getApId(activity.actor)) return 'invalid actor';

	const follow = await resolveApObjectForHonoApi(deps, activity.object, FetchAllowSoftFailMask.Strict, history);
	if (!isFollow(follow)) return 'skip: Accept object is not a Follow';
	if (getApId(follow.object) !== actor.uri) return 'invalid followee';

	const follower = await getUserFromApIdForHonoApi(deps, follow.actor);
	if (follower == null) return 'skip: follower not found';
	if (follower.host != null) return 'skip: follower is not a local user';

	const isFollowing = await followingExistsInDatabase(deps.db, follower.id, actor.id);
	if (isFollowing) {
		await unfollow(deps, follower, actor);
		return 'ok: unfollowed';
	}

	return 'skip: フォローされていない';
}

async function undoAnnounceFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IAnnounce,
): Promise<string> {
	const uri = getApId(activity);

	const note = await fetchNoteByUriAndUserIdFromDatabase(deps.db, uri, actor.id);
	if (!note) return 'skip: no such Announce';

	await deleteNoteForHonoApi(deps, actor, note);
	return 'ok: deleted';
}

async function undoBlockFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IBlock,
): Promise<string> {
	const blockee = await getUserFromApIdForHonoApi(deps, activity.object);
	if (blockee == null) return 'skip: blockee not found';
	if (blockee.host != null) return 'skip: ブロック解除しようとしているユーザーはローカルユーザーではありません';

	await unblockForHonoApi(deps, actor, blockee);
	return 'ok';
}

async function undoFollowFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: IFollow,
): Promise<string> {
	const followee = await getUserFromApIdForHonoApi(deps, activity.object);
	if (followee == null) return 'skip: followee not found';
	if (followee.host != null) return 'skip: フォロー解除しようとしているユーザーはローカルユーザーではありません';

	const requestExist = await followRequestExistsInDatabase(deps.db, actor.id, followee.id);
	const isFollowing = await followingExistsInDatabase(deps.db, actor.id, followee.id);

	if (requestExist) {
		await cancelFollowRequest(deps, actor, followee);
		return 'ok: follow request canceled';
	}

	if (isFollowing) {
		await unfollow(deps, actor, followee);
		return 'ok: unfollowed';
	}

	return 'skip: リクエストもフォローもされていない';
}

async function undoLikeFromApForHonoApi(
	deps: HonoApiInboxDependencies,
	actor: MiRemoteUser,
	activity: ILike,
): Promise<string> {
	const targetUri = getApId(activity.object);

	const note = await getNoteFromApIdForHonoApi(deps, targetUri);
	if (!note) return `skip: target note not found ${targetUri}`;

	await deleteNoteReactionForHonoApi(deps, actor, note).catch((e: unknown) => {
		if (e instanceof IdentifiableError && e.id === '60527ec9-b4cb-4a88-a6bd-32d3ad26817d') return;
		throw e;
	});

	return 'ok';
}
