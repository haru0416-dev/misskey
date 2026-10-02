/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { blockingExistsInDatabase } from '@/core/user/blocking-store.js';
import { createChatApprovalInDatabase, listChatApprovalsBetweenUsers } from '@/core/chat/chat-approval-store.js';
import {
	addChatMessageReactionInDatabase,
	createChatMessageInDatabase,
	deleteChatMessageByIdFromDatabase,
	fetchChatMessageByIdAndFromUserIdFromDatabase,
	fetchChatMessageByIdFromDatabase,
	fetchChatMessageByIdOrFailFromDatabase,
	listChatMessagesBetweenUsersFromDatabase,
	listChatMessagesByRoomIdFromDatabase,
	listRoomChatHistoryFromDatabase,
	listUserChatHistoryFromDatabase,
	removeChatMessageReactionInDatabase,
	searchChatMessagesFromDatabase,
} from '@/core/chat/chat-message-store.js';
import {
	ChatRoomCapacityExceededError,
	ChatRoomInvitationConflictError,
	ChatRoomInvitationNotFoundError,
	createChatRoomInDatabase,
	createChatRoomInvitationInDatabase,
	deleteChatRoomByIdFromDatabase,
	deleteChatRoomMembershipByIdFromDatabase,
	fetchChatRoomByIdAndOwnerIdFromDatabase,
	fetchChatRoomByIdAndOwnerIdOrFailFromDatabase,
	fetchChatRoomByIdFromDatabase,
	fetchChatRoomByIdOrFailFromDatabase,
	fetchChatRoomInvitationFromDatabase,
	fetchChatRoomMembershipByIdOrFailFromDatabase,
	fetchChatRoomMembershipFromDatabase,
	joinChatRoomFromInvitationInDatabase,
	listChatRoomInvitationsByRoomIdFromDatabase,
	listChatRoomInvitationsByRoomIdsAndUserIdFromDatabase,
	listChatRoomInvitationsByUserIdFromDatabase,
	listChatRoomMembershipsByRoomIdFromDatabase,
	listChatRoomMembershipsByRoomIdsAndUserIdFromDatabase,
	listChatRoomMembershipsByUserIdFromDatabase,
	listChatRoomsByIdsFromDatabase,
	listChatRoomsByOwnerIdFromDatabase,
	updateChatRoomInDatabase,
	updateChatRoomInvitationIgnoredInDatabase,
	updateChatRoomMembershipMuteInDatabase,
} from '@/core/chat/chat-room-store.js';
import { fetchDriveFileByIdAndUserIdFromDatabase } from '@/core/drive/drive-file-store.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/emoji/emoji-store.js';
import {
	followingExistsInDatabase,
	countMutualFollowingsBetweenUsersFromDatabase,
} from '@/core/user/following-store.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { mutingExistsInDatabase } from '@/core/user/muting-store.js';
import { logModerationEventInDatabase } from '@/core/moderation/moderation-log-logic.js';
import {
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	listUsersByIdsFromDatabase,
} from '@/core/user/user-store.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/user-profile-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { omitUndefined } from '@/misc/clone.js';
import { parseId } from '@/misc/id/parse-id.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiChatMessage } from '@/models/ChatMessage.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { ChatRoomInvitationRow } from '@/db/schema/chat-room-invitation.js';
import type { ChatRoomMembershipRow } from '@/db/schema/chat-room-membership.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { xaddNotification } from '../../../core/notification/notification.js';
import { ApiError, invalidParamError } from '../error.js';
import { packDriveFile, packDriveFileManyByIds } from '../../../core/drive/drive-file-packing.js';
import { packUserLite, packUserLiteMany } from '../../../core/user/user-packing.js';
import { fetchRolePolicies, userIsModerator } from '../../../core/role/role-policy.js';
import { pushSwNotification } from '../../../core/notification/push-notification.js';
import { resolveApiDateIdBounds } from '../date-id-pagination.js';
import { resolveDateIdPagination, resolveIdPagination } from '@/misc/id-pagination.js';
import type {
	ChatDependencies,
	ChatRoomInvitationPackable,
	ChatRoomMembershipPackable,
} from '@/core/chat/chat-packing.js';
import { packChatRoom, packChatRoomInvitation } from '@/core/chat/chat-packing.js';

const MAX_ROOM_MEMBERS = 50;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

function normalizeEmojiString(x: string): string {
	const match = emojiRegex.exec(x);
	if (match) {
		const unicode = match[0];

		return unicode.match('\u200D') ? unicode : unicode.replaceAll('️', '');
	}
	throw invalidParamError({ param: 'reaction', reason: 'invalid emoji' });
}

async function packChatMessageUsers(
	deps: ChatDependencies,
	messages: MiChatMessage[],
	packedUserHint?: Map<MiUser['id'], Packed<'UserLite'>>,
	missingUserIdHint?: Set<MiUser['id']>,
): Promise<{ packedUsers: Map<MiUser['id'], Packed<'UserLite'>>; missingUserIds: Set<MiUser['id']> }> {
	const explicitUsers = new Map<MiUser['id'], MiUser>();
	const requiredUserIds = new Set<MiUser['id']>();
	const reactionUserIds = new Set<MiUser['id']>();
	const packedUsers = new Map(packedUserHint);
	const missingUserIds = new Set(missingUserIdHint);

	for (const message of messages) {
		for (const src of [message.fromUser ?? message.fromUserId, message.toUser ?? message.toUserId]) {
			if (src == null) {
				continue;
			}
			if (typeof src === 'object') {
				explicitUsers.set(src.id, src);
				missingUserIds.delete(src.id);
			} else {
				requiredUserIds.add(src);
			}
		}
		for (const record of message.reactions) {
			reactionUserIds.add(record.split('/')[0]!);
		}
	}

	const idsToFetch = [...new Set([...requiredUserIds, ...reactionUserIds])].filter(
		(id) => !explicitUsers.has(id) && !packedUsers.has(id) && !missingUserIds.has(id),
	);
	const fetchedUsers = await listUsersByIdsFromDatabase(deps.db, idsToFetch, { includeSuspended: true });
	const userById = new Map([...explicitUsers.values(), ...fetchedUsers].map((user) => [user.id, user]));
	const missingRequiredUserId = [...requiredUserIds].find((id) => !userById.has(id) && !packedUsers.has(id));
	if (missingRequiredUserId != null) {
		throw new EntityNotFoundError('MiUser', { id: missingRequiredUserId });
	}

	const newlyPackedUsers = await packUserLiteMany(
		deps,
		[...userById.values()].filter((user) => !packedUsers.has(user.id)),
	);
	for (const user of newlyPackedUsers) {
		packedUsers.set(user.id, user);
	}
	for (const userId of reactionUserIds) {
		if (!packedUsers.has(userId)) {
			missingUserIds.add(userId);
		}
	}
	return { packedUsers, missingUserIds };
}

export async function packChatMessageDetailed(
	deps: ChatDependencies,
	src: MiChatMessage['id'] | MiChatMessage,
	me?: { id: MiUser['id'] },
	options?: {
		_hint_?: {
			packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
			packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
			missingUserIds?: Set<MiUser['id']>;
			packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
		};
	},
): Promise<Packed<'ChatMessage'>> {
	const packedFiles = options?._hint_?.packedFiles;
	const packedRooms = options?._hint_?.packedRooms;

	const message = typeof src === 'object' ? src : await fetchChatMessageByIdOrFailFromDatabase(deps.db, src);
	const { packedUsers } = await packChatMessageUsers(
		deps,
		[message],
		options?._hint_?.packedUsers,
		options?._hint_?.missingUserIds,
	);

	const reactions: { user: Packed<'UserLite'> | null; reaction: string }[] = [];
	for (const record of message.reactions) {
		const [userId, reaction] = record.split('/') as [string, string];
		reactions.push({
			user: packedUsers.get(userId) ?? null,
			reaction,
		});
	}

	return {
		id: message.id,
		createdAt: parseId(message.id).date.toISOString(),
		text: message.text,
		fromUserId: message.fromUserId,
		fromUser:
			packedUsers?.get(message.fromUserId) ?? (await packUserLite(deps, message.fromUser ?? message.fromUserId)),
		toUserId: message.toUserId,
		toUser: message.toUserId
			? (packedUsers?.get(message.toUserId) ?? (await packUserLite(deps, message.toUser ?? message.toUserId)))
			: undefined,
		toRoomId: message.toRoomId,
		toRoom: message.toRoomId
			? (packedRooms?.get(message.toRoomId) ?? (await packChatRoom(deps, message.toRoom ?? message.toRoomId, me)))
			: undefined,
		fileId: message.fileId,
		file: message.fileId
			? (packedFiles?.get(message.fileId) ?? (await packDriveFile(deps, message.file ?? message.fileId)))
			: null,
		reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r.user != null),
	} as Packed<'ChatMessage'>;
}

export async function packChatMessagesDetailed(
	deps: ChatDependencies,
	messages: MiChatMessage[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatMessage'>[]> {
	if (messages.length === 0) {
		return [];
	}

	const [packedUserData, packedFiles, packedRooms] = await Promise.all([
		packChatMessageUsers(deps, messages),
		packDriveFileManyByIds(
			deps,
			messages.map((m) => m.fileId).filter((x): x is string => x != null),
		).then((files) => new Map(files.map((f) => [f.id, f as Packed<'DriveFile'> | null]))),
		packChatRooms(
			deps,
			messages.map((m) => m.toRoom ?? m.toRoomId).filter((x): x is MiChatRoom | string => x != null),
			me,
		).then((rooms) => new Map(rooms.map((r) => [r.id, r]))),
	]);

	return await Promise.all(
		messages.map((message) =>
			packChatMessageDetailed(deps, message, me, { _hint_: { ...packedUserData, packedFiles, packedRooms } }),
		),
	);
}

async function packChatMessageLiteFor1on1(
	deps: ChatDependencies,
	src: MiChatMessage['id'] | MiChatMessage,
	options?: { _hint_?: { packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null> } },
): Promise<Packed<'ChatMessageLiteFor1on1'>> {
	const packedFiles = options?._hint_?.packedFiles;
	const message = typeof src === 'object' ? src : await fetchChatMessageByIdOrFailFromDatabase(deps.db, src);

	const reactions: { reaction: string }[] = [];
	for (const record of message.reactions) {
		const [, reaction] = record.split('/') as [string, string];
		reactions.push({ reaction });
	}

	return {
		id: message.id,
		createdAt: parseId(message.id).date.toISOString(),
		text: message.text,
		fromUserId: message.fromUserId,
		toUserId: message.toUserId!,
		fileId: message.fileId,
		file: message.fileId
			? (packedFiles?.get(message.fileId) ?? (await packDriveFile(deps, message.file ?? message.fileId)))
			: null,
		reactions,
	} as Packed<'ChatMessageLiteFor1on1'>;
}

async function packChatMessagesLiteFor1on1(
	deps: ChatDependencies,
	messages: MiChatMessage[],
): Promise<Packed<'ChatMessageLiteFor1on1'>[]> {
	if (messages.length === 0) {
		return [];
	}

	const packedFiles = await packDriveFileManyByIds(
		deps,
		messages.map((m) => m.fileId).filter((x): x is string => x != null),
	).then((files) => new Map(files.map((f) => [f.id, f as Packed<'DriveFile'> | null])));

	return await Promise.all(
		messages.map((message) => packChatMessageLiteFor1on1(deps, message, { _hint_: { packedFiles } })),
	);
}

async function packChatMessageLiteForRoom(
	deps: ChatDependencies,
	src: MiChatMessage['id'] | MiChatMessage,
	options?: {
		_hint_?: {
			packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
			packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
		};
	},
): Promise<Packed<'ChatMessageLiteForRoom'>> {
	const packedFiles = options?._hint_?.packedFiles;
	const packedUsers = options?._hint_?.packedUsers;
	const message = typeof src === 'object' ? src : await fetchChatMessageByIdOrFailFromDatabase(deps.db, src);

	const reactions: { user: Packed<'UserLite'> | null; reaction: string }[] = [];
	for (const record of message.reactions) {
		const [userId, reaction] = record.split('/') as [string, string];
		reactions.push({
			user: packedUsers?.get(userId) ?? (await packUserLite(deps, userId).catch(() => null)),
			reaction,
		});
	}

	return {
		id: message.id,
		createdAt: parseId(message.id).date.toISOString(),
		text: message.text,
		fromUserId: message.fromUserId,
		fromUser:
			packedUsers?.get(message.fromUserId) ?? (await packUserLite(deps, message.fromUser ?? message.fromUserId)),
		toRoomId: message.toRoomId!,
		fileId: message.fileId,
		file: message.fileId
			? (packedFiles?.get(message.fileId) ?? (await packDriveFile(deps, message.file ?? message.fileId)))
			: null,
		reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r.user != null),
	} as Packed<'ChatMessageLiteForRoom'>;
}

async function packChatMessagesLiteForRoom(
	deps: ChatDependencies,
	messages: MiChatMessage[],
): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
	if (messages.length === 0) {
		return [];
	}

	const users = messages.map((x) => x.fromUser ?? x.fromUserId) as (MiUser | string)[];
	const userIdSet = new Set(users.map((x) => (typeof x === 'string' ? x : x.id)));
	const reactedUserIds = messages.flatMap((x) => x.reactions.map((r) => r.split('/')[0]!));
	for (const reactedUserId of reactedUserIds) {
		if (!userIdSet.has(reactedUserId)) {
			userIdSet.add(reactedUserId);
			users.push(reactedUserId);
		}
	}

	const [packedUsers, packedFiles] = await Promise.all([
		packUserLiteMany(deps, users).then((users) => new Map(users.map((u) => [u.id, u]))),
		packDriveFileManyByIds(
			deps,
			messages.map((m) => m.fileId).filter((x): x is string => x != null),
		).then((files) => new Map(files.map((f) => [f.id, f as Packed<'DriveFile'> | null]))),
	]);

	return await Promise.all(
		messages.map((message) => packChatMessageLiteForRoom(deps, message, { _hint_: { packedFiles, packedUsers } })),
	);
}

async function packChatRooms(
	deps: ChatDependencies,
	rooms: (MiChatRoom | MiChatRoom['id'])[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatRoom'>[]> {
	if (rooms.length === 0) {
		return [];
	}

	const explicitRooms = rooms.filter((room): room is MiChatRoom => typeof room !== 'string');
	const _rooms =
		explicitRooms.length !== rooms.length
			? [
					...explicitRooms,
					...(await listChatRoomsByIdsFromDatabase(
						deps.db,
						rooms.filter((room): room is string => typeof room === 'string'),
					)),
				]
			: explicitRooms;

	const owners = _rooms.map((x) => x.owner ?? x.ownerId);

	const [packedOwners, myMemberships, myInvitations] = await Promise.all([
		packUserLiteMany(deps, owners).then((users) => new Map(users.map((u) => [u.id, u]))),
		listChatRoomMembershipsByRoomIdsAndUserIdFromDatabase(
			deps.db,
			_rooms.map((x) => x.id),
			me.id,
		).then((memberships) => {
			const membershipByRoomId = new Map(memberships.map((membership) => [membership.roomId, membership]));
			return new Map(_rooms.map((room) => [room.id, membershipByRoomId.get(room.id) ?? null]));
		}),
		listChatRoomInvitationsByRoomIdsAndUserIdFromDatabase(
			deps.db,
			_rooms.map((x) => x.id),
			me.id,
		).then((invitations) => {
			const invitationByRoomId = new Map(invitations.map((invitation) => [invitation.roomId, invitation]));
			return new Map(_rooms.map((room) => [room.id, invitationByRoomId.get(room.id) ?? null]));
		}),
	]);

	return await Promise.all(
		_rooms.map((room) => packChatRoom(deps, room, me, { _hint_: { packedOwners, myMemberships, myInvitations } })),
	);
}

export async function packChatRoomInvitations(
	deps: ChatDependencies,
	invitations: ChatRoomInvitationPackable[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatRoomInvitation'>[]> {
	if (invitations.length === 0) {
		return [];
	}

	const [packedRooms, packedUsers] = await Promise.all([
		packChatRooms(
			deps,
			invitations.map((invitation) => invitation.room ?? invitation.roomId),
			me,
		).then((rooms) => new Map(rooms.map((room) => [room.id, room]))),
		packUserLiteMany(
			deps,
			invitations.map((invitation) => invitation.user ?? invitation.userId),
		).then((users) => new Map(users.map((user) => [user.id, user]))),
	]);

	return await Promise.all(
		invitations.map((invitation) =>
			packChatRoomInvitation(deps, invitation, me, { _hint_: { packedRooms, packedUsers } }),
		),
	);
}

async function packChatRoomMembership(
	deps: ChatDependencies,
	src: ChatRoomMembershipRow['id'] | ChatRoomMembershipPackable,
	me: { id: MiUser['id'] },
	options?: {
		populateUser?: boolean;
		populateRoom?: boolean;
		_hint_?: {
			packedRooms?: Map<ChatRoomMembershipRow['roomId'], Packed<'ChatRoom'>>;
			packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
		};
	},
): Promise<Packed<'ChatRoomMembership'>> {
	const membership: ChatRoomMembershipPackable =
		typeof src === 'object' ? src : await fetchChatRoomMembershipByIdOrFailFromDatabase(deps.db, src);

	return {
		id: membership.id,
		createdAt: parseId(membership.id).date.toISOString(),
		userId: membership.userId,
		user: options?.populateUser
			? (options._hint_?.packedUsers?.get(membership.userId) ??
				(await packUserLite(deps, membership.user ?? membership.userId)))
			: undefined,
		roomId: membership.roomId,
		room: options?.populateRoom
			? (options._hint_?.packedRooms?.get(membership.roomId) ??
				(await packChatRoom(deps, membership.room ?? membership.roomId, me)))
			: undefined,
	} as Packed<'ChatRoomMembership'>;
}

async function packChatRoomMemberships(
	deps: ChatDependencies,
	memberships: ChatRoomMembershipPackable[],
	me: { id: MiUser['id'] },
	options: { populateUser?: boolean; populateRoom?: boolean } = {},
): Promise<Packed<'ChatRoomMembership'>[]> {
	if (memberships.length === 0) {
		return [];
	}

	const [packedUsers, packedRooms] = await Promise.all([
		options.populateUser
			? packUserLiteMany(
					deps,
					memberships.map((x) => x.user ?? x.userId),
				).then((users) => new Map(users.map((u) => [u.id, u])))
			: Promise.resolve(undefined),
		options.populateRoom
			? packChatRooms(
					deps,
					memberships.map((x) => x.room ?? x.roomId),
					me,
				).then((rooms) => new Map(rooms.map((r) => [r.id, r])))
			: Promise.resolve(undefined),
	]);

	return await Promise.all(
		memberships.map((membership) =>
			packChatRoomMembership(deps, membership, me, {
				...options,
				_hint_: omitUndefined({ packedUsers, packedRooms }),
			}),
		),
	);
}

async function fetchChatAvailability(
	deps: ChatDependencies,
	userId: MiUser['id'],
): Promise<{ read: boolean; write: boolean }> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	const policies = await fetchRolePolicies(deps, user);

	switch (policies.chatAvailability) {
		case 'available':
			return { read: true, write: true };
		case 'readonly':
			return { read: true, write: false };
		case 'unavailable':
			return { read: false, write: false };
		default:
			throw new Error('invalid chat availability (unreachable)');
	}
}

export async function checkChatAvailability(
	deps: ChatDependencies,
	userId: MiUser['id'],
	permission: 'read' | 'write',
): Promise<void> {
	const policy = await fetchChatAvailability(deps, userId);
	if (policy[permission] === false) {
		throw new ApiError({
			status: 403,
			message: 'Role permission denied.',
			code: 'ROLE_PERMISSION_DENIED',
			id: 'c3d38592-54c0-429d-be96-5636b0431a61',
			kind: 'permission',
		});
	}
}

async function pushChatNotification(
	deps: ChatDependencies,
	userId: MiUser['id'],
	body: Packed<'ChatMessage'>,
): Promise<void> {
	await pushSwNotification(deps, userId, 'newChatMessage', body);
}

// notifierId を考慮したフィルタ (never/following/follower/mutualFollow/
// followingOrFollower と mute 判定) を DB から直接読み、現在の関係で通知可否を判定する。
async function createChatRoomInvitationNotification(
	deps: ChatDependencies,
	notifieeId: MiUser['id'],
	invitationId: string,
	notifierId: MiUser['id'],
): Promise<void> {
	if (notifieeId === notifierId) {
		return;
	}

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, notifieeId);
	const receiveConfig = (profile?.notificationRecieveConfig ?? {}).chatRoomInvitationReceived;
	if (receiveConfig?.type === 'never') {
		return;
	}

	const muted = await mutingExistsInDatabase(deps.db, notifieeId, notifierId);
	if (muted) {
		return;
	}

	if (receiveConfig?.type === 'following') {
		if (!(await followingExistsInDatabase(deps.db, notifieeId, notifierId))) {
			return;
		}
	} else if (receiveConfig?.type === 'follower') {
		if (!(await followingExistsInDatabase(deps.db, notifierId, notifieeId))) {
			return;
		}
	} else if (receiveConfig?.type === 'mutualFollow') {
		const count = await countMutualFollowingsBetweenUsersFromDatabase(deps.db, notifieeId, notifierId);
		if (count !== 2) {
			return;
		}
	} else if (receiveConfig?.type === 'followingOrFollower') {
		const [isFollowing, isFollower] = await Promise.all([
			followingExistsInDatabase(deps.db, notifieeId, notifierId),
			followingExistsInDatabase(deps.db, notifierId, notifieeId),
		]);
		if (!isFollowing && !isFollower) {
			return;
		}
	}

	const notification = {
		id: genId(),
		createdAt: new Date().toISOString(),
		type: 'chatRoomInvitationReceived',
		notifierId,
		invitationId,
	};
	await xaddNotification(deps, notifieeId, notification);

	deps.publishMainStream?.(notifieeId, 'notification', notification);
	void pushSwNotification(deps, notifieeId, 'notification', notification);
}

async function createChatMessageToUser(
	deps: ChatDependencies,
	fromUser: { id: MiUser['id']; host: MiUser['host'] },
	toUser: MiUser,
	params: { text?: string | null; file?: MiDriveFile | null; uri?: string | null },
): Promise<Packed<'ChatMessageLiteFor1on1'>> {
	if (fromUser.id === toUser.id) {
		throw new Error('yourself');
	}

	const approvals = await listChatApprovalsBetweenUsers(deps.db, fromUser.id, toUser.id);
	const otherApprovedMe = approvals.some((approval) => approval.userId === toUser.id);
	const iApprovedOther = approvals.some((approval) => approval.userId === fromUser.id);

	if (!otherApprovedMe) {
		if (toUser.chatScope === 'none') {
			throw chatNotAvailableError();
		} else if (toUser.chatScope === 'followers') {
			if (!(await followingExistsInDatabase(deps.db, fromUser.id, toUser.id))) {
				throw chatNotAvailableError();
			}
		} else if (toUser.chatScope === 'following') {
			if (!(await followingExistsInDatabase(deps.db, toUser.id, fromUser.id))) {
				throw chatNotAvailableError();
			}
		} else if (toUser.chatScope === 'mutual') {
			const count = await countMutualFollowingsBetweenUsersFromDatabase(deps.db, fromUser.id, toUser.id);
			if (count !== 2) {
				throw chatNotAvailableError();
			}
		}
	}

	if (!(await fetchChatAvailability(deps, toUser.id)).write) {
		throw chatNotAvailableError();
	}

	if (await blockingExistsInDatabase(deps.db, toUser.id, fromUser.id)) {
		throw new ApiError({
			status: 400,
			message: 'You cannot send a message because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: 'c15a5199-7422-4968-941a-2a462c478f7d',
		});
	}

	const message = {
		id: genId(),
		fromUserId: fromUser.id,
		toUserId: toUser.id,
		text: params.text ? params.text.trim() : null,
		fileId: params.file ? params.file.id : null,
		reads: [],
		uri: params.uri ?? null,
	};

	const inserted = await createChatMessageInDatabase(deps.db, message);

	if (!iApprovedOther) {
		await createChatApprovalInDatabase(deps.db, {
			id: genId(),
			userId: fromUser.id,
			otherId: toUser.id,
		});
	}

	const packedMessage = await packChatMessageLiteFor1on1(deps, inserted);

	if (toUser.host == null) {
		await deps.redis
			.pipeline()
			.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id)
			.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`)
			.exec();
	}

	if (fromUser.host == null) {
		deps.publishChatUserStream?.(fromUser.id, toUser.id, 'message', packedMessage);
	}

	if (toUser.host == null) {
		deps.publishChatUserStream?.(toUser.id, fromUser.id, 'message', packedMessage);
	}

	if (toUser.host == null) {
		setTimeout(async () => {
			const marker = await deps.redis.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);
			if (marker == null) {
				return;
			}

			const packedMessageForTo = await packChatMessageDetailed(deps, inserted, toUser);
			deps.publishMainStream?.(toUser.id, 'newChatMessage', packedMessageForTo);
			void pushChatNotification(deps, toUser.id, packedMessageForTo);
		}, 3000);
	}

	return packedMessage;
}

async function createChatMessageToRoom(
	deps: ChatDependencies,
	fromUser: { id: MiUser['id']; host: MiUser['host'] },
	toRoom: MiChatRoom,
	params: { text?: string | null; file?: MiDriveFile | null; uri?: string | null },
): Promise<Packed<'ChatMessageLiteForRoom'>> {
	const memberships = (await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, toRoom.id))
		.map((m) => ({
			userId: m.userId,
			isMuted: m.isMuted,
		}))
		.concat({ userId: toRoom.ownerId, isMuted: false });

	if (!memberships.some((member) => member.userId === fromUser.id)) {
		throw noSuchRoomError('8098520d-2da5-4e8f-8ee1-df78b55a4ec6');
	}

	const membershipsOtherThanMe = memberships.filter((member) => member.userId !== fromUser.id);

	const message = {
		id: genId(),
		fromUserId: fromUser.id,
		toRoomId: toRoom.id,
		text: params.text ? params.text.trim() : null,
		fileId: params.file ? params.file.id : null,
		reads: [],
		uri: params.uri ?? null,
	};

	const inserted = await createChatMessageInDatabase(deps.db, message);
	const packedMessage = await packChatMessageLiteForRoom(deps, inserted);

	deps.publishChatRoomStream?.(toRoom.id, 'message', packedMessage);

	const writePipeline = deps.redis.pipeline();
	for (const membership of membershipsOtherThanMe) {
		if (membership.isMuted) {
			continue;
		}
		writePipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
		writePipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
	}
	await writePipeline.exec();

	setTimeout(async () => {
		const readPipeline = deps.redis.pipeline();
		for (const membership of membershipsOtherThanMe) {
			readPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
		}
		const markers = await readPipeline.exec();
		if (markers == null) {
			throw new Error('redis error');
		}

		if (markers.every((marker) => marker[1] == null)) {
			return;
		}

		const packedMessageForTo = await packChatMessageDetailed(deps, inserted);

		for (let i = 0; i < membershipsOtherThanMe.length; i++) {
			const marker = markers[i]![1];
			if (marker == null) {
				continue;
			}

			deps.publishMainStream?.(membershipsOtherThanMe[i]!.userId, 'newChatMessage', packedMessageForTo);
			void pushChatNotification(deps, membershipsOtherThanMe[i]!.userId, packedMessageForTo);
		}
	}, 3000);

	return packedMessage;
}

export async function readUserChatMessage(
	deps: ChatDependencies,
	readerId: MiUser['id'],
	senderId: MiUser['id'],
): Promise<void> {
	await deps.redis
		.pipeline()
		.del(`newUserChatMessageExists:${readerId}:${senderId}`)
		.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`)
		.exec();
}

export async function readRoomChatMessage(
	deps: ChatDependencies,
	readerId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<void> {
	await deps.redis
		.pipeline()
		.del(`newRoomChatMessageExists:${readerId}:${roomId}`)
		.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`)
		.exec();
}

async function readAllChatMessages(deps: ChatDependencies, readerId: MiUser['id']): Promise<void> {
	await deps.redis.pipeline().del(`newChatMessagesExists:${readerId}`).exec();
}

export async function hasPermissionToViewRoomTimeline(
	deps: ChatDependencies,
	me: MiUser,
	room: MiChatRoom,
): Promise<boolean> {
	if (await isChatRoomMember(deps, room, me.id)) {
		return true;
	}
	return await userIsModerator(deps, me);
}

async function deleteChatMessage(deps: ChatDependencies, message: MiChatMessage): Promise<void> {
	await deleteChatMessageByIdFromDatabase(deps.db, message.id);

	if (message.toUserId) {
		const [fromUser, toUser] = await Promise.all([
			fetchUserByIdOrFailFromDatabase(deps.db, message.fromUserId),
			fetchUserByIdOrFailFromDatabase(deps.db, message.toUserId),
		]);

		if (fromUser.host == null) {
			deps.publishChatUserStream?.(message.fromUserId, message.toUserId, 'deleted', message.id);
		}
		if (toUser.host == null) {
			deps.publishChatUserStream?.(message.toUserId, message.fromUserId, 'deleted', message.id);
		}
	} else if (message.toRoomId) {
		deps.publishChatRoomStream?.(message.toRoomId, 'deleted', message.id);
	}
}

async function chatUserTimeline(
	deps: ChatDependencies,
	meId: MiUser['id'],
	otherId: MiUser['id'],
	limit: number,
	sinceId?: MiChatMessage['id'] | null,
	untilId?: MiChatMessage['id'] | null,
): Promise<MiChatMessage[]> {
	return await listChatMessagesBetweenUsersFromDatabase(deps.db, meId, otherId, {
		limit,
		...resolveDateIdPagination({ gen: genId }, omitUndefined({ sinceId, untilId })),
	});
}

async function chatRoomTimeline(
	deps: ChatDependencies,
	roomId: MiChatRoom['id'],
	limit: number,
	sinceId?: MiChatMessage['id'] | null,
	untilId?: MiChatMessage['id'] | null,
): Promise<MiChatMessage[]> {
	return await listChatMessagesByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveDateIdPagination({ gen: genId }, omitUndefined({ sinceId, untilId })),
	});
}

async function chatUserHistory(deps: ChatDependencies, meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
	return await listUserChatHistoryFromDatabase(deps.db, meId, limit);
}

async function chatRoomHistory(deps: ChatDependencies, meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
	return await listRoomChatHistoryFromDatabase(deps.db, meId, limit);
}

async function fetchUserChatReadStateMap(
	deps: ChatDependencies,
	userId: MiUser['id'],
	otherIds: MiUser['id'][],
): Promise<Record<MiUser['id'], boolean>> {
	const readStateMap: Record<MiUser['id'], boolean> = {};

	const pipeline = deps.redis.pipeline();
	for (const otherId of otherIds) {
		pipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
	}
	const markers = await pipeline.exec();
	if (markers == null) {
		throw new Error('redis error');
	}

	for (let i = 0; i < otherIds.length; i++) {
		readStateMap[otherIds[i]!] = markers[i]![1] == null;
	}

	return readStateMap;
}

async function fetchRoomChatReadStateMap(
	deps: ChatDependencies,
	userId: MiUser['id'],
	roomIds: MiChatRoom['id'][],
): Promise<Record<MiChatRoom['id'], boolean>> {
	const readStateMap: Record<MiChatRoom['id'], boolean> = {};

	const pipeline = deps.redis.pipeline();
	for (const roomId of roomIds) {
		pipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
	}
	const markers = await pipeline.exec();
	if (markers == null) {
		throw new Error('redis error');
	}

	for (let i = 0; i < roomIds.length; i++) {
		readStateMap[roomIds[i]!] = markers[i]![1] == null;
	}

	return readStateMap;
}

export async function createChatRoom(
	deps: ChatDependencies,
	owner: MiUser,
	params: Partial<{ name: string; description: string }>,
): Promise<MiChatRoom> {
	return await createChatRoomInDatabase(deps.db, {
		id: genId(),
		name: params.name ?? '',
		description: params.description ?? '',
		ownerId: owner.id,
	});
}

async function hasPermissionToViewRoomInfo(deps: ChatDependencies, me: MiUser, room: MiChatRoom): Promise<boolean> {
	if (room.ownerId === me.id) {
		return true;
	}
	if (await isChatRoomMember(deps, room, me.id)) {
		return true;
	}
	if (await fetchChatRoomInvitationFromDatabase(deps.db, room.id, me.id)) {
		return true;
	}
	return await userIsModerator(deps, me);
}

async function hasPermissionToDeleteRoom(deps: ChatDependencies, me: MiUser, room: MiChatRoom): Promise<boolean> {
	if (room.ownerId === me.id) {
		return true;
	}
	return await userIsModerator(deps, me);
}

async function deleteChatRoom(deps: ChatDependencies, room: MiChatRoom, deleter?: MiUser): Promise<void> {
	const memberships = (await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, room.id))
		.map((m) => ({ userId: m.userId }))
		.concat({ userId: room.ownerId });

	const pipeline = deps.redis.pipeline();
	for (const membership of memberships) {
		pipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
		pipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
	}
	await pipeline.exec();

	await deleteChatRoomByIdFromDatabase(deps.db, room.id);

	if (deleter) {
		if (await userIsModerator(deps, deleter)) {
			await logModerationEventInDatabase(deps, deleter, 'deleteChatRoom', {
				roomId: room.id,
				room,
			});
		}
	}
}

async function findMyChatRoomById(
	deps: ChatDependencies,
	ownerId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<MiChatRoom | null> {
	return await fetchChatRoomByIdAndOwnerIdFromDatabase(deps.db, roomId, ownerId);
}

async function findChatRoomById(deps: ChatDependencies, roomId: MiChatRoom['id']): Promise<MiChatRoom | null> {
	return await fetchChatRoomByIdFromDatabase(deps.db, roomId);
}

async function isChatRoomMember(deps: ChatDependencies, room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
	if (room.ownerId === userId) {
		return true;
	}
	return (await fetchChatRoomMembershipFromDatabase(deps.db, room.id, userId)) != null;
}

async function createChatRoomInvitation(
	deps: ChatDependencies,
	inviterId: MiUser['id'],
	roomId: MiChatRoom['id'],
	inviteeId: MiUser['id'],
): Promise<ChatRoomInvitationRow> {
	if (inviterId === inviteeId) {
		throw invalidParamError({ param: 'userId', reason: 'self invitation' });
	}

	const room = await fetchChatRoomByIdAndOwnerIdOrFailFromDatabase(deps.db, roomId, inviterId);
	if ((await fetchUserByIdFromDatabase(deps.db, inviteeId)) == null) {
		throw noSuchUserError('0f451b9e-fc21-491a-b2bf-46331103a945');
	}

	const invitation = {
		id: genId(),
		roomId: room.id,
		userId: inviteeId,
	};

	const created = await createChatRoomInvitationInDatabase(deps.db, invitation, MAX_ROOM_MEMBERS).catch((error) => {
		if (
			error instanceof ChatRoomCapacityExceededError ||
			error instanceof ChatRoomInvitationConflictError ||
			isDuplicateKeyValueDatabaseError(error)
		) {
			throw cannotCreateChatRoomInvitationError();
		}
		throw error;
	});

	void createChatRoomInvitationNotification(deps, inviteeId, invitation.id, inviterId);

	return created;
}

async function fetchSentChatRoomInvitationsWithPagination(
	deps: ChatDependencies,
	roomId: MiChatRoom['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomInvitationRow[]> {
	return await listChatRoomInvitationsByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveIdPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function fetchOwnedChatRoomsWithPagination(
	deps: ChatDependencies,
	ownerId: MiUser['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<MiChatRoom[]> {
	return await listChatRoomsByOwnerIdFromDatabase(deps.db, ownerId, {
		limit,
		...resolveIdPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function fetchReceivedChatRoomInvitationsWithPagination(
	deps: ChatDependencies,
	userId: MiUser['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomInvitationRow[]> {
	return await listChatRoomInvitationsByUserIdFromDatabase(deps.db, userId, {
		ignored: false,
		limit,
		...resolveIdPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function joinToChatRoom(deps: ChatDependencies, userId: MiUser['id'], roomId: MiChatRoom['id']): Promise<void> {
	const invitation = await fetchChatRoomInvitationFromDatabase(deps.db, roomId, userId);
	if (invitation == null) {
		throw noSuchRoomError('84416476-5ce8-4a2c-b568-9569f1b10733');
	}

	await joinChatRoomFromInvitationInDatabase(
		deps.db,
		{
			id: genId(),
			roomId,
			userId,
		},
		invitation.id,
		MAX_ROOM_MEMBERS,
	).catch((error) => {
		if (error instanceof ChatRoomCapacityExceededError) {
			throw cannotJoinChatRoomError();
		}
		if (error instanceof ChatRoomInvitationNotFoundError || isDuplicateKeyValueDatabaseError(error)) {
			throw noSuchRoomError('84416476-5ce8-4a2c-b568-9569f1b10733');
		}
		throw error;
	});
}

async function ignoreChatRoomInvitation(
	deps: ChatDependencies,
	userId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<void> {
	const invitation = await fetchChatRoomInvitationFromDatabase(deps.db, roomId, userId);
	if (invitation == null) {
		throw noSuchRoomError('5130557e-5a11-4cfb-9cc5-fe60cda5de0d');
	}
	await updateChatRoomInvitationIgnoredInDatabase(deps.db, invitation.id, true);
}

async function leaveChatRoom(deps: ChatDependencies, userId: MiUser['id'], roomId: MiChatRoom['id']): Promise<void> {
	const membership = await fetchChatRoomMembershipFromDatabase(deps.db, roomId, userId);
	if (membership == null) {
		throw noSuchRoomError('cb7f3179-50e8-4389-8c30-dbe2650a67c9');
	}
	await deleteChatRoomMembershipByIdFromDatabase(deps.db, membership.id);

	await deps.redis
		.pipeline()
		.del(`newRoomChatMessageExists:${userId}:${roomId}`)
		.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`)
		.exec();
}

async function muteChatRoom(
	deps: ChatDependencies,
	userId: MiUser['id'],
	roomId: MiChatRoom['id'],
	mute: boolean,
): Promise<void> {
	const membership = await fetchChatRoomMembershipFromDatabase(deps.db, roomId, userId);
	if (membership == null) {
		throw noSuchRoomError('c2cde4eb-8d0f-42f1-8f2f-c4d6bfc8e5df');
	}
	await updateChatRoomMembershipMuteInDatabase(deps.db, membership.id, mute);
}

async function updateChatRoom(
	deps: ChatDependencies,
	room: MiChatRoom,
	params: { name?: string; description?: string },
): Promise<MiChatRoom> {
	return await updateChatRoomInDatabase(deps.db, room.id, params);
}

async function fetchRoomChatMembershipsWithPagination(
	deps: ChatDependencies,
	roomId: MiChatRoom['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomMembershipRow[]> {
	return await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveIdPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function searchChatMessages(
	deps: ChatDependencies,
	meId: MiUser['id'],
	query: string,
	limit: number,
	params: { userId?: MiUser['id'] | null; roomId?: MiChatRoom['id'] | null },
): Promise<MiChatMessage[]> {
	return await searchChatMessagesFromDatabase(deps.db, meId, query, limit, params);
}

async function resolveChatReaction(
	deps: ChatDependencies,
	reactionInput: string,
	requireExists: boolean,
): Promise<string> {
	const custom = reactionInput.match(isCustomEmojiRegexp);

	if (custom == null) {
		return normalizeEmojiString(reactionInput);
	}
	const name = custom[1]!;
	if (requireExists) {
		const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, null);
		if (emoji == null) throw invalidParamError({ param: 'reaction', reason: 'no such emoji' });
	}
	return `:${name}:`;
}

async function reactToChatMessage(
	deps: ChatDependencies,
	messageId: MiChatMessage['id'],
	userId: MiUser['id'],
	reactionInput: string,
): Promise<void> {
	const reaction = await resolveChatReaction(deps, reactionInput, true);

	const message = await fetchChatMessageByIdFromDatabase(deps.db, messageId);
	if (message == null) {
		throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
	}

	if (message.fromUserId === userId) {
		throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
	}

	if (message.toRoomId === null && message.toUserId !== userId) {
		throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
	}

	const room = message.toRoomId ? await fetchChatRoomByIdOrFailFromDatabase(deps.db, message.toRoomId) : null;

	if (room) {
		if (!(await isChatRoomMember(deps, room, userId))) {
			throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
		}
	}

	const added = await addChatMessageReactionInDatabase(
		deps.db,
		message.id,
		userId,
		reaction,
		MAX_REACTIONS_PER_MESSAGE,
	);
	if (added === 'full') {
		throw tooManyChatMessageReactionsError();
	}
	if (added === 'duplicate') {
		// 同じリアクションは付いている。重ねて配信すると受け手の表示で数が増えるので、何もせず終える。
		return;
	}

	if (room) {
		deps.publishChatRoomStream?.(room.id, 'react', {
			messageId: message.id,
			user: await packUserLite(deps, userId),
			reaction,
		});
	} else {
		deps.publishChatUserStream?.(message.fromUserId, message.toUserId!, 'react', { messageId: message.id, reaction });
		deps.publishChatUserStream?.(message.toUserId!, message.fromUserId, 'react', { messageId: message.id, reaction });
	}
}

async function unreactToChatMessage(
	deps: ChatDependencies,
	messageId: MiChatMessage['id'],
	userId: MiUser['id'],
	reactionInput: string,
): Promise<void> {
	const reaction = await resolveChatReaction(deps, reactionInput, false);

	const message = await fetchChatMessageByIdFromDatabase(deps.db, messageId);
	if (message == null) {
		throw noSuchMessageError('c39ea42f-e3ca-428a-ad57-390e0a711595');
	}
	if (message.fromUserId === userId || (message.toRoomId === null && message.toUserId !== userId)) {
		throw noSuchMessageError('c39ea42f-e3ca-428a-ad57-390e0a711595');
	}
	const room = message.toRoomId ? await fetchChatRoomByIdOrFailFromDatabase(deps.db, message.toRoomId) : null;
	if (room && !(await isChatRoomMember(deps, room, userId))) {
		throw noSuchMessageError('c39ea42f-e3ca-428a-ad57-390e0a711595');
	}

	await removeChatMessageReactionInDatabase(deps.db, message.id, userId, reaction);

	if (room) {
		deps.publishChatRoomStream?.(room.id, 'unreact', {
			messageId: message.id,
			user: await packUserLite(deps, userId),
			reaction,
		});
	} else {
		deps.publishChatUserStream?.(message.fromUserId, message.toUserId!, 'unreact', { messageId: message.id, reaction });
		deps.publishChatUserStream?.(message.toUserId!, message.fromUserId, 'unreact', { messageId: message.id, reaction });
	}
}

async function fetchMyChatMemberships(
	deps: ChatDependencies,
	userId: MiUser['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomMembershipRow[]> {
	return await listChatRoomMembershipsByUserIdFromDatabase(deps.db, userId, {
		limit,
		...resolveIdPagination(omitUndefined({ sinceId, untilId })),
	});
}

function noSuchRoomError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such room.', code: 'NO_SUCH_ROOM', id });
}

function noSuchMessageError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such message.', code: 'NO_SUCH_MESSAGE', id });
}

function noSuchUserError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id });
}

function chatNotAvailableError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Chat is not available with this user.',
		code: 'CHAT_NOT_AVAILABLE',
		id: '0b6812b5-f0c3-486b-a99a-4973d22c44b2',
	});
}

function tooManyChatMessageReactionsError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'This message has too many reactions.',
		code: 'TOO_MANY_REACTIONS',
		id: '86753281-61b8-4dea-9a38-a08c0439f151',
	});
}

function cannotCreateChatRoomInvitationError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot create an invitation for this room.',
		code: 'CANNOT_CREATE_INVITATION',
		id: 'a3482fe1-78c8-4489-bcbf-a488631e95f4',
	});
}

function cannotJoinChatRoomError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot join this room.',
		code: 'CANNOT_JOIN_ROOM',
		id: 'c5a1e411-996d-46e1-be6e-82a8b996d1a1',
	});
}

async function fetchChatUser(deps: ChatDependencies, userId: string): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) {
		throw noSuchUserError('11795c64-40ea-4198-b06e-3c873ed9039d');
	}
	return user;
}

export const chatHistoryParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	room: z.boolean().optional().default(false),
});

export async function handleApiChatHistory(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatHistoryParamDef>,
): Promise<Packed<'ChatMessage'>[]> {
	await checkChatAvailability(deps, me.id, 'read');

	const history = params.room
		? await chatRoomHistory(deps, me.id, params.limit)
		: await chatUserHistory(deps, me.id, params.limit);
	const packedMessages = await packChatMessagesDetailed(deps, history, me);

	if (params.room) {
		const roomIds = history.map((m) => m.toRoomId!);
		const readStateMap = await fetchRoomChatReadStateMap(deps, me.id, roomIds);
		for (const message of packedMessages) {
			message.isRead = readStateMap[message.toRoomId!] ?? false;
		}
	} else {
		const otherIds = history.map((m) => (m.fromUserId === me.id ? m.toUserId! : m.fromUserId!));
		const readStateMap = await fetchUserChatReadStateMap(deps, me.id, otherIds);
		for (const message of packedMessages) {
			const otherId = message.fromUserId === me.id ? message.toUserId! : message.fromUserId!;
			message.isRead = readStateMap[otherId] ?? false;
		}
	}

	return packedMessages;
}

const chatReadAllParamDef = z.object({});

export async function handleApiChatReadAll(deps: ChatDependencies, me: MiLocalUser): Promise<void> {
	await checkChatAvailability(deps, me.id, 'read');
	await readAllChatMessages(deps, me.id);
}

export const chatMessagesCreateToUserParamDef = z.object({
	text: z.string().max(2000).nullable().optional(),
	fileId: misskeyId().optional(),
	toUserId: misskeyId(),
});

export async function handleApiChatMessagesCreateToUser(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesCreateToUserParamDef>,
): Promise<Packed<'ChatMessageLiteFor1on1'>> {
	await checkChatAvailability(deps, me.id, 'write');

	let file = null;
	if (params.fileId != null) {
		file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
		if (file == null) {
			throw new ApiError({
				status: 400,
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
				id: '4372b8e2-185d-4146-8749-2f68864a3e5f',
			});
		}
	}

	if (params.text == null && file == null) {
		throw new ApiError({
			status: 400,
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '25587321-b0e6-449c-9239-f8925092942c',
		});
	}

	if (params.toUserId === me.id) {
		throw new ApiError({
			status: 400,
			message: 'You can not send a message to yourself.',
			code: 'RECIPIENT_IS_YOURSELF',
			id: '17e2ba79-e22a-4cbc-bf91-d327643f4a7e',
		});
	}

	const toUser = await fetchChatUser(deps, params.toUserId);

	return await createChatMessageToUser(deps, me, toUser, omitUndefined({ text: params.text, file }));
}

export const chatMessagesCreateToRoomParamDef = z.object({
	text: z.string().max(2000).nullable().optional(),
	fileId: misskeyId().optional(),
	toRoomId: misskeyId(),
});

export async function handleApiChatMessagesCreateToRoom(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesCreateToRoomParamDef>,
): Promise<Packed<'ChatMessageLiteForRoom'>> {
	await checkChatAvailability(deps, me.id, 'write');

	const room = await findChatRoomById(deps, params.toRoomId);
	if (room == null) {
		throw noSuchRoomError('8098520d-2da5-4e8f-8ee1-df78b55a4ec6');
	}

	let file = null;
	if (params.fileId != null) {
		file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
		if (file == null) {
			throw new ApiError({
				status: 400,
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
				id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
			});
		}
	}

	if (params.text == null && file == null) {
		throw new ApiError({
			status: 400,
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '340517b7-6d04-42c0-bac1-37ee804e3594',
		});
	}

	return await createChatMessageToRoom(deps, me, room, omitUndefined({ text: params.text, file }));
}

export const chatMessagesDeleteParamDef = z.object({
	messageId: misskeyId(),
});

export async function handleApiChatMessagesDelete(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesDeleteParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');

	const message = await fetchChatMessageByIdAndFromUserIdFromDatabase(deps.db, params.messageId, me.id);
	if (message == null) {
		throw noSuchMessageError('36b67f0e-66a6-414b-83df-992a55294f17');
	}

	await deleteChatMessage(deps, message);
}

export const chatMessagesReactParamDef = z.object({
	messageId: misskeyId(),
	reaction: z.string(),
});

export async function handleApiChatMessagesReact(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesReactParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');
	await reactToChatMessage(deps, params.messageId, me.id, params.reaction);
}

export const chatMessagesUnreactParamDef = z.object({
	messageId: misskeyId(),
	reaction: z.string(),
});

export async function handleApiChatMessagesUnreact(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesUnreactParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');
	await unreactToChatMessage(deps, params.messageId, me.id, params.reaction);
}

export const chatMessagesRoomTimelineParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	roomId: misskeyId(),
});

export async function handleApiChatMessagesRoomTimeline(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesRoomTimelineParamDef>,
): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const room = await findChatRoomById(deps, params.roomId);
	if (room == null) {
		throw noSuchRoomError('c4d9f88c-9270-4632-b032-6ed8cee36f7f');
	}

	if (!(await hasPermissionToViewRoomTimeline(deps, me, room))) {
		throw noSuchRoomError('c4d9f88c-9270-4632-b032-6ed8cee36f7f');
	}

	const messages = await chatRoomTimeline(deps, room.id, params.limit, sinceId, untilId);

	void readRoomChatMessage(deps, me.id, room.id);

	return await packChatMessagesLiteForRoom(deps, messages);
}

export const chatMessagesSearchParamDef = z.object({
	query: z.string().min(1).max(256),
	limit: z.int().min(1).max(100).optional().default(10),
	userId: misskeyId().nullable().optional(),
	roomId: misskeyId().nullable().optional(),
});

export async function handleApiChatMessagesSearch(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesSearchParamDef>,
): Promise<Packed<'ChatMessage'>[]> {
	await checkChatAvailability(deps, me.id, 'read');

	if (params.roomId != null) {
		const room = await findChatRoomById(deps, params.roomId);
		if (room == null) {
			throw noSuchRoomError('460b3669-81b0-4dc9-a997-44442141bf83');
		}
		if (!(await isChatRoomMember(deps, room, me.id))) {
			throw noSuchRoomError('460b3669-81b0-4dc9-a997-44442141bf83');
		}
	}

	const messages = await searchChatMessages(
		deps,
		me.id,
		params.query,
		params.limit,
		omitUndefined({ userId: params.userId, roomId: params.roomId }),
	);

	return await packChatMessagesDetailed(deps, messages, me);
}

export const chatMessagesShowParamDef = z.object({
	messageId: misskeyId(),
});

export async function handleApiChatMessagesShow(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesShowParamDef>,
): Promise<Packed<'ChatMessage'>> {
	await checkChatAvailability(deps, me.id, 'read');

	const message = await fetchChatMessageByIdFromDatabase(deps.db, params.messageId);
	if (message == null) {
		throw noSuchMessageError('3710865b-1848-4da9-8d61-cfed15510b93');
	}
	if (message.fromUserId !== me.id && message.toUserId !== me.id && !(await userIsModerator(deps, me))) {
		throw noSuchMessageError('3710865b-1848-4da9-8d61-cfed15510b93');
	}

	return await packChatMessageDetailed(deps, message, me);
}

export const chatMessagesUserTimelineParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	userId: misskeyId(),
});

export async function handleApiChatMessagesUserTimeline(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatMessagesUserTimelineParamDef>,
): Promise<Packed<'ChatMessageLiteFor1on1'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const other = await fetchChatUser(deps, params.userId);

	const messages = await chatUserTimeline(deps, me.id, other.id, params.limit, sinceId, untilId);

	void readUserChatMessage(deps, me.id, other.id);

	return await packChatMessagesLiteFor1on1(deps, messages);
}

export const chatRoomsCreateParamDef = z.object({
	name: z.string().max(256),
	description: z.string().max(1024).optional(),
});

export async function handleApiChatRoomsCreate(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsCreateParamDef>,
): Promise<Packed<'ChatRoom'>> {
	await checkChatAvailability(deps, me.id, 'write');

	const room = await createChatRoom(deps, me, { name: params.name, description: params.description ?? '' });
	return await packChatRoom(deps, room);
}

export const chatRoomsDeleteParamDef = z.object({
	roomId: misskeyId(),
});

export async function handleApiChatRoomsDelete(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsDeleteParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');

	const room = await findChatRoomById(deps, params.roomId);
	if (room == null) {
		throw noSuchRoomError('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');
	}

	if (!(await hasPermissionToDeleteRoom(deps, me, room))) {
		throw noSuchRoomError('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');
	}

	await deleteChatRoom(deps, room, me);
}

export const chatRoomsUpdateParamDef = z.object({
	roomId: misskeyId(),
	name: z.string().max(256).optional(),
	description: z.string().max(1024).optional(),
});

export async function handleApiChatRoomsUpdate(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsUpdateParamDef>,
): Promise<Packed<'ChatRoom'>> {
	await checkChatAvailability(deps, me.id, 'write');

	const room = await findMyChatRoomById(deps, me.id, params.roomId);
	if (room == null) {
		throw noSuchRoomError('fcdb0f92-bda6-47f9-bd05-343e0e020932');
	}

	const updated = await updateChatRoom(
		deps,
		room,
		omitUndefined({ name: params.name, description: params.description }),
	);
	return await packChatRoom(deps, updated, me);
}

export const chatRoomsShowParamDef = z.object({
	roomId: misskeyId(),
});

export async function handleApiChatRoomsShow(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsShowParamDef>,
): Promise<Packed<'ChatRoom'>> {
	await checkChatAvailability(deps, me.id, 'read');

	const room = await findChatRoomById(deps, params.roomId);
	if (room == null) {
		throw noSuchRoomError('857ae02f-8759-4d20-9adb-6e95fffe4fd7');
	}

	if (!(await hasPermissionToViewRoomInfo(deps, me, room))) {
		throw noSuchRoomError('857ae02f-8759-4d20-9adb-6e95fffe4fd7');
	}

	return await packChatRoom(deps, room, me);
}

export const chatRoomsOwnedParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(30),
	...paginationParams,
});

export async function handleApiChatRoomsOwned(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsOwnedParamDef>,
): Promise<Packed<'ChatRoom'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const rooms = await fetchOwnedChatRoomsWithPagination(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRooms(deps, rooms, me);
}

export const chatRoomsJoinParamDef = z.object({
	roomId: misskeyId(),
});

export async function handleApiChatRoomsJoin(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsJoinParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');
	await joinToChatRoom(deps, me.id, params.roomId);
}

export const chatRoomsJoiningParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(30),
	...paginationParams,
});

export async function handleApiChatRoomsJoining(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsJoiningParamDef>,
): Promise<Packed<'ChatRoomMembership'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const memberships = await fetchMyChatMemberships(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomMemberships(deps, memberships, me, { populateUser: false, populateRoom: true });
}

export const chatRoomsLeaveParamDef = z.object({
	roomId: misskeyId(),
});

export async function handleApiChatRoomsLeave(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsLeaveParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');
	await leaveChatRoom(deps, me.id, params.roomId);
}

export const chatRoomsMembersParamDef = z.object({
	roomId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(30),
	...paginationParams,
});

export async function handleApiChatRoomsMembers(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsMembersParamDef>,
): Promise<Packed<'ChatRoomMembership'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const room = await findChatRoomById(deps, params.roomId);
	if (room == null) {
		throw noSuchRoomError('7b9fe84c-eafc-4d21-bf89-485458ed2c18');
	}

	if (!(await isChatRoomMember(deps, room, me.id))) {
		throw noSuchRoomError('7b9fe84c-eafc-4d21-bf89-485458ed2c18');
	}

	const memberships = await fetchRoomChatMembershipsWithPagination(deps, room.id, params.limit, sinceId, untilId);
	return await packChatRoomMemberships(deps, memberships, me, { populateUser: true, populateRoom: false });
}

export const chatRoomsMuteParamDef = z.object({
	roomId: misskeyId(),
	mute: z.boolean(),
});

export async function handleApiChatRoomsMute(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsMuteParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');
	await muteChatRoom(deps, me.id, params.roomId, params.mute);
}

export const chatRoomsInvitationsCreateParamDef = z.object({
	roomId: misskeyId(),
	userId: misskeyId(),
});

export async function handleApiChatRoomsInvitationsCreate(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsInvitationsCreateParamDef>,
): Promise<Packed<'ChatRoomInvitation'>> {
	await checkChatAvailability(deps, me.id, 'write');

	const room = await findMyChatRoomById(deps, me.id, params.roomId);
	if (room == null) {
		throw noSuchRoomError('916f9507-49ba-4e90-b57f-1fd4deaa47a5');
	}

	const invitation = await createChatRoomInvitation(deps, me.id, room.id, params.userId);
	return await packChatRoomInvitation(deps, invitation, me);
}

export const chatRoomsInvitationsIgnoreParamDef = z.object({
	roomId: misskeyId(),
});

export async function handleApiChatRoomsInvitationsIgnore(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsInvitationsIgnoreParamDef>,
): Promise<void> {
	await checkChatAvailability(deps, me.id, 'write');
	await ignoreChatRoomInvitation(deps, me.id, params.roomId);
}

export const chatRoomsInvitationsInboxParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(30),
	...paginationParams,
});

export async function handleApiChatRoomsInvitationsInbox(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsInvitationsInboxParamDef>,
): Promise<Packed<'ChatRoomInvitation'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const invitations = await fetchReceivedChatRoomInvitationsWithPagination(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomInvitations(deps, invitations, me);
}

export const chatRoomsInvitationsOutboxParamDef = z.object({
	roomId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(30),
	...paginationParams,
});

export async function handleApiChatRoomsInvitationsOutbox(
	deps: ChatDependencies,
	me: MiLocalUser,
	params: Params<typeof chatRoomsInvitationsOutboxParamDef>,
): Promise<Packed<'ChatRoomInvitation'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	await checkChatAvailability(deps, me.id, 'read');

	const room = await findMyChatRoomById(deps, me.id, params.roomId);
	if (room == null) {
		throw noSuchRoomError('a3c6b309-9717-4316-ae94-a69b53437237');
	}

	const invitations = await fetchSentChatRoomInvitationsWithPagination(deps, room.id, params.limit, sinceId, untilId);
	return await packChatRoomInvitations(deps, invitations, me);
}
