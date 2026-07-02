/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { chatMessage, type ChatMessageInsert, type ChatMessageRow } from '@/db/schema/chat-message.js';
import { chatRoom } from '@/db/schema/chat-room.js';
import { chatRoomMembership } from '@/db/schema/chat-room-membership.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiChatMessage } from '@/models/ChatMessage.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';

export type ChatMessageOrder = 'asc' | 'desc';

function deserializeChatMessage(row: ChatMessageRow): MiChatMessage {
	return {
		...row,
		fromUser: null,
		toUser: null,
		toRoom: null,
		file: null,
	} as MiChatMessage;
}

function applyChatMessagePaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(chatMessage.id, sinceId));
		conditions.push(lt(chatMessage.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(chatMessage.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(chatMessage.id, untilId));
	}
}

export function resolveChatMessagePagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId?: string | null;
	untilId?: string | null;
	order: ChatMessageOrder;
} {
	if (options.sinceId && options.untilId) {
		return { sinceId: options.sinceId, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceId) {
		return { sinceId: options.sinceId, untilId: null, order: 'asc' };
	} else if (options.untilId) {
		return { sinceId: null, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceDate && options.untilDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: idService.gen(options.untilDate), order: 'desc' };
	} else if (options.sinceDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: null, order: 'asc' };
	} else if (options.untilDate) {
		return { sinceId: null, untilId: idService.gen(options.untilDate), order: 'desc' };
	} else {
		return { sinceId: null, untilId: null, order: 'desc' };
	}
}

function chatMessageBetweenUsersCondition(meId: MiUser['id'], otherId: MiUser['id']): SQL {
	return or(
		and(eq(chatMessage.fromUserId, meId), eq(chatMessage.toUserId, otherId)),
		and(eq(chatMessage.fromUserId, otherId), eq(chatMessage.toUserId, meId)),
	)!;
}

export async function fetchChatMessageByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatMessage['id'],
): Promise<MiChatMessage | null> {
	const [row] = await db
		.select()
		.from(chatMessage)
		.where(eq(chatMessage.id, id))
		.limit(1);

	return row == null ? null : deserializeChatMessage(row);
}

export async function fetchChatMessageByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatMessage['id'],
): Promise<MiChatMessage> {
	const message = await fetchChatMessageByIdFromDatabase(db, id);
	if (message == null) {
		throw new Error(`Chat message ${id} not found`);
	}

	return message;
}

export async function fetchChatMessageByIdAndFromUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatMessage['id'],
	fromUserId: MiUser['id'],
): Promise<MiChatMessage | null> {
	const [row] = await db
		.select()
		.from(chatMessage)
		.where(and(
			eq(chatMessage.id, id),
			eq(chatMessage.fromUserId, fromUserId),
		))
		.limit(1);

	return row == null ? null : deserializeChatMessage(row);
}

export async function createChatMessageInDatabase(
	db: MiDrizzleDatabase,
	data: ChatMessageInsert,
): Promise<MiChatMessage> {
	const [row] = await db
		.insert(chatMessage)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create chat message');
	}

	return deserializeChatMessage(row);
}

export async function deleteChatMessageByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatMessage['id'],
): Promise<void> {
	await db
		.delete(chatMessage)
		.where(eq(chatMessage.id, id));
}

export async function listChatMessagesBetweenUsersFromDatabase(
	db: MiDrizzleDatabase,
	meId: MiUser['id'],
	otherId: MiUser['id'],
	options: {
		limit: number;
		order: ChatMessageOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiChatMessage[]> {
	const conditions: SQL[] = [chatMessageBetweenUsersCondition(meId, otherId)];
	applyChatMessagePaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(chatMessage)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(chatMessage.id) : desc(chatMessage.id))
		.limit(options.limit);

	return rows.map(deserializeChatMessage);
}

export async function listChatMessagesByRoomIdFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	options: {
		limit: number;
		order: ChatMessageOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiChatMessage[]> {
	const conditions: SQL[] = [eq(chatMessage.toRoomId, roomId)];
	applyChatMessagePaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(chatMessage)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(chatMessage.id) : desc(chatMessage.id))
		.limit(options.limit);

	return rows.map(deserializeChatMessage);
}

export async function listChatMessagesByFileIdFromDatabase(
	db: MiDrizzleDatabase,
	fileId: MiDriveFile['id'],
	options: {
		limit: number;
		order: ChatMessageOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiChatMessage[]> {
	const conditions: SQL[] = [eq(chatMessage.fileId, fileId)];
	applyChatMessagePaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(chatMessage)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(chatMessage.id) : desc(chatMessage.id))
		.limit(options.limit);

	return rows.map(deserializeChatMessage);
}

/**
 * meIdが送受信した1-on-1のメッセージのうち、excludeUserIdsに含まれる相手とのものを除いた最新の1件を取得する。
 * ミュートしている相手とのメッセージは対象外。
 */
export async function findLatestChatMessageForUserExcludingUsersFromDatabase(
	db: MiDrizzleDatabase,
	meId: MiUser['id'],
	excludeUserIds: MiUser['id'][],
): Promise<MiChatMessage | null> {
	const conditions: SQL[] = [
		or(
			eq(chatMessage.fromUserId, meId),
			eq(chatMessage.toUserId, meId),
		)!,
		isNull(chatMessage.toRoomId),
		sql`${chatMessage.fromUserId} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`,
		sql`${chatMessage.toUserId} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`,
	];

	if (excludeUserIds.length > 0) {
		conditions.push(notInArray(chatMessage.fromUserId, excludeUserIds));
		conditions.push(notInArray(chatMessage.toUserId, excludeUserIds));
	}

	const [row] = await db
		.select()
		.from(chatMessage)
		.where(and(...conditions))
		.orderBy(desc(chatMessage.id))
		.limit(1);

	return row == null ? null : deserializeChatMessage(row);
}

/**
 * roomIdsのいずれかの部屋に送られたメッセージのうち、excludeRoomIdsに含まれる部屋のものを除いた最新の1件を取得する。
 */
export async function findLatestChatMessageForRoomsExcludingRoomsFromDatabase(
	db: MiDrizzleDatabase,
	roomIds: MiChatRoom['id'][],
	excludeRoomIds: MiChatRoom['id'][],
): Promise<MiChatMessage | null> {
	if (roomIds.length === 0) {
		return null;
	}

	const conditions: SQL[] = [inArray(chatMessage.toRoomId, roomIds)];

	if (excludeRoomIds.length > 0) {
		conditions.push(notInArray(chatMessage.toRoomId, excludeRoomIds));
	}

	const [row] = await db
		.select()
		.from(chatMessage)
		.where(and(...conditions))
		.orderBy(desc(chatMessage.id))
		.limit(1);

	return row == null ? null : deserializeChatMessage(row);
}

export async function searchChatMessagesFromDatabase(
	db: MiDrizzleDatabase,
	meId: MiUser['id'],
	query: string,
	limit: number,
	options: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
	},
): Promise<MiChatMessage[]> {
	const conditions: SQL[] = [];

	if (options.userId) {
		conditions.push(chatMessageBetweenUsersCondition(meId, options.userId));
	} else if (options.roomId) {
		conditions.push(eq(chatMessage.toRoomId, options.roomId));
	} else {
		conditions.push(or(
			eq(chatMessage.fromUserId, meId),
			eq(chatMessage.toUserId, meId),
			inArray(
				chatMessage.toRoomId,
				db.select({ roomId: chatRoomMembership.roomId }).from(chatRoomMembership).where(eq(chatRoomMembership.userId, meId)),
			),
			inArray(
				chatMessage.toRoomId,
				db.select({ id: chatRoom.id }).from(chatRoom).where(eq(chatRoom.ownerId, meId)),
			),
		)!);
	}

	conditions.push(sql`LOWER(${chatMessage.text}) LIKE ${`%${sqlLikeEscape(query.toLowerCase())}%`}`);

	const rows = await db
		.select()
		.from(chatMessage)
		.where(and(...conditions))
		.orderBy(desc(chatMessage.id))
		.limit(limit);

	return rows.map(deserializeChatMessage);
}

export async function addChatMessageReactionInDatabase(
	db: MiDrizzleDatabase,
	id: MiChatMessage['id'],
	userId: MiUser['id'],
	reaction: string,
): Promise<void> {
	await db
		.update(chatMessage)
		.set({ reactions: sql`array_append(${chatMessage.reactions}, ${`${userId}/${reaction}`})` })
		.where(eq(chatMessage.id, id));
}

export async function removeChatMessageReactionInDatabase(
	db: MiDrizzleDatabase,
	id: MiChatMessage['id'],
	userId: MiUser['id'],
	reaction: string,
): Promise<void> {
	await db
		.update(chatMessage)
		.set({ reactions: sql`array_remove(${chatMessage.reactions}, ${`${userId}/${reaction}`})` })
		.where(eq(chatMessage.id, id));
}
