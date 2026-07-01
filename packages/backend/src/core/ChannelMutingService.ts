/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { ChannelsRepository, UsersRepository, MiChannel, MiUser } from '@/models/_.js';
import type { MiChannelMuting } from '@/models/ChannelMuting.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEvents, GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import { RedisKVCache } from '@/misc/cache.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import {
	createChannelMutingInDatabase,
	deleteChannelMutingFromDatabase,
	deleteChannelMutingsByIdsFromDatabase,
	fetchActiveMutedChannelIdsFromDatabase,
	fetchExpiredChannelMutingsFromDatabase,
	fetchMutedChannelIdsFromDatabase,
	updateChannelMutingExpirationInDatabase,
} from '@/core/ChannelMutingStore.js';

@Injectable()
export class ChannelMutingService {
	public mutingChannelsCache: RedisKVCache<Set<string>>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
		this.mutingChannelsCache = new RedisKVCache<Set<string>>(this.redisClient, 'channelMutingChannels', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60, // 1m
			fetcher: (userId) => fetchMutedChannelIdsFromDatabase(this.drizzle, userId)
				.then(channelIds => new Set(channelIds)),
			toRedisConverter: (value) => JSON.stringify(Array.from(value)),
			fromRedisConverter: (value) => new Set(JSON.parse(value)),
		});

		this.redisForSub.on('message', this.onMessage);
	}

	/**
	 * ミュートしているチャンネルの一覧を取得する.
	 * @param params
	 * @param [opts]
	 * @param	{(boolean|undefined)} [opts.idOnly=false] チャンネルIDのみを取得するかどうか. ID以外のフィールドに値がセットされなくなり、他テーブルとのJOINも一切されなくなるので注意.
	 * @param {(boolean|undefined)} [opts.joinUser=undefined] チャンネルオーナーのユーザ情報をJOINするかどうか(falseまたは省略時はJOINしない).
	 * @param {(boolean|undefined)} [opts.joinBannerFile=undefined] バナー画像のドライブファイルをJOINするかどうか(falseまたは省略時はJOINしない).
	 */
	@bindThis
	public async list(
		params: {
			requestUserId: MiUser['id'],
		},
		opts?: {
			idOnly?: boolean;
			joinUser?: boolean;
			joinBannerFile?: boolean;
		},
	): Promise<MiChannel[]> {
		const channelIds = await fetchActiveMutedChannelIdsFromDatabase(this.drizzle, params.requestUserId, new Date());

		if (opts?.idOnly) {
			return channelIds.map(id => ({ id } as MiChannel));
		}

		if (channelIds.length === 0) {
			return [];
		}

		const relations = {
			...(opts?.joinUser ? { user: true } : {}),
			...(opts?.joinBannerFile ? { banner: true } : {}),
		};
		const channels = await this.channelsRepository.find({
			where: { id: In(channelIds) },
			...(Object.keys(relations).length > 0 ? { relations } : {}),
		});
		const channelById = new Map(channels.map(channel => [channel.id, channel]));

		return channelIds
			.map(id => channelById.get(id))
			.filter(channel => channel != null);
	}

	/**
	 * 期限切れのチャンネルミュート情報を取得する.
	 *
	 * @param [opts]
	 * @param {(boolean|undefined)} [opts.joinUser=undefined] チャンネルミュートを設定したユーザ情報をJOINするかどうか(falseまたは省略時はJOINしない).
	 * @param {(boolean|undefined)} [opts.joinChannel=undefined] ミュート先のチャンネル情報をJOINするかどうか(falseまたは省略時はJOINしない).
	 */
	public async findExpiredMutings(opts?: {
		joinUser?: boolean;
		joinChannel?: boolean;
	}): Promise<MiChannelMuting[]> {
		const rows = await fetchExpiredChannelMutingsFromDatabase(this.drizzle, new Date());
		const mutings: MiChannelMuting[] = rows.map(row => ({
			...row,
			user: null,
			channel: null,
		}));

		if (mutings.length === 0) {
			return mutings;
		}

		if (opts?.joinUser) {
			const users = await this.usersRepository.findBy({ id: In(mutings.map(muting => muting.userId)) });
			const userById = new Map(users.map(user => [user.id, user]));
			for (const muting of mutings) {
				muting.user = userById.get(muting.userId) ?? null;
			}
		}

		if (opts?.joinChannel) {
			const channels = await this.channelsRepository.findBy({ id: In(mutings.map(muting => muting.channelId)) });
			const channelById = new Map(channels.map(channel => [channel.id, channel]));
			for (const muting of mutings) {
				muting.channel = channelById.get(muting.channelId) ?? null;
			}
		}

		return mutings;
	}

	/**
	 * 既にミュートされているかどうかをキャッシュから取得する.
	 * @param params
	 * @param params.requestUserId
	 */
	@bindThis
	public async isMuted(params: {
		requestUserId: MiUser['id'],
		targetChannelId: MiChannel['id'],
	}): Promise<boolean> {
		const mutedChannels = await this.mutingChannelsCache.get(params.requestUserId);
		return (mutedChannels?.has(params.targetChannelId) ?? false);
	}

	/**
	 * チャンネルをミュートする.
	 * @param params
	 * @param {(Date|null|undefined)} [params.expiresAt] ミュートの有効期限. nullまたは省略時は無期限.
	 */
	@bindThis
	public async mute(params: {
		requestUserId: MiUser['id'],
		targetChannelId: MiChannel['id'],
		expiresAt?: Date | null,
	}): Promise<void> {
		try {
			await createChannelMutingInDatabase(this.drizzle, {
				id: this.idService.gen(),
				userId: params.requestUserId,
				channelId: params.targetChannelId,
				expiresAt: params.expiresAt,
			});
		} catch (e) {
			if (!isDuplicateKeyValueDatabaseError(e)) throw e;

			await updateChannelMutingExpirationInDatabase(this.drizzle, params.requestUserId, params.targetChannelId, params.expiresAt ?? null);
		}

		this.globalEventService.publishInternalEvent('muteChannel', {
			userId: params.requestUserId,
			channelId: params.targetChannelId,
		});
	}

	/**
	 * チャンネルのミュートを解除する.
	 * @param params
	 */
	@bindThis
	public async unmute(params: {
		requestUserId: MiUser['id'],
		targetChannelId: MiChannel['id'],
	}): Promise<void> {
		await deleteChannelMutingFromDatabase(this.drizzle, params.requestUserId, params.targetChannelId);

		this.globalEventService.publishInternalEvent('unmuteChannel', {
			userId: params.requestUserId,
			channelId: params.targetChannelId,
		});
	}

	/**
	 * 期限切れのチャンネルミュート情報を削除する.
	 */
	@bindThis
	public async eraseExpiredMutings(): Promise<void> {
		const expiredMutings = await this.findExpiredMutings();
		await deleteChannelMutingsByIdsFromDatabase(this.drizzle, expiredMutings.map(x => x.id));

		const userIds = [...new Set(expiredMutings.map(x => x.userId))];
		for (const userId of userIds) {
			this.mutingChannelsCache.refresh(userId).then();
		}
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'muteChannel': {
					this.mutingChannelsCache.refresh(body.userId).then();
					break;
				}
				case 'unmuteChannel': {
					this.mutingChannelsCache.delete(body.userId).then();
					break;
				}
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.mutingChannelsCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
