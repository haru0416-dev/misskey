/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HashtagEntityService } from '@/core/entities/HashtagEntityService.js';
import { DI } from '@/di-symbols.js';
import { listHashtagsFromDatabase } from '@/core/HashtagStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['hashtags'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Hashtag',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		attachedToUserOnly: { type: 'boolean', default: false },
		attachedToLocalUserOnly: { type: 'boolean', default: false },
		attachedToRemoteUserOnly: { type: 'boolean', default: false },
		sort: { type: 'string', enum: ['+mentionedUsers', '-mentionedUsers', '+mentionedLocalUsers', '-mentionedLocalUsers', '+mentionedRemoteUsers', '-mentionedRemoteUsers', '+attachedUsers', '-attachedUsers', '+attachedLocalUsers', '-attachedLocalUsers', '+attachedRemoteUsers', '-attachedRemoteUsers'] },
	},
	required: ['sort'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private hashtagEntityService: HashtagEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const tags = await listHashtagsFromDatabase(this.drizzle, {
				limit: ps.limit,
				attachedToUserOnly: ps.attachedToUserOnly,
				attachedToLocalUserOnly: ps.attachedToLocalUserOnly,
				attachedToRemoteUserOnly: ps.attachedToRemoteUserOnly,
				sort: ps.sort,
			});

			return this.hashtagEntityService.packMany(tags);
		});
	}
}
