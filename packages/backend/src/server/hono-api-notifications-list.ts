/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listFollowRequestsByFollowerIdsFromDatabase } from '@/core/FollowRequestStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchRoleByIdFromDatabase } from '@/core/RoleStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import { listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiGroupedNotification, MiNotification } from '@/models/Notification.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { notificationTypes, obsoleteNotificationTypes } from '@/types.js';
import { packChatRoomInvitationForHonoApi, type HonoApiChatDependencies } from './hono-api-chat.js';
import { packNoteForHonoApi, packNoteManyForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { packHonoApiRole, type HonoApiRoleDependencies } from './hono-api-roles.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';
import { markAllHonoApiNotificationsAsRead, toXListId, type HonoApiNotificationDependencies } from './hono-api-notification.js';

export type HonoApiNotificationsListDependencies =
	HonoApiNoteDependencies &
	HonoApiChatDependencies &
	HonoApiRoleDependencies &
	HonoApiNotificationDependencies;

const NOTE_REQUIRED_NOTIFICATION_TYPES = new Set([
	'note', 'mention', 'reply', 'renote', 'renote:grouped', 'quote', 'reaction', 'reaction:grouped', 'pollEnded', 'scheduledNotePosted',
]);

export async function getHonoApiNotifications(
	deps: HonoApiNotificationsListDependencies,
	userId: MiUser['id'],
	options: {
		sinceId?: string;
		untilId?: string;
		limit?: number;
		includeTypes?: string[];
		excludeTypes?: string[];
	},
): Promise<MiNotification[]> {
	const limit = options.limit ?? 20;
	let sinceTime = options.sinceId ? toXListId(deps.config, options.sinceId) : null;
	let untilTime = options.untilId ? toXListId(deps.config, options.untilId) : null;

	let notifications: MiNotification[];
	for (;;) {
		let notificationsRes: [id: string, fields: string[]][];

		if (sinceTime && !untilTime) {
			notificationsRes = await deps.redis.xrange(`notificationTimeline:${userId}`, '(' + sinceTime, '+', 'COUNT', limit);
		} else {
			notificationsRes = await deps.redis.xrevrange(`notificationTimeline:${userId}`, untilTime ? '(' + untilTime : '+', sinceTime ? '(' + sinceTime : '-', 'COUNT', limit);
		}

		if (notificationsRes.length === 0) return [];

		notifications = notificationsRes.map(x => JSON.parse(x[1][1])) as MiNotification[];

		if (options.includeTypes && options.includeTypes.length > 0) {
			notifications = notifications.filter(n => options.includeTypes!.includes(n.type));
		} else if (options.excludeTypes && options.excludeTypes.length > 0) {
			notifications = notifications.filter(n => !options.excludeTypes!.includes(n.type));
		}

		if (notifications.length !== 0) break;

		if (options.sinceId && !options.untilId) {
			sinceTime = notificationsRes[notificationsRes.length - 1][0];
		} else {
			untilTime = notificationsRes[notificationsRes.length - 1][0];
		}
	}

	return notifications;
}

async function filterValidNotifiersForHonoApi<T extends MiNotification | MiGroupedNotification>(
	deps: HonoApiNotificationsListDependencies,
	notifications: T[],
	meId: MiUser['id'],
): Promise<T[]> {
	const [userIdsWhoMeMuting, profile] = await Promise.all([
		listMuteeIdsByMuterIdFromDatabase(deps.db, meId),
		fetchUserProfileByUserIdFromDatabase(deps.db, meId),
	]);
	const userMutedInstances = new Set(profile?.mutedInstances ?? []);
	const mutingSet = new Set(userIdsWhoMeMuting);

	const notifierIds = notifications.map(n => 'notifierId' in n ? n.notifierId : null).filter((x): x is string => x != null);
	const notifiers = notifierIds.length > 0 ? await listUsersByIdsFromDatabase(deps.db, notifierIds, { includeSuspended: true }) : [];

	return notifications.filter(notification => {
		if (!('notifierId' in notification)) return true;
		if (mutingSet.has(notification.notifierId)) return false;

		const notifier = notifiers.find(u => u.id === notification.notifierId) ?? null;
		if (notifier == null) return false;
		if (notifier.host && userMutedInstances.has(notifier.host)) return false;
		if (notifier.isSuspended) return false;

		return true;
	});
}

async function packNotificationForHonoApi<T extends MiNotification | MiGroupedNotification>(
	deps: HonoApiNotificationsListDependencies,
	src: T,
	meId: MiUser['id'],
	options: { checkValidNotifier?: boolean },
	hint?: {
		packedNotes: Map<MiNote['id'], Packed<'Note'>>;
		packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
	},
): Promise<Record<string, unknown> | null> {
	if (options.checkValidNotifier !== false) {
		const filtered = await filterValidNotifiersForHonoApi(deps, [src], meId);
		if (filtered.length === 0) return null;
	}

	const needsNote = NOTE_REQUIRED_NOTIFICATION_TYPES.has(src.type) && 'noteId' in src;
	const noteIfNeed = needsNote
		? (hint?.packedNotes != null ? hint.packedNotes.get((src as { noteId: string }).noteId) : await packNoteForHonoApi(deps, (src as { noteId: string }).noteId, { id: meId }, { detail: true }).catch(() => null))
		: undefined;
	if (needsNote && !noteIfNeed) return null;

	const needsUser = 'notifierId' in src;
	const userIfNeed = needsUser
		? (hint?.packedUsers != null ? hint.packedUsers.get((src as { notifierId: string }).notifierId) : await packUserLiteForHonoApi(deps, (src as { notifierId: string }).notifierId).catch(() => null))
		: undefined;
	if (needsUser && !userIfNeed) return null;

	if (src.type === 'reaction:grouped') {
		const reactions = (await Promise.all(src.reactions.map(async reaction => {
			const user = hint?.packedUsers?.get(reaction.userId) ?? await packUserLiteForHonoApi(deps, reaction.userId).catch(() => null);
			return user ? { user, reaction: reaction.reaction } : null;
		}))).filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r != null);
		if (reactions.length === 0) return null;

		return { id: src.id, createdAt: src.createdAt, type: src.type, note: noteIfNeed, reactions };
	} else if (src.type === 'renote:grouped') {
		const users = (await Promise.all(src.userIds.map(userId =>
			hint?.packedUsers?.get(userId) ?? packUserLiteForHonoApi(deps, userId).catch(() => null),
		))).filter((u): u is Packed<'UserLite'> => u != null);
		if (users.length === 0) return null;

		return { id: src.id, createdAt: src.createdAt, type: src.type, note: noteIfNeed, users };
	}

	const needsRole = src.type === 'roleAssigned';
	const role = needsRole ? await fetchRoleByIdFromDatabase(deps.db, src.roleId).then(r => r ? packHonoApiRole(deps, r) : null) : undefined;
	if (needsRole && !role) return null;

	const needsChatRoomInvitation = src.type === 'chatRoomInvitationReceived';
	const chatRoomInvitation = needsChatRoomInvitation ? await packChatRoomInvitationForHonoApi(deps, src.invitationId, { id: meId }).catch(() => null) : undefined;
	if (needsChatRoomInvitation && !chatRoomInvitation) return null;

	return {
		id: src.id,
		createdAt: src.createdAt,
		type: src.type,
		userId: 'notifierId' in src ? src.notifierId : undefined,
		...(userIfNeed != null ? { user: userIfNeed } : {}),
		...(noteIfNeed != null ? { note: noteIfNeed } : {}),
		...(src.type === 'reaction' ? { reaction: src.reaction } : {}),
		...(src.type === 'roleAssigned' ? { role } : {}),
		...(src.type === 'chatRoomInvitationReceived' ? { invitation: chatRoomInvitation } : {}),
		...(src.type === 'followRequestAccepted' ? { message: src.message } : {}),
		...(src.type === 'achievementEarned' ? { achievement: src.achievement } : {}),
		...(src.type === 'exportCompleted' ? { exportedEntity: src.exportedEntity, fileId: src.fileId } : {}),
		...(src.type === 'app' ? { body: src.customBody, header: src.customHeader, icon: src.customIcon } : {}),
	};
}

export async function packNotificationsForHonoApi<T extends MiNotification | MiGroupedNotification>(
	deps: HonoApiNotificationsListDependencies,
	notifications: T[],
	meId: MiUser['id'],
): Promise<Record<string, unknown>[]> {
	if (notifications.length === 0) return [];

	let validNotifications = await filterValidNotifiersForHonoApi(deps, notifications, meId);

	const noteIds = validNotifications.map(x => 'noteId' in x ? x.noteId : null).filter((x): x is string => x != null);
	const notes = noteIds.length > 0 ? await listNotesByIdsFromDatabase(deps.db, noteIds) : [];
	const packedNotesArray = await packNoteManyForHonoApi(deps, notes, { id: meId }, { detail: true });
	const packedNotes = new Map(packedNotesArray.map(p => [p.id, p]));

	validNotifications = validNotifications.filter(x => !('noteId' in x) || packedNotes.has(x.noteId));

	const userIds: string[] = [];
	for (const notification of validNotifications) {
		if ('notifierId' in notification) userIds.push(notification.notifierId);
		if (notification.type === 'reaction:grouped') userIds.push(...notification.reactions.map(x => x.userId));
		if (notification.type === 'renote:grouped') userIds.push(...notification.userIds);
	}
	const packedUsersArray = userIds.length > 0 ? await packUserLiteManyForHonoApi(deps, [...new Set(userIds)]) : [];
	const packedUsers = new Map(packedUsersArray.map(p => [p.id, p]));

	const followRequestNotifications = validNotifications.filter((x): x is T & { type: 'receiveFollowRequest'; notifierId: string } => x.type === 'receiveFollowRequest');
	if (followRequestNotifications.length > 0) {
		const reqs = await listFollowRequestsByFollowerIdsFromDatabase(deps.db, followRequestNotifications.map(x => x.notifierId));
		validNotifications = validNotifications.filter(x => x.type !== 'receiveFollowRequest' || reqs.some(r => r.followerId === (x as { notifierId: string }).notifierId));
	}

	const packed = await Promise.all(validNotifications.map(x => packNotificationForHonoApi(deps, x, meId, { checkValidNotifier: false }, { packedNotes, packedUsers })));

	return packed.filter((x): x is Record<string, unknown> => x != null);
}

const notificationsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		markAsRead: { type: 'boolean', default: true },
		includeTypes: { type: 'array', items: { type: 'string', enum: [...notificationTypes, ...obsoleteNotificationTypes] } },
		excludeTypes: { type: 'array', items: { type: 'string', enum: [...notificationTypes, ...obsoleteNotificationTypes] } },
	},
	required: [],
} as const;

type NotificationsParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	markAsRead: boolean;
	includeTypes?: string[];
	excludeTypes?: string[];
};

export async function handleHonoApiINotifications(
	deps: HonoApiNotificationsListDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(notificationsParamDef, body) as NotificationsParams;
	const untilId = params.untilId ?? (params.untilDate ? genId(deps.config, params.untilDate) : undefined);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(deps.config, params.sinceDate) : undefined);

	if (params.includeTypes && params.includeTypes.length === 0) return [];
	if (notificationTypes.every(type => params.excludeTypes?.includes(type))) return [];

	const includeTypes = params.includeTypes?.filter(type => !(obsoleteNotificationTypes as readonly string[]).includes(type));
	const excludeTypes = params.excludeTypes?.filter(type => !(obsoleteNotificationTypes as readonly string[]).includes(type));

	const notifications = await getHonoApiNotifications(deps, me.id, {
		sinceId,
		untilId,
		limit: params.limit,
		includeTypes,
		excludeTypes,
	});

	if (params.markAsRead) {
		void markAllHonoApiNotificationsAsRead(deps, me.id, false);
	}

	return await packNotificationsForHonoApi(deps, notifications, me.id);
}

function groupHonoApiNotifications(notifications: MiNotification[]): MiGroupedNotification[] {
	let groupedNotifications: MiGroupedNotification[] = [notifications[0]];
	for (let i = 1; i < notifications.length; i++) {
		const notification = notifications[i];
		const prev = notifications[i - 1];
		let prevGroupedNotification = groupedNotifications.at(-1)!;

		if (prev.type === 'reaction' && notification.type === 'reaction' && prev.noteId === notification.noteId) {
			if (prevGroupedNotification.type !== 'reaction:grouped') {
				groupedNotifications[groupedNotifications.length - 1] = {
					type: 'reaction:grouped',
					id: '',
					createdAt: prev.createdAt,
					noteId: prev.noteId,
					reactions: [{ userId: prev.notifierId, reaction: prev.reaction }],
				};
				prevGroupedNotification = groupedNotifications.at(-1)!;
			}
			if (prevGroupedNotification.type === 'reaction:grouped') {
				prevGroupedNotification.reactions.push({ userId: notification.notifierId, reaction: notification.reaction });
			}
			prevGroupedNotification.id = notification.id;
			continue;
		}
		if (prev.type === 'renote' && notification.type === 'renote' && prev.targetNoteId === notification.targetNoteId) {
			if (prevGroupedNotification.type !== 'renote:grouped') {
				groupedNotifications[groupedNotifications.length - 1] = {
					type: 'renote:grouped',
					id: '',
					createdAt: notification.createdAt,
					noteId: prev.noteId,
					userIds: [prev.notifierId],
				};
				prevGroupedNotification = groupedNotifications.at(-1)!;
			}
			if (prevGroupedNotification.type === 'renote:grouped') {
				prevGroupedNotification.userIds.push(notification.notifierId);
			}
			prevGroupedNotification.id = notification.id;
			continue;
		}

		groupedNotifications.push(notification);
	}

	return groupedNotifications;
}

export async function handleHonoApiINotificationsGrouped(
	deps: HonoApiNotificationsListDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
	const params = parseHonoApiParams(notificationsParamDef, body) as NotificationsParams;
	const untilId = params.untilId ?? (params.untilDate ? genId(deps.config, params.untilDate) : undefined);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(deps.config, params.sinceDate) : undefined);

	if (params.includeTypes && params.includeTypes.length === 0) return [];
	if (notificationTypes.every(type => params.excludeTypes?.includes(type))) return [];

	const includeTypes = params.includeTypes?.filter(type => !(obsoleteNotificationTypes as readonly string[]).includes(type));
	const excludeTypes = params.excludeTypes?.filter(type => !(obsoleteNotificationTypes as readonly string[]).includes(type));

	const notifications = await getHonoApiNotifications(deps, me.id, {
		sinceId,
		untilId,
		limit: params.limit,
		includeTypes,
		excludeTypes,
	});

	if (notifications.length === 0) return [];

	if (params.markAsRead) {
		void markAllHonoApiNotificationsAsRead(deps, me.id, false);
	}

	const groupedNotifications = groupHonoApiNotifications(notifications).slice(0, params.limit);

	return await packNotificationsForHonoApi(deps, groupedNotifications, me.id);
}
