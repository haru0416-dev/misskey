/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listMentionNotesFromDatabase } from '@/core/NoteStore.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		following: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		visibility: { type: 'string' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		@Inject(DI.meta)
		private instanceMeta: MiMeta,

		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let sinceId = ps.sinceId ?? null;
			let untilId = ps.untilId ?? null;

			if (sinceId == null && untilId == null) {
				if (ps.sinceDate) sinceId = this.idService.gen(ps.sinceDate);
				if (ps.untilDate) untilId = this.idService.gen(ps.untilDate);
			}

			const mentions = await listMentionNotesFromDatabase(this.db, {
				me,
				limit: ps.limit,
				sinceId,
				untilId,
				visibility: ps.visibility,
				following: ps.following,
				blockedHosts: this.instanceMeta.blockedHosts,
			});

			return await this.noteEntityService.packMany(mentions, me);
		});
	}
}
