/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listMuteeIdsByMuterIdFromDatabase } from '@/core/user/MutingStore.js';
import { fetchRoleByIdFromDatabase } from '@/core/role/RoleStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/UserProfileStore.js';
import { listUsersByIdsFromDatabase } from '@/core/user/UserStore.js';
import { omitUndefined } from '@/misc/clone.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiGroupedNotification, MiNotification } from '@/models/Notification.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { packChatRoomInvitation } from '../chat/chat-packing.js';
import type { ChatDependencies } from '../chat/chat-packing.js';
import { packNote } from '../note/note-packing.js';
import type { NoteDependencies, PackNoteBatchHint } from '../note/note-packing.js';
import { packRole } from '../role/role-packing.js';
import type { RoleDependencies } from '../role/role-packing.js';
import { packUserLite } from '../user/user-packing.js';
import type { NotificationDependencies } from './notification.js';

export type NotificationsListDependencies = NoteDependencies &
	ChatDependencies &
	RoleDependencies &
	NotificationDependencies;

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

export async function filterValidNotifiers<T extends MiNotification | MiGroupedNotification>(
	deps: NotificationsListDependencies,
	notifications: T[],
	meId: MiUser['id'],
): Promise<{ notifications: T[]; notifiers: Map<MiUser['id'], MiUser> }> {
	const [userIdsWhoMeMuting, profile] = await Promise.all([
		listMuteeIdsByMuterIdFromDatabase(deps.db, meId),
		fetchUserProfileByUserIdFromDatabase(deps.db, meId),
	]);
	const userMutedInstances = new Set(profile?.mutedInstances);
	const mutingSet = new Set(userIdsWhoMeMuting);

	const notifierIds = [
		...new Set(
			notifications.map((n) => ('notifierId' in n ? n.notifierId : null)).filter((x): x is string => x != null),
		),
	];
	const notifiers =
		notifierIds.length > 0 ? await listUsersByIdsFromDatabase(deps.db, notifierIds, { includeSuspended: true }) : [];
	const notifierById = new Map(notifiers.map((notifier) => [notifier.id, notifier]));

	const filtered = notifications.filter((notification) => {
		if (!('notifierId' in notification)) {
			return true;
		}
		if (mutingSet.has(notification.notifierId)) {
			return false;
		}

		const notifier = notifierById.get(notification.notifierId) ?? null;
		if (notifier == null) {
			return false;
		}
		if (notifier.host && userMutedInstances.has(notifier.host)) {
			return false;
		}
		if (notifier.isSuspended) {
			return false;
		}

		return true;
	});
	return { notifications: filtered, notifiers: notifierById };
}

export async function packNotification<T extends MiNotification | MiGroupedNotification>(
	deps: NotificationsListDependencies,
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
		const { notifications: filtered } = await filterValidNotifiers(deps, [src], meId);
		if (filtered.length === 0) {
			return null;
		}
	}

	const needsNote = NOTE_REQUIRED_NOTIFICATION_TYPES.has(src.type) && 'noteId' in src;
	const noteId = needsNote ? (src as { noteId: string }).noteId : null;
	const noteIfNeed = needsNote
		? hint?.packedNotes != null
			? hint.packedNotes.get(noteId!)
			: await packNote(
					deps,
					hint?.noteSources?.get(noteId!) ?? noteId!,
					{ id: meId },
					omitUndefined({ detail: true, hint: hint?.notePackHint }),
				).catch(() => null)
		: undefined;
	if (needsNote && !noteIfNeed) {
		return null;
	}

	const needsUser = 'notifierId' in src;
	const userIfNeed = needsUser
		? hint?.packedUsers != null
			? hint.packedUsers.get((src as { notifierId: string }).notifierId)
			: await packUserLite(deps, (src as { notifierId: string }).notifierId).catch(() => null)
		: undefined;
	if (needsUser && !userIfNeed) {
		return null;
	}

	if (src.type === 'reaction:grouped') {
		const reactions = (
			await Promise.all(
				src.reactions.map(async (reaction) => {
					const user =
						hint?.packedUsers?.get(reaction.userId) ?? (await packUserLite(deps, reaction.userId).catch(() => null));
					return user ? { user, reaction: reaction.reaction } : null;
				}),
			)
		).filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r != null);
		if (reactions.length === 0) {
			return null;
		}

		return { id: src.id, createdAt: src.createdAt, type: src.type, note: noteIfNeed, reactions };
	} else if (src.type === 'renote:grouped') {
		const users = (
			await Promise.all(
				src.userIds.map((userId) => hint?.packedUsers?.get(userId) ?? packUserLite(deps, userId).catch(() => null)),
			)
		).filter((u): u is Packed<'UserLite'> => u != null);
		if (users.length === 0) {
			return null;
		}

		return { id: src.id, createdAt: src.createdAt, type: src.type, note: noteIfNeed, users };
	}

	const needsRole = src.type === 'roleAssigned';
	const role = needsRole
		? hint?.packedRoles != null
			? hint.packedRoles.get(src.roleId)
			: await fetchRoleByIdFromDatabase(deps.db, src.roleId).then((r) => (r ? packRole(deps, r) : null))
		: undefined;
	if (needsRole && !role) {
		return null;
	}

	const needsChatRoomInvitation = src.type === 'chatRoomInvitationReceived';
	const chatRoomInvitation = needsChatRoomInvitation
		? hint?.packedChatRoomInvitations != null
			? hint.packedChatRoomInvitations.get(src.invitationId)
			: await packChatRoomInvitation(deps, src.invitationId, { id: meId }).catch(() => null)
		: undefined;
	if (needsChatRoomInvitation && !chatRoomInvitation) {
		return null;
	}

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
		...(src.type === 'exportCompleted' ? { exportedEntity: src.exportedEntity, fileId: src.fileId } : {}),
		...(src.type === 'app' ? { body: src.customBody, header: src.customHeader, icon: src.customIcon } : {}),
	};
}
