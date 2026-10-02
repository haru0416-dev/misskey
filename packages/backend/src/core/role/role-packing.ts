/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { countActiveRoleAssignmentsByRoleIdFromDatabase } from '@/core/role/role-assignment-store.js';
import { DEFAULT_POLICIES } from '@/core/role/role-policies.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiRole } from '@/models/Role.js';

export type RoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export async function packRole(
	deps: RoleDependencies,
	role: MiRole,
	options?: {
		assignedCount?: number;
	},
): Promise<Packed<'Role'>> {
	const assignedCount =
		options?.assignedCount ?? (await countActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id));
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
		createdAt: parseId(role.id).date.toISOString(),
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
