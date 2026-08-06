/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EventEmitter } from 'node:events';
import type { GlobalEvents } from '@/core/global-events.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import { listFolloweeIdsWithRepliesByFollowerIdFromDatabase } from '@/core/FollowingStore.js';
import { listFollowedChannelIdsByUserIdFromDatabase } from '@/core/ChannelFollowingStore.js';
import { listMutedChannelIdsByUserIdFromDatabase } from '@/core/ChannelMutingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listRenoteMuteeIdsByMuterIdFromDatabase } from '@/core/RenoteMutingStore.js';
import { markAllHonoApiNotificationsAsRead, type HonoApiNotificationDependencies } from '../rest/notification.js';
import { isJsonObject, type JsonObject, type JsonValue } from '@/misc/json-value.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiFollowing, MiUserProfile } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { HonoStreamChannelContext, HonoStreamChannelDefinition, HonoStreamChannelHandle, HonoStreamChannelSubscriber } from './channel.js';
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

class HonoStreamInitializationTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
	let timeoutId: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timeoutId = setTimeout(() => reject(new HonoStreamInitializationTimeoutError(message)), INITIALIZATION_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timeoutId != null) clearTimeout(timeoutId);
	}
}

class HonoStreamChannelSubscriberScope implements HonoStreamChannelSubscriber {
	private readonly listeners: { eventName: string | symbol; listener: Parameters<EventEmitter['on']>[1] }[] = [];
	private disposed = false;

	constructor(private readonly subscriber: EventEmitter) {}

	public on(eventName: string | symbol, listener: Parameters<EventEmitter['on']>[1]): void {
		if (this.disposed) return;
		this.subscriber.on(eventName, listener);
		this.listeners.push({ eventName, listener });
	}

	public off(eventName: string | symbol, listener: Parameters<EventEmitter['off']>[1]): void {
		this.subscriber.off(eventName, listener);
		const index = this.listeners.findLastIndex(entry => entry.eventName === eventName && entry.listener === listener);
		if (index !== -1) this.listeners.splice(index, 1);
	}

	public dispose(): void {
		this.disposed = true;
		for (const { eventName, listener } of this.listeners) this.subscriber.off(eventName, listener);
		this.listeners.length = 0;
	}
}

export type HonoStreamConnectionDependencies =
	& HonoApiNotificationDependencies
	& Parameters<typeof honoStreamChannelMain.init>[0]
	& Parameters<typeof honoStreamChannelChatRoom.init>[0]
	& Parameters<typeof honoStreamChannelHashtag.init>[0]
	& Parameters<typeof honoStreamChannelAntenna.init>[0]
	& Parameters<typeof honoStreamChannelChannel.init>[0]
	& Parameters<typeof honoStreamChannelUserList.init>[0]
	& Parameters<typeof honoStreamChannelRoleTimeline.init>[0]
	& Parameters<typeof honoStreamChannelLocalTimeline.init>[0]
	& Parameters<typeof honoStreamChannelGlobalTimeline.init>[0]
	& Parameters<typeof honoStreamChannelHomeTimeline.init>[0]
	& Parameters<typeof honoStreamChannelHybridTimeline.init>[0]
	& {
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

/** Connection#fetch 相当。原典が Redis キャッシュ経由で読んでいた関連セットは直接DB読みに置き換えている。 */
async function fetchStreamConnectionSnapshot(deps: HonoStreamConnectionDependencies, userId: MiUser['id']): Promise<ConnectionSnapshot> {
	const [userProfile, followees, followingChannelIds, mutedChannelIds, muteeIds, blockerIds, renoteMuteeIds] = await Promise.all([
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
		userMutedInstances: new Set(userProfile?.mutedInstances ?? []),
	};
}

const HONO_STREAM_CHANNELS: Record<string, HonoStreamChannelDefinition<HonoStreamConnectionDependencies>> = {
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

/** Connection.ts 相当。NestJS のリクエストスコープDIを介さない、コネクション単位のプレーンクラス。 */
export class HonoStreamConnection {
	public readonly user?: MiUser;
	public readonly token?: MiAccessToken;
	private subscriber?: EventEmitter;
	private sendToClient?: (raw: string) => void;
	private readonly channels: Map<string, { channelName: string; handle: HonoStreamChannelHandle }> = new Map();
	private readonly pendingChannels: Map<string, HonoStreamChannelSubscriberScope> = new Map();
	private readonly pendingChannelScopes: Set<HonoStreamChannelSubscriberScope> = new Set();
	private readonly subscribingNotes: Partial<Record<string, number>> = {};
	private userProfile: MiUserProfile | null = null;
	private following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
	private followingChannels: Set<string> = new Set();
	private mutingChannels: Set<string> = new Set();
	private userIdsWhoMeMuting: Set<string> = new Set();
	private userIdsWhoBlockingMe: Set<string> = new Set();
	private userIdsWhoMeMutingRenotes: Set<string> = new Set();
	private userMutedInstances: Set<string> = new Set();
	private pendingInternalEvents: GlobalEvents['internal']['payload'][] | null = null;
	private refreshPromise: Promise<void> | undefined;
	private disposed = false;
	private readonly onBroadcast = (data: { type: string; body: JsonValue }): void => {
		this.sendMessageToWs(data.type, data.body);
	};
	private readonly onInternalEvent = (data: GlobalEvents['internal']['payload']): void => {
		if (this.pendingInternalEvents != null) {
			this.pendingInternalEvents.push(data);
			return;
		}
		this.applyInternalEvent(data);
	};
	private applyInternalEvent(data: GlobalEvents['internal']['payload']): void {
		if (this.user == null) return;

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
				if (data.body.userId === this.user.id) this.followingChannels.add(data.body.channelId);
				break;
			case 'unfollowChannel':
				if (data.body.userId === this.user.id) this.followingChannels.delete(data.body.channelId);
				break;
			case 'muteChannel':
				if (data.body.userId === this.user.id) this.mutingChannels.add(data.body.channelId);
				break;
			case 'unmuteChannel':
				if (data.body.userId === this.user.id) this.mutingChannels.delete(data.body.channelId);
				break;
			case 'mute':
				if (data.body.muterId === this.user.id) this.userIdsWhoMeMuting.add(data.body.muteeId);
				break;
			case 'unmute':
				if (data.body.muterId === this.user.id) this.userIdsWhoMeMuting.delete(data.body.muteeId);
				break;
			case 'renoteMute':
				if (data.body.muterId === this.user.id) this.userIdsWhoMeMutingRenotes.add(data.body.muteeId);
				break;
			case 'renoteUnmute':
				if (data.body.muterId === this.user.id) this.userIdsWhoMeMutingRenotes.delete(data.body.muteeId);
				break;
			case 'blockingCreated':
				if (data.body.blockeeId === this.user.id) this.userIdsWhoBlockingMe.add(data.body.blockerId);
				break;
			case 'blockingDeleted':
				if (data.body.blockeeId === this.user.id) this.userIdsWhoBlockingMe.delete(data.body.blockerId);
				break;
			case 'updateUserProfile':
				if (data.body.userId === this.user.id) {
					this.userMutedInstances.clear();
					for (const host of data.body.mutedInstances) this.userMutedInstances.add(host);
				}
				break;
		}
	}
	private readonly onNoteStreamMessage = (data: { type: string; body: { id: string; userId: string; visibility: string; visibleUserIds?: string[]; body: JsonValue } }): void => {
		if (data.body.userId !== this.user?.id) {
			if (data.body.visibility === 'specified' && (this.user == null || !(data.body.visibleUserIds ?? []).includes(this.user.id))) {
				return;
			}
			if (data.body.visibility === 'followers' && !Object.hasOwn(this.following, data.body.userId)) {
				return;
			}
		}

		this.sendMessageToWs('noteUpdated', {
			id: data.body.id,
			type: data.type,
			body: data.body.body,
		});
	};

	constructor(
		private readonly deps: HonoStreamConnectionDependencies,
		user: MiUser | null | undefined,
		token: MiAccessToken | null | undefined,
	) {
		if (user) this.user = user;
		if (token) this.token = token;
	}

	private async fetch(): Promise<void> {
		if (this.user == null) return;
		const snapshot = await fetchStreamConnectionSnapshot(this.deps, this.user.id);
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
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	public refresh(): Promise<void> {
		if (this.user == null) return Promise.resolve();
		if (this.refreshPromise != null) return this.refreshPromise;

		this.pendingInternalEvents = [];
		const refreshPromise = this.fetch().finally(() => {
			const pendingInternalEvents = this.pendingInternalEvents;
			this.pendingInternalEvents = null;
			for (const event of pendingInternalEvents ?? []) this.applyInternalEvent(event);
			if (this.refreshPromise === refreshPromise) this.refreshPromise = undefined;
		});
		this.refreshPromise = refreshPromise;
		return refreshPromise;
	}

	public listen(subscriber: EventEmitter, sendToClient: (raw: string) => void): void {
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
		let obj: JsonObject;
		try {
			obj = JSON.parse(raw);
		} catch {
			return;
		}

		const { type, body } = obj;

		switch (type) {
			case 'readNotification': this.onReadNotification(); break;
			case 'subNote': case 's': case 'sr': this.onSubscribeNote(body); break;
			case 'unsubNote': case 'un': this.onUnsubscribeNote(body); break;
			case 'connect': this.onChannelConnectRequested(body); break;
			case 'disconnect': this.onChannelDisconnectRequested(body); break;
			case 'channel': case 'ch': this.onChannelMessageRequested(body); break;
		}
	}

	private onReadNotification(): void {
		if (this.user == null) return;
		void markAllHonoApiNotificationsAsRead(this.deps, this.user.id, false);
	}

	private onSubscribeNote(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload) || typeof payload['id'] !== 'string') return;

		const current = this.subscribingNotes[payload['id']] ?? 0;
		const updated = current + 1;
		this.subscribingNotes[payload['id']] = updated;

		if (updated === 1) {
			this.subscriber?.on(`noteStream:${payload['id']}`, this.onNoteStreamMessage);
		}
	}

	private onUnsubscribeNote(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload) || typeof payload['id'] !== 'string') return;

		const current = this.subscribingNotes[payload['id']];
		if (current == null) return;
		const updated = current - 1;
		this.subscribingNotes[payload['id']] = updated;
		if (updated <= 0) {
			delete this.subscribingNotes[payload['id']];
			this.subscriber?.off(`noteStream:${payload['id']}`, this.onNoteStreamMessage);
		}
	}

	private onChannelConnectRequested(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload)) return;
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') return;
		if (typeof channel !== 'string') return;
		if (typeof pong !== 'boolean' && typeof pong !== 'undefined' && pong !== null) return;
		if (typeof params !== 'undefined' && !isJsonObject(params)) return;
		void this.connectChannel(id, params, channel, pong ?? undefined).catch(() => {});
	}

	private onChannelDisconnectRequested(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload) || typeof payload['id'] !== 'string') return;
		this.disconnectChannel(payload['id']);
	}

	public sendMessageToWs(type: string, payload: JsonValue): void {
		this.sendToClient?.(JSON.stringify({ type, body: payload }));
	}

	private buildChannelContext(id: string, subscriber: HonoStreamChannelSubscriber, send: (type: string, body: JsonValue) => void): HonoStreamChannelContext {
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

	public async connectChannel(id: string, params: JsonObject | undefined, channelName: string, pong = false): Promise<void> {
		if (this.disposed) return;
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

		if (this.token && ((definition.kind && !this.token.permission.some(p => p === definition.kind))
			|| (!definition.kind && definition.requireCredential))) {
			return;
		}

		// 共有可能チャンネルに接続しようとしていて、かつそのチャンネル名に既に接続していたら無意味なので無視
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
		const subscriber = new HonoStreamChannelSubscriberScope(this.subscriber!);
		this.pendingChannels.set(id, subscriber);
		this.pendingChannelScopes.add(subscriber);
		const ctx = this.buildChannelContext(id, subscriber, send);
		const initialization = Promise.resolve().then(() => definition.init(this.deps, ctx, params ?? {}));

		let result: HonoStreamChannelHandle | false | void;
		try {
			result = await withTimeout(initialization, `Stream channel initialization timed out: ${channelName}`);
		} catch (error) {
			subscriber.dispose();
			if (this.pendingChannels.get(id) === subscriber) this.pendingChannels.delete(id);
			const cleanupLateResult = initialization.then(lateResult => lateResult && lateResult.dispose?.(), () => {});
			if (error instanceof HonoStreamInitializationTimeoutError) {
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
		if (!isJsonObject(data)) return;
		if (typeof data['id'] !== 'string') return;
		if (typeof data['type'] !== 'string') return;
		if (typeof data['body'] === 'undefined') return;

		const entry = this.channels.get(data['id']);
		entry?.handle.onMessage?.(data['type'], data['body']);
	}

	public dispose(): void {
		this.disposed = true;
		this.subscriber?.off('broadcast', this.onBroadcast);
		this.subscriber?.off('internal', this.onInternalEvent);
		for (const noteId of Object.keys(this.subscribingNotes)) {
			this.subscriber?.off(`noteStream:${noteId}`, this.onNoteStreamMessage);
		}
		for (const entry of this.channels.values()) {
			entry.handle.dispose?.();
		}
		for (const subscriber of this.pendingChannels.values()) subscriber.dispose();
		this.channels.clear();
		this.pendingChannels.clear();
		this.pendingChannelScopes.clear();
	}
}

export async function refreshHonoStreamConnections(
	connections: ReadonlyMap<HonoStreamConnection, () => void>,
): Promise<void> {
	const pending = [...connections.entries()];
	let index = 0;
	const workers = Array.from({ length: Math.min(REFRESH_CONCURRENCY, pending.length) }, async () => {
		while (index < pending.length) {
			const [connection, terminate] = pending[index++]!;
			if (!connections.has(connection)) continue;
			let lastError: unknown;
			let refreshed = false;
			for (const delayMs of REFRESH_RETRY_DELAYS_MS) {
				// Retries are deliberately serialized to avoid amplifying a recovering database outage.
				// eslint-disable-next-line no-await-in-loop
				if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
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
				console.error('Failed to refresh a streaming connection after Redis reconnected; terminating the connection.', lastError);
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
