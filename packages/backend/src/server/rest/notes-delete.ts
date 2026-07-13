/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { SECOND, HOUR } from '@/const.js';
import { z } from 'zod';
import { adjustInstanceNotesCountFromDatabase } from '@/core/InstanceStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import {
	decrementNoteRepliesCountInDatabase,
	deleteNoteByIdAndUserIdFromDatabase,
	fetchNoteByIdFromDatabase,
	listNotesByUserIdAndRenoteIdFromDatabase,
} from '@/core/NoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import type { HonoApiNoteStreamPublisher } from './events.js';
import {
	deliverNoteActivityForHonoApi,
	deliverToRelaysForHonoApi,
	renderNoteDeleteOrUndoAnnounceActivityForHonoApi,
	resolveMentionedAndInvolvedRemoteUsersForHonoApi,
	type HonoApiRelayDeliverDependencies,
} from './notes-ap.js';
import { fetchOrRegisterInstanceForHonoApi } from './notes-create.js';
import { isHonoApiModerator, type HonoApiRolePolicyDependencies } from './role-policy.js';
import type { HonoChartWriters } from '../chart-runtime.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiNotesDeleteDependencies = HonoApiRelayDeliverDependencies & HonoApiRolePolicyDependencies & {
	chartWriters: HonoChartWriters;
	publishNoteStream?: HonoApiNoteStreamPublisher;
};

function notesDeleteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: '490be23f-8c1f-4796-819f-94cb4f9d1630' });
}

function notesDeleteAccessDeniedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Access denied.', code: 'ACCESS_DENIED', id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9' });
}

export const notesDeleteParamDef = z.object({
	noteId: misskeyId(),
});

type NotesDeleteParams = {
	noteId: string;
};

export async function deleteNoteForHonoApi(
	deps: HonoApiNotesDeleteDependencies,
	user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot'] },
	note: MiNote,
	deleter?: { id: MiUser['id'] },
): Promise<void> {
	const deletedAt = new Date();

	if (note.replyId) {
		await decrementNoteRepliesCountInDatabase(deps.db, note.replyId, 1);
	}

	deps.publishNoteStream?.(note, 'deleted', { deletedAt });

	if (user.host == null && !note.localOnly) {
		// 元の NoteDeleteService#delete も、renote 先ノートの解決とアクティビティのレンダリングは
		// delete() 本体の同期フロー内で await しており(失敗時は削除全体を reject させる)、
		// 実際の配送(deliverToConcerned)だけを fire-and-forget にしている。同じ非同期境界を再現する。
		const activity = await renderNoteDeleteOrUndoAnnounceActivityForHonoApi(deps, note, user);
		(async () => {
			const directRecipients = await resolveMentionedAndInvolvedRemoteUsersForHonoApi(deps, note);
			await deliverNoteActivityForHonoApi(deps, user, activity, {
				directRecipients,
				deliverToFollowers: true,
			});

			// 原典 NoteDeleteService#deliverToConcerned 同様、リレーにも配信する (fire-and-forget)。
			void deliverToRelaysForHonoApi(deps, { id: user.id, host: null }, activity).catch(() => {});
		})().catch(() => {});
	}

	void deps.chartWriters.notesChart.update(note, false);
	if (deps.meta.enableChartsForRemoteUser || user.host == null) {
		deps.chartWriters.perUserNotesChart.update(user, note, false);
	}

	if (deps.meta.enableStatsForFederatedInstances && user.host != null) {
		fetchOrRegisterInstanceForHonoApi(deps, user.host).then(async i => {
			await adjustInstanceNotesCountFromDatabase(deps.db, i.id, -1);
			if (deps.meta.enableChartsForFederatedInstances) {
				void deps.chartWriters.instanceChart.updateNote(i.host, note, false);
			}
		}).catch(() => {});
	}

	await deleteNoteByIdAndUserIdFromDatabase(deps.db, note.id, user.id);

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

export async function handleHonoApiNotesDelete(
	deps: HonoApiNotesDeleteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(notesDeleteParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesDeleteNoSuchNoteError();

	if (!await isHonoApiModerator(deps, me) && note.userId !== me.id) {
		throw notesDeleteAccessDeniedError();
	}

	const noteAuthor = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);

	await deleteNoteForHonoApi(deps, noteAuthor, note, me);
}

export const notesDeleteRateLimit = {
	duration: HOUR,
	max: 300,
	minInterval: SECOND,
};

function notesUnrenoteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: 'efd4a259-2442-496b-8dd7-b255aa1a160f' });
}

export const notesUnrenoteParamDef = z.object({
	noteId: misskeyId(),
});

type NotesUnrenoteParams = {
	noteId: string;
};

export async function handleHonoApiNotesUnrenote(
	deps: HonoApiNotesDeleteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(notesUnrenoteParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesUnrenoteNoSuchNoteError();

	const renotes = await listNotesByUserIdAndRenoteIdFromDatabase(deps.db, me.id, note.id);
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	await Promise.all(renotes.map(renote => deleteNoteForHonoApi(deps, user, renote)));
}

export const notesUnrenoteRateLimit = {
	duration: HOUR,
	max: 300,
	minInterval: SECOND,
};
