/*
 * SPDX-FileCopyrightText: syuilo and misskey-project , Type4ny-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';

import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { createRenoteMutingInDatabase, deleteRenoteMutingsByIdsFromDatabase } from '@/core/RenoteMutingStore.js';
import type { RenoteMutingRow } from '@/db/schema/renote-muting.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

@Injectable()
export class UserRenoteMutingService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private cacheService: CacheService,
	) {
	}

	@bindThis
	public async mute(user: MiUser, target: MiUser, expiresAt: Date | null = null): Promise<void> {
		await createRenoteMutingInDatabase(this.drizzle, {
			id: this.idService.gen(),
			muterId: user.id,
			muteeId: target.id,
		});

		await this.cacheService.renoteMutingsCache.refresh(user.id);
	}

	@bindThis
	public async unmute(mutings: RenoteMutingRow[]): Promise<void> {
		if (mutings.length === 0) return;

		await deleteRenoteMutingsByIdsFromDatabase(this.drizzle, mutings.map(m => m.id));

		const muterIds = [...new Set(mutings.map(m => m.muterId))];
		for (const muterId of muterIds) {
			await this.cacheService.renoteMutingsCache.refresh(muterId);
		}
	}
}
