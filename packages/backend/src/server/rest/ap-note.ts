/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promiseLimit } from '@/misc/promise-limit.js';
import type * as Redis from 'ioredis';
import { concat, toArray, unique } from '@/misc/prelude/array.js';
import { checkHttps } from '@/misc/check-https.js';
import { acquireApObjectLock } from '@/misc/distributed-lock.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { StatusError } from '@/misc/status-error.js';
import { isSafeUuidv7T } from '@/misc/id/uuidv7.js';
import {
	getApId,
	getApIds,
	getOneApHrefNullable,
	getOneApId,
	isMention,
	isQuestion,
	validPost,
	type ApObject,
	type IApMention,
	type IObject,
	type IPost,
} from '@/core/activitypub/type.js';
import { FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import { extractApHashtags } from '@/core/activitypub/models/tag.js';
import { fetchPollByNoteIdFromDatabase, fetchPollByNoteIdOrFailFromDatabase, incrementPollVoteInDatabase, updatePollVotesInDatabase } from '@/core/PollStore.js';
import { createPollVoteInDatabase, listPollVotesByNoteAndUserFromDatabase } from '@/core/PollVoteStore.js';
import { fetchNoteByUriFromDatabase } from '@/core/NoteStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createMfmService } from '@/core/MfmService.js';
import { createApMfmService } from '@/core/activitypub/ApMfmService.js';
import type { Config } from '@/config.js';
import type { IPoll } from '@/models/Poll.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import {
	extractDbHost,
	getNoteFromApIdForHonoApi,
	isFederationAllowedUri,
	isSelfHost,
	parseLocalApUri,
	resolveApObjectForHonoApi,
	type HonoApiApResolveDependencies,
} from './ap-resolve.js';
import {
	extractEmojisForHonoApi,
	fetchPersonForHonoApi,
	resolveImageForHonoApi,
	resolvePersonForHonoApi,
	type HonoApiApPersonDependencies,
} from './ap-person.js';
import { deliverQuestionUpdateForHonoApi } from './notes-ap.js';
import { createNoteForHonoApi, type CreateNoteData, type HonoApiNotesCreateDependencies } from './notes-create.js';
import type { HonoApiNoteStreamPublisher } from './events.js';

export type HonoApiApNoteDependencies = HonoApiApPersonDependencies & HonoApiApResolveDependencies & HonoApiNotesCreateDependencies & {
	redis: Redis.Redis;
	publishNoteStream?: HonoApiNoteStreamPublisher;
};

function validateNoteForHonoApi(x: IObject, uri: string, actor?: MiRemoteUser): Error | null {
	const expectHost = extractDbHost(uri);
	const apType = (x as { type?: string }).type;

	if (apType == null || !validPost.includes(apType)) {
		return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: invalid object type ${apType ?? 'undefined'}`);
	}

	if (x.id && extractDbHost(x.id) !== expectHost) {
		return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: id has different host. expected: ${expectHost}, actual: ${extractDbHost(x.id)}`);
	}

	const actualHost = x.attributedTo && extractDbHost(getOneApId(x.attributedTo as ApObject));
	if (x.attributedTo && actualHost !== expectHost) {
		return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: attributedTo has different host. expected: ${expectHost}, actual: ${actualHost}`);
	}

	if ((x as { published?: string }).published && !isSafeUuidv7T(new Date((x as { published: string }).published).valueOf())) {
		return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', 'invalid Note: published timestamp is malformed');
	}

	if (actor) {
		const attribution = x.attributedTo ? getOneApId(x.attributedTo as ApObject) : actor.uri;
		if (attribution !== actor.uri) {
			return new IdentifiableError('d450b8a9-48e4-4dab-ae36-f4db763fda7c', `invalid Note: attribution does not match the actor that send it. attribution: ${attribution}, actor: ${actor.uri}`);
		}
	}

	return null;
}

export async function parseAudienceForHonoApi(
	deps: HonoApiApNoteDependencies,
	actor: MiRemoteUser,
	to: ApObject | undefined,
	cc: ApObject | undefined,
	history: Set<string>,
): Promise<{ visibility: 'public' | 'home' | 'followers' | 'specified'; visibleUsers: MiUser[] }> {
	const isPublic = (id: string) => ['https://www.w3.org/ns/activitystreams#Public', 'as:Public', 'Public'].includes(id);
	const isFollowers = (id: string) => id === (actor.followersUri ?? `${actor.uri}/followers`);

	const group = (ids: string[]) => {
		const groups: { public: string[]; followers: string[]; other: string[] } = { public: [], followers: [], other: [] };
		for (const id of ids) {
			if (isPublic(id)) groups.public.push(id);
			else if (isFollowers(id)) groups.followers.push(id);
			else groups.other.push(id);
		}
		groups.other = unique(groups.other);
		return groups;
	};

	const toGroups = group(getApIds(to));
	const ccGroups = group(getApIds(cc));
	const others = unique(concat([toGroups.other, ccGroups.other]));

	const limit = promiseLimit<MiUser | null>(2);
	const mentionedUsers = (await Promise.all(
		others.map(id => limit(() => resolvePersonForHonoApi(deps, id, history).catch(() => null))),
	)).filter((x): x is MiUser => x != null);

	if (toGroups.public.length > 0) return { visibility: 'public', visibleUsers: [] };
	if (ccGroups.public.length > 0) return { visibility: 'home', visibleUsers: [] };
	if (toGroups.followers.length > 0 || ccGroups.followers.length > 0) return { visibility: 'followers', visibleUsers: [] };

	return { visibility: 'specified', visibleUsers: mentionedUsers };
}

function extractApMentionObjectsForHonoApi(tags: IObject | IObject[] | null | undefined): IApMention[] {
	if (tags == null) return [];
	return toArray(tags).filter(isMention);
}

async function extractApMentionsForHonoApi(deps: HonoApiApNoteDependencies, tags: IObject | IObject[] | null | undefined, history: Set<string>): Promise<MiUser[]> {
	const hrefs = unique(extractApMentionObjectsForHonoApi(tags).map(x => x.href));
	const limit = promiseLimit<MiUser | null>(2);
	return (await Promise.all(
		hrefs.map(href => href == null ? Promise.resolve(null) : limit(() => resolvePersonForHonoApi(deps, href, history).catch(() => null))),
	)).filter((x): x is MiUser => x != null);
}

async function extractPollFromQuestionForHonoApi(deps: HonoApiApNoteDependencies, source: string | IObject, history: Set<string>): Promise<IPoll> {
	const question = await resolveApObjectForHonoApi(deps, source, FetchAllowSoftFailMask.Strict, history);
	if (!isQuestion(question)) throw new Error('invalid type');

	const multiple = question.oneOf === undefined;
	if (multiple && question.anyOf === undefined) throw new Error('invalid question');

	const expiresAt = question.endTime ? new Date(question.endTime) : question.closed ? new Date(question.closed) : null;

	const choices = question[multiple ? 'anyOf' : 'oneOf']
		?.map((x: { name?: string }) => x.name)
		.filter((x: string | undefined): x is string => x != null)
		?? [];

	const votes = question[multiple ? 'anyOf' : 'oneOf']?.map((x: { replies?: { totalItems?: number }; _misskey_votes?: number }) => x.replies?.totalItems ?? x._misskey_votes ?? 0) ?? [];

	return { choices, votes, multiple, expiresAt };
}

/** ApQuestionService.updateQuestion 相当。投票数が変化していれば true を返す。 */
export async function updateQuestionFromApForHonoApi(
	deps: HonoApiApNoteDependencies,
	value: string | IObject,
	actor?: MiRemoteUser,
	history: Set<string> = new Set(),
): Promise<boolean> {
	const uri = typeof value === 'string' ? value : value.id;
	if (uri == null) throw new Error('uri is null');

	if (isSelfHost(deps.config, extractDbHost(uri))) throw new Error('uri points local');

	const note = await fetchNoteByUriFromDatabase(deps.db, uri);
	if (note == null) throw new Error('Question is not registered');

	const poll = await fetchPollByNoteIdFromDatabase(deps.db, note.id);
	if (poll == null) throw new Error('Question is not registered');

	const user = await fetchUserByIdFromDatabase(deps.db, poll.userId);
	if (user == null) throw new Error('Question is not registered');

	const question = await resolveApObjectForHonoApi(deps, value, FetchAllowSoftFailMask.Strict, history);
	if (!isQuestion(question)) throw new Error('object is not a Question');

	const attribution = question.attributedTo ? getOneApId(question.attributedTo as ApObject) : user.uri;
	const attributionMatchesExisting = attribution === user.uri;
	const actorMatchesAttribution = actor ? attribution === actor.uri : true;

	if (!attributionMatchesExisting || !actorMatchesAttribution) {
		throw new Error('Refusing to ingest update for poll by different user');
	}

	const apChoices = question.oneOf ?? question.anyOf;
	if (apChoices == null) throw new Error('invalid apChoices: ' + apChoices);

	let changed = false;

	for (const choice of poll.choices) {
		const oldCount = poll.votes[poll.choices.indexOf(choice)];
		const newCount = apChoices.filter(ap => ap.name === choice).at(0)?.replies?.totalItems;
		if (newCount == null || !(Number.isInteger(newCount) && newCount >= 0)) throw new Error('invalid newCount: ' + newCount);

		if (oldCount !== newCount) {
			changed = true;
			poll.votes[poll.choices.indexOf(choice)] = newCount;
		}
	}

	await updatePollVotesInDatabase(deps.db, note.id, poll.votes);

	return changed;
}

/** PollService.vote (AP由来の投票受信) 相当。配送は呼び出し元で deliverQuestionUpdateForHonoApi を使う。 */
async function voteFromApForHonoApi(deps: HonoApiApNoteDependencies, actor: { id: MiUser['id'] }, note: MiNote, choice: number): Promise<void> {
	const poll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, note.id);
	if (poll.choices[choice] == null) throw new Error('invalid choice param');

	const exist = await listPollVotesByNoteAndUserFromDatabase(deps.db, note.id, actor.id);
	if (poll.multiple) {
		if (exist.some(x => x.choice === choice)) throw new Error('already voted');
	} else if (exist.length !== 0) {
		throw new Error('already voted');
	}

	await createPollVoteInDatabase(deps.db, {
		id: genId(),
		noteId: note.id,
		userId: actor.id,
		choice,
	});

	await incrementPollVoteInDatabase(deps.db, poll.noteId, choice);

	deps.publishNoteStream?.(note, 'pollVoted', { choice, userId: actor.id });
}

/**
 * ApNoteService.createNote 相当。
 *
 * 意図的な簡略化: なし (禁止ワードチェックの実行順序のみ、投稿者解決の前に行う原文と異なり
 * 本移植では actor 解決後に行う — createNoteForHonoApi 内で必ずチェックされるため結果は同じだが、
 * リソース消費(無駄な resolvePerson 呼び出し)の観点でのみ原文と異なる)。
 */
export async function createNoteFromApForHonoApi(
	deps: HonoApiApNoteDependencies,
	value: string | IObject,
	actor: MiRemoteUser | undefined,
	history: Set<string> = new Set(),
	silent = false,
): Promise<MiNote | null> {
	const object = await resolveApObjectForHonoApi(deps, value, FetchAllowSoftFailMask.Strict, history);

	const entryUri = getApId(value);
	const err = validateNoteForHonoApi(object, entryUri, actor);
	if (err) throw err;

	const note = object as IPost;

	if (note.id == null) throw new Error('Refusing to create note without id');
	if (!checkHttps(note.id)) throw new Error('unexpected schema of note.id: ' + note.id);

	const url = getOneApHrefNullable(note.url);
	if (url && !checkHttps(url)) throw new Error('unexpected schema of note url: ' + url);

	if (note.attributedTo == null) throw new Error('invalid note.attributedTo: ' + note.attributedTo);
	const uri = getOneApId(note.attributedTo as ApObject);

	actor ??= await fetchPersonForHonoApi(deps, uri) as MiRemoteUser | undefined;
	if (actor && actor.isSuspended) {
		throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', 'actor has been suspended');
	}

	const apMentionRawCount = new Set(extractApMentionObjectsForHonoApi(note.tag).map(x => x.href)).size;
	const apMentions = await extractApMentionsForHonoApi(deps, note.tag, history);
	const apHashtags = extractApHashtags(note.tag);

	const cw = note.summary === '' ? null : note.summary ?? null;

	let text: string | null = null;
	if (note.source?.mediaType === 'text/x.misskeymarkdown' && typeof note.source.content === 'string') {
		text = note.source.content;
	} else if (typeof note._misskey_content !== 'undefined') {
		text = note._misskey_content as string;
	} else if (typeof note.content === 'string') {
		text = createApMfmService(createMfmService(deps.config as Config)).htmlToMfm(note.content, note.tag);
	}

	const poll = await extractPollFromQuestionForHonoApi(deps, note, history).catch(() => undefined);

	actor ??= await resolvePersonForHonoApi(deps, uri, history) as MiRemoteUser;

	if (actor.isSuspended) {
		throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', 'actor has been suspended');
	}

	const noteAudience = await parseAudienceForHonoApi(deps, actor, note.to as ApObject | undefined, note.cc as ApObject | undefined, history);
	let visibility = noteAudience.visibility;
	const visibleUsers = noteAudience.visibleUsers;

	if (visibility === 'specified' && visibleUsers.length === 0) {
		if (typeof value === 'string') {
			visibility = 'public';
		}
	}

	const attachments = toArray(note.attachment);
	for (const attach of attachments) {
		(attach as { sensitive?: boolean }).sensitive ??= (note as { sensitive?: boolean }).sensitive;
	}
	const resolvedFiles = await Promise.all(attachments.map(attach => resolveImageForHonoApi(deps, actor, attach)));
	const files = resolvedFiles.filter(file => file != null);

	const reply = note.inReplyTo
		? await resolveNoteForHonoApi(deps, note.inReplyTo as string | IObject, { resolver: history }).then(x => {
			if (x == null) throw new Error('inReplyTo not found');
			return x;
		})
		: null;

	let quote: MiNote | undefined | null = null;
	const quoteUri = (note as { _misskey_quote?: string; quoteUrl?: string })._misskey_quote ?? (note as { quoteUrl?: string }).quoteUrl;
	if (quoteUri) {
		const tryResolveNote = async (u: string): Promise<{ status: 'ok'; res: MiNote } | { status: 'permerror' | 'temperror' }> => {
			if (!/^https?:/.test(u)) return { status: 'permerror' };
			try {
				const res = await resolveNoteForHonoApi(deps, u);
				if (res == null) return { status: 'permerror' };
				return { status: 'ok', res };
			} catch (e) {
				return { status: (e instanceof StatusError && !e.isRetryable) ? 'permerror' : 'temperror' };
			}
		};

		const uris = unique([(note as { _misskey_quote?: string })._misskey_quote, (note as { quoteUrl?: string }).quoteUrl].filter((x): x is string => x != null));
		const results = await Promise.all(uris.map(tryResolveNote));
		quote = results.filter((x): x is { status: 'ok'; res: MiNote } => x.status === 'ok').map(x => x.res).at(0);
		if (!quote && results.some(x => x.status === 'temperror')) {
			throw new Error('quote resolve failed');
		}
	}

	if (reply && reply.hasPoll) {
		const replyPoll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, reply.id);
		if (note.name) {
			const index = replyPoll.choices.findIndex(x => x === note.name);
			if (replyPoll.expiresAt && Date.now() > new Date(replyPoll.expiresAt).getTime()) {
				return null;
			} else if (index >= 0) {
				await voteFromApForHonoApi(deps, actor, reply, index);
				void deliverQuestionUpdateForHonoApi(deps, reply.id).catch(() => {});
			}
			return null;
		}
	}

	const emojis = await extractEmojisForHonoApi(deps, note.tag ?? [], actor.host ?? '').catch(() => []);
	const apEmojis = emojis.map(emoji => emoji.name);

	const data: CreateNoteData = {
		createdAt: note.published ? new Date(note.published) : null,
		files,
		reply,
		renote: quote ?? null,
		name: note.name,
		cw,
		text,
		localOnly: false,
		reactionAcceptance: null,
		visibility,
		visibleUsers,
		channel: null,
		apMentions,
		apMentionRawCount,
		apHashtags,
		apEmojis,
		poll: poll ?? null,
		uri: note.id,
		url: url ?? null,
	};

	try {
		return await createNoteForHonoApi(deps, actor, data, silent);
	} catch (err) {
		if (err instanceof Error && err.name === 'duplicated') {
			const duplicate = await getNoteFromApIdForHonoApi(deps, value);
			if (!duplicate) throw new Error('The note creation failed with duplication error even when there is no duplication', { cause: err });
			return duplicate;
		}
		throw err;
	}
}

export async function resolveNoteForHonoApi(
	deps: HonoApiApNoteDependencies,
	value: string | IObject,
	options: { sentFrom?: URL; resolver?: Set<string> } = {},
): Promise<MiNote | null> {
	const uri = getApId(value);

	if (!isFederationAllowedUri(deps.config, deps.meta, uri)) {
		throw new StatusError('blocked host', 451);
	}

	const unlock = await acquireApObjectLock(deps.redis, uri);
	try {
		const exist = await getNoteFromApIdForHonoApi(deps, uri);
		if (exist) return exist;

		if (parseLocalApUri(deps.config, uri).local) {
			throw new StatusError('cannot resolve local note', 400, 'cannot resolve local note');
		}

		const createFrom = options.sentFrom?.origin === new URL(uri).origin ? value : uri;
		return await createNoteFromApForHonoApi(deps, createFrom, undefined, options.resolver ?? new Set(), true);
	} finally {
		await unlock();
	}
}
