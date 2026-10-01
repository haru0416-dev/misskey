/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as notesContracts } from '@/server/rest/contracts/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import { fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { fetchPollByNoteIdOrFailFromDatabase, incrementPollVoteInDatabase } from '@/core/note/PollStore.js';
import { createPollVoteInDatabase, listPollVotesByNoteAndUserFromDatabase } from '@/core/note/PollVoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { isNoteContentVisibleForMeForApi } from './note.js';
import type { NoteDependencies } from '../../../core/note/note-packing.js';
import {
	addActivityContext,
	deliverQuestionUpdate,
	deliverSingleActivity,
	renderVote,
} from '../../../core/activitypub/notes-ap.js';
import type { NoteApDependencies, RelayDeliverDependencies } from '../../../core/activitypub/notes-ap.js';
import type { NoteStreamPublisher } from '../../../core/events.js';
import { parseApiParams } from '../validation.js';
import type { ApiParams } from '../validation.js';

export type ApiNotesPollsVoteDependencies = RelayDeliverDependencies &
	NoteDependencies & {
		config: NoteApDependencies['config'];
		publishNoteStream?: NoteStreamPublisher;
	};

export const notesPollsVoteParamDef = z.object({
	noteId: misskeyId(),
	choice: z.int(),
});

export async function handleApiNotesPollsVote(
	deps: ApiNotesPollsVoteDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesPollsVoteParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/polls/vote']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}
	if (!(await isNoteContentVisibleForMeForApi(deps, note, me.id))) {
		throw errors.noSuchNote();
	}

	if (!note.hasPoll) {
		throw errors.noPoll();
	}

	if (note.userId !== me.id) {
		const blocked = await blockingExistsInDatabase(deps.db, note.userId, me.id);
		if (blocked) {
			throw errors.youHaveBeenBlocked();
		}
	}

	const { vote, poll } = await deps.db.transaction(async (transaction) => {
		await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${note.id}), hashtext(${me.id}))`);
		const poll = await fetchPollByNoteIdOrFailFromDatabase(transaction as typeof deps.db, note.id);
		const createdAt = new Date();
		if (poll.expiresAt && poll.expiresAt < createdAt) {
			throw errors.alreadyExpired();
		}
		if (poll.choices[params.choice] == null) {
			throw errors.invalidChoice();
		}

		const exist = await listPollVotesByNoteAndUserFromDatabase(transaction as typeof deps.db, note.id, me.id);
		if (exist.length > 0 && (!poll.multiple || exist.some((x) => x.choice === params.choice))) {
			throw errors.alreadyVoted();
		}

		const createdVote = await createPollVoteInDatabase(transaction as typeof deps.db, {
			id: genId(createdAt.getTime()),
			noteId: note.id,
			userId: me.id,
			choice: params.choice,
		});
		await incrementPollVoteInDatabase(transaction as typeof deps.db, poll.noteId, params.choice);
		return { vote: createdVote, poll };
	});

	deps.publishNoteStream?.(note, 'pollVoted', {
		choice: params.choice,
		userId: me.id,
	});

	if (note.userHost != null) {
		const pollOwner = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);
		if (pollOwner.inbox != null && pollOwner.uri != null) {
			const activity = addActivityContext(
				deps.config,
				renderVote(deps.config, me, vote, note, poll, { uri: pollOwner.uri }),
			);
			await deliverSingleActivity(deps, me, activity, pollOwner.inbox);
		}
	}

	void deliverQuestionUpdate(deps, note.id).catch(() => {});
}
