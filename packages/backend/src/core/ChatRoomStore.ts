/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import { chatRoomInvitation, type ChatRoomInvitationInsert, type ChatRoomInvitationRow } from '@/db/schema/chat-room-invitation.js';
import { chatRoomMembership, type ChatRoomMembershipInsert, type ChatRoomMembershipRow } from '@/db/schema/chat-room-membership.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import type { MiUser } from '@/models/User.js';

export type ChatRoomRecordOrder = 'asc' | 'desc';

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
	if (options.sinceId && options.untilId) {
		return { sinceId: options.sinceId, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceId) {
		return { sinceId: options.sinceId, untilId: null, order: 'asc' };
	} else if (options.untilId) {
		return { sinceId: null, untilId: options.untilId, order: 'desc' };
	} else {
		return { sinceId: null, untilId: null, order: 'desc' };
	}
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
): Promise<ChatRoomMembershipRow> {
	return await db.transaction(async (tx) => {
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
): Promise<ChatRoomInvitationRow> {
	const [row] = await db
		.insert(chatRoomInvitation)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create chat room invitation');
	}

	return row;
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
