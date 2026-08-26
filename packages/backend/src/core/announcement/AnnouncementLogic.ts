/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { BroadcastTypes, MainEventTypes } from '@/core/global-events.js';
import type { ModerationLogPayloads } from '@/types.js';
import {
	createAnnouncementInDatabase,
	deleteAnnouncementInDatabase,
	fetchAnnouncementByIdOrFailFromDatabase,
	updateAnnouncementInDatabase,
} from '@/core/announcement/AnnouncementStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import type { AnnouncementInsert } from '@/db/schema/announcement.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiAnnouncement } from '@/models/Announcement.js';
import type { MiUser } from '@/models/User.js';

export type AnnouncementCreateValues = Pick<
	MiAnnouncement,
	| 'title'
	| 'text'
	| 'imageUrl'
	| 'icon'
	| 'display'
	| 'forExistingUsers'
	| 'silence'
	| 'needConfirmationToRead'
	| 'userId'
> & {
	updatedAt?: MiAnnouncement['updatedAt'];
};

export type AnnouncementUpdateValues = Partial<
	Pick<
		MiAnnouncement,
		| 'title'
		| 'text'
		| 'imageUrl'
		| 'icon'
		| 'display'
		| 'forExistingUsers'
		| 'silence'
		| 'needConfirmationToRead'
		| 'isActive'
	>
>;

export type AnnouncementLogicDependencies = {
	db: MiDrizzleDatabase;
	genId: () => string;
	packAnnouncement: (announcement: MiAnnouncement) => Promise<Packed<'Announcement'>>;
	publishMainStream?: <K extends keyof MainEventTypes>(
		userId: MiUser['id'],
		type: K,
		value?: MainEventTypes[K],
	) => void;
	publishBroadcastStream?: <K extends keyof BroadcastTypes>(type: K, value?: BroadcastTypes[K]) => void;
	logModeration?: <T extends keyof ModerationLogPayloads>(
		moderator: { id: MiUser['id'] },
		type: T,
		info?: ModerationLogPayloads[T],
	) => void | Promise<void>;
};

export async function createAnnouncementWithSideEffects(
	deps: AnnouncementLogicDependencies,
	values: AnnouncementCreateValues,
	moderator?: MiUser,
): Promise<{ raw: MiAnnouncement; packed: Packed<'Announcement'> }> {
	const announcement = await createAnnouncementInDatabase(deps.db, {
		id: deps.genId(),
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

	const packed = await deps.packAnnouncement(announcement);

	if (values.userId) {
		deps.publishMainStream?.(values.userId, 'announcementCreated', {
			announcement: packed,
		});

		if (moderator) {
			const user = await fetchUserByIdOrFailFromDatabase(deps.db, values.userId);
			void deps.logModeration?.(moderator, 'createUserAnnouncement', {
				announcementId: announcement.id,
				announcement,
				userId: values.userId,
				userUsername: user.username,
				userHost: user.host,
			});
		}
	} else {
		deps.publishBroadcastStream?.('announcementCreated', {
			announcement: packed,
		});

		if (moderator) {
			void deps.logModeration?.(moderator, 'createGlobalAnnouncement', {
				announcementId: announcement.id,
				announcement,
			});
		}
	}

	return {
		raw: announcement,
		packed,
	};
}

export async function updateAnnouncementWithModerationLog(
	deps: Pick<AnnouncementLogicDependencies, 'db' | 'logModeration'>,
	announcement: MiAnnouncement,
	values: AnnouncementUpdateValues,
	moderator?: MiUser,
): Promise<void> {
	await updateAnnouncementInDatabase(deps.db, announcement.id, {
		updatedAt: new Date(),
		...(values.title === undefined ? {} : { title: values.title }),
		...(values.text === undefined ? {} : { text: values.text }),
		imageUrl: values.imageUrl || null,
		...(values.display === undefined ? {} : { display: values.display }),
		...(values.icon === undefined ? {} : { icon: values.icon }),
		...(values.forExistingUsers === undefined ? {} : { forExistingUsers: values.forExistingUsers }),
		...(values.silence === undefined ? {} : { silence: values.silence }),
		...(values.needConfirmationToRead === undefined ? {} : { needConfirmationToRead: values.needConfirmationToRead }),
		...(values.isActive === undefined ? {} : { isActive: values.isActive }),
	});

	const after = await fetchAnnouncementByIdOrFailFromDatabase(deps.db, announcement.id);

	if (moderator) {
		if (announcement.userId) {
			const user = await fetchUserByIdOrFailFromDatabase(deps.db, announcement.userId);
			void deps.logModeration?.(moderator, 'updateUserAnnouncement', {
				announcementId: announcement.id,
				before: announcement,
				after,
				userId: announcement.userId,
				userUsername: user.username,
				userHost: user.host,
			});
		} else {
			void deps.logModeration?.(moderator, 'updateGlobalAnnouncement', {
				announcementId: announcement.id,
				before: announcement,
				after,
			});
		}
	}
}

export async function deleteAnnouncementWithModerationLog(
	deps: Pick<AnnouncementLogicDependencies, 'db' | 'logModeration'>,
	announcement: MiAnnouncement,
	moderator?: MiUser,
): Promise<void> {
	await deleteAnnouncementInDatabase(deps.db, announcement.id);

	if (moderator) {
		if (announcement.userId) {
			const user = await fetchUserByIdOrFailFromDatabase(deps.db, announcement.userId);
			void deps.logModeration?.(moderator, 'deleteUserAnnouncement', {
				announcementId: announcement.id,
				announcement,
				userId: announcement.userId,
				userUsername: user.username,
				userHost: user.host,
			});
		} else {
			void deps.logModeration?.(moderator, 'deleteGlobalAnnouncement', {
				announcementId: announcement.id,
				announcement,
			});
		}
	}
}
