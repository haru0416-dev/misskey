/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { chatRoom, type ChatRoomInsert, type ChatRoomRow } from '@/db/schema/chat-room.js';
import { chatRoomInvitation, type ChatRoomInvitationInsert, type ChatRoomInvitationRow } from '@/db/schema/chat-room-invitation.js';
import { chatRoomMembership, type ChatRoomMembershipInsert, type ChatRoomMembershipRow } from '@/db/schema/chat-room-membership.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveIdPagination } from '@/misc/id-pagination.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiUser } from '@/models/User.js';

export type ChatRoomRecordOrder = 'asc' | 'desc';
// Invitation creation and joining must acquire the room lock before the per-user lock.
export class ChatRoomCapacityExceededError extends Error {}
export class ChatRoomInvitationConflictError extends Error {}
export class ChatRoomInvitationNotFoundError extends Error {}

type ChatRoomUpdateValues = Pick<ChatRoomInsert, 'name' | 'description' | 'isArchived'>;
type ChatRoomUpdate = { [K in keyof ChatRoomUpdateValues]?: ChatRoomUpdateValues[K] | undefined };

function deserializeChatRoom(row: ChatRoomRow): MiChatRoom {
	return {
		...row,
		owner: null,
	} as MiChatRoom;
}

function toChatRoomUpdate(data: ChatRoomUpdate): ChatRoomUpdate {
	return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as ChatRoomUpdate;
}

export function resolveChatRoomRecordPagination(
	options: {
		sinceId?: string | null;
		untilId?: string | null;
	},
): {
	sinceId?: string | null;
	untilId?: string | null;
	order: ChatRoomRecordOrder;
} {
	return resolveIdPagination(options);
}

function chatRoomMembershipCondition(roomId: MiChatRoom['id'], userId: MiUser['id']) {
	return and(
		eq(chatRoomMembership.roomId, roomId),
		eq(chatRoomMembership.userId, userId),
	);
}

function chatRoomInvitationCondition(roomId: MiChatRoom['id'], userId: MiUser['id']) {
	return and(
		eq(chatRoomInvitation.roomId, roomId),
		eq(chatRoomInvitation.userId, userId),
	);
}

function applyChatRoomMembershipPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(chatRoomMembership.id, sinceId));
		conditions.push(lt(chatRoomMembership.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(chatRoomMembership.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(chatRoomMembership.id, untilId));
	}
}

function applyChatRoomInvitationPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(chatRoomInvitation.id, sinceId));
		conditions.push(lt(chatRoomInvitation.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(chatRoomInvitation.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(chatRoomInvitation.id, untilId));
	}
}

function applyChatRoomPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(chatRoom.id, sinceId));
		conditions.push(lt(chatRoom.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(chatRoom.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(chatRoom.id, untilId));
	}
}

export async function fetchChatRoomByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatRoom['id'],
): Promise<MiChatRoom | null> {
	const [row] = await db
		.select()
		.from(chatRoom)
		.where(eq(chatRoom.id, id))
		.limit(1);

	return row == null ? null : deserializeChatRoom(row);
}

export async function fetchChatRoomByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatRoom['id'],
): Promise<MiChatRoom> {
	const room = await fetchChatRoomByIdFromDatabase(db, id);
	if (room == null) {
		throw new Error(`Chat room ${id} not found`);
	}

	return room;
}

export async function fetchChatRoomByIdAndOwnerIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatRoom['id'],
	ownerId: MiUser['id'],
): Promise<MiChatRoom | null> {
	const [row] = await db
		.select()
		.from(chatRoom)
		.where(and(
			eq(chatRoom.id, id),
			eq(chatRoom.ownerId, ownerId),
		))
		.limit(1);

	return row == null ? null : deserializeChatRoom(row);
}

export async function fetchChatRoomByIdAndOwnerIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatRoom['id'],
	ownerId: MiUser['id'],
): Promise<MiChatRoom> {
	const room = await fetchChatRoomByIdAndOwnerIdFromDatabase(db, id, ownerId);
	if (room == null) {
		throw new Error(`Chat room ${id} owned by ${ownerId} not found`);
	}

	return room;
}

export async function listChatRoomsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiChatRoom['id'][],
): Promise<MiChatRoom[]> {
	if (ids.length === 0) {
		return [];
	}

	const rows = await db
		.select()
		.from(chatRoom)
		.where(inArray(chatRoom.id, ids));

	const roomMap = new Map(rows.map(row => [row.id, deserializeChatRoom(row)]));
	return ids.flatMap(id => {
		const room = roomMap.get(id);
		return room == null ? [] : [room];
	});
}

export async function listChatRoomsByOwnerIdFromDatabase(
	db: MiDrizzleDatabase,
	ownerId: MiUser['id'],
	options: {
		limit?: number;
		order?: ChatRoomRecordOrder;
		sinceId?: string | null;
		untilId?: string | null;
	} = {},
): Promise<MiChatRoom[]> {
	const conditions: SQL[] = [eq(chatRoom.ownerId, ownerId)];
	applyChatRoomPaginationCondition(conditions, options.sinceId, options.untilId);

	let query = db
		.select()
		.from(chatRoom)
		.where(and(...conditions))
		.orderBy((options.order ?? 'asc') === 'asc' ? asc(chatRoom.id) : desc(chatRoom.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	const rows = await query;
	return rows.map(row => deserializeChatRoom(row));
}

export async function createChatRoomInDatabase(
	db: MiDrizzleDatabase,
	data: ChatRoomInsert,
): Promise<MiChatRoom> {
	const [row] = await db
		.insert(chatRoom)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create chat room');
	}

	return deserializeChatRoom(row);
}

export async function updateChatRoomInDatabase(
	db: MiDrizzleDatabase,
	id: MiChatRoom['id'],
	data: ChatRoomUpdate,
): Promise<MiChatRoom> {
	const update = toChatRoomUpdate(data);
	if (Object.keys(update).length === 0) {
		return fetchChatRoomByIdOrFailFromDatabase(db, id);
	}

	const [row] = await db
		.update(chatRoom)
		.set(update)
		.where(eq(chatRoom.id, id))
		.returning();

	if (row == null) {
		throw new Error(`Chat room ${id} not found`);
	}

	return deserializeChatRoom(row);
}

export async function deleteChatRoomByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiChatRoom['id'],
): Promise<void> {
	await db
		.delete(chatRoom)
		.where(eq(chatRoom.id, id));
}

export async function fetchChatRoomMembershipFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	userId: MiUser['id'],
): Promise<ChatRoomMembershipRow | null> {
	const [row] = await db
		.select()
		.from(chatRoomMembership)
		.where(chatRoomMembershipCondition(roomId, userId))
		.limit(1);

	return row ?? null;
}

export async function fetchChatRoomMembershipByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: ChatRoomMembershipRow['id'],
): Promise<ChatRoomMembershipRow> {
	const [row] = await db
		.select()
		.from(chatRoomMembership)
		.where(eq(chatRoomMembership.id, id))
		.limit(1);

	if (row == null) {
		throw new Error(`Chat room membership ${id} not found`);
	}

	return row;
}

export async function fetchChatRoomMembershipOrFailFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	userId: MiUser['id'],
): Promise<ChatRoomMembershipRow> {
	const row = await fetchChatRoomMembershipFromDatabase(db, roomId, userId);
	if (row == null) {
		throw new Error(`Chat room membership for ${userId} in ${roomId} not found`);
	}

	return row;
}

export async function listChatRoomMembershipsByRoomIdFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	options: {
		limit?: number;
		order?: ChatRoomRecordOrder;
		sinceId?: string | null;
		untilId?: string | null;
	} = {},
): Promise<ChatRoomMembershipRow[]> {
	const conditions: SQL[] = [eq(chatRoomMembership.roomId, roomId)];
	applyChatRoomMembershipPaginationCondition(conditions, options.sinceId, options.untilId);

	let query = db
		.select()
		.from(chatRoomMembership)
		.where(and(...conditions))
		.orderBy((options.order ?? 'asc') === 'asc' ? asc(chatRoomMembership.id) : desc(chatRoomMembership.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	return await query;
}

export async function listChatRoomMembershipsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit?: number;
		order?: ChatRoomRecordOrder;
		sinceId?: string | null;
		untilId?: string | null;
	} = {},
): Promise<ChatRoomMembershipRow[]> {
	const conditions: SQL[] = [eq(chatRoomMembership.userId, userId)];
	applyChatRoomMembershipPaginationCondition(conditions, options.sinceId, options.untilId);

	let query = db
		.select()
		.from(chatRoomMembership)
		.where(and(...conditions))
		.orderBy((options.order ?? 'asc') === 'asc' ? asc(chatRoomMembership.id) : desc(chatRoomMembership.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	return await query;
}

export async function listChatRoomMembershipsByRoomIdsAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	roomIds: MiChatRoom['id'][],
	userId: MiUser['id'],
): Promise<ChatRoomMembershipRow[]> {
	if (roomIds.length === 0) {
		return [];
	}

	return await db
		.select()
		.from(chatRoomMembership)
		.where(and(
			inArray(chatRoomMembership.roomId, roomIds),
			eq(chatRoomMembership.userId, userId),
		));
}

export async function countChatRoomMembershipsByRoomIdFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(chatRoomMembership)
		.where(eq(chatRoomMembership.roomId, roomId));

	return row?.count ?? 0;
}

export async function createChatRoomMembershipInDatabase(
	db: MiDrizzleDatabase,
	data: ChatRoomMembershipInsert,
): Promise<ChatRoomMembershipRow> {
	const [row] = await db
		.insert(chatRoomMembership)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create chat room membership');
	}

	return row;
}

export async function joinChatRoomFromInvitationInDatabase(
	db: MiDrizzleDatabase,
	data: ChatRoomMembershipInsert,
	invitationId: ChatRoomInvitationRow['id'],
	maximumMembers: number,
): Promise<ChatRoomMembershipRow> {
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('chat-room-membership'), hashtext(${data.roomId}))`);
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('chat-room-invitation'), hashtext(${`${data.roomId}:${data.userId}`}))`);
		const [invitation] = await tx
			.select({ id: chatRoomInvitation.id })
			.from(chatRoomInvitation)
			.where(and(
				eq(chatRoomInvitation.id, invitationId),
				eq(chatRoomInvitation.roomId, data.roomId),
				eq(chatRoomInvitation.userId, data.userId),
			))
			.limit(1);
		if (invitation == null) throw new ChatRoomInvitationNotFoundError();
		const [membershipCount] = await tx
			.select({ count: count() })
			.from(chatRoomMembership)
			.where(eq(chatRoomMembership.roomId, data.roomId));
		if ((membershipCount?.count ?? 0) >= maximumMembers) throw new ChatRoomCapacityExceededError();

		const [row] = await tx
			.insert(chatRoomMembership)
			.values(data)
			.returning();

		if (row == null) {
			throw new Error('Failed to create chat room membership');
		}

		await tx
			.delete(chatRoomInvitation)
			.where(eq(chatRoomInvitation.id, invitationId));

		return row;
	});
}

export async function deleteChatRoomMembershipByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: ChatRoomMembershipRow['id'],
): Promise<void> {
	await db
		.delete(chatRoomMembership)
		.where(eq(chatRoomMembership.id, id));
}

export async function updateChatRoomMembershipMuteFromDatabase(
	db: MiDrizzleDatabase,
	id: ChatRoomMembershipRow['id'],
	isMuted: boolean,
): Promise<void> {
	await db
		.update(chatRoomMembership)
		.set({ isMuted })
		.where(eq(chatRoomMembership.id, id));
}

export async function fetchChatRoomInvitationFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	userId: MiUser['id'],
): Promise<ChatRoomInvitationRow | null> {
	const [row] = await db
		.select()
		.from(chatRoomInvitation)
		.where(chatRoomInvitationCondition(roomId, userId))
		.limit(1);

	return row ?? null;
}

export async function fetchChatRoomInvitationByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: ChatRoomInvitationRow['id'],
): Promise<ChatRoomInvitationRow> {
	const [row] = await db
		.select()
		.from(chatRoomInvitation)
		.where(eq(chatRoomInvitation.id, id))
		.limit(1);

	if (row == null) {
		throw new Error(`Chat room invitation ${id} not found`);
	}

	return row;
}

export async function listChatRoomInvitationsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: ChatRoomInvitationRow['id'][],
): Promise<ChatRoomInvitationRow[]> {
	if (ids.length === 0) {
		return [];
	}

	const rows = await db
		.select()
		.from(chatRoomInvitation)
		.where(inArray(chatRoomInvitation.id, ids));
	const invitationById = new Map(rows.map(row => [row.id, row]));

	return ids.map(id => invitationById.get(id)).filter((row): row is ChatRoomInvitationRow => row != null);
}

export async function fetchChatRoomInvitationOrFailFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	userId: MiUser['id'],
): Promise<ChatRoomInvitationRow> {
	const row = await fetchChatRoomInvitationFromDatabase(db, roomId, userId);
	if (row == null) {
		throw new Error(`Chat room invitation for ${userId} in ${roomId} not found`);
	}

	return row;
}

export async function listChatRoomInvitationsByRoomIdFromDatabase(
	db: MiDrizzleDatabase,
	roomId: MiChatRoom['id'],
	options: {
		limit?: number;
		order?: ChatRoomRecordOrder;
		sinceId?: string | null;
		untilId?: string | null;
	} = {},
): Promise<ChatRoomInvitationRow[]> {
	const conditions: SQL[] = [eq(chatRoomInvitation.roomId, roomId)];
	applyChatRoomInvitationPaginationCondition(conditions, options.sinceId, options.untilId);

	let query = db
		.select()
		.from(chatRoomInvitation)
		.where(and(...conditions))
		.orderBy((options.order ?? 'asc') === 'asc' ? asc(chatRoomInvitation.id) : desc(chatRoomInvitation.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	return await query;
}

export async function listChatRoomInvitationsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		ignored?: boolean;
		limit?: number;
		order?: ChatRoomRecordOrder;
		sinceId?: string | null;
		untilId?: string | null;
	} = {},
): Promise<ChatRoomInvitationRow[]> {
	const conditions: SQL[] = [eq(chatRoomInvitation.userId, userId)];
	if (options.ignored !== undefined) {
		conditions.push(eq(chatRoomInvitation.ignored, options.ignored));
	}
	applyChatRoomInvitationPaginationCondition(conditions, options.sinceId, options.untilId);

	let query = db
		.select()
		.from(chatRoomInvitation)
		.where(and(...conditions))
		.orderBy((options.order ?? 'asc') === 'asc' ? asc(chatRoomInvitation.id) : desc(chatRoomInvitation.id))
		.$dynamic();

	if (options.limit != null) {
		query = query.limit(options.limit);
	}

	return await query;
}

export async function listChatRoomInvitationsByRoomIdsAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	roomIds: MiChatRoom['id'][],
	userId: MiUser['id'],
): Promise<ChatRoomInvitationRow[]> {
	if (roomIds.length === 0) {
		return [];
	}

	return await db
		.select()
		.from(chatRoomInvitation)
		.where(and(
			inArray(chatRoomInvitation.roomId, roomIds),
			eq(chatRoomInvitation.userId, userId),
		));
}

export async function createChatRoomInvitationInDatabase(
	db: MiDrizzleDatabase,
	data: ChatRoomInvitationInsert,
	maximumMembers: number,
): Promise<ChatRoomInvitationRow> {
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('chat-room-membership'), hashtext(${data.roomId}))`);
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('chat-room-invitation'), hashtext(${`${data.roomId}:${data.userId}`}))`);
		const [membership] = await tx
			.select({ id: chatRoomMembership.id })
			.from(chatRoomMembership)
			.where(chatRoomMembershipCondition(data.roomId, data.userId))
			.limit(1);
		const [invitation] = await tx
			.select({ id: chatRoomInvitation.id })
			.from(chatRoomInvitation)
			.where(chatRoomInvitationCondition(data.roomId, data.userId))
			.limit(1);
		if (membership != null || invitation != null) throw new ChatRoomInvitationConflictError();
		const [membershipCount] = await tx
			.select({ count: count() })
			.from(chatRoomMembership)
			.where(eq(chatRoomMembership.roomId, data.roomId));
		if ((membershipCount?.count ?? 0) >= maximumMembers) throw new ChatRoomCapacityExceededError();

		const [row] = await tx
			.insert(chatRoomInvitation)
			.values(data)
			.returning();

		if (row == null) {
			throw new Error('Failed to create chat room invitation');
		}

		return row;
	});
}

export async function deleteChatRoomInvitationByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: ChatRoomInvitationRow['id'],
): Promise<void> {
	await db
		.delete(chatRoomInvitation)
		.where(eq(chatRoomInvitation.id, id));
}

export async function updateChatRoomInvitationIgnoredFromDatabase(
	db: MiDrizzleDatabase,
	id: ChatRoomInvitationRow['id'],
	ignored: boolean,
): Promise<void> {
	await db
		.update(chatRoomInvitation)
		.set({ ignored })
		.where(eq(chatRoomInvitation.id, id));
}
