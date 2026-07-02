/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { listSystemAccountsFromDatabase, updateSystemAccountUserInDatabase } from '@/core/SystemAccountStore.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/SystemAccountLogic.js';
import type { MiMeta } from '@/models/_.js';
import type { MiSystemAccount } from '@/models/SystemAccount.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

export const SYSTEM_ACCOUNT_TYPES = ['actor', 'relay', 'proxy'] as const;

@Injectable()
export class SystemAccountService implements OnApplicationShutdown {
	private cache: MemoryKVCache<MiLocalUser>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
	) {
		this.cache = new MemoryKVCache<MiLocalUser>(1000 * 60 * 10); // 10m

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					for (const account of SYSTEM_ACCOUNT_TYPES) {
						this.cache.delete(account);
					}

					if (body.before != null && body.before.name !== body.after.name) {
						for (const account of SYSTEM_ACCOUNT_TYPES) {
							await this.updateCorrespondingUserProfile(account, {
								name: body.after.name,
							});
						}
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async list(): Promise<MiSystemAccount[]> {
		const accounts = await listSystemAccountsFromDatabase(this.drizzle);

		return accounts;
	}

	@bindThis
	public async fetch(type: typeof SYSTEM_ACCOUNT_TYPES[number]): Promise<MiLocalUser> {
		const cached = this.cache.get(type);
		if (cached) return cached;

		const account = await fetchOrCreateSystemAccountInDatabase({
			db: this.drizzle,
			meta: this.meta,
			genId: () => this.idService.gen(),
		}, type);
		this.cache.set(type, account);

		return account;
	}

	@bindThis
	public async updateCorrespondingUserProfile(type: typeof SYSTEM_ACCOUNT_TYPES[number], extra: {
		name?: string | null;
		description?: MiUserProfile['description'];
	}): Promise<MiLocalUser> {
		const user = await this.fetch(type);

		const updated = await updateSystemAccountUserInDatabase(this.drizzle, {
			userId: user.id,
			name: extra.name,
			description: extra.description,
		});
		this.cache.set(type, updated);

		return updated;
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
		this.cache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string): void {
		this.dispose();
	}
}
