/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import { createChatApprovalInDatabase, listChatApprovalsBetweenUsers } from '@/core/chat/ChatApprovalStore.js';
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
} from '@/core/chat/ChatMessageStore.js';
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
	fetchChatRoomInvitationByIdOrFailFromDatabase,
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
	resolveChatRoomRecordPagination,
	updateChatRoomInDatabase,
	updateChatRoomInvitationIgnoredFromDatabase,
	updateChatRoomMembershipMuteFromDatabase,
} from '@/core/chat/ChatRoomStore.js';
import { fetchDriveFileByIdAndUserIdFromDatabase } from '@/core/drive/DriveFileStore.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/emoji/EmojiStore.js';
import { followingExistsInDatabase } from '@/core/user/FollowingStore.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { countMutualFollowingsBetweenUsersFromDatabase } from '@/core/user/FollowingStore.js';
import { mutingExistsInDatabase } from '@/core/user/MutingStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import {
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	listUsersByIdsFromDatabase,
} from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/UserProfileStore.js';
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
import { xaddApiNotification, type ApiNotificationDependencies } from '../notification/notification.js';
import { ApiError, invalidParamError } from '../error.js';
import type { ApiChatRoomStreamPublisher, ApiChatUserStreamPublisher, ApiMainStreamPublisher } from '../events.js';
import {
	packDriveFileForApi,
	packDriveFileManyByIdsForApi,
	type ApiDriveFileDependencies,
} from '../drive/drive-file.js';
import { packUserLiteForApi, packUserLiteManyForApi } from '../user/user.js';
import { getApiRolePolicies, isApiModerator, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';
import { pushSwNotificationForApi } from '../notification/push-notification.js';

export type ApiChatDependencies = ApiDriveFileDependencies &
	ApiRolePolicyDependencies &
	ApiNotificationDependencies & {
		publishChatUserStream?: ApiChatUserStreamPublisher;
		publishChatRoomStream?: ApiChatRoomStreamPublisher;
		publishMainStream?: ApiMainStreamPublisher;
	};

const MAX_ROOM_MEMBERS = 50;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

function normalizeEmojiStringForApi(x: string): string {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replaceAll(/\ufe0f/g, '');
	} else {
		throw invalidParamError({ param: 'reaction', reason: 'invalid emoji' });
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

async function packChatMessageUsersForApi(
	deps: ApiChatDependencies,
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

	const idsToFetch = [...new Set([...requiredUserIds, ...reactionUserIds])].filter(
		(id) => !explicitUsers.has(id) && !packedUsers.has(id) && !missingUserIds.has(id),
	);
	const fetchedUsers = await listUsersByIdsFromDatabase(deps.db, idsToFetch, { includeSuspended: true });
	const userById = new Map([...explicitUsers.values(), ...fetchedUsers].map((user) => [user.id, user]));
	const missingRequiredUserId = [...requiredUserIds].find((id) => !userById.has(id) && !packedUsers.has(id));
	if (missingRequiredUserId != null) {
		throw new EntityNotFoundError('MiUser', { id: missingRequiredUserId });
	}

	const newlyPackedUsers = await packUserLiteManyForApi(
		deps,
		[...userById.values()].filter((user) => !packedUsers.has(user.id)),
	);
	for (const user of newlyPackedUsers) packedUsers.set(user.id, user);
	for (const userId of reactionUserIds) {
		if (!packedUsers.has(userId)) missingUserIds.add(userId);
	}
	return { packedUsers, missingUserIds };
}

export async function packChatMessageDetailedForApi(
	deps: ApiChatDependencies,
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
	const { packedUsers } = await packChatMessageUsersForApi(
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
			packedUsers?.get(message.fromUserId) ?? (await packUserLiteForApi(deps, message.fromUser ?? message.fromUserId)),
		toUserId: message.toUserId,
		toUser: message.toUserId
			? (packedUsers?.get(message.toUserId) ?? (await packUserLiteForApi(deps, message.toUser ?? message.toUserId)))
			: undefined,
		toRoomId: message.toRoomId,
		toRoom: message.toRoomId
			? (packedRooms?.get(message.toRoomId) ?? (await packChatRoomForApi(deps, message.toRoom ?? message.toRoomId, me)))
			: undefined,
		fileId: message.fileId,
		file: message.fileId
			? (packedFiles?.get(message.fileId) ?? (await packDriveFileForApi(deps, message.file ?? message.fileId)))
			: null,
		reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r.user != null),
	} as Packed<'ChatMessage'>;
}

export async function packChatMessagesDetailedForApi(
	deps: ApiChatDependencies,
	messages: MiChatMessage[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatMessage'>[]> {
	if (messages.length === 0) return [];

	const [packedUserData, packedFiles, packedRooms] = await Promise.all([
		packChatMessageUsersForApi(deps, messages),
		packDriveFileManyByIdsForApi(
			deps,
			messages.map((m) => m.fileId).filter((x): x is string => x != null),
		).then((files) => new Map(files.map((f) => [f.id, f as Packed<'DriveFile'> | null]))),
		packChatRoomsForApi(
			deps,
			messages.map((m) => m.toRoom ?? m.toRoomId).filter((x): x is MiChatRoom | string => x != null),
			me,
		).then((rooms) => new Map(rooms.map((r) => [r.id, r]))),
	]);

	return await Promise.all(
		messages.map((message) =>
			packChatMessageDetailedForApi(deps, message, me, { _hint_: { ...packedUserData, packedFiles, packedRooms } }),
		),
	);
}

async function packChatMessageLiteFor1on1ForApi(
	deps: ApiChatDependencies,
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
			? (packedFiles?.get(message.fileId) ?? (await packDriveFileForApi(deps, message.file ?? message.fileId)))
			: null,
		reactions,
	} as Packed<'ChatMessageLiteFor1on1'>;
}

async function packChatMessagesLiteFor1on1ForApi(
	deps: ApiChatDependencies,
	messages: MiChatMessage[],
): Promise<Packed<'ChatMessageLiteFor1on1'>[]> {
	if (messages.length === 0) return [];

	const packedFiles = await packDriveFileManyByIdsForApi(
		deps,
		messages.map((m) => m.fileId).filter((x): x is string => x != null),
	).then((files) => new Map(files.map((f) => [f.id, f as Packed<'DriveFile'> | null])));

	return await Promise.all(
		messages.map((message) => packChatMessageLiteFor1on1ForApi(deps, message, { _hint_: { packedFiles } })),
	);
}

async function packChatMessageLiteForRoomForApi(
	deps: ApiChatDependencies,
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
			user: packedUsers?.get(userId) ?? (await packUserLiteForApi(deps, userId).catch(() => null)),
			reaction,
		});
	}

	return {
		id: message.id,
		createdAt: parseId(message.id).date.toISOString(),
		text: message.text,
		fromUserId: message.fromUserId,
		fromUser:
			packedUsers?.get(message.fromUserId) ?? (await packUserLiteForApi(deps, message.fromUser ?? message.fromUserId)),
		toRoomId: message.toRoomId!,
		fileId: message.fileId,
		file: message.fileId
			? (packedFiles?.get(message.fileId) ?? (await packDriveFileForApi(deps, message.file ?? message.fileId)))
			: null,
		reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string } => r.user != null),
	} as Packed<'ChatMessageLiteForRoom'>;
}

async function packChatMessagesLiteForRoomForApi(
	deps: ApiChatDependencies,
	messages: MiChatMessage[],
): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
	if (messages.length === 0) return [];

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
		packUserLiteManyForApi(deps, users).then((users) => new Map(users.map((u) => [u.id, u]))),
		packDriveFileManyByIdsForApi(
			deps,
			messages.map((m) => m.fileId).filter((x): x is string => x != null),
		).then((files) => new Map(files.map((f) => [f.id, f as Packed<'DriveFile'> | null]))),
	]);

	return await Promise.all(
		messages.map((message) =>
			packChatMessageLiteForRoomForApi(deps, message, { _hint_: { packedFiles, packedUsers } }),
		),
	);
}

async function packChatRoomForApi(
	deps: ApiChatDependencies,
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

	const membership =
		me && me.id !== room.ownerId
			? options?._hint_?.myMemberships?.has(room.id)
				? (options._hint_.myMemberships.get(room.id) ?? null)
				: await fetchChatRoomMembershipFromDatabase(deps.db, room.id, me.id)
			: null;
	const invitation =
		me && me.id !== room.ownerId
			? options?._hint_?.myInvitations?.has(room.id)
				? (options._hint_.myInvitations.get(room.id) ?? null)
				: await fetchChatRoomInvitationFromDatabase(deps.db, room.id, me.id)
			: null;

	return {
		id: room.id,
		createdAt: parseId(room.id).date.toISOString(),
		name: room.name,
		description: room.description,
		ownerId: room.ownerId,
		owner:
			options?._hint_?.packedOwners.get(room.ownerId) ?? (await packUserLiteForApi(deps, room.owner ?? room.ownerId)),
		isMuted: membership != null ? membership.isMuted : false,
		invitationExists: invitation != null,
	} as Packed<'ChatRoom'>;
}

async function packChatRoomsForApi(
	deps: ApiChatDependencies,
	rooms: (MiChatRoom | MiChatRoom['id'])[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatRoom'>[]> {
	if (rooms.length === 0) return [];

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
		packUserLiteManyForApi(deps, owners).then((users) => new Map(users.map((u) => [u.id, u]))),
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
		_rooms.map((room) =>
			packChatRoomForApi(deps, room, me, { _hint_: { packedOwners, myMemberships, myInvitations } }),
		),
	);
}

export async function packChatRoomInvitationForApi(
	deps: ApiChatDependencies,
	src: ChatRoomInvitationRow['id'] | ChatRoomInvitationPackable,
	me: { id: MiUser['id'] },
	options?: {
		_hint_?: {
			packedRooms: Map<ChatRoomInvitationRow['roomId'], Packed<'ChatRoom'>>;
			packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
		};
	},
): Promise<Packed<'ChatRoomInvitation'>> {
	const invitation: ChatRoomInvitationPackable =
		typeof src === 'object' ? src : await fetchChatRoomInvitationByIdOrFailFromDatabase(deps.db, src);

	return {
		id: invitation.id,
		createdAt: parseId(invitation.id).date.toISOString(),
		roomId: invitation.roomId,
		room:
			options?._hint_?.packedRooms.get(invitation.roomId) ??
			(await packChatRoomForApi(deps, invitation.room ?? invitation.roomId, me)),
		userId: invitation.userId,
		user:
			options?._hint_?.packedUsers.get(invitation.userId) ??
			(await packUserLiteForApi(deps, invitation.user ?? invitation.userId)),
	} as Packed<'ChatRoomInvitation'>;
}

export async function packChatRoomInvitationsForApi(
	deps: ApiChatDependencies,
	invitations: ChatRoomInvitationPackable[],
	me: { id: MiUser['id'] },
): Promise<Packed<'ChatRoomInvitation'>[]> {
	if (invitations.length === 0) return [];

	const [packedRooms, packedUsers] = await Promise.all([
		packChatRoomsForApi(
			deps,
			invitations.map((invitation) => invitation.room ?? invitation.roomId),
			me,
		).then((rooms) => new Map(rooms.map((room) => [room.id, room]))),
		packUserLiteManyForApi(
			deps,
			invitations.map((invitation) => invitation.user ?? invitation.userId),
		).then((users) => new Map(users.map((user) => [user.id, user]))),
	]);

	return await Promise.all(
		invitations.map((invitation) =>
			packChatRoomInvitationForApi(deps, invitation, me, { _hint_: { packedRooms, packedUsers } }),
		),
	);
}

async function packChatRoomMembershipForApi(
	deps: ApiChatDependencies,
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
				(await packUserLiteForApi(deps, membership.user ?? membership.userId)))
			: undefined,
		roomId: membership.roomId,
		room: options?.populateRoom
			? (options._hint_?.packedRooms?.get(membership.roomId) ??
				(await packChatRoomForApi(deps, membership.room ?? membership.roomId, me)))
			: undefined,
	} as Packed<'ChatRoomMembership'>;
}

async function packChatRoomMembershipsForApi(
	deps: ApiChatDependencies,
	memberships: ChatRoomMembershipPackable[],
	me: { id: MiUser['id'] },
	options: { populateUser?: boolean; populateRoom?: boolean } = {},
): Promise<Packed<'ChatRoomMembership'>[]> {
	if (memberships.length === 0) return [];

	const [packedUsers, packedRooms] = await Promise.all([
		options.populateUser
			? packUserLiteManyForApi(
					deps,
					memberships.map((x) => x.user ?? x.userId),
				).then((users) => new Map(users.map((u) => [u.id, u])))
			: Promise.resolve(undefined),
		options.populateRoom
			? packChatRoomsForApi(
					deps,
					memberships.map((x) => x.room ?? x.roomId),
					me,
				).then((rooms) => new Map(rooms.map((r) => [r.id, r])))
			: Promise.resolve(undefined),
	]);

	return await Promise.all(
		memberships.map((membership) =>
			packChatRoomMembershipForApi(deps, membership, me, {
				...options,
				_hint_: omitUndefined({ packedUsers, packedRooms }),
			}),
		),
	);
}

// ---------------------------------------------------------------------------
// ChatService のサービスロジック。
// ---------------------------------------------------------------------------

async function getChatAvailabilityForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
): Promise<{ read: boolean; write: boolean }> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	const policies = await getApiRolePolicies(deps, user);

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

export async function checkChatAvailabilityForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	permission: 'read' | 'write',
): Promise<void> {
	const policy = await getChatAvailabilityForApi(deps, userId);
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

async function pushChatNotificationForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	body: Packed<'ChatMessage'>,
): Promise<void> {
	await pushSwNotificationForApi(deps, userId, 'newChatMessage', body);
}

// notifierId を考慮したフィルタ (never/following/follower/mutualFollow/
// followingOrFollower と mute 判定) を DB から直接読み、現在の関係で通知可否を判定する。
async function createChatRoomInvitationNotificationForApi(
	deps: ApiChatDependencies,
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
		if (!(await followingExistsInDatabase(deps.db, notifieeId, notifierId))) return;
	} else if (receiveConfig?.type === 'follower') {
		if (!(await followingExistsInDatabase(deps.db, notifierId, notifieeId))) return;
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
	await xaddApiNotification(deps, notifieeId, notification);

	deps.publishMainStream?.(notifieeId, 'notification', notification);
	void pushSwNotificationForApi(deps, notifieeId, 'notification', notification);
}

async function createChatMessageToUserForApi(
	deps: ApiChatDependencies,
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
			if (!(await followingExistsInDatabase(deps.db, fromUser.id, toUser.id))) throw chatNotAvailableError();
		} else if (toUser.chatScope === 'following') {
			if (!(await followingExistsInDatabase(deps.db, toUser.id, fromUser.id))) throw chatNotAvailableError();
		} else if (toUser.chatScope === 'mutual') {
			const count = await countMutualFollowingsBetweenUsersFromDatabase(deps.db, fromUser.id, toUser.id);
			if (count !== 2) throw chatNotAvailableError();
		}
	}

	if (!(await getChatAvailabilityForApi(deps, toUser.id)).write) {
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

	const packedMessage = await packChatMessageLiteFor1on1ForApi(deps, inserted);

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
			if (marker == null) return;

			const packedMessageForTo = await packChatMessageDetailedForApi(deps, inserted, toUser);
			deps.publishMainStream?.(toUser.id, 'newChatMessage', packedMessageForTo);
			void pushChatNotificationForApi(deps, toUser.id, packedMessageForTo);
		}, 3000);
	}

	return packedMessage;
}

async function createChatMessageToRoomForApi(
	deps: ApiChatDependencies,
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
	const packedMessage = await packChatMessageLiteForRoomForApi(deps, inserted);

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

		if (markers.every((marker) => marker[1] == null)) return;

		const packedMessageForTo = await packChatMessageDetailedForApi(deps, inserted);

		for (let i = 0; i < membershipsOtherThanMe.length; i++) {
			const marker = markers[i]![1];
			if (marker == null) continue;

			deps.publishMainStream?.(membershipsOtherThanMe[i]!.userId, 'newChatMessage', packedMessageForTo);
			void pushChatNotificationForApi(deps, membershipsOtherThanMe[i]!.userId, packedMessageForTo);
		}
	}, 3000);

	return packedMessage;
}

export async function readUserChatMessageForApi(
	deps: ApiChatDependencies,
	readerId: MiUser['id'],
	senderId: MiUser['id'],
): Promise<void> {
	await deps.redis
		.pipeline()
		.del(`newUserChatMessageExists:${readerId}:${senderId}`)
		.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`)
		.exec();
}

export async function readRoomChatMessageForApi(
	deps: ApiChatDependencies,
	readerId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<void> {
	await deps.redis
		.pipeline()
		.del(`newRoomChatMessageExists:${readerId}:${roomId}`)
		.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`)
		.exec();
}

async function readAllChatMessagesForApi(deps: ApiChatDependencies, readerId: MiUser['id']): Promise<void> {
	await deps.redis.pipeline().del(`newChatMessagesExists:${readerId}`).exec();
}

export async function hasPermissionToViewRoomTimelineForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	room: MiChatRoom,
): Promise<boolean> {
	if (await isChatRoomMemberForApi(deps, room, meId)) return true;
	return await isApiModerator(deps, { id: meId } as MiUser);
}

async function deleteChatMessageForApi(deps: ApiChatDependencies, message: MiChatMessage): Promise<void> {
	await deleteChatMessageByIdFromDatabase(deps.db, message.id);

	if (message.toUserId) {
		const [fromUser, toUser] = await Promise.all([
			fetchUserByIdOrFailFromDatabase(deps.db, message.fromUserId),
			fetchUserByIdOrFailFromDatabase(deps.db, message.toUserId),
		]);

		if (fromUser.host == null)
			deps.publishChatUserStream?.(message.fromUserId, message.toUserId, 'deleted', message.id);
		if (toUser.host == null) deps.publishChatUserStream?.(message.toUserId, message.fromUserId, 'deleted', message.id);
	} else if (message.toRoomId) {
		deps.publishChatRoomStream?.(message.toRoomId, 'deleted', message.id);
	}
}

async function chatUserTimelineForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	otherId: MiUser['id'],
	limit: number,
	sinceId?: MiChatMessage['id'] | null,
	untilId?: MiChatMessage['id'] | null,
): Promise<MiChatMessage[]> {
	return await listChatMessagesBetweenUsersFromDatabase(deps.db, meId, otherId, {
		limit,
		...resolveChatMessagePagination({ gen: (time) => genId(time) }, omitUndefined({ sinceId, untilId })),
	});
}

async function chatRoomTimelineForApi(
	deps: ApiChatDependencies,
	roomId: MiChatRoom['id'],
	limit: number,
	sinceId?: MiChatMessage['id'] | null,
	untilId?: MiChatMessage['id'] | null,
): Promise<MiChatMessage[]> {
	return await listChatMessagesByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveChatMessagePagination({ gen: (time) => genId(time) }, omitUndefined({ sinceId, untilId })),
	});
}

async function chatUserHistoryForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	limit: number,
): Promise<MiChatMessage[]> {
	return await listUserChatHistoryFromDatabase(deps.db, meId, limit);
}

async function chatRoomHistoryForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	limit: number,
): Promise<MiChatMessage[]> {
	return await listRoomChatHistoryFromDatabase(deps.db, meId, limit);
}

async function getUserChatReadStateMapForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	otherIds: MiUser['id'][],
): Promise<Record<MiUser['id'], boolean>> {
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

async function getRoomChatReadStateMapForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	roomIds: MiChatRoom['id'][],
): Promise<Record<MiChatRoom['id'], boolean>> {
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

export async function createChatRoomForApi(
	deps: ApiChatDependencies,
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

async function hasPermissionToViewRoomInfoForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	room: MiChatRoom,
): Promise<boolean> {
	if (room.ownerId === meId) return true;
	if (await isChatRoomMemberForApi(deps, room, meId)) return true;
	if (await fetchChatRoomInvitationFromDatabase(deps.db, room.id, meId)) return true;
	return await isApiModerator(deps, { id: meId } as MiUser);
}

async function hasPermissionToDeleteRoomForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	room: MiChatRoom,
): Promise<boolean> {
	if (room.ownerId === meId) return true;
	return await isApiModerator(deps, { id: meId } as MiUser);
}

async function deleteChatRoomForApi(deps: ApiChatDependencies, room: MiChatRoom, deleter?: MiUser): Promise<void> {
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
		if (await isApiModerator(deps, deleter)) {
			await logModerationEventInDatabase(deps, deleter, 'deleteChatRoom', {
				roomId: room.id,
				room,
			});
		}
	}
}

async function findMyChatRoomByIdForApi(
	deps: ApiChatDependencies,
	ownerId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<MiChatRoom | null> {
	return await fetchChatRoomByIdAndOwnerIdFromDatabase(deps.db, roomId, ownerId);
}

async function findChatRoomByIdForApi(deps: ApiChatDependencies, roomId: MiChatRoom['id']): Promise<MiChatRoom | null> {
	return await fetchChatRoomByIdFromDatabase(deps.db, roomId);
}

async function isChatRoomMemberForApi(
	deps: ApiChatDependencies,
	room: MiChatRoom,
	userId: MiUser['id'],
): Promise<boolean> {
	if (room.ownerId === userId) return true;
	return (await fetchChatRoomMembershipFromDatabase(deps.db, room.id, userId)) != null;
}

async function createChatRoomInvitationForApi(
	deps: ApiChatDependencies,
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
		)
			throw cannotCreateChatRoomInvitationError();
		throw error;
	});

	void createChatRoomInvitationNotificationForApi(deps, inviteeId, invitation.id, inviterId);

	return created;
}

async function getSentChatRoomInvitationsWithPaginationForApi(
	deps: ApiChatDependencies,
	roomId: MiChatRoom['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomInvitationRow[]> {
	return await listChatRoomInvitationsByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveChatRoomRecordPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function getOwnedChatRoomsWithPaginationForApi(
	deps: ApiChatDependencies,
	ownerId: MiUser['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<MiChatRoom[]> {
	return await listChatRoomsByOwnerIdFromDatabase(deps.db, ownerId, {
		limit,
		...resolveChatRoomRecordPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function getReceivedChatRoomInvitationsWithPaginationForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomInvitationRow[]> {
	return await listChatRoomInvitationsByUserIdFromDatabase(deps.db, userId, {
		ignored: false,
		limit,
		...resolveChatRoomRecordPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function joinToChatRoomForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<void> {
	const invitation = await fetchChatRoomInvitationFromDatabase(deps.db, roomId, userId);
	if (invitation == null) throw noSuchRoomError('84416476-5ce8-4a2c-b568-9569f1b10733');

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
		if (error instanceof ChatRoomCapacityExceededError) throw cannotJoinChatRoomError();
		if (error instanceof ChatRoomInvitationNotFoundError || isDuplicateKeyValueDatabaseError(error)) {
			throw noSuchRoomError('84416476-5ce8-4a2c-b568-9569f1b10733');
		}
		throw error;
	});
}

async function ignoreChatRoomInvitationForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<void> {
	const invitation = await fetchChatRoomInvitationFromDatabase(deps.db, roomId, userId);
	if (invitation == null) throw noSuchRoomError('5130557e-5a11-4cfb-9cc5-fe60cda5de0d');
	await updateChatRoomInvitationIgnoredFromDatabase(deps.db, invitation.id, true);
}

async function leaveChatRoomForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	roomId: MiChatRoom['id'],
): Promise<void> {
	const membership = await fetchChatRoomMembershipFromDatabase(deps.db, roomId, userId);
	if (membership == null) throw noSuchRoomError('cb7f3179-50e8-4389-8c30-dbe2650a67c9');
	await deleteChatRoomMembershipByIdFromDatabase(deps.db, membership.id);

	await deps.redis
		.pipeline()
		.del(`newRoomChatMessageExists:${userId}:${roomId}`)
		.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`)
		.exec();
}

async function muteChatRoomForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	roomId: MiChatRoom['id'],
	mute: boolean,
): Promise<void> {
	const membership = await fetchChatRoomMembershipFromDatabase(deps.db, roomId, userId);
	if (membership == null) throw noSuchRoomError('c2cde4eb-8d0f-42f1-8f2f-c4d6bfc8e5df');
	await updateChatRoomMembershipMuteFromDatabase(deps.db, membership.id, mute);
}

async function updateChatRoomForApi(
	deps: ApiChatDependencies,
	room: MiChatRoom,
	params: { name?: string; description?: string },
): Promise<MiChatRoom> {
	return await updateChatRoomInDatabase(deps.db, room.id, params);
}

async function getRoomChatMembershipsWithPaginationForApi(
	deps: ApiChatDependencies,
	roomId: MiChatRoom['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomMembershipRow[]> {
	return await listChatRoomMembershipsByRoomIdFromDatabase(deps.db, roomId, {
		limit,
		...resolveChatRoomRecordPagination(omitUndefined({ sinceId, untilId })),
	});
}

async function searchChatMessagesForApi(
	deps: ApiChatDependencies,
	meId: MiUser['id'],
	query: string,
	limit: number,
	params: { userId?: MiUser['id'] | null; roomId?: MiChatRoom['id'] | null },
): Promise<MiChatMessage[]> {
	return await searchChatMessagesFromDatabase(deps.db, meId, query, limit, params);
}

async function resolveChatReactionForApi(
	deps: ApiChatDependencies,
	reactionInput: string,
	requireExists: boolean,
): Promise<string> {
	const custom = reactionInput.match(isCustomEmojiRegexp);

	if (custom == null) {
		return normalizeEmojiStringForApi(reactionInput);
	} else {
		const name = custom[1]!;
		if (requireExists) {
			const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, null);
			if (emoji == null) throw invalidParamError({ param: 'reaction', reason: 'no such emoji' });
		}
		return `:${name}:`;
	}
}

async function reactToChatMessageForApi(
	deps: ApiChatDependencies,
	messageId: MiChatMessage['id'],
	userId: MiUser['id'],
	reactionInput: string,
): Promise<void> {
	const reaction = await resolveChatReactionForApi(deps, reactionInput, true);

	const message = await fetchChatMessageByIdFromDatabase(deps.db, messageId);
	if (message == null) throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');

	if (message.fromUserId === userId) {
		throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
	}

	if (message.toRoomId === null && message.toUserId !== userId) {
		throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
	}

	if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
		throw tooManyChatMessageReactionsError();
	}

	const room = message.toRoomId ? await fetchChatRoomByIdOrFailFromDatabase(deps.db, message.toRoomId) : null;

	if (room) {
		if (!(await isChatRoomMemberForApi(deps, room, userId))) {
			throw noSuchMessageError('9b5839b9-0ba0-4351-8c35-37082093d200');
		}
	}

	await addChatMessageReactionInDatabase(deps.db, message.id, userId, reaction);

	if (room) {
		deps.publishChatRoomStream?.(room.id, 'react', {
			messageId: message.id,
			user: await packUserLiteForApi(deps, userId),
			reaction,
		});
	} else {
		deps.publishChatUserStream?.(message.fromUserId, message.toUserId!, 'react', { messageId: message.id, reaction });
		deps.publishChatUserStream?.(message.toUserId!, message.fromUserId, 'react', { messageId: message.id, reaction });
	}
}

async function unreactToChatMessageForApi(
	deps: ApiChatDependencies,
	messageId: MiChatMessage['id'],
	userId: MiUser['id'],
	reactionInput: string,
): Promise<void> {
	const reaction = await resolveChatReactionForApi(deps, reactionInput, false);

	const message = await fetchChatMessageByIdFromDatabase(deps.db, messageId);
	if (message == null) throw noSuchMessageError('c39ea42f-e3ca-428a-ad57-390e0a711595');
	if (message.fromUserId === userId || (message.toRoomId === null && message.toUserId !== userId)) {
		throw noSuchMessageError('c39ea42f-e3ca-428a-ad57-390e0a711595');
	}
	const room = message.toRoomId ? await fetchChatRoomByIdOrFailFromDatabase(deps.db, message.toRoomId) : null;
	if (room && !(await isChatRoomMemberForApi(deps, room, userId))) {
		throw noSuchMessageError('c39ea42f-e3ca-428a-ad57-390e0a711595');
	}

	await removeChatMessageReactionInDatabase(deps.db, message.id, userId, reaction);

	if (room) {
		deps.publishChatRoomStream?.(room.id, 'unreact', {
			messageId: message.id,
			user: await packUserLiteForApi(deps, userId),
			reaction,
		});
	} else {
		deps.publishChatUserStream?.(message.fromUserId, message.toUserId!, 'unreact', { messageId: message.id, reaction });
		deps.publishChatUserStream?.(message.toUserId!, message.fromUserId, 'unreact', { messageId: message.id, reaction });
	}
}

async function getMyChatMembershipsForApi(
	deps: ApiChatDependencies,
	userId: MiUser['id'],
	limit: number,
	sinceId?: string | null,
	untilId?: string | null,
): Promise<ChatRoomMembershipRow[]> {
	return await listChatRoomMembershipsByUserIdFromDatabase(deps.db, userId, {
		limit,
		...resolveChatRoomRecordPagination(omitUndefined({ sinceId, untilId })),
	});
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

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

async function getUserForApiChat(deps: ApiChatDependencies, userId: string): Promise<MiUser> {
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

export async function handleApiChatHistory(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessage'>[]> {
	const params = parseApiParams(chatHistoryParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const history = params.room
		? await chatRoomHistoryForApi(deps, me.id, params.limit)
		: await chatUserHistoryForApi(deps, me.id, params.limit);
	const packedMessages = await packChatMessagesDetailedForApi(deps, history, me);

	if (params.room) {
		const roomIds = history.map((m) => m.toRoomId!);
		const readStateMap = await getRoomChatReadStateMapForApi(deps, me.id, roomIds);
		for (const message of packedMessages) {
			message.isRead = readStateMap[message.toRoomId!] ?? false;
		}
	} else {
		const otherIds = history.map((m) => (m.fromUserId === me.id ? m.toUserId! : m.fromUserId!));
		const readStateMap = await getUserChatReadStateMapForApi(deps, me.id, otherIds);
		for (const message of packedMessages) {
			const otherId = message.fromUserId === me.id ? message.toUserId! : message.fromUserId!;
			message.isRead = readStateMap[otherId] ?? false;
		}
	}

	return packedMessages;
}

const chatReadAllParamDef = z.object({});

export async function handleApiChatReadAll(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	parseApiParams(chatReadAllParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'read');
	await readAllChatMessagesForApi(deps, me.id);
}

export const chatMessagesCreateToUserParamDef = z.object({
	text: z.string().max(2000).nullable().optional(),
	fileId: misskeyId().optional(),
	toUserId: misskeyId(),
});

type ChatMessagesCreateToUserParams = { text?: string | null; fileId?: string; toUserId: string };

export async function handleApiChatMessagesCreateToUser(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessageLiteFor1on1'>> {
	const params = parseApiParams(chatMessagesCreateToUserParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	let file = null;
	if (params.fileId != null) {
		file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
		if (file == null)
			throw new ApiError({
				status: 400,
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
				id: '4372b8e2-185d-4146-8749-2f68864a3e5f',
			});
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

	const toUser = await getUserForApiChat(deps, params.toUserId);

	return await createChatMessageToUserForApi(deps, me, toUser, omitUndefined({ text: params.text, file }));
}

export const chatMessagesCreateToRoomParamDef = z.object({
	text: z.string().max(2000).nullable().optional(),
	fileId: misskeyId().optional(),
	toRoomId: misskeyId(),
});

type ChatMessagesCreateToRoomParams = { text?: string | null; fileId?: string; toRoomId: string };

export async function handleApiChatMessagesCreateToRoom(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessageLiteForRoom'>> {
	const params = parseApiParams(chatMessagesCreateToRoomParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	const room = await findChatRoomByIdForApi(deps, params.toRoomId);
	if (room == null) throw noSuchRoomError('8098520d-2da5-4e8f-8ee1-df78b55a4ec6');

	let file = null;
	if (params.fileId != null) {
		file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
		if (file == null)
			throw new ApiError({
				status: 400,
				message: 'No such file.',
				code: 'NO_SUCH_FILE',
				id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
			});
	}

	if (params.text == null && file == null) {
		throw new ApiError({
			status: 400,
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '340517b7-6d04-42c0-bac1-37ee804e3594',
		});
	}

	return await createChatMessageToRoomForApi(deps, me, room, omitUndefined({ text: params.text, file }));
}

export const chatMessagesDeleteParamDef = z.object({
	messageId: misskeyId(),
});

type ChatMessagesDeleteParams = { messageId: string };

export async function handleApiChatMessagesDelete(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatMessagesDeleteParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	const message = await fetchChatMessageByIdAndFromUserIdFromDatabase(deps.db, params.messageId, me.id);
	if (message == null) throw noSuchMessageError('36b67f0e-66a6-414b-83df-992a55294f17');

	await deleteChatMessageForApi(deps, message);
}

export const chatMessagesReactParamDef = z.object({
	messageId: misskeyId(),
	reaction: z.string(),
});

type ChatMessagesReactParams = { messageId: string; reaction: string };

export async function handleApiChatMessagesReact(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatMessagesReactParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');
	await reactToChatMessageForApi(deps, params.messageId, me.id, params.reaction);
}

export const chatMessagesUnreactParamDef = z.object({
	messageId: misskeyId(),
	reaction: z.string(),
});

type ChatMessagesUnreactParams = { messageId: string; reaction: string };

export async function handleApiChatMessagesUnreact(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatMessagesUnreactParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');
	await unreactToChatMessageForApi(deps, params.messageId, me.id, params.reaction);
}

export const chatMessagesRoomTimelineParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
	roomId: misskeyId(),
});

type ChatMessagesRoomTimelineParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	roomId: string;
};

export async function handleApiChatMessagesRoomTimeline(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
	const params = parseApiParams(chatMessagesRoomTimelineParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const room = await findChatRoomByIdForApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('c4d9f88c-9270-4632-b032-6ed8cee36f7f');

	if (!(await hasPermissionToViewRoomTimelineForApi(deps, me.id, room))) {
		throw noSuchRoomError('c4d9f88c-9270-4632-b032-6ed8cee36f7f');
	}

	const messages = await chatRoomTimelineForApi(deps, room.id, params.limit, sinceId, untilId);

	void readRoomChatMessageForApi(deps, me.id, room.id);

	return await packChatMessagesLiteForRoomForApi(deps, messages);
}

export const chatMessagesSearchParamDef = z.object({
	query: z.string().min(1).max(256),
	limit: z.number().int().min(1).max(100).optional().default(10),
	userId: misskeyId().nullable().optional(),
	roomId: misskeyId().nullable().optional(),
});

type ChatMessagesSearchParams = { query: string; limit: number; userId?: string | null; roomId?: string | null };

export async function handleApiChatMessagesSearch(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessage'>[]> {
	const params = parseApiParams(chatMessagesSearchParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'read');

	if (params.roomId != null) {
		const room = await findChatRoomByIdForApi(deps, params.roomId);
		if (room == null) throw noSuchRoomError('460b3669-81b0-4dc9-a997-44442141bf83');
		if (!(await isChatRoomMemberForApi(deps, room, me.id)))
			throw noSuchRoomError('460b3669-81b0-4dc9-a997-44442141bf83');
	}

	const messages = await searchChatMessagesForApi(
		deps,
		me.id,
		params.query,
		params.limit,
		omitUndefined({ userId: params.userId, roomId: params.roomId }),
	);

	return await packChatMessagesDetailedForApi(deps, messages, me);
}

export const chatMessagesShowParamDef = z.object({
	messageId: misskeyId(),
});

type ChatMessagesShowParams = { messageId: string };

export async function handleApiChatMessagesShow(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessage'>> {
	const params = parseApiParams(chatMessagesShowParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const message = await fetchChatMessageByIdFromDatabase(deps.db, params.messageId);
	if (message == null) throw noSuchMessageError('3710865b-1848-4da9-8d61-cfed15510b93');
	if (message.fromUserId !== me.id && message.toUserId !== me.id && !(await isApiModerator(deps, me))) {
		throw noSuchMessageError('3710865b-1848-4da9-8d61-cfed15510b93');
	}

	return await packChatMessageDetailedForApi(deps, message, me);
}

export const chatMessagesUserTimelineParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
	userId: misskeyId(),
});

type ChatMessagesUserTimelineParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	userId: string;
};

export async function handleApiChatMessagesUserTimeline(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessageLiteFor1on1'>[]> {
	const params = parseApiParams(chatMessagesUserTimelineParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const other = await getUserForApiChat(deps, params.userId);

	const messages = await chatUserTimelineForApi(deps, me.id, other.id, params.limit, sinceId, untilId);

	void readUserChatMessageForApi(deps, me.id, other.id);

	return await packChatMessagesLiteFor1on1ForApi(deps, messages);
}

export const chatRoomsCreateParamDef = z.object({
	name: z.string().max(256),
	description: z.string().max(1024).optional(),
});

type ChatRoomsCreateParams = { name: string; description?: string };

export async function handleApiChatRoomsCreate(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoom'>> {
	const params = parseApiParams(chatRoomsCreateParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	const room = await createChatRoomForApi(deps, me, { name: params.name, description: params.description ?? '' });
	return await packChatRoomForApi(deps, room);
}

export const chatRoomsDeleteParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsDeleteParams = { roomId: string };

export async function handleApiChatRoomsDelete(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatRoomsDeleteParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	const room = await findChatRoomByIdForApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');

	if (!(await hasPermissionToDeleteRoomForApi(deps, me.id, room)))
		throw noSuchRoomError('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');

	await deleteChatRoomForApi(deps, room, me);
}

export const chatRoomsUpdateParamDef = z.object({
	roomId: misskeyId(),
	name: z.string().max(256).optional(),
	description: z.string().max(1024).optional(),
});

type ChatRoomsUpdateParams = { roomId: string; name?: string; description?: string };

export async function handleApiChatRoomsUpdate(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoom'>> {
	const params = parseApiParams(chatRoomsUpdateParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	const room = await findMyChatRoomByIdForApi(deps, me.id, params.roomId);
	if (room == null) throw noSuchRoomError('fcdb0f92-bda6-47f9-bd05-343e0e020932');

	const updated = await updateChatRoomForApi(
		deps,
		room,
		omitUndefined({ name: params.name, description: params.description }),
	);
	return await packChatRoomForApi(deps, updated, me);
}

export const chatRoomsShowParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsShowParams = { roomId: string };

export async function handleApiChatRoomsShow(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoom'>> {
	const params = parseApiParams(chatRoomsShowParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const room = await findChatRoomByIdForApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('857ae02f-8759-4d20-9adb-6e95fffe4fd7');

	if (!(await hasPermissionToViewRoomInfoForApi(deps, me.id, room)))
		throw noSuchRoomError('857ae02f-8759-4d20-9adb-6e95fffe4fd7');

	return await packChatRoomForApi(deps, room, me);
}

export const chatRoomsOwnedParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	...paginationParams,
});

type ChatRoomsOwnedParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiChatRoomsOwned(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoom'>[]> {
	const params = parseApiParams(chatRoomsOwnedParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const rooms = await getOwnedChatRoomsWithPaginationForApi(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomsForApi(deps, rooms, me);
}

export const chatRoomsJoinParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsJoinParams = { roomId: string };

export async function handleApiChatRoomsJoin(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatRoomsJoinParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');
	await joinToChatRoomForApi(deps, me.id, params.roomId);
}

export const chatRoomsJoiningParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	...paginationParams,
});

type ChatRoomsJoiningParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiChatRoomsJoining(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoomMembership'>[]> {
	const params = parseApiParams(chatRoomsJoiningParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const memberships = await getMyChatMembershipsForApi(deps, me.id, params.limit, sinceId, untilId);
	return await packChatRoomMembershipsForApi(deps, memberships, me, { populateUser: false, populateRoom: true });
}

export const chatRoomsLeaveParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsLeaveParams = { roomId: string };

export async function handleApiChatRoomsLeave(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatRoomsLeaveParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');
	await leaveChatRoomForApi(deps, me.id, params.roomId);
}

export const chatRoomsMembersParamDef = z.object({
	roomId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(30),
	...paginationParams,
});

type ChatRoomsMembersParams = {
	roomId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiChatRoomsMembers(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoomMembership'>[]> {
	const params = parseApiParams(chatRoomsMembersParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const room = await findChatRoomByIdForApi(deps, params.roomId);
	if (room == null) throw noSuchRoomError('7b9fe84c-eafc-4d21-bf89-485458ed2c18');

	if (!(await isChatRoomMemberForApi(deps, room, me.id))) throw noSuchRoomError('7b9fe84c-eafc-4d21-bf89-485458ed2c18');

	const memberships = await getRoomChatMembershipsWithPaginationForApi(deps, room.id, params.limit, sinceId, untilId);
	return await packChatRoomMembershipsForApi(deps, memberships, me, { populateUser: true, populateRoom: false });
}

export const chatRoomsMuteParamDef = z.object({
	roomId: misskeyId(),
	mute: z.boolean(),
});

type ChatRoomsMuteParams = { roomId: string; mute: boolean };

export async function handleApiChatRoomsMute(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatRoomsMuteParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');
	await muteChatRoomForApi(deps, me.id, params.roomId, params.mute);
}

export const chatRoomsInvitationsCreateParamDef = z.object({
	roomId: misskeyId(),
	userId: misskeyId(),
});

type ChatRoomsInvitationsCreateParams = { roomId: string; userId: string };

export async function handleApiChatRoomsInvitationsCreate(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoomInvitation'>> {
	const params = parseApiParams(chatRoomsInvitationsCreateParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');

	const room = await findMyChatRoomByIdForApi(deps, me.id, params.roomId);
	if (room == null) throw noSuchRoomError('916f9507-49ba-4e90-b57f-1fd4deaa47a5');

	const invitation = await createChatRoomInvitationForApi(deps, me.id, room.id, params.userId);
	return await packChatRoomInvitationForApi(deps, invitation, me);
}

export const chatRoomsInvitationsIgnoreParamDef = z.object({
	roomId: misskeyId(),
});

type ChatRoomsInvitationsIgnoreParams = { roomId: string };

export async function handleApiChatRoomsInvitationsIgnore(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(chatRoomsInvitationsIgnoreParamDef, body);
	await checkChatAvailabilityForApi(deps, me.id, 'write');
	await ignoreChatRoomInvitationForApi(deps, me.id, params.roomId);
}

export const chatRoomsInvitationsInboxParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	...paginationParams,
});

type ChatRoomsInvitationsInboxParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiChatRoomsInvitationsInbox(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoomInvitation'>[]> {
	const params = parseApiParams(chatRoomsInvitationsInboxParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const invitations = await getReceivedChatRoomInvitationsWithPaginationForApi(
		deps,
		me.id,
		params.limit,
		sinceId,
		untilId,
	);
	return await packChatRoomInvitationsForApi(deps, invitations, me);
}

export const chatRoomsInvitationsOutboxParamDef = z.object({
	roomId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(30),
	...paginationParams,
});

type ChatRoomsInvitationsOutboxParams = {
	roomId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleApiChatRoomsInvitationsOutbox(
	deps: ApiChatDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatRoomInvitation'>[]> {
	const params = parseApiParams(chatRoomsInvitationsOutboxParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	await checkChatAvailabilityForApi(deps, me.id, 'read');

	const room = await findMyChatRoomByIdForApi(deps, me.id, params.roomId);
	if (room == null) throw noSuchRoomError('a3c6b309-9717-4316-ae94-a69b53437237');

	const invitations = await getSentChatRoomInvitationsWithPaginationForApi(
		deps,
		room.id,
		params.limit,
		sinceId,
		untilId,
	);
	return await packChatRoomInvitationsForApi(deps, invitations, me);
}
