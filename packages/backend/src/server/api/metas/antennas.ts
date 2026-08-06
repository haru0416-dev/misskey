/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	antennasCreateParamDef,
	antennasDeleteParamDef,
	antennasListParamDef,
	antennasNotesParamDef,
	antennasRemoveNoteParamDef,
	antennasShowParamDef,
	antennasUpdateParamDef,
} from '@/server/rest/antennas.js';

export const endpointMetas = {
	'antennas/create': {
		meta: {
			tags: ['antennas'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchUserList: {
					message: 'No such user list.',
					code: 'NO_SUCH_USER_LIST',
					id: '95063e93-a283-4b8b-9aa5-bcdb8df69a7f',
				},

				tooManyAntennas: {
					message: 'You cannot create antenna any more.',
					code: 'TOO_MANY_ANTENNAS',
					id: 'faf47050-e8b5-438c-913c-db2b1576fde4',
				},

				emptyKeyword: {
					message: 'Either keywords or excludeKeywords is required.',
					code: 'EMPTY_KEYWORD',
					id: '53ee222e-1ddd-4f9a-92e5-9fb82ddb463a',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Antenna',
			},
		} as const,
		paramDef: antennasCreateParamDef,
	},
	'antennas/delete': {
		meta: {
			tags: ['antennas'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchAntenna: {
					message: 'No such antenna.',
					code: 'NO_SUCH_ANTENNA',
					id: 'b34dcf9d-348f-44bb-99d0-6c9314cfe2df',
				},
			},
		} as const,
		paramDef: antennasDeleteParamDef,
	},
	'antennas/list': {
		meta: {
			tags: ['antennas', 'account'],

			requireCredential: true,

			kind: 'read:account',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Antenna',
				},
			},
		} as const,
		paramDef: antennasListParamDef,
	},
	'antennas/notes': {
		meta: {
			tags: ['antennas', 'account', 'notes'],

			requireCredential: true,

			kind: 'read:account',

			errors: {
				noSuchAntenna: {
					message: 'No such antenna.',
					code: 'NO_SUCH_ANTENNA',
					id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
				},
			},

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'Note',
				},
			},
		} as const,
		paramDef: antennasNotesParamDef,
	},
	'antennas/remove-note': {
		meta: {
			tags: ['antennas', 'account', 'notes'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchAntenna: {
					message: 'No such antenna.',
					code: 'NO_SUCH_ANTENNA',
					id: '850926e0-fd3b-49b6-b69a-b28a5dbd82fe',
				},
			},
		} as const,
		paramDef: antennasRemoveNoteParamDef,
	},
	'antennas/show': {
		meta: {
			tags: ['antennas', 'account'],

			requireCredential: true,

			kind: 'read:account',

			errors: {
				noSuchAntenna: {
					message: 'No such antenna.',
					code: 'NO_SUCH_ANTENNA',
					id: 'c06569fb-b025-4f23-b22d-1fcd20d2816b',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Antenna',
			},
		} as const,
		paramDef: antennasShowParamDef,
	},
	'antennas/update': {
		meta: {
			tags: ['antennas'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchAntenna: {
					message: 'No such antenna.',
					code: 'NO_SUCH_ANTENNA',
					id: '10c673ac-8852-48eb-aa1f-f5b67f069290',
				},

				noSuchUserList: {
					message: 'No such user list.',
					code: 'NO_SUCH_USER_LIST',
					id: '1c6b35c9-943e-48c2-81e4-2844989407f7',
				},

				emptyKeyword: {
					message: 'Either keywords or excludeKeywords is required.',
					code: 'EMPTY_KEYWORD',
					id: '721aaff6-4e1b-4d88-8de6-877fae9f68c4',
				},
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'Antenna',
			},
		} as const,
		paramDef: antennasUpdateParamDef,
	},
} as const;
