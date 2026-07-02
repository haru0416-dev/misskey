/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/Meta.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { adminUpdateMetaParamDef, buildAdminUpdateMetaPatch } from '@/server/api/AdminUpdateMetaLogic.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
} as const;

export const paramDef = adminUpdateMetaParamDef;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private metaService: MetaService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const before = await this.metaService.fetch(true);
			const set = buildAdminUpdateMetaPatch(this.serverSettings, ps);

			await this.metaService.update(set);

			const after = await this.metaService.fetch(true);

			this.moderationLogService.log(me, 'updateServerSettings', {
				before,
				after,
			});
		});
	}
}
