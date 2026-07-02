/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Packed } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/Meta.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { packMetaDetailed, packMetaLite } from '@/core/MetaEntityPacker.js';

@Injectable()
export class MetaEntityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private systemAccountService: SystemAccountService,
	) { }

	@bindThis
	public async pack(meta?: MiMeta): Promise<Packed<'MetaLite'>> {
		return await packMetaLite({
			config: this.config,
			meta: this.meta,
			db: this.drizzle,
		}, meta);
	}

	@bindThis
	public async packDetailed(meta?: MiMeta): Promise<Packed<'MetaDetailed'>> {
		return await packMetaDetailed({
			config: this.config,
			meta: this.meta,
			db: this.drizzle,
			fetchProxyAccount: () => this.systemAccountService.fetch('proxy'),
		}, meta);
	}
}
