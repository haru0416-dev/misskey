/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IdService } from '@/core/IdService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { createPageLikeInDatabase, pageLikeExistsInDatabase } from '@/core/PageLikeStore.js';
import { fetchPageByIdFromDatabase, incrementPageLikedCountInDatabase } from '@/core/PageStore.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['pages'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:page-likes',

	errors: {
		noSuchPage: {
			message: 'No such page.',
			code: 'NO_SUCH_PAGE',
			id: 'cc98a8a2-0dc3-4123-b198-62c71df18ed3',
		},

		yourPage: {
			message: 'You cannot like your page.',
			code: 'YOUR_PAGE',
			id: '28800466-e6db-40f2-8fae-bf9e82aa92b8',
		},

		alreadyLiked: {
			message: 'The page has already been liked.',
			code: 'ALREADY_LIKED',
			id: 'd4c1edbe-7da2-4eae-8714-1acfd2d63941',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		pageId: { type: 'string', format: 'misskey:id' },
	},
	required: ['pageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const page = await fetchPageByIdFromDatabase(this.drizzle, ps.pageId);
			if (page == null) {
				throw new ApiError(meta.errors.noSuchPage);
			}

			if (page.userId === me.id) {
				throw new ApiError(meta.errors.yourPage);
			}

			// if already liked
			const exist = await pageLikeExistsInDatabase(this.drizzle, me.id, page.id);

			if (exist) {
				throw new ApiError(meta.errors.alreadyLiked);
			}

			// Create like
			try {
				await createPageLikeInDatabase(this.drizzle, {
					id: this.idService.gen(),
					pageId: page.id,
					userId: me.id,
				});
			} catch (error) {
				if (isDuplicateKeyValueDatabaseError(error)) {
					throw new ApiError(meta.errors.alreadyLiked);
				}
				throw error;
			}

			incrementPageLikedCountInDatabase(this.drizzle, page.id);
		});
	}
}
