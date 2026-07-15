/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { blockingExistsInDatabase } from '@/core/BlockingStore.js';
import { createChatApprovalInDatabase, listChatApprovalsBetweenUsers } from '@/core/ChatApprovalStore.js';
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
	resolveChatMessagePagination,
	searchChatMessagesFromDatabase,
} from '@/core/ChatMessageStore.js';
import {
	countChatRoomMembershipsByRoomIdFromDatabase,
	createChatRoomInDatabase,
	createChatRoomInvitationInDatabase,
	deleteChatRoomByIdFromDatabase,
	deleteChatRoomMembershipByIdFromDatabase,
	fetchChatRoomByIdAndOwnerIdFromDatabase,
	fetchChatRoomByIdAndOwnerIdOrFailFromDatabase,
	fetchChatRoomByIdFromDatabase,
	fetchChatRoomByIdOrFailFromDatabase,
	fetchChatRoomInvitationByIdOrFailFromDatabase,
	fetchChatRoomInvitationFromDatabase,
	fetchChatRoomInvitationOrFailFromDatabase,
	fetchChatRoomMembershipByIdOrFailFromDatabase,
	fetchChatRoomMembershipFromDatabase,
	fetchChatRoomMembershipOrFailFromDatabase,
	joinChatRoomFromInvitationInDatabase,
	listChatRoomInvitationsByRoomIdFromDatabase,
	listChatRoomInvitationsByRoomIdsAndUserIdFromDatabase,
	listChatRoomInvitationsByUserIdFromDatabase,
	listChatRoomMembershipsByRoomIdFromDatabase,
	listChatRoomMembershipsByRoomIdsAndUserIdFromDatabase,
	listChatRoomMembershipsByUserIdFromDatabase,
	listChatRoomsByIdsFromDatabase,
	listChatRoomsByOwnerIdFromDatabase,
	resolveChatRoomRecordPagination,
	updateChatRoomInDatabase,
	updateChatRoomInvitationIgnoredFromDatabase,
	updateChatRoomMembershipMuteFromDatabase,
} from '@/core/ChatRoomStore.js';
import { fetchDriveFileByIdAndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/EmojiStore.js';
import { followingExistsInDatabase } from '@/core/FollowingStore.js';
import { countMutualFollowingsBetweenUsersFromDatabase } from '@/core/FollowingStore.js';
import { mutingExistsInDatabase } from '@/core/MutingStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase, listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiChatMessage } from '@/models/ChatMessage.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { ChatRoomInvitationRow } from '@/db/schema/chat-room-invitation.js';
import type { ChatRoomMembershipRow } from '@/db/schema/chat-room-membership.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { xaddHonoApiNotification, type HonoApiNotificationDependencies } from './notification.js';
import { HonoApiError } from './error.js';
import type { HonoApiChatRoomStreamPublisher, HonoApiChatUserStreamPublisher, HonoApiMainStreamPublisher } from './events.js';
import { packDriveFileForHonoApi, packDriveFileManyByIdsForHonoApi, type HonoApiDriveFileDependencies } from './drive-file.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi } from './user.js';
import { getHonoApiRolePolicies, isHonoApiModerator, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';
import { pushSwNotificationForHonoApi } from './push-notification.js';

export type HonoApiChatDependencies = HonoApiDriveFileDependencies & HonoApiRolePolicyDependencies & HonoApiNotificationDependencies & {
	publishChatUserStream?: HonoApiChatUserStreamPublisher;
	publishChatRoomStream?: HonoApiChatRoomStreamPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

const MAX_ROOM_MEMBERS = 50;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

function normalizeEmojiStringForHonoApi(x: string): string {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

type ChatRoomInvitationPackable = ChatRoomInvitationRow & {
	user?: MiUser | null;
	room?: MiChatRoom | null;
};

type ChatRoomMembershipPackable = ChatRoomMembershipRow & {
	user?: MiUser | null;
	room?: MiChatRoom | null;
};

async function packChatMessageUsersForHonoApi(
	deps: HonoApiChatDependencies,
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
			if (src == null) continue;
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

	const idsToFetch = [...new Set([...requiredUserIds, ...reactionUserIds])]
		.filter(id => !explicitUsers.has(id) && !packedUsers.has(id) && !missingUserIds.has(id));
	const fetchedUsers = await listUsersByIdsFromDatabase(deps.db, idsToFetch, { includeSuspended: true });
	const userById = new Map([...explicitUsers.values(), ...fetchedUsers].map(user => [user.id, user]));
	const missingRequiredUserId = [...requiredUserIds].find(id => !userById.has(id) && !packedUsers.has(id));
	if (missingRequiredUserId != null) {
		throw new EntityNotFoundError('MiUser', { id: missingRequiredUserId });
	}

	const newlyPackedUsers = await packUserLiteManyForHonoApi(deps, [...userById.values()].filter(user => !packedUsers.has(user.id)));
	for (const user of newlyPackedUsers) packedUsers.set(user.id, user);
	for (const userId of reactionUserIds) {
		if (!packedUsers.has(userId)) missingUserIds.add(userId);
	}
	return { packedUsers, missingUserIds };
}

export async function packChatMessageDetailedForHonoApi(
	deps: HonoApiChatDependencies,
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
	const { packedUsers } = await packChatMessageUsersForHonoApi(deps, [message], options?._hint_?.packedUsers, options?._hint_?.missingUserIds);

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
		fromUser: packedUsers?.get(message.fromUserId) ?? (await packUserLiteForHonoApi(deps, message.fromUser ?? message.fromUserId)),
		toUserId: message.toUserId,
		toUser: message.toUserId ? (packedUsers?.get(message.toUserId) ?? (await packUserLiteForHonoApi(deps, message.toUser ?? message.toUserId))) : undefined,
		toRoomId: message.toRoomId,
		toRoom: message.toRoomId ? (packedRooms?.get(message.toRoomId) ?? (await packChatRoomForHonoApi(deps, message.toRoom ?? message.toRoomId, me))) : undefined,
		fileId: message.fileId,
		file: message.fileId ? (packedFiles?.get(message.fileId) ?? (await packDriveFileForHonoApi(deps, message.file ?? message.fileId))) : null,
		reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r.user != null),
	} as Packed<'ChatMessage'>;
}

export async function packChatMessagesDetailedForHonoApi(
	deps: HonoApiChatDependencies,
	messages: MiChatMessage[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatMessage'>[]> {
	if (messages.length === 0) return [];

	const [packedUserData, packedFiles, packedRooms] = await Promise.all([
		packChatMessageUsersForHonoApi(deps, messages),
		packDriveFileManyByIdsForHonoApi(deps, messages.map(m => m.fileId).filter((x): x is string => x != null))
			.then(files => new Map(files.map(f => [f.id, f as Packed<'DriveFile'> | null]))),
		packChatRoomsForHonoApi(deps, messages.map(m => m.toRoom ?? m.toRoomId).filter((x): x is MiChatRoom | string => x != null), me)
			.then(rooms => new Map(rooms.map(r => [r.id, r]))),
	]);

	return await Promise.all(messages.map(message => packChatMessageDetailedForHonoApi(deps, message, me, { _hint_: { ...packedUserData, packedFiles, packedRooms } })));
}

export async function packChatMessageLiteFor1on1ForHonoApi(
	deps: HonoApiChatDependencies,
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
		file: message.fileId ? (packedFiles?.get(message.fileId) ?? (await packDriveFileForHonoApi(deps, message.file ?? message.fileId))) : null,
		reactions,
	} as Packed<'ChatMessageLiteFor1on1'>;
}

export async function packChatMessagesLiteFor1on1ForHonoApi(
	deps: HonoApiChatDependencies,
	messages: MiChatMessage[],
): Promise<Packed<'ChatMessageLiteFor1on1'>[]> {
	if (messages.length === 0) return [];

	const packedFiles = await packDriveFileManyByIdsForHonoApi(deps, messages.map(m => m.fileId).filter((x): x is string => x != null))
		.then(files => new Map(files.map(f => [f.id, f as Packed<'DriveFile'> | null])));

	return await Promise.all(messages.map(message => packChatMessageLiteFor1on1ForHonoApi(deps, message, { _hint_: { packedFiles } })));
}

export async function packChatMessageLiteForRoomForHonoApi(
	deps: HonoApiChatDependencies,
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
			user: packedUsers?.get(userId) ?? (await packUserLiteForHonoApi(deps, userId).catch(() => null)),
			reaction,
		});
	}

	return {
		id: message.id,
		createdAt: parseId(message.id).date.toISOString(),
		text: message.text,
		fromUserId: message.fromUserId,
		fromUser: packedUsers?.get(message.fromUserId) ?? (await packUserLiteForHonoApi(deps, message.fromUser ?? message.fromUserId)),
		toRoomId: message.toRoomId!,
		fileId: message.fileId,
		file: message.fileId ? (packedFiles?.get(message.fileId) ?? (await packDriveFileForHonoApi(deps, message.file ?? message.fileId))) : null,
		reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r.user != null),
	} as Packed<'ChatMessageLiteForRoom'>;
}

export async function packChatMessagesLiteForRoomForHonoApi(
	deps: HonoApiChatDependencies,
	messages: MiChatMessage[],
): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
	if (messages.length === 0) return [];

	const users = messages.map(x => x.fromUser ?? x.fromUserId) as (MiUser | string)[];
	const userIdSet = new Set(users.map(x => typeof x === 'string' ? x : x.id));
	const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]!));
	for (const reactedUserId of reactedUserIds) {
		if (!userIdSet.has(reactedUserId)) {
			userIdSet.add(reactedUserId);
			users.push(reactedUserId);
		}
	}

	const [packedUsers, packedFiles] = await Promise.all([
		packUserLiteManyForHonoApi(deps, users).then(users => new Map(users.map(u => [u.id, u]))),
		packDriveFileManyByIdsForHonoApi(deps, messages.map(m => m.fileId).filter((x): x is string => x != null))
			.then(files => new Map(files.map(f => [f.id, f as Packed<'DriveFile'> | null]))),
	]);

	return await Promise.all(messages.map(message => packChatMessageLiteForRoomForHonoApi(deps, message, { _hint_: { packedFiles, packedUsers } })));
}

export async function packChatRoomForHonoApi(
	deps: HonoApiChatDependencies,
	src: MiChatRoom['id'] | MiChatRoom,
	me?: { id: MiUser['id'] },
	options?: {
		_hint_?: {
			packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
			myMemberships?: Map<MiChatRoom['id'], ChatRoomMembershipPackable | null | undefined>;
			myInvitations?: Map<MiChatRoom['id'], ChatRoomInvitationPackable | null | undefined>;
		};
	},
): Promise<Packed<'ChatRoom'>> {
	const room = typeof src === 'object' ? src : await fetchChatRoomByIdOrFailFromDatabase(deps.db, src);

	const membership = me && me.id !== room.ownerId
		? options?._hint_?.myMemberships?.has(room.id)
			? options._hint_.myMemberships.get(room.id) ?? null
			: await fetchChatRoomMembershipFromDatabase(deps.db, room.id, me.id)
		: null;
	const invitation = me && me.id !== room.ownerId
		? options?._hint_?.myInvitations?.has(room.id)
			? options._hint_.myInvitations.get(room.id) ?? null
			: await fetchChatRoomInvitationFromDatabase(deps.db, room.id, me.id)
		: null;

	return {
		id: room.id,
		createdAt: parseId(room.id).date.toISOString(),
		name: room.name,
		description: room.description,
		ownerId: room.ownerId,
		owner: options?._hint_?.packedOwners.get(room.ownerId) ?? (await packUserLiteForHonoApi(deps, room.owner ?? room.ownerId)),
		isMuted: membership != null ? membership.isMuted : false,
		invitationExists: invitation != null,
	} as Packed<'ChatRoom'>;
}

export async function packChatRoomsForHonoApi(
	deps: HonoApiChatDependencies,
	rooms: (MiChatRoom | MiChatRoom['id'])[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatRoom'>[]> {
	if (rooms.length === 0) return [];

	const explicitRooms = rooms.filter((room): room is MiChatRoom => typeof room !== 'string');
	const _rooms = explicitRooms.length !== rooms.length
		? [...explicitRooms, ...(await listChatRoomsByIdsFromDatabase(deps.db, rooms.filter((room): room is string => typeof room === 'string')))]
		: explicitRooms;

	const owners = _rooms.map(x => x.owner ?? x.ownerId);

	const [packedOwners, myMemberships, myInvitations] = await Promise.all([
		packUserLiteManyForHonoApi(deps, owners).then(users => new Map(users.map(u => [u.id, u]))),
		listChatRoomMembershipsByRoomIdsAndUserIdFromDatabase(deps.db, _rooms.map(x => x.id), me.id)
			.then(memberships => {
				const membershipByRoomId = new Map(memberships.map(membership => [membership.roomId, membership]));
				return new Map(_rooms.map(room => [room.id, membershipByRoomId.get(room.id) ?? null]));
			}),
		listChatRoomInvitationsByRoomIdsAndUserIdFromDatabase(deps.db, _rooms.map(x => x.id), me.id)
			.then(invitations => {
				const invitationByRoomId = new Map(invitations.map(invitation => [invitation.roomId, invitation]));
				return new Map(_rooms.map(room => [room.id, invitationByRoomId.get(room.id) ?? null]));
			}),
	]);

	return await Promise.all(_rooms.map(room => packChatRoomForHonoApi(deps, room, me, { _hint_: { packedOwners, myMemberships, myInvitations } })));
}

export async function packChatRoomInvitationForHonoApi(
	deps: HonoApiChatDependencies,
	src: ChatRoomInvitationRow['id'] | ChatRoomInvitationPackable,
	me: { id: MiUser['id'] },
	options?: {
		_hint_?: {
			packedRooms: Map<ChatRoomInvitationRow['roomId'], Packed<'ChatRoom'>>;
			packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
		};
	},
): Promise<Packed<'ChatRoomInvitation'>> {
	const invitation: ChatRoomInvitationPackable = typeof src === 'object' ? src : await fetchChatRoomInvitationByIdOrFailFromDatabase(deps.db, src);

	return {
		id: invitation.id,
		createdAt: parseId(invitation.id).date.toISOString(),
		roomId: invitation.roomId,
		room: options?._hint_?.packedRooms.get(invitation.roomId) ?? (await packChatRoomForHonoApi(deps, invitation.room ?? invitation.roomId, me)),
		userId: invitation.userId,
		user: options?._hint_?.packedUsers.get(invitation.userId) ?? (await packUserLiteForHonoApi(deps, invitation.user ?? invitation.userId)),
	} as Packed<'ChatRoomInvitation'>;
}

export async function packChatRoomInvitationsForHonoApi(
	deps: HonoApiChatDependencies,
	invitations: ChatRoomInvitationPackable[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatRoomInvitation'>[]> {
	if (invitations.length === 0) return [];

	const [packedRooms, packedUsers] = await Promise.all([
		packChatRoomsForHonoApi(deps, invitations.map(invitation => invitation.room ?? invitation.roomId), me)
			.then(rooms => new Map(rooms.map(room => [room.id, room]))),
		packUserLiteManyForHonoApi(deps, invitations.map(invitation => invitation.user ?? invitation.userId))
			.then(users => new Map(users.map(user => [user.id, user]))),
	]);

	return await Promise.all(invitations.map(invitation => packChatRoomInvitationForHonoApi(deps, invitation, me, { _hint_: { packedRooms, packedUsers } })));
}

export async function packChatRoomMembershipForHonoApi(
	deps: HonoApiChatDependencies,
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
	const membership: ChatRoomMembershipPackable = typeof src === 'object' ? src : await fetchChatRoomMembershipByIdOrFailFromDatabase(deps.db, src);

	return {
		id: membership.id,
		createdAt: parseId(membership.id).date.toISOString(),
		userId: membership.userId,
		user: options?.populateUser ? (options._hint_?.packedUsers?.get(membership.userId) ?? (await packUserLiteForHonoApi(deps, membership.user ?? membership.userId))) : undefined,
		roomId: membership.roomId,
		room: options?.populateRoom ? (options._hint_?.packedRooms?.get(membership.roomId) ?? (await packChatRoomForHonoApi(deps, membership.room ?? membership.roomId, me))) : undefined,
	} as Packed<'ChatRoomMembership'>;
}

export async function packChatRoomMembershipsForHonoApi(
	deps: HonoApiChatDependencies,
	memberships: ChatRoomMembershipPackable[],
	me: { id: MiUser['id'] },
	options: { populateUser?: boolean; populateRoom?: boolean } = {},
): Promise<Packed<'ChatRoomMembership'>[]> {
	if (memberships.length === 0) return [];

	const [packedUsers, packedRooms] = await Promise.all([
		options.populateUser
			? packUserLiteManyForHonoApi(deps, memberships.map(x => x.user ?? x.userId)).then(users => new Map(users.map(u => [u.id, u])))
			: Promise.resolve(undefined),
		options.populateRoom
			? packChatRoomsForHonoApi(deps, memberships.map(x => x.room ?? x.roomId), me).then(rooms => new Map(rooms.map(r => [r.id, r])))
			: Promise.resolve(undefined),
	]);

	return await Promise.all(memberships.map(membership => packChatRoomMembershipForHonoApi(deps, membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
}

// ---------------------------------------------------------------------------
// service logic (ports of ChatService)
// ---------------------------------------------------------------------------

export async function getChatAvailabilityForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id']): Promise<{ read: boolean; write: boolean }> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	const policies = await getHonoApiRolePolicies(deps, user);

	switch (policies.chatAvailability) {
		case 'available': return { read: true, write: true };
		case 'readonly': return { read: true, write: false };
		case 'unavailable': return { read: false, write: false };
		default: throw new Error('invalid chat availability (unreachable)');
	}
}

export async function checkChatAvailabilityForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], permission: 'read' | 'write'): Promise<void> {
	const policy = await getChatAvailabilityForHonoApi(deps, userId);
	if (policy[permission] === false) {
		throw new HonoApiError({ status: 403, message: 'Role permission denied.', code: 'ROLE_PERMISSION_DENIED', id: 'c3d38592-54c0-429d-be96-5636b0431a61', kind: 'permission' });
	}
}

async function pushChatNotificationForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], body: Packed<'ChatMessage'>): Promise<void> {
	await pushSwNotificationForHonoApi(deps, userId, 'newChatMessage', body);
}

// Ports the notifierId-aware filtering from NotificationService#createNotificationInternal
// (never/following/follower/mutualFollow/followingOrFollower + mute check) via direct DB
// queries instead of NestJS's redis-backed caches (CacheService), consistent with the
// simplification already used throughout this Hono migration.
async function createChatRoomInvitationNotificationForHonoApi(
	deps: HonoApiChatDependencies,
	notifieeId: MiUser['id'],
	invitationId: string,
	notifierId: MiUser['id'],
): Promise<void> {
	if (notifieeId === notifierId) return;

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, notifieeId);
	const receiveConfig = (profile?.notificationRecieveConfig ?? {}).chatRoomInvitationReceived;
	if (receiveConfig?.type === 'never') return;

	const muted = await mutingExistsInDatabase(deps.db, notifieeId, notifierId);
	if (muted) return;

	if (receiveConfig?.type === 'following') {
		if (!await followingExistsInDatabase(deps.db, notifieeId, notifierId)) return;
	} else if (receiveConfig?.type === 'follower') {
		if (!await followingExistsInDatabase(deps.db, notifierId, notifieeId)) return;
	} else if (receiveConfig?.type === 'mutualFollow') {
		const count = await countMutualFollowingsBetweenUsersFromDatabase(deps.db, notifieeId, notifierId);
		if (count !== 2) return;
	} else if (receiveConfig?.type === 'followingOrFollower') {
		const [isFollowing, isFollower] = await Promise.all([
			followingExistsInDatabase(deps.db, notifieeId, notifierId),
			followingExistsInDatabase(deps.db, notifierId, notifieeId),
		]);
		if (!isFollowing && !isFollower) return;
	}

	const notification = {
		id: genId(),
		createdAt: new Date().toISOString(),
		type: 'chatRoomInvitationReceived',
		notifierId,
		invitationId,
	};
	await xaddHonoApiNotification(deps, notifieeId, notification);

	deps.publishMainStream?.(notifieeId, 'notification', notification);
	void pushSwNotificationForHonoApi(deps, notifieeId, 'notification', notification);
}

export async function createChatMessageToUserForHonoApi(
	deps: HonoApiChatDependencies,
	fromUser: { id: MiUser['id']; host: MiUser['host'] },
	toUser: MiUser,
	params: { text?: string | null; file?: MiDriveFile | null; uri?: string | null },
): Promise<Packed<'ChatMessageLiteFor1on1'>> {
	if (fromUser.id === toUser.id) {
		throw new Error('yourself');
	}

	const approvals = await listChatApprovalsBetweenUsers(deps.db, fromUser.id, toUser.id);
	const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
	const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

	if (!otherApprovedMe) {
		if (toUser.chatScope === 'none') {
			throw new Error('recipient is cannot chat (none)');
		} else if (toUser.chatScope === 'followers') {
			if (!await followingExistsInDatabase(deps.db, fromUser.id, toUser.id)) throw new Error('recipient is cannot chat (followers)');
		} else if (toUser.chatScope === 'following') {
			if (!await followingExistsInDatabase(deps.db, toUser.id, fromUser.id)) throw new Error('recipient is cannot chat (following)');
		} else if (toUser.chatScope === 'mutual') {
			const count = await countMutualFollowingsBetweenUsersFromDatabase(deps.db, fromUser.id, toUser.id);
			if (count !== 2) throw new Error('recipient is cannot chat (mutual)');
		}
	}

	if (!(await getChatAvailabilityForHonoApi(deps, toUser.id)).write) {
		throw new Error('recipient is cannot chat (policy)');
	}

	if (await blockingExistsInDatabase(deps.db, toUser.id, fromUser.id)) {
		throw new Error('blocked');
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

	const packedMessage = await packChatMessageLiteFor1on1ForHonoApi(deps, inserted);

	if (toUser.host == null) {
		await deps.redis.pipeline()
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
			if (marker == null) return;

			const packedMessageForTo = await packChatMessageDetailedForHonoApi(deps, inserted, toUser);
			deps.publishMainStream?.(toUser.id, 'newChatMessage', packedMessageForTo);
			void pushChatNotificationForHonoApi(deps, toUser.id, packedMessageForTo);
		}, 3000);
	}

	return packedMessage;
}

export async function createChatMessageToRoomForHonoApi(
	deps: HonoApiChatDependencies,
	fromUser: { id: MiUser['id']; host: MiUser['host'] },
	toRoom: MiChatRoom,
	params: { text?: string | null; file?: MiDriveFile | null; uri?: string | null },
): Promise<Packed<'ChatMessageLiteForRoom'>> {
	const memberships = (await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, toRoom.id)).map(m => ({
		userId: m.userId,
		isMuted: m.isMuted,
	})).concat({ userId: toRoom.ownerId, isMuted: false });

	if (!memberships.some(member => member.userId === fromUser.id)) {
		throw new Error('you are not a member of the room');
	}

	const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

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
	const packedMessage = await packChatMessageLiteForRoomForHonoApi(deps, inserted);

	deps.publishChatRoomStream?.(toRoom.id, 'message', packedMessage);

	const writePipeline = deps.redis.pipeline();
	for (const membership of membershipsOtherThanMe) {
		if (membership.isMuted) continue;
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
		if (markers == null) throw new Error('redis error');

		if (markers.every(marker => marker[1] == null)) return;

		const packedMessageForTo = await packChatMessageDetailedForHonoApi(deps, inserted);

		for (let i = 0; i < membershipsOtherThanMe.length; i++) {
			const marker = markers[i]![1];
			if (marker == null) continue;

			deps.publishMainStream?.(membershipsOtherThanMe[i]!.userId, 'newChatMessage', packedMessageForTo);
			void pushChatNotificationForHonoApi(deps, membershipsOtherThanMe[i]!.userId, packedMessageForTo);
		}
	}, 3000);

	return packedMessage;
}

export async function readUserChatMessageForHonoApi(deps: HonoApiChatDependencies, readerId: MiUser['id'], senderId: MiUser['id']): Promise<void> {
	await deps.redis.pipeline()
		.del(`newUserChatMessageExists:${readerId}:${senderId}`)
		.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`)
		.exec();
}

export async function readRoomChatMessageForHonoApi(deps: HonoApiChatDependencies, readerId: MiUser['id'], roomId: MiChatRoom['id']): Promise<void> {
	await deps.redis.pipeline()
		.del(`newRoomChatMessageExists:${readerId}:${roomId}`)
		.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`)
		.exec();
}

export async function readAllChatMessagesForHonoApi(deps: HonoApiChatDependencies, readerId: MiUser['id']): Promise<void> {
	await deps.redis.pipeline()
		.del(`newChatMessagesExists:${readerId}`)
		.exec();
}

export async function hasPermissionToViewRoomTimelineForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], room: MiChatRoom): Promise<boolean> {
	if (await isChatRoomMemberForHonoApi(deps, room, meId)) return true;
	return await isHonoApiModerator(deps, { id: meId } as MiUser);
}

export async function deleteChatMessageForHonoApi(deps: HonoApiChatDependencies, message: MiChatMessage): Promise<void> {
	await deleteChatMessageByIdFromDatabase(deps.db, message.id);

	if (message.toUserId) {
		const [fromUser, toUser] = await Promise.all([
			fetchUserByIdOrFailFromDatabase(deps.db, message.fromUserId),
			fetchUserByIdOrFailFromDatabase(deps.db, message.toUserId),
		]);

		if (fromUser.host == null) deps.publishChatUserStream?.(message.fromUserId, message.toUserId, 'deleted', message.id);
		if (toUser.host == null) deps.publishChatUserStream?.(message.toUserId, message.fromUserId, 'deleted', message.id);
	} else if (message.toRoomId) {
		deps.publishChatRoomStream?.(message.toRoomId, 'deleted', message.id);
	}
}

export async function chatUserTimelineForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null): Promise<MiChatMessage[]> {
	return await listChatMessagesBetweenUsersFromDatabase(deps.db, meId, otherId, {
		limit,
		...resolveChatMessagePagination({ gen: (time) => genId(time) }, { sinceId, untilId }),
	});
}

export async function chatRoomTimelineForHonoApi(deps: HonoApiChatDependencies, roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null): Promise<MiChatMessage[]> {
	return await listChatMessagesByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveChatMessagePagination({ gen: (time) => genId(time) }, { sinceId, untilId }),
	});
}

export async function chatUserHistoryForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
	return await listUserChatHistoryFromDatabase(deps.db, meId, limit);
}

export async function chatRoomHistoryForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
	return await listRoomChatHistoryFromDatabase(deps.db, meId, limit);
}

export async function getUserChatReadStateMapForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], otherIds: MiUser['id'][]): Promise<Record<MiUser['id'], boolean>> {
	const readStateMap: Record<MiUser['id'], boolean> = {};

	const pipeline = deps.redis.pipeline();
	for (const otherId of otherIds) {
		pipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
	}
	const markers = await pipeline.exec();
	if (markers == null) throw new Error('redis error');

	for (let i = 0; i < otherIds.length; i++) {
		readStateMap[otherIds[i]!] = markers[i]![1] == null;
	}

	return readStateMap;
}

export async function getRoomChatReadStateMapForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], roomIds: MiChatRoom['id'][]): Promise<Record<MiChatRoom['id'], boolean>> {
	const readStateMap: Record<MiChatRoom['id'], boolean> = {};

	const pipeline = deps.redis.pipeline();
	for (const roomId of roomIds) {
		pipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
	}
	const markers = await pipeline.exec();
	if (markers == null) throw new Error('redis error');

	for (let i = 0; i < roomIds.length; i++) {
		readStateMap[roomIds[i]!] = markers[i]![1] == null;
	}

	return readStateMap;
}

export async function createChatRoomForHonoApi(deps: HonoApiChatDependencies, owner: MiUser, params: Partial<{ name: string; description: string }>): Promise<MiChatRoom> {
	return await createChatRoomInDatabase(deps.db, {
		id: genId(),
		name: params.name ?? '',
		description: params.description ?? '',
		ownerId: owner.id,
	});
}

export async function hasPermissionToViewRoomInfoForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], room: MiChatRoom): Promise<boolean> {
	if (room.ownerId === meId) return true;
	if (await isChatRoomMemberForHonoApi(deps, room, meId)) return true;
	if (await fetchChatRoomInvitationFromDatabase(deps.db, room.id, meId)) return true;
	return await isHonoApiModerator(deps, { id: meId } as MiUser);
}

export async function hasPermissionToDeleteRoomForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], room: MiChatRoom): Promise<boolean> {
	if (room.ownerId === meId) return true;
	return await isHonoApiModerator(deps, { id: meId } as MiUser);
}

export async function deleteChatRoomForHonoApi(deps: HonoApiChatDependencies, room: MiChatRoom, deleter?: MiUser): Promise<void> {
	const memberships = (await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, room.id)).map(m => ({ userId: m.userId })).concat({ userId: room.ownerId });

	const pipeline = deps.redis.pipeline();
	for (const membership of memberships) {
		pipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
		pipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
	}
	await pipeline.exec();

	await deleteChatRoomByIdFromDatabase(deps.db, room.id);

	if (deleter) {
		if (await isHonoApiModerator(deps, deleter)) {
			await logModerationEventInDatabase(deps, deleter, 'deleteChatRoom', {
				roomId: room.id,
				room,
			});
		}
	}
}

export async function findMyChatRoomByIdForHonoApi(deps: HonoApiChatDependencies, ownerId: MiUser['id'], roomId: MiChatRoom['id']): Promise<MiChatRoom | null> {
	return await fetchChatRoomByIdAndOwnerIdFromDatabase(deps.db, roomId, ownerId);
}

export async function findChatRoomByIdForHonoApi(deps: HonoApiChatDependencies, roomId: MiChatRoom['id']): Promise<MiChatRoom | null> {
	return await fetchChatRoomByIdFromDatabase(deps.db, roomId);
}

export async function isChatRoomMemberForHonoApi(deps: HonoApiChatDependencies, room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
	if (room.ownerId === userId) return true;
	return (await fetchChatRoomMembershipFromDatabase(deps.db, room.id, userId)) != null;
}

export async function createChatRoomInvitationForHonoApi(deps: HonoApiChatDependencies, inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']): Promise<ChatRoomInvitationRow> {
	if (inviterId === inviteeId) {
		throw new Error('yourself');
	}

	const room = await fetchChatRoomByIdAndOwnerIdOrFailFromDatabase(deps.db, roomId, inviterId);

	if (await isChatRoomMemberForHonoApi(deps, room, inviteeId)) {
		throw new Error('already member');
	}

	const existingInvitation = await fetchChatRoomInvitationFromDatabase(deps.db, roomId, inviteeId);
	if (existingInvitation) {
		throw new Error('already invited');
	}

	const membershipsCount = await countChatRoomMembershipsByRoomIdFromDatabase(deps.db, roomId);
	if (membershipsCount >= MAX_ROOM_MEMBERS) {
		throw new Error('room is full');
	}

	const invitation = {
		id: genId(),
		roomId: room.id,
		userId: inviteeId,
	};

	const created = await createChatRoomInvitationInDatabase(deps.db, invitation);

	void createChatRoomInvitationNotificationForHonoApi(deps, inviteeId, invitation.id, inviterId);

	return created;
}

export async function getSentChatRoomInvitationsWithPaginationForHonoApi(deps: HonoApiChatDependencies, roomId: MiChatRoom['id'], limit: number, sinceId?: string | null, untilId?: string | null): Promise<ChatRoomInvitationRow[]> {
	return await listChatRoomInvitationsByRoomIdFromDatabase(deps.db, roomId, { limit, ...resolveChatRoomRecordPagination({ sinceId, untilId }) });
}

export async function getOwnedChatRoomsWithPaginationForHonoApi(deps: HonoApiChatDependencies, ownerId: MiUser['id'], limit: number, sinceId?: string | null, untilId?: string | null): Promise<MiChatRoom[]> {
	return await listChatRoomsByOwnerIdFromDatabase(deps.db, ownerId, { limit, ...resolveChatRoomRecordPagination({ sinceId, untilId }) });
}

export async function getReceivedChatRoomInvitationsWithPaginationForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], limit: number, sinceId?: string | null, untilId?: string | null): Promise<ChatRoomInvitationRow[]> {
	return await listChatRoomInvitationsByUserIdFromDatabase(deps.db, userId, { ignored: false, limit, ...resolveChatRoomRecordPagination({ sinceId, untilId }) });
}

export async function joinToChatRoomForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], roomId: MiChatRoom['id']): Promise<void> {
	const invitation = await fetchChatRoomInvitationOrFailFromDatabase(deps.db, roomId, userId);

	const membershipsCount = await countChatRoomMembershipsByRoomIdFromDatabase(deps.db, roomId);
	if (membershipsCount >= MAX_ROOM_MEMBERS) {
		throw new Error('room is full');
	}

	await joinChatRoomFromInvitationInDatabase(deps.db, {
		id: genId(),
		roomId,
		userId,
	}, invitation.id);
}

export async function ignoreChatRoomInvitationForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], roomId: MiChatRoom['id']): Promise<void> {
	const invitation = await fetchChatRoomInvitationOrFailFromDatabase(deps.db, roomId, userId);
	await updateChatRoomInvitationIgnoredFromDatabase(deps.db, invitation.id, true);
}

export async function leaveChatRoomForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], roomId: MiChatRoom['id']): Promise<void> {
	const membership = await fetchChatRoomMembershipOrFailFromDatabase(deps.db, roomId, userId);
	await deleteChatRoomMembershipByIdFromDatabase(deps.db, membership.id);

	await deps.redis.pipeline()
		.del(`newRoomChatMessageExists:${userId}:${roomId}`)
		.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`)
		.exec();
}

export async function muteChatRoomForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean): Promise<void> {
	const membership = await fetchChatRoomMembershipOrFailFromDatabase(deps.db, roomId, userId);
	await updateChatRoomMembershipMuteFromDatabase(deps.db, membership.id, mute);
}

export async function updateChatRoomForHonoApi(deps: HonoApiChatDependencies, room: MiChatRoom, params: { name?: string; description?: string }): Promise<MiChatRoom> {
	return await updateChatRoomInDatabase(deps.db, room.id, params);
}

export async function getRoomChatMembershipsWithPaginationForHonoApi(deps: HonoApiChatDependencies, roomId: MiChatRoom['id'], limit: number, sinceId?: string | null, untilId?: string | null): Promise<ChatRoomMembershipRow[]> {
	return await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, roomId, { limit, ...resolveChatRoomRecordPagination({ sinceId, untilId }) });
}

export async function searchChatMessagesForHonoApi(deps: HonoApiChatDependencies, meId: MiUser['id'], query: string, limit: number, params: { userId?: MiUser['id'] | null; roomId?: MiChatRoom['id'] | null }): Promise<MiChatMessage[]> {
	return await searchChatMessagesFromDatabase(deps.db, meId, query, limit, params);
}

async function resolveChatReactionForHonoApi(deps: HonoApiChatDependencies, reactionInput: string, requireExists: boolean): Promise<string> {
	const custom = reactionInput.match(isCustomEmojiRegexp);

	if (custom == null) {
		return normalizeEmojiStringForHonoApi(reactionInput);
	} else {
		const name = custom[1]!;
		if (requireExists) {
			const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, null);
			if (emoji == null) throw new Error('no such emoji');
		}
		return `:${name}:`;
	}
}

export async function reactToChatMessageForHonoApi(deps: HonoApiChatDependencies, messageId: MiChatMessage['id'], userId: MiUser['id'], reactionInput: string): Promise<void> {
	const reaction = await resolveChatReactionForHonoApi(deps, reactionInput, true);

	const message = await fetchChatMessageByIdOrFailFromDatabase(deps.db, messageId);

	if (message.fromUserId === userId) {
		throw new Error('cannot react to own message');
	}

	if (message.toRoomId === null && message.toUserId !== userId) {
		throw new Error('cannot react to others message');
	}

	if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
		throw new Error('too many reactions');
	}

	const room = message.toRoomId ? await fetchChatRoomByIdOrFailFromDatabase(deps.db, message.toRoomId) : null;

	if (room) {
		if (!(await isChatRoomMemberForHonoApi(deps, room, userId))) {
			throw new Error('cannot react to others message');
		}
	}

	await addChatMessageReactionInDatabase(deps.db, message.id, userId, reaction);

	if (room) {
		deps.publishChatRoomStream?.(room.id, 'react', {
			messageId: message.id,
			user: await packUserLiteForHonoApi(deps, userId),
			reaction,
		});
	} else {
		deps.publishChatUserStream?.(message.fromUserId, message.toUserId!, 'react', { messageId: message.id, reaction });
		deps.publishChatUserStream?.(message.toUserId!, message.fromUserId, 'react', { messageId: message.id, reaction });
	}
}

export async function unreactToChatMessageForHonoApi(deps: HonoApiChatDependencies, messageId: MiChatMessage['id'], userId: MiUser['id'], reactionInput: string): Promise<void> {
	const reaction = await resolveChatReactionForHonoApi(deps, reactionInput, false);

	const message = await fetchChatMessageByIdOrFailFromDatabase(deps.db, messageId);
	const room = message.toRoomId ? await fetchChatRoomByIdOrFailFromDatabase(deps.db, message.toRoomId) : null;

	await removeChatMessageReactionInDatabase(deps.db, message.id, userId, reaction);

	if (room) {
		deps.publishChatRoomStream?.(room.id, 'unreact', {
			messageId: message.id,
			user: await packUserLiteForHonoApi(deps, userId),
			reaction,
		});
	} else {
		deps.publishChatUserStream?.(message.fromUserId, message.toUserId!, 'unreact', { messageId: message.id, reaction });
		deps.publishChatUserStream?.(message.toUserId!, message.fromUserId, 'unreact', { messageId: message.id, reaction });
	}
}

export async function getMyChatMembershipsForHonoApi(deps: HonoApiChatDependencies, userId: MiUser['id'], limit: number, sinceId?: string | null, untilId?: string | null): Promise<ChatRoomMembershipRow[]> {
	return await listChatRoomMembershipsByUserIdFromDatabase(deps.db, userId, { limit, ...resolveChatRoomRecordPagination({ sinceId, untilId }) });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

function noSuchRoomError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such room.', code: 'NO_SUCH_ROOM', id });
}

function noSuchMessageError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such message.', code: 'NO_SUCH_MESSAGE', id });
}

function noSuchUserError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id });
}

async function getUserForHonoApiChat(deps: HonoApiChatDependencies, userId: string): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw noSuchUserError('11795c64-40ea-4198-b06e-3c873ed9039d');
	return user;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export const chatHistoryParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	room: z.boolean().optional().default(false),
});

type ChatHistoryParams = { limit: number; room: boolean };

export async function handleHonoApiChatHistory(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessage'>[]> {
	const params = parseHonoApiParams(chatHistoryParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const history = params.room ? await chatRoomHistoryForHonoApi(deps, me.id, params.limit) : await chatUserHistoryForHonoApi(deps, me.id, params.limit);
	const packedMessages = await packChatMessagesDetailedForHonoApi(deps, history, me);

	if (params.room) {
		const roomIds = history.map(m => m.toRoomId!);
		const readStateMap = await getRoomChatReadStateMapForHonoApi(deps, me.id, roomIds);
		for (const message of packedMessages) {
			message.isRead = readStateMap[message.toRoomId!] ?? false;
		}
	} else {
		const otherIds = history.map(m => m.fromUserId === me.id ? m.toUserId! : m.fromUserId!);
		const readStateMap = await getUserChatReadStateMapForHonoApi(deps, me.id, otherIds);
		for (const message of packedMessages) {
			const otherId = message.fromUserId === me.id ? message.toUserId! : message.fromUserId!;
			message.isRead = readStateMap[otherId] ?? false;
		}
	}

	return packedMessages;
}

export const chatReadAllParamDef = z.object({});

export async function handleHonoApiChatReadAll(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	parseHonoApiParams(chatReadAllParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');
	await readAllChatMessagesForHonoApi(deps, me.id);
}

export const chatMessagesCreateToUserParamDef = z.object({
	text: z.string().max(2000).nullable().optional(),
	fileId: misskeyId().optional(),
	toUserId: misskeyId(),
});

type ChatMessagesCreateToUserParams = { text?: string | null; fileId?: string; toUserId: string };

export async function handleHonoApiChatMessagesCreateToUser(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessageLiteFor1on1'>> {
	const params = parseHonoApiParams(chatMessagesCreateToUserParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	let file = null;
	if (params.fileId != null) {
		file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
		if (file == null) throw new HonoApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id: '4372b8e2-185d-4146-8749-2f68864a3e5f' });
	}

	if (params.text == null && file == null) {
		throw new HonoApiError({ status: 400, message: 'Content required. You need to set text or fileId.', code: 'CONTENT_REQUIRED', id: '25587321-b0e6-449c-9239-f8925092942c' });
	}

	if (params.toUserId === me.id) {
		throw new HonoApiError({ status: 400, message: 'You can not send a message to yourself.', code: 'RECIPIENT_IS_YOURSELF', id: '17e2ba79-e22a-4cbc-bf91-d327643f4a7e' });
	}

	const toUser = await getUserForHonoApiChat(deps, params.toUserId);

	return await createChatMessageToUserForHonoApi(deps, me, toUser, { text: params.text, file });
}

export const chatMessagesCreateToRoomParamDef = z.object({
	text: z.string().max(2000).nullable().optional(),
	fileId: misskeyId().optional(),
	toRoomId: misskeyId(),
});

type ChatMessagesCreateToRoomParams = { text?: string | null; fileId?: string; toRoomId: string };

export async function handleHonoApiChatMessagesCreateToRoom(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessageLiteForRoom'>> {
	const params = parseHonoApiParams(chatMessagesCreateToRoomParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	const room = await findChatRoomByIdForHonoApi(deps, params.toRoomId);
	if (room == null) throw noSuchRoomError('8098520d-2da5-4e8f-8ee1-df78b55a4ec6');

	let file = null;
	if (params.fileId != null) {
		file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
		if (file == null) throw new HonoApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db' });
	}

	if (params.text == null && file == null) {
		throw new HonoApiError({ status: 400, message: 'Content required. You need to set text or fileId.', code: 'CONTENT_REQUIRED', id: '340517b7-6d04-42c0-bac1-37ee804e3594' });
	}

	return await createChatMessageToRoomForHonoApi(deps, me, room, { text: params.text, file });
}

export const chatMessagesDeleteParamDef = z.object({
	messageId: misskeyId(),
});

type ChatMessagesDeleteParams = { messageId: string };

export async function handleHonoApiChatMessagesDelete(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatMessagesDeleteParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	const message = await fetchChatMessageByIdAndFromUserIdFromDatabase(deps.db, params.messageId, me.id);
	if (message == null) throw noSuchMessageError('36b67f0e-66a6-414b-83df-992a55294f17');

	await deleteChatMessageForHonoApi(deps, message);
}

export const chatMessagesReactParamDef = z.object({
	messageId: misskeyId(),
	reaction: z.string(),
});

type ChatMessagesReactParams = { messageId: string; reaction: string };

export async function handleHonoApiChatMessagesReact(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatMessagesReactParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');
	await reactToChatMessageForHonoApi(deps, params.messageId, me.id, params.reaction);
}

export const chatMessagesUnreactParamDef = z.object({
	messageId: misskeyId(),
	reaction: z.string(),
});

type ChatMessagesUnreactParams = { messageId: string; reaction: string };

export async function handleHonoApiChatMessagesUnreact(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatMessagesUnreactParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');
	await unreactToChatMessageForHonoApi(deps, params.messageId, me.id, params.reaction);
}

export const chatMessagesRoomTimelineParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	roomId: misskeyId(),
});

type ChatMessagesRoomTimelineParams = { limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number; roomId: string };

export async function handleHonoApiChatMessagesRoomTimeline(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
	const params = parseHonoApiParams(chatMessagesRoomTimelineParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const room = await findChatRoomByIdForHonoApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('c4d9f88c-9270-4632-b032-6ed8cee36f7f');

	if (!await hasPermissionToViewRoomTimelineForHonoApi(deps, me.id, room)) {
		throw noSuchRoomError('c4d9f88c-9270-4632-b032-6ed8cee36f7f');
	}

	const messages = await chatRoomTimelineForHonoApi(deps, room.id, params.limit, sinceId, untilId);

	void readRoomChatMessageForHonoApi(deps, me.id, room.id);

	return await packChatMessagesLiteForRoomForHonoApi(deps, messages);
}

export const chatMessagesSearchParamDef = z.object({
	query: z.string().min(1).max(256),
	limit: z.number().int().min(1).max(100).optional().default(10),
	userId: misskeyId().nullable().optional(),
	roomId: misskeyId().nullable().optional(),
});

type ChatMessagesSearchParams = { query: string; limit: number; userId?: string | null; roomId?: string | null };

export async function handleHonoApiChatMessagesSearch(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessage'>[]> {
	const params = parseHonoApiParams(chatMessagesSearchParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	if (params.roomId != null) {
		const room = await findChatRoomByIdForHonoApi(deps, params.roomId);
		if (room == null) throw noSuchRoomError('460b3669-81b0-4dc9-a997-44442141bf83');
		if (!(await isChatRoomMemberForHonoApi(deps, room, me.id))) throw noSuchRoomError('460b3669-81b0-4dc9-a997-44442141bf83');
	}

	const messages = await searchChatMessagesForHonoApi(deps, me.id, params.query, params.limit, { userId: params.userId, roomId: params.roomId });

	return await packChatMessagesDetailedForHonoApi(deps, messages, me);
}

export const chatMessagesShowParamDef = z.object({
	messageId: misskeyId(),
});

type ChatMessagesShowParams = { messageId: string };

export async function handleHonoApiChatMessagesShow(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessage'>> {
	const params = parseHonoApiParams(chatMessagesShowParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const message = await fetchChatMessageByIdFromDatabase(deps.db, params.messageId);
	if (message == null) throw noSuchMessageError('3710865b-1848-4da9-8d61-cfed15510b93');
	if (message.fromUserId !== me.id && message.toUserId !== me.id && !(await isHonoApiModerator(deps, me))) {
		throw noSuchMessageError('3710865b-1848-4da9-8d61-cfed15510b93');
	}

	return await packChatMessageDetailedForHonoApi(deps, message, me);
}

export const chatMessagesUserTimelineParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	userId: misskeyId(),
});

type ChatMessagesUserTimelineParams = { limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number; userId: string };

export async function handleHonoApiChatMessagesUserTimeline(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatMessageLiteFor1on1'>[]> {
	const params = parseHonoApiParams(chatMessagesUserTimelineParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const other = await getUserForHonoApiChat(deps, params.userId);

	const messages = await chatUserTimelineForHonoApi(deps, me.id, other.id, params.limit, sinceId, untilId);

	void readUserChatMessageForHonoApi(deps, me.id, other.id);

	return await packChatMessagesLiteFor1on1ForHonoApi(deps, messages);
}

export const chatRoomsCreateParamDef = z.object({
	name: z.string().max(256),
	description: z.string().max(1024).optional(),
});

type ChatRoomsCreateParams = { name: string; description?: string };

export async function handleHonoApiChatRoomsCreate(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoom'>> {
	const params = parseHonoApiParams(chatRoomsCreateParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	const room = await createChatRoomForHonoApi(deps, me, { name: params.name, description: params.description ?? '' });
	return await packChatRoomForHonoApi(deps, room);
}

export const chatRoomsDeleteParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsDeleteParams = { roomId: string };

export async function handleHonoApiChatRoomsDelete(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatRoomsDeleteParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	const room = await findChatRoomByIdForHonoApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');

	if (!await hasPermissionToDeleteRoomForHonoApi(deps, me.id, room)) throw noSuchRoomError('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');

	await deleteChatRoomForHonoApi(deps, room, me);
}

export const chatRoomsUpdateParamDef = z.object({
	roomId: misskeyId(),
	name: z.string().max(256).optional(),
	description: z.string().max(1024).optional(),
});

type ChatRoomsUpdateParams = { roomId: string; name?: string; description?: string };

export async function handleHonoApiChatRoomsUpdate(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoom'>> {
	const params = parseHonoApiParams(chatRoomsUpdateParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	const room = await findMyChatRoomByIdForHonoApi(deps, me.id, params.roomId);
	if (room == null) throw noSuchRoomError('fcdb0f92-bda6-47f9-bd05-343e0e020932');

	const updated = await updateChatRoomForHonoApi(deps, room, { name: params.name, description: params.description });
	return await packChatRoomForHonoApi(deps, updated, me);
}

export const chatRoomsShowParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsShowParams = { roomId: string };

export async function handleHonoApiChatRoomsShow(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoom'>> {
	const params = parseHonoApiParams(chatRoomsShowParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const room = await findChatRoomByIdForHonoApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('857ae02f-8759-4d20-9adb-6e95fffe4fd7');

	if (!await hasPermissionToViewRoomInfoForHonoApi(deps, me.id, room)) throw noSuchRoomError('857ae02f-8759-4d20-9adb-6e95fffe4fd7');

	return await packChatRoomForHonoApi(deps, room, me);
}

export const chatRoomsOwnedParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ChatRoomsOwnedParams = { limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number };

export async function handleHonoApiChatRoomsOwned(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoom'>[]> {
	const params = parseHonoApiParams(chatRoomsOwnedParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const rooms = await getOwnedChatRoomsWithPaginationForHonoApi(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomsForHonoApi(deps, rooms, me);
}

export const chatRoomsJoinParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsJoinParams = { roomId: string };

export async function handleHonoApiChatRoomsJoin(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatRoomsJoinParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');
	await joinToChatRoomForHonoApi(deps, me.id, params.roomId);
}

export const chatRoomsJoiningParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ChatRoomsJoiningParams = { limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number };

export async function handleHonoApiChatRoomsJoining(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoomMembership'>[]> {
	const params = parseHonoApiParams(chatRoomsJoiningParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const memberships = await getMyChatMembershipsForHonoApi(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomMembershipsForHonoApi(deps, memberships, me, { populateUser: false, populateRoom: true });
}

export const chatRoomsLeaveParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsLeaveParams = { roomId: string };

export async function handleHonoApiChatRoomsLeave(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatRoomsLeaveParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');
	await leaveChatRoomForHonoApi(deps, me.id, params.roomId);
}

export const chatRoomsMembersParamDef = z.object({
	roomId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ChatRoomsMembersParams = { roomId: string; limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number };

export async function handleHonoApiChatRoomsMembers(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoomMembership'>[]> {
	const params = parseHonoApiParams(chatRoomsMembersParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const room = await findChatRoomByIdForHonoApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('7b9fe84c-eafc-4d21-bf89-485458ed2c18');

	if (!(await isChatRoomMemberForHonoApi(deps, room, me.id))) throw noSuchRoomError('7b9fe84c-eafc-4d21-bf89-485458ed2c18');

	const memberships = await getRoomChatMembershipsWithPaginationForHonoApi(deps, room.id, params.limit, sinceId, untilId);
	return await packChatRoomMembershipsForHonoApi(deps, memberships, me, { populateUser: true, populateRoom: false });
}

export const chatRoomsMuteParamDef = z.object({
	roomId: misskeyId(),
	mute: z.boolean(),
});

type ChatRoomsMuteParams = { roomId: string; mute: boolean };

export async function handleHonoApiChatRoomsMute(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatRoomsMuteParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');
	await muteChatRoomForHonoApi(deps, me.id, params.roomId, params.mute);
}

export const chatRoomsInvitationsCreateParamDef = z.object({
	roomId: misskeyId(),
	userId: misskeyId(),
});

type ChatRoomsInvitationsCreateParams = { roomId: string; userId: string };

export async function handleHonoApiChatRoomsInvitationsCreate(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoomInvitation'>> {
	const params = parseHonoApiParams(chatRoomsInvitationsCreateParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');

	const room = await findMyChatRoomByIdForHonoApi(deps, me.id, params.roomId);
	if (room == null) throw noSuchRoomError('916f9507-49ba-4e90-b57f-1fd4deaa47a5');

	const invitation = await createChatRoomInvitationForHonoApi(deps, me.id, room.id, params.userId);
	return await packChatRoomInvitationForHonoApi(deps, invitation, me);
}

export const chatRoomsInvitationsIgnoreParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsInvitationsIgnoreParams = { roomId: string };

export async function handleHonoApiChatRoomsInvitationsIgnore(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(chatRoomsInvitationsIgnoreParamDef, body);
	await checkChatAvailabilityForHonoApi(deps, me.id, 'write');
	await ignoreChatRoomInvitationForHonoApi(deps, me.id, params.roomId);
}

export const chatRoomsInvitationsInboxParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ChatRoomsInvitationsInboxParams = { limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number };

export async function handleHonoApiChatRoomsInvitationsInbox(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoomInvitation'>[]> {
	const params = parseHonoApiParams(chatRoomsInvitationsInboxParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const invitations = await getReceivedChatRoomInvitationsWithPaginationForHonoApi(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomInvitationsForHonoApi(deps, invitations, me);
}

export const chatRoomsInvitationsOutboxParamDef = z.object({
	roomId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ChatRoomsInvitationsOutboxParams = { roomId: string; limit: number; sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number };

export async function handleHonoApiChatRoomsInvitationsOutbox(deps: HonoApiChatDependencies, me: MiLocalUser, body: Record<string, unknown>): Promise<Packed<'ChatRoomInvitation'>[]> {
	const params = parseHonoApiParams(chatRoomsInvitationsOutboxParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForHonoApi(deps, me.id, 'read');

	const room = await findMyChatRoomByIdForHonoApi(deps, me.id, params.roomId);
	if (room == null) throw noSuchRoomError('a3c6b309-9717-4316-ae94-a69b53437237');

	const invitations = await getSentChatRoomInvitationsWithPaginationForHonoApi(deps, room.id, params.limit, sinceId, untilId);
	return await packChatRoomInvitationsForHonoApi(deps, invitations, me);
}
