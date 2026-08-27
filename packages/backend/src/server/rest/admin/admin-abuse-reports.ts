/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import {
	deleteAbuseReportNotificationRecipientsFromDatabase,
	listAbuseReportNotificationRecipientsFromDatabase,
} from '@/core/abuse/AbuseReportNotificationRecipientStore.js';
import {
	createAbuseUserReportInDatabase,
	fetchAbuseUserReportByIdFromDatabase,
	listAbuseUserReportsFromDatabase,
	markAbuseUserReportForwardedInDatabase,
	resolveAbuseUserReportInDatabase,
	resolveAbuseUserReportPagination,
	updateAbuseUserReportModerationNoteInDatabase,
} from '@/core/abuse/AbuseUserReportStore.js';
import { enqueueDeliverJob } from '@/core/queue/DeliverQueue.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { listRoleAssignmentsByRoleIdsFromDatabase } from '@/core/role/RoleAssignmentStore.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/queue/SystemWebhookQueue.js';
import { listSystemWebhooksFromDatabase } from '@/core/webhook/SystemWebhookStore.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account/system-account-runtime.js';
import { fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import type { IActivity, IFlag, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { DeliverQueue, SystemWebhookDeliverQueue } from '@/core/queue/queues.js';
import type { EmailService } from '@/core/email/EmailService.js';
import type { SystemWebhookPayload } from '@/core/webhook/system-webhook-types.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiAbuseReportNotificationRecipient } from '@/models/AbuseReportNotificationRecipient.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { ApiAdminStreamPublisher } from '../events.js';
import { ApiError } from '../error.js';
import { addActivityContext, genLocalUserUri } from '../user/following.js';
import { isApiAdministrator, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import {
	packUserDetailedNotMeManyForApi,
	packUserLiteManyForApi,
	type UserDetailedNotMeApiResponse,
} from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminAbuseReportsDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
};

export type ApiUsersReportAbuseDependencies = ApiAdminAbuseReportsDependencies &
	ApiRolePolicyDependencies & {
		emailService: Pick<EmailService, 'sendEmail'>;
		publishAdminStream?: ApiAdminStreamPublisher;
	};

export const adminResolveAbuseUserReportParamDef = z.object({
	reportId: misskeyId(),
	resolvedAs: z.union([z.enum(['accept', 'reject']), z.null()]).optional(),
});

export const adminUpdateAbuseUserReportParamDef = z.object({
	reportId: misskeyId(),
	moderationNote: z.string().optional(),
});

export const adminForwardAbuseUserReportParamDef = z.object({
	reportId: misskeyId(),
});

export const adminAbuseUserReportsParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	...paginationParams,
	state: z.string().nullable().optional().default(null),
	reporterOrigin: z.enum(['combined', 'local', 'remote']).optional().default('combined'),
	targetUserOrigin: z.enum(['combined', 'local', 'remote']).optional().default('combined'),
});

type AdminAbuseUserReportsParams = z.infer<typeof adminAbuseUserReportsParamDef> & {
	state: string | null;
	reporterOrigin: 'combined' | 'local' | 'remote';
	targetUserOrigin: 'combined' | 'local' | 'remote';
};
type ApiAbuseUserReport = {
	id: string;
	createdAt: string;
	comment: string;
	resolved: boolean;
	reporterId: string;
	targetUserId: string;
	assigneeId: string | null;
	reporter: UserDetailedNotMeApiResponse;
	targetUser: UserDetailedNotMeApiResponse;
	assignee: UserDetailedNotMeApiResponse | null;
	forwarded: boolean;
	resolvedAs: MiAbuseUserReport['resolvedAs'];
	moderationNote: string;
};

function noSuchAbuseReportForResolveError(): ApiError {
	return new ApiError({
		status: 404,
		message: 'No such abuse report.',
		code: 'NO_SUCH_ABUSE_REPORT',
		id: 'ac3794dd-2ce4-d878-e546-73c60c06b398',
		kind: 'server',
	});
}

function noSuchAbuseReportForUpdateError(): ApiError {
	return new ApiError({
		status: 404,
		message: 'No such abuse report.',
		code: 'NO_SUCH_ABUSE_REPORT',
		id: '15f51cf5-46d1-4b1d-a618-b35bcbed0662',
		kind: 'server',
	});
}

function noSuchAbuseReportForForwardError(): ApiError {
	return new ApiError({
		status: 404,
		message: 'No such abuse report.',
		code: 'NO_SUCH_ABUSE_REPORT',
		id: '8763e21b-d9bc-40be-acf6-54c1a6986493',
		kind: 'server',
	});
}

function renderFlag(config: Config, user: MiLocalUser, object: IObject | string, content: string): IFlag {
	return {
		type: 'Flag',
		actor: genLocalUserUri(config, user.id),
		content,
		object,
	};
}

async function packAbuseReportsForSystemWebhook<T extends 'abuseReport' | 'abuseReportResolved'>(
	deps: ApiAdminAbuseReportsDependencies,
	reports: MiAbuseUserReport[],
): Promise<SystemWebhookPayload<T>[]> {
	const userIds = [
		...new Set(
			[
				...reports.map((report) => report.reporterId),
				...reports.map((report) => report.targetUserId),
				...reports.map((report) => report.assigneeId),
			].filter((x): x is string => x != null),
		),
	];
	const users = userIds.length > 0 ? await packUserLiteManyForApi(deps, userIds) : [];
	const usersMap = new Map(users.map((user) => [user.id, user]));

	return reports.map(
		(report) =>
			({
				...report,
				reporter: usersMap.get(report.reporterId) ?? null,
				targetUser: usersMap.get(report.targetUserId) ?? null,
				assignee: report.assigneeId == null ? null : (usersMap.get(report.assigneeId) ?? null),
			}) as SystemWebhookPayload<T>,
	);
}

async function notifyAbuseReportSystemWebhookForApi(
	deps: ApiAdminAbuseReportsDependencies,
	reports: MiAbuseUserReport[],
	type: 'abuseReport' | 'abuseReportResolved',
): Promise<void> {
	if (reports.length === 0) return;

	const inactiveRecipients = await listAbuseReportNotificationRecipientsFromDatabase(deps.db, {
		method: ['webhook'],
		joinSystemWebhook: true,
	}).then((recipients) => recipients.filter((recipient) => !recipient.isActive));
	const excludes = new Set(inactiveRecipients.map((recipient) => recipient.systemWebhookId).filter((x) => x != null));
	const webhooks = await listSystemWebhooksFromDatabase(deps.db, {
		isActive: true,
		on: [type],
	});
	const targetWebhooks = webhooks.filter((webhook) => !excludes.has(webhook.id));
	if (targetWebhooks.length === 0) return;

	const contents = await packAbuseReportsForSystemWebhook<typeof type>(deps, reports);
	await Promise.all(
		contents.map(async (content) => {
			await Promise.all(
				targetWebhooks.map((webhook) =>
					enqueueSystemWebhookDeliverJob(deps.systemWebhookDeliverQueue, deps.config, webhook, type, content),
				),
			);
		}),
	);
}

async function notifyAbuseReportResolvedSystemWebhook(
	deps: ApiAdminAbuseReportsDependencies,
	report: MiAbuseUserReport,
): Promise<void> {
	await notifyAbuseReportSystemWebhookForApi(deps, [report], 'abuseReportResolved');
}

async function packAbuseUserReportsForApi(
	deps: ApiAdminAbuseReportsDependencies,
	reports: MiAbuseUserReport[],
): Promise<ApiAbuseUserReport[]> {
	const userRefs = [
		...reports.map((report) => report.reporter ?? report.reporterId),
		...reports.map((report) => report.targetUser ?? report.targetUserId),
		...reports.map((report) => report.assignee ?? report.assigneeId).filter((x) => x != null),
	];
	const users = userRefs.length > 0 ? await packUserDetailedNotMeManyForApi(deps, userRefs) : [];
	const userMap = new Map(users.map((user) => [String(user.id), user]));

	return reports.map((report) => ({
		id: report.id,
		createdAt: parseId(report.id).date.toISOString(),
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

export async function handleApiAdminAbuseUserReports(
	deps: ApiAdminAbuseReportsDependencies,
	body: Record<string, unknown>,
): Promise<ApiAbuseUserReport[]> {
	const params = parseApiParams(adminAbuseUserReportsParamDef, body);
	const reports = await listAbuseUserReportsFromDatabase(deps.db, {
		limit: params.limit,
		...resolveAbuseUserReportPagination(
			{
				gen: (time) => genId(time),
			},
			params,
		),
		state: params.state,
		reporterOrigin: params.reporterOrigin,
		targetUserOrigin: params.targetUserOrigin,
	});

	return await packAbuseUserReportsForApi(deps, reports);
}

export async function handleApiAdminForwardAbuseUserReport(
	deps: ApiAdminAbuseReportsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminForwardAbuseUserReportParamDef, body);
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

export async function handleApiAdminResolveAbuseUserReport(
	deps: ApiAdminAbuseReportsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminResolveAbuseUserReportParamDef, body);
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

export async function handleApiAdminUpdateAbuseUserReport(
	deps: ApiAdminAbuseReportsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminUpdateAbuseUserReportParamDef, body);
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

async function getModeratorIdsExcludeExpireForApi(deps: ApiUsersReportAbuseDependencies): Promise<MiUser['id'][]> {
	const roles = await listRolesFromDatabase(deps.db);
	const moderatorRoles = roles.filter((role) => role.isModerator || role.isAdministrator);
	const assigns =
		moderatorRoles.length > 0
			? await listRoleAssignmentsByRoleIdsFromDatabase(
					deps.db,
					moderatorRoles.map((role) => role.id),
				)
			: [];

	const now = Date.now();
	return [
		...new Set(
			assigns
				.filter((assign) => assign.expiresAt == null || assign.expiresAt.getTime() > now)
				.map((assign) => assign.userId),
		),
	];
}

async function notifyAbuseReportAdminStreamForApi(
	deps: ApiUsersReportAbuseDependencies,
	reports: MiAbuseUserReport[],
): Promise<void> {
	if (reports.length === 0 || deps.publishAdminStream == null) return;

	const moderatorIds = await getModeratorIdsExcludeExpireForApi(deps);

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

async function removeUnauthorizedRecipientUsersForApi(
	deps: ApiUsersReportAbuseDependencies,
	recipients: MiAbuseReportNotificationRecipient[],
): Promise<MiAbuseReportNotificationRecipient[]> {
	const userRecipients = recipients.filter((recipient) => recipient.userId !== null);
	const recipientUserIds = new Set(userRecipients.map((recipient) => recipient.userId).filter((x) => x != null));
	if (recipientUserIds.size === 0) return recipients;

	const authorizedUserIds = await getModeratorIdsExcludeExpireForApi(deps);
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
		await deleteAbuseReportNotificationRecipientsFromDatabase(
			deps.db,
			unauthorizedUserRecipients.map((recipient) => recipient.id),
		);
	}

	const nonUserRecipients = recipients.filter((recipient) => recipient.userId === null);
	return [...nonUserRecipients, ...authorizedUserRecipients].sort((a, b) => a.id.localeCompare(b.id));
}

async function notifyAbuseReportMailForApi(
	deps: ApiUsersReportAbuseDependencies,
	reports: MiAbuseUserReport[],
): Promise<void> {
	if (reports.length === 0) return;

	const emailRecipientsRaw = await listAbuseReportNotificationRecipientsFromDatabase(deps.db, {
		method: ['email'],
		joinUser: true,
	});
	const emailRecipients = await removeUnauthorizedRecipientUsersForApi(deps, emailRecipientsRaw);
	const recipientEmailAddresses = emailRecipients
		.filter((recipient) => recipient.isActive && recipient.userProfile?.emailVerified)
		.map((recipient) => recipient.userProfile?.email)
		.filter((email): email is string => email != null);

	if (deps.meta.email) recipientEmailAddresses.push(deps.meta.email);
	if (recipientEmailAddresses.length === 0) return;

	for (const mailAddress of recipientEmailAddresses) {
		await Promise.all(
			reports.map((report) =>
				deps.emailService.sendEmail(
					mailAddress,
					'New Abuse Report',
					sanitizeHtml(report.comment),
					sanitizeHtml(report.comment),
				),
			),
		);
	}
}

export async function reportAbuseForApi(
	deps: ApiUsersReportAbuseDependencies,
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
			id: genId(),
			targetUserId: param.targetUserId,
			targetUserHost: param.targetUserHost,
			reporterId: param.reporterId,
			reporterHost: param.reporterHost,
			comment: param.comment,
		});
		reports.push(report);
	}

	await Promise.all([
		notifyAbuseReportAdminStreamForApi(deps, reports),
		notifyAbuseReportSystemWebhookForApi(deps, reports, 'abuseReport'),
		notifyAbuseReportMailForApi(deps, reports),
	]);
}

function usersReportAbuseNoSuchUserError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: '1acefcb5-0959-43fd-9685-b48305736cb5',
	});
}

function usersReportAbuseCannotReportYourselfError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot report yourself.',
		code: 'CANNOT_REPORT_YOURSELF',
		id: '1e13149e-b1e8-43cf-902e-c01dbfcb202f',
	});
}

function usersReportAbuseCannotReportAdminError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot report the admin.',
		code: 'CANNOT_REPORT_THE_ADMIN',
		id: '35e166f5-05fb-4f87-a2d5-adb42676d48f',
	});
}

export const usersReportAbuseParamDef = z.object({
	userId: misskeyId(),
	comment: z.string().min(1).max(2048),
});

type UsersReportAbuseParams = {
	userId: string;
	comment: string;
};

export async function handleApiUsersReportAbuse(
	deps: ApiUsersReportAbuseDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(usersReportAbuseParamDef, body);

	const targetUser = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (targetUser == null) throw usersReportAbuseNoSuchUserError();

	if (targetUser.id === me.id) {
		throw usersReportAbuseCannotReportYourselfError();
	}

	if (await isApiAdministrator(deps, targetUser)) {
		throw usersReportAbuseCannotReportAdminError();
	}

	await reportAbuseForApi(deps, [
		{
			targetUserId: targetUser.id,
			targetUserHost: targetUser.host,
			reporterId: me.id,
			reporterHost: null,
			comment: params.comment,
		},
	]);
}
