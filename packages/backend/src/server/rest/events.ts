/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type {
	AdminEventTypes,
	AntennaEventTypes,
	BroadcastTypes,
	ChatEventTypes,
	DriveEventTypes,
	InternalEventTypes,
	MainEventTypes,
	NoteEventTypes,
	UserListEventTypes,
} from '@/core/global-events.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiRole } from '@/models/Role.js';
import type { Config } from '@/config.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

export type ApiInternalEventPublisher = <K extends keyof InternalEventTypes>(
	type: K,
	value?: InternalEventTypes[K],
) => void;

export type ApiAdminStreamPublisher = <K extends keyof AdminEventTypes>(
	userId: MiUser['id'],
	type: K,
	value?: AdminEventTypes[K],
) => void;

export type ApiBroadcastStreamPublisher = <K extends keyof BroadcastTypes>(type: K, value?: unknown) => void;

export type ApiMainStreamPublisher = (userId: MiUser['id'], type: keyof MainEventTypes, value?: unknown) => void;

export type ApiDriveStreamPublisher = <K extends keyof DriveEventTypes>(
	userId: MiUser['id'],
	type: K,
	value?: DriveEventTypes[K],
) => void;

export type ApiUserListStreamPublisher = <K extends keyof UserListEventTypes>(
	listId: MiUserList['id'],
	type: K,
	value?: UserListEventTypes[K],
) => void;

export type ApiAntennaStreamPublisher = <K extends keyof AntennaEventTypes>(
	antennaId: MiAntenna['id'],
	type: K,
	value?: AntennaEventTypes[K],
) => void;

export type ApiChatUserStreamPublisher = <K extends keyof ChatEventTypes>(
	fromUserId: MiUser['id'],
	toUserId: MiUser['id'],
	type: K,
	value?: ChatEventTypes[K],
) => void;

export type ApiChatRoomStreamPublisher = <K extends keyof ChatEventTypes>(
	toRoomId: MiChatRoom['id'],
	type: K,
	value?: ChatEventTypes[K],
) => void;

export type ApiNotesStreamPublisher = (note: Packed<'Note'>) => void;

export type ApiRoleTimelineStreamPublisher = (roleId: MiRole['id'], type: 'note', value: Packed<'Note'>) => void;

export type ApiNoteStreamPublisher = <K extends keyof NoteEventTypes>(
	note: Pick<MiNote, 'id' | 'userId' | 'visibility' | 'visibleUserIds'>,
	type: K,
	value?: NoteEventTypes[K],
) => void;

export type RedisEventPublisherDependencies = {
	config: { runtime: Pick<Config['runtime'], 'host'> };
	publish: (host: string, message: string) => void | Promise<unknown>;
};

/**
 * `type == null` のときは body でラップせず value をそのまま message にする。
 * publishNotesStream だけが type=null で呼び出す。
 */
function publishToChannel(
	deps: RedisEventPublisherDependencies,
	channel: string,
	type: string | null,
	value?: unknown,
): void {
	const message = type == null ? value : value === undefined ? { type, body: null } : { type, body: value };

	// publish は fire-and-forget。応答後ドレイン等から Redis 切断後に発火しても
	// 未処理リジェクションにしない。
	Promise.resolve(deps.publish(deps.config.runtime.host, JSON.stringify({ channel, message }))).catch((error) => {
		console.error(`Failed to publish to channel ${channel}`, error);
	});
}

export type EventPublishers = {
	publishInternalEvent: ApiInternalEventPublisher;
	publishBroadcastStream: ApiBroadcastStreamPublisher;
	publishMainStream: ApiMainStreamPublisher;
	publishAdminStream: ApiAdminStreamPublisher;
	publishDriveStream: ApiDriveStreamPublisher;
	publishUserListStream: ApiUserListStreamPublisher;
	publishAntennaStream: ApiAntennaStreamPublisher;
	publishChatUserStream: ApiChatUserStreamPublisher;
	publishChatRoomStream: ApiChatRoomStreamPublisher;
	publishNotesStream: ApiNotesStreamPublisher;
	publishNoteStream: ApiNoteStreamPublisher;
	publishRoleTimelineStream: ApiRoleTimelineStreamPublisher;
};

export function createEventPublishers(deps: RedisEventPublisherDependencies): EventPublishers {
	return {
		publishInternalEvent: (type, value) => publishToChannel(deps, 'internal', type, value),
		publishBroadcastStream: (type, value) => publishToChannel(deps, 'broadcast', type, value),
		publishMainStream: (userId, type, value) => publishToChannel(deps, `mainStream:${userId}`, type, value),
		publishAdminStream: (userId, type, value) => publishToChannel(deps, `adminStream:${userId}`, type, value),
		publishDriveStream: (userId, type, value) => publishToChannel(deps, `driveStream:${userId}`, type, value),
		publishUserListStream: (listId, type, value) => publishToChannel(deps, `userListStream:${listId}`, type, value),
		publishAntennaStream: (antennaId, type, value) => publishToChannel(deps, `antennaStream:${antennaId}`, type, value),
		publishChatUserStream: (fromUserId, toUserId, type, value) =>
			publishToChannel(deps, `chatUserStream:${fromUserId}-${toUserId}`, type, value),
		publishChatRoomStream: (toRoomId, type, value) => publishToChannel(deps, `chatRoomStream:${toRoomId}`, type, value),
		publishNotesStream: (note) => publishToChannel(deps, 'notesStream', null, note),
		publishRoleTimelineStream: (roleId, type, value) =>
			publishToChannel(deps, `roleTimelineStream:${roleId}`, type, value),
		publishNoteStream: (note, type, value) =>
			publishToChannel(deps, `noteStream:${note.id}`, type, {
				id: note.id,
				userId: note.userId,
				visibility: note.visibility,
				visibleUserIds: note.visibleUserIds,
				body: value,
			}),
	};
}
