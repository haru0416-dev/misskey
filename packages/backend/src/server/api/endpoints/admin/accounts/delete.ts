/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:account',
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
		private db: MiDrizzleDatabase,

		private deleteAccoountService: DeleteAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await fetchUserByIdFromDatabase(this.db, ps.userId);

			if (user == null) {
				throw new Error('user not found');
			}

			await this.deleteAccoountService.deleteAccount(user, me);
		});
	}
}
