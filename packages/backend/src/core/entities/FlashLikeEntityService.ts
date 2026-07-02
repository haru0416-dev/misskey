/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { MiFlash } from '@/models/Flash.js';
import { fetchFlashLikeByIdOrFailFromDatabase } from '@/core/FlashLikeStore.js';
import type { FlashLikeRow } from '@/db/schema/flash-like.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { bindThis } from '@/decorators.js';
import { FlashEntityService } from './FlashEntityService.js';

export type FlashLikePackable = FlashLikeRow & {
	flash?: MiFlash | null;
};

@Injectable()
export class FlashLikeEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private flashEntityService: FlashEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: FlashLikeRow['id'] | FlashLikePackable,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const like = typeof src === 'object' ? src : await fetchFlashLikeByIdOrFailFromDatabase(this.drizzle, src);
		const flash = typeof src === 'object' ? (src.flash ?? src.flashId) : like.flashId;

		return {
			id: like.id,
			flash: await this.flashEntityService.pack(flash, me),
		};
	}

	@bindThis
	public packMany(
		likes: FlashLikePackable[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(likes.map(x => this.pack(x, me)));
	}
}
