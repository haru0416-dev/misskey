/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import { MiAnnouncement } from '@/models/Announcement.js';
import { bindThis } from '@/decorators.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { Packed } from '@/misc/json-schema.js';
import { IdService } from '@/core/IdService.js';
import { AnnouncementEntityService } from '@/core/entities/AnnouncementEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { announcementReadExistsInDatabase, createAnnouncementReadInDatabase, listAnnouncementReadsByUserIdFromDatabase } from '@/core/AnnouncementReadStore.js';
import {
	createAnnouncementInDatabase,
	deleteAnnouncementInDatabase,
	fetchAnnouncementByIdFromDatabase,
	fetchAnnouncementByIdOrFailFromDatabase,
	listUnreadAnnouncementsForUserFromDatabase,
	updateAnnouncementInDatabase,
} from '@/core/AnnouncementStore.js';
import type { AnnouncementReadRow } from '@/db/schema/announcement-read.js';
import type { AnnouncementInsert } from '@/db/schema/announcement.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';

@Injectable()
export class AnnouncementService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private globalEventService: GlobalEventService,
		private moderationLogService: ModerationLogService,
		private announcementEntityService: AnnouncementEntityService,
	) {
	}

	@bindThis
	public async getReads(userId: MiUser['id']): Promise<AnnouncementReadRow[]> {
		return listAnnouncementReadsByUserIdFromDatabase(this.drizzle, userId);
	}

	@bindThis
	public async getUnreadAnnouncements(user: MiUser): Promise<MiAnnouncement[]> {
		return listUnreadAnnouncementsForUserFromDatabase(this.drizzle, user.id);
	}

	@bindThis
	public async create(values: Partial<MiAnnouncement>, moderator?: MiUser): Promise<{ raw: MiAnnouncement; packed: Packed<'Announcement'> }> {
		const announcement = await createAnnouncementInDatabase(this.drizzle, {
			id: this.idService.gen(),
			updatedAt: null,
			title: values.title,
			text: values.text,
			imageUrl: values.imageUrl || null,
			icon: values.icon,
			display: values.display,
			forExistingUsers: values.forExistingUsers,
			silence: values.silence,
			needConfirmationToRead: values.needConfirmationToRead,
			userId: values.userId,
		} as AnnouncementInsert);

		const packed = await this.announcementEntityService.pack(announcement);

		if (values.userId) {
			this.globalEventService.publishMainStream(values.userId, 'announcementCreated', {
				announcement: packed,
			});

			if (moderator) {
				const user = await fetchUserByIdOrFailFromDatabase(this.drizzle, values.userId);
				this.moderationLogService.log(moderator, 'createUserAnnouncement', {
					announcementId: announcement.id,
					announcement: announcement,
					userId: values.userId,
					userUsername: user.username,
					userHost: user.host,
				});
			}
		} else {
			this.globalEventService.publishBroadcastStream('announcementCreated', {
				announcement: packed,
			});

			if (moderator) {
				this.moderationLogService.log(moderator, 'createGlobalAnnouncement', {
					announcementId: announcement.id,
					announcement: announcement,
				});
			}
		}

		return {
			raw: announcement,
			packed: packed,
		};
	}

	@bindThis
	public async update(announcement: MiAnnouncement, values: Partial<MiAnnouncement>, moderator?: MiUser): Promise<void> {
		await updateAnnouncementInDatabase(this.drizzle, announcement.id, {
			updatedAt: new Date(),
			title: values.title,
			text: values.text,
			/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- 空の文字列の場合、nullを渡すようにするため */
			imageUrl: values.imageUrl || null,
			display: values.display,
			icon: values.icon,
			forExistingUsers: values.forExistingUsers,
			silence: values.silence,
			needConfirmationToRead: values.needConfirmationToRead,
			isActive: values.isActive,
		});

		const after = await fetchAnnouncementByIdOrFailFromDatabase(this.drizzle, announcement.id);

		if (moderator) {
			if (announcement.userId) {
				const user = await fetchUserByIdOrFailFromDatabase(this.drizzle, announcement.userId);
				this.moderationLogService.log(moderator, 'updateUserAnnouncement', {
					announcementId: announcement.id,
					before: announcement,
					after: after,
					userId: announcement.userId,
					userUsername: user.username,
					userHost: user.host,
				});
			} else {
				this.moderationLogService.log(moderator, 'updateGlobalAnnouncement', {
					announcementId: announcement.id,
					before: announcement,
					after: after,
				});
			}
		}
	}

	@bindThis
	public async delete(announcement: MiAnnouncement, moderator?: MiUser): Promise<void> {
		await deleteAnnouncementInDatabase(this.drizzle, announcement.id);

		if (moderator) {
			if (announcement.userId) {
				const user = await fetchUserByIdOrFailFromDatabase(this.drizzle, announcement.userId);
				this.moderationLogService.log(moderator, 'deleteUserAnnouncement', {
					announcementId: announcement.id,
					announcement: announcement,
					userId: announcement.userId,
					userUsername: user.username,
					userHost: user.host,
				});
			} else {
				this.moderationLogService.log(moderator, 'deleteGlobalAnnouncement', {
					announcementId: announcement.id,
					announcement: announcement,
				});
			}
		}
	}

	@bindThis
	public async getAnnouncement(announcementId: MiAnnouncement['id'], me: MiUser | null): Promise<Packed<'Announcement'>> {
		const announcement = await fetchAnnouncementByIdOrFailFromDatabase(this.drizzle, announcementId);

		if (announcement.userId && (me == null || announcement.userId !== me.id)) {
			throw new EntityNotFoundError(MiAnnouncement, { id: announcementId });
		}

		if (me) {
			const isRead = await announcementReadExistsInDatabase(this.drizzle, me.id, announcement.id);
			return this.announcementEntityService.pack({ ...announcement, isRead }, me);
		} else {
			return this.announcementEntityService.pack(announcement, null);
		}
	}

	@bindThis
	public async read(user: MiUser, announcementId: MiAnnouncement['id']): Promise<void> {
		const created = await createAnnouncementReadInDatabase(this.drizzle, {
			id: this.idService.gen(),
			announcementId: announcementId,
			userId: user.id,
		});
		if (!created) return;

		const announcement = await fetchAnnouncementByIdFromDatabase(this.drizzle, announcementId);
		if (announcement != null && announcement.userId === user.id) {
			await updateAnnouncementInDatabase(this.drizzle, announcementId, {
				isActive: false,
			});
		}

		if ((await this.getUnreadAnnouncements(user)).length === 0) {
			this.globalEventService.publishMainStream(user.id, 'readAllAnnouncements');
		}
	}
}
