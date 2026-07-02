/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { countNoteDraftsByUserIdFromDatabase } from '@/core/NoteDraftStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['notes', 'drafts'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'read:account',

	res: {
		type: 'number',
		optional: false, nullable: false,
		description: 'The number of drafts',
	},

	errors: {
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
		private db: MiDrizzleDatabase,
	) {
		super(meta, paramDef, async (ps, me) => {
			return countNoteDraftsByUserIdFromDatabase(this.db, me.id);
		});
	}
}
