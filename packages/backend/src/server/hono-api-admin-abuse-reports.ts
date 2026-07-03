/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { deleteAbuseReportNotificationRecipientsFromDatabase, listAbuseReportNotificationRecipientsFromDatabase } from '@/core/AbuseReportNotificationRecipientStore.js';
import { createAbuseUserReportInDatabase, fetchAbuseUserReportByIdFromDatabase, listAbuseUserReportsFromDatabase, markAbuseUserReportForwardedInDatabase, resolveAbuseUserReportInDatabase, resolveAbuseUserReportPagination, updateAbuseUserReportModerationNoteInDatabase } from '@/core/AbuseUserReportStore.js';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { listRoleAssignmentsByRoleIdsFromDatabase } from '@/core/RoleAssignmentStore.js';
import { listRolesFromDatabase } from '@/core/RoleStore.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/SystemWebhookQueue.js';
import { listSystemWebhooksFromDatabase } from '@/core/SystemWebhookStore.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import { fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IActivity, IFlag, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { DeliverQueue, SystemWebhookDeliverQueue } from '@/core/QueueModule.js';
import type { EmailService } from '@/core/EmailService.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiAbuseReportNotificationRecipient } from '@/models/AbuseReportNotificationRecipient.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { HonoApiAdminStreamPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { isHonoApiAdministrator, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { packUserDetailedNotMeManyForHonoApi, packUserLiteManyForHonoApi, type UserDetailedNotMeHonoApiResponse } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminAbuseReportsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
};

export type HonoApiUsersReportAbuseDependencies = HonoApiAdminAbuseReportsDependencies & HonoApiRolePolicyDependencies & {
	emailService: Pick<EmailService, 'sendEmail'>;
	publishAdminStream?: HonoApiAdminStreamPublisher;
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

async function packAbuseReportForSystemWebhook<T extends 'abuseReport' | 'abuseReportResolved'>(
	deps: HonoApiAdminAbuseReportsDependencies,
	report: MiAbuseUserReport,
): Promise<SystemWebhookPayload<T>> {
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
	} as SystemWebhookPayload<T>;
}

export async function notifyAbuseReportSystemWebhookForHonoApi(
	deps: HonoApiAdminAbuseReportsDependencies,
	reports: MiAbuseUserReport[],
	type: 'abuseReport' | 'abuseReportResolved',
): Promise<void> {
	if (reports.length === 0) return;

	const inactiveRecipients = await listAbuseReportNotificationRecipientsFromDatabase(deps.db, {
		method: ['webhook'],
		joinSystemWebhook: true,
	}).then(recipients => recipients.filter(recipient => !recipient.isActive));
	const excludes = new Set(inactiveRecipients.map(recipient => recipient.systemWebhookId).filter(x => x != null));
	const webhooks = await listSystemWebhooksFromDatabase(deps.db, {
		isActive: true,
		on: [type],
	});
	const targetWebhooks = webhooks.filter(webhook => !excludes.has(webhook.id));
	if (targetWebhooks.length === 0) return;

	await Promise.all(reports.map(async report => {
		const content = await packAbuseReportForSystemWebhook(deps, report);
		await Promise.all(targetWebhooks
			.map(webhook => enqueueSystemWebhookDeliverJob(deps.systemWebhookDeliverQueue, webhook, type, content)));
	}));
}

async function notifyAbuseReportResolvedSystemWebhook(
	deps: HonoApiAdminAbuseReportsDependencies,
	report: MiAbuseUserReport,
): Promise<void> {
	await notifyAbuseReportSystemWebhookForHonoApi(deps, [report], 'abuseReportResolved');
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

async function getModeratorIdsExcludeExpireForHonoApi(deps: HonoApiUsersReportAbuseDependencies): Promise<MiUser['id'][]> {
	const roles = await listRolesFromDatabase(deps.db);
	const moderatorRoles = roles.filter(role => role.isModerator || role.isAdministrator);
	const assigns = moderatorRoles.length > 0
		? await listRoleAssignmentsByRoleIdsFromDatabase(deps.db, moderatorRoles.map(role => role.id))
		: [];

	const now = Date.now();
	return [...new Set(
		assigns
			.filter(assign => assign.expiresAt == null || assign.expiresAt.getTime() > now)
			.map(assign => assign.userId),
	)];
}

async function notifyAbuseReportAdminStreamForHonoApi(
	deps: HonoApiUsersReportAbuseDependencies,
	reports: MiAbuseUserReport[],
): Promise<void> {
	if (reports.length === 0 || deps.publishAdminStream == null) return;

	const moderatorIds = await getModeratorIdsExcludeExpireForHonoApi(deps);

	for (const moderatorId of moderatorIds) {
		for (const report of reports) {
			deps.publishAdminStream(moderatorId, 'newAbuseUserReport', {
				id: report.id,
				targetUserId: report.targetUserId,
				reporterId: report.reporterId,
				comment: report.comment,
			});
		}
	}
}

async function removeUnauthorizedRecipientUsersForHonoApi(
	deps: HonoApiUsersReportAbuseDependencies,
	recipients: MiAbuseReportNotificationRecipient[],
): Promise<MiAbuseReportNotificationRecipient[]> {
	const userRecipients = recipients.filter(recipient => recipient.userId !== null);
	const recipientUserIds = new Set(userRecipients.map(recipient => recipient.userId).filter(x => x != null));
	if (recipientUserIds.size === 0) return recipients;

	const authorizedUserIds = await getModeratorIdsExcludeExpireForHonoApi(deps);
	const authorizedSet = new Set(authorizedUserIds);
	const authorizedUserRecipients: MiAbuseReportNotificationRecipient[] = [];
	const unauthorizedUserRecipients: MiAbuseReportNotificationRecipient[] = [];
	for (const recipient of userRecipients) {
		if (authorizedSet.has(recipient.userId!)) {
			authorizedUserRecipients.push(recipient);
		} else {
			unauthorizedUserRecipients.push(recipient);
		}
	}

	if (unauthorizedUserRecipients.length > 0) {
		await deleteAbuseReportNotificationRecipientsFromDatabase(deps.db, unauthorizedUserRecipients.map(recipient => recipient.id));
	}

	const nonUserRecipients = recipients.filter(recipient => recipient.userId === null);
	return [...nonUserRecipients, ...authorizedUserRecipients].sort((a, b) => a.id.localeCompare(b.id));
}

async function notifyAbuseReportMailForHonoApi(
	deps: HonoApiUsersReportAbuseDependencies,
	reports: MiAbuseUserReport[],
): Promise<void> {
	if (reports.length === 0) return;

	const emailRecipientsRaw = await listAbuseReportNotificationRecipientsFromDatabase(deps.db, {
		method: ['email'],
		joinUser: true,
	});
	const emailRecipients = await removeUnauthorizedRecipientUsersForHonoApi(deps, emailRecipientsRaw);
	const recipientEmailAddresses = emailRecipients
		.filter(recipient => recipient.isActive && recipient.userProfile?.emailVerified)
		.map(recipient => recipient.userProfile?.email)
		.filter((email): email is string => email != null);

	if (deps.meta.email) recipientEmailAddresses.push(deps.meta.email);
	if (recipientEmailAddresses.length === 0) return;

	for (const mailAddress of recipientEmailAddresses) {
		await Promise.all(reports.map(report => deps.emailService.sendEmail(
			mailAddress,
			'New Abuse Report',
			sanitizeHtml(report.comment),
			sanitizeHtml(report.comment),
		)));
	}
}

async function reportAbuseForHonoApi(
	deps: HonoApiUsersReportAbuseDependencies,
	params: {
		targetUserId: MiUser['id'];
		targetUserHost: MiUser['host'];
		reporterId: MiUser['id'];
		reporterHost: MiUser['host'];
		comment: string;
	}[],
): Promise<void> {
	const reports: MiAbuseUserReport[] = [];
	for (const param of params) {
		const report = await createAbuseUserReportInDatabase(deps.db, {
			id: genId(deps.config),
			targetUserId: param.targetUserId,
			targetUserHost: param.targetUserHost,
			reporterId: param.reporterId,
			reporterHost: param.reporterHost,
			comment: param.comment,
		});
		reports.push(report);
	}

	await Promise.all([
		notifyAbuseReportAdminStreamForHonoApi(deps, reports),
		notifyAbuseReportSystemWebhookForHonoApi(deps, reports, 'abuseReport'),
		notifyAbuseReportMailForHonoApi(deps, reports),
	]);
}

function usersReportAbuseNoSuchUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: '1acefcb5-0959-43fd-9685-b48305736cb5',
	});
}

function usersReportAbuseCannotReportYourselfError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Cannot report yourself.',
		code: 'CANNOT_REPORT_YOURSELF',
		id: '1e13149e-b1e8-43cf-902e-c01dbfcb202f',
	});
}

function usersReportAbuseCannotReportAdminError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Cannot report the admin.',
		code: 'CANNOT_REPORT_THE_ADMIN',
		id: '35e166f5-05fb-4f87-a2d5-adb42676d48f',
	});
}

const usersReportAbuseParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		comment: { type: 'string', minLength: 1, maxLength: 2048 },
	},
	required: ['userId', 'comment'],
} as const;

type UsersReportAbuseParams = {
	userId: string;
	comment: string;
};

export async function handleHonoApiUsersReportAbuse(
	deps: HonoApiUsersReportAbuseDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(usersReportAbuseParamDef, body) as UsersReportAbuseParams;

	const targetUser = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (targetUser == null) throw usersReportAbuseNoSuchUserError();

	if (targetUser.id === me.id) {
		throw usersReportAbuseCannotReportYourselfError();
	}

	if (await isHonoApiAdministrator(deps, targetUser)) {
		throw usersReportAbuseCannotReportAdminError();
	}

	await reportAbuseForHonoApi(deps, [{
		targetUserId: targetUser.id,
		targetUserHost: targetUser.host,
		reporterId: me.id,
		reporterHost: null,
		comment: params.comment,
	}]);
}
