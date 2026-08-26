/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
import { HonoApiError } from './error.js';
import { isVisibleForMeForHonoApi, type HonoApiNoteDependencies } from './note.js';
import {
	addActivityContext,
	deliverQuestionUpdateForHonoApi,
	deliverSingleActivityForHonoApi,
	renderVoteForHonoApi,
	type HonoApiNoteApDependencies,
	type HonoApiRelayDeliverDependencies,
} from './notes-ap.js';
import type { HonoApiNoteStreamPublisher } from './events.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiNotesPollsVoteDependencies = HonoApiRelayDeliverDependencies &
	HonoApiNoteDependencies & {
		config: HonoApiNoteApDependencies['config'];
		publishNoteStream?: HonoApiNoteStreamPublisher;
	};

function pollsVoteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'ecafbd2e-c283-4d6d-aecb-1a0a33b75396',
	});
}
function pollsVoteNoPollError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'The note does not attach a poll.',
		code: 'NO_POLL',
		id: '5f979967-52d9-4314-a911-1c673727f92f',
	});
}
function pollsVoteInvalidChoiceError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Choice ID is invalid.',
		code: 'INVALID_CHOICE',
		id: 'e0cc9a04-f2e8-41e4-a5f1-4127293260cc',
	});
}
function pollsVoteAlreadyVotedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You have already voted.',
		code: 'ALREADY_VOTED',
		id: '0963fc77-efac-419b-9424-b391608dc6d8',
	});
}
function pollsVoteAlreadyExpiredError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'The poll is already expired.',
		code: 'ALREADY_EXPIRED',
		id: '1022a357-b085-4054-9083-8f8de358337e',
	});
}
function pollsVoteYouHaveBeenBlockedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You cannot vote this poll because you have been blocked by this user.',
		code: 'YOU_HAVE_BEEN_BLOCKED',
		id: '85a5377e-b1e9-4617-b0b9-5bea73331e49',
	});
}

export const notesPollsVoteParamDef = z.object({
	noteId: misskeyId(),
	choice: z.number().int(),
});

type NotesPollsVoteParams = {
	noteId: string;
	choice: number;
};

export async function handleHonoApiNotesPollsVote(
	deps: HonoApiNotesPollsVoteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(notesPollsVoteParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw pollsVoteNoSuchNoteError();
	if (!(await isVisibleForMeForHonoApi(deps, note, me.id))) throw pollsVoteNoSuchNoteError();

	if (!note.hasPoll) throw pollsVoteNoPollError();

	if (note.userId !== me.id) {
		const blocked = await blockingExistsInDatabase(deps.db, note.userId, me.id);
		if (blocked) throw pollsVoteYouHaveBeenBlockedError();
	}

	const { vote, poll } = await deps.db.transaction(async (transaction) => {
		await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${note.id}), hashtext(${me.id}))`);
		const poll = await fetchPollByNoteIdOrFailFromDatabase(transaction as typeof deps.db, note.id);
		const createdAt = new Date();
		if (poll.expiresAt && poll.expiresAt < createdAt) throw pollsVoteAlreadyExpiredError();
		if (poll.choices[params.choice] == null) throw pollsVoteInvalidChoiceError();

		const exist = await listPollVotesByNoteAndUserFromDatabase(transaction as typeof deps.db, note.id, me.id);
		if (exist.length > 0 && (!poll.multiple || exist.some((x) => x.choice === params.choice))) {
			throw pollsVoteAlreadyVotedError();
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
				renderVoteForHonoApi(deps.config, me, vote, note, poll, { uri: pollOwner.uri }),
			);
			await deliverSingleActivityForHonoApi(deps, me, activity, pollOwner.inbox);
		}
	}

	void deliverQuestionUpdateForHonoApi(deps, note.id).catch(() => {});
}
