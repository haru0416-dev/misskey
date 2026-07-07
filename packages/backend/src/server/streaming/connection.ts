/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { EventEmitter } from 'node:events';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import { listFolloweeIdsWithRepliesByFollowerIdFromDatabase } from '@/core/FollowingStore.js';
import { listFollowedChannelIdsByUserIdFromDatabase } from '@/core/ChannelFollowingStore.js';
import { fetchMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listRenoteMuteeIdsByMuterIdFromDatabase } from '@/core/RenoteMutingStore.js';
import { markAllHonoApiNotificationsAsRead, type HonoApiNotificationDependencies } from '../rest/notification.js';
import { isJsonObject, type JsonObject, type JsonValue } from '@/misc/json-value.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiFollowing, MiUserProfile } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { HonoStreamChannelContext, HonoStreamChannelDefinition, HonoStreamChannelHandle } from './channel.js';
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

/** Connection#fetch 相当。RedisKVCache 経由の読み取りをすべて直接DB読みに置き換えている。 */
async function fetchStreamConnectionSnapshot(deps: HonoStreamConnectionDependencies, userId: MiUser['id']): Promise<ConnectionSnapshot> {
	const [userProfile, followees, followingChannelIds, mutedChannelIds, muteeIds, blockerIds, renoteMuteeIds] = await Promise.all([
		fetchUserProfileByUserIdFromDatabase(deps.db, userId),
		listFolloweeIdsWithRepliesByFollowerIdFromDatabase(deps.db, userId),
		listFollowedChannelIdsByUserIdFromDatabase(deps.db, userId),
		fetchMutedChannelIdsFromDatabase(deps.db, userId),
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
	private readonly subscribingNotes: Partial<Record<string, number>> = {};
	private userProfile: MiUserProfile | null = null;
	private following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined> = {};
	private followingChannels: Set<string> = new Set();
	private mutingChannels: Set<string> = new Set();
	private userIdsWhoMeMuting: Set<string> = new Set();
	private userIdsWhoBlockingMe: Set<string> = new Set();
	private userIdsWhoMeMutingRenotes: Set<string> = new Set();
	private userMutedInstances: Set<string> = new Set();
	private fetchIntervalId: NodeJS.Timeout | null = null;
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

	public async init(): Promise<void> {
		if (this.user != null) {
			await this.fetch();
			if (!this.fetchIntervalId) {
				// 原典は RedisKVCache 越しの 10 秒間隔 (実質イベント駆動で安価) だったが、hono 側は
				// 毎回 7 クエリの直接 DB 読みなので間隔を 60 秒に伸ばす。接続直後は上の await fetch()
				// が即時反映するため、影響は「接続中にミュート等を変更した場合の反映が最大60秒遅れる」のみ。
				this.fetchIntervalId = setInterval(() => void this.fetch(), 1000 * 60);
			}
		}
	}

	public listen(subscriber: EventEmitter, sendToClient: (raw: string) => void): void {
		this.subscriber = subscriber;
		this.sendToClient = sendToClient;

		this.subscriber.on('broadcast', (data: { type: string; body: JsonValue }) => {
			this.sendMessageToWs(data.type, data.body);
		});
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
		if (!isJsonObject(payload) || typeof payload.id !== 'string') return;

		const current = this.subscribingNotes[payload.id] ?? 0;
		const updated = current + 1;
		this.subscribingNotes[payload.id] = updated;

		if (updated === 1) {
			this.subscriber?.on(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}
	}

	private onUnsubscribeNote(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload) || typeof payload.id !== 'string') return;

		const current = this.subscribingNotes[payload.id];
		if (current == null) return;
		const updated = current - 1;
		this.subscribingNotes[payload.id] = updated;
		if (updated <= 0) {
			delete this.subscribingNotes[payload.id];
			this.subscriber?.off(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}
	}

	private onChannelConnectRequested(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload)) return;
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') return;
		if (typeof channel !== 'string') return;
		if (typeof pong !== 'boolean' && typeof pong !== 'undefined' && pong !== null) return;
		if (typeof params !== 'undefined' && !isJsonObject(params)) return;
		void this.connectChannel(id, params, channel, pong ?? undefined);
	}

	private onChannelDisconnectRequested(payload: JsonValue | undefined): void {
		if (!isJsonObject(payload) || typeof payload.id !== 'string') return;
		this.disconnectChannel(payload.id);
	}

	public sendMessageToWs(type: string, payload: JsonValue): void {
		this.sendToClient?.(JSON.stringify({ type, body: payload }));
	}

	private buildChannelContext(id: string, send: (type: string, body: JsonValue) => void): HonoStreamChannelContext {
		return {
			id,
			user: this.user,
			token: this.token,
			userProfile: this.userProfile,
			following: this.following,
			followingChannels: this.followingChannels,
			mutingChannels: this.mutingChannels,
			userIdsWhoMeMuting: this.userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes: this.userIdsWhoMeMutingRenotes,
			userIdsWhoBlockingMe: this.userIdsWhoBlockingMe,
			userMutedInstances: this.userMutedInstances,
			subscriber: this.subscriber!,
			send,
		};
	}

	public async connectChannel(id: string, params: JsonObject | undefined, channelName: string, pong = false): Promise<void> {
		if (this.channels.has(id)) {
			this.disconnectChannel(id);
		}

		if (this.channels.size >= MAX_CHANNELS_PER_CONNECTION) {
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
		const ctx = this.buildChannelContext(id, send);

		const result = await definition.init(this.deps, ctx, params ?? {});
		if (result === false) {
			return;
		}

		this.channels.set(id, { channelName, handle: result || {} });

		if (pong) {
			this.sendMessageToWs('connected', { id });
		}
	}

	public disconnectChannel(id: string): void {
		const entry = this.channels.get(id);
		if (entry) {
			entry.handle.dispose?.();
			this.channels.delete(id);
		}
	}

	private onChannelMessageRequested(data: JsonValue | undefined): void {
		if (!isJsonObject(data)) return;
		if (typeof data.id !== 'string') return;
		if (typeof data.type !== 'string') return;
		if (typeof data.body === 'undefined') return;

		const entry = this.channels.get(data.id);
		entry?.handle.onMessage?.(data.type, data.body);
	}

	public dispose(): void {
		if (this.fetchIntervalId) clearInterval(this.fetchIntervalId);
		for (const entry of this.channels.values()) {
			entry.handle.dispose?.();
		}
		this.channels.clear();
	}
}
