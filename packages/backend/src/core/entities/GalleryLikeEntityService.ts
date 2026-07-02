/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { } from '@/models/Blocking.js';
import type { MiGalleryPost } from '@/models/GalleryPost.js';
import type { MiUser } from '@/models/User.js';
import { fetchGalleryLikeByIdOrFailFromDatabase } from '@/core/GalleryLikeStore.js';
import type { GalleryLikeRow } from '@/db/schema/gallery-like.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { bindThis } from '@/decorators.js';
import { GalleryPostEntityService } from './GalleryPostEntityService.js';

export type GalleryLikePackable = GalleryLikeRow & {
	post?: MiGalleryPost | null;
};

@Injectable()
export class GalleryLikeEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private galleryPostEntityService: GalleryPostEntityService,
	) {
	}

	@bindThis
	public async pack(
		src: GalleryLikeRow['id'] | GalleryLikePackable,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const like = typeof src === 'object' ? src : await fetchGalleryLikeByIdOrFailFromDatabase(this.drizzle, src);
		const post = typeof src === 'object' ? (src.post ?? src.postId) : like.postId;

		return {
			id: like.id,
			post: await this.galleryPostEntityService.pack(post, me),
		};
	}

	@bindThis
	public packMany(
		likes: GalleryLikePackable[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(likes.map(x => this.pack(x, me)));
	}
}
