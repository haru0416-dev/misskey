/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import { abuseUserReport, type AbuseUserReportInsert, type AbuseUserReportRow } from '@/db/schema/abuse-user-report.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { AbuseReportResolveType, MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiUser } from '@/models/User.js';

export type AbuseUserReportOrder = 'asc' | 'desc';

function deserializeAbuseUserReport(row: AbuseUserReportRow): MiAbuseUserReport {
	return {
		...row,
		targetUser: null,
		reporter: null,
		assignee: null,
	} as MiAbuseUserReport;
}

function applyAbuseUserReportPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(abuseUserReport.id, sinceId));
		conditions.push(lt(abuseUserReport.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(abuseUserReport.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(abuseUserReport.id, untilId));
	}
}

export function resolveAbuseUserReportPagination(
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
	order: AbuseUserReportOrder;
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

export async function fetchAbuseUserReportByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseUserReport['id'],
): Promise<MiAbuseUserReport | null> {
	const [row] = await db
		.select()
		.from(abuseUserReport)
		.where(eq(abuseUserReport.id, id))
		.limit(1);

	return row == null ? null : deserializeAbuseUserReport(row);
}

export async function fetchAbuseUserReportByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseUserReport['id'],
): Promise<MiAbuseUserReport> {
	const report = await fetchAbuseUserReportByIdFromDatabase(db, id);

	if (report == null) {
		throw new Error(`Abuse user report ${id} not found`);
	}

	return report;
}

export async function listAbuseUserReportsByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiAbuseUserReport['id'][],
): Promise<MiAbuseUserReport[]> {
	if (ids.length === 0) {
		return [];
	}

	const rows = await db
		.select()
		.from(abuseUserReport)
		.where(inArray(abuseUserReport.id, ids));

	return rows.map(deserializeAbuseUserReport);
}

export async function createAbuseUserReportInDatabase(
	db: MiDrizzleDatabase,
	data: AbuseUserReportInsert,
): Promise<MiAbuseUserReport> {
	const [row] = await db
		.insert(abuseUserReport)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create abuse user report');
	}

	return deserializeAbuseUserReport(row);
}

export async function resolveAbuseUserReportInDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseUserReport['id'],
	params: {
		assigneeId: MiUser['id'];
		resolvedAs: AbuseReportResolveType | null;
	},
): Promise<void> {
	await db
		.update(abuseUserReport)
		.set({
			resolved: true,
			assigneeId: params.assigneeId,
			resolvedAs: params.resolvedAs,
		})
		.where(eq(abuseUserReport.id, id));
}

export async function markAbuseUserReportForwardedInDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseUserReport['id'],
): Promise<void> {
	await db
		.update(abuseUserReport)
		.set({ forwarded: true })
		.where(eq(abuseUserReport.id, id));
}

export async function updateAbuseUserReportModerationNoteInDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseUserReport['id'],
	moderationNote: MiAbuseUserReport['moderationNote'] | undefined,
): Promise<void> {
	await db
		.update(abuseUserReport)
		.set({ moderationNote })
		.where(eq(abuseUserReport.id, id));
}

export async function listAbuseUserReportsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		order: AbuseUserReportOrder;
		sinceId?: string | null;
		untilId?: string | null;
		state?: string | null;
		reporterOrigin?: 'combined' | 'local' | 'remote';
		targetUserOrigin?: 'combined' | 'local' | 'remote';
	},
): Promise<MiAbuseUserReport[]> {
	const conditions: SQL[] = [];
	applyAbuseUserReportPaginationCondition(conditions, options.sinceId, options.untilId);

	switch (options.state) {
		case 'resolved': conditions.push(eq(abuseUserReport.resolved, true)); break;
		case 'unresolved': conditions.push(eq(abuseUserReport.resolved, false)); break;
	}

	switch (options.reporterOrigin) {
		case 'local': conditions.push(isNull(abuseUserReport.reporterHost)); break;
		case 'remote': conditions.push(isNotNull(abuseUserReport.reporterHost)); break;
	}

	switch (options.targetUserOrigin) {
		case 'local': conditions.push(isNull(abuseUserReport.targetUserHost)); break;
		case 'remote': conditions.push(isNotNull(abuseUserReport.targetUserHost)); break;
	}

	const rows = await db
		.select()
		.from(abuseUserReport)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(options.order === 'asc' ? asc(abuseUserReport.id) : desc(abuseUserReport.id))
		.limit(options.limit);

	return rows.map(deserializeAbuseUserReport);
}
