/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { fetchEmojiByNameAndHostOrFailFromDatabase } from '@/core/EmojiStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'EmojiDetailed',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: {
			type: 'string',
		},
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private emojiEntityService: EmojiEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const emoji = await fetchEmojiByNameAndHostOrFailFromDatabase(this.db, ps.name, null);

			return this.emojiEntityService.packDetailed(emoji);
		});
	}
}
