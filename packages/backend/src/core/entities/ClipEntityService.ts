/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import type { MiClip } from '@/models/Clip.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { countClipNotesByClipIdFromDatabase } from '@/core/ClipNoteStore.js';
import { clipFavoriteExistsInDatabase, countClipFavoritesFromDatabase } from '@/core/ClipFavoriteStore.js';
import { fetchClipByIdOrFailFromDatabase } from '@/core/ClipStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class ClipEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiClip['id'] | MiClip,
		me?: { id: MiUser['id'] } | null | undefined,
		hint?: {
			packedUser?: Packed<'UserLite'>
		},
	): Promise<Packed<'Clip'>> {
		const meId = me ? me.id : null;
		const clip = typeof src === 'object' ? src : await fetchClipByIdOrFailFromDatabase(this.drizzle, src);

		return await awaitAll({
			id: clip.id,
			createdAt: this.idService.parse(clip.id).date.toISOString(),
			lastClippedAt: clip.lastClippedAt ? clip.lastClippedAt.toISOString() : null,
			userId: clip.userId,
			user: hint?.packedUser ?? this.userEntityService.pack(clip.user ?? clip.userId),
			name: clip.name,
			description: clip.description,
			isPublic: clip.isPublic,
			favoritedCount: await countClipFavoritesFromDatabase(this.drizzle, clip.id),
			isFavorited: meId ? await clipFavoriteExistsInDatabase(this.drizzle, meId, clip.id) : undefined,
			notesCount: (meId === clip.userId) ? await countClipNotesByClipIdFromDatabase(this.drizzle, clip.id) : undefined,
		});
	}

	@bindThis
	public async packMany(
		clips: MiClip[],
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const _users = clips.map(({ user, userId }) => user ?? userId);
		const _userMap = await this.userEntityService.packMany(_users, me)
			.then(users => new Map(users.map(u => [u.id, u])));
		return Promise.all(clips.map(clip => this.pack(clip, me, { packedUser: _userMap.get(clip.userId) })));
	}
}
