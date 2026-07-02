/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createRoleWithSideEffects, type RoleCreateOptions } from '@/core/RoleLogic.js';
import {
	fetchRoleByIdFromDatabase,
	listRolesOrderByLastUsedAtDescFromDatabase,
} from '@/core/RoleStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';
import { packHonoApiRole } from './hono-api-roles.js';

export type HonoApiAdminRoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

const adminRolesCreateParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		description: { type: 'string' },
		color: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		target: { type: 'string', enum: ['manual', 'conditional'] },
		condFormula: { type: 'object' },
		isPublic: { type: 'boolean' },
		isModerator: { type: 'boolean' },
		isAdministrator: { type: 'boolean' },
		isExplorable: { type: 'boolean', default: false },
		asBadge: { type: 'boolean' },
		preserveAssignmentOnMoveAccount: { type: 'boolean' },
		canEditMembersByModerator: { type: 'boolean' },
		displayOrder: { type: 'number' },
		policies: {
			type: 'object',
		},
	},
	required: [
		'name',
		'description',
		'color',
		'iconUrl',
		'target',
		'condFormula',
		'isPublic',
		'isModerator',
		'isAdministrator',
		'asBadge',
		'canEditMembersByModerator',
		'displayOrder',
		'policies',
	],
} as const;

const adminRolesListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const adminRolesShowParamDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roleId'],
} as const;

type AdminRolesCreateParams = SchemaType<typeof adminRolesCreateParamDef>;
type AdminRolesShowParams = SchemaType<typeof adminRolesShowParamDef>;

function noSuchRoleError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id: '07dc7d34-c0d8-49b7-96c6-db3ce64ee0b3',
	});
}

export async function handleHonoApiAdminRolesCreate(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseHonoApiParams(adminRolesCreateParamDef, body) as AdminRolesCreateParams;
	const created = await createRoleWithSideEffects({
		db: deps.db,
		genId: time => genId(deps.config, time),
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, {
		name: params.name,
		description: params.description,
		color: params.color,
		iconUrl: params.iconUrl,
		target: params.target,
		condFormula: params.condFormula,
		isPublic: params.isPublic,
		isModerator: params.isModerator,
		isAdministrator: params.isAdministrator,
		isExplorable: params.isExplorable,
		asBadge: params.asBadge,
		preserveAssignmentOnMoveAccount: params.preserveAssignmentOnMoveAccount,
		canEditMembersByModerator: params.canEditMembersByModerator,
		displayOrder: params.displayOrder,
		policies: params.policies,
	} as RoleCreateOptions, me);

	return await packHonoApiRole(deps, created);
}

export async function handleHonoApiAdminRolesList(
	deps: HonoApiAdminRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>[]> {
	parseHonoApiParams(adminRolesListParamDef, body);
	const roles = await listRolesOrderByLastUsedAtDescFromDatabase(deps.db);
	return await Promise.all(roles.map(role => packHonoApiRole(deps, role)));
}

export async function handleHonoApiAdminRolesShow(
	deps: HonoApiAdminRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseHonoApiParams(adminRolesShowParamDef, body) as AdminRolesShowParams;
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError();

	return await packHonoApiRole(deps, role);
}
