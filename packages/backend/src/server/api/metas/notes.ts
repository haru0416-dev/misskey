/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { countNoteDraftsParamDef, notesDraftsCreateParamDef, notesDraftsDeleteParamDef, notesDraftsListParamDef, notesDraftsUpdateParamDef } from '@/server/rest/note-drafts.js';
import { notesTranslateParamDef } from '@/server/rest/note.js';
import { notesCreateParamDef } from '@/server/rest/notes-create.js';
import { notesDeleteParamDef, notesUnrenoteParamDef } from '@/server/rest/notes-delete.js';
import { notesPollsVoteParamDef } from '@/server/rest/notes-polls-vote.js';
import { notesReactionsParamDef, reactionsCreateParamDef, reactionsDeleteParamDef } from '@/server/rest/notes-reactions.js';
import { noteIdOnlyParamDef, noteIdPaginationParamDef, notesConversationParamDef, notesFeaturedParamDef, notesGlobalTimelineParamDef, notesHybridTimelineParamDef, notesLocalTimelineParamDef, notesMentionsParamDef, notesParamDef, notesPollsRecommendationParamDef, notesSearchByTagDocsParamDef, notesSearchParamDef, notesShowParamDef, notesShowPartialBulkParamDef, notesTimelineParamDef, notesUserListTimelineParamDef } from '@/server/rest/notes.js';
import { SECOND, HOUR } from '@/const.js';

export const endpointMetas = {
	'notes': {
		meta: {
			tags: ['notes'],

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
		paramDef: notesParamDef,
	},
	'notes/children': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

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
		paramDef: noteIdPaginationParamDef,
	},
	'notes/clips': {
		meta: {
			tags: ['clips', 'notes'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Clip',
				},
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '47db1a1c-b0af-458d-8fb4-986e4efafe1e',
				},
			},
		} as const,
		paramDef: noteIdOnlyParamDef,
	},
	'notes/conversation': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'e1035875-9551-45ec-afa8-1ded1fcb53c8',
				},
			},
		} as const,
		paramDef: notesConversationParamDef,
	},
	'notes/create': {
		meta: {
			tags: ['notes'],

			requireCredential: true,

			prohibitMoved: true,

			limit: {
				duration: HOUR,
				max: 300,
			},

			kind: 'write:notes',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					createdNote: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'Note',
					},
				},
			},

			errors: {
				noSuchRenoteTarget: {
					message: 'No such renote target.',
					code: 'NO_SUCH_RENOTE_TARGET',
					id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4',
				},

				cannotReRenote: {
					message: 'You can not Renote a pure Renote.',
					code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE',
					id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a',
				},

				cannotRenoteDueToVisibility: {
					message: 'You can not Renote due to target visibility.',
					code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
					id: 'be9529e9-fe72-4de0-ae43-0b363c4938af',
				},

				noSuchReplyTarget: {
					message: 'No such reply target.',
					code: 'NO_SUCH_REPLY_TARGET',
					id: '749ee0f6-d3da-459a-bf02-282e2da4292c',
				},

				cannotReplyToInvisibleNote: {
					message: 'You cannot reply to an invisible Note.',
					code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE',
					id: 'b98980fa-3780-406c-a935-b6d0eeee10d1',
				},

				cannotReplyToPureRenote: {
					message: 'You can not reply to a pure Renote.',
					code: 'CANNOT_REPLY_TO_A_PURE_RENOTE',
					id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15',
				},

				cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: {
					message: 'You cannot reply to a specified visibility note with extended visibility.',
					code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
					id: 'ed940410-535c-4d5e-bfa3-af798671e93c',
				},

				cannotCreateAlreadyExpiredPoll: {
					message: 'Poll is already expired.',
					code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
					id: '04da457d-b083-4055-9082-955525eda5a5',
				},

				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb',
				},

				youHaveBeenBlocked: {
					message: 'You have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3',
				},

				noSuchFile: {
					message: 'Some files are not found.',
					code: 'NO_SUCH_FILE',
					id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
				},

				cannotRenoteOutsideOfChannel: {
					message: 'Cannot renote outside of channel.',
					code: 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL',
					id: '33510210-8452-094c-6227-4a6c05d99f00',
				},

				containsProhibitedWords: {
					message: 'Cannot post because it contains prohibited words.',
					code: 'CONTAINS_PROHIBITED_WORDS',
					id: 'aa6e01d3-a85c-669d-758a-76aab43af334',
				},

				containsTooManyMentions: {
					message: 'Cannot post because it exceeds the allowed number of mentions.',
					code: 'CONTAINS_TOO_MANY_MENTIONS',
					id: '4de0363a-3046-481b-9b0f-feff3e211025',
				},
			},
		} as const,
		paramDef: notesCreateParamDef,
	},
	'notes/delete': {
		meta: {
			tags: ['notes'],

			requireCredential: true,

			kind: 'write:notes',

			limit: {
				duration: HOUR,
				max: 300,
				minInterval: SECOND,
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '490be23f-8c1f-4796-819f-94cb4f9d1630',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9',
				},
			},
		} as const,
		paramDef: notesDeleteParamDef,
	},
	'notes/drafts/list': {
		meta: {
			tags: ['notes', 'drafts'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'read:account',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'NoteDraft',
				},
			},

			errors: {
			},
		} as const,
		paramDef: notesDraftsListParamDef,
	},
	'notes/drafts/create': {
		meta: {
			tags: ['notes', 'drafts'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					createdDraft: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'NoteDraft',
					},
				},
			},

			errors: {
				noSuchRenoteTarget: {
					message: 'No such renote target.',
					code: 'NO_SUCH_RENOTE_TARGET',
					id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4',
				},

				cannotReRenote: {
					message: 'You can not Renote a pure Renote.',
					code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE',
					id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a',
				},

				cannotRenoteDueToVisibility: {
					message: 'You can not Renote due to target visibility.',
					code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
					id: 'be9529e9-fe72-4de0-ae43-0b363c4938af',
				},

				noSuchReplyTarget: {
					message: 'No such reply target.',
					code: 'NO_SUCH_REPLY_TARGET',
					id: '749ee0f6-d3da-459a-bf02-282e2da4292c',
				},

				cannotReplyToInvisibleNote: {
					message: 'You cannot reply to an invisible Note.',
					code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE',
					id: 'b98980fa-3780-406c-a935-b6d0eeee10d1',
				},

				cannotReplyToPureRenote: {
					message: 'You can not reply to a pure Renote.',
					code: 'CANNOT_REPLY_TO_A_PURE_RENOTE',
					id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15',
				},

				cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: {
					message: 'You cannot reply to a specified visibility note with extended visibility.',
					code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
					id: 'ed940410-535c-4d5e-bfa3-af798671e93c',
				},

				cannotCreateAlreadyExpiredPoll: {
					message: 'Poll is already expired.',
					code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
					id: '04da457d-b083-4055-9082-955525eda5a5',
				},

				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb',
				},

				youHaveBeenBlocked: {
					message: 'You have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3',
				},

				noSuchFile: {
					message: 'Some files are not found.',
					code: 'NO_SUCH_FILE',
					id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
				},

				cannotRenoteOutsideOfChannel: {
					message: 'Cannot renote outside of channel.',
					code: 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL',
					id: '33510210-8452-094c-6227-4a6c05d99f00',
				},

				containsProhibitedWords: {
					message: 'Cannot post because it contains prohibited words.',
					code: 'CONTAINS_PROHIBITED_WORDS',
					id: 'aa6e01d3-a85c-669d-758a-76aab43af334',
				},

				containsTooManyMentions: {
					message: 'Cannot post because it exceeds the allowed number of mentions.',
					code: 'CONTAINS_TOO_MANY_MENTIONS',
					id: '4de0363a-3046-481b-9b0f-feff3e211025',
				},

				tooManyDrafts: {
					message: 'You cannot create drafts any more.',
					code: 'TOO_MANY_DRAFTS',
					id: '9ee33bbe-fde3-4c71-9b51-e50492c6b9c8',
				},

				tooManyScheduledNotes: {
					message: 'You cannot create scheduled notes any more.',
					code: 'TOO_MANY_SCHEDULED_NOTES',
					id: '22ae69eb-09e3-4541-a850-773cfa45e693',
				},

				cannotRenoteToExternal: {
					message: 'Cannot Renote to External.',
					code: 'CANNOT_RENOTE_TO_EXTERNAL',
					id: 'ed1952ac-2d26-4957-8b30-2deda76bedf7',
				},

				scheduledAtRequired: {
					message: 'scheduledAt is required when isActuallyScheduled is true.',
					code: 'SCHEDULED_AT_REQUIRED',
					id: '15e28a55-e74c-4d65-89b7-8880cdaaa87d',
				},

				scheduledAtMustBeInFuture: {
					message: 'scheduledAt must be in the future.',
					code: 'SCHEDULED_AT_MUST_BE_IN_FUTURE',
					id: 'e4bed6c9-017e-4934-aed0-01c22cc60ec1',
				},
			},

			limit: {
				duration: HOUR,
				max: 300,
			},
		} as const,
		paramDef: notesDraftsCreateParamDef,
	},
	'notes/drafts/delete': {
		meta: {
			tags: ['notes', 'drafts'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			errors: {
				noSuchNoteDraft: {
					message: 'No such note draft.',
					code: 'NO_SUCH_NOTE_DRAFT',
					id: '49cd6b9d-848e-41ee-b0b9-adaca711a6b1',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '56f35758-7dd5-468b-8439-5d6fb8ec9b8e',
				},
			},
		} as const,
		paramDef: notesDraftsDeleteParamDef,
	},
	'notes/drafts/update': {
		meta: {
			tags: ['notes', 'drafts'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:account',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					updatedDraft: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'NoteDraft',
					},
				},
			},

			errors: {
				noSuchRenoteTarget: {
					message: 'No such renote target.',
					code: 'NO_SUCH_RENOTE_TARGET',
					id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4',
				},

				cannotReRenote: {
					message: 'You can not Renote a pure Renote.',
					code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE',
					id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a',
				},

				cannotRenoteDueToVisibility: {
					message: 'You can not Renote due to target visibility.',
					code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
					id: 'be9529e9-fe72-4de0-ae43-0b363c4938af',
				},

				noSuchReplyTarget: {
					message: 'No such reply target.',
					code: 'NO_SUCH_REPLY_TARGET',
					id: '749ee0f6-d3da-459a-bf02-282e2da4292c',
				},

				cannotReplyToInvisibleNote: {
					message: 'You cannot reply to an invisible Note.',
					code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE',
					id: 'b98980fa-3780-406c-a935-b6d0eeee10d1',
				},

				cannotReplyToPureRenote: {
					message: 'You can not reply to a pure Renote.',
					code: 'CANNOT_REPLY_TO_A_PURE_RENOTE',
					id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15',
				},

				cannotReplyToSpecifiedNoteWithExtendedVisibility: {
					message: 'You cannot reply to a specified visibility note with extended visibility.',
					code: 'CANNOT_REPLY_TO_SPECIFIED_NOTE_WITH_EXTENDED_VISIBILITY',
					id: 'ed940410-535c-4d5e-bfa3-af798671e93c',
				},

				cannotCreateAlreadyExpiredPoll: {
					message: 'Poll is already expired.',
					code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
					id: '04da457d-b083-4055-9082-955525eda5a5',
				},

				noSuchChannel: {
					message: 'No such channel.',
					code: 'NO_SUCH_CHANNEL',
					id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb',
				},

				youHaveBeenBlocked: {
					message: 'You have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3',
				},

				noSuchFile: {
					message: 'Some files are not found.',
					code: 'NO_SUCH_FILE',
					id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
				},

				cannotRenoteOutsideOfChannel: {
					message: 'Cannot renote outside of channel.',
					code: 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL',
					id: '33510210-8452-094c-6227-4a6c05d99f00',
				},

				containsProhibitedWords: {
					message: 'Cannot post because it contains prohibited words.',
					code: 'CONTAINS_PROHIBITED_WORDS',
					id: 'aa6e01d3-a85c-669d-758a-76aab43af334',
				},

				containsTooManyMentions: {
					message: 'Cannot post because it exceeds the allowed number of mentions.',
					code: 'CONTAINS_TOO_MANY_MENTIONS',
					id: '4de0363a-3046-481b-9b0f-feff3e211025',
				},

				noSuchNoteDraft: {
					message: 'No such note draft.',
					code: 'NO_SUCH_NOTE_DRAFT',
					id: '49cd6b9d-848e-41ee-b0b9-adaca711a6b1',
				},

				accessDenied: {
					message: 'Access denied.',
					code: 'ACCESS_DENIED',
					id: '56f35758-7dd5-468b-8439-5d6fb8ec9b8e',
				},

				noSuchRenote: {
					message: 'No such renote.',
					code: 'NO_SUCH_RENOTE',
					id: '64929870-2540-4d11-af41-3b484d78c956',
				},

				cannotRenote: {
					message: 'Cannot renote.',
					code: 'CANNOT_RENOTE',
					id: '76cc5583-5a14-4ad3-8717-0298507e32db',
				},

				cannotRenoteToExternal: {
					message: 'Cannot Renote to External.',
					code: 'CANNOT_RENOTE_TO_EXTERNAL',
					id: 'ed1952ac-2d26-4957-8b30-2deda76bedf7',
				},

				noSuchReply: {
					message: 'No such reply.',
					code: 'NO_SUCH_REPLY',
					id: 'c4721841-22fc-4bb7-ad3d-897ef1d375b5',
				},

				cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: {
					message: 'You cannot reply to a specified visibility note with extended visibility.',
					code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
					id: '215dbc76-336c-4d2a-9605-95766ba7dab0',
				},

				tooManyScheduledNotes: {
					message: 'You cannot create scheduled notes any more.',
					code: 'TOO_MANY_SCHEDULED_NOTES',
					id: '02f5df79-08ae-4a33-8524-f1503c8f6212',
				},

				scheduledAtRequired: {
					message: 'scheduledAt is required when isActuallyScheduled is true.',
					code: 'SCHEDULED_AT_REQUIRED',
					id: 'fe9737d5-cc41-498c-af9d-149207307530',
				},

				scheduledAtMustBeInFuture: {
					message: 'scheduledAt must be in the future.',
					code: 'SCHEDULED_AT_MUST_BE_IN_FUTURE',
					id: 'ed1a6673-d0d1-4364-aaae-9bf3f139cbc5',
				},
			},

			limit: {
				duration: HOUR,
				max: 300,
			},
		} as const,
		paramDef: notesDraftsUpdateParamDef,
	},
	'notes/drafts/count': {
		meta: {
			tags: ['notes', 'drafts'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'read:account',

			res: {
				type: 'number',
				optional: false, nullable: false,
				description: 'The number of drafts',
			},

			errors: {
			},
		} as const,
		paramDef: countNoteDraftsParamDef,
	},
	'notes/favorites/create': {
		meta: {
			tags: ['notes', 'favorites'],

			requireCredential: true,
			prohibitMoved: true,

			kind: 'write:favorites',

			limit: {
				duration: HOUR,
				max: 20,
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '6dd26674-e060-4816-909a-45ba3f4da458',
				},

				alreadyFavorited: {
					message: 'The note has already been marked as a favorite.',
					code: 'ALREADY_FAVORITED',
					id: 'a402c12b-34dd-41d2-97d8-4d2ffd96a1a6',
				},
			},
		} as const,
		paramDef: noteIdOnlyParamDef,
	},
	'notes/favorites/delete': {
		meta: {
			tags: ['notes', 'favorites'],

			requireCredential: true,

			kind: 'write:favorites',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '80848a2c-398f-4343-baa9-df1d57696c56',
				},

				notFavorited: {
					message: 'You have not marked that note a favorite.',
					code: 'NOT_FAVORITED',
					id: 'b625fc69-635e-45e9-86f4-dbefbef35af5',
				},
			},
		} as const,
		paramDef: noteIdOnlyParamDef,
	},
	'notes/featured': {
		meta: {
			tags: ['notes'],

			requireCredential: false,
			allowGet: true,
			cacheSec: 3600,

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
		paramDef: notesFeaturedParamDef,
	},
	'notes/global-timeline': {
		meta: {
			tags: ['notes'],

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				gtlDisabled: {
					message: 'Global timeline has been disabled.',
					code: 'GTL_DISABLED',
					id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6b',
				},
			},
		} as const,
		paramDef: notesGlobalTimelineParamDef,
	},
	'notes/hybrid-timeline': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				stlDisabled: {
					message: 'Hybrid timeline has been disabled.',
					code: 'STL_DISABLED',
					id: '620763f4-f621-4533-ab33-0577a1a3c342',
				},

				bothWithRepliesAndWithFiles: {
					message: 'Specifying both withReplies and withFiles is not supported',
					code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
					id: 'dfaa3eb7-8002-4cb7-bcc4-1095df46656f',
				},
			},
		} as const,
		paramDef: notesHybridTimelineParamDef,
	},
	'notes/local-timeline': {
		meta: {
			tags: ['notes'],

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				ltlDisabled: {
					message: 'Local timeline has been disabled.',
					code: 'LTL_DISABLED',
					id: '45a6eb02-7695-4393-b023-dd3be9aaaefd',
				},

				bothWithRepliesAndWithFiles: {
					message: 'Specifying both withReplies and withFiles is not supported',
					code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
					id: 'dd9c8400-1cb5-4eef-8a31-200c5f933793',
				},
			},
		} as const,
		paramDef: notesLocalTimelineParamDef,
	},
	'notes/mentions': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'read:account',

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
		paramDef: notesMentionsParamDef,
	},
	'notes/polls/recommendation': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'read:account',

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
		paramDef: notesPollsRecommendationParamDef,
	},
	'notes/polls/vote': {
		meta: {
			tags: ['notes'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:votes',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'ecafbd2e-c283-4d6d-aecb-1a0a33b75396',
				},

				noPoll: {
					message: 'The note does not attach a poll.',
					code: 'NO_POLL',
					id: '5f979967-52d9-4314-a911-1c673727f92f',
				},

				invalidChoice: {
					message: 'Choice ID is invalid.',
					code: 'INVALID_CHOICE',
					id: 'e0cc9a04-f2e8-41e4-a5f1-4127293260cc',
				},

				alreadyVoted: {
					message: 'You have already voted.',
					code: 'ALREADY_VOTED',
					id: '0963fc77-efac-419b-9424-b391608dc6d8',
				},

				alreadyExpired: {
					message: 'The poll is already expired.',
					code: 'ALREADY_EXPIRED',
					id: '1022a357-b085-4054-9083-8f8de358337e',
				},

				youHaveBeenBlocked: {
					message: 'You cannot vote this poll because you have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: '85a5377e-b1e9-4617-b0b9-5bea73331e49',
				},
			},
		} as const,
		paramDef: notesPollsVoteParamDef,
	},
	'notes/reactions': {
		meta: {
			tags: ['notes', 'reactions'],

			requireCredential: false,

			allowGet: true,
			cacheSec: 60,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'NoteReaction',
				},
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '263fff3d-d0e1-4af4-bea7-8408059b451a',
				},
			},
		} as const,
		paramDef: notesReactionsParamDef,
	},
	'notes/reactions/create': {
		meta: {
			tags: ['reactions', 'notes'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:reactions',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '033d0620-5bfe-4027-965d-980b0c85a3ea',
				},

				alreadyReacted: {
					message: 'You are already reacting to that note.',
					code: 'ALREADY_REACTED',
					id: '71efcf98-86d6-4e2b-b2ad-9d032369366b',
				},

				youHaveBeenBlocked: {
					message: 'You cannot react this note because you have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: '20ef5475-9f38-4e4c-bd33-de6d979498ec',
				},

				cannotReactToRenote: {
					message: 'You cannot react to Renote.',
					code: 'CANNOT_REACT_TO_RENOTE',
					id: 'eaccdc08-ddef-43fe-908f-d108faad57f5',
				},
			},
		} as const,
		paramDef: reactionsCreateParamDef,
	},
	'notes/reactions/delete': {
		meta: {
			tags: ['reactions', 'notes'],

			requireCredential: true,

			kind: 'write:reactions',

			limit: {
				duration: HOUR,
				max: 60,
				minInterval: 3 * SECOND,
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '764d9fce-f9f2-4a0e-92b1-6ceac9a7ad37',
				},

				notReacted: {
					message: 'You are not reacting to that note.',
					code: 'NOT_REACTED',
					id: '92f4426d-4196-4125-aa5b-02943e2ec8fc',
				},
			},
		} as const,
		paramDef: reactionsDeleteParamDef,
	},
	'notes/renotes': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '12908022-2e21-46cd-ba6a-3edaf6093f46',
				},
			},
		} as const,
		paramDef: noteIdPaginationParamDef,
	},
	'notes/replies': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

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
		paramDef: noteIdPaginationParamDef,
	},
	'notes/search': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				unavailable: {
					message: 'Search of notes unavailable.',
					code: 'UNAVAILABLE',
					id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
				},
			},
		} as const,
		paramDef: notesSearchParamDef,
	},
	'notes/search-by-tag': {
		meta: {
			tags: ['notes', 'hashtags'],

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
		paramDef: notesSearchByTagDocsParamDef,
	},
	'notes/show': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Note',
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
				},

				contentRestrictedByUser: {
					message: 'Content restricted by user. Please sign in to view.',
					code: 'CONTENT_RESTRICTED_BY_USER',
					id: 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab',
				},

				contentRestrictedByServer: {
					message: 'Content restricted by server settings. Please sign in to view.',
					code: 'CONTENT_RESTRICTED_BY_SERVER',
					id: '145f88d2-b03d-4087-8143-a78928883c4b',
				},
			},
		} as const,
		paramDef: notesShowParamDef,
	},
	'notes/show-partial-bulk': {
		meta: {
			tags: ['notes'],

			requireCredential: false,

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
						},
						reactions: {
							type: 'object',
							optional: false, nullable: false,
							additionalProperties: {
								type: 'number',
							},
						},
						reactionEmojis: {
							type: 'object',
							optional: false, nullable: false,
							additionalProperties: {
								type: 'string',
							},
						},
					},
				},
			},

			errors: {
			},
		} as const,
		paramDef: notesShowPartialBulkParamDef,
	},
	'notes/state': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					isFavorited: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isMutedThread: {
						type: 'boolean',
						optional: false, nullable: false,
					},
				},
			},
		} as const,
		paramDef: noteIdOnlyParamDef,
	},
	'notes/thread-muting/create': {
		meta: {
			tags: ['notes'],

			requireCredential: true,

			kind: 'write:account',

			limit: {
				duration: HOUR,
				max: 10,
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: '5ff67ada-ed3b-2e71-8e87-a1a421e177d2',
				},
			},
		} as const,
		paramDef: noteIdOnlyParamDef,
	},
	'notes/thread-muting/delete': {
		meta: {
			tags: ['notes'],

			requireCredential: true,

			kind: 'write:account',

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'bddd57ac-ceb3-b29d-4334-86ea5fae481a',
				},
			},
		} as const,
		paramDef: noteIdOnlyParamDef,
	},
	'notes/timeline': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'read:account',

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
		paramDef: notesTimelineParamDef,
	},
	'notes/translate': {
		meta: {
			tags: ['notes'],

			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'object',
				optional: true, nullable: false,
				properties: {
					sourceLang: { type: 'string' },
					text: { type: 'string' },
				},
			},

			errors: {
				unavailable: {
					message: 'Translate of notes unavailable.',
					code: 'UNAVAILABLE',
					id: '50a70314-2d8a-431b-b433-efa5cc56444c',
				},
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'bea9b03f-36e0-49c5-a4db-627a029f8971',
				},
				cannotTranslateInvisibleNote: {
					message: 'Cannot translate invisible note.',
					code: 'CANNOT_TRANSLATE_INVISIBLE_NOTE',
					id: 'ea29f2ca-c368-43b3-aaf1-5ac3e74bbe5d',
				},
			},
		} as const,
		paramDef: notesTranslateParamDef,
	},
	'notes/unrenote': {
		meta: {
			tags: ['notes'],

			requireCredential: true,

			kind: 'write:notes',

			limit: {
				duration: HOUR,
				max: 300,
				minInterval: SECOND,
			},

			errors: {
				noSuchNote: {
					message: 'No such note.',
					code: 'NO_SUCH_NOTE',
					id: 'efd4a259-2442-496b-8dd7-b255aa1a160f',
				},
			},
		} as const,
		paramDef: notesUnrenoteParamDef,
	},
	'notes/user-list-timeline': {
		meta: {
			tags: ['notes', 'lists'],

			requireCredential: true,
			kind: 'read:account',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Note',
				},
			},

			errors: {
				noSuchList: {
					message: 'No such list.',
					code: 'NO_SUCH_LIST',
					id: '8fb1fbd5-e476-4c37-9fb0-43d55b63a2ff',
				},
			},
		} as const,
		paramDef: notesUserListTimelineParamDef,
	},
} as const;
