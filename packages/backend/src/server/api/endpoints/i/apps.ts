/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { listAccessTokensByUserIdFromDatabase, type AccessTokenOrderField } from '@/core/AccessTokenStore.js';
import { listAppsByIdsFromDatabase } from '@/core/AppStore.js';
import type { AppRow } from '@/db/schema/app.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					optional: false,
					format: 'misskey:id',
				},
				name: {
					type: 'string',
					optional: true,
				},
				createdAt: {
					type: 'string',
					optional: false,
					format: 'date-time',
				},
				lastUsedAt: {
					type: 'string',
					optional: true,
					format: 'date-time',
				},
				permission: {
					type: 'array',
					optional: false,
					uniqueItems: true,
					items: {
						type: 'string',
					},
				},
				iconUrl: {
					type: 'string',
					optional: true, nullable: true,
				},
				description: {
					type: 'string',
					optional: true, nullable: true,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sort: { type: 'string', enum: ['+createdAt', '-createdAt', '+lastUsedAt', '-lastUsedAt'] },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const field: AccessTokenOrderField = (ps.sort === '+lastUsedAt' || ps.sort === '-lastUsedAt') ? 'lastUsedAt' : 'id';
			const direction = (ps.sort === '+createdAt' || ps.sort === '+lastUsedAt') ? 'desc' : 'asc';

			const tokens = await listAccessTokensByUserIdFromDatabase(this.db, me.id, { field, direction });

			// app リレーションはトークンごとに個別クエリを飛ばすと N+1 になるため、
			// 対象の appId 群をまとめて1クエリで取得する。
			const appIds = [...new Set(tokens.map(token => token.appId).filter((id): id is string => id != null))];
			const apps = await listAppsByIdsFromDatabase(this.db, appIds);
			const appById = new Map<string, AppRow>(apps.map(app => [app.id, app]));

			return await Promise.all(tokens.map(token => {
				const app = token.appId != null ? appById.get(token.appId) : undefined;

				return {
					id: token.id,
					name: token.name ?? app?.name,
					createdAt: this.idService.parse(token.id).date.toISOString(),
					lastUsedAt: token.lastUsedAt?.toISOString(),
					permission: app ? app.permission : token.permission,
					iconUrl: token.iconUrl,
					description: token.description ?? app?.description ?? null,
				};
			}));
		});
	}
}
