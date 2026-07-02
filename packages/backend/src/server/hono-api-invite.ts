/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import {
	countRegistrationTicketsCreatedSinceFromDatabase,
	createRegistrationTicketInDatabase,
	deleteRegistrationTicketInDatabase,
	fetchRegistrationTicketByIdFromDatabase,
	listRegistrationTicketsCreatedByFromDatabase,
	resolveRegistrationTicketPagination,
} from '@/core/RegistrationTicketStore.js';
import type { RolePolicies } from '@/core/role-policies.js';
import type { RegistrationTicketRow } from '@/db/schema/registration-ticket.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import { generateInviteCode } from '@/misc/generate-invite-code.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiMeta } from '@/models/_.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { isHonoApiModerator } from './hono-api-role-policy.js';
import { packUserLiteManyForHonoApi } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiInviteDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

const emptyParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const inviteDeleteParamDef = {
	type: 'object',
	properties: {
		inviteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['inviteId'],
} as const;

const inviteListParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type InviteDeleteParams = SchemaType<typeof inviteDeleteParamDef>;
type InviteListParams = SchemaType<typeof inviteListParamDef>;

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
		createdAt: parseId(deps.config, ticket.id).date.toISOString(),
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
	return (await packInviteCodesForHonoApi(deps, [ticket]))[0];
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
			sinceId: genId(deps.config, Date.now() - (policies.inviteLimitCycle * 60 * 1000)),
		});

		if (count >= policies.inviteLimit) {
			throw inviteCreateExceededCreateLimitError();
		}
	}

	const ticket = await createRegistrationTicketInDatabase(deps.db, {
		id: genId(deps.config),
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
	const params = parseHonoApiParams(inviteDeleteParamDef, body) as InviteDeleteParams;
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
		sinceId: genId(deps.config, Date.now() - (policies.inviteLimitCycle * 60 * 1000)),
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
	const params = parseHonoApiParams(inviteListParamDef, body) as InviteListParams;
	const { sinceId, untilId, order } = resolveRegistrationTicketPagination({
		gen: (time?: number) => genId(deps.config, time),
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
