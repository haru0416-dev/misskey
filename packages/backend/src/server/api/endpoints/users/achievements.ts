/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	requireCredential: false,

	res: {
		type: 'array',
		items: {
			ref: 'Achievement',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, ps.userId);

			return profile.achievements;
		});
	}
}
