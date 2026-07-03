/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { countActiveRoleAssignmentsByRoleIdFromDatabase, listActiveRoleAssignmentsByRoleIdFromDatabase, type RoleAssignmentOrder } from '@/core/RoleAssignmentStore.js';
import { fetchActiveMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchPublicExplorableRoleByIdFromDatabase, fetchPublicRoleByIdFromDatabase, listPublicExplorableRolesFromDatabase } from '@/core/RoleStore.js';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { packUserDetailedManyForHonoApi, type MeDetailedHonoApiResponse, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiRoleDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

export type HonoApiRoleNotesDependencies = HonoApiNoteDependencies;

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

const rolesUsersParamDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['roleId'],
} as const;

type RolesShowParams = SchemaType<typeof rolesShowParamDef>;
type RolesUsersParams = SchemaType<typeof rolesUsersParamDef>;

function resolveRoleUsersPagination(
	config: Config,
	params: RolesUsersParams,
): {
	sinceId: string | null;
	untilId: string | null;
	order: RoleAssignmentOrder;
} {
	if (params.sinceId && params.untilId) {
		return { sinceId: params.sinceId, untilId: params.untilId, order: 'desc' };
	} else if (params.sinceId) {
		return { sinceId: params.sinceId, untilId: null, order: 'asc' };
	} else if (params.untilId) {
		return { sinceId: null, untilId: params.untilId, order: 'desc' };
	} else if (params.sinceDate && params.untilDate) {
		return { sinceId: genId(config, params.sinceDate), untilId: genId(config, params.untilDate), order: 'desc' };
	} else if (params.sinceDate) {
		return { sinceId: genId(config, params.sinceDate), untilId: null, order: 'asc' };
	} else if (params.untilDate) {
		return { sinceId: null, untilId: genId(config, params.untilDate), order: 'desc' };
	}

	return { sinceId: null, untilId: null, order: 'desc' };
}

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

const rolesNotesParamDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['roleId'],
} as const;

type RolesNotesParams = SchemaType<typeof rolesNotesParamDef>;

export async function packHonoApiRole(
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

export async function handleHonoApiRolesUsers(
	deps: HonoApiRoleDependencies & UserPackingDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<{ id: string; user: MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse }[]> {
	const params = parseHonoApiParams(rolesUsersParamDef, body) as RolesUsersParams;
	const role = await fetchPublicExplorableRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) throw rolesUsersNoSuchRoleError();

	const pagination = resolveRoleUsersPagination(deps.config, params);
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
	const params = parseHonoApiParams(rolesNotesParamDef, body) as RolesNotesParams;
	const untilId = params.untilId ?? (params.untilDate ? genId(deps.config, params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(deps.config, params.sinceDate) : null);

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
				: rawIds.sort((a, b) => a > b ? -1 : 1);
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) return [];

	const mutingChannelIds = await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date());

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
