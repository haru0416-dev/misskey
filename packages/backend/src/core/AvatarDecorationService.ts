/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiAvatarDecoration, MiUser } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import {
	createAvatarDecorationWithSideEffects,
	deleteAvatarDecorationWithSideEffects,
	updateAvatarDecorationWithSideEffects,
	type AvatarDecorationCreateOptions,
	type AvatarDecorationUpdateOptions,
} from '@/core/AvatarDecorationLogic.js';
import {
	listAvatarDecorationsFromDatabase,
} from '@/core/AvatarDecorationStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

@Injectable()
export class AvatarDecorationService implements OnApplicationShutdown {
	public cache: MemorySingleCache<MiAvatarDecoration[]>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
	) {
		this.cache = new MemorySingleCache<MiAvatarDecoration[]>(1000 * 60 * 30); // 30s

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body: _ } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'avatarDecorationCreated':
				case 'avatarDecorationUpdated':
				case 'avatarDecorationDeleted': {
					this.cache.delete();
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async create(options: Partial<MiAvatarDecoration>, moderator?: MiUser): Promise<MiAvatarDecoration> {
		return await createAvatarDecorationWithSideEffects({
			db: this.drizzle,
			genId: () => this.idService.gen(),
			publishInternalEvent: (type, value) => this.globalEventService.publishInternalEvent(type, value),
			logModeration: (mod, type, info) => this.moderationLogService.log(mod, type, info),
		}, options as AvatarDecorationCreateOptions, moderator);
	}

	@bindThis
	public async update(id: MiAvatarDecoration['id'], params: Partial<MiAvatarDecoration>, moderator?: MiUser): Promise<void> {
		await updateAvatarDecorationWithSideEffects({
			db: this.drizzle,
			publishInternalEvent: (type, value) => this.globalEventService.publishInternalEvent(type, value),
			logModeration: (mod, type, info) => this.moderationLogService.log(mod, type, info),
		}, id, params as AvatarDecorationUpdateOptions, moderator);
	}

	@bindThis
	public async delete(id: MiAvatarDecoration['id'], moderator?: MiUser): Promise<void> {
		await deleteAvatarDecorationWithSideEffects({
			db: this.drizzle,
			publishInternalEvent: (type, value) => this.globalEventService.publishInternalEvent(type, value),
			logModeration: (mod, type, info) => this.moderationLogService.log(mod, type, info),
		}, id, moderator);
	}

	@bindThis
	public async getAll(noCache = false): Promise<MiAvatarDecoration[]> {
		if (noCache) {
			this.cache.delete();
		}
		return this.cache.fetch(() => listAvatarDecorationsFromDatabase(this.drizzle));
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
