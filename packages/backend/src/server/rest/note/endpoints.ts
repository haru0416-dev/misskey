/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as notesContracts } from '@/server/api/metas/notes.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiNotesDraftsCount,
	handleApiNotesDraftsCreate,
	handleApiNotesDraftsDelete,
	handleApiNotesDraftsList,
	handleApiNotesDraftsUpdate,
} from './note-drafts.js';
import { handleApiNotesTranslate } from './note.js';
import {
	handleApiNotes,
	handleApiNotesChildren,
	handleApiNotesClips,
	handleApiNotesConversation,
	handleApiNotesFavoritesCreate,
	handleApiNotesFavoritesDelete,
	handleApiNotesFeatured,
	handleApiNotesGlobalTimeline,
	handleApiNotesHybridTimeline,
	handleApiNotesLocalTimeline,
	handleApiNotesMentions,
	handleApiNotesPollsRecommendation,
	handleApiNotesRenotes,
	handleApiNotesReplies,
	handleApiNotesSearch,
	handleApiNotesSearchByTag,
	handleApiNotesShow,
	handleApiNotesShowPartialBulk,
	handleApiNotesState,
	handleApiNotesThreadMutingCreate,
	handleApiNotesThreadMutingDelete,
	handleApiNotesTimeline,
	handleApiNotesUserListTimeline,
} from './notes.js';
import { handleApiNotesCreate } from './notes-create.js';
import { handleApiNotesDelete, handleApiNotesUnrenote } from './notes-delete.js';
import { handleApiNotesPollsVote } from './notes-polls-vote.js';
import {
	handleApiNotesReactions,
	handleApiNotesReactionsCreate,
	handleApiNotesReactionsDelete,
} from './notes-reactions.js';

export const notesEndpoints = implementEndpoints<ApiShellDependencies>()(notesContracts, {
	notes: async ({ deps, input }) => await handleApiNotes(deps, input),
	'notes/children': async ({ deps, me, input }) => await handleApiNotesChildren(deps, me, input),
	'notes/clips': async ({ deps, me, input, errors }) => await handleApiNotesClips(deps, me, input, errors),
	'notes/conversation': async ({ deps, me, input, errors }) =>
		await handleApiNotesConversation(deps, me, input, errors),
	'notes/create': async ({ deps, me, input, signal }) => await handleApiNotesCreate(deps, me, input, signal),
	'notes/delete': async ({ deps, me, input, errors }) => await handleApiNotesDelete(deps, me, input, errors),
	'notes/drafts/count': async ({ deps, me }) => await handleApiNotesDraftsCount(deps, me),
	'notes/drafts/create': async ({ deps, me, input }) => await handleApiNotesDraftsCreate(deps, me, input),
	'notes/drafts/delete': async ({ deps, me, input }) => await handleApiNotesDraftsDelete(deps, me, input),
	'notes/drafts/list': async ({ deps, me, input }) => await handleApiNotesDraftsList(deps, me, input),
	'notes/drafts/update': async ({ deps, me, input }) => await handleApiNotesDraftsUpdate(deps, me, input),
	'notes/favorites/create': async ({ deps, me, input, errors }) =>
		await handleApiNotesFavoritesCreate(deps, me, input, errors),
	'notes/favorites/delete': async ({ deps, me, input, errors }) =>
		await handleApiNotesFavoritesDelete(deps, me, input, errors),
	'notes/featured': async ({ deps, me, input }) => await handleApiNotesFeatured(deps, me, input),
	'notes/global-timeline': async ({ deps, me, input, errors }) =>
		await handleApiNotesGlobalTimeline(deps, me, input, errors),
	'notes/hybrid-timeline': async ({ deps, me, input, errors }) =>
		await handleApiNotesHybridTimeline(deps, me, input, errors),
	'notes/local-timeline': async ({ deps, me, input, errors }) =>
		await handleApiNotesLocalTimeline(deps, me, input, errors),
	'notes/mentions': async ({ deps, me, input }) => await handleApiNotesMentions(deps, me, input),
	'notes/polls/recommendation': async ({ deps, me, input }) => await handleApiNotesPollsRecommendation(deps, me, input),
	'notes/polls/vote': async ({ deps, me, input, errors }) => await handleApiNotesPollsVote(deps, me, input, errors),
	'notes/reactions': async ({ deps, me, input }) => await handleApiNotesReactions(deps, me, input),
	'notes/reactions/create': async ({ deps, me, input, errors }) =>
		await handleApiNotesReactionsCreate(deps, me, input, errors),
	'notes/reactions/delete': async ({ deps, me, input, errors }) =>
		await handleApiNotesReactionsDelete(deps, me, input, errors),
	'notes/renotes': async ({ deps, me, input, errors }) => await handleApiNotesRenotes(deps, me, input, errors),
	'notes/replies': async ({ deps, me, input }) => await handleApiNotesReplies(deps, me, input),
	'notes/search': async ({ deps, me, input, errors }) => await handleApiNotesSearch(deps, me, input, errors),
	'notes/search-by-tag': async ({ deps, me, input }) => await handleApiNotesSearchByTag(deps, me, input),
	'notes/show': async ({ deps, me, input, errors }) => await handleApiNotesShow(deps, me, input, errors),
	'notes/show-partial-bulk': async ({ deps, me, input }) => await handleApiNotesShowPartialBulk(deps, me, input),
	'notes/state': async ({ deps, me, input }) => await handleApiNotesState(deps, me, input),
	'notes/thread-muting/create': async ({ deps, me, input, errors }) =>
		await handleApiNotesThreadMutingCreate(deps, me, input, errors),
	'notes/thread-muting/delete': async ({ deps, me, input, errors }) =>
		await handleApiNotesThreadMutingDelete(deps, me, input, errors),
	'notes/timeline': async ({ deps, me, input }) => await handleApiNotesTimeline(deps, me, input),
	'notes/translate': async ({ deps, me, input, errors }) => await handleApiNotesTranslate(deps, me, input, errors),
	'notes/unrenote': async ({ deps, me, input, errors }) => await handleApiNotesUnrenote(deps, me, input, errors),
	'notes/user-list-timeline': async ({ deps, me, input, errors }) =>
		await handleApiNotesUserListTimeline(deps, me, input, errors),
});
