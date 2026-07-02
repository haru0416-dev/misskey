/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Feed } from 'feed';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { MfmService } from "@/core/MfmService.js";
import { parse as mfmParse } from 'mfm-js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import { listPublicFeedNotesByUserIdFromDatabase } from '@/core/NoteStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';

@Injectable()
export class FeedService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
		private mfmService: MfmService,
	) {
	}

	@bindThis
	public async packFeed(user: MiUser) {
		const author = {
			link: `${this.config.url}/@${user.username}`,
			name: user.name ?? user.username,
		};

		const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.db, user.id);

		const notes = await listPublicFeedNotesByUserIdFromDatabase(this.db, user.id, 20);

		const feed = new Feed({
			id: author.link,
			title: `${author.name} (@${user.username}@${this.config.host})`,
			updated: notes.length !== 0 ? this.idService.parse(notes[0].id).date : undefined,
			generator: 'Misskey',
			description: `${user.notesCount} Notes, ${profile.followingVisibility === 'public' ? user.followingCount : '?'} Following, ${profile.followersVisibility === 'public' ? user.followersCount : '?'} Followers${profile.description ? ` · ${profile.description}` : ''}`,
			link: author.link,
			image: (user.avatarId == null ? null : user.avatarUrl) ?? this.userEntityService.getIdenticonUrl(user),
			feedLinks: {
				json: `${author.link}.json`,
				atom: `${author.link}.atom`,
			},
			author,
			copyright: user.name ?? user.username,
		});

		for (const note of notes) {
			const files = note.fileIds.length > 0 ? await listDriveFilesByIdsFromDatabase(this.db, note.fileIds) : [];
			const file = files.find(file => file.type.startsWith('image/'));
			const text = note.text;

			feed.addItem({
				title: `New note by ${author.name}`,
				link: `${this.config.url}/notes/${note.id}`,
				date: this.idService.parse(note.id).date,
				description: note.cw ?? undefined,
				content: text ? this.mfmService.toHtml(mfmParse(text), JSON.parse(note.mentionedRemoteUsers)) ?? undefined : undefined,
				image: file ? this.driveFileEntityService.getPublicUrl(file) : undefined,
			});
		}

		return feed;
	}
}
