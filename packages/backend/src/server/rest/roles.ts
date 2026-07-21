/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { countActiveRoleAssignmentsByRoleIdFromDatabase, countActiveRoleAssignmentsByRoleIdsFromDatabase, listActiveRoleAssignmentsByRoleIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/ChannelMutingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchPublicExplorableRoleByIdFromDatabase, fetchPublicRoleByIdFromDatabase, listPublicExplorableRolesFromDatabase } from '@/core/RoleStore.js';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { packUserDetailedManyForHonoApi, type MeDetailedHonoApiResponse, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiRoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export type HonoApiRoleNotesDependencies = HonoApiNoteDependencies;

export const rolesListParamDef = z.object({});

export const rolesShowParamDef = z.object({
	roleId: misskeyId(),
});

export const rolesUsersParamDef = z.object({
	roleId: misskeyId(),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).default(10),
});


function noSuchRoleError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id: 'de5502bf-009a-4639-86c1-fec349e46dcb',
	});
}

function rolesUsersNoSuchRoleError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id: '30aaaee3-4792-48dc-ab0d-cf501a575ac5',
	});
}

function rolesNotesNoSuchRoleError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such role.',
		code: 'NO_SUCH_ROLE',
		id: 'eb70323a-df61-4dd4-ad90-89c83c7cf26e',
	});
}

export const rolesNotesParamDef = z.object({
	roleId: misskeyId(),
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});


export async function packHonoApiRole(
	deps: HonoApiRoleDependencies,
	role: MiRole,
	options?: {
		assignedCount?: number;
	},
): Promise<Packed<'Role'>> {
	const assignedCount = options?.assignedCount ?? await countActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id);
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

export async function packHonoApiRoles(
	deps: HonoApiRoleDependencies,
	roles: MiRole[],
): Promise<Packed<'Role'>[]> {
	const assignedCountByRoleId = await countActiveRoleAssignmentsByRoleIdsFromDatabase(deps.db, roles.map(role => role.id));
	return await Promise.all(roles.map(role => packHonoApiRole(deps, role, {
		assignedCount: assignedCountByRoleId.get(role.id) ?? 0,
	})));
}

export async function handleHonoApiRolesList(
	deps: HonoApiRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>[]> {
	parseHonoApiParams(rolesListParamDef, body);
	const roles = await listPublicExplorableRolesFromDatabase(deps.db);
	return await packHonoApiRoles(deps, roles);
}

export async function handleHonoApiRolesShow(
	deps: HonoApiRoleDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Role'>> {
	const params = parseHonoApiParams(rolesShowParamDef, body);
	const role = await fetchPublicRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw noSuchRoleError();

	return await packHonoApiRole(deps, role);
}

export async function handleHonoApiRolesUsers(
	deps: HonoApiRoleDependencies & UserPackingDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<{ id: string; user: MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse }[]> {
	const params = parseHonoApiParams(rolesUsersParamDef, body);
	const role = await fetchPublicExplorableRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw rolesUsersNoSuchRoleError();

	const pagination = resolveDateIdPagination({ gen: time => genId(time) }, params);
	const assigns = await listActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	const packedUsers = await packUserDetailedManyForHonoApi(deps, assigns.map(assign => assign.userId), me);
	return assigns.map((assign, index) => ({
		id: assign.id,
		user: packedUsers[index]!,
	}));
}

export async function handleHonoApiRolesNotes(
	deps: HonoApiRoleNotesDependencies,
	me: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(rolesNotesParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	const role = await fetchPublicRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw rolesNotesNoSuchRoleError();
	if (!role.isExplorable) return [];

	const rawIds = await deps.redis.lrange(`list:roleTimeline:${role.id}`, 0, -1);
	let noteIds = untilId && sinceId
		? rawIds.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1)
		: untilId
			? rawIds.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1)
			: sinceId
				? rawIds.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1)
				: rawIds.toSorted((a, b) => a > b ? -1 : 1);
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) return [];

	const mutingChannelIds = await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date());

	const notes = await listFilteredTimelineNotesByIdsFromDatabase(deps.db, {
		ids: noteIds,
		me,
		blockedHosts: deps.meta.blockedHosts,
		publicOnly: true,
		mutingChannelIds,
	});
	notes.sort((a, b) => a.id > b.id ? -1 : 1);

	return await packNoteManyForHonoApi(deps, notes, me);
}
