/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { promiseLimit } from '@/misc/promise-limit.js';
import { omitUndefined } from '@/misc/clone.js';
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
} from '@/core/activitypub/type.js';
import type { ApObject, IApMention, IObject, IPost } from '@/core/activitypub/type.js';
import { resolveIncomingReply } from '@/core/activitypub/interop/reply.js';
import { FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import { extractApHashtags } from '@/core/activitypub/models/tag.js';
import {
	fetchPollByNoteIdFromDatabase,
	fetchPollByNoteIdOrFailFromDatabase,
	incrementPollVoteInDatabase,
	updatePollVotesInDatabase,
} from '@/core/note/PollStore.js';
import { createPollVoteInDatabase, listPollVotesByNoteAndUserFromDatabase } from '@/core/note/PollVoteStore.js';
import { fetchNoteByUriFromDatabase, updateRemoteNoteContentInDatabase } from '@/core/note/NoteStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createMfmService } from '@/core/mfm/MfmService.js';
import { createApMfmService } from '@/core/activitypub/ApMfmService.js';
import type { Config } from '@/config.js';
import type { IPoll } from '@/models/Poll.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiNote } from '@/models/Note.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import {
	extractDbHost,
	getNoteFromApIdForApi,
	isFederationAllowedUri,
	isSelfHost,
	parseLocalApUri,
	resolveApObjectForApi,
} from './ap-resolve.js';
import type { ApiApResolveDependencies } from './ap-resolve.js';
import { extractEmojisForApi, fetchPersonForApi, resolveImageForApi, resolvePersonForApi } from './ap-person.js';
import type { ApiApPersonDependencies } from './ap-person.js';
import { deliverQuestionUpdate } from '../../../core/activitypub/notes-ap.js';
import { createNote, prepareRemoteNoteEdit, updateHashtagsRankings } from '@/core/note/NoteCreationService.js';
import { recordHashtagUsagesInDatabase } from '@/core/hashtag/HashtagStore.js';
import { updateDriveFileInDatabase } from '@/core/drive/DriveFileStore.js';
import { isNoteContentVisibleForMeForApi } from '../note/note.js';
import type { CreateNoteData, NoteCreationDependencies } from '@/core/note/NoteCreationService.js';
import type { NoteStreamPublisher } from '../../../core/events.js';

export type ApiApNoteDependencies = ApiApPersonDependencies &
	ApiApResolveDependencies &
	NoteCreationDependencies & {
		redis: Redis.Redis;
		publishNoteStream?: NoteStreamPublisher;
	};

function validateNoteForApi(x: IObject, uri: string, actor?: MiRemoteUser): Error | null {
	const expectHost = extractDbHost(uri);
	const apType = (x as { type?: string }).type;

	if (apType == null || !validPost.includes(apType)) {
		return new IdentifiableError(
			'd450b8a9-48e4-4dab-ae36-f4db763fda7c',
			`invalid Note: invalid object type ${apType ?? 'undefined'}`,
		);
	}

	if (x.id && extractDbHost(x.id) !== expectHost) {
		return new IdentifiableError(
			'd450b8a9-48e4-4dab-ae36-f4db763fda7c',
			`invalid Note: id has different host. expected: ${expectHost}, actual: ${extractDbHost(x.id)}`,
		);
	}

	const actualHost = x.attributedTo && extractDbHost(getOneApId(x.attributedTo as ApObject));
	if (x.attributedTo && actualHost !== expectHost) {
		return new IdentifiableError(
			'd450b8a9-48e4-4dab-ae36-f4db763fda7c',
			`invalid Note: attributedTo has different host. expected: ${expectHost}, actual: ${actualHost}`,
		);
	}

	if (
		(x as { published?: string }).published &&
		!isSafeUuidv7T(new Date((x as { published: string }).published).valueOf())
	) {
		return new IdentifiableError(
			'd450b8a9-48e4-4dab-ae36-f4db763fda7c',
			'invalid Note: published timestamp is malformed',
		);
	}

	if (actor) {
		const attribution = x.attributedTo ? getOneApId(x.attributedTo as ApObject) : actor.uri;
		if (attribution !== actor.uri) {
			return new IdentifiableError(
				'd450b8a9-48e4-4dab-ae36-f4db763fda7c',
				`invalid Note: attribution does not match the actor that send it. attribution: ${attribution}, actor: ${actor.uri}`,
			);
		}
	}

	return null;
}

export async function parseAudienceForApi(
	deps: ApiApNoteDependencies,
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
			if (isPublic(id)) {
				groups.public.push(id);
			} else if (isFollowers(id)) {
				groups.followers.push(id);
			} else {
				groups.other.push(id);
			}
		}
		groups.other = unique(groups.other);
		return groups;
	};

	const toGroups = group(getApIds(to));
	const ccGroups = group(getApIds(cc));
	const others = unique(concat([toGroups.other, ccGroups.other]));

	const limit = promiseLimit<MiUser | null>(2);
	const mentionedUsers = (
		await Promise.all(others.map((id) => limit(() => resolvePersonForApi(deps, id, history).catch(() => null))))
	).filter((x): x is MiUser => x != null);

	if (toGroups.public.length > 0) {
		return { visibility: 'public', visibleUsers: [] };
	}
	if (ccGroups.public.length > 0) {
		return { visibility: 'home', visibleUsers: [] };
	}
	if (toGroups.followers.length > 0 || ccGroups.followers.length > 0) {
		return { visibility: 'followers', visibleUsers: [] };
	}

	return { visibility: 'specified', visibleUsers: mentionedUsers };
}

function extractApMentionObjectsForApi(tags: IObject | IObject[] | null | undefined): IApMention[] {
	if (tags == null) {
		return [];
	}
	return toArray(tags).filter(isMention);
}

async function extractApMentionsForApi(
	deps: ApiApNoteDependencies,
	tags: IObject | IObject[] | null | undefined,
	history: Set<string>,
): Promise<MiUser[]> {
	const hrefs = unique(extractApMentionObjectsForApi(tags).map((x) => x.href));
	const limit = promiseLimit<MiUser | null>(2);
	return (
		await Promise.all(
			hrefs.map((href) =>
				href == null ? Promise.resolve(null) : limit(() => resolvePersonForApi(deps, href, history).catch(() => null)),
			),
		)
	).filter((x): x is MiUser => x != null);
}

const MAX_REMOTE_POLL_CHOICES = 100;

async function extractPollFromQuestionForApi(
	deps: ApiApNoteDependencies,
	source: string | IObject,
	history: Set<string>,
): Promise<IPoll> {
	const question = await resolveApObjectForApi(deps, source, FetchAllowSoftFailMask.Strict, history);
	if (!isQuestion(question)) {
		throw new Error('invalid type');
	}

	const multiple = question.oneOf === undefined;
	if (multiple && question.anyOf === undefined) {
		throw new Error('invalid question');
	}

	const expiresAt = question.endTime ? new Date(question.endTime) : question.closed ? new Date(question.closed) : null;

	// 選択肢数はリモートが決める。ローカルの上限は 10 で主要な実装も数十まで。以降の処理が選択肢数に
	// 比例して重くなるので、先頭から MAX_REMOTE_POLL_CHOICES 個だけ取り込む。
	const options = (question[multiple ? 'anyOf' : 'oneOf'] ?? [])
		.filter((x: { name?: string }) => x.name != null)
		.slice(0, MAX_REMOTE_POLL_CHOICES);
	const choices = options.map((x: { name?: string }) => x.name!);
	const votes = options.map(
		(x: { replies?: { totalItems?: number }; _misskey_votes?: number }) =>
			x.replies?.totalItems ?? x._misskey_votes ?? 0,
	);

	return { choices, votes, multiple, expiresAt };
}

export async function updateQuestionFromApForApi(
	deps: ApiApNoteDependencies,
	value: string | IObject,
	actor?: MiRemoteUser,
	history = new Set<string>(),
): Promise<boolean> {
	const uri = typeof value === 'string' ? value : value.id;
	if (uri == null) {
		throw new Error('uri is null');
	}

	if (isSelfHost(deps.config, extractDbHost(uri))) {
		throw new Error('uri points local');
	}

	const note = await fetchNoteByUriFromDatabase(deps.db, uri);
	if (note == null) {
		throw new Error('Question is not registered');
	}

	const poll = await fetchPollByNoteIdFromDatabase(deps.db, note.id);
	if (poll == null) {
		throw new Error('Question is not registered');
	}

	const user = await fetchUserByIdFromDatabase(deps.db, poll.userId);
	if (user == null) {
		throw new Error('Question is not registered');
	}

	const question = await resolveApObjectForApi(deps, value, FetchAllowSoftFailMask.Strict, history);
	if (!isQuestion(question)) {
		throw new Error('object is not a Question');
	}

	const attribution = question.attributedTo ? getOneApId(question.attributedTo as ApObject) : user.uri;
	const attributionMatchesExisting = attribution === user.uri;
	const actorMatchesAttribution = actor ? attribution === actor.uri : true;

	if (!attributionMatchesExisting || !actorMatchesAttribution) {
		throw new Error('Refusing to ingest update for poll by different user');
	}

	const apChoices = question.oneOf ?? question.anyOf;
	if (apChoices == null) {
		throw new Error('invalid apChoices: ' + apChoices);
	}

	let changed = false;

	// 名前ごとの票数は 1 度だけ引けるようにする。選択肢ごとに find すると選択肢数の 2 乗
	// になる。同名があれば find と同じく先頭を使う。
	const countsByName = new Map<string, number | undefined>();
	for (const ap of apChoices) {
		if (ap.name != null && !countsByName.has(ap.name)) countsByName.set(ap.name, ap.replies?.totalItems);
	}

	// 選択肢テキストが重複していても正しい位置を更新できるよう、indexOf ではなく列挙位置を使う。
	for (const [index, choice] of poll.choices.entries()) {
		const oldCount = poll.votes[index];
		const newCount = countsByName.get(choice);
		if (newCount == null || !(Number.isInteger(newCount) && newCount >= 0)) {
			throw new Error('invalid newCount: ' + newCount);
		}

		if (oldCount !== newCount) {
			changed = true;
			poll.votes[index] = newCount;
		}
	}

	await updatePollVotesInDatabase(deps.db, note.id, poll.votes);

	return changed;
}

/**
 * AP由来の投票。配送は呼び出し元で行う。
 * REST の notes/polls/vote と同じく、ブロック・公開範囲を見てから、投票者とノートの組でロックして
 * 既存の票を読み直す。投票ノートの URI ごとの inbox ロックだけでは、別々の URI で同時に届いた
 * 単一選択の票が両方とも入る。
 */
export async function voteFromApForApi(
	deps: ApiApNoteDependencies,
	actor: MiUser,
	note: MiNote,
	choice: number,
): Promise<void> {
	if (note.userId !== actor.id && (await blockingExistsInDatabase(deps.db, note.userId, actor.id))) {
		throw new Error('blocked by the poll author');
	}
	if (!(await isNoteContentVisibleForMeForApi(deps, note, actor.id))) {
		throw new Error('poll is not visible to the voter');
	}

	await deps.db.transaction(async (transaction) => {
		const db = transaction as typeof deps.db;
		await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${note.id}), hashtext(${actor.id}))`);
		const poll = await fetchPollByNoteIdOrFailFromDatabase(db, note.id);
		if (poll.choices[choice] == null) {
			throw new Error('invalid choice param');
		}

		const exist = await listPollVotesByNoteAndUserFromDatabase(db, note.id, actor.id);
		if (poll.multiple) {
			if (exist.some((x) => x.choice === choice)) {
				throw new Error('already voted');
			}
		} else if (exist.length !== 0) {
			throw new Error('already voted');
		}

		await createPollVoteInDatabase(db, {
			id: genId(),
			noteId: note.id,
			userId: actor.id,
			choice,
		});

		await incrementPollVoteInDatabase(db, poll.noteId, choice);
	});

	deps.publishNoteStream?.(note, 'pollVoted', { choice, userId: actor.id });
}

/** ノートの本文を MFM で取り出す。Misskey 系の元の MFM があればそれを、無ければ HTML から変換する。 */
function extractNoteTextForApi(deps: ApiApNoteDependencies, note: IPost): string | null {
	if (note.source?.mediaType === 'text/x.misskeymarkdown' && typeof note.source.content === 'string') {
		return note.source.content;
	}
	if (note._misskey_content !== undefined) {
		return note._misskey_content;
	}
	if (typeof note.content === 'string') {
		return createApMfmService(createMfmService(deps.config as Config)).htmlToMfm(note.content, note.tag);
	}
	return null;
}

/** 添付を解決する。添付ごとの sensitive が無ければノートの sensitive を引き継ぐ。 */
async function resolveNoteAttachmentsForApi(
	deps: ApiApNoteDependencies,
	actor: MiRemoteUser,
	note: IPost,
	options: { declaredComments?: Map<MiDriveFile['id'], string | null> } = {},
): Promise<MiDriveFile[]> {
	const attachments = toArray(note.attachment);
	for (const attach of attachments) {
		const attachment = attach as { sensitive?: boolean };
		const sensitive = (note as { sensitive?: boolean }).sensitive;
		if (attachment.sensitive == null && sensitive !== undefined) {
			attachment.sensitive = sensitive;
		}
	}
	const resolvedFiles = await Promise.all(
		attachments.map((attach) => resolveImageForApi(deps, actor, attach, { useDeclaredMetadata: true, ...options })),
	);
	return resolvedFiles.filter((file) => file != null);
}

export async function createNoteFromApForApi(
	deps: ApiApNoteDependencies,
	value: string | IObject,
	actor: MiRemoteUser | undefined,
	history = new Set<string>(),
	silent = false,
): Promise<MiNote | null> {
	const object = await resolveApObjectForApi(deps, value, FetchAllowSoftFailMask.Strict, history);

	const entryUri = getApId(value);
	const err = validateNoteForApi(object, entryUri, actor);
	if (err) {
		throw err;
	}

	const note = object as IPost;

	if (note.id == null) {
		throw new Error('Refusing to create note without id');
	}
	if (!checkHttps(note.id)) {
		throw new Error('unexpected schema of note.id: ' + note.id);
	}

	const url = getOneApHrefNullable(note.url);
	if (url && !checkHttps(url)) {
		throw new Error('unexpected schema of note url: ' + url);
	}

	if (note.attributedTo == null) {
		throw new Error('invalid note.attributedTo: ' + note.attributedTo);
	}
	const uri = getOneApId(note.attributedTo as ApObject);

	actor ??= (await fetchPersonForApi(deps, uri)) as MiRemoteUser | undefined;
	if (actor?.isSuspended) {
		throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', 'actor has been suspended');
	}

	const apMentionRawCount = new Set(extractApMentionObjectsForApi(note.tag).map((x) => x.href)).size;
	const apMentions = await extractApMentionsForApi(deps, note.tag, history);
	const apHashtags = extractApHashtags(note.tag);

	const cw = note.summary === '' ? null : (note.summary ?? null);
	const text = extractNoteTextForApi(deps, note);

	const poll = await extractPollFromQuestionForApi(deps, note, history).catch(() => undefined);

	actor ??= (await resolvePersonForApi(deps, uri, history)) as MiRemoteUser;

	if (actor.isSuspended) {
		throw new IdentifiableError('85ab9bd7-3a41-4530-959d-f07073900109', 'actor has been suspended');
	}

	const noteAudience = await parseAudienceForApi(
		deps,
		actor,
		note.to as ApObject | undefined,
		note.cc as ApObject | undefined,
		history,
	);
	let visibility = noteAudience.visibility;
	const visibleUsers = noteAudience.visibleUsers;

	if (visibility === 'specified' && visibleUsers.length === 0) {
		if (typeof value === 'string') {
			visibility = 'public';
		}
	}

	const files = await resolveNoteAttachmentsForApi(deps, actor, note);

	const reply = await resolveIncomingReply(note.inReplyTo, (target) =>
		resolveNoteForApi(deps, target, {
			sentFrom: new URL(actor.uri),
			resolver: history,
		}),
	);

	let quote: MiNote | undefined | null = null;
	const quoteUri =
		(note as { _misskey_quote?: string; quoteUrl?: string })._misskey_quote ?? (note as { quoteUrl?: string }).quoteUrl;
	if (quoteUri) {
		const tryResolveNote = async (
			u: string,
		): Promise<{ status: 'ok'; res: MiNote } | { status: 'permerror' | 'temperror' }> => {
			if (!/^https?:/.test(u)) {
				return { status: 'permerror' };
			}
			try {
				const res = await resolveNoteForApi(deps, u);
				if (res == null) {
					return { status: 'permerror' };
				}
				return { status: 'ok', res };
			} catch (e) {
				return { status: e instanceof StatusError && !e.isRetryable ? 'permerror' : 'temperror' };
			}
		};

		const uris = unique(
			[(note as { _misskey_quote?: string })._misskey_quote, (note as { quoteUrl?: string }).quoteUrl].filter(
				(x): x is string => x != null,
			),
		);
		const results = await Promise.all(uris.map(tryResolveNote));
		quote = results
			.filter((x): x is { status: 'ok'; res: MiNote } => x.status === 'ok')
			.map((x) => x.res)
			.at(0);
		if (!quote && results.some((x) => x.status === 'temperror')) {
			throw new Error('quote resolve failed');
		}
	}

	if (reply?.hasPoll) {
		const replyPoll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, reply.id);
		if (note.name) {
			const index = replyPoll.choices.findIndex((x) => x === note.name);
			if (replyPoll.expiresAt && Date.now() > new Date(replyPoll.expiresAt).getTime()) {
				return null;
			} else if (index !== -1) {
				await voteFromApForApi(deps, actor, reply, index);
				void deliverQuestionUpdate(deps, reply.id).catch(() => {});
			}
			return null;
		}
	}

	const emojis = await extractEmojisForApi(deps, note.tag ?? [], actor.host ?? '').catch(() => []);
	const apEmojis = emojis.map((emoji) => emoji.name);

	const createdAt = note.published ? new Date(note.published) : null;
	// 編集していなくても published と同じ updated を付ける実装があるので、それより後のときだけ編集済みとする。
	const updatedAt = parseApUpdated(note);
	const data: CreateNoteData = omitUndefined({
		createdAt,
		updatedAt: updatedAt != null && (createdAt == null || updatedAt > createdAt) ? updatedAt : null,
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
	});

	try {
		return await createNote(deps, actor, data, silent);
	} catch (err) {
		if (err instanceof Error && err.name === 'duplicated') {
			const duplicate = await getNoteFromApIdForApi(deps, value);
			if (!duplicate) {
				throw new Error('The note creation failed with duplication error even when there is no duplication', {
					cause: err,
				});
			}
			return duplicate;
		}
		throw err;
	}
}

function parseApUpdated(note: IPost): Date | null {
	const updated = note.updated == null ? Number.NaN : new Date(note.updated).getTime();
	return Number.isFinite(updated) ? new Date(updated) : null;
}

/**
 * Update(Note) を受け取り、既に取り込んだリモートのノートの内容を書き換える。未知のノートは作らない (Create で届く)。
 * 本文・CW・添付・絵文字・タグ・メンションを取り込みと同じ規則で作り直し、編集の日時 (updated) を残す。
 * 返信先・引用先・公開範囲の宛先・アンケートの選択肢は変えない (票は Update(Question) の集計で反映する)。
 * 編集履歴は持たない。
 */
export async function updateNoteFromApForApi(
	deps: ApiApNoteDependencies,
	actor: MiRemoteUser,
	object: IObject,
	history: Set<string>,
): Promise<string> {
	const note = object as IPost;
	if (note.id == null) {
		return 'skip: note without id';
	}
	const invalid = validateNoteForApi(object, note.id, actor);
	if (invalid) {
		return `skip: ${invalid.message}`;
	}

	// 送り手の日時をそのまま比べる。受信時刻で丸めると、時計の進んだ相手の編集は後着の古い版を新しいと誤り、
	// 同じ編集の再送も別の編集に見える。未来の日時で止まるのは投稿者本人のノートの編集だけ。
	const editedAt = parseApUpdated(note);
	if (editedAt == null) {
		return 'skip: not an edit (no updated)';
	}

	const existing = await fetchNoteByUriFromDatabase(deps.db, note.id);
	if (existing == null) {
		return 'skip: note not found';
	}
	if (existing.userId !== actor.id) {
		return 'skip: actor is not the author';
	}
	if (isRenote(existing) && !isQuote(existing)) {
		return 'skip: a pure renote cannot be edited';
	}
	if (existing.updatedAt != null && editedAt.getTime() <= new Date(existing.updatedAt).getTime()) {
		return 'skip: older or same edit';
	}

	const text = extractNoteTextForApi(deps, note);
	const cw = note.summary === '' ? null : (note.summary ?? null);
	// 代替テキストの書き換えは、編集を受け入れると決まってから行う (禁止ワード等で捨てる編集では変えない)。
	// 今の値との差分ではなく申告どおりに書く。並行した別の編集が先にコミットして値が変わっても、後の編集の値に揃う。
	const declaredComments = new Map<MiDriveFile['id'], string | null>();
	const files = await resolveNoteAttachmentsForApi(deps, actor, note, { declaredComments });

	let values;
	try {
		values = await prepareRemoteNoteEdit(deps, actor, existing, {
			text,
			cw,
			files,
			apMentions: await extractApMentionsForApi(deps, note.tag, history),
			apMentionRawCount: new Set(extractApMentionObjectsForApi(note.tag).map((x) => x.href)).size,
			apHashtags: extractApHashtags(note.tag),
			apEmojis: (await extractEmojisForApi(deps, note.tag ?? [], actor.host).catch(() => [])).map(
				(emoji) => emoji.name,
			),
		});
	} catch (err) {
		if (err instanceof IdentifiableError) {
			return `skip: ${err.message}`;
		}
		throw err;
	}
	// 引用から中身を消すと、引用先を残したまま単なるリノートに変わってしまう。空白だけの本文は整形後に消えるので、
	// 整形後の値で引用の条件 (isQuote) を満たすかを見る。
	if (isRenote(existing) && !isQuote({ ...existing, ...values })) {
		return 'skip: the edit would turn a quote into a renote';
	}

	// ノートの書き換えと代替テキスト・ハッシュタグの記録を 1 つのトランザクションにする。同じノートへの編集が並行しても、
	// 後の UPDATE は先のコミットを待って日時の条件を見直すので、古い編集の代替テキストが後から勝たない。
	const previousTags = new Set(existing.tags);
	const isListed = (visibility: MiNote['visibility']) => visibility === 'public' || visibility === 'home';
	const edited = await deps.db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const row = await updateRemoteNoteContentInDatabase(tx, existing.id, actor.id, { ...values, updatedAt: editedAt });
		if (row == null) {
			return null;
		}
		// 添付の解決が終わった順ではなく ID 順に書く。同じ添付を持つ別のノートの編集と、行ロックの順序を揃える。
		for (const [fileId, comment] of [...declaredComments].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
			await updateDriveFileInDatabase(tx, fileId, { comment });
		}
		// 編集で増えたタグをハッシュタグ一覧に載せる。消えたタグは作成時と同じく数え戻さない。
		const addedTags = row.tags.filter((tag) => !previousTags.has(tag));
		if (addedTags.length > 0 && isListed(row.visibility)) {
			await recordHashtagUsagesInDatabase(tx, {
				entries: addedTags.map((name) => ({ id: genId(), name })),
				userId: actor.id,
				isLocalUser: false,
				isRemoteUser: true,
				isUserAttached: false,
				increment: true,
			});
		}
		return row;
	});
	if (edited == null) {
		return 'skip: older or same edit';
	}
	// 中身は見る人ごとに見てよいかが違うので、編集の日時だけ配り、表示側が取り直す。
	deps.publishNoteStream?.(edited, 'edited', { updatedAt: editedAt });

	// 流行の集計は Redis だけの付随処理。失敗でジョブを再試行させても、再試行は同じ編集として捨てられて何も残らない。
	const addedTags = edited.tags.filter((tag) => !previousTags.has(tag));
	if (addedTags.length > 0 && isListed(edited.visibility)) {
		await updateHashtagsRankings(deps, addedTags, actor.id).catch((error: unknown) => {
			console.error(`Failed to update hashtag rankings for edited note ${edited.id}`, error);
		});
	}
	return 'ok: Note updated';
}

export async function resolveNoteForApi(
	deps: ApiApNoteDependencies,
	value: string | IObject,
	options: { sentFrom?: URL; resolver?: Set<string> } = {},
): Promise<MiNote | null> {
	const uri = getApId(value);

	if (!isFederationAllowedUri(deps.config, deps.meta, uri)) {
		throw new StatusError('blocked host', 451);
	}

	const unlock = await acquireApObjectLock(deps.redis, uri);
	try {
		const exist = await getNoteFromApIdForApi(deps, uri);
		if (exist) {
			return exist;
		}

		if (parseLocalApUri(deps.config, uri).local) {
			throw new StatusError('cannot resolve local note', 400, 'cannot resolve local note');
		}

		const createFrom = options.sentFrom?.origin === new URL(uri).origin ? value : uri;
		return await createNoteFromApForApi(deps, createFrom, undefined, options.resolver ?? new Set(), true);
	} finally {
		await unlock();
	}
}
