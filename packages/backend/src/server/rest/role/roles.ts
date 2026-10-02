/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as miscContracts } from '@/server/rest/contracts/misc.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import {
	countActiveRoleAssignmentsByRoleIdsFromDatabase,
	listActiveRoleAssignmentsByRoleIdFromDatabase,
} from '@/core/role/RoleAssignmentStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/channel/ChannelMutingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import {
	fetchPublicExplorableRoleByIdFromDatabase,
	fetchPublicRoleByIdFromDatabase,
	listPublicExplorableRolesFromDatabase,
} from '@/core/role/RoleStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import { packNoteManyForApi } from '../note/note.js';
import type { NoteDependencies } from '../../../core/note/note-packing.js';
import { packUserDetailedManyForApi } from '../user/user.js';
import type { UserPackingDependencies } from '../../../core/user/user-packing.js';
import type { MeDetailedApiResponse, UserDetailedNotMeApiResponse } from '../user/user.js';
import { collectRedisListTimelineNotes } from '../note/redis-list-timeline.js';
import { resolveApiDateIdBounds } from '../date-id-pagination.js';
import type { RoleDependencies } from '@/core/role/role-packing.js';
import { packRole } from '@/core/role/role-packing.js';

export type ApiRoleNotesDependencies = NoteDependencies;

export const rolesListParamDef = z.object({});

export const rolesShowParamDef = z.object({
	roleId: misskeyId(),
});

export const rolesUsersParamDef = z.object({
	roleId: misskeyId(),
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
});

export const rolesNotesParamDef = z.object({
	roleId: misskeyId(),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export async function packApiRoles(deps: RoleDependencies, roles: MiRole[]): Promise<Packed<'Role'>[]> {
	const assignedCountByRoleId = await countActiveRoleAssignmentsByRoleIdsFromDatabase(
		deps.db,
		roles.map((role) => role.id),
	);
	return await Promise.all(
		roles.map((role) =>
			packRole(deps, role, {
				assignedCount: assignedCountByRoleId.get(role.id) ?? 0,
			}),
		),
	);
}

export async function handleApiRolesList(deps: RoleDependencies): Promise<Packed<'Role'>[]> {
	const roles = await listPublicExplorableRolesFromDatabase(deps.db);
	return await packApiRoles(deps, roles);
}

export async function handleApiRolesShow(
	deps: RoleDependencies,
	params: ApiParams<typeof rolesShowParamDef>,
	errors: ContractErrors<(typeof miscContracts)['roles/show']>,
): Promise<Packed<'Role'>> {
	const role = await fetchPublicRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) {
		throw errors.noSuchRole();
	}

	return await packRole(deps, role);
}

export async function handleApiRolesUsers(
	deps: RoleDependencies & UserPackingDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof rolesUsersParamDef>,
	errors: ContractErrors<(typeof miscContracts)['roles/users']>,
): Promise<{ id: string; user: MeDetailedApiResponse | UserDetailedNotMeApiResponse }[]> {
	const role = await fetchPublicExplorableRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) {
		throw errors.noSuchRole();
	}

	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const assigns = await listActiveRoleAssignmentsByRoleIdFromDatabase(deps.db, role.id, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	const packedUsers = await packUserDetailedManyForApi(
		deps,
		assigns.map((assign) => assign.userId),
		me,
	);
	// 一覧のクエリの後で削除が確定したユーザーの割り当ては返さない (割り当ても同じ削除の cascade で消えている)。
	return assigns.flatMap((assign, index) => {
		const user = packedUsers[index];
		return user == null ? [] : [{ id: assign.id, user }];
	});
}

export async function handleApiRolesNotes(
	deps: ApiRoleNotesDependencies,
	me: { id: MiUser['id'] },
	params: ApiParams<typeof rolesNotesParamDef>,
	errors: ContractErrors<(typeof miscContracts)['roles/notes']>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	const role = await fetchPublicRoleByIdFromDatabase(deps.db, params.roleId);
	if (role == null) {
		throw errors.noSuchRole();
	}
	if (!role.isExplorable) {
		return [];
	}

	// 候補が無ければ絞り込みを呼ばないので、ミュートの一覧もそのときまで読まない。
	let mutingChannelIds: string[] | undefined;
	const notes = await collectRedisListTimelineNotes(
		deps.redis,
		`list:roleTimeline:${role.id}`,
		{ sinceId, untilId, limit: params.limit },
		async (ids) =>
			await listFilteredTimelineNotesByIdsFromDatabase(deps.db, {
				ids,
				me,
				blockedHosts: deps.meta.blockedHosts,
				publicOnly: true,
				mutingChannelIds: (mutingChannelIds ??= await listActiveMutedChannelIdsByUserIdFromDatabase(
					deps.db,
					me.id,
					new Date(),
				)),
			}),
	);
	// sinceId だけの指定でも新しい順で返す。
	notes.sort((a, b) => (a.id > b.id ? -1 : 1));

	return await packNoteManyForApi(deps, notes, me);
}
