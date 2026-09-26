/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import type { endpointMetas as usersContracts } from '@/server/api/metas/users.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/user/BlockingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/user/MutingStore.js';
import { listVisibleNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import { listNoteReactionsByUserIdFromDatabase } from '@/core/note/NoteReactionStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { NoteReactionRow } from '@/db/schema/note-reaction.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { decodeReactionForApi } from '../note/notes-reactions.js';
import { packNoteForApi, packNoteManyForApi } from '../note/note.js';
import type { ApiNoteDependencies } from '../note/note.js';
import { packUserLiteManyForApi } from './user.js';
import { ApiError } from '../error.js';
import { isApiModerator } from '../role/role-policy.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type ApiUserReactionsDependencies = ApiNoteDependencies & ApiRolePolicyDependencies;

export const usersReactionsParamDef = z.object({
	userId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

async function packNoteReactionWithNoteForApi(
	deps: ApiUserReactionsDependencies,
	reaction: NoteReactionRow & { note: MiNote },
	me: { id: MiUser['id'] } | null | undefined,
	packedUser: Packed<'UserLite'>,
	packedNote?: Awaited<ReturnType<typeof packNoteForApi>>,
): Promise<Packed<'NoteReactionWithNote'>> {
	return {
		id: reaction.id,
		createdAt: parseId(reaction.id).date.toISOString(),
		user: packedUser,
		type: decodeReactionForApi(reaction.reaction).reaction,
		note: packedNote ?? (await packNoteForApi(deps, reaction.note, me)),
	};
}

export async function handleApiUsersReactions(
	deps: ApiUserReactionsDependencies,
	me: MiUser | null | undefined,
	params: ApiParams<typeof usersReactionsParamDef>,
	errors: ContractErrors<(typeof usersContracts)['users/reactions']>,
) {
	const userIdsWhoBlockingMe = me
		? new Set(await listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id))
		: new Set<string>();
	const iAmModerator = me ? await isApiModerator(deps, me) : false;

	if (!iAmModerator) {
		const user = await fetchUserByIdOrFailFromDatabase(deps.db, params.userId);
		if (user.host != null) {
			throw errors.isRemoteUser();
		}

		const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, params.userId);
		if ((me == null || me.id !== params.userId) && !profile.publicReactions) {
			throw errors.reactionsNotPublic();
		}

		if (userIdsWhoBlockingMe.has(params.userId)) {
			return [];
		}
	}

	const userIdsWhoMeMuting = me ? new Set(await listMuteeIdsByMuterIdFromDatabase(deps.db, me.id)) : new Set<string>();

	const pagination = resolveDateIdPagination({ gen: genId }, params);
	let sinceId = pagination.sinceId;
	let untilId = pagination.untilId;

	const collected: (NoteReactionRow & { note: MiNote })[] = [];

	const maxPages = 20;
	for (let page_ = 0; page_ < maxPages; page_++) {
		const page = await listNoteReactionsByUserIdFromDatabase(deps.db, params.userId, {
			limit: params.limit,
			order: pagination.order,
			sinceId,
			untilId,
		});

		if (page.length === 0) {
			break;
		}

		if (pagination.order === 'asc') {
			sinceId = page[page.length - 1]!.id;
		} else {
			untilId = page[page.length - 1]!.id;
		}

		const noteIds = page.map((reaction) => reaction.noteId);
		const notes = await listVisibleNotesByIdsFromDatabase(deps.db, noteIds, {
			me: me ?? null,
			blockedHosts: deps.meta.blockedHosts,
		});
		const noteMap = new Map(notes.map((note) => [note.id, note]));

		for (const reaction of page) {
			if (collected.length >= params.limit) {
				break;
			}

			const note = noteMap.get(reaction.noteId);
			if (note == null) {
				continue;
			}

			if (note.userId !== params.userId) {
				if (me && isUserRelated(note, userIdsWhoBlockingMe)) {
					continue;
				}
				if (me && isUserRelated(note, userIdsWhoMeMuting)) {
					continue;
				}
			}

			collected.push({ ...reaction, note });
		}

		if (collected.length >= params.limit) {
			break;
		}
		if (page.length < params.limit) {
			break;
		}
	}

	const userIds = [...new Set(collected.map((r) => r.userId))];
	const packedUsers = await packUserLiteManyForApi(deps, userIds);
	const userMap = new Map(packedUsers.map((u) => [u.id, u]));
	const packedNotes = await packNoteManyForApi(
		deps,
		collected.map((reaction) => reaction.note),
		me,
	);

	// 取得の間に消えた利用者のリアクションは、仕様上必須の user を欠いたまま返さず除く。
	return await Promise.all(
		collected.flatMap((reaction, index) => {
			const user = userMap.get(reaction.userId);
			return user == null ? [] : [packNoteReactionWithNoteForApi(deps, reaction, me, user, packedNotes[index])];
		}),
	);
}
