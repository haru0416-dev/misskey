/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { MiPage } from '@/models/Page.js';
import { fetchPageLikeByIdOrFailFromDatabase } from '@/core/PageLikeStore.js';
import type { PageLikeRow } from '@/db/schema/page-like.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { bindThis } from '@/decorators.js';
import { PageEntityService } from './PageEntityService.js';

export type PageLikePackable = PageLikeRow & {
	page?: MiPage | null;
};

@Injectable()
export class PageLikeEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private pageEntityService: PageEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: PageLikeRow['id'] | PageLikePackable,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const like = typeof src === 'object' ? src : await fetchPageLikeByIdOrFailFromDatabase(this.drizzle, src);
		const page = typeof src === 'object' ? (src.page ?? src.pageId) : like.pageId;

		return {
			id: like.id,
			page: await this.pageEntityService.pack(page, me),
		};
	}

	@bindThis
	public packMany(
		likes: PageLikePackable[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(likes.map(x => this.pack(x, me)));
	}
}
