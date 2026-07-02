/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InternalEventTypes } from '@/core/GlobalEventService.js';
import {
	createRoleInDatabase,
	deleteRoleInDatabase,
	fetchRoleByIdOrFailFromDatabase,
	updateRoleInDatabase,
} from '@/core/RoleStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiRole } from '@/models/Role.js';
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
	publishInternalEvent?: <K extends keyof InternalEventTypes>(type: K, value?: InternalEventTypes[K]) => void;
	logModeration?: <T extends keyof ModerationLogPayloads>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T]) => void | Promise<void>;
};

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
