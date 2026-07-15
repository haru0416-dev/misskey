/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InternalEventTypes } from '@/core/global-events.js';
import {
	createRoleAssignmentInDatabase,
	deleteRoleAssignmentByIdFromDatabase,
	deleteRoleAssignmentByUserIdAndRoleIdFromDatabase,
	fetchRoleAssignmentByUserIdAndRoleIdFromDatabase,
} from '@/core/RoleAssignmentStore.js';
import {
	createRoleInDatabase,
	deleteRoleInDatabase,
	fetchRoleByIdOrFailFromDatabase,
	updateRoleInDatabase,
} from '@/core/RoleStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiRole } from '@/models/Role.js';
import type { MiRoleAssignment } from '@/models/RoleAssignment.js';
import type { MiUser } from '@/models/User.js';
import type { ModerationLogPayloads } from '@/types.js';

export type RoleCreateOptions = Pick<
	MiRole,
	'name' | 'description' | 'color' | 'iconUrl' | 'target' | 'condFormula' | 'isPublic' | 'isAdministrator' | 'isModerator' | 'asBadge' | 'canEditMembersByModerator' | 'displayOrder' | 'policies'
> & Partial<Pick<MiRole, 'isExplorable' | 'preserveAssignmentOnMoveAccount'>>;

export type RoleUpdateOptions = Partial<Pick<
	MiRole,
	'name' | 'description' | 'color' | 'iconUrl' | 'target' | 'condFormula' | 'isPublic' | 'isAdministrator' | 'isModerator' | 'isExplorable' | 'asBadge' | 'preserveAssignmentOnMoveAccount' | 'canEditMembersByModerator' | 'displayOrder' | 'policies'
>>;

export type RoleLogicDependencies = {
	db: MiDrizzleDatabase;
	genId: (time?: number) => string;
	publishInternalEvent?: (<K extends keyof InternalEventTypes>(type: K, value?: InternalEventTypes[K]) => void) | undefined;
	logModeration?: <T extends keyof ModerationLogPayloads>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T]) => void | Promise<void>;
};

export class RoleAlreadyAssignedError extends Error {}
export class RoleNotAssignedError extends Error {}

export async function createRoleWithSideEffects(
	deps: RoleLogicDependencies,
	values: RoleCreateOptions,
	moderator?: MiUser,
): Promise<MiRole> {
	const date = new Date();
	const created = await createRoleInDatabase(deps.db, {
		id: deps.genId(date.getTime()),
		updatedAt: date,
		lastUsedAt: date,
		name: values.name,
		description: values.description,
		color: values.color,
		iconUrl: values.iconUrl,
		target: values.target,
		condFormula: values.condFormula,
		isPublic: values.isPublic,
		isAdministrator: values.isAdministrator,
		isModerator: values.isModerator,
		isExplorable: values.isExplorable,
		asBadge: values.asBadge,
		preserveAssignmentOnMoveAccount: values.preserveAssignmentOnMoveAccount,
		canEditMembersByModerator: values.canEditMembersByModerator,
		displayOrder: values.displayOrder,
		policies: values.policies,
	});

	deps.publishInternalEvent?.('roleCreated', created);

	if (moderator) {
		void deps.logModeration?.(moderator, 'createRole', {
			roleId: created.id,
			role: created,
		});
	}

	return created;
}

export async function updateRoleWithSideEffects(
	deps: Pick<RoleLogicDependencies, 'db' | 'publishInternalEvent' | 'logModeration'>,
	role: MiRole,
	params: RoleUpdateOptions,
	moderator?: MiUser,
): Promise<void> {
	await updateRoleInDatabase(deps.db, role.id, {
		updatedAt: new Date(),
		...params,
	});

	const updated = await fetchRoleByIdOrFailFromDatabase(deps.db, role.id);
	deps.publishInternalEvent?.('roleUpdated', updated);

	if (moderator) {
		void deps.logModeration?.(moderator, 'updateRole', {
			roleId: role.id,
			before: role,
			after: updated,
		});
	}
}

export async function deleteRoleWithSideEffects(
	deps: Pick<RoleLogicDependencies, 'db' | 'publishInternalEvent' | 'logModeration'>,
	role: MiRole,
	moderator?: MiUser,
): Promise<void> {
	await deleteRoleInDatabase(deps.db, role.id);
	deps.publishInternalEvent?.('roleDeleted', role);

	if (moderator) {
		void deps.logModeration?.(moderator, 'deleteRole', {
			roleId: role.id,
			role,
		});
	}
}

export async function assignRoleWithSideEffects(
	deps: RoleLogicDependencies & {
		notifyRoleAssigned?: (userId: MiUser['id'], roleId: MiRole['id'], role: MiRole) => void | Promise<void>;
	},
	values: {
		userId: MiUser['id'];
		roleId: MiRole['id'];
		expiresAt?: Date | null;
	},
	moderator?: MiUser,
): Promise<MiRoleAssignment> {
	const now = Date.now();
	const role = await fetchRoleByIdOrFailFromDatabase(deps.db, values.roleId);
	const existing = await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(deps.db, values.userId, values.roleId);

	if (existing) {
		if (existing.expiresAt && existing.expiresAt.getTime() < now) {
			await deleteRoleAssignmentByUserIdAndRoleIdFromDatabase(deps.db, values.userId, values.roleId);
		} else {
			throw new RoleAlreadyAssignedError();
		}
	}

	const created = await createRoleAssignmentInDatabase(deps.db, {
		id: deps.genId(now),
		expiresAt: values.expiresAt ?? null,
		roleId: values.roleId,
		userId: values.userId,
	});

	await updateRoleInDatabase(deps.db, values.roleId, {
		lastUsedAt: new Date(),
	});

	deps.publishInternalEvent?.('userRoleAssigned', created);

	const user = await fetchUserByIdOrFailFromDatabase(deps.db, values.userId);

	if (role.isPublic && user.host === null) {
		void deps.notifyRoleAssigned?.(values.userId, values.roleId, role);
	}

	if (moderator) {
		void deps.logModeration?.(moderator, 'assignRole', {
			roleId: values.roleId,
			roleName: role.name,
			userId: values.userId,
			userUsername: user.username,
			userHost: user.host,
			expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null,
		});
	}

	return created;
}

export async function unassignRoleWithSideEffects(
	deps: Pick<RoleLogicDependencies, 'db' | 'publishInternalEvent' | 'logModeration'>,
	values: {
		userId: MiUser['id'];
		roleId: MiRole['id'];
	},
	moderator?: MiUser,
): Promise<MiRoleAssignment> {
	const now = new Date();
	const existing = await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(deps.db, values.userId, values.roleId);

	if (existing == null) {
		throw new RoleNotAssignedError();
	} else if (existing.expiresAt && existing.expiresAt.getTime() < now.getTime()) {
		await deleteRoleAssignmentByUserIdAndRoleIdFromDatabase(deps.db, values.userId, values.roleId);
		throw new RoleNotAssignedError();
	}

	await deleteRoleAssignmentByIdFromDatabase(deps.db, existing.id);

	await updateRoleInDatabase(deps.db, values.roleId, {
		lastUsedAt: now,
	});

	deps.publishInternalEvent?.('userRoleUnassigned', existing);

	if (moderator) {
		const [user, role] = await Promise.all([
			fetchUserByIdOrFailFromDatabase(deps.db, values.userId),
			fetchRoleByIdOrFailFromDatabase(deps.db, values.roleId),
		]);
		void deps.logModeration?.(moderator, 'unassignRole', {
			roleId: values.roleId,
			roleName: role.name,
			userId: values.userId,
			userUsername: user.username,
			userHost: user.host,
		});
	}

	return existing;
}
