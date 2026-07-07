/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { clipIdParamDef, clipNotesParamDef, clipsCreateParamDef, clipsListParamDef, clipsNoteParamDef, clipsUpdateParamDef, emptyParamDef } from '@/server/rest/clips.js';
import ms from 'ms';

export const endpointMetas = {
	'clips/add-note': {
		meta: {
			tags: ['account', 'notes', 'clips'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			limit: {
				duration: ms('1hour'),
				max: 20,
			},

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: 'd6e76cc0-a1b5-4c7c-a287-73fa9c716dcf',
				},

				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'fc8c0b49-c7a3-4664-a0a6-b418d386bb8b',
				},

				alreadyClipped: {
					message: 'The note has already been clipped.',
					code: 'ALREADY_CLIPPED',
					id: '734806c4-542c-463a-9311-15c512803965',
				},

				tooManyClipNotes: {
					message: 'You cannot add notes to the clip any more.',
					code: 'TOO_MANY_CLIP_NOTES',
					id: 'f0dba960-ff73-4615-8df4-d6ac5d9dc118',
				},
			},
		} as const,
		paramDef: clipsNoteParamDef,
	},
	'clips/create': {
		meta: {
			tags: ['clips'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Clip',
			},

			errors: {
				tooManyClips: {
					message: 'You cannot create clip any more.',
					code: 'TOO_MANY_CLIPS',
					id: '920f7c2d-6208-4b76-8082-e632020f5883',
				},
			},
		} as const,
		paramDef: clipsCreateParamDef,
	},
	'clips/delete': {
		meta: {
			tags: ['clips'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: '70ca08ba-6865-4630-b6fb-8494759aa754',
				},
			},
		} as const,
		paramDef: clipIdParamDef,
	},
	'clips/favorite': {
		meta: {
			tags: ['clip'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:clip-favorite',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: '4c2aaeae-80d8-4250-9606-26cb1fdb77a5',
				},

				alreadyFavorited: {
					message: 'The clip has already been favorited.',
					code: 'ALREADY_FAVORITED',
					id: '92658936-c625-4273-8326-2d790129256e',
				},
			},
		} as const,
		paramDef: clipIdParamDef,
	},
	'clips/list': {
		meta: {
			tags: ['clips', 'account'],

			requireCredential: true,

			kind: 'read:account',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Clip',
				},
			},
		} as const,
		paramDef: clipsListParamDef,
	},
	'clips/my-favorites': {
		meta: {
			tags: ['account', 'clip'],

			requireCredential: true,

			kind: 'read:clip-favorite',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Clip',
				},
			},
		} as const,
		paramDef: emptyParamDef,
	},
	'clips/notes': {
		meta: {
			tags: ['account', 'notes', 'clips'],

			requireCredential: false,

			kind: 'read:account',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: '1d7645e6-2b6d-4635-b0fe-fe22b0e72e00',
				},
			},

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},
		} as const,
		paramDef: clipNotesParamDef,
	},
	'clips/remove-note': {
		meta: {
			tags: ['account', 'notes', 'clips'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: 'b80525c6-97f7-49d7-a42d-ebccd49cfd52',
				},

				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'aff017de-190e-434b-893e-33a9ff5049d8',
				},
			},
		} as const,
		paramDef: clipsNoteParamDef,
	},
	'clips/show': {
		meta: {
			tags: ['clips', 'account'],

			requireCredential: false,

			kind: 'read:account',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: 'c3c5fe33-d62c-44d2-9ea5-d997703f5c20',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Clip',
			},
		} as const,
		paramDef: clipIdParamDef,
	},
	'clips/unfavorite': {
		meta: {
			tags: ['clip'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:clip-favorite',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: '2603966e-b865-426c-94a7-af4a01241dc1',
				},

				notFavorited: {
					message: 'You have not favorited the clip.',
					code: 'NOT_FAVORITED',
					id: '90c3a9e8-b321-4dae-bf57-2bf79bbcc187',
				},
			},
		} as const,
		paramDef: clipIdParamDef,
	},
	'clips/update': {
		meta: {
			tags: ['clips'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchClip: {
					message: 'No such clip.',
					code: 'NO_SUCH_CLIP',
					id: 'b4d92d70-b216-46fa-9a3f-a8c811699257',
				},
			},

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Clip',
			},
		} as const,
		paramDef: clipsUpdateParamDef,
	},
} as const;
