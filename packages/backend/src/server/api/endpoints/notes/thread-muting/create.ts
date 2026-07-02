/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { IdService } from '@/core/IdService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { createNoteThreadMutingInDatabase } from '@/core/NoteThreadMutingStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	kind: 'write:account',

	limit: {
		duration: ms('1hour'),
		max: 10,
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '5ff67ada-ed3b-2e71-8e87-a1a421e177d2',
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
		private drizzle: MiDrizzleDatabase,

		private getterService: GetterService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			await createNoteThreadMutingInDatabase(this.drizzle, {
				id: this.idService.gen(),
				threadId: note.threadId ?? note.id,
				userId: me.id,
			});
		});
	}
}
