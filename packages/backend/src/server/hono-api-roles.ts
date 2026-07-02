/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { countActiveRoleAssignmentsByRoleIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import { fetchPublicRoleByIdFromDatabase, listPublicExplorableRolesFromDatabase } from '@/core/RoleStore.js';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiRole } from '@/models/Role.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiRoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

const rolesListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const rolesShowParamDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roleId'],
} as const;

type RolesShowParams = SchemaType<typeof rolesShowParamDef>;

function noSuchRoleError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id: 'de5502bf-009a-4639-86c1-fec349e46dcb',
	});
}

async function packHonoApiRole(
	deps: HonoApiRoleDependencies,
	role: MiRole,
): Promise<Packed<'Role'>> {
	const assignedCount = await countActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id);
	const policies = { ...role.policies };

	for (const [key, value] of Object.entries(DEFAULT_POLICIES)) {
		if (policies[key] == null) {
			policies[key] = {
				useDefault: true,
				priority: 0,
				value,
			};
		}
	}

	return {
		id: role.id,
		createdAt: parseId(deps.config, role.id).date.toISOString(),
		updatedAt: role.updatedAt.toISOString(),
		name: role.name,
		description: role.description,
		color: role.color,
		iconUrl: role.iconUrl,
		target: role.target,
		condFormula: role.condFormula,
		isPublic: role.isPublic,
		isAdministrator: role.isAdministrator,
		isModerator: role.isModerator,
		isExplorable: role.isExplorable,
		asBadge: role.asBadge,
		preserveAssignmentOnMoveAccount: role.preserveAssignmentOnMoveAccount,
		canEditMembersByModerator: role.canEditMembersByModerator,
		displayOrder: role.displayOrder,
		policies,
		usersCount: assignedCount,
	};
}

export async function handleHonoApiRolesList(
	deps: HonoApiRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>[]> {
	parseHonoApiParams(rolesListParamDef, body);
	const roles = await listPublicExplorableRolesFromDatabase(deps.db);
	return await Promise.all(roles.map(role => packHonoApiRole(deps, role)));
}

export async function handleHonoApiRolesShow(
	deps: HonoApiRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseHonoApiParams(rolesShowParamDef, body) as RolesShowParams;
	const role = await fetchPublicRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError();

	return await packHonoApiRole(deps, role);
}
