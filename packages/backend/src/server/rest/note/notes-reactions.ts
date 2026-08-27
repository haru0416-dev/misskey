/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { SECOND, HOUR } from '@/const.js';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { misskeyId } from '@/misc/zod-params.js';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import { fetchEmojiByNameAndHostFromDatabaseCached } from '@/core/emoji/EmojiStore.js';
import {
	fetchNoteByIdFromDatabase,
	decrementNoteReactionInDatabase,
	incrementNoteReactionInDatabase,
} from '@/core/note/NoteStore.js';
import {
	createNoteReactionInDatabase,
	deleteNoteReactionByIdFromDatabase,
	fetchNoteReactionByUserAndNoteFromDatabase,
	fetchNoteReactionByUserAndNoteOrFailFromDatabase,
	listNoteReactionsByNoteIdFromDatabase,
} from '@/core/note/NoteReactionStore.js';
import { listUsersByIdsFromDatabase } from '@/core/user/UserStore.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from '../error.js';
import {
	addActivityContext,
	deliverNoteActivityForHonoApi,
	renderLikeForHonoApi,
	renderUndoForHonoApi,
	resolveRemoteRecipientForHonoApi,
	type HonoApiNoteApDependencies,
} from '../activitypub/notes-ap.js';
import { createNoteNotificationForHonoApi } from './notes-create.js';
import { isVisibleForMeForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { packUserLiteManyForHonoApi } from '../user/user.js';
import type { HonoApiNotificationDependencies } from '../notification/notification.js';
import { getHonoApiUserRoles, type HonoApiRolePolicyDependencies } from '../role/role-policy.js';
import type { HonoApiNoteStreamPublisher } from '../events.js';
import type { HonoChartWriters } from '@/server/chart-runtime.js';
import { parseHonoApiParams } from '../validation.js';

export type HonoApiNotesReactionsDependencies = HonoApiNoteApDependencies &
	HonoApiNoteDependencies &
	HonoApiRolePolicyDependencies &
	HonoApiNotificationDependencies & {
		chartWriters: HonoChartWriters;
		publishNoteStream?: HonoApiNoteStreamPublisher;
		redisForReactions: Redis.Redis;
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
export function normalizeReactionForHonoApi(reaction: string | null): string {
	if (reaction == null) return FALLBACK;
	if (Object.hasOwn(legacies, reaction)) return legacies[reaction]!;

	const match = emojiRegex.exec(reaction);
	if (match) {
		const unicode = match[0];
		return unicode.match('\u200d') ? unicode : unicode.replaceAll(/\ufe0f/g, '');
	}

	return FALLBACK;
}

export function decodeReactionForHonoApi(str: string): { reaction: string; name?: string; host?: string | null } {
	const custom = str.match(decodeCustomEmojiRegexp);
	if (custom) {
		const name = custom[1]!;
		const host = custom[2] ?? null;
		return { reaction: `:${name}@${host ?? '.'}:`, name, host };
	}
	return { reaction: str };
}

function reactionNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '033d0620-5bfe-4027-965d-980b0c85a3ea',
	});
}
function reactionsNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '263fff3d-d0e1-4af4-bea7-8408059b451a',
	});
}
function reactionAlreadyReactedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are already reacting to that note.',
		code: 'ALREADY_REACTED',
		id: '71efcf98-86d6-4e2b-b2ad-9d032369366b',
	});
}
function reactionYouHaveBeenBlockedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You cannot react this note because you have been blocked by this user.',
		code: 'YOU_HAVE_BEEN_BLOCKED',
		id: '20ef5475-9f38-4e4c-bd33-de6d979498ec',
	});
}
function reactionCannotReactToRenoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You cannot react to Renote.',
		code: 'CANNOT_REACT_TO_RENOTE',
		id: 'eaccdc08-ddef-43fe-908f-d108faad57f5',
	});
}
function unreactionNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '764d9fce-f9f2-4a0e-92b1-6ceac9a7ad37',
	});
}
function unreactionNotReactedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are not reacting to that note.',
		code: 'NOT_REACTED',
		id: '92f4426d-4196-4125-aa5b-02943e2ec8fc',
	});
}

export async function createNoteReactionForHonoApi(
	deps: HonoApiNotesReactionsDependencies,
	user: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	note: MiNote,
	requestedReaction: string | null | undefined,
): Promise<void> {
	if (note.userId !== user.id) {
		const blocked = await blockingExistsInDatabase(deps.db, note.userId, user.id);
		if (blocked) throw new IdentifiableError('e70412a4-7197-4726-8e74-f3e0deb92aa7');
	}

	if (!(await isVisibleForMeForHonoApi(deps, note, user.id))) {
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
			const reacterHost = user.host != null ? domainToASCII(user.host.toLowerCase()) : null;
			const name = custom[1]!;
			const emoji = await fetchEmojiByNameAndHostFromDatabaseCached(deps.db, name, reacterHost);

			if (emoji) {
				const roles =
					emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length === 0
						? []
						: await getHonoApiUserRoles(deps, user as MiUser);
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
			reaction = normalizeReactionForHonoApi(reaction);
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
				await deleteNoteReactionForHonoApi(deps, user, note);
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

	if (deps.meta.enableChartsForRemoteUser || user.host == null) {
		deps.chartWriters.perUserReactionsChart.update(user, note);
	}

	const decoded = decodeReactionForHonoApi(reaction);
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
		void createNoteNotificationForHonoApi(deps, note.userId, user.id, 'reaction', { noteId: note.id, reaction });
	}

	if (user.host == null && !note.localOnly) {
		(async () => {
			const activity = await renderLikeForHonoApi(deps, record, note);
			const content = addActivityContext(deps.config, activity);

			const directRecipients: MiUser[] = [];
			if (note.userHost !== null) {
				const reactee = await resolveRemoteRecipientForHonoApi(deps, note.userId);
				if (reactee) directRecipients.push(reactee);
			}

			let deliverToFollowers = false;
			if (['public', 'home', 'followers'].includes(note.visibility)) {
				deliverToFollowers = true;
			} else if (note.visibility === 'specified') {
				const visibleUsers = await listUsersByIdsFromDatabase(deps.db, note.visibleUserIds, { includeSuspended: true });
				for (const u of visibleUsers.filter((u) => u.host != null)) directRecipients.push(u);
			}

			await deliverNoteActivityForHonoApi(deps, user, content, { directRecipients, deliverToFollowers });
		})().catch(() => {});
	}
}

export async function deleteNoteReactionForHonoApi(
	deps: HonoApiNotesReactionsDependencies,
	user: { id: MiUser['id']; host: MiUser['host']; isBot: boolean },
	note: MiNote,
): Promise<void> {
	const exist = await fetchNoteReactionByUserAndNoteFromDatabase(deps.db, user.id, note.id);
	if (exist == null) throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'not reacted');

	await deps.db.transaction(async (transaction) => {
		const result = await deleteNoteReactionByIdFromDatabase(transaction as typeof deps.db, exist.id);
		if (result.affected !== 1) throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'not reacted');
		await decrementNoteReactionInDatabase(
			transaction as typeof deps.db,
			note.id,
			exist.reaction,
			`${user.id}/${exist.reaction}`,
		);
	});

	deps.publishNoteStream?.(note, 'unreacted', {
		reaction: decodeReactionForHonoApi(exist.reaction).reaction,
		userId: user.id,
	});

	if (user.host == null && !note.localOnly) {
		(async () => {
			const like = await renderLikeForHonoApi(deps, exist, note);
			const undo = renderUndoForHonoApi(deps.config, like, user);
			const content = addActivityContext(deps.config, undo);

			const directRecipients: MiUser[] = [];
			if (note.userHost !== null) {
				const reactee = await resolveRemoteRecipientForHonoApi(deps, note.userId);
				if (reactee) directRecipients.push(reactee);
			}

			await deliverNoteActivityForHonoApi(deps, user, content, { directRecipients, deliverToFollowers: true });
		})().catch(() => {});
	}
}

export const reactionsCreateParamDef = z.object({
	noteId: misskeyId(),
	reaction: z.string(),
});

type ReactionsCreateParams = {
	noteId: string;
	reaction: string;
};

export async function handleHonoApiNotesReactionsCreate(
	deps: HonoApiNotesReactionsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(reactionsCreateParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw reactionNoSuchNoteError();

	try {
		await createNoteReactionForHonoApi(deps, me, note, params.reaction);
	} catch (err) {
		if (err instanceof IdentifiableError) {
			if (err.id === '51c42bb4-931a-456b-bff7-e5a8a70dd298') throw reactionAlreadyReactedError();
			if (err.id === 'e70412a4-7197-4726-8e74-f3e0deb92aa7') throw reactionYouHaveBeenBlockedError();
			if (err.id === '12c35529-3c79-4327-b1cc-e2cf63a71925') throw reactionCannotReactToRenoteError();
		}
		throw err;
	}
}

export const reactionsDeleteParamDef = z.object({
	noteId: misskeyId(),
});

type ReactionsDeleteParams = {
	noteId: string;
};

export async function handleHonoApiNotesReactionsDelete(
	deps: HonoApiNotesReactionsDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(reactionsDeleteParamDef, body);

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw unreactionNoSuchNoteError();

	try {
		await deleteNoteReactionForHonoApi(deps, me, note);
	} catch (err) {
		if (err instanceof IdentifiableError && err.id === '60527ec9-b4cb-4a88-a6bd-32d3ad26817d') {
			throw unreactionNotReactedError();
		}
		throw err;
	}
}

export const reactionsDeleteRateLimit = {
	duration: HOUR,
	max: 60,
	minInterval: 3 * SECOND,
};

const notesReactionsIntegerQueryParams = new Set(['limit', 'sinceDate', 'untilDate']);

export function normalizeHonoApiNotesReactionsQuery(query: Record<string, string>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(query)) {
		if (notesReactionsIntegerQueryParams.has(key)) {
			const numeric = Number(value);
			body[key] = Number.isInteger(numeric) ? numeric : value;
		} else {
			body[key] = value;
		}
	}
	return body;
}

export const notesReactionsParamDef = z.object({
	noteId: misskeyId(),
	type: z.string().nullable().optional(),
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type NotesReactionsParams = {
	noteId: string;
	type?: string | null;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiNotesReactions(
	deps: HonoApiNotesReactionsDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Array<{ id: string; createdAt: string; user: unknown; type: string }>> {
	const params = parseHonoApiParams(notesReactionsParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null || !(await isVisibleForMeForHonoApi(deps, note, me?.id ?? null))) {
		throw reactionsNoSuchNoteError();
	}

	let type: string | null = null;
	if (params.type) {
		const suffix = '@.:';
		type = params.type.endsWith(suffix) ? params.type.slice(0, params.type.length - suffix.length) + ':' : params.type;
	}

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;
	let order: 'asc' | 'desc' = 'desc';
	if (sinceId && untilId) {
		order = 'desc';
	} else if (sinceId) {
		order = 'asc';
	} else if (untilId) {
		order = 'desc';
	} else if (params.sinceDate && params.untilDate) {
		sinceId = genId(params.sinceDate);
		untilId = genId(params.untilDate);
		order = 'desc';
	} else if (params.sinceDate) {
		sinceId = genId(params.sinceDate);
		order = 'asc';
	} else if (params.untilDate) {
		untilId = genId(params.untilDate);
		order = 'desc';
	}

	const reactions = await listNoteReactionsByNoteIdFromDatabase(deps.db, params.noteId, {
		limit: params.limit,
		order,
		sinceId,
		untilId,
		type,
	});

	const packedUsers = await packUserLiteManyForHonoApi(
		deps,
		reactions.map((r) => r.userId),
	);
	const userMap = new Map(packedUsers.map((u) => [u.id, u]));

	return reactions.map((r) => ({
		id: r.id,
		createdAt: parseId(r.id).date.toISOString(),
		user: userMap.get(r.userId),
		type: decodeReactionForHonoApi(r.reaction).reaction,
	}));
}
