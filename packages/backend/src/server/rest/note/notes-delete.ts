/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as notesContracts } from '@/server/rest/contracts/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
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
import type { NoteStreamPublisher } from '../../../core/events.js';
import {
	deliverNoteActivity,
	deliverToRelays,
	renderNoteDeleteOrUndoAnnounceActivity,
	renderOnce,
	resolveMentionedAndInvolvedRemoteUsers,
} from '../../../core/activitypub/notes-ap.js';
import type { RelayDeliverDependencies } from '../../../core/activitypub/notes-ap.js';
import { fetchOrRegisterInstance } from '@/core/note/NoteCreationService.js';
import { userIsModerator } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import type { ChartWriters } from '@/core/chart/chart-runtime.js';
import { parseApiParams } from '../validation.js';
import type { ApiParams } from '../validation.js';

export type ApiNotesDeleteDependencies = RelayDeliverDependencies &
	RolePolicyDependencies & {
		chartWriters: ChartWriters;
		publishNoteStream?: NoteStreamPublisher;
	};

export const notesDeleteParamDef = z.object({
	noteId: misskeyId(),
});

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
		const rendered = await renderNoteDeleteOrUndoAnnounceActivity(deps, note, user);
		const activity = renderOnce(() => rendered);
		(async () => {
			const directRecipients = await resolveMentionedAndInvolvedRemoteUsers(deps, note);
			await deliverNoteActivity(deps, user, activity, {
				directRecipients,
				deliverToFollowers: true,
			});

			void deliverToRelays(deps, { id: user.id, host: null }, activity).catch(() => {});
		})().catch(() => {});
	}

	void deps.chartWriters.notesChart.update(note, false);
	if (deps.meta.enableChartsForRemoteUser || user.host == null) {
		deps.chartWriters.perUserNotesChart.update(user, note, false);
	}

	if (deps.meta.enableStatsForFederatedInstances && user.host != null) {
		fetchOrRegisterInstance(deps, user.host)
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
	params: ApiParams<typeof notesDeleteParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/delete']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	if (!(await userIsModerator(deps, me)) && note.userId !== me.id) {
		throw errors.accessDenied();
	}

	const noteAuthor = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);

	await deleteNoteForApi(deps, noteAuthor, note, me);
}

export const notesUnrenoteParamDef = z.object({
	noteId: misskeyId(),
});

export async function handleApiNotesUnrenote(
	deps: ApiNotesDeleteDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesUnrenoteParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/unrenote']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const renotes = await listNotesByUserIdAndRenoteIdFromDatabase(deps.db, me.id, note.id);
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);

	await Promise.all(renotes.map((renote) => deleteNoteForApi(deps, user, renote)));
}
