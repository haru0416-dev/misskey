/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { MiNoteFavorite } from '@/models/NoteFavorite.js';
import type { MiNote } from '@/models/Note.js';
import type { NoteFavoriteRow } from '@/db/schema/note-favorite.js';
import { fetchNoteFavoriteByIdOrFailFromDatabase } from '@/core/NoteFavoriteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { NoteEntityService } from './NoteEntityService.js';

export type NoteFavoritePackable = NoteFavoriteRow & {
	note?: MiNote | null;
};

@Injectable()
export class NoteFavoriteEntityService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiNoteFavorite['id'] | NoteFavoritePackable,
		me?: { id: MiUser['id'] } | null | undefined,
	) {
		const favorite = typeof src === 'object' ? src : await fetchNoteFavoriteByIdOrFailFromDatabase(this.db, src);
		const note = typeof src === 'object' ? (src.note ?? src.noteId) : favorite.noteId;

		return {
			id: favorite.id,
			createdAt: this.idService.parse(favorite.id).date.toISOString(),
			noteId: favorite.noteId,
			note: await this.noteEntityService.pack(note, me),
		};
	}

	@bindThis
	public packMany(
		favorites: NoteFavoritePackable[],
		me: { id: MiUser['id'] },
	) {
		return Promise.all(favorites.map(x => this.pack(x, me)));
	}
}
