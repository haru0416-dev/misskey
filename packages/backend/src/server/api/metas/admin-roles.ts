/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	adminRolesAssignParamDef,
	adminRolesCreateParamDef,
	adminRolesDeleteParamDef,
	adminRolesListParamDef,
	adminRolesShowParamDef,
	adminRolesUnassignParamDef,
	adminRolesUpdateDefaultPoliciesParamDef,
	adminRolesUpdateParamDef,
	adminRolesUsersParamDef,
} from '@/server/rest/admin-roles.js';

export const endpointMetas = {
	'admin/roles/assign': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:roles',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: '6503c040-6af4-4ed9-bf07-f2dd16678eab',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '558ea170-f653-4700-94d0-5a818371d0df',
				},

				accessDenied: {
					message: 'Only administrators can edit members of the role.',
					code: 'ACCESS_DENIED',
					id: '25b5bc31-dc79-4ebd-9bd2-c84978fd052c',
				},
			},
		} as const,
		paramDef: adminRolesAssignParamDef,
	},
	'admin/roles/create': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:roles',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Role',
			},
		} as const,
		paramDef: adminRolesCreateParamDef,
	},
	'admin/roles/delete': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:roles',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: 'de0d6ecd-8e0a-4253-88ff-74bc89ae3d45',
				},
			},
		} as const,
		paramDef: adminRolesDeleteParamDef,
	},
	'admin/roles/list': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:roles',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Role',
				},
			},
		} as const,
		paramDef: adminRolesListParamDef,
	},
	'admin/roles/show': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:roles',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: '07dc7d34-c0d8-49b7-96c6-db3ce64ee0b3',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Role',
			},
		} as const,
		paramDef: adminRolesShowParamDef,
	},
	'admin/roles/unassign': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:roles',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: '6e519036-a70d-4c76-b679-bc8fb18194e2',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '2b730f78-1179-461b-88ad-d24c9af1a5ce',
				},

				notAssigned: {
					message: 'Not assigned.',
					code: 'NOT_ASSIGNED',
					id: 'b9060ac7-5c94-4da4-9f55-2047c953df44',
				},

				accessDenied: {
					message: 'Only administrators can edit members of the role.',
					code: 'ACCESS_DENIED',
					id: '24636eee-e8c1-493e-94b2-e16ad401e262',
				},
			},
		} as const,
		paramDef: adminRolesUnassignParamDef,
	},
	'admin/roles/update': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:roles',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: 'cd23ef55-09ad-428a-ac61-95a45e124b32',
				},
			},
		} as const,
		paramDef: adminRolesUpdateParamDef,
	},
	'admin/roles/update-default-policies': {
		meta: {
			tags: ['admin', 'role'],

			requireCredential: true,
			requireAdmin: true,
			kind: 'write:admin:roles',
		} as const,
		paramDef: adminRolesUpdateDefaultPoliciesParamDef,
	},
	'admin/roles/users': {
		meta: {
			tags: ['admin', 'role', 'users'],

			requireCredential: false,
			requireModerator: true,
			kind: 'read:admin:roles',

			errors: {
				noSuchRole: {
					message: 'No such role.',
					code: 'NO_SUCH_ROLE',
					id: '224eff5e-2488-4b18-b3e7-f50d94421648',
				},
			},

			res: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string', format: 'misskey:id' },
						createdAt: { type: 'string', format: 'date-time' },
						user: { ref: 'UserDetailed' },
						expiresAt: { type: 'string', format: 'date-time', nullable: true },
					},
					required: ['id', 'createdAt', 'user'],
				},
			},
		} as const,
		paramDef: adminRolesUsersParamDef,
	},
} as const;
