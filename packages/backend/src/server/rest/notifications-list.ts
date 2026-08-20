/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listChatRoomInvitationsByIdsFromDatabase } from '@/core/ChatRoomStore.js';
import { listFollowRequestsByFollowerIdsFromDatabase } from '@/core/FollowRequestStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchRoleByIdFromDatabase, listRolesByIdsFromDatabase } from '@/core/RoleStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import { listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { omitUndefined } from '@/misc/clone.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiGroupedNotification, MiNotification } from '@/models/Notification.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { notificationTypes, obsoleteNotificationTypes } from '@/types.js';
import {
	packChatRoomInvitationForHonoApi,
	packChatRoomInvitationsForHonoApi,
	type HonoApiChatDependencies,
} from './chat.js';
import {
	packNoteForHonoApi,
	packNoteManyForHonoApi,
	type HonoApiNoteDependencies,
	type PackNoteBatchHint,
} from './note.js';
import { packHonoApiRole, packHonoApiRoles, type HonoApiRoleDependencies } from './roles.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi } from './user.js';
import { parseHonoApiParams } from './validation.js';
import {
	markAllHonoApiNotificationsAsRead,
	resolveNotificationStreamId,
	type HonoApiNotificationDependencies,
} from './notification.js';

export type HonoApiNotificationsListDependencies = HonoApiNoteDependencies &
	HonoApiChatDependencies &
	HonoApiRoleDependencies &
	HonoApiNotificationDependencies;

const NOTE_REQUIRED_NOTIFICATION_TYPES = new Set([
	'note',
	'mention',
	'reply',
	'renote',
	'renote:grouped',
	'quote',
	'reaction',
	'reaction:grouped',
	'pollEnded',
	'scheduledNotePosted',
]);

async function getHonoApiNotifications(
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
	let [sinceTime, untilTime] = await Promise.all([
		options.sinceId ? resolveNotificationStreamId(deps, userId, options.sinceId) : null,
		options.untilId ? resolveNotificationStreamId(deps, userId, options.untilId) : null,
	]);
	const includeTypeSet = options.includeTypes && options.includeTypes.length > 0 ? new Set(options.includeTypes) : null;
	const excludeTypeSet = options.excludeTypes && options.excludeTypes.length > 0 ? new Set(options.excludeTypes) : null;

	let notifications: MiNotification[];
	for (;;) {
		let notificationsRes: [id: string, fields: string[]][];

		if (sinceTime && !untilTime) {
			notificationsRes = await deps.redis.xrange(
				`notificationTimeline:${userId}`,
				'(' + sinceTime,
				'+',
				'COUNT',
				limit,
			);
		} else {
			notificationsRes = await deps.redis.xrevrange(
				`notificationTimeline:${userId}`,
				untilTime ? '(' + untilTime : '+',
				sinceTime ? '(' + sinceTime : '-',
				'COUNT',
				limit,
			);
		}

		if (notificationsRes.length === 0) return [];

		notifications = notificationsRes.flatMap(([, fields]) => {
			const data = fields[1];
			return data == null ? [] : [JSON.parse(data) as MiNotification];
		});

		if (includeTypeSet != null) {
			notifications = notifications.filter((n) => includeTypeSet.has(n.type));
		} else if (excludeTypeSet != null) {
			notifications = notifications.filter((n) => !excludeTypeSet.has(n.type));
		}

		if (notifications.length !== 0) break;
		const lastEntry = notificationsRes.at(-1);
		if (lastEntry == null) return [];

		if (options.sinceId && !options.untilId) {
			sinceTime = lastEntry[0];
		} else {
			untilTime = lastEntry[0];
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

	const notifierIds = [
		...new Set(
			notifications.map((n) => ('notifierId' in n ? n.notifierId : null)).filter((x): x is string => x != null),
		),
	];
	const notifiers =
		notifierIds.length > 0 ? await listUsersByIdsFromDatabase(deps.db, notifierIds, { includeSuspended: true }) : [];
	const notifierById = new Map(notifiers.map((notifier) => [notifier.id, notifier]));

	return notifications.filter((notification) => {
		if (!('notifierId' in notification)) return true;
		if (mutingSet.has(notification.notifierId)) return false;

		const notifier = notifierById.get(notification.notifierId) ?? null;
		if (notifier == null) return false;
		if (notifier.host && userMutedInstances.has(notifier.host)) return false;
		if (notifier.isSuspended) return false;

		return true;
	});
}

export async function packNotificationForHonoApi<T extends MiNotification | MiGroupedNotification>(
	deps: HonoApiNotificationsListDependencies,
	src: T,
	meId: MiUser['id'],
	options: { checkValidNotifier?: boolean },
	hint?: {
		packedNotes?: Map<MiNote['id'], Packed<'Note'>>;
		noteSources?: Map<MiNote['id'], MiNote>;
		notePackHint?: PackNoteBatchHint;
		packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
		packedRoles?: Map<string, Packed<'Role'>>;
		packedChatRoomInvitations?: Map<string, Packed<'ChatRoomInvitation'>>;
	},
): Promise<Record<string, unknown> | null> {
	if (options.checkValidNotifier !== false) {
		const filtered = await filterValidNotifiersForHonoApi(deps, [src], meId);
		if (filtered.length === 0) return null;
	}

	const needsNote = NOTE_REQUIRED_NOTIFICATION_TYPES.has(src.type) && 'noteId' in src;
	const noteId = needsNote ? (src as { noteId: string }).noteId : null;
	const noteIfNeed = needsNote
		? hint?.packedNotes != null
			? hint.packedNotes.get(noteId!)
			: await packNoteForHonoApi(
					deps,
					hint?.noteSources?.get(noteId!) ?? noteId!,
					{ id: meId },
					omitUndefined({ detail: true, hint: hint?.notePackHint }),
				).catch(() => null)
		: undefined;
	if (needsNote && !noteIfNeed) return null;

	const needsUser = 'notifierId' in src;
	const userIfNeed = needsUser
		? hint?.packedUsers != null
			? hint.packedUsers.get((src as { notifierId: string }).notifierId)
			: await packUserLiteForHonoApi(deps, (src as { notifierId: string }).notifierId).catch(() => null)
		: undefined;
	if (needsUser && !userIfNeed) return null;

	if (src.type === 'reaction:grouped') {
		const reactions = (
			await Promise.all(
				src.reactions.map(async (reaction) => {
					const user =
						hint?.packedUsers?.get(reaction.userId) ??
						(await packUserLiteForHonoApi(deps, reaction.userId).catch(() => null));
					return user ? { user, reaction: reaction.reaction } : null;
				}),
			)
		).filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r != null);
		if (reactions.length === 0) return null;

		return { id: src.id, createdAt: src.createdAt, type: src.type, note: noteIfNeed, reactions };
	} else if (src.type === 'renote:grouped') {
		const users = (
			await Promise.all(
				src.userIds.map(
					(userId) => hint?.packedUsers?.get(userId) ?? packUserLiteForHonoApi(deps, userId).catch(() => null),
				),
			)
		).filter((u): u is Packed<'UserLite'> => u != null);
		if (users.length === 0) return null;

		return { id: src.id, createdAt: src.createdAt, type: src.type, note: noteIfNeed, users };
	}

	const needsRole = src.type === 'roleAssigned';
	const role = needsRole
		? hint?.packedRoles != null
			? hint.packedRoles.get(src.roleId)
			: await fetchRoleByIdFromDatabase(deps.db, src.roleId).then((r) => (r ? packHonoApiRole(deps, r) : null))
		: undefined;
	if (needsRole && !role) return null;

	const needsChatRoomInvitation = src.type === 'chatRoomInvitationReceived';
	const chatRoomInvitation = needsChatRoomInvitation
		? hint?.packedChatRoomInvitations != null
			? hint.packedChatRoomInvitations.get(src.invitationId)
			: await packChatRoomInvitationForHonoApi(deps, src.invitationId, { id: meId }).catch(() => null)
		: undefined;
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

async function packNotificationsForHonoApi<T extends MiNotification | MiGroupedNotification>(
	deps: HonoApiNotificationsListDependencies,
	notifications: T[],
	meId: MiUser['id'],
): Promise<Record<string, unknown>[]> {
	if (notifications.length === 0) return [];

	let validNotifications = await filterValidNotifiersForHonoApi(deps, notifications, meId);

	const noteIds = validNotifications
		.map((x) => ('noteId' in x ? x.noteId : null))
		.filter((x): x is string => x != null);
	const notes = noteIds.length > 0 ? await listNotesByIdsFromDatabase(deps.db, noteIds) : [];
	const packedNotesArray = await packNoteManyForHonoApi(deps, notes, { id: meId }, { detail: true });
	const packedNotes = new Map(packedNotesArray.map((p) => [p.id, p]));

	validNotifications = validNotifications.filter((x) => !('noteId' in x) || packedNotes.has(x.noteId));

	const userIds: string[] = [];
	for (const notification of validNotifications) {
		if ('notifierId' in notification) userIds.push(notification.notifierId);
		if (notification.type === 'reaction:grouped') userIds.push(...notification.reactions.map((x) => x.userId));
		if (notification.type === 'renote:grouped') userIds.push(...notification.userIds);
	}
	const packedUsersArray = userIds.length > 0 ? await packUserLiteManyForHonoApi(deps, [...new Set(userIds)]) : [];
	const packedUsers = new Map(packedUsersArray.map((p) => [p.id, p]));

	const roleIds = validNotifications
		.map((x) => (x.type === 'roleAssigned' ? x.roleId : null))
		.filter((id): id is string => id != null);
	const roles = roleIds.length > 0 ? await listRolesByIdsFromDatabase(deps.db, [...new Set(roleIds)]) : [];
	const packedRolesArray = await packHonoApiRoles(deps, roles);
	const packedRoles = new Map(packedRolesArray.map((role) => [role.id, role]));

	const chatRoomInvitationIds = validNotifications
		.map((x) => (x.type === 'chatRoomInvitationReceived' ? x.invitationId : null))
		.filter((id): id is string => id != null);
	const chatRoomInvitations =
		chatRoomInvitationIds.length > 0
			? await listChatRoomInvitationsByIdsFromDatabase(deps.db, [...new Set(chatRoomInvitationIds)])
			: [];
	const packedChatRoomInvitationArray = await packChatRoomInvitationsForHonoApi(deps, chatRoomInvitations, {
		id: meId,
	});
	const packedChatRoomInvitations = new Map(
		packedChatRoomInvitationArray.map((invitation) => [invitation.id, invitation]),
	);

	const followRequestNotifications = validNotifications.filter(
		(x): x is T & { type: 'receiveFollowRequest'; notifierId: string } => x.type === 'receiveFollowRequest',
	);
	if (followRequestNotifications.length > 0) {
		const reqs = await listFollowRequestsByFollowerIdsFromDatabase(
			deps.db,
			followRequestNotifications.map((x) => x.notifierId),
		);
		const followerIdsWithRequest = new Set(reqs.map((req) => req.followerId));
		validNotifications = validNotifications.filter(
			(x) => x.type !== 'receiveFollowRequest' || followerIdsWithRequest.has((x as { notifierId: string }).notifierId),
		);
	}

	const packed = await Promise.all(
		validNotifications.map((x) =>
			packNotificationForHonoApi(
				deps,
				x,
				meId,
				{ checkValidNotifier: false },
				{ packedNotes, packedUsers, packedRoles, packedChatRoomInvitations },
			),
		),
	);

	return packed.filter((x): x is Record<string, unknown> => x != null);
}

const notificationTypeEnumValues = [...notificationTypes, ...obsoleteNotificationTypes] as const;

export const notificationsParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	markAsRead: z.boolean().optional().default(true),
	includeTypes: z.array(z.enum(notificationTypeEnumValues)).optional(),
	excludeTypes: z.array(z.enum(notificationTypeEnumValues)).optional(),
});

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
	const params = parseHonoApiParams(notificationsParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : undefined);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : undefined);

	if (params.includeTypes?.length === 0) return [];
	if (notificationTypes.every((type) => params.excludeTypes?.includes(type))) return [];

	const includeTypes = params.includeTypes?.filter(
		(type) => !(obsoleteNotificationTypes as readonly string[]).includes(type),
	);
	const excludeTypes = params.excludeTypes?.filter(
		(type) => !(obsoleteNotificationTypes as readonly string[]).includes(type),
	);

	const notifications = await getHonoApiNotifications(
		deps,
		me.id,
		omitUndefined({
			sinceId,
			untilId,
			limit: params.limit,
			includeTypes,
			excludeTypes,
		}),
	);

	if (params.markAsRead) {
		void markAllHonoApiNotificationsAsRead(deps, me.id, false);
	}

	return await packNotificationsForHonoApi(deps, notifications, me.id);
}

function groupHonoApiNotifications(notifications: MiNotification[]): MiGroupedNotification[] {
	const firstNotification = notifications[0];
	if (firstNotification == null) return [];
	const groupedNotifications: MiGroupedNotification[] = [firstNotification];
	for (let i = 1; i < notifications.length; i++) {
		const notification = notifications[i];
		const prev = notifications[i - 1];
		let prevGroupedNotification = groupedNotifications.at(-1);
		if (notification == null || prev == null || prevGroupedNotification == null) continue;

		if (prev.type === 'reaction' && notification.type === 'reaction' && prev.noteId === notification.noteId) {
			if (prevGroupedNotification.type !== 'reaction:grouped') {
				groupedNotifications[groupedNotifications.length - 1] = {
					type: 'reaction:grouped',
					id: '',
					createdAt: prev.createdAt,
					noteId: prev.noteId,
					reactions: [{ userId: prev.notifierId, reaction: prev.reaction }],
				};
				prevGroupedNotification = groupedNotifications.at(-1);
				if (prevGroupedNotification == null) continue;
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
				prevGroupedNotification = groupedNotifications.at(-1);
				if (prevGroupedNotification == null) continue;
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
	const params = parseHonoApiParams(notificationsParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : undefined);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : undefined);

	if (params.includeTypes?.length === 0) return [];
	if (notificationTypes.every((type) => params.excludeTypes?.includes(type))) return [];

	const includeTypes = params.includeTypes?.filter(
		(type) => !(obsoleteNotificationTypes as readonly string[]).includes(type),
	);
	const excludeTypes = params.excludeTypes?.filter(
		(type) => !(obsoleteNotificationTypes as readonly string[]).includes(type),
	);

	const notifications = await getHonoApiNotifications(
		deps,
		me.id,
		omitUndefined({
			sinceId,
			untilId,
			limit: params.limit,
			includeTypes,
			excludeTypes,
		}),
	);

	if (notifications.length === 0) return [];

	if (params.markAsRead) {
		void markAllHonoApiNotificationsAsRead(deps, me.id, false);
	}

	const groupedNotifications = groupHonoApiNotifications(notifications).slice(0, params.limit);

	return await packNotificationsForHonoApi(deps, groupedNotifications, me.id);
}
