/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteFavoriteEntityService } from '@/core/entities/NoteFavoriteEntityService.js';
import { DI } from '@/di-symbols.js';
import { listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import {
	listNoteFavoritesByUserIdFromDatabase,
	resolveNoteFavoritePagination,
} from '@/core/NoteFavoriteStore.js';
import { IdService } from '@/core/IdService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['account', 'notes', 'favorites'],

	requireCredential: true,

	kind: 'read:favorites',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'NoteFavorite',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private noteFavoriteEntityService: NoteFavoriteEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const pagination = resolveNoteFavoritePagination(this.idService, ps);
			const favorites = await listNoteFavoritesByUserIdFromDatabase(this.db, me.id, {
				limit: ps.limit,
				...pagination,
			});

			const notes = favorites.length === 0
				? []
				: await listNotesByIdsFromDatabase(this.db, favorites.map(favorite => favorite.noteId));
			const noteMap = new Map(notes.map(note => [note.id, note]));

			const packableFavorites = favorites.map(favorite => ({
				...favorite,
				note: noteMap.get(favorite.noteId) ?? null,
			}));

			return await this.noteFavoriteEntityService.packMany(packableFavorites, me);
		});
	}
}
