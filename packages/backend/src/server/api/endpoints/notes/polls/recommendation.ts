/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { listUnvotedPublicPollNoteIdsFromDatabase } from '@/core/PollStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

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
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		excludeChannels: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private noteEntityService: NoteEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const noteIds = await listUnvotedPublicPollNoteIdsFromDatabase(this.db, {
				meId: me.id,
				excludeChannels: ps.excludeChannels,
				limit: ps.limit,
				offset: ps.offset,
			});

			if (noteIds.length === 0) return [];

			const notes = await listNotesByIdsFromDatabase(this.db, noteIds);
			notes.sort((a, b) => b.id.localeCompare(a.id));

			return await this.noteEntityService.packMany(notes, me, {
				detail: true,
			});
		});
	}
}
