/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { listDriveFoldersByUserIdFromDatabase, resolveDriveFolderPagination } from '@/core/DriveFolderStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'DriveFolder',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private driveFolderEntityService: DriveFolderEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const pagination = resolveDriveFolderPagination(this.idService, ps);
			const folders = await listDriveFoldersByUserIdFromDatabase(this.db, me.id, {
				limit: ps.limit,
				parentId: ps.folderId ?? null,
				...pagination,
			});

			return await Promise.all(folders.map(folder => this.driveFolderEntityService.pack(folder)));
		});
	}
}
