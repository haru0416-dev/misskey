/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	fetchChatRoomByIdOrFailFromDatabase,
	fetchChatRoomInvitationByIdOrFailFromDatabase,
	fetchChatRoomInvitationFromDatabase,
	fetchChatRoomMembershipFromDatabase,
} from '@/core/chat/chat-room-store.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { ChatRoomInvitationRow } from '@/db/schema/chat-room-invitation.js';
import type { ChatRoomMembershipRow } from '@/db/schema/chat-room-membership.js';
import type { MiUser } from '@/models/User.js';
import type { NotificationDependencies } from '../notification/notification.js';
import type { ChatRoomStreamPublisher, ChatUserStreamPublisher, MainStreamPublisher } from '../events.js';
import type { DriveFileDependencies } from '../drive/drive-file-packing.js';
import { packUserLite } from '../user/user-packing.js';
import type { RolePolicyDependencies } from '../role/role-policy.js';

export type ChatDependencies = DriveFileDependencies &
	RolePolicyDependencies &
	NotificationDependencies & {
		publishChatUserStream?: ChatUserStreamPublisher;
		publishChatRoomStream?: ChatRoomStreamPublisher;
		publishMainStream?: MainStreamPublisher;
	};

export type ChatRoomInvitationPackable = ChatRoomInvitationRow & {
	user?: MiUser | null;
	room?: MiChatRoom | null;
};

export type ChatRoomMembershipPackable = ChatRoomMembershipRow & {
	user?: MiUser | null;
	room?: MiChatRoom | null;
};

export async function packChatRoom(
	deps: ChatDependencies,
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
		owner: options?._hint_?.packedOwners.get(room.ownerId) ?? (await packUserLite(deps, room.owner ?? room.ownerId)),
		isMuted: membership != null ? membership.isMuted : false,
		invitationExists: invitation != null,
	} as Packed<'ChatRoom'>;
}

export async function packChatRoomInvitation(
	deps: ChatDependencies,
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
			(await packChatRoom(deps, invitation.room ?? invitation.roomId, me)),
		userId: invitation.userId,
		user:
			options?._hint_?.packedUsers.get(invitation.userId) ??
			(await packUserLite(deps, invitation.user ?? invitation.userId)),
	} as Packed<'ChatRoomInvitation'>;
}
