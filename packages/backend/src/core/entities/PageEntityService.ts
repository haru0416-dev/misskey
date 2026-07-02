/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { MiPage } from '@/models/Page.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { pageLikeExistsInDatabase } from '@/core/PageLikeStore.js';
import { fetchPageByIdOrFailFromDatabase, updatePageContentInDatabase } from '@/core/PageStore.js';
import { fetchDriveFileByIdAndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';

@Injectable()
export class PageEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiPage['id'] | MiPage,
		me?: { id: MiUser['id'] } | null | undefined,
		hint?: {
			packedUser?: Packed<'UserLite'>
		},
	): Promise<Packed<'Page'>> {
		const meId = me ? me.id : null;
		const page = typeof src === 'object' ? src : await fetchPageByIdOrFailFromDatabase(this.drizzle, src);

		const attachedFiles: Promise<MiDriveFile | null>[] = [];
		const collectFile = (xs: any[]) => {
			for (const x of xs) {
				if (x.type === 'image') {
					attachedFiles.push(fetchDriveFileByIdAndUserIdFromDatabase(this.drizzle, x.fileId, page.userId));
				}
				if (x.children) {
					collectFile(x.children);
				}
			}
		};
		collectFile(page.content);

		// 後方互換性のため
		let migrated = false;
		const migrate = (xs: any[]) => {
			for (const x of xs) {
				if (x.type === 'input') {
					if (x.inputType === 'text') {
						x.type = 'textInput';
					}
					if (x.inputType === 'number') {
						x.type = 'numberInput';
						if (x.default) x.default = parseInt(x.default, 10);
					}
					migrated = true;
				}
				if (x.children) {
					migrate(x.children);
				}
			}
		};
		migrate(page.content);
		if (migrated) {
			updatePageContentInDatabase(this.drizzle, page.id, page.content);
		}

		return await awaitAll({
			id: page.id,
			createdAt: this.idService.parse(page.id).date.toISOString(),
			updatedAt: page.updatedAt.toISOString(),
			userId: page.userId,
			user: hint?.packedUser ?? this.userEntityService.pack(page.user ?? page.userId, me), // { schema: 'UserDetailed' } すると無限ループするので注意
			content: page.content,
			variables: page.variables,
			title: page.title,
			name: page.name,
			summary: page.summary,
			hideTitleWhenPinned: page.hideTitleWhenPinned,
			alignCenter: page.alignCenter,
			font: page.font,
			script: page.script,
			eyeCatchingImageId: page.eyeCatchingImageId,
			eyeCatchingImage: page.eyeCatchingImageId ? await this.driveFileEntityService.pack(page.eyeCatchingImageId) : null,
			attachedFiles: this.driveFileEntityService.packMany((await Promise.all(attachedFiles)).filter(x => x != null)),
			likedCount: page.likedCount,
			isLiked: meId ? await pageLikeExistsInDatabase(this.drizzle, meId, page.id) : undefined,
		});
	}

	@bindThis
	public async packMany(
		pages: MiPage[],
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const _users = pages.map(({ user, userId }) => user ?? userId);
		const _userMap = await this.userEntityService.packMany(_users, me)
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(pages.map(page => this.pack(page, me, { packedUser: _userMap.get(page.userId) })));
	}
}
