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
} from '@/core/role/RoleLogic.js';
import {
	listActiveRoleAssignmentsByRoleIdFromDatabase,
	resolveRoleAssignmentPagination,
} from '@/core/role/RoleAssignmentStore.js';
import { fetchRoleByIdFromDatabase, listRolesOrderByLastUsedAtDescFromDatabase } from '@/core/role/RoleStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { fetchMetaFromDatabase, updateMetaInDatabase } from '@/core/meta/MetaStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Redis } from 'ioredis';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { ApiInternalEventPublisher, ApiMainStreamPublisher } from '../events.js';
import { ApiError } from '../error.js';
import { createRoleAssignedNotification } from '../notification/notification.js';
import { isApiAdministrator } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';
import { packApiRole, packApiRoles } from '../role/roles.js';
import { packUserDetailedNotMeManyForApi, type UserDetailedNotMeApiResponse } from '../user/user.js';

export type ApiAdminRoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redis: Redis;
	publishInternalEvent?: ApiInternalEventPublisher;
	publishMainStream?: ApiMainStreamPublisher;
};

// policies は jsonb へそのまま保存され、ロール適用のたびに読まれる。
// ここで形を保証しないと、壊れた値がそのロールを持つ全ユーザーの全APIを500にする。
const rolePoliciesRecord = z.record(
	z.string(),
	z.object({
		useDefault: z.boolean(),
		priority: z.int(),
		value: z.unknown(),
	}),
);

export const adminRolesAssignParamDef = z.object({
	roleId: misskeyId(),
	userId: misskeyId(),
	expiresAt: z.int().nullable().optional(),
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
	policies: rolePoliciesRecord,
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
	policies: rolePoliciesRecord.optional(),
});

export const adminRolesUpdateDefaultPoliciesParamDef = z.object({
	policies: z.record(z.string(), z.unknown()),
});

export const adminRolesUsersParamDef = z.object({
	roleId: misskeyId(),
	...paginationParams,
	limit: z.int().min(1).max(100).optional().default(10),
});

type AdminRoleUser = {
	id: string;
	createdAt: string;
	user: UserDetailedNotMeApiResponse;
	expiresAt: string | null;
};

function noSuchRoleError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id,
	});
}

function noSuchUserError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id,
	});
}

function accessDeniedError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'Only administrators can edit members of the role.',
		code: 'ACCESS_DENIED',
		id,
	});
}

function notAssignedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Not assigned.',
		code: 'NOT_ASSIGNED',
		id: 'b9060ac7-5c94-4da4-9f55-2047c953df44',
	});
}

export async function handleApiAdminRolesAssign(
	deps: ApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminRolesAssignParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('6503c040-6af4-4ed9-bf07-f2dd16678eab');

	if (!role.canEditMembersByModerator && !(await isApiAdministrator(deps, me))) {
		throw accessDeniedError('25b5bc31-dc79-4ebd-9bd2-c84978fd052c');
	}

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError('558ea170-f653-4700-94d0-5a818371d0df');

	if (params.expiresAt && params.expiresAt <= Date.now()) {
		return;
	}

	await assignRoleWithSideEffects(
		{
			db: deps.db,
			genId,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
			notifyRoleAssigned: (userId, _roleId, assignedRole) => createRoleAssignedNotification(deps, userId, assignedRole),
		},
		{
			userId: user.id,
			roleId: role.id,
			expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
		},
		me,
	);
}

export async function handleApiAdminRolesCreate(
	deps: ApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseApiParams(adminRolesCreateParamDef, body);
	const created = await createRoleWithSideEffects(
		{
			db: deps.db,
			genId,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		{
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
		} as RoleCreateOptions,
		me,
	);

	return await packApiRole(deps, created);
}

export async function handleApiAdminRolesList(
	deps: ApiAdminRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>[]> {
	parseApiParams(adminRolesListParamDef, body);
	const roles = await listRolesOrderByLastUsedAtDescFromDatabase(deps.db);
	return await packApiRoles(deps, roles);
}

export async function handleApiAdminRolesDelete(
	deps: ApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminRolesDeleteParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('de0d6ecd-8e0a-4253-88ff-74bc89ae3d45');

	await deleteRoleWithSideEffects(
		{
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		role,
		me,
	);
}

export async function handleApiAdminRolesShow(
	deps: ApiAdminRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseApiParams(adminRolesShowParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('07dc7d34-c0d8-49b7-96c6-db3ce64ee0b3');

	return await packApiRole(deps, role);
}

export async function handleApiAdminRolesUnassign(
	deps: ApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminRolesUnassignParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('6e519036-a70d-4c76-b679-bc8fb18194e2');

	if (!role.canEditMembersByModerator && !(await isApiAdministrator(deps, me))) {
		throw accessDeniedError('24636eee-e8c1-493e-94b2-e16ad401e262');
	}

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError('2b730f78-1179-461b-88ad-d24c9af1a5ce');

	try {
		await unassignRoleWithSideEffects(
			{
				db: deps.db,
				publishInternalEvent: deps.publishInternalEvent,
				logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
			},
			{
				userId: user.id,
				roleId: role.id,
			},
			me,
		);
	} catch (err) {
		if (err instanceof RoleNotAssignedError) throw notAssignedError();
		throw err;
	}
}

export async function handleApiAdminRolesUpdate(
	deps: ApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminRolesUpdateParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('cd23ef55-09ad-428a-ac61-95a45e124b32');

	await updateRoleWithSideEffects(
		{
			db: deps.db,
			publishInternalEvent: deps.publishInternalEvent,
			logModeration: (moderator, type, info) => logModerationEventInDatabase(deps, moderator, type, info),
		},
		role,
		{
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
		} as RoleUpdateOptions,
		me,
	);
}

export async function handleApiAdminRolesUpdateDefaultPolicies(
	deps: ApiAdminRoleDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminRolesUpdateDefaultPoliciesParamDef, body);
	const before = await fetchMetaFromDatabase(deps.db);
	const { before: updateBefore, after } = await updateMetaInDatabase(deps.db, {
		policies: params.policies as MiMeta['policies'],
	});

	Object.assign(deps.meta, after);
	deps.meta.rootUser = null;
	deps.publishInternalEvent?.('metaUpdated', {
		...(updateBefore === undefined ? {} : { before: updateBefore }),
		after,
	});
	deps.publishInternalEvent?.('policiesUpdated', after.policies);
	await logModerationEventInDatabase(deps, me, 'updateServerSettings', {
		before: before.policies,
		after: after.policies,
	});
}

export async function handleApiAdminRolesUsers(
	deps: ApiAdminRoleDependencies,
	me: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<AdminRoleUser[]> {
	const params = parseApiParams(adminRolesUsersParamDef, body);
	const role = await fetchRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError('224eff5e-2488-4b18-b3e7-f50d94421648');

	const assigns = await listActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id, {
		limit: params.limit,
		...resolveRoleAssignmentPagination(
			{
				gen: (time?: number) => genId(time),
			},
			params,
		),
	});

	const packedUsers = await packUserDetailedNotMeManyForApi(
		deps,
		assigns.map((assign) => assign.userId),
		me,
	);
	const userById = new Map(packedUsers.map((user) => [user.id, user]));

	return assigns.map((assign) => ({
		id: assign.id,
		createdAt: parseId(assign.id).date.toISOString(),
		user: userById.get(assign.userId)!,
		expiresAt: assign.expiresAt?.toISOString() ?? null,
	}));
}
