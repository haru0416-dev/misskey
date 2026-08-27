/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { SECOND, HOUR } from '@/const.js';
import { z } from 'zod';
import { adjustInstanceNotesCountFromDatabase } from '@/core/instance/InstanceStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import {
	deleteNoteAndDecrementParentRepliesCountInDatabase,
	fetchNoteByIdFromDatabase,
	listNotesByUserIdAndRenoteIdFromDatabase,
} from '@/core/note/NoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import type { ApiNoteStreamPublisher } from '../events.js';
import {
	deliverNoteActivityForApi,
	deliverToRelaysForApi,
	renderNoteDeleteOrUndoAnnounceActivityForApi,
	resolveMentionedAndInvolvedRemoteUsersForApi,
	type ApiRelayDeliverDependencies,
} from '../activitypub/notes-ap.js';
import { fetchOrRegisterInstanceForApi } from './notes-create.js';
import { isApiModerator, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import type { ChartWriters } from '@/server/chart-runtime.js';
import { parseApiParams } from '../validation.js';

export type ApiNotesDeleteDependencies = ApiRelayDeliverDependencies &
	ApiRolePolicyDependencies & {
		chartWriters: ChartWriters;
		publishNoteStream?: ApiNoteStreamPublisher;
	};

function notesDeleteNoSuchNoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '490be23f-8c1f-4796-819f-94cb4f9d1630',
	});
}

function notesDeleteAccessDeniedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9',
	});
}

export const notesDeleteParamDef = z.object({
	noteId: misskeyId(),
});

type NotesDeleteParams = {
	noteId: string;
};

export async function deleteNoteForApi(
	deps: ApiNotesDeleteDependencies,
	user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot'] },
	note: MiNote,
	deleter?: { id: MiUser['id'] },
): Promise<void> {
	const deletedAt = new Date();

	deps.publishNoteStream?.(note, 'deleted', { deletedAt });

	if (user.host == null && !note.localOnly) {
		// アクティビティ生成の失敗は削除を失敗させ、ネットワーク配送だけをバックグラウンドで行う。
		const activity = await renderNoteDeleteOrUndoAnnounceActivityForApi(deps, note, user);
		(async () => {
			const directRecipients = await resolveMentionedAndInvolvedRemoteUsersForApi(deps, note);
			await deliverNoteActivityForApi(deps, user, activity, {
				directRecipients,
				deliverToFollowers: true,
			});

			void deliverToRelaysForApi(deps, { id: user.id, host: null }, activity).catch(() => {});
		})().catch(() => {});
	}

	void deps.chartWriters.notesChart.update(note, false);
	if (deps.meta.enableChartsForRemoteUser || user.host == null) {
		deps.chartWriters.perUserNotesChart.update(user, note, false);
	}

	if (deps.meta.enableStatsForFederatedInstances && user.host != null) {
		fetchOrRegisterInstanceForApi(deps, user.host)
			.then(async (i) => {
				await adjustInstanceNotesCountFromDatabase(deps.db, i.id, -1);
				if (deps.meta.enableChartsForFederatedInstances) {
					void deps.chartWriters.instanceChart.updateNote(i.host, note, false);
				}
			})
			.catch(() => {});
	}

	await deleteNoteAndDecrementParentRepliesCountInDatabase(deps.db, note.id, user.id);

	if (deleter && note.userId !== deleter.id) {
		const noteOwner = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);
		await logModerationEventInDatabase(deps, deleter, 'deleteNote', {
			noteId: note.id,
			noteUserId: note.userId,
			noteUserUsername: noteOwner.username,
			noteUserHost: noteOwner.host,
			note,
		});
	}
}

export async function handleApiNotesDelete(
	deps: ApiNotesDeleteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(notesDeleteParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesDeleteNoSuchNoteError();

	if (!(await isApiModerator(deps, me)) && note.userId !== me.id) {
		throw notesDeleteAccessDeniedError();
	}

	const noteAuthor = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);

	await deleteNoteForApi(deps, noteAuthor, note, me);
}

export const notesDeleteRateLimit = {
	duration: HOUR,
	max: 300,
	minInterval: SECOND,
};

function notesUnrenoteNoSuchNoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'efd4a259-2442-496b-8dd7-b255aa1a160f',
	});
}

export const notesUnrenoteParamDef = z.object({
	noteId: misskeyId(),
});

type NotesUnrenoteParams = {
	noteId: string;
};

export async function handleApiNotesUnrenote(
	deps: ApiNotesDeleteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(notesUnrenoteParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesUnrenoteNoSuchNoteError();

	const renotes = await listNotesByUserIdAndRenoteIdFromDatabase(deps.db, me.id, note.id);
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	await Promise.all(renotes.map((renote) => deleteNoteForApi(deps, user, renote)));
}

export const notesUnrenoteRateLimit = {
	duration: HOUR,
	max: 300,
	minInterval: SECOND,
};
