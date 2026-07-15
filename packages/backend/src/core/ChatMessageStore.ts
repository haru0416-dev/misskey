/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { chatMessage, type ChatMessageInsert, type ChatMessageRow } from '@/db/schema/chat-message.js';
import { chatRoom } from '@/db/schema/chat-room.js';
import { chatRoomMembership } from '@/db/schema/chat-room-membership.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
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
	sinceId: string | null;
	untilId: string | null;
	order: ChatMessageOrder;
} {
	return resolveDateIdPagination(idService, options);
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

export async function listUserChatHistoryFromDatabase(
	db: MiDrizzleDatabase,
	meId: MiUser['id'],
	limit: number,
): Promise<MiChatMessage[]> {
	const result = await db.execute<ChatMessageRow>(sql`
		WITH "eligible" AS (
			SELECT
				"message"."id",
				CASE
					WHEN "message"."fromUserId" = ${meId} THEN "message"."toUserId"
					ELSE "message"."fromUserId"
				END AS "counterpartId"
			FROM "chat_message" AS "message"
			WHERE (
				"message"."fromUserId" = ${meId}
				OR "message"."toUserId" = ${meId}
			)
			AND "message"."toRoomId" IS NULL
			AND "message"."fromUserId" NOT IN (
				SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId}
			)
			AND "message"."toUserId" NOT IN (
				SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId}
			)
		),
		"latest" AS (
			SELECT MAX("id") AS "id"
			FROM "eligible"
			GROUP BY "counterpartId"
		),
		"top_ids" AS (
			SELECT "id"
			FROM "latest"
			ORDER BY "id" DESC
			LIMIT ${limit}
		)
		SELECT "message".*
		FROM "top_ids"
		INNER JOIN "chat_message" AS "message" ON "message"."id" = "top_ids"."id"
		ORDER BY "message"."id" DESC
	`);

	return result.rows.map(deserializeChatMessage);
}

export async function listRoomChatHistoryFromDatabase(
	db: MiDrizzleDatabase,
	meId: MiUser['id'],
	limit: number,
): Promise<MiChatMessage[]> {
	const result = await db.execute<ChatMessageRow>(sql`
		WITH "eligible_rooms" AS (
			SELECT "roomId"
			FROM "chat_room_membership"
			WHERE "userId" = ${meId}
			UNION
			SELECT "id"
			FROM "chat_room"
			WHERE "ownerId" = ${meId}
		),
		"latest" AS (
			SELECT MAX("message"."id") AS "id"
			FROM "chat_message" AS "message"
			INNER JOIN "eligible_rooms" ON "eligible_rooms"."roomId" = "message"."toRoomId"
			GROUP BY "message"."toRoomId"
		),
		"top_ids" AS (
			SELECT "id"
			FROM "latest"
			ORDER BY "id" DESC
			LIMIT ${limit}
		)
		SELECT "message".*
		FROM "top_ids"
		INNER JOIN "chat_message" AS "message" ON "message"."id" = "top_ids"."id"
		ORDER BY "message"."id" DESC
	`);

	return result.rows.map(deserializeChatMessage);
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
