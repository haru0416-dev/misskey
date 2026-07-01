/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listRegistrationTicketsForAdminFromDatabase } from '@/core/RegistrationTicketStore.js';
import { InviteCodeEntityService } from '@/core/entities/InviteCodeEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:invite-codes',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'InviteCode',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', default: 0 },
		type: { type: 'string', enum: ['unused', 'used', 'expired', 'all'], default: 'all' },
		sort: { type: 'string', enum: ['+createdAt', '-createdAt', '+usedAt', '-usedAt'] },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private inviteCodeEntityService: InviteCodeEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const tickets = await listRegistrationTicketsForAdminFromDatabase(this.db, {
				limit: ps.limit,
				offset: ps.offset,
				type: ps.type,
				sort: ps.sort,
			});

			return await this.inviteCodeEntityService.packMany(tickets, me);
		});
	}
}
