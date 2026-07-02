/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IdService } from '@/core/IdService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { createFlashLikeInDatabase, flashLikeExistsInDatabase } from '@/core/FlashLikeStore.js';
import { fetchFlashByIdFromDatabase, incrementFlashLikedCountInDatabase } from '@/core/FlashStore.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['flash'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:flash-likes',

	errors: {
		noSuchFlash: {
			message: 'No such flash.',
			code: 'NO_SUCH_FLASH',
			id: 'c07c1491-9161-4c5c-9d75-01906f911f73',
		},

		yourFlash: {
			message: 'You cannot like your flash.',
			code: 'YOUR_FLASH',
			id: '3fd8a0e7-5955-4ba9-85bb-bf3e0c30e13b',
		},

		alreadyLiked: {
			message: 'The flash has already been liked.',
			code: 'ALREADY_LIKED',
			id: '010065cf-ad43-40df-8067-abff9f4686e3',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		flashId: { type: 'string', format: 'misskey:id' },
	},
	required: ['flashId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const flash = await fetchFlashByIdFromDatabase(this.drizzle, ps.flashId);
			if (flash == null) {
				throw new ApiError(meta.errors.noSuchFlash);
			}

			if (flash.userId === me.id) {
				throw new ApiError(meta.errors.yourFlash);
			}

			// if already liked
			const exist = await flashLikeExistsInDatabase(this.drizzle, me.id, flash.id);

			if (exist) {
				throw new ApiError(meta.errors.alreadyLiked);
			}

			// Create like
			try {
				await createFlashLikeInDatabase(this.drizzle, {
					id: this.idService.gen(),
					flashId: flash.id,
					userId: me.id,
				});
			} catch (error) {
				if (isDuplicateKeyValueDatabaseError(error)) {
					throw new ApiError(meta.errors.alreadyLiked);
				}
				throw error;
			}

			incrementFlashLikedCountInDatabase(this.drizzle, flash.id);
		});
	}
}
