/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	createAbuseReportNotificationRecipientInDatabase,
	deleteAbuseReportNotificationRecipientsFromDatabase,
	fetchAbuseReportNotificationRecipientByIdOrFailFromDatabase,
	listAbuseReportNotificationRecipientsFromDatabase,
	updateAbuseReportNotificationRecipientInDatabase,
} from '@/core/abuse/AbuseReportNotificationRecipientStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { listRoleAssignmentsByRoleIdsFromDatabase } from '@/core/role/RoleAssignmentStore.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import {
	fetchSystemWebhookByIdOrFailFromDatabase,
	listSystemWebhooksFromDatabase,
} from '@/core/webhook/SystemWebhookStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/UserProfileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiAbuseReportNotificationRecipient, RecipientMethod } from '@/models/AbuseReportNotificationRecipient.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { packApiSystemWebhook } from './admin-system-webhooks.js';
import { packUserLiteForApi, packUserLiteManyForApi, type UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminAbuseReportNotificationRecipientDependencies = UserPackingDependencies;

export const adminAbuseReportNotificationRecipientListParamDef = z.object({
	method: z.array(z.enum(['email', 'webhook'])).optional(),
});

export const adminAbuseReportNotificationRecipientShowParamDef = z.object({
	id: misskeyId(),
});

export const adminAbuseReportNotificationRecipientCreateParamDef = z.object({
	isActive: z.boolean(),
	name: z.string().min(1).max(255),
	method: z.enum(['email', 'webhook']),
	userId: misskeyId().optional(),
	systemWebhookId: misskeyId().optional(),
});

export const adminAbuseReportNotificationRecipientUpdateParamDef = z.object({
	id: misskeyId(),
	isActive: z.boolean(),
	name: z.string().min(1).max(255),
	method: z.enum(['email', 'webhook']),
	userId: misskeyId().optional(),
	systemWebhookId: misskeyId().optional(),
});

export const adminAbuseReportNotificationRecipientDeleteParamDef = z.object({
	id: misskeyId(),
});

type AdminAbuseReportNotificationRecipientListParams = Omit<
	z.infer<typeof adminAbuseReportNotificationRecipientListParamDef>,
	'method'
> & {
	method?: RecipientMethod[];
};
type AdminAbuseReportNotificationRecipientCreateParams = Omit<
	z.infer<typeof adminAbuseReportNotificationRecipientCreateParamDef>,
	'method'
> & {
	method: RecipientMethod;
};
type AdminAbuseReportNotificationRecipientUpdateParams = Omit<
	z.infer<typeof adminAbuseReportNotificationRecipientUpdateParamDef>,
	'method'
> & {
	method: RecipientMethod;
};

function noSuchRecipientError(): ApiError {
	return new ApiError({
		status: 404,
		message: 'No such recipient.',
		code: 'NO_SUCH_RECIPIENT',
		id: '013de6a8-f757-04cb-4d73-cc2a7e3368e4',
		kind: 'server',
	});
}

function correlationCheckEmailError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'If "method" is email, "userId" must be set.',
		code: 'CORRELATION_CHECK_EMAIL',
		id: '348bb8ae-575a-6fe9-4327-5811999def8f',
	});
}

function correlationCheckWebhookError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'If "method" is webhook, "systemWebhookId" must be set.',
		code: 'CORRELATION_CHECK_WEBHOOK',
		id: 'b0c15051-de2d-29ef-260c-9585cddd701a',
	});
}

function emailAddressNotSetError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Email address is not set.',
		code: 'EMAIL_ADDRESS_NOT_SET',
		id: '7cc1d85e-2f58-fc31-b644-3de8d0d3421f',
	});
}

async function listModeratorIdsForAbuseReportNotification(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
): Promise<MiUser['id'][]> {
	const roles = await listRolesFromDatabase(deps.db);
	const moderatorRoleIds = roles.filter((role) => role.isModerator || role.isAdministrator).map((role) => role.id);
	const assignments =
		moderatorRoleIds.length > 0 ? await listRoleAssignmentsByRoleIdsFromDatabase(deps.db, moderatorRoleIds) : [];
	const now = Date.now();

	return [
		...new Set(
			assignments
				.filter((assignment) => assignment.expiresAt == null || assignment.expiresAt.getTime() > now)
				.map((assignment) => assignment.userId),
		),
	].sort((a, b) => a.localeCompare(b));
}

async function removeUnauthorizedRecipientUsers(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	recipients: MiAbuseReportNotificationRecipient[],
): Promise<MiAbuseReportNotificationRecipient[]> {
	const userRecipients = recipients.filter((recipient) => recipient.userId !== null);
	const recipientUserIds = new Set(userRecipients.map((recipient) => recipient.userId).filter((x) => x != null));
	if (recipientUserIds.size === 0) return recipients;

	const authorizedUserIds = await listModeratorIdsForAbuseReportNotification(deps);
	const authorizedUserRecipients: MiAbuseReportNotificationRecipient[] = [];
	const unauthorizedUserRecipients: MiAbuseReportNotificationRecipient[] = [];
	for (const recipient of userRecipients) {
		const userId = recipient.userId;
		if (userId != null && authorizedUserIds.includes(userId)) {
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

	return [...recipients.filter((recipient) => recipient.userId === null), ...authorizedUserRecipients].sort((a, b) =>
		a.id.localeCompare(b.id),
	);
}

async function fetchRecipients(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	params?: {
		ids?: MiAbuseReportNotificationRecipient['id'][];
		method?: RecipientMethod[];
	},
): Promise<MiAbuseReportNotificationRecipient[]> {
	const recipients = await listAbuseReportNotificationRecipientsFromDatabase(
		deps.db,
		omitUndefined({
			ids: params?.ids,
			method: params?.method,
		}),
	);
	if (recipients.length === 0) return [];

	return await removeUnauthorizedRecipientUsers(deps, recipients);
}

async function assertRecipientCorrelation(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	params: Pick<AdminAbuseReportNotificationRecipientCreateParams, 'method' | 'userId' | 'systemWebhookId'>,
): Promise<void> {
	if (params.method === 'email') {
		const userProfile =
			params.userId == null ? null : await fetchUserProfileByUserIdFromDatabase(deps.db, params.userId);
		if (params.userId == null || userProfile == null) {
			throw correlationCheckEmailError();
		}

		if (userProfile.email == null || !userProfile.emailVerified) {
			throw emailAddressNotSetError();
		}
	}

	if (params.method === 'webhook' && params.systemWebhookId == null) {
		throw correlationCheckWebhookError();
	}
}

async function packApiAbuseReportNotificationRecipient(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	recipient: MiAbuseReportNotificationRecipient,
	refs?: {
		users: Map<string, Packed<'UserLite'>>;
		webhooks: Map<string, ReturnType<typeof packApiSystemWebhook>>;
	},
): Promise<Packed<'AbuseReportNotificationRecipient'>> {
	const user =
		recipient.userId == null
			? undefined
			: (refs?.users.get(recipient.userId) ?? (await packUserLiteForApi(deps, recipient.userId)));
	const systemWebhook =
		recipient.systemWebhookId == null
			? undefined
			: (refs?.webhooks.get(recipient.systemWebhookId) ??
				packApiSystemWebhook(await fetchSystemWebhookByIdOrFailFromDatabase(deps.db, recipient.systemWebhookId)));

	return {
		id: recipient.id,
		isActive: recipient.isActive,
		updatedAt: recipient.updatedAt.toISOString(),
		name: recipient.name,
		method: recipient.method,
		userId: recipient.userId ?? undefined,
		user,
		systemWebhookId: recipient.systemWebhookId ?? undefined,
		systemWebhook,
	};
}

async function packApiAbuseReportNotificationRecipients(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	recipients: MiAbuseReportNotificationRecipient[],
): Promise<Packed<'AbuseReportNotificationRecipient'>[]> {
	const userIds = recipients.map((recipient) => recipient.userId).filter((x) => x != null);
	const users = userIds.length > 0 ? await packUserLiteManyForApi(deps, [...new Set(userIds)]) : [];
	const usersById = new Map(users.map((user) => [user.id, user]));

	const systemWebhookIds = recipients.map((recipient) => recipient.systemWebhookId).filter((x) => x != null);
	const systemWebhooks =
		systemWebhookIds.length > 0
			? await listSystemWebhooksFromDatabase(deps.db, { ids: [...new Set(systemWebhookIds)] })
			: [];
	const systemWebhooksById = new Map(systemWebhooks.map((webhook) => [webhook.id, packApiSystemWebhook(webhook)]));

	return await Promise.all(
		recipients.map((recipient) =>
			packApiAbuseReportNotificationRecipient(deps, recipient, {
				users: usersById,
				webhooks: systemWebhooksById,
			}),
		),
	).then((packed) => packed.toSorted((a, b) => a.id.localeCompare(b.id)));
}

export async function handleApiAdminAbuseReportNotificationRecipientList(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'AbuseReportNotificationRecipient'>[]> {
	const params = parseApiParams(adminAbuseReportNotificationRecipientListParamDef, body);
	const recipients = await fetchRecipients(deps, omitUndefined({ method: params.method }));

	return await packApiAbuseReportNotificationRecipients(deps, recipients);
}

export async function handleApiAdminAbuseReportNotificationRecipientShow(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'AbuseReportNotificationRecipient'>> {
	const params = parseApiParams(adminAbuseReportNotificationRecipientShowParamDef, body);
	const recipients = await fetchRecipients(deps, { ids: [params.id] });
	if (recipients.length === 0) throw noSuchRecipientError();
	const recipient = recipients[0];
	if (recipient == null) throw noSuchRecipientError();

	return await packApiAbuseReportNotificationRecipient(deps, recipient);
}

export async function handleApiAdminAbuseReportNotificationRecipientCreate(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'AbuseReportNotificationRecipient'>> {
	const params = parseApiParams(adminAbuseReportNotificationRecipientCreateParamDef, body);
	await assertRecipientCorrelation(deps, params);

	const recipient = await createAbuseReportNotificationRecipientInDatabase(deps.db, {
		id: genId(),
		isActive: params.isActive,
		name: params.name,
		method: params.method,
		userId: params.method === 'email' ? (params.userId ?? null) : null,
		systemWebhookId: params.method === 'webhook' ? (params.systemWebhookId ?? null) : null,
	});

	await logModerationEventInDatabase(deps, me, 'createAbuseReportNotificationRecipient', {
		recipientId: recipient.id,
		recipient,
	});

	return await packApiAbuseReportNotificationRecipient(deps, recipient);
}

export async function handleApiAdminAbuseReportNotificationRecipientUpdate(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'AbuseReportNotificationRecipient'>> {
	const params = parseApiParams(adminAbuseReportNotificationRecipientUpdateParamDef, body);
	await assertRecipientCorrelation(deps, params);

	const before = await fetchAbuseReportNotificationRecipientByIdOrFailFromDatabase(deps.db, params.id);
	const after = await updateAbuseReportNotificationRecipientInDatabase(deps.db, params.id, {
		isActive: params.isActive,
		updatedAt: new Date(),
		name: params.name,
		method: params.method,
		userId: params.method === 'email' ? (params.userId ?? null) : null,
		systemWebhookId: params.method === 'webhook' ? (params.systemWebhookId ?? null) : null,
	});
	if (after == null) {
		throw new Error(`Abuse report notification recipient ${params.id} not found`);
	}

	await logModerationEventInDatabase(deps, me, 'updateAbuseReportNotificationRecipient', {
		recipientId: params.id,
		before,
		after,
	});

	return await packApiAbuseReportNotificationRecipient(deps, after);
}

export async function handleApiAdminAbuseReportNotificationRecipientDelete(
	deps: ApiAdminAbuseReportNotificationRecipientDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminAbuseReportNotificationRecipientDeleteParamDef, body);
	const recipient = await listAbuseReportNotificationRecipientsFromDatabase(deps.db, { ids: [params.id] });

	await deleteAbuseReportNotificationRecipientsFromDatabase(deps.db, params.id);
	await logModerationEventInDatabase(deps, me, 'deleteAbuseReportNotificationRecipient', {
		recipientId: params.id,
		recipient,
	});
}
