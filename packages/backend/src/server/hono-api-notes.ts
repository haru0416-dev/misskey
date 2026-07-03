/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { Packed } from '@/misc/json-schema.js';
import { HonoApiError } from './hono-api-error.js';
import { packNoteForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiNotesDependencies = HonoApiNoteDependencies & {
	meta: MiMeta;
};

const notesShowParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

type NotesShowParams = {
	noteId: string;
};

function notesShowNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
	});
}

function notesShowContentRestrictedByUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Content restricted by user. Please sign in to view.',
		code: 'CONTENT_RESTRICTED_BY_USER',
		id: 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab',
	});
}

function notesShowContentRestrictedByServerError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Content restricted by server settings. Please sign in to view.',
		code: 'CONTENT_RESTRICTED_BY_SERVER',
		id: '145f88d2-b03d-4087-8143-a78928883c4b',
	});
}

export async function handleHonoApiNotesShow(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>> {
	const params = parseHonoApiParams(notesShowParamDef, body) as NotesShowParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesShowNoSuchNoteError();

	const user = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);

	if (user.requireSigninToViewContents && me == null) {
		throw notesShowContentRestrictedByUserError();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'none' && me == null) {
		throw notesShowContentRestrictedByServerError();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'local' && note.userHost != null && me == null) {
		throw notesShowContentRestrictedByServerError();
	}

	return await packNoteForHonoApi(deps, note, me, {
		detail: true,
	});
}
