/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listRegistrationTicketsCreatedByFromDatabase, resolveRegistrationTicketPagination } from '@/core/RegistrationTicketStore.js';
import { InviteCodeEntityService } from '@/core/entities/InviteCodeEntityService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	requiredRolePolicy: 'canInvite',
	kind: 'read:invite-codes',

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

		private inviteCodeEntityService: InviteCodeEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { sinceId, untilId, order } = resolveRegistrationTicketPagination(this.idService, ps);

			const tickets = await listRegistrationTicketsCreatedByFromDatabase(this.db, {
				createdById: me.id,
				limit: ps.limit,
				order,
				sinceId,
				untilId,
			});

			return await this.inviteCodeEntityService.packMany(tickets, me);
		});
	}
}
