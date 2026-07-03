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
