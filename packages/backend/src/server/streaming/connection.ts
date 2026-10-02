/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import type { GlobalEvents } from '@/core/global-events.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/user-profile-store.js';
import { fetchUserByIdFromDatabase } from '@/core/user/user-store.js';
import { fetchAccessTokenByTokenFromDatabase } from '@/core/app/access-token-store.js';
import { listFolloweeIdsWithRepliesByFollowerIdFromDatabase } from '@/core/user/following-store.js';
import { listFollowedChannelIdsByUserIdFromDatabase } from '@/core/channel/channel-following-store.js';
import { listMutedChannelIdsByUserIdFromDatabase } from '@/core/channel/channel-muting-store.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/user/muting-store.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/user/blocking-store.js';
import { listRenoteMuteeIdsByMuterIdFromDatabase } from '@/core/user/renote-muting-store.js';
import { markAllApiNotificationsAsRead } from '@/server/rest/notification/notification.js';
import type { NotificationDependencies } from '@/core/notification/notification.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiFollowing, MiUserProfile } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type {
	StreamChannelContext,
	StreamChannelDefinition,
	StreamChannelHandle,
	StreamChannelSubscriber,
} from './channel.js';
import { honoStreamChannelAdmin } from './channels/admin.js';
import { honoStreamChannelDrive } from './channels/drive.js';
import { honoStreamChannelMain } from './channels/main.js';
import { honoStreamChannelChatUser } from './channels/chat-user.js';
import { honoStreamChannelChatRoom } from './channels/chat-room.js';
import { honoStreamChannelHashtag } from './channels/hashtag.js';
import { honoStreamChannelAntenna } from './channels/antenna.js';
import { honoStreamChannelChannel } from './channels/channel.js';
import { honoStreamChannelUserList } from './channels/user-list.js';
import { honoStreamChannelRoleTimeline } from './channels/role-timeline.js';
import { honoStreamChannelLocalTimeline } from './channels/local-timeline.js';
import { honoStreamChannelGlobalTimeline } from './channels/global-timeline.js';
import { honoStreamChannelHomeTimeline } from './channels/home-timeline.js';
import { honoStreamChannelHybridTimeline } from './channels/hybrid-timeline.js';
import { honoStreamChannelQueueStats } from './channels/queue-stats.js';
import { honoStreamChannelServerStats } from './channels/server-stats.js';

const MAX_CHANNELS_PER_CONNECTION = 32;
const INITIALIZATION_TIMEOUT_MS = 30_000;
const REFRESH_CONCURRENCY = 8;
const REFRESH_RETRY_DELAYS_MS = [0, 250, 1000] as const;

class StreamInitializationTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
	let timeoutId: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timeoutId = setTimeout(() => reject(new StreamInitializationTimeoutError(message)), INITIALIZATION_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timeoutId != null) {
			clearTimeout(timeoutId);
		}
	}
}

class StreamChannelSubscriberScope implements StreamChannelSubscriber {
	private readonly listeners: { eventName: string | symbol; listener: Parameters<EventEmitter['on']>[1] }[] = [];
	private disposed = false;

	constructor(private readonly subscriber: EventEmitter) {}

	public on(eventName: string | symbol, listener: Parameters<EventEmitter['on']>[1]): void {
		if (this.disposed) {
			return;
		}
		this.subscriber.on(eventName, listener);
		this.listeners.push({ eventName, listener });
	}

	public off(eventName: string | symbol, listener: Parameters<EventEmitter['off']>[1]): void {
		this.subscriber.off(eventName, listener);
		const index = this.listeners.findLastIndex((entry) => entry.eventName === eventName && entry.listener === listener);
		if (index !== -1) {
			this.listeners.splice(index, 1);
		}
	}

	public dispose(): void {
		this.disposed = true;
		for (const { eventName, listener } of this.listeners) {
			this.subscriber.off(eventName, listener);
		}
		this.listeners.length = 0;
	}
}

export type StreamConnectionDependencies = NotificationDependencies &
	Parameters<typeof honoStreamChannelMain.init>[0] &
	Parameters<typeof honoStreamChannelChatRoom.init>[0] &
	Parameters<typeof honoStreamChannelHashtag.init>[0] &
	Parameters<typeof honoStreamChannelAntenna.init>[0] &
	Parameters<typeof honoStreamChannelChannel.init>[0] &
	Parameters<typeof honoStreamChannelUserList.init>[0] &
	Parameters<typeof honoStreamChannelRoleTimeline.init>[0] &
	Parameters<typeof honoStreamChannelLocalTimeline.init>[0] &
	Parameters<typeof honoStreamChannelGlobalTimeline.init>[0] &
	Parameters<typeof honoStreamChannelHomeTimeline.init>[0] &
	Parameters<typeof honoStreamChannelHybridTimeline.init>[0] & {
		db: MiDrizzleDatabase;
	};

type ConnectionSnapshot = {
	userProfile: MiUserProfile | null;
	following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined>;
	followingChannels: Set<string>;
	mutingChannels: Set<string>;
	userIdsWhoMeMuting: Set<string>;
	userIdsWhoBlockingMe: Set<string>;
	userIdsWhoMeMutingRenotes: Set<string>;
	userMutedInstances: Set<string>;
};

async function fetchStreamConnectionSnapshot(
	deps: StreamConnectionDependencies,
	userId: MiUser['id'],
): Promise<ConnectionSnapshot> {
	const [userProfile, followees, followingChannelIds, mutedChannelIds, muteeIds, blockerIds, renoteMuteeIds] =
		await Promise.all([
			fetchUserProfileByUserIdFromDatabase(deps.db, userId),
			listFolloweeIdsWithRepliesByFollowerIdFromDatabase(deps.db, userId),
			listFollowedChannelIdsByUserIdFromDatabase(deps.db, userId),
			listMutedChannelIdsByUserIdFromDatabase(deps.db, userId),
			listMuteeIdsByMuterIdFromDatabase(deps.db, userId),
			listBlockerIdsByBlockeeIdFromDatabase(deps.db, userId),
			listRenoteMuteeIdsByMuterIdFromDatabase(deps.db, userId),
		]);

	const following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
	for (const followee of followees) {
		following[followee.followeeId] = { withReplies: followee.withReplies };
	}

	return {
		userProfile,
		following,
		followingChannels: new Set(followingChannelIds),
		mutingChannels: new Set(mutedChannelIds),
		userIdsWhoMeMuting: new Set(muteeIds),
		userIdsWhoBlockingMe: new Set(blockerIds),
		userIdsWhoMeMutingRenotes: new Set(renoteMuteeIds),
		userMutedInstances: new Set(userProfile?.mutedInstances),
	};
}

const HONO_STREAM_CHANNELS: Record<string, StreamChannelDefinition<StreamConnectionDependencies>> = {
	admin: honoStreamChannelAdmin,
	drive: honoStreamChannelDrive,
	main: honoStreamChannelMain,
	chatUser: honoStreamChannelChatUser,
	chatRoom: honoStreamChannelChatRoom,
	hashtag: honoStreamChannelHashtag,
	antenna: honoStreamChannelAntenna,
	channel: honoStreamChannelChannel,
	userList: honoStreamChannelUserList,
	roleTimeline: honoStreamChannelRoleTimeline,
	localTimeline: honoStreamChannelLocalTimeline,
	globalTimeline: honoStreamChannelGlobalTimeline,
	homeTimeline: honoStreamChannelHomeTimeline,
	hybridTimeline: honoStreamChannelHybridTimeline,
	queueStats: honoStreamChannelQueueStats,
	serverStats: honoStreamChannelServerStats,
};

/**
 * 1 接続で同時に購読できるノートの数。フロントは画面外のノートの購読を外すので、通常はこれに届かない。
 */
const MAX_SUBSCRIBED_NOTES_PER_CONNECTION = 1536;

export class StreamConnection {
	public readonly user?: MiUser;
	public readonly token?: MiAccessToken;
	private readonly tokenHash?: string;
	private subscriber?: EventEmitter;
	private sendToClient: ((raw: string) => void) | undefined;
	private terminate: (() => void) | undefined;
	private readonly channels = new Map<string, { channelName: string; handle: StreamChannelHandle }>();
	private readonly pendingChannels = new Map<string, StreamChannelSubscriberScope>();
	private readonly pendingChannelScopes = new Set<StreamChannelSubscriberScope>();
	/**
	 * ノート ID ごとの購読数。all は全イベント、edits は編集の合図だけの購読。挿入順を古い順として、上限を超えたら
	 * 先頭から外す。
	 */
	private readonly subscribingNotes = new Map<string, { all: number; edits: number }>();
	/** subscribingNotes のうち編集の合図だけ (all が 0) の ID。上限時にこれの先頭から外す (走査せずに見つけるため)。 */
	private readonly editOnlyNotes = new Set<string>();
	private userProfile: MiUserProfile | null = null;
	private following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
	private followingChannels = new Set<string>();
	private mutingChannels = new Set<string>();
	private userIdsWhoMeMuting = new Set<string>();
	private userIdsWhoBlockingMe = new Set<string>();
	private userIdsWhoMeMutingRenotes = new Set<string>();
	private userMutedInstances = new Set<string>();
	private pendingInternalEvents: GlobalEvents['internal']['payload'][] | null = null;
	private refreshPromise: Promise<void> | undefined;
	private disposed = false;
	private readonly onBroadcast = (data: { type: string; body: JsonValue }): void => {
		this.sendMessageToWs(data.type, data.body);
	};
	private readonly onInternalEvent = (data: GlobalEvents['internal']['payload']): void => {
		if (this.disposed) return;
		// 資格失効はプロフィールの再取得待ちに積まず、購読と送信を直ちに止める。
		if (this.user != null) {
			if (
				(data.type === 'userChangeSuspendedState' && data.body.id === this.user.id && data.body.isSuspended) ||
				(data.type === 'accessTokenRevoked' &&
					this.token != null &&
					('tokenId' in data.body
						? data.body.userId === this.user.id && data.body.tokenId === this.token.id
						: data.body.tokenHash === this.tokenHash)) ||
				(data.type === 'userTokenRegenerated' &&
					data.body.id === this.user.id &&
					this.token == null &&
					data.body.oldToken === this.user.token)
			) {
				this.invalidate();
				return;
			}
			if (data.type === 'userTokenRegenerated' && data.body.id === this.user.id && this.token == null) {
				// 同時再生成では producer が読んだ旧 token が古い場合があるため、保存済みの資格も照合する。
				void this.refresh()
					.then(() => this.assertCredentialValid())
					.catch(() => this.invalidate());
			}
		}
		if (this.pendingInternalEvents != null) {
			this.pendingInternalEvents.push(data);
			return;
		}
		this.applyInternalEvent(data);
	};
	private applyInternalEvent(data: GlobalEvents['internal']['payload']): void {
		if (this.user == null) {
			return;
		}

		switch (data.type) {
			case 'follow':
			case 'followingUpdated':
				if (data.body.followerId === this.user.id) {
					this.following[data.body.followeeId] = { withReplies: data.body.withReplies };
				}
				break;
			case 'unfollow':
				if (data.body.followerId === this.user.id) {
					delete this.following[data.body.followeeId];
				}
				break;
			case 'followingsUpdated':
				if (data.body.followerId === this.user.id) {
					for (const followeeId of Object.keys(this.following)) {
						this.following[followeeId] = { withReplies: data.body.withReplies };
					}
				}
				break;
			case 'followChannel':
				if (data.body.userId === this.user.id) {
					this.followingChannels.add(data.body.channelId);
				}
				break;
			case 'unfollowChannel':
				if (data.body.userId === this.user.id) {
					this.followingChannels.delete(data.body.channelId);
				}
				break;
			case 'muteChannel':
				if (data.body.userId === this.user.id) {
					this.mutingChannels.add(data.body.channelId);
				}
				break;
			case 'unmuteChannel':
				if (data.body.userId === this.user.id) {
					this.mutingChannels.delete(data.body.channelId);
				}
				break;
			case 'mute':
				if (data.body.muterId === this.user.id) {
					this.userIdsWhoMeMuting.add(data.body.muteeId);
				}
				break;
			case 'unmute':
				if (data.body.muterId === this.user.id) {
					this.userIdsWhoMeMuting.delete(data.body.muteeId);
				}
				break;
			case 'renoteMute':
				if (data.body.muterId === this.user.id) {
					this.userIdsWhoMeMutingRenotes.add(data.body.muteeId);
				}
				break;
			case 'renoteUnmute':
				if (data.body.muterId === this.user.id) {
					this.userIdsWhoMeMutingRenotes.delete(data.body.muteeId);
				}
				break;
			case 'blockingCreated':
				if (data.body.blockeeId === this.user.id) {
					this.userIdsWhoBlockingMe.add(data.body.blockerId);
				}
				break;
			case 'blockingDeleted':
				if (data.body.blockeeId === this.user.id) {
					this.userIdsWhoBlockingMe.delete(data.body.blockerId);
				}
				break;
			case 'updateUserProfile':
				if (data.body.userId === this.user.id) {
					this.userMutedInstances.clear();
					for (const host of data.body.mutedInstances) {
						this.userMutedInstances.add(host);
					}
				}
				break;
		}
	}
	private readonly onNoteStreamMessage = (data: {
		type: string;
		body: { id: string; userId: string; visibility: string; visibleUserIds?: string[]; body: JsonValue };
	}): void => {
		if (data.body.userId !== this.user?.id) {
			if (
				data.body.visibility === 'specified' &&
				(this.user == null || !(data.body.visibleUserIds ?? []).includes(this.user.id))
			) {
				return;
			}
			if (data.body.visibility === 'followers' && !Object.hasOwn(this.following, data.body.userId)) {
				return;
			}
		}

		// 編集の合図だけの購読には、リアクション等を送らない (古いノートでも購読できるように、量を編集の回数に抑える)。
		if (data.type !== 'edited' && (this.subscribingNotes.get(data.body.id)?.all ?? 0) === 0) {
			return;
		}

		this.sendMessageToWs('noteUpdated', {
			id: data.body.id,
			type: data.type,
			body: data.body.body,
		});
	};

	constructor(
		private readonly deps: StreamConnectionDependencies,
		user: MiUser | null | undefined,
		token: MiAccessToken | null | undefined,
	) {
		if (user) {
			this.user = user;
		}
		if (token) {
			this.token = token;
			this.tokenHash = createHash('sha256').update(token.token).digest('hex');
		}
	}

	private invalidate(): void {
		if (this.disposed) return;
		const terminate = this.terminate;
		this.dispose();
		terminate?.();
	}

	private async assertCredentialValid(): Promise<void> {
		if (this.user == null) return;
		const [currentUser, currentToken] = await Promise.all([
			fetchUserByIdFromDatabase(this.deps.db, this.user.id),
			this.token == null ? null : fetchAccessTokenByTokenFromDatabase(this.deps.db, this.token.token),
		]);
		if (
			currentUser == null ||
			currentUser.isSuspended ||
			(this.token == null
				? currentUser.token !== this.user.token
				: currentToken == null ||
					currentToken.id !== this.token.id ||
					currentToken.userId !== this.user.id ||
					!currentToken.permission.includes('read:account'))
		) {
			this.invalidate();
			throw new Error('Streaming credentials are no longer valid');
		}
	}

	private async fetch(): Promise<void> {
		if (this.user == null) {
			return;
		}
		const snapshot = await fetchStreamConnectionSnapshot(this.deps, this.user.id);
		await this.assertCredentialValid();
		this.userProfile = snapshot.userProfile;
		this.following = snapshot.following;
		this.followingChannels = snapshot.followingChannels;
		this.mutingChannels = snapshot.mutingChannels;
		this.userIdsWhoMeMuting = snapshot.userIdsWhoMeMuting;
		this.userIdsWhoBlockingMe = snapshot.userIdsWhoBlockingMe;
		this.userIdsWhoMeMutingRenotes = snapshot.userIdsWhoMeMutingRenotes;
		this.userMutedInstances = snapshot.userMutedInstances;
	}

	public async init(subscriber?: EventEmitter): Promise<void> {
		if (subscriber != null) {
			this.subscriber = subscriber;
			this.pendingInternalEvents = [];
			subscriber.on('internal', this.onInternalEvent);
		}

		try {
			await withTimeout(this.refresh(), 'Stream connection initialization timed out');
			if (this.disposed) throw new Error('Streaming connection is disposed');
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	public refresh(): Promise<void> {
		if (this.user == null) {
			return Promise.resolve();
		}
		if (this.refreshPromise != null) {
			return this.refreshPromise;
		}

		this.pendingInternalEvents = [];
		const refreshPromise = this.fetch().finally(() => {
			const pendingInternalEvents = this.pendingInternalEvents;
			this.pendingInternalEvents = null;
			for (const event of pendingInternalEvents ?? []) {
				this.applyInternalEvent(event);
			}
			if (this.refreshPromise === refreshPromise) {
				this.refreshPromise = undefined;
			}
		});
		this.refreshPromise = refreshPromise;
		return refreshPromise;
	}

	public listen(subscriber: EventEmitter, sendToClient: (raw: string) => void, terminate?: () => void): void {
		if (this.disposed) {
			terminate?.();
			return;
		}
		this.terminate = terminate;
		if (this.subscriber == null) {
			this.subscriber = subscriber;
			this.subscriber.on('internal', this.onInternalEvent);
		} else if (this.subscriber !== subscriber) {
			throw new Error('Stream connection initialized with a different subscriber');
		}
		this.sendToClient = sendToClient;

		this.subscriber.on('broadcast', this.onBroadcast);
	}

	public handleClientMessage(raw: string): void {
		if (this.disposed) return;
		let obj: JsonObject;
		try {
			obj = JSON.parse(raw);
		} catch {
			return;
		}

		const { type, body } = obj;

		switch (type) {
			case 'readNotification':
				this.onReadNotification();
				break;
			case 'subNote':
			case 's':
			case 'sr':
				this.onSubscribeNote(body, 'all');
				break;
			case 'unsubNote':
			case 'un':
				this.onUnsubscribeNote(body, 'all');
				break;
			// 編集の合図 ('edited') だけを受け取る購読。
			case 'se':
				this.onSubscribeNote(body, 'edits');
				break;
			case 'ue':
				this.onUnsubscribeNote(body, 'edits');
				break;
			case 'connect':
				this.onChannelConnectRequested(body);
				break;
			case 'disconnect':
				this.onChannelDisconnectRequested(body);
				break;
			case 'channel':
			case 'ch':
				this.onChannelMessageRequested(body);
				break;
		}
	}

	private onReadNotification(): void {
		if (this.user == null) {
			return;
		}
		void markAllApiNotificationsAsRead(this.deps, this.user.id, false);
	}

	private onSubscribeNote(payload: JsonValue | undefined, kind: 'all' | 'edits'): void {
		if (!isJsonObject(payload) || typeof payload['id'] !== 'string') {
			return;
		}

		const noteId = payload['id'];
		const current = this.subscribingNotes.get(noteId);
		if (current != null) {
			// 使われ続けている購読を末尾へ回し、上限超えで外れにくくする。
			this.setNoteSubscription(noteId, { ...current, [kind]: current[kind] + 1 }, true);
			return;
		}

		// listener はプロセスで共有する emitter に付くので、1 接続の購読数が全体のメモリに響く。
		// 外すのは編集の合図だけの購読の最も古いものから (表示中のノートすべてが送るので数が多く、外れても
		// 失うのは編集の即時反映だけ)。無ければ最も古い購読を外す。
		if (this.subscribingNotes.size >= MAX_SUBSCRIBED_NOTES_PER_CONNECTION) {
			const evicted = this.editOnlyNotes.values().next().value ?? this.subscribingNotes.keys().next().value;
			if (evicted != null) {
				this.deleteNoteSubscription(evicted);
			}
		}
		this.setNoteSubscription(noteId, { all: 0, edits: 0, [kind]: 1 }, true);
		this.subscriber?.on(`noteStream:${noteId}`, this.onNoteStreamMessage);
	}

	/** moveToEnd なら古い順の末尾へ回す。 */
	private setNoteSubscription(noteId: string, counts: { all: number; edits: number }, moveToEnd: boolean): void {
		if (moveToEnd) {
			this.subscribingNotes.delete(noteId);
			this.editOnlyNotes.delete(noteId);
		}
		this.subscribingNotes.set(noteId, counts);
		// all が増えるのは購読のとき (moveToEnd) だけで、そこで先に外している。
		if (counts.all === 0) {
			this.editOnlyNotes.add(noteId);
		}
	}

	private deleteNoteSubscription(noteId: string): void {
		this.subscribingNotes.delete(noteId);
		this.editOnlyNotes.delete(noteId);
		this.subscriber?.off(`noteStream:${noteId}`, this.onNoteStreamMessage);
	}

	private onUnsubscribeNote(payload: JsonValue | undefined, kind: 'all' | 'edits'): void {
		if (!isJsonObject(payload) || typeof payload['id'] !== 'string') {
			return;
		}

		const noteId = payload['id'];
		const current = this.subscribingNotes.get(noteId);
		if (current == null || current[kind] === 0) {
			return;
		}
		const next = { ...current, [kind]: current[kind] - 1 };
		if (next.all > 0 || next.edits > 0) {
			this.setNoteSubscription(noteId, next, false);
			return;
		}
		this.deleteNoteSubscription(noteId);
	}

	private onChannelConnectRequested(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload)) {
			return;
		}
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') {
			return;
		}
		if (typeof channel !== 'string') {
			return;
		}
		if (typeof pong !== 'boolean' && pong !== undefined && pong !== null) {
			return;
		}
		if (params !== undefined && !isJsonObject(params)) {
			return;
		}
		void this.connectChannel(id, params, channel, pong ?? undefined).catch(() => {});
	}

	private onChannelDisconnectRequested(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload) || typeof payload['id'] !== 'string') {
			return;
		}
		this.disconnectChannel(payload['id']);
	}

	public sendMessageToWs(type: string, payload: JsonValue): void {
		if (this.disposed || this.sendToClient == null) return;
		this.sendToClient(JSON.stringify({ type, body: payload }));
	}

	private buildChannelContext(
		id: string,
		subscriber: StreamChannelSubscriber,
		send: (type: string, body: JsonValue) => void,
	): StreamChannelContext {
		return {
			id,
			...(this.user !== undefined ? { user: this.user } : {}),
			...(this.token !== undefined ? { token: this.token } : {}),
			userProfile: this.userProfile,
			following: this.following,
			followingChannels: this.followingChannels,
			mutingChannels: this.mutingChannels,
			userIdsWhoMeMuting: this.userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes: this.userIdsWhoMeMutingRenotes,
			userIdsWhoBlockingMe: this.userIdsWhoBlockingMe,
			userMutedInstances: this.userMutedInstances,
			subscriber,
			send,
		};
	}

	public async connectChannel(
		id: string,
		params: JsonObject | undefined,
		channelName: string,
		pong = false,
	): Promise<void> {
		if (this.disposed) {
			return;
		}
		this.disconnectChannel(id);

		if (this.channels.size + this.pendingChannelScopes.size >= MAX_CHANNELS_PER_CONNECTION) {
			return;
		}

		const definition = HONO_STREAM_CHANNELS[channelName];
		if (definition == null) {
			throw new Error(`no such channel: ${channelName}`);
		}

		if (definition.requireCredential && this.user == null) {
			return;
		}

		if (
			this.token &&
			((definition.kind && !this.token.permission.includes(definition.kind)) ||
				(!definition.kind && definition.requireCredential))
		) {
			return;
		}

		if (definition.shouldShare) {
			for (const existing of this.channels.values()) {
				if (existing.channelName === channelName) {
					return;
				}
			}
		}

		const send = (type: string, body: JsonValue) => {
			this.sendMessageToWs('channel', { id, type, body });
		};
		const subscriber = new StreamChannelSubscriberScope(this.subscriber!);
		this.pendingChannels.set(id, subscriber);
		this.pendingChannelScopes.add(subscriber);
		const ctx = this.buildChannelContext(id, subscriber, send);
		const initialization = Promise.resolve().then(() => definition.init(this.deps, ctx, params ?? {}));

		let result: StreamChannelHandle | false | void;
		try {
			result = await withTimeout(initialization, `Stream channel initialization timed out: ${channelName}`);
		} catch (error) {
			subscriber.dispose();
			if (this.pendingChannels.get(id) === subscriber) {
				this.pendingChannels.delete(id);
			}
			const cleanupLateResult = initialization.then(
				(lateResult) => lateResult && lateResult.dispose?.(),
				() => {},
			);
			if (error instanceof StreamInitializationTimeoutError) {
				void cleanupLateResult.finally(() => this.pendingChannelScopes.delete(subscriber));
			} else {
				this.pendingChannelScopes.delete(subscriber);
			}
			throw error;
		}
		if (this.pendingChannels.get(id) !== subscriber || this.disposed) {
			subscriber.dispose();
			this.pendingChannelScopes.delete(subscriber);
			result && result.dispose?.();
			return;
		}
		this.pendingChannels.delete(id);
		this.pendingChannelScopes.delete(subscriber);
		if (result === false) {
			subscriber.dispose();
			return;
		}

		const handle = result || {};
		this.channels.set(id, {
			channelName,
			handle: {
				...handle,
				dispose: () => {
					handle.dispose?.();
					subscriber.dispose();
				},
			},
		});

		if (pong) {
			this.sendMessageToWs('connected', { id });
		}
	}

	public disconnectChannel(id: string): void {
		this.pendingChannels.get(id)?.dispose();
		this.pendingChannels.delete(id);
		const entry = this.channels.get(id);
		if (entry) {
			entry.handle.dispose?.();
			this.channels.delete(id);
		}
	}

	private onChannelMessageRequested(data: JsonValue | undefined): void {
		if (!isJsonObject(data)) {
			return;
		}
		if (typeof data['id'] !== 'string') {
			return;
		}
		if (typeof data['type'] !== 'string') {
			return;
		}
		if (data['body'] === undefined) {
			return;
		}

		const entry = this.channels.get(data['id']);
		entry?.handle.onMessage?.(data['type'], data['body']);
	}

	public dispose(): void {
		this.disposed = true;
		this.sendToClient = undefined;
		this.terminate = undefined;
		this.subscriber?.off('broadcast', this.onBroadcast);
		this.subscriber?.off('internal', this.onInternalEvent);
		for (const noteId of this.subscribingNotes.keys()) {
			this.subscriber?.off(`noteStream:${noteId}`, this.onNoteStreamMessage);
		}
		for (const entry of this.channels.values()) {
			entry.handle.dispose?.();
		}
		for (const subscriber of this.pendingChannels.values()) {
			subscriber.dispose();
		}
		this.channels.clear();
		this.pendingChannels.clear();
		this.pendingChannelScopes.clear();
	}
}

export async function refreshStreamConnections(connections: ReadonlyMap<StreamConnection, () => void>): Promise<void> {
	const pending = [...connections.entries()];
	let index = 0;
	const workers = Array.from({ length: Math.min(REFRESH_CONCURRENCY, pending.length) }, async () => {
		while (index < pending.length) {
			const [connection, terminate] = pending[index++]!;
			if (!connections.has(connection)) {
				continue;
			}
			let lastError: unknown;
			let refreshed = false;
			for (const delayMs of REFRESH_RETRY_DELAYS_MS) {
				// 復旧中の DB 障害を増幅しないよう、再試行を直列化する。
				// eslint-disable-next-line no-await-in-loop
				if (delayMs > 0) {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
				}
				try {
					// eslint-disable-next-line no-await-in-loop
					await connection.refresh();
					refreshed = true;
					break;
				} catch (error) {
					lastError = error;
				}
			}
			if (!refreshed && connections.has(connection)) {
				console.error(
					'Failed to refresh a streaming connection after Redis reconnected; terminating the connection.',
					lastError,
				);
				try {
					terminate();
				} catch (error) {
					console.error('Failed to terminate a stale streaming connection.', error);
				}
			}
		}
	});
	await Promise.all(workers);
}
