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
	createRegistrationTicketsInDatabase,
	deleteRegistrationTicketInDatabase,
	fetchRegistrationTicketByIdFromDatabase,
	listRegistrationTicketsCreatedByFromDatabase,
	listRegistrationTicketsForAdminFromDatabase,
	resolveRegistrationTicketPagination,
} from '@/core/RegistrationTicketStore.js';
import { createModerationLogInDatabase } from '@/core/ModerationLogStore.js';
import type { RolePolicies } from '@/core/role-policies.js';
import type { RegistrationTicketRow } from '@/db/schema/registration-ticket.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import { generateInviteCode } from '@/misc/generate-invite-code.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { isHonoApiModerator } from './role-policy.js';
import { packUserLiteManyForHonoApi } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiInviteDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export const emptyParamDef = z.object({});

export const inviteDeleteParamDef = z.object({
	inviteId: misskeyId(),
});

export const inviteListParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

export const adminInviteCreateParamDef = z.object({
	count: z.number().int().min(1).max(100).optional().default(1),
	expiresAt: z.string().nullable().optional(),
});

export const adminInviteListParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(30),
	offset: z.number().int().optional().default(0),
	type: z.enum(['unused', 'used', 'expired', 'all']).optional().default('all'),
	sort: z.enum(['+createdAt', '-createdAt', '+usedAt', '-usedAt']).optional(),
});


function adminInviteCreateInvalidDateTimeError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Invalid date-time format',
		code: 'INVALID_DATE_TIME',
		id: 'f1380b15-3760-4c6c-a1db-5c3aaf1cbd49',
	});
}

function inviteCreateExceededCreateLimitError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You have exceeded the limit for creating an invitation code.',
		code: 'EXCEEDED_LIMIT_OF_CREATE_INVITE_CODE',
		id: '8b165dd3-6f37-4557-8db1-73175d63c641',
	});
}

function inviteDeleteNoSuchCodeError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such invite code.',
		code: 'NO_SUCH_INVITE_CODE',
		id: 'cd4f9ae4-7854-4e3e-8df9-c296f051e634',
	});
}

function inviteDeleteCantDeleteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You can\'t delete this invite code.',
		code: 'CAN_NOT_DELETE_INVITE_CODE',
		id: 'ff17af39-000c-4d4e-abdf-848fa30fc1ce',
	});
}

function inviteDeleteAccessDeniedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: '5eb8d909-2540-4970-90b8-dd6f86088121',
	});
}

async function packInviteCodesForHonoApi(
	deps: HonoApiInviteDependencies,
	tickets: RegistrationTicketRow[],
): Promise<Packed<'InviteCode'>[]> {
	const userIds = [...new Set(tickets.flatMap(ticket => [ticket.createdById, ticket.usedById]).filter((id): id is string => id != null))];
	const packedUsers = userIds.length > 0 ? await packUserLiteManyForHonoApi(deps, userIds) : [];
	const userById = new Map(packedUsers.map(user => [user.id, user]));

	return tickets.map(ticket => ({
		id: ticket.id,
		code: ticket.code,
		expiresAt: ticket.expiresAt ? ticket.expiresAt.toISOString() : null,
		createdAt: parseId(ticket.id).date.toISOString(),
		createdBy: ticket.createdById ? userById.get(ticket.createdById) ?? null : null,
		usedBy: ticket.usedById ? userById.get(ticket.usedById) ?? null : null,
		usedAt: ticket.usedAt ? ticket.usedAt.toISOString() : null,
		used: !!ticket.usedAt,
	}));
}

async function packInviteCodeForHonoApi(
	deps: HonoApiInviteDependencies,
	ticket: RegistrationTicketRow,
): Promise<Packed<'InviteCode'>> {
	const packed = (await packInviteCodesForHonoApi(deps, [ticket]))[0];
	if (packed == null) throw new Error('Packed invite code is missing');
	return packed;
}

export async function handleHonoApiAdminInviteCreate(
	deps: HonoApiInviteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>[]> {
	const params = parseHonoApiParams(adminInviteCreateParamDef, body);
	if (params.expiresAt && isNaN(Date.parse(params.expiresAt))) {
		throw adminInviteCreateInvalidDateTimeError();
	}

	const tickets = await createRegistrationTicketsInDatabase(deps.db, Array.from({ length: params.count }, () => ({
		id: genId(),
		createdById: me.id,
		expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
		code: generateInviteCode(),
	})));

	void createModerationLogInDatabase(deps.db, {
		id: genId(),
		userId: me.id,
		type: 'createInvitation',
		info: {
			invitations: tickets,
		},
	});

	return await packInviteCodesForHonoApi(deps, tickets);
}

export async function handleHonoApiAdminInviteList(
	deps: HonoApiInviteDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>[]> {
	const params = parseHonoApiParams(adminInviteListParamDef, body);
	const tickets = await listRegistrationTicketsForAdminFromDatabase(deps.db, omitUndefined({
		limit: params.limit,
		offset: params.offset,
		type: params.type,
		sort: params.sort,
	}));

	return await packInviteCodesForHonoApi(deps, tickets);
}

export async function handleHonoApiInviteCreate(
	deps: HonoApiInviteDependencies,
	me: MiLocalUser,
	policies: RolePolicies,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>> {
	parseHonoApiParams(emptyParamDef, body);

	if (policies.inviteLimit) {
		const count = await countRegistrationTicketsCreatedSinceFromDatabase(deps.db, {
			createdById: me.id,
			sinceId: genId(Date.now() - (policies.inviteLimitCycle * 60 * 1000)),
		});

		if (count >= policies.inviteLimit) {
			throw inviteCreateExceededCreateLimitError();
		}
	}

	const ticket = await createRegistrationTicketInDatabase(deps.db, {
		id: genId(),
		createdById: me.id,
		expiresAt: policies.inviteExpirationTime ? new Date(Date.now() + (policies.inviteExpirationTime * 60 * 1000)) : null,
		code: generateInviteCode(),
	});

	return await packInviteCodeForHonoApi(deps, ticket);
}

export async function handleHonoApiInviteDelete(
	deps: HonoApiInviteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(inviteDeleteParamDef, body);
	const ticket = await fetchRegistrationTicketByIdFromDatabase(deps.db, params.inviteId);
	const isModerator = await isHonoApiModerator(deps, me);

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

export async function handleHonoApiInviteLimit(
	deps: HonoApiInviteDependencies,
	me: MiLocalUser,
	policies: RolePolicies,
	body: Record<string, unknown>,
): Promise<{ remaining: number | null }> {
	parseHonoApiParams(emptyParamDef, body);

	const count = policies.inviteLimit ? await countRegistrationTicketsCreatedSinceFromDatabase(deps.db, {
		createdById: me.id,
		sinceId: genId(Date.now() - (policies.inviteLimitCycle * 60 * 1000)),
	}) : null;

	return {
		remaining: count !== null ? Math.max(0, policies.inviteLimit - count) : null,
	};
}

export async function handleHonoApiInviteList(
	deps: HonoApiInviteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'InviteCode'>[]> {
	const params = parseHonoApiParams(inviteListParamDef, body);
	const { sinceId, untilId, order } = resolveRegistrationTicketPagination({
		gen: (time?: number) => genId(time),
	}, params);

	const tickets = await listRegistrationTicketsCreatedByFromDatabase(deps.db, {
		createdById: me.id,
		limit: params.limit,
		order,
		sinceId,
		untilId,
	});

	return await packInviteCodesForHonoApi(deps, tickets);
}
