/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { listLocalEmojisPageFromDatabase } from '@/core/EmojiStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiEmoji } from '@/models/Emoji.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
//import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'read:admin:emoji',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			ref: 'EmojiDetailed',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', nullable: true, default: null },
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

		private emojiEntityService: EmojiEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let sinceId: string | null = null;
			let untilId: string | null = null;
			let order: 'asc' | 'desc' = 'desc';

			if (ps.sinceId && ps.untilId) {
				sinceId = ps.sinceId;
				untilId = ps.untilId;
			} else if (ps.sinceId) {
				sinceId = ps.sinceId;
				order = 'asc';
			} else if (ps.untilId) {
				untilId = ps.untilId;
			} else if (ps.sinceDate && ps.untilDate) {
				sinceId = this.idService.gen(ps.sinceDate);
				untilId = this.idService.gen(ps.untilDate);
			} else if (ps.sinceDate) {
				sinceId = this.idService.gen(ps.sinceDate);
				order = 'asc';
			} else if (ps.untilDate) {
				untilId = this.idService.gen(ps.untilDate);
			}

			let emojis: MiEmoji[];

			if (ps.query) {
				//q.andWhere('emoji.name ILIKE :q', { q: `%${ sqlLikeEscape(ps.query) }%` });
				//const emojis = await q.limit(ps.limit).getMany();

				emojis = await listLocalEmojisPageFromDatabase(this.db, { order, sinceId, untilId });
				const queryarry = ps.query.match(/\:([a-z0-9_]*)\:/g);

				if (queryarry) {
					emojis = emojis.filter(emoji =>
						queryarry.includes(`:${emoji.name}:`),
					);
				} else {
					emojis = emojis.filter(emoji =>
						emoji.name.includes(ps.query!) ||
						emoji.aliases.some(a => a.includes(ps.query!)) ||
						emoji.category?.includes(ps.query!));
				}
				emojis.splice(ps.limit + 1);
			} else {
				emojis = await listLocalEmojisPageFromDatabase(this.db, { order, sinceId, untilId, limit: ps.limit });
			}

			return this.emojiEntityService.packDetailedMany(emojis);
		});
	}
}
