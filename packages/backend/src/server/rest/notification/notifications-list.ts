/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { listChatRoomInvitationsByIdsFromDatabase } from '@/core/chat/chat-room-store.js';
import { listFollowRequestsByFollowerIdsFromDatabase } from '@/core/user/follow-request-store.js';
import { listNotesByIdsFromDatabase } from '@/core/note/note-store.js';
import { listRolesByIdsFromDatabase } from '@/core/role/role-store.js';
import { omitUndefined } from '@/misc/clone.js';
import { paginationParams } from '@/misc/zod-params.js';
import type { MiGroupedNotification, MiNotification } from '@/models/Notification.js';
import type { MiUser } from '@/models/User.js';
import { notificationTypes, obsoleteNotificationTypes } from '@/types.js';
import { packChatRoomInvitations } from '../chat/chat.js';
import { packNoteMany } from '../note/note.js';
import { packApiRoles } from '../role/roles.js';
import { packUserLiteMany } from '../../../core/user/user-packing.js';
import { toXListId } from '../../../core/notification/notification.js';
import { markAllApiNotificationsAsRead, resolveNotificationStreamId } from './notification.js';
import { genId } from '@/misc/id/gen-id.js';
import type { NotificationsListDependencies } from '@/core/notification/notification-packing.js';
import { filterValidNotifiers, packNotification } from '@/core/notification/notification-packing.js';

const currentNotificationTypes: ReadonlySet<string> = new Set(notificationTypes);

async function fetchApiNotifications(
	deps: NotificationsListDependencies,
	userId: MiUser['id'],
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
		limit?: number;
		includeTypes?: string[];
		excludeTypes?: string[];
	},
): Promise<MiNotification[]> {
	const limit = options.limit ?? 20;
	// 日時の境界はストリーム上の位置へ直接変換する。日時から作った ID はストリームに存在しないので、
	// ID として引くと遅延通知用の全件探索 (ストリーム全体の読み出しと JSON 解析) に必ず落ちる。
	let [sinceTime, untilTime] = await Promise.all([
		options.sinceId
			? resolveNotificationStreamId(deps, userId, options.sinceId)
			: options.sinceDate
				? toXListId(genId(options.sinceDate))
				: null,
		options.untilId
			? resolveNotificationStreamId(deps, userId, options.untilId)
			: options.untilDate
				? toXListId(genId(options.untilDate))
				: null,
	]);
	const ascending = sinceTime != null && untilTime == null;
	const includeTypeSet = options.includeTypes && options.includeTypes.length > 0 ? new Set(options.includeTypes) : null;
	const excludeTypeSet = options.excludeTypes && options.excludeTypes.length > 0 ? new Set(options.excludeTypes) : null;

	let notifications: MiNotification[];
	for (;;) {
		let notificationsRes: [id: string, fields: string[]][];

		if (ascending) {
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

		if (notificationsRes.length === 0) {
			return [];
		}

		notifications = notificationsRes.flatMap(([, fields]) => {
			const data = fields[1];
			if (data == null) return [];
			const notification = JSON.parse(data) as MiNotification;
			// 廃止した種別の通知は保存期間が過ぎるまで Redis に残るので、読み出し時に除く。
			return currentNotificationTypes.has(notification.type) ? [notification] : [];
		});

		if (includeTypeSet != null) {
			notifications = notifications.filter((n) => includeTypeSet.has(n.type));
		} else if (excludeTypeSet != null) {
			notifications = notifications.filter((n) => !excludeTypeSet.has(n.type));
		}

		if (notifications.length !== 0) {
			break;
		}
		const lastEntry = notificationsRes.at(-1);
		if (lastEntry == null) {
			return [];
		}

		if (ascending) {
			sinceTime = lastEntry[0];
		} else {
			untilTime = lastEntry[0];
		}
	}

	return notifications;
}

async function packNotifications<T extends MiNotification | MiGroupedNotification>(
	deps: NotificationsListDependencies,
	notifications: T[],
	meId: MiUser['id'],
): Promise<Record<string, unknown>[]> {
	if (notifications.length === 0) {
		return [];
	}

	const filtered = await filterValidNotifiers(deps, notifications, meId);
	let validNotifications = filtered.notifications;

	const noteIds = validNotifications
		.map((x) => ('noteId' in x ? x.noteId : null))
		.filter((x): x is string => x != null);
	const notes = noteIds.length > 0 ? await listNotesByIdsFromDatabase(deps.db, noteIds) : [];
	const packedNotesArray = await packNoteMany(deps, notes, { id: meId }, { detail: true });
	const packedNotes = new Map(packedNotesArray.map((p) => [p.id, p]));

	validNotifications = validNotifications.filter((x) => !('noteId' in x) || packedNotes.has(x.noteId));

	const userIds: string[] = [];
	for (const notification of validNotifications) {
		if ('notifierId' in notification) {
			userIds.push(notification.notifierId);
		}
		if (notification.type === 'reaction:grouped') {
			userIds.push(...notification.reactions.map((x) => x.userId));
		}
		if (notification.type === 'renote:grouped') {
			userIds.push(...notification.userIds);
		}
	}
	const packedUsersArray =
		userIds.length > 0
			? await packUserLiteMany(
					deps,
					[...new Set(userIds)].map((id) => filtered.notifiers.get(id) ?? id),
				)
			: [];
	const packedUsers = new Map(packedUsersArray.map((p) => [p.id, p]));

	const roleIds = validNotifications
		.map((x) => (x.type === 'roleAssigned' ? x.roleId : null))
		.filter((id): id is string => id != null);
	const roles = roleIds.length > 0 ? await listRolesByIdsFromDatabase(deps.db, [...new Set(roleIds)]) : [];
	const packedRolesArray = await packApiRoles(deps, roles);
	const packedRoles = new Map(packedRolesArray.map((role) => [role.id, role]));

	const chatRoomInvitationIds = validNotifications
		.map((x) => (x.type === 'chatRoomInvitationReceived' ? x.invitationId : null))
		.filter((id): id is string => id != null);
	const chatRoomInvitations =
		chatRoomInvitationIds.length > 0
			? await listChatRoomInvitationsByIdsFromDatabase(deps.db, [...new Set(chatRoomInvitationIds)])
			: [];
	const packedChatRoomInvitationArray = await packChatRoomInvitations(deps, chatRoomInvitations, {
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
			packNotification(
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

// 後段の除外 (ミュート・凍結・見られないノート・取り下げられたフォロー申請) は通知を作ったあとの状況で決まるので、
// 1 ページが全件落ちることがある。空を返すとクライアントが終端とみなし、その先の見られる通知が表示されなくなるため、
// 可視性判定は MAX_SCANNED_PAGES ページまでに抑える。種別で全件除外されたページの走査はこの上限に含まれない。
const MAX_SCANNED_PAGES = 10;

async function fetchVisibleNotificationPage(
	deps: NotificationsListDependencies,
	meId: MiUser['id'],
	options: {
		sinceId?: string | undefined;
		untilId?: string | undefined;
		sinceDate?: number | undefined;
		untilDate?: number | undefined;
		limit: number;
		includeTypes?: string[] | undefined;
		excludeTypes?: string[] | undefined;
	},
	shape: (notifications: MiNotification[]) => (MiNotification | MiGroupedNotification)[],
): Promise<Record<string, unknown>[]> {
	// 日時の 0 は「指定なし」として扱う (他のエンドポイントの resolveApiDateIdBounds と同じ公開挙動)。
	let sinceId: string | null = options.sinceId ?? null;
	let untilId: string | null = options.untilId ?? null;
	let sinceDate = sinceId == null ? options.sinceDate || null : null;
	let untilDate = untilId == null ? options.untilDate || null : null;
	const ascending = (sinceId != null || sinceDate != null) && untilId == null && untilDate == null;
	for (let page = 0; page < MAX_SCANNED_PAGES; page++) {
		const notifications = await fetchApiNotifications(
			deps,
			meId,
			omitUndefined({
				sinceId,
				untilId,
				sinceDate,
				untilDate,
				limit: options.limit,
				includeTypes: options.includeTypes,
				excludeTypes: options.excludeTypes,
			}),
		);
		const last = notifications.at(-1);
		if (last == null) return [];
		const packed = await packNotifications(deps, shape(notifications), meId);
		if (packed.length > 0) return packed;
		if (ascending) {
			sinceId = last.id;
			sinceDate = null;
		} else {
			untilId = last.id;
			untilDate = null;
		}
	}
	return [];
}

const notificationTypeEnumValues = [...notificationTypes, ...obsoleteNotificationTypes] as const;

export const notificationsParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	markAsRead: z.boolean().optional().default(true),
	includeTypes: z.array(z.enum(notificationTypeEnumValues)).optional(),
	excludeTypes: z.array(z.enum(notificationTypeEnumValues)).optional(),
});

async function listApiNotifications(
	deps: NotificationsListDependencies,
	me: MiUser,
	params: Params<typeof notificationsParamDef>,
	shape: (notifications: MiNotification[]) => (MiNotification | MiGroupedNotification)[],
): Promise<Record<string, unknown>[]> {
	if (params.includeTypes?.length === 0) {
		return [];
	}
	if (notificationTypes.every((type) => params.excludeTypes?.includes(type))) {
		return [];
	}

	const includeTypes = params.includeTypes?.filter(
		(type) => !(obsoleteNotificationTypes as readonly string[]).includes(type),
	);
	const excludeTypes = params.excludeTypes?.filter(
		(type) => !(obsoleteNotificationTypes as readonly string[]).includes(type),
	);

	if (params.markAsRead) {
		void markAllApiNotificationsAsRead(deps, me.id, false);
	}

	return await fetchVisibleNotificationPage(
		deps,
		me.id,
		{
			sinceId: params.sinceId,
			untilId: params.untilId,
			sinceDate: params.sinceDate,
			untilDate: params.untilDate,
			limit: params.limit,
			includeTypes,
			excludeTypes,
		},
		shape,
	);
}

export async function handleApiINotifications(
	deps: NotificationsListDependencies,
	me: MiUser,
	params: Params<typeof notificationsParamDef>,
): Promise<Record<string, unknown>[]> {
	return await listApiNotifications(deps, me, params, (notifications) => notifications);
}

function groupApiNotifications(notifications: MiNotification[]): MiGroupedNotification[] {
	const firstNotification = notifications[0];
	if (firstNotification == null) {
		return [];
	}
	const groupedNotifications: MiGroupedNotification[] = [firstNotification];
	for (let i = 1; i < notifications.length; i++) {
		const notification = notifications[i];
		const prev = notifications[i - 1];
		let prevGroupedNotification = groupedNotifications.at(-1);
		if (notification == null || prev == null || prevGroupedNotification == null) {
			continue;
		}

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
				if (prevGroupedNotification == null) {
					continue;
				}
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
				if (prevGroupedNotification == null) {
					continue;
				}
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

export async function handleApiINotificationsGrouped(
	deps: NotificationsListDependencies,
	me: MiUser,
	params: Params<typeof notificationsParamDef>,
): Promise<Record<string, unknown>[]> {
	return await listApiNotifications(deps, me, params, (notifications) =>
		groupApiNotifications(notifications).slice(0, params.limit),
	);
}
