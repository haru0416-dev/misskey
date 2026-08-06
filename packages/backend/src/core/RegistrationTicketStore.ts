/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import {
	registrationTicket,
	type RegistrationTicketInsert,
	type RegistrationTicketRow,
} from '@/db/schema/registration-ticket.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { acquireAdvisoryTransactionLockInDatabase } from '@/misc/db-advisory-lock.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { MiUser } from '@/models/User.js';

export type RegistrationTicketOrder = 'asc' | 'desc';

export async function fetchRegistrationTicketByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: RegistrationTicketRow['id'],
): Promise<RegistrationTicketRow | null> {
	const [row] = await db.select().from(registrationTicket).where(eq(registrationTicket.id, id)).limit(1);

	return row ?? null;
}

export async function fetchRegistrationTicketByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: RegistrationTicketRow['id'],
): Promise<RegistrationTicketRow> {
	const row = await fetchRegistrationTicketByIdFromDatabase(db, id);

	if (row == null) {
		throw new Error(`RegistrationTicket ${id} not found`);
	}

	return row;
}

export async function fetchRegistrationTicketByCodeFromDatabase(
	db: MiDrizzleDatabase,
	code: RegistrationTicketRow['code'],
): Promise<RegistrationTicketRow | null> {
	const [row] = await db.select().from(registrationTicket).where(eq(registrationTicket.code, code)).limit(1);

	return row ?? null;
}

export async function fetchRegistrationTicketByPendingUserIdFromDatabase(
	db: MiDrizzleDatabase,
	pendingUserId: NonNullable<RegistrationTicketRow['pendingUserId']>,
): Promise<RegistrationTicketRow | null> {
	const [row] = await db
		.select()
		.from(registrationTicket)
		.where(eq(registrationTicket.pendingUserId, pendingUserId))
		.limit(1);

	return row ?? null;
}

export async function countRegistrationTicketsCreatedSinceFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		createdById: MiUser['id'];
		sinceId: string;
	},
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(registrationTicket)
		.where(and(eq(registrationTicket.createdById, options.createdById), gt(registrationTicket.id, options.sinceId)));

	return row?.count ?? 0;
}

export async function createRegistrationTicketInDatabase(
	db: MiDrizzleDatabase,
	data: RegistrationTicketInsert,
): Promise<RegistrationTicketRow> {
	const [row] = await db.insert(registrationTicket).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create registration ticket');
	}

	return row;
}

export async function createRegistrationTicketWithinLimitInDatabase(
	db: MiDrizzleDatabase,
	data: RegistrationTicketInsert & { createdById: MiUser['id'] },
	options: {
		sinceId: string;
		limit: number;
	},
): Promise<RegistrationTicketRow | null> {
	return await db.transaction(async (tx) => {
		await acquireAdvisoryTransactionLockInDatabase(tx, 'invitation-limit', data.createdById);
		const count = await countRegistrationTicketsCreatedSinceFromDatabase(tx, {
			createdById: data.createdById,
			sinceId: options.sinceId,
		});
		if (count >= options.limit) return null;

		const [row] = await tx.insert(registrationTicket).values(data).returning();
		if (row == null) throw new Error('Failed to create registration ticket');
		return row;
	});
}

export async function createRegistrationTicketsInDatabase(
	db: MiDrizzleDatabase,
	data: RegistrationTicketInsert[],
): Promise<RegistrationTicketRow[]> {
	if (data.length === 0) return [];

	const rows = await db.insert(registrationTicket).values(data).returning();
	const rowById = new Map(rows.map((row) => [row.id, row]));

	return data.map((ticket) => {
		const row = rowById.get(ticket.id);
		if (row == null) {
			throw new Error(`Failed to create registration ticket ${ticket.id}`);
		}
		return row;
	});
}

export async function updateRegistrationTicketInDatabase(
	db: MiDrizzleDatabase,
	id: RegistrationTicketRow['id'],
	values: Partial<RegistrationTicketInsert>,
): Promise<void> {
	await db.update(registrationTicket).set(values).where(eq(registrationTicket.id, id));
}

export async function deleteRegistrationTicketInDatabase(
	db: MiDrizzleDatabase,
	id: RegistrationTicketRow['id'],
): Promise<void> {
	await db.delete(registrationTicket).where(eq(registrationTicket.id, id));
}

function applyRegistrationTicketPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(registrationTicket.id, sinceId));
		conditions.push(lt(registrationTicket.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(registrationTicket.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(registrationTicket.id, untilId));
	}
}

/**
 * invite/list 向け。sinceId/untilId/sinceDate/untilDate から実際に使うカーソルと並び順を解決する
 * (旧 pagination query と同じセマンティクス)。
 */
export function resolveRegistrationTicketPagination(
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
	order: RegistrationTicketOrder;
} {
	return resolveDateIdPagination(idService, options);
}

/**
 * invite/list 向け。自分が作成した招待コードをページネーションして列挙する。
 */
export async function listRegistrationTicketsCreatedByFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		createdById: MiUser['id'];
		limit: number;
		order: RegistrationTicketOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<RegistrationTicketRow[]> {
	const conditions: SQL[] = [eq(registrationTicket.createdById, options.createdById)];
	applyRegistrationTicketPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(registrationTicket)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(registrationTicket.id) : desc(registrationTicket.id))
		.limit(options.limit);
}

/**
 * admin/invite/list 向け。unused/used/expired/all のフィルタと createdAt/usedAt ソートで一覧を返す。
 */
export async function listRegistrationTicketsForAdminFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		offset: number;
		type: 'unused' | 'used' | 'expired' | 'all';
		sort?: '+createdAt' | '-createdAt' | '+usedAt' | '-usedAt';
	},
): Promise<RegistrationTicketRow[]> {
	const conditions: SQL[] = [];

	switch (options.type) {
		case 'unused':
			conditions.push(isNull(registrationTicket.usedById));
			break;
		case 'used':
			conditions.push(isNotNull(registrationTicket.usedById));
			break;
		case 'expired':
			conditions.push(lt(registrationTicket.expiresAt, new Date()));
			break;
	}

	let orderBy: SQL;
	switch (options.sort) {
		case '+createdAt':
			orderBy = desc(registrationTicket.id);
			break;
		case '-createdAt':
			orderBy = asc(registrationTicket.id);
			break;
		case '+usedAt':
			orderBy = sql`${registrationTicket.usedAt} DESC NULLS LAST`;
			break;
		case '-usedAt':
			orderBy = sql`${registrationTicket.usedAt} ASC NULLS FIRST`;
			break;
		default:
			orderBy = desc(registrationTicket.id);
			break;
	}

	return await db
		.select()
		.from(registrationTicket)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(orderBy)
		.limit(options.limit)
		.offset(options.offset);
}
