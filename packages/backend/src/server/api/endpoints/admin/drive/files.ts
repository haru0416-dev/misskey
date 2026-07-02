/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listDriveFilesForAdminFromDatabase } from '@/core/DriveFileStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'DriveFile',
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
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		type: { type: 'string', nullable: true, pattern: /^[a-zA-Z0-9\/\-*]+$/.toString().slice(1, -1) },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
		hostname: {
			type: 'string',
			nullable: true,
			default: null,
			description: 'The local host is represented with `null`.',
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let sinceId = ps.sinceId ?? null;
			let untilId = ps.untilId ?? null;

			if (sinceId == null && untilId == null) {
				if (ps.sinceDate) sinceId = this.idService.gen(ps.sinceDate);
				if (ps.untilDate) untilId = this.idService.gen(ps.untilDate);
			}

			const files = await listDriveFilesForAdminFromDatabase(this.db, {
				limit: ps.limit,
				sinceId,
				untilId,
				userId: ps.userId,
				type: ps.type,
				origin: ps.origin,
				hostname: ps.hostname,
			});

			return await this.driveFileEntityService.packMany(files, { detail: true, withUser: true, self: true });
		});
	}
}
