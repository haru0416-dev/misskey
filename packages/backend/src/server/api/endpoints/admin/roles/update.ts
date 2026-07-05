/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const meta = {
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
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string' },
		description: { type: 'string' },
		color: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		target: { type: 'string', enum: ['manual', 'conditional'] },
		condFormula: { type: 'object' },
		isPublic: { type: 'boolean' },
		isModerator: { type: 'boolean' },
		isAdministrator: { type: 'boolean' },
		isExplorable: { type: 'boolean' },
		asBadge: { type: 'boolean' },
		preserveAssignmentOnMoveAccount: { type: 'boolean' },
		canEditMembersByModerator: { type: 'boolean' },
		displayOrder: { type: 'number' },
		policies: {
			type: 'object',
		},
	},
	required: [
		'roleId',
	],
} as const;
