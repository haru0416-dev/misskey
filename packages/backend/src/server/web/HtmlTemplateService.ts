/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { FastifyReply } from 'fastify';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import type { CommonData } from './views/_.js';
import { createClientCommonDataLoader } from './client-common-data.js';

@Injectable()
export class HtmlTemplateService {
	private readonly loadCommonData: () => Promise<CommonData>;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,
	) {
		this.loadCommonData = createClientCommonDataLoader({
			config: this.config,
			meta: this.meta,
			db: this.db,
		});
	}

	@bindThis
	public async getCommonData(): Promise<CommonData> {
		return await this.loadCommonData();
	}

	public static async replyHtml(reply: FastifyReply, html: string | Promise<string>) {
		reply.header('Content-Type', 'text/html; charset=utf-8');
		const _html = await html;
		return reply.send(_html);
	}
}
