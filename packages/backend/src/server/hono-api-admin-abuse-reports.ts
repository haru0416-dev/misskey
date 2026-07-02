/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { listAbuseReportNotificationRecipientsFromDatabase } from '@/core/AbuseReportNotificationRecipientStore.js';
import { fetchAbuseUserReportByIdFromDatabase, listAbuseUserReportsFromDatabase, markAbuseUserReportForwardedInDatabase, resolveAbuseUserReportInDatabase, resolveAbuseUserReportPagination, updateAbuseUserReportModerationNoteInDatabase } from '@/core/AbuseUserReportStore.js';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/SystemWebhookQueue.js';
import { listSystemWebhooksFromDatabase } from '@/core/SystemWebhookStore.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IActivity, IFlag, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { DeliverQueue, SystemWebhookDeliverQueue } from '@/core/QueueModule.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { packUserDetailedNotMeManyForHonoApi, packUserLiteManyForHonoApi, type UserDetailedNotMeHonoApiResponse } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminAbuseReportsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
};

const adminResolveAbuseUserReportParamDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
		resolvedAs: { type: 'string', enum: ['accept', 'reject', null], nullable: true },
	},
	required: ['reportId'],
} as const;

const adminUpdateAbuseUserReportParamDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
		moderationNote: { type: 'string' },
	},
	required: ['reportId'],
} as const;

const adminForwardAbuseUserReportParamDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
	},
	required: ['reportId'],
} as const;

const adminAbuseUserReportsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		state: { type: 'string', nullable: true, default: null },
		reporterOrigin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'combined' },
		targetUserOrigin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'combined' },
	},
	required: [],
} as const;

type AdminResolveAbuseUserReportParams = SchemaType<typeof adminResolveAbuseUserReportParamDef>;
type AdminUpdateAbuseUserReportParams = SchemaType<typeof adminUpdateAbuseUserReportParamDef>;
type AdminForwardAbuseUserReportParams = SchemaType<typeof adminForwardAbuseUserReportParamDef>;
type AdminAbuseUserReportsParams = SchemaType<typeof adminAbuseUserReportsParamDef> & {
	state: string | null;
	reporterOrigin: 'combined' | 'local' | 'remote';
	targetUserOrigin: 'combined' | 'local' | 'remote';
};
type HonoApiAbuseUserReport = {
	id: string;
	createdAt: string;
	comment: string;
	resolved: boolean;
	reporterId: string;
	targetUserId: string;
	assigneeId: string | null;
	reporter: UserDetailedNotMeHonoApiResponse;
	targetUser: UserDetailedNotMeHonoApiResponse;
	assignee: UserDetailedNotMeHonoApiResponse | null;
	forwarded: boolean;
	resolvedAs: MiAbuseUserReport['resolvedAs'];
	moderationNote: string;
};

function noSuchAbuseReportForResolveError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such abuse report.',
		code: 'NO_SUCH_ABUSE_REPORT',
		id: 'ac3794dd-2ce4-d878-e546-73c60c06b398',
		kind: 'server',
	});
}

function noSuchAbuseReportForUpdateError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such abuse report.',
		code: 'NO_SUCH_ABUSE_REPORT',
		id: '15f51cf5-46d1-4b1d-a618-b35bcbed0662',
		kind: 'server',
	});
}

function noSuchAbuseReportForForwardError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such abuse report.',
		code: 'NO_SUCH_ABUSE_REPORT',
		id: '8763e21b-d9bc-40be-acf6-54c1a6986493',
		kind: 'server',
	});
}

function genLocalUserUri(config: Config, userId: MiLocalUser['id']): string {
	return `${config.url}/users/${userId}`;
}

function renderFlag(config: Config, user: MiLocalUser, object: IObject | string, content: string): IFlag {
	return {
		type: 'Flag',
		actor: genLocalUserUri(config, user.id),
		content,
		object,
	};
}

function addActivityContext<T extends IObject>(config: Config, activity: T): T & { '@context': typeof CONTEXT; id: string } {
	if (activity.id == null) {
		activity.id = `${config.url}/${randomUUID()}`;
	}

	return Object.assign({ '@context': CONTEXT }, activity as T & { id: string });
}

async function packAbuseReportForSystemWebhook(
	deps: HonoApiAdminAbuseReportsDependencies,
	report: MiAbuseUserReport,
): Promise<SystemWebhookPayload<'abuseReportResolved'>> {
	const userIds = [...new Set([
		report.reporterId,
		report.targetUserId,
		report.assigneeId,
	].filter(x => x != null))];
	const users = userIds.length > 0 ? await packUserLiteManyForHonoApi(deps, userIds) : [];
	const usersMap = new Map(users.map(user => [user.id, user]));

	return {
		...report,
		reporter: usersMap.get(report.reporterId) ?? null,
		targetUser: usersMap.get(report.targetUserId) ?? null,
		assignee: report.assigneeId == null ? null : usersMap.get(report.assigneeId) ?? null,
	};
}

async function notifyAbuseReportResolvedSystemWebhook(
	deps: HonoApiAdminAbuseReportsDependencies,
	report: MiAbuseUserReport,
): Promise<void> {
	const inactiveRecipients = await listAbuseReportNotificationRecipientsFromDatabase(deps.db, {
		method: ['webhook'],
		joinSystemWebhook: true,
	}).then(recipients => recipients.filter(recipient => !recipient.isActive));
	const excludes = new Set(inactiveRecipients.map(recipient => recipient.systemWebhookId).filter(x => x != null));
	const webhooks = await listSystemWebhooksFromDatabase(deps.db, {
		isActive: true,
		on: ['abuseReportResolved'],
	});
	const targetWebhooks = webhooks.filter(webhook => !excludes.has(webhook.id));
	if (targetWebhooks.length === 0) return;

	const content = await packAbuseReportForSystemWebhook(deps, report);

	await Promise.all(targetWebhooks
		.map(webhook => enqueueSystemWebhookDeliverJob(deps.systemWebhookDeliverQueue, webhook, 'abuseReportResolved', content)));
}

async function packAbuseUserReportsForHonoApi(
	deps: HonoApiAdminAbuseReportsDependencies,
	reports: MiAbuseUserReport[],
): Promise<HonoApiAbuseUserReport[]> {
	const userRefs = [
		...reports.map(report => report.reporter ?? report.reporterId),
		...reports.map(report => report.targetUser ?? report.targetUserId),
		...reports.map(report => report.assignee ?? report.assigneeId).filter(x => x != null),
	];
	const users = userRefs.length > 0 ? await packUserDetailedNotMeManyForHonoApi(deps, userRefs) : [];
	const userMap = new Map(users.map(user => [String(user.id), user]));

	return reports.map(report => ({
		id: report.id,
		createdAt: parseId(deps.config, report.id).date.toISOString(),
		comment: report.comment,
		resolved: report.resolved,
		reporterId: report.reporterId,
		targetUserId: report.targetUserId,
		assigneeId: report.assigneeId,
		reporter: userMap.get(report.reporterId)!,
		targetUser: userMap.get(report.targetUserId)!,
		assignee: report.assigneeId == null ? null : userMap.get(report.assigneeId)!,
		forwarded: report.forwarded,
		resolvedAs: report.resolvedAs,
		moderationNote: report.moderationNote,
	}));
}

export async function handleHonoApiAdminAbuseUserReports(
	deps: HonoApiAdminAbuseReportsDependencies,
	body: Record<string, unknown>,
): Promise<HonoApiAbuseUserReport[]> {
	const params = parseHonoApiParams(adminAbuseUserReportsParamDef, body) as AdminAbuseUserReportsParams;
	const reports = await listAbuseUserReportsFromDatabase(deps.db, {
		limit: params.limit,
		...resolveAbuseUserReportPagination({
			gen: time => genId(deps.config, time),
		}, params),
		state: params.state,
		reporterOrigin: params.reporterOrigin,
		targetUserOrigin: params.targetUserOrigin,
	});

	return await packAbuseUserReportsForHonoApi(deps, reports);
}

export async function handleHonoApiAdminForwardAbuseUserReport(
	deps: HonoApiAdminAbuseReportsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminForwardAbuseUserReportParamDef, body) as AdminForwardAbuseUserReportParams;
	const report = await fetchAbuseUserReportByIdFromDatabase(deps.db, params.reportId);
	if (report == null) throw noSuchAbuseReportForForwardError();

	if (report.targetUserHost == null) {
		throw new Error('The target user host is null.');
	}

	if (report.forwarded) {
		throw new Error('The report has already been forwarded.');
	}

	await markAbuseUserReportForwardedInDatabase(deps.db, report.id);

	const actor = await fetchOrCreateSystemAccount(deps.db, deps.config, deps.meta, 'actor');
	const targetUser = await fetchUserByIdOrFailFromDatabase(deps.db, report.targetUserId);
	const flag = renderFlag(deps.config, actor, targetUser.uri!, report.comment);
	const content = addActivityContext(deps.config, flag);
	enqueueDeliverJob(deps.deliverQueue, deps.config, actor, content as IActivity, targetUser.inbox, false);

	await logModerationEventInDatabase(deps, me, 'forwardAbuseReport', {
		reportId: report.id,
		report,
	});
}

export async function handleHonoApiAdminResolveAbuseUserReport(
	deps: HonoApiAdminAbuseReportsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminResolveAbuseUserReportParamDef, body) as AdminResolveAbuseUserReportParams;
	const report = await fetchAbuseUserReportByIdFromDatabase(deps.db, params.reportId);
	if (report == null) throw noSuchAbuseReportForResolveError();

	const resolvedAs = params.resolvedAs ?? null;
	await resolveAbuseUserReportInDatabase(deps.db, report.id, {
		assigneeId: me.id,
		resolvedAs,
	});

	await logModerationEventInDatabase(deps, me, 'resolveAbuseReport', {
		reportId: report.id,
		report,
		resolvedAs,
	});

	const resolvedReport = await fetchAbuseUserReportByIdFromDatabase(deps.db, report.id);
	if (resolvedReport != null) {
		await notifyAbuseReportResolvedSystemWebhook(deps, resolvedReport);
	}
}

export async function handleHonoApiAdminUpdateAbuseUserReport(
	deps: HonoApiAdminAbuseReportsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminUpdateAbuseUserReportParamDef, body) as AdminUpdateAbuseUserReportParams;
	const report = await fetchAbuseUserReportByIdFromDatabase(deps.db, params.reportId);
	if (report == null) throw noSuchAbuseReportForUpdateError();

	await updateAbuseUserReportModerationNoteInDatabase(deps.db, report.id, params.moderationNote);

	if (params.moderationNote != null && report.moderationNote !== params.moderationNote) {
		await logModerationEventInDatabase(deps, me, 'updateAbuseReportNote', {
			reportId: report.id,
			report,
			before: report.moderationNote,
			after: params.moderationNote,
		});
	}
}
