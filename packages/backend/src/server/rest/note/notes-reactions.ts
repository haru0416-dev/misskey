/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as notesContracts } from '@/server/rest/contracts/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { Packed } from '@/misc/json-schema.js';
import { toPuny } from '@/misc/to-puny.js';
import { z } from 'zod';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import { blockingExistsInDatabase } from '@/core/user/blocking-store.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/emoji/emoji-store.js';
import {
	fetchNoteByIdFromDatabase,
	decrementNoteReactionInDatabase,
	incrementNoteReactionInDatabase,
} from '@/core/note/note-store.js';
import {
	createNoteReactionInDatabase,
	deleteNoteReactionByIdFromDatabase,
	fetchNoteReactionByUserAndNoteFromDatabase,
	fetchNoteReactionByUserAndNoteOrFailFromDatabase,
	listNoteReactionsByNoteIdFromDatabase,
} from '@/core/note/note-reaction-store.js';
import { listUsersByIdsFromDatabase } from '@/core/user/user-store.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import {
	addActivityContext,
	deliverNoteActivity,
	renderLike,
	renderOnce,
	renderUndoActivity,
	resolveRemoteRecipient,
} from '../../../core/activitypub/notes-ap.js';
import type { NoteApDependencies } from '../../../core/activitypub/notes-ap.js';
import { createNoteNotification } from '@/core/note/note-creation-service.js';
import { isNoteContentVisibleForMe } from './note.js';
import type { NoteDependencies } from '../../../core/note/note-packing.js';
import { packUserLiteMany } from '../../../core/user/user-packing.js';
import type { NotificationDependencies } from '../../../core/notification/notification.js';
import { fetchUserRoles } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import type { NoteStreamPublisher } from '../../../core/events.js';
import type { ChartWriters } from '@/core/chart/chart-runtime.js';
import { parseApiParams } from '../validation.js';
import type { Params } from '../validation.js';
import { resolveApiDateIdPagination } from '../date-id-pagination.js';
import {
	FEATURED_NOTE_ENGAGEMENT_SAMPLE_RATE,
	recordFeaturedNoteEngagement,
} from '@/core/featured/featured-ranking.js';

export type NotesReactionsDependencies = NoteApDependencies &
	NoteDependencies &
	RolePolicyDependencies &
	NotificationDependencies & {
		chartWriters: ChartWriters;
		publishNoteStream?: NoteStreamPublisher;
	};

const FALLBACK = '❤';

const legacies: Record<string, string> = {
	like: '👍',
	love: '❤',
	laugh: '😆',
	hmm: '🤔',
	surprise: '😮',
	congrats: '🎉',
	angry: '💢',
	confused: '😥',
	rip: '😇',
	pudding: '🍮',
	star: '⭐',
};

const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;
const decodeCustomEmojiRegexp = /^:([\w+-]+)(?:@([\w.-]+))?:$/;

/** Unicode 絵文字とレガシー名を、保存できる 1 つの絵文字へ寄せる。該当しなければフォールバック。 */
export function normalizeReaction(reaction: string | null): string {
	if (reaction == null) {
		return FALLBACK;
	}
	if (Object.hasOwn(legacies, reaction)) {
		return legacies[reaction]!;
	}

	const match = emojiRegex.exec(reaction);
	if (match) {
		const unicode = match[0];
		return unicode.match('\u200D') ? unicode : unicode.replaceAll('️', '');
	}

	return FALLBACK;
}

export function decodeReaction(str: string): { reaction: string; name?: string; host?: string | null } {
	const custom = str.match(decodeCustomEmojiRegexp);
	if (custom) {
		const name = custom[1]!;
		const host = custom[2] ?? null;
		return { reaction: `:${name}@${host ?? '.'}:`, name, host };
	}
	return { reaction: str };
}

export async function createNoteReaction(
	deps: NotesReactionsDependencies,
	user: MiUser,
	note: MiNote,
	requestedReaction: string | null | undefined,
): Promise<void> {
	if (note.userId !== user.id) {
		const blocked = await blockingExistsInDatabase(deps.db, note.userId, user.id);
		if (blocked) {
			throw new IdentifiableError('e70412a4-7197-4726-8e74-f3e0deb92aa7');
		}
	}

	if (!(await isNoteContentVisibleForMe(deps, note, user.id))) {
		throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
	}

	if (isRenote(note) && !isQuote(note)) {
		throw new IdentifiableError('12c35529-3c79-4327-b1cc-e2cf63a71925', 'You cannot react to Renote.');
	}

	let reaction = requestedReaction ?? FALLBACK;

	if (
		note.reactionAcceptance === 'likeOnly' ||
		((note.reactionAcceptance === 'likeOnlyForRemote' ||
			note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote') &&
			user.host != null)
	) {
		reaction = '❤';
	} else if (requestedReaction != null) {
		const custom = reaction.match(isCustomEmojiRegexp);
		if (custom) {
			const reacterHost = user.host != null ? toPuny(user.host) : null;
			const name = custom[1]!;
			const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, reacterHost);

			if (emoji) {
				const roles =
					emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length === 0 ? [] : await fetchUserRoles(deps, user);
				const allowed =
					emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length === 0 ||
					roles.some((r) => emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.includes(r.id));

				if (allowed) {
					reaction = reacterHost ? `:${name}@${reacterHost}:` : `:${name}:`;

					if (
						(note.reactionAcceptance === 'nonSensitiveOnly' ||
							note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote') &&
						emoji.isSensitive
					) {
						reaction = FALLBACK;
					}

					if (reacterHost != null && (deps.meta.mediaSilencedHosts ?? []).includes(reacterHost)) {
						reaction = FALLBACK;
					}
				} else {
					reaction = FALLBACK;
				}
			} else {
				reaction = FALLBACK;
			}
		} else {
			reaction = normalizeReaction(reaction);
		}
	}

	const record = {
		id: genId(),
		noteId: note.id,
		userId: user.id,
		reaction,
	};

	try {
		await deps.db.transaction(async (transaction) => {
			await createNoteReactionInDatabase(transaction as typeof deps.db, record);
			await incrementNoteReactionInDatabase(transaction as typeof deps.db, note.id, reaction, `${user.id}/${reaction}`);
		});
	} catch (err) {
		if (isDuplicateKeyValueDatabaseError(err)) {
			const exists = await fetchNoteReactionByUserAndNoteOrFailFromDatabase(deps.db, user.id, note.id);
			if (exists.reaction !== reaction) {
				await deleteNoteReaction(deps, user, note);
				await deps.db.transaction(async (transaction) => {
					await createNoteReactionInDatabase(transaction as typeof deps.db, record);
					await incrementNoteReactionInDatabase(
						transaction as typeof deps.db,
						note.id,
						reaction,
						`${user.id}/${reaction}`,
					);
				});
			} else {
				throw new IdentifiableError('51c42bb4-931a-456b-bff7-e5a8a70dd298');
			}
		} else {
			throw err;
		}
	}

	if (note.userId !== user.id && Math.random() < FEATURED_NOTE_ENGAGEMENT_SAMPLE_RATE) {
		void recordFeaturedNoteEngagement(deps.redis, note, 1).catch(() => {});
	}

	if (deps.meta.enableChartsForRemoteUser || user.host == null) {
		deps.chartWriters.perUserReactionsChart.update(user, note);
	}

	const decoded = decodeReaction(reaction);
	const customEmoji: MiEmoji | null =
		decoded.name == null
			? null
			: await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, decoded.name, decoded.host ?? null);

	deps.publishNoteStream?.(note, 'reacted', {
		reaction: decoded.reaction,
		emoji:
			customEmoji != null
				? {
						name: customEmoji.host ? `${customEmoji.name}@${customEmoji.host}` : `${customEmoji.name}@.`,
						url: customEmoji.publicUrl || customEmoji.originalUrl,
					}
				: null,
		userId: user.id,
	});

	if (note.userHost === null) {
		void createNoteNotification(deps, note.userId, user.id, 'reaction', { noteId: note.id, reaction });
	}

	if (user.host == null && !note.localOnly) {
		(async () => {
			const content = renderOnce(async () => addActivityContext(deps.config, await renderLike(deps, record, note)));

			const directRecipients: MiUser[] = [];
			if (note.userHost !== null) {
				const reactee = await resolveRemoteRecipient(deps, note.userId);
				if (reactee) {
					directRecipients.push(reactee);
				}
			}

			let deliverToFollowers = false;
			if (['public', 'home', 'followers'].includes(note.visibility)) {
				deliverToFollowers = true;
			} else if (note.visibility === 'specified') {
				const visibleUsers = await listUsersByIdsFromDatabase(deps.db, note.visibleUserIds, { includeSuspended: true });
				for (const u of visibleUsers.filter((u) => u.host != null)) {
					directRecipients.push(u);
				}
			}

			await deliverNoteActivity(deps, user, content, { directRecipients, deliverToFollowers });
		})().catch(() => {});
	}
}

export async function deleteNoteReaction(deps: NotesReactionsDependencies, user: MiUser, note: MiNote): Promise<void> {
	const exist = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, user.id, note.id);
	if (exist == null) {
		throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'not reacted');
	}

	await deps.db.transaction(async (transaction) => {
		const result = await deleteNoteReactionByIdFromDatabase(transaction as typeof deps.db, exist.id);
		if (result.affected !== 1) {
			throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'not reacted');
		}
		await decrementNoteReactionInDatabase(
			transaction as typeof deps.db,
			note.id,
			exist.reaction,
			`${user.id}/${exist.reaction}`,
		);
	});

	deps.publishNoteStream?.(note, 'unreacted', {
		reaction: decodeReaction(exist.reaction).reaction,
		userId: user.id,
	});

	if (user.host == null && !note.localOnly) {
		(async () => {
			const content = renderOnce(async () =>
				addActivityContext(deps.config, renderUndoActivity(deps.config, await renderLike(deps, exist, note), user)),
			);

			const directRecipients: MiUser[] = [];
			if (note.userHost !== null) {
				const reactee = await resolveRemoteRecipient(deps, note.userId);
				if (reactee) {
					directRecipients.push(reactee);
				}
			}

			await deliverNoteActivity(deps, user, content, { directRecipients, deliverToFollowers: true });
		})().catch(() => {});
	}
}

export const reactionsCreateParamDef = z.object({
	noteId: misskeyId(),
	reaction: z.string(),
});

export async function handleApiNotesReactionsCreate(
	deps: NotesReactionsDependencies,
	me: MiLocalUser,
	params: Params<typeof reactionsCreateParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/reactions/create']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	try {
		await createNoteReaction(deps, me, note, params.reaction);
	} catch (err) {
		if (err instanceof IdentifiableError) {
			if (err.id === '51c42bb4-931a-456b-bff7-e5a8a70dd298') {
				throw errors.alreadyReacted();
			}
			if (err.id === 'e70412a4-7197-4726-8e74-f3e0deb92aa7') {
				throw errors.youHaveBeenBlocked();
			}
			if (err.id === '12c35529-3c79-4327-b1cc-e2cf63a71925') {
				throw errors.cannotReactToRenote();
			}
			if (err.id === '68e9d2d1-48bf-42c2-b90a-b20e09fd3d48') {
				throw errors.noSuchNote();
			}
		}
		throw err;
	}
}

export const reactionsDeleteParamDef = z.object({
	noteId: misskeyId(),
});

export async function handleApiNotesReactionsDelete(
	deps: NotesReactionsDependencies,
	me: MiLocalUser,
	params: Params<typeof reactionsDeleteParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/reactions/delete']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	try {
		await deleteNoteReaction(deps, me, note);
	} catch (err) {
		if (err instanceof IdentifiableError && err.id === '60527ec9-b4cb-4a88-a6bd-32d3ad26817d') {
			throw errors.notReacted();
		}
		throw err;
	}
}

export const notesReactionsParamDef = z.object({
	noteId: misskeyId(),
	type: z.string().nullable().optional(),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export async function handleApiNotesReactions(
	deps: NotesReactionsDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: Params<typeof notesReactionsParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/reactions']>,
): Promise<{ id: string; createdAt: string; user: Packed<'UserLite'>; type: string }[]> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null || !(await isNoteContentVisibleForMe(deps, note, me?.id ?? null))) {
		throw errors.noSuchNote();
	}

	let type: string | null = null;
	if (params.type) {
		const suffix = '@.:';
		type = params.type.endsWith(suffix) ? params.type.slice(0, params.type.length - suffix.length) + ':' : params.type;
	}

	const { sinceId, untilId, order } = resolveApiDateIdPagination(params);

	const reactions = await listNoteReactionsByNoteIdFromDatabase(deps.db, params.noteId, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
		type,
	});

	const packedUsers = await packUserLiteMany(
		deps,
		reactions.map((r) => r.userId),
	);
	const userMap = new Map(packedUsers.map((u) => [u.id, u]));

	// 一覧の取得と利用者の取得の間に消えた利用者のリアクションは、仕様上必須の user を欠いたまま返さず除く。
	return reactions.flatMap((r) => {
		const user = userMap.get(r.userId);
		return user == null
			? []
			: [
					{
						id: r.id,
						createdAt: parseId(r.id).date.toISOString(),
						user,
						type: decodeReaction(r.reaction).reaction,
					},
				];
	});
}
