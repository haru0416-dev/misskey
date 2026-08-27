/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import type { Config } from '@/config.js';
import {
	countRegistrationTicketsCreatedSinceFromDatabase,
	createRegistrationTicketInDatabase,
	createRegistrationTicketWithinLimitInDatabase,
	createRegistrationTicketsInDatabase,
	deleteRegistrationTicketInDatabase,
	fetchRegistrationTicketByIdFromDatabase,
	listRegistrationTicketsCreatedByFromDatabase,
	listRegistrationTicketsForAdminFromDatabase,
	resolveRegistrationTicketPagination,
} from '@/core/invite/RegistrationTicketStore.js';
import { createModerationLogInDatabase } from '@/core/moderation/ModerationLogStore.js';
import type { RolePolicies } from '@/core/role/role-policies.js';
import type { RegistrationTicketRow } from '@/db/schema/registration-ticket.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { generateInviteCode } from '@/misc/generate-invite-code.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { isApiModerator } from '../role/role-policy.js';
import { packUserLiteManyForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiInviteDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export const emptyParamDef = z.object({});

export const inviteDeleteParamDef = z.object({
	inviteId: misskeyId(),
});

export const inviteListParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(30),
	...paginationParams,
});

export const adminInviteCreateParamDef = z.object({
	count: z.int().min(1).max(100).optional().default(1),
	expiresAt: z.string().nullable().optional(),
});

export const adminInviteListParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(30),
	offset: z.int().optional().default(0),
	type: z.enum(['unused', 'used', 'expired', 'all']).optional().default('all'),
	sort: z.enum(['+createdAt', '-createdAt', '+usedAt', '-usedAt']).optional(),
});

function adminInviteCreateInvalidDateTimeError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Invalid date-time format',
		code: 'INVALID_DATE_TIME',
		id: 'f1380b15-3760-4c6c-a1db-5c3aaf1cbd49',
	});
}

function inviteCreateExceededCreateLimitError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You have exceeded the limit for creating an invitation code.',
		code: 'EXCEEDED_LIMIT_OF_CREATE_INVITE_CODE',
		id: '8b165dd3-6f37-4557-8db1-73175d63c641',
	});
}

function inviteDeleteNoSuchCodeError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such invite code.',
		code: 'NO_SUCH_INVITE_CODE',
		id: 'cd4f9ae4-7854-4e3e-8df9-c296f051e634',
	});
}

function inviteDeleteCantDeleteError(): ApiError {
	return new ApiError({
		status: 400,
		message: "You can't delete this invite code.",
		code: 'CAN_NOT_DELETE_INVITE_CODE',
		id: 'ff17af39-000c-4d4e-abdf-848fa30fc1ce',
	});
}

function inviteDeleteAccessDeniedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: '5eb8d909-2540-4970-90b8-dd6f86088121',
	});
}

async function packInviteCodesForApi(
	deps: ApiInviteDependencies,
	tickets: RegistrationTicketRow[],
): Promise<Packed<'InviteCode'>[]> {
	const userIds = [
		...new Set(
			tickets.flatMap((ticket) => [ticket.createdById, ticket.usedById]).filter((id): id is string => id != null),
		),
	];
	const packedUsers = userIds.length > 0 ? await packUserLiteManyForApi(deps, userIds) : [];
	const userById = new Map(packedUsers.map((user) => [user.id, user]));

	return tickets.map((ticket) => ({
		id: ticket.id,
		code: ticket.code,
		expiresAt: ticket.expiresAt ? ticket.expiresAt.toISOString() : null,
		createdAt: parseId(ticket.id).date.toISOString(),
		createdBy: ticket.createdById ? (userById.get(ticket.createdById) ?? null) : null,
		usedBy: ticket.usedById ? (userById.get(ticket.usedById) ?? null) : null,
		usedAt: ticket.usedAt ? ticket.usedAt.toISOString() : null,
		used: !!ticket.usedAt,
	}));
}

async function packInviteCodeForApi(
	deps: ApiInviteDependencies,
	ticket: RegistrationTicketRow,
): Promise<Packed<'InviteCode'>> {
	const packed = (await packInviteCodesForApi(deps, [ticket]))[0];
	if (packed == null) throw new Error('Packed invite code is missing');
	return packed;
}

export async function handleApiAdminInviteCreate(
	deps: ApiInviteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>[]> {
	const params = parseApiParams(adminInviteCreateParamDef, body);
	if (params.expiresAt && isNaN(Date.parse(params.expiresAt))) {
		throw adminInviteCreateInvalidDateTimeError();
	}

	const tickets = await createRegistrationTicketsInDatabase(
		deps.db,
		Array.from({ length: params.count }, () => ({
			id: genId(),
			createdById: me.id,
			expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
			code: generateInviteCode(),
		})),
	);

	void createModerationLogInDatabase(deps.db, {
		id: genId(),
		userId: me.id,
		type: 'createInvitation',
		info: {
			invitations: tickets,
		},
	});

	return await packInviteCodesForApi(deps, tickets);
}

export async function handleApiAdminInviteList(
	deps: ApiInviteDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>[]> {
	const params = parseApiParams(adminInviteListParamDef, body);
	const tickets = await listRegistrationTicketsForAdminFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			offset: params.offset,
			type: params.type,
			sort: params.sort,
		}),
	);

	return await packInviteCodesForApi(deps, tickets);
}

export async function handleApiInviteCreate(
	deps: ApiInviteDependencies,
	me: MiLocalUser,
	policies: RolePolicies,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>> {
	parseApiParams(emptyParamDef, body);

	const ticketData = {
		id: genId(),
		createdById: me.id,
		expiresAt: policies.inviteExpirationTime ? new Date(Date.now() + policies.inviteExpirationTime * 60 * 1000) : null,
		code: generateInviteCode(),
	};
	const ticket = policies.inviteLimit
		? await createRegistrationTicketWithinLimitInDatabase(deps.db, ticketData, {
				sinceId: genId(Date.now() - policies.inviteLimitCycle * 60 * 1000),
				limit: policies.inviteLimit,
			})
		: await createRegistrationTicketInDatabase(deps.db, ticketData);
	if (ticket == null) throw inviteCreateExceededCreateLimitError();

	return await packInviteCodeForApi(deps, ticket);
}

export async function handleApiInviteDelete(
	deps: ApiInviteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(inviteDeleteParamDef, body);
	const ticket = await fetchRegistrationTicketByIdFromDatabase(deps.db, params.inviteId);
	const isModerator = await isApiModerator(deps, me);

	if (ticket == null) {
		throw inviteDeleteNoSuchCodeError();
	}

	if (ticket.createdById !== me.id && !isModerator) {
		throw inviteDeleteAccessDeniedError();
	}

	if (ticket.usedAt && !isModerator) {
		throw inviteDeleteCantDeleteError();
	}

	await deleteRegistrationTicketInDatabase(deps.db, ticket.id);
}

export async function handleApiInviteLimit(
	deps: ApiInviteDependencies,
	me: MiLocalUser,
	policies: RolePolicies,
	body: Record<string, unknown>,
): Promise<{ remaining: number | null }> {
	parseApiParams(emptyParamDef, body);

	const count = policies.inviteLimit
		? await countRegistrationTicketsCreatedSinceFromDatabase(deps.db, {
				createdById: me.id,
				sinceId: genId(Date.now() - policies.inviteLimitCycle * 60 * 1000),
			})
		: null;

	return {
		remaining: count !== null ? Math.max(0, policies.inviteLimit - count) : null,
	};
}

export async function handleApiInviteList(
	deps: ApiInviteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>[]> {
	const params = parseApiParams(inviteListParamDef, body);
	const { sinceId, untilId, order } = resolveRegistrationTicketPagination(
		{
			gen: (time?: number) => genId(time),
		},
		params,
	);

	const tickets = await listRegistrationTicketsCreatedByFromDatabase(deps.db, {
		createdById: me.id,
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	return await packInviteCodesForApi(deps, tickets);
}
