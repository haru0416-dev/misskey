/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile, MiNote } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/User.js';
import type { MiChannel } from '@/models/Channel.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { channelFavoriteExistsInDatabase, fetchFavoritedChannelIdsInDatabase } from '@/core/ChannelFavoriteStore.js';
import { channelMutingExistsInDatabase, fetchMutedChannelIdsInDatabase } from '@/core/ChannelMutingStore.js';
import { channelFollowingExistsInDatabase, fetchFollowingChannelIdsInDatabase } from '@/core/ChannelFollowingStore.js';
import { fetchChannelByIdOrFailFromDatabase, listChannelsByIdsFromDatabase } from '@/core/ChannelStore.js';
import { fetchDriveFileByIdOrFailFromDatabase, listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import { listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { NoteEntityService } from './NoteEntityService.js';

@Injectable()
export class ChannelEntityService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,
		private noteEntityService: NoteEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiChannel['id'] | MiChannel,
		me?: { id: MiUser['id'] } | null | undefined,
		detailed?: boolean,
		opts?: {
			bannerFiles?: Map<MiDriveFile['id'], MiDriveFile>;
			followings?: Set<MiChannel['id']>;
			favorites?: Set<MiChannel['id']>;
			muting?: Set<MiChannel['id']>;
			pinnedNotes?: Map<MiNote['id'], MiNote>;
		},
	): Promise<Packed<'Channel'>> {
		const channel = typeof src === 'object' ? src : await fetchChannelByIdOrFailFromDatabase(this.drizzle, src);

		let bannerFile: MiDriveFile | null = null;
		if (channel.bannerId) {
			bannerFile = opts?.bannerFiles?.get(channel.bannerId)
				?? await fetchDriveFileByIdOrFailFromDatabase(this.drizzle, channel.bannerId);
		}

		let isFollowing = false;
		let isFavorited = false;
		let isMuting = false;
		if (me) {
			isFollowing = opts?.followings?.has(channel.id) ?? await channelFollowingExistsInDatabase(this.drizzle, me.id, channel.id);

			isFavorited = opts?.favorites?.has(channel.id) ?? await channelFavoriteExistsInDatabase(this.drizzle, me.id, channel.id);

			isMuting = opts?.muting?.has(channel.id) ?? await channelMutingExistsInDatabase(this.drizzle, me.id, channel.id);
		}

		const pinnedNotes = Array.of<MiNote>();
		if (channel.pinnedNoteIds.length > 0) {
			pinnedNotes.push(
				...(
					opts?.pinnedNotes
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						? channel.pinnedNoteIds.map(it => opts.pinnedNotes!.get(it)).filter(it => it != null)
						: await listNotesByIdsFromDatabase(this.drizzle, channel.pinnedNoteIds)
				),
			);
		}

		return {
			id: channel.id,
			createdAt: this.idService.parse(channel.id).date.toISOString(),
			lastNotedAt: channel.lastNotedAt ? channel.lastNotedAt.toISOString() : null,
			name: channel.name,
			description: channel.description,
			userId: channel.userId,
			bannerUrl: bannerFile ? this.driveFileEntityService.getPublicUrl(bannerFile) : null,
			bannerId: channel.bannerId,
			pinnedNoteIds: channel.pinnedNoteIds,
			color: channel.color,
			isArchived: channel.isArchived,
			usersCount: channel.usersCount,
			notesCount: channel.notesCount,
			isSensitive: channel.isSensitive,
			allowRenoteToExternal: channel.allowRenoteToExternal,

			...(me ? {
				isFollowing,
				isFavorited,
				isMuting,
				hasUnreadNote: false, // 後方互換性のため
			} : {}),

			...(detailed ? {
				pinnedNotes: (await this.noteEntityService.packMany(pinnedNotes, me)).sort((a, b) => channel.pinnedNoteIds.indexOf(a.id) - channel.pinnedNoteIds.indexOf(b.id)),
			} : {}),
		};
	}

	@bindThis
	public async packMany(
		src: MiChannel['id'][] | MiChannel[],
		me?: { id: MiUser['id'] } | null | undefined,
		detailed?: boolean,
	): Promise<Packed<'Channel'>[]> {
		// IDのみの要素がある場合、DBからオブジェクトを取得して補う
		const channels = src.filter(it => typeof it === 'object') as MiChannel[];
		channels.push(
			...(await listChannelsByIdsFromDatabase(this.drizzle, src.filter(it => typeof it !== 'object') as MiChannel['id'][])),
		);
		channels.sort((a, b) => a.id.localeCompare(b.id));

		const bannerFiles = await listDriveFilesByIdsFromDatabase(this.drizzle, channels.map(it => it.bannerId).filter(it => it != null))
			.then(it => new Map(it.map(it => [it.id, it])));

		const followings = me
			? await fetchFollowingChannelIdsInDatabase(this.drizzle, me.id, channels.map(it => it.id))
			: new Set<MiChannel['id']>();

		const favorites = me
			? await fetchFavoritedChannelIdsInDatabase(this.drizzle, me.id, channels.map(it => it.id))
			: new Set<MiChannel['id']>();

		const muting = me
			? await fetchMutedChannelIdsInDatabase(this.drizzle, me.id, channels.map(it => it.id))
			: new Set<MiChannel['id']>();

		const pinnedNotes = await listNotesByIdsFromDatabase(this.drizzle, channels.flatMap(it => it.pinnedNoteIds))
			.then(it => new Map(it.map(it => [it.id, it])));

		return Promise.all(channels.map(it => this.pack(it, me, detailed, {
			bannerFiles,
			followings,
			favorites,
			muting,
			pinnedNotes,
		})));
	}
}
