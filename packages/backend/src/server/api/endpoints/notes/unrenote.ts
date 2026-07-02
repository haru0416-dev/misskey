/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listNotesByUserIdAndRenoteIdFromDatabase } from '@/core/NoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	kind: 'write:notes',

	limit: {
		duration: ms('1hour'),
		max: 300,
		minInterval: ms('1sec'),
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'efd4a259-2442-496b-8dd7-b255aa1a160f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private getterService: GetterService,
		private noteDeleteService: NoteDeleteService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			const renotes = await listNotesByUserIdAndRenoteIdFromDatabase(this.db, me.id, note.id);
			const user = await fetchUserByIdOrFailFromDatabase(this.db, me.id);

			for (const note of renotes) {
				this.noteDeleteService.delete(user, note);
			}
		});
	}
}
