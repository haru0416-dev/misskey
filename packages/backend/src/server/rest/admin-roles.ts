/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	assignRoleWithSideEffects,
	createRoleWithSideEffects,
	deleteRoleWithSideEffects,
	RoleNotAssignedError,
	updateRoleWithSideEffects,
	unassignRoleWithSideEffects,
	type RoleCreateOptions,
	type RoleUpdateOptions,
} from '@/core/RoleLogic.js';
import {
	listActiveRoleAssignmentsByRoleIdFromDatabase,
	resolveRoleAssignmentPagination,
} from '@/core/RoleAssignmentStore.js';
import {
	fetchRoleByIdFromDatabase,
	listRolesOrderByLastUsedAtDescFromDatabase,
} from '@/core/RoleStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { fetchMetaFromDatabase, updateMetaInDatabase } from '@/core/MetaStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Redis } from 'ioredis';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher, HonoApiMainStreamPublisher } from './events.js';
import { HonoApiError } from './error.js';
import { createRoleAssignedNotification } from './notification.js';
import { isHonoApiAdministrator } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';
import { packHonoApiRole } from './roles.js';
import { packUserDetailedNotMeManyForHonoApi, type UserDetailedNotMeHonoApiResponse } from './user.js';

export type HonoApiAdminRoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redis: Redis;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

export const adminRolesAssignParamDef = z.object({
	roleId: misskeyId(),
	userId: misskeyId(),
	expiresAt: z.number().int().nullable().optional(),
});

export const adminRolesCreateParamDef = z.object({
	name: z.string(),
	description: z.string(),
	color: z.string().nullable(),
	iconUrl: z.string().nullable(),
	target: z.enum(['manual', 'conditional']),
	condFormula: z.record(z.string(), z.unknown()),
	isPublic: z.boolean(),
	isModerator: z.boolean(),
	isAdministrator: z.boolean(),
	isExplorable: z.boolean().optional().default(false),
	asBadge: z.boolean(),
	preserveAssignmentOnMoveAccount: z.boolean().optional(),
	canEditMembersByModerator: z.boolean(),
	displayOrder: z.number(),
	policies: z.record(z.string(), z.unknown()),
});

export const adminRolesListParamDef = z.object({});

export const adminRolesDeleteParamDef = z.object({
	roleId: misskeyId(),
});

export const adminRolesShowParamDef = z.object({
	roleId: misskeyId(),
});

export const adminRolesUnassignParamDef = z.object({
	roleId: misskeyId(),
	userId: misskeyId(),
});

export const adminRolesUpdateParamDef = z.object({
	roleId: misskeyId(),
	name: z.string().optional(),
	description: z.string().optional(),
	color: z.string().nullable().optional(),
	iconUrl: z.string().nullable().optional(),
	target: z.enum(['manual', 'conditional']).optional(),
	condFormula: z.record(z.string(), z.unknown()).optional(),
	isPublic: z.boolean().optional(),
	isModerator: z.boolean().optional(),
	isAdministrator: z.boolean().optional(),
	isExplorable: z.boolean().optional(),
	asBadge: z.boolean().optional(),
	preserveAssignmentOnMoveAccount: z.boolean().optional(),
	canEditMembersByModerator: z.boolean().optional(),
	displayOrder: z.number().optional(),
	policies: z.record(z.string(), z.unknown()).optional(),
});

export const adminRolesUpdateDefaultPoliciesParamDef = z.object({
	policies: z.record(z.string(), z.unknown()),
});

export const adminRolesUsersParamDef = z.object({
	roleId: misskeyId(),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).optional().default(10),
});


type AdminRoleUser = {
	id: string;
	createdAt: string;
	user: UserDetailedNotMeHonoApiResponse;
	expiresAt: string | null;
};

function noSuchRoleError(id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id,
	});
}

function noSuchUserError(id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id,
	});
}

function accessDeniedError(id: string): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Only administrators can edit members of the role.',
		code: 'ACCESS_DENIED',
		id,
	});
}

function notAssignedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Not assigned.',
		code: 'NOT_ASSIGNED',
		id: 'b9060ac7-5c94-4da4-9f55-2047c953df44',
	});
}

export async function handleHonoApiAdminRolesAssign(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminRolesAssignParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('6503c040-6af4-4ed9-bf07-f2dd16678eab');

	if (!role.canEditMembersByModerator && !(await isHonoApiAdministrator(deps, me))) {
		throw accessDeniedError('25b5bc31-dc79-4ebd-9bd2-c84978fd052c');
	}

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError('558ea170-f653-4700-94d0-5a818371d0df');

	if (params.expiresAt && params.expiresAt <= Date.now()) {
		return;
	}

	await assignRoleWithSideEffects({
		db: deps.db,
		genId: time => genId(deps.config, time),
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		notifyRoleAssigned: (userId, _roleId, assignedRole) => createRoleAssignedNotification(deps, userId, assignedRole),
	}, {
		userId: user.id,
		roleId: role.id,
		expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
	}, me);
}

export async function handleHonoApiAdminRolesCreate(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseHonoApiParams(adminRolesCreateParamDef, body);
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

export async function handleHonoApiAdminRolesDelete(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminRolesDeleteParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('de0d6ecd-8e0a-4253-88ff-74bc89ae3d45');

	await deleteRoleWithSideEffects({
		db: deps.db,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, role, me);
}

export async function handleHonoApiAdminRolesShow(
	deps: HonoApiAdminRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseHonoApiParams(adminRolesShowParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('07dc7d34-c0d8-49b7-96c6-db3ce64ee0b3');

	return await packHonoApiRole(deps, role);
}

export async function handleHonoApiAdminRolesUnassign(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminRolesUnassignParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('6e519036-a70d-4c76-b679-bc8fb18194e2');

	if (!role.canEditMembersByModerator && !(await isHonoApiAdministrator(deps, me))) {
		throw accessDeniedError('24636eee-e8c1-493e-94b2-e16ad401e262');
	}

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError('2b730f78-1179-461b-88ad-d24c9af1a5ce');

	try {
		await unassignRoleWithSideEffects({
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		}, {
			userId: user.id,
			roleId: role.id,
		}, me);
	} catch (err) {
		if (err instanceof RoleNotAssignedError) throw notAssignedError();
		throw err;
	}
}

export async function handleHonoApiAdminRolesUpdate(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminRolesUpdateParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('cd23ef55-09ad-428a-ac61-95a45e124b32');

	await updateRoleWithSideEffects({
		db: deps.db,
		publishInternalEvent: deps.publishInternalEvent,
		logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
	}, role, {
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
	} as RoleUpdateOptions, me);
}

export async function handleHonoApiAdminRolesUpdateDefaultPolicies(
	deps: HonoApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminRolesUpdateDefaultPoliciesParamDef, body);
	const before = await fetchMetaFromDatabase(deps.db);
	const { before: updateBefore, after } = await updateMetaInDatabase(deps.db, {
		policies: params.policies as MiMeta['policies'],
	});

	Object.assign(deps.meta, after);
	deps.meta.rootUser = null;
	deps.publishInternalEvent?.('metaUpdated', { before: updateBefore, after });
	deps.publishInternalEvent?.('policiesUpdated', after.policies);
	await logModerationEventInDatabase(deps, me, 'updateServerSettings', {
		before: before.policies,
		after: after.policies,
	});
}

export async function handleHonoApiAdminRolesUsers(
	deps: HonoApiAdminRoleDependencies,
	me: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<AdminRoleUser[]> {
	const params = parseHonoApiParams(adminRolesUsersParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('224eff5e-2488-4b18-b3e7-f50d94421648');

	const assigns = await listActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id, {
		limit: params.limit,
		...resolveRoleAssignmentPagination({
			gen: (time?: number) => genId(deps.config, time),
		}, params),
	});

	const packedUsers = await packUserDetailedNotMeManyForHonoApi(deps, assigns.map(assign => assign.userId), me);
	const userById = new Map(packedUsers.map(user => [user.id, user]));

	return assigns.map(assign => ({
		id: assign.id,
		createdAt: parseId(deps.config, assign.id).date.toISOString(),
		user: userById.get(assign.userId)!,
		expiresAt: assign.expiresAt?.toISOString() ?? null,
	}));
}
