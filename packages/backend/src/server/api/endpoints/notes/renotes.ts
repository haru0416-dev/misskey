/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listRenoteNotesFromDatabase } from '@/core/NoteStore.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '12908022-2e21-46cd-ba6a-3edaf6093f46',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		@Inject(DI.meta)
		private instanceMeta: MiMeta,

		private noteEntityService: NoteEntityService,
		private getterService: GetterService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			let sinceId = ps.sinceId ?? null;
			let untilId = ps.untilId ?? null;

			if (sinceId == null && untilId == null) {
				if (ps.sinceDate) sinceId = this.idService.gen(ps.sinceDate);
				if (ps.untilDate) untilId = this.idService.gen(ps.untilDate);
			}

			const renotes = await listRenoteNotesFromDatabase(this.db, {
				renoteId: note.id,
				limit: ps.limit,
				sinceId,
				untilId,
				me,
				blockedHosts: this.instanceMeta.blockedHosts,
			});

			return await this.noteEntityService.packMany(renotes, me);
		});
	}
}
