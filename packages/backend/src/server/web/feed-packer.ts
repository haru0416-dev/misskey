/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Feed } from 'feed';
import { parse as mfmParse } from 'mfm-js';
import type { Config } from '@/config.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { getIdenticonUrl } from '@/core/IdenticonUrl.js';
import { mfmToHtml } from '@/core/MfmToHtml.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import { listPublicFeedNotesByUserIdFromDatabase } from '@/core/NoteStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { parseId } from '@/misc/id/parse-id.js';

export type FeedPackerDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export async function packFeed(deps: FeedPackerDependencies, user: MiUser): Promise<Feed> {
	const author = {
		link: `${deps.config.instance.url}/@${user.username}`,
		name: user.name ?? user.username,
	};

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const notes = await listPublicFeedNotesByUserIdFromDatabase(deps.db, user.id, 20);
	const latestNote = notes[0];

	const feed = new Feed({
		id: author.link,
		title: `${author.name} (@${user.username}@${deps.config.runtime.host})`,
		...(latestNote == null ? {} : { updated: parseId(latestNote.id).date }),
		generator: 'Erebia',
		description: `${user.notesCount} Notes, ${profile.followingVisibility === 'public' ? user.followingCount : '?'} Following, ${profile.followersVisibility === 'public' ? user.followersCount : '?'} Followers${profile.description ? ` · ${profile.description}` : ''}`,
		link: author.link,
		image: (user.avatarId == null ? null : user.avatarUrl) ?? getIdenticonUrl(deps.config, deps.meta, user),
		feedLinks: {
			json: `${author.link}.json`,
			atom: `${author.link}.atom`,
		},
		author,
		copyright: user.name ?? user.username,
	});

	const allFileIds = [...new Set(notes.flatMap((note) => note.fileIds))];
	const allFiles = allFileIds.length > 0 ? await listDriveFilesByIdsFromDatabase(deps.db, allFileIds) : [];
	const filesById = new Map(allFiles.map((file) => [file.id, file]));

	for (const note of notes) {
		const files = note.fileIds.map((id) => filesById.get(id)).filter((file) => file != null);
		const file = files.find((file) => file.type.startsWith('image/'));
		const text = note.text;
		const content = text ? mfmToHtml(deps.config, mfmParse(text), JSON.parse(note.mentionedRemoteUsers)) : null;

		feed.addItem({
			title: `New note by ${author.name}`,
			link: `${deps.config.instance.url}/notes/${note.id}`,
			date: parseId(note.id).date,
			...(note.cw == null ? {} : { description: note.cw }),
			...(content == null ? {} : { content }),
			...(file ? { image: getDriveFilePublicUrl(file, deps) } : {}),
		});
	}

	return feed;
}
