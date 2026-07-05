/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { AdminEventTypes, BroadcastTypes, ChatEventTypes, DriveEventTypes, InternalEventTypes, MainEventTypes, NoteEventTypes, UserListEventTypes } from '@/core/GlobalEventService.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

export type HonoApiInternalEventPublisher = <K extends keyof InternalEventTypes>(
	type: K,
	value?: InternalEventTypes[K],
) => void;

export type HonoApiAdminStreamPublisher = <K extends keyof AdminEventTypes>(
	userId: MiUser['id'],
	type: K,
	value?: AdminEventTypes[K],
) => void;

export type HonoApiBroadcastStreamPublisher = <K extends keyof BroadcastTypes>(
	type: K,
	value?: unknown,
) => void;

export type HonoApiMainStreamPublisher = (
	userId: MiUser['id'],
	type: keyof MainEventTypes,
	value?: unknown,
) => void;

export type HonoApiDriveStreamPublisher = <K extends keyof DriveEventTypes>(
	userId: MiUser['id'],
	type: K,
	value?: DriveEventTypes[K],
) => void;

export type HonoApiUserListStreamPublisher = <K extends keyof UserListEventTypes>(
	listId: MiUserList['id'],
	type: K,
	value?: UserListEventTypes[K],
) => void;

export type HonoApiChatUserStreamPublisher = <K extends keyof ChatEventTypes>(
	fromUserId: MiUser['id'],
	toUserId: MiUser['id'],
	type: K,
	value?: ChatEventTypes[K],
) => void;

export type HonoApiChatRoomStreamPublisher = <K extends keyof ChatEventTypes>(
	toRoomId: MiChatRoom['id'],
	type: K,
	value?: ChatEventTypes[K],
) => void;

export type HonoApiNotesStreamPublisher = (note: Packed<'Note'>) => void;

export type HonoApiNoteStreamPublisher = <K extends keyof NoteEventTypes>(
	note: Pick<MiNote, 'id' | 'userId' | 'visibility' | 'visibleUserIds'>,
	type: K,
	value?: NoteEventTypes[K],
) => void;

export type HonoRedisEventPublisherDependencies = {
	config: { host: string };
	publish: (host: string, message: string) => void;
};

/**
 * GlobalEventService#publish 相当。`type == null` のときは body でラップせず
 * value をそのまま message にする (publishNotesStream が唯一 type=null で呼ばれる)。
 */
function publishToChannel(deps: HonoRedisEventPublisherDependencies, channel: string, type: string | null, value?: unknown): void {
	const message = type == null ? value : (value === undefined ? { type, body: null } : { type, body: value });

	deps.publish(deps.config.host, JSON.stringify({ channel, message }));
}

export type HonoEventPublishers = {
	publishInternalEvent: HonoApiInternalEventPublisher;
	publishBroadcastStream: HonoApiBroadcastStreamPublisher;
	publishMainStream: HonoApiMainStreamPublisher;
	publishAdminStream: HonoApiAdminStreamPublisher;
	publishDriveStream: HonoApiDriveStreamPublisher;
	publishUserListStream: HonoApiUserListStreamPublisher;
	publishChatUserStream: HonoApiChatUserStreamPublisher;
	publishChatRoomStream: HonoApiChatRoomStreamPublisher;
	publishNotesStream: HonoApiNotesStreamPublisher;
	publishNoteStream: HonoApiNoteStreamPublisher;
};

export function createHonoEventPublishers(deps: HonoRedisEventPublisherDependencies): HonoEventPublishers {
	return {
		publishInternalEvent: (type, value) => publishToChannel(deps, 'internal', type, value),
		publishBroadcastStream: (type, value) => publishToChannel(deps, 'broadcast', type, value),
		publishMainStream: (userId, type, value) => publishToChannel(deps, `mainStream:${userId}`, type, value),
		publishAdminStream: (userId, type, value) => publishToChannel(deps, `adminStream:${userId}`, type, value),
		publishDriveStream: (userId, type, value) => publishToChannel(deps, `driveStream:${userId}`, type, value),
		publishUserListStream: (listId, type, value) => publishToChannel(deps, `userListStream:${listId}`, type, value),
		publishChatUserStream: (fromUserId, toUserId, type, value) => publishToChannel(deps, `chatUserStream:${fromUserId}-${toUserId}`, type, value),
		publishChatRoomStream: (toRoomId, type, value) => publishToChannel(deps, `chatRoomStream:${toRoomId}`, type, value),
		publishNotesStream: note => publishToChannel(deps, 'notesStream', null, note),
		publishNoteStream: (note, type, value) => publishToChannel(deps, `noteStream:${note.id}`, type, {
			id: note.id,
			userId: note.userId,
			visibility: note.visibility,
			visibleUserIds: note.visibleUserIds,
			body: value,
		}),
	};
}
