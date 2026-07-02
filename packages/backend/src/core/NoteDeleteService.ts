/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { MiNote, IMentionedRemoteUsers } from '@/models/Note.js';
import type { MiMeta } from '@/models/_.js';
import { RelayService } from '@/core/RelayService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { adjustInstanceNotesCountFromDatabase } from '@/core/InstanceStore.js';
import type { Config } from '@/config.js';
import NotesChart from '@/core/chart/charts/notes.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import {
	decrementNoteRepliesCountInDatabase,
	deleteNoteByIdAndUserIdFromDatabase,
	fetchNoteByIdFromDatabase,
	listRemoteUsersWhoRenotedOrRepliedNoteFromDatabase,
} from '@/core/NoteStore.js';
import { fetchUserByIdOrFailFromDatabase, listUsersByUrisOrIdsFromDatabase } from '@/core/UserStore.js';

@Injectable()
export class NoteDeleteService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private federatedInstanceService: FederatedInstanceService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
		private notesChart: NotesChart,
		private perUserNotesChart: PerUserNotesChart,
		private instanceChart: InstanceChart,
	) {}

	/**
	 * 投稿を削除します。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async delete(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, quiet = false, deleter?: MiUser) {
		const deletedAt = new Date();

		if (note.replyId) {
			await decrementNoteRepliesCountInDatabase(this.db, note.replyId, 1);
		}

		if (!quiet) {
			this.globalEventService.publishNoteStream(note, 'deleted', {
				deletedAt: deletedAt,
			});

			//#region ローカルの投稿なら削除アクティビティを配送
			if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
				let renote: MiNote | null = null;

				// if deleted note is renote
				if (isRenote(note) && !isQuote(note)) {
					renote = await fetchNoteByIdFromDatabase(this.db, note.renoteId);
				}

				const content = this.apRendererService.addContext(renote
					? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
					: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

				this.deliverToConcerned(user, note, content);
			}
			//#endregion

			this.notesChart.update(note, false);
			if (this.meta.enableChartsForRemoteUser || (user.host == null)) {
				this.perUserNotesChart.update(user, note, false);
			}

			if (this.meta.enableStatsForFederatedInstances) {
				if (this.userEntityService.isRemoteUser(user)) {
					this.federatedInstanceService.fetchOrRegister(user.host).then(async i => {
						await adjustInstanceNotesCountFromDatabase(this.db, i.id, -1);
						if (this.meta.enableChartsForFederatedInstances) {
							this.instanceChart.updateNote(i.host, note, false);
						}
					});
				}
			}
		}

		this.searchService.unindexNote(note);

		await deleteNoteByIdAndUserIdFromDatabase(this.db, note.id, user.id);

		if (deleter && (note.userId !== deleter.id)) {
			const user = await fetchUserByIdOrFailFromDatabase(this.db, note.userId);
			this.moderationLogService.log(deleter, 'deleteNote', {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
				note: note,
			});
		}
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote) {
		// mention / reply / dm
		const uris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);

		// renote / quote
		return await listUsersByUrisOrIdsFromDatabase(this.db, {
			uris,
			ids: note.renoteUserId ? [note.renoteUserId] : [],
		}) as MiRemoteUser[];
	}

	@bindThis
	private async getRenotedOrRepliedRemoteUsers(note: MiNote) {
		return await listRemoteUsersWhoRenotedOrRepliedNoteFromDatabase(this.db, note.id);
	}

	@bindThis
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, note: MiNote, content: any) {
		this.apDeliverManagerService.deliverToFollowers(user, content);
		this.relayService.deliverToRelays(user, content);
		this.apDeliverManagerService.deliverToUsers(user, content, [
			...await this.getMentionedRemoteUsers(note),
			...await this.getRenotedOrRepliedRemoteUsers(note),
		]);
	}
}
