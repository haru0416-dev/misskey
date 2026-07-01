/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { fetchFavoriteClipIdsFromDatabase } from '@/core/ClipFavoriteStore.js';
import { listClipsByIdsFromDatabase } from '@/core/ClipStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiClip } from '@/models/Clip.js';

export const meta = {
	tags: ['account', 'clip'],

	requireCredential: true,

	kind: 'read:clip-favorite',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Clip',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private clipEntityService: ClipEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const clipIds = await fetchFavoriteClipIdsFromDatabase(this.drizzle, me.id);
			if (clipIds.length === 0) {
				return [];
			}

			const clipById = await listClipsByIdsFromDatabase(this.drizzle, clipIds)
				.then(clips => new Map(clips.map(clip => [clip.id, clip])));

			const clips = clipIds
				.map(id => clipById.get(id))
				.filter((clip): clip is MiClip => clip != null);

			return this.clipEntityService.packMany(clips, me);
		});
	}
}
