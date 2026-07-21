/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { noteDraft, type NoteDraftInsert, type NoteDraftRow } from '@/db/schema/note-draft.js';
import { user } from '@/db/schema/user.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { MiNoteDraft } from '@/models/NoteDraft.js';
import type { MiUser } from '@/models/User.js';
import { deserializeUser } from './UserStore.js';

export type NoteDraftOrder = 'asc' | 'desc';
type NoteDraftUpdateValues = Omit<NoteDraftInsert, 'id' | 'userId'>;
type NoteDraftUpdate = { [K in keyof NoteDraftUpdateValues]?: NoteDraftUpdateValues[K] | undefined };

function deserializeNoteDraft(
	row: NoteDraftRow,
	relations: {
		user?: MiUser | null;
	} = {},
): MiNoteDraft {
	return {
		...row,
		user: relations.user ?? null,
		reply: null,
		renote: null,
		channel: null,
	} as MiNoteDraft;
}

function toNoteDraftUpdate(data: NoteDraftUpdate): NoteDraftUpdate {
	return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as NoteDraftUpdate;
}

function applyNoteDraftPaginationCondition(conditions: SQL[], sinceId?: string | null, untilId?: string | null): void {
	if (sinceId && untilId) {
		conditions.push(gt(noteDraft.id, sinceId));
		conditions.push(lt(noteDraft.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(noteDraft.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(noteDraft.id, untilId));
	}
}

export function resolveNoteDraftPagination(
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
	order: NoteDraftOrder;
} {
	return resolveDateIdPagination(idService, options);
}

export async function fetchNoteDraftByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiNoteDraft['id'],
): Promise<MiNoteDraft | null> {
	const [row] = await db.select().from(noteDraft).where(eq(noteDraft.id, id)).limit(1);

	return row == null ? null : deserializeNoteDraft(row);
}

async function fetchNoteDraftByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiNoteDraft['id'],
): Promise<MiNoteDraft> {
	const draft = await fetchNoteDraftByIdFromDatabase(db, id);
	if (draft == null) {
		throw new Error(`Note draft ${id} not found`);
	}

	return draft;
}

export async function fetchNoteDraftByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiNoteDraft['id'],
	userId: MiUser['id'],
): Promise<MiNoteDraft | null> {
	const [row] = await db
		.select()
		.from(noteDraft)
		.where(and(eq(noteDraft.id, id), eq(noteDraft.userId, userId)))
		.limit(1);

	return row == null ? null : deserializeNoteDraft(row);
}

export async function fetchNoteDraftWithUserByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiNoteDraft['id'],
): Promise<MiNoteDraft | null> {
	const [row] = await db
		.select({
			draft: noteDraft,
			user,
		})
		.from(noteDraft)
		.leftJoin(user, eq(noteDraft.userId, user.id))
		.where(eq(noteDraft.id, id))
		.limit(1);

	if (row == null) {
		return null;
	}

	return deserializeNoteDraft(row.draft, {
		user: row.user == null ? null : deserializeUser(row.user),
	});
}

export async function countNoteDraftsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		isActuallyScheduled?: boolean;
	} = {},
): Promise<number> {
	const conditions: SQL[] = [eq(noteDraft.userId, userId)];
	if (options.isActuallyScheduled != null) {
		conditions.push(eq(noteDraft.isActuallyScheduled, options.isActuallyScheduled));
	}

	const [row] = await db
		.select({ count: count() })
		.from(noteDraft)
		.where(and(...conditions));

	return row?.count ?? 0;
}

export async function listNoteDraftsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: NoteDraftOrder;
		sinceId?: string | null;
		untilId?: string | null;
		scheduled?: boolean | null;
	},
): Promise<MiNoteDraft[]> {
	const conditions: SQL[] = [eq(noteDraft.userId, userId)];
	applyNoteDraftPaginationCondition(conditions, options.sinceId, options.untilId);

	if (options.scheduled != null) {
		conditions.push(eq(noteDraft.isActuallyScheduled, options.scheduled));
	}

	const rows = await db
		.select()
		.from(noteDraft)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(noteDraft.id) : desc(noteDraft.id))
		.limit(options.limit);

	return rows.map((row) => deserializeNoteDraft(row));
}

export async function createNoteDraftInDatabase(db: MiDrizzleDatabase, data: NoteDraftInsert): Promise<MiNoteDraft> {
	const [row] = await db.insert(noteDraft).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create note draft');
	}

	return deserializeNoteDraft(row);
}

export async function updateNoteDraftInDatabase(
	db: MiDrizzleDatabase,
	id: MiNoteDraft['id'],
	data: NoteDraftUpdate,
): Promise<MiNoteDraft> {
	const update = toNoteDraftUpdate(data);
	if (Object.keys(update).length === 0) {
		return fetchNoteDraftByIdOrFailFromDatabase(db, id);
	}

	const [row] = await db.update(noteDraft).set(update).where(eq(noteDraft.id, id)).returning();

	if (row == null) {
		throw new Error(`Note draft ${id} not found`);
	}

	return deserializeNoteDraft(row);
}

export async function deleteNoteDraftByIdFromDatabase(db: MiDrizzleDatabase, id: MiNoteDraft['id']): Promise<void> {
	await db.delete(noteDraft).where(eq(noteDraft.id, id));
}
