/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as adminRolesContracts } from '@/server/api/metas/admin-roles.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAdminRolesAssign,
	handleApiAdminRolesCreate,
	handleApiAdminRolesDelete,
	handleApiAdminRolesList,
	handleApiAdminRolesShow,
	handleApiAdminRolesUnassign,
	handleApiAdminRolesUpdate,
	handleApiAdminRolesUpdateDefaultPolicies,
	handleApiAdminRolesUsers,
} from '../admin/admin-roles.js';

export const adminRolesEndpoints = implementEndpoints<ApiShellDependencies>()(adminRolesContracts, {
	'admin/roles/assign': async ({ deps, input, me }) => {
		await handleApiAdminRolesAssign(deps, me, input);
	},
	'admin/roles/create': async ({ deps, input, me }) => await handleApiAdminRolesCreate(deps, me, input),
	'admin/roles/delete': async ({ deps, input, me }) => {
		await handleApiAdminRolesDelete(deps, me, input);
	},
	'admin/roles/list': async ({ deps }) => await handleApiAdminRolesList(deps),
	'admin/roles/show': async ({ deps, input }) => await handleApiAdminRolesShow(deps, input),
	'admin/roles/unassign': async ({ deps, errors, input, me }) => {
		await handleApiAdminRolesUnassign(deps, me, input, errors);
	},
	'admin/roles/update': async ({ deps, input, me }) => {
		await handleApiAdminRolesUpdate(deps, me, input);
	},
	'admin/roles/update-default-policies': async ({ deps, input, me }) => {
		await handleApiAdminRolesUpdateDefaultPolicies(deps, me, input);
	},
	'admin/roles/users': async ({ deps, input, me }) => await handleApiAdminRolesUsers(deps, me, input),
});
