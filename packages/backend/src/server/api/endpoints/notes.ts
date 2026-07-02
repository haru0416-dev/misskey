/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listPublicNotesFromDatabase } from '@/core/NoteStore.js';

export const meta = {
	tags: ['notes'],

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
		local: { type: 'boolean', default: false },
		reply: { type: 'boolean' },
		renote: { type: 'boolean' },
		withFiles: { type: 'boolean' },
		poll: { type: 'boolean' },
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

		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let sinceId = ps.sinceId ?? null;
			let untilId = ps.untilId ?? null;

			// TODO
			//if (bot != undefined) {
			//	query.isBot = bot;
			//}

			if (sinceId == null && untilId == null) {
				if (ps.sinceDate) sinceId = this.idService.gen(ps.sinceDate);
				if (ps.untilDate) untilId = this.idService.gen(ps.untilDate);
			}

			const notes = await listPublicNotesFromDatabase(this.db, {
				limit: ps.limit,
				sinceId,
				untilId,
				local: ps.local,
				reply: ps.reply,
				renote: ps.renote,
				withFiles: ps.withFiles,
				poll: ps.poll,
			});

			return await this.noteEntityService.packMany(notes);
		});
	}
}
