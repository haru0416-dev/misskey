/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { safeForSql } from '@/misc/safe-for-sql.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listNotesByTagSearchFromDatabase } from '@/core/NoteStore.js';

export const meta = {
	tags: ['notes', 'hashtags'],

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
	allOf: [
		{
			anyOf: [
				{
					type: 'object',
					properties: {
						tag: { type: 'string', minLength: 1 },
					},
					required: ['tag'],
				},
				{
					type: 'object',
					properties: {
						query: {
							type: 'array',
							description: 'The outer arrays are chained with OR, the inner arrays are chained with AND.',
							items: {
								type: 'array',
								items: {
									type: 'string',
									minLength: 1,
								},
								minItems: 1,
							},
							minItems: 1,
						},
					},
					required: ['query'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				reply: { type: 'boolean', nullable: true, default: null },
				renote: { type: 'boolean', nullable: true, default: null },
				withFiles: {
					type: 'boolean',
					default: false,
					description: 'Only show notes that have attached files.',
				},
				poll: { type: 'boolean', nullable: true, default: null },
				sinceId: { type: 'string', format: 'misskey:id' },
				untilId: { type: 'string', format: 'misskey:id' },
				sinceDate: { type: 'integer' },
				untilDate: { type: 'integer' },
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
			},
		},
	],
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
			try {
				let sinceId = ps.sinceId ?? null;
				let untilId = ps.untilId ?? null;
				let tagQuery: string[][];

				if (sinceId == null && untilId == null) {
					if (ps.sinceDate) sinceId = this.idService.gen(ps.sinceDate);
					if (ps.untilDate) untilId = this.idService.gen(ps.untilDate);
				}

				if ('tag' in ps) {
					const tag = normalizeForSearch(ps.tag);
					if (!safeForSql(tag)) throw new Error('Injection');
					tagQuery = [[tag]];
				} else {
					tagQuery = ps.query.map(tags => tags.map(tag => {
						const normalized = normalizeForSearch(tag);
						if (!safeForSql(normalized)) throw new Error('Injection');
						return normalized;
					}));
				}

				// Search notes
				const notes = await listNotesByTagSearchFromDatabase(this.db, {
					limit: ps.limit,
					sinceId,
					untilId,
					tagQuery,
					reply: ps.reply,
					renote: ps.renote,
					withFiles: ps.withFiles,
					poll: ps.poll,
					me,
					blockedHosts: this.instanceMeta.blockedHosts,
				});

				return await this.noteEntityService.packMany(notes, me);
			} catch (e) {
				if (e === 'Injection') return [];
				throw e;
			}
		});
	}
}
