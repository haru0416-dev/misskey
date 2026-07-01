/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { noteThreadMutingExistsInDatabase } from '@/core/NoteThreadMutingStore.js';
import { noteFavoriteExistsInDatabase } from '@/core/NoteFavoriteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			isFavorited: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isMutedThread: {
				type: 'boolean',
				optional: false, nullable: false,
			},
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
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.notesRepository.findOneByOrFail({ id: ps.noteId });

			const [favorite, threadMuting] = await Promise.all([
				noteFavoriteExistsInDatabase(this.drizzle, me.id, note.id),
				noteThreadMutingExistsInDatabase(this.drizzle, me.id, note.threadId ?? note.id),
			]);

			return {
				isFavorited: favorite,
				isMutedThread: threadMuting,
			};
		});
	}
}
