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
import {
	createAnnouncementWithSideEffects,
	deleteAnnouncementWithModerationLog,
	updateAnnouncementWithModerationLog,
	type AnnouncementCreateValues,
	type AnnouncementUpdateValues,
} from '@/core/AnnouncementLogic.js';
import { announcementReadExistsInDatabase, createAnnouncementReadInDatabase, listAnnouncementReadsByUserIdFromDatabase } from '@/core/AnnouncementReadStore.js';
import {
	fetchAnnouncementByIdFromDatabase,
	fetchAnnouncementByIdOrFailFromDatabase,
	listUnreadAnnouncementsForUserFromDatabase,
	updateAnnouncementInDatabase,
} from '@/core/AnnouncementStore.js';
import type { AnnouncementReadRow } from '@/db/schema/announcement-read.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

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
		return await createAnnouncementWithSideEffects({
			db: this.drizzle,
			genId: () => this.idService.gen(),
			packAnnouncement: announcement => this.announcementEntityService.pack(announcement),
			publishMainStream: (userId, type, value) => this.globalEventService.publishMainStream(userId, type, value),
			publishBroadcastStream: (type, value) => this.globalEventService.publishBroadcastStream(type, value),
			logModeration: (mod, type, info) => this.moderationLogService.log(mod, type, info),
		}, values as AnnouncementCreateValues, moderator);
	}

	@bindThis
	public async update(announcement: MiAnnouncement, values: Partial<MiAnnouncement>, moderator?: MiUser): Promise<void> {
		await updateAnnouncementWithModerationLog({
			db: this.drizzle,
			logModeration: (mod, type, info) => this.moderationLogService.log(mod, type, info),
		}, announcement, values as AnnouncementUpdateValues, moderator);
	}

	@bindThis
	public async delete(announcement: MiAnnouncement, moderator?: MiUser): Promise<void> {
		await deleteAnnouncementWithModerationLog({
			db: this.drizzle,
			logModeration: (mod, type, info) => this.moderationLogService.log(mod, type, info),
		}, announcement, moderator);
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
