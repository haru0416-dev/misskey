/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as mfm from 'mfm-js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import { ApRequestCreator } from '@/core/activitypub/ApRequestService.js';
import { JsonLd } from '@/core/activitypub/JsonLdService.js';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { DeliverQueue } from '@/core/QueueModule.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { fetchEmojiByNameAndHostFromDatabase } from '@/core/EmojiStore.js';
import { fetchNoteByIdFromDatabase, listRemoteUsersWhoRenotedOrRepliedNoteFromDatabase } from '@/core/NoteStore.js';
import { fetchPollByNoteIdFromDatabase } from '@/core/PollStore.js';
import { listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import { listRelaysByStatusFromDatabase } from '@/core/RelayStore.js';
import { fetchUserByIdFromDatabase, listUsersByIdsFromDatabase, listUsersByUrisOrIdsFromDatabase } from '@/core/UserStore.js';
import { fetchUserKeypairFromDatabase } from '@/core/UserKeypairStore.js';
import { listFollowerInboxesByFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { MfmService } from '@/core/MfmService.js';
import type { Config } from '@/config.js';
import { deepClone } from '@/misc/clone.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { IMentionedRemoteUsers, MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { DeliverJobData } from '@/queue/types.js';

export type HonoApiNoteApDependencies = {
	config: Pick<Config, 'url' | 'deliverJobMaxAttempts' | 'mediaProxy' | 'externalMediaProxyEnabled'>;
	meta: Pick<MiMeta, 'proxyRemoteFiles'>;
	db: MiDrizzleDatabase;
	deliverQueue: DeliverQueue;
};

/** リレー配信 (deliverToRelaysForHonoApi) を行う呼び出し元が満たすべき依存。LD 署名の
 * JSON-LD 正規化で remote context の取得があり得るため full HttpRequestService を要求する。 */
export type HonoApiRelayDeliverDependencies = HonoApiNoteApDependencies & {
	httpRequestService: HttpRequestService;
};

function isRemoteUser(user: Pick<MiUser, 'host'>): boolean {
	return user.host !== null;
}

function genLocalUserUri(config: Pick<Config, 'url'>, userId: MiUser['id']): string {
	return `${config.url}/users/${userId}`;
}

export function addActivityContext<T extends Record<string, unknown>>(config: Pick<Config, 'url'>, activity: T): T & { '@context': typeof CONTEXT; id: string } {
	if (activity.id == null) {
		(activity as Record<string, unknown>).id = `${config.url}/${randomUUID()}`;
	}
	return Object.assign({ '@context': CONTEXT }, activity) as T & { '@context': typeof CONTEXT; id: string };
}

function renderMention(config: Pick<Config, 'url'>, user: MiUser): { type: 'Mention'; href: string; name: string } {
	const href = isRemoteUser(user) ? user.uri! : genLocalUserUri(config, user.id);
	const name = isRemoteUser(user) ? `@${user.username}@${user.host}` : `@${user.username}`;
	return { type: 'Mention', href, name };
}

export function renderEmoji(config: Pick<Config, 'url'>, emoji: MiEmoji): Record<string, unknown> {
	return {
		id: `${config.url}/emojis/${emoji.name}`,
		type: 'Emoji',
		name: `:${emoji.name}:`,
		updated: emoji.updatedAt != null ? emoji.updatedAt.toISOString() : new Date().toISOString(),
		icon: {
			type: 'Image',
			mediaType: emoji.type ?? 'image/png',
			url: emoji.publicUrl || emoji.originalUrl,
		},
		_misskey_license: {
			freeText: emoji.license,
		},
	};
}

function renderDocument(deps: HonoApiNoteApDependencies, file: MiDriveFile): Record<string, unknown> {
	return {
		type: 'Document',
		mediaType: file.webpublicType ?? file.type,
		url: getDriveFilePublicUrl(file, { config: deps.config as Config, meta: deps.meta as MiMeta }),
		name: file.comment,
		width: file.properties?.width,
		height: file.properties?.height,
		sensitive: file.isSensitive,
	};
}

export async function renderNoteForHonoApi(deps: HonoApiNoteApDependencies, note: MiNote, dive: boolean): Promise<Record<string, unknown>> {
	let inReplyTo: string | null = null;
	if (note.replyId) {
		const inReplyToNote = note.reply ?? await fetchNoteByIdFromDatabase(deps.db, note.replyId);
		if (inReplyToNote) {
			if (inReplyToNote.uri) {
				inReplyTo = inReplyToNote.uri;
			} else if (dive) {
				inReplyTo = JSON.stringify(await renderNoteForHonoApi(deps, inReplyToNote, false));
			} else {
				inReplyTo = `${deps.config.url}/notes/${inReplyToNote.id}`;
			}
		}
	}

	let quote: string | undefined;
	if (note.renoteId) {
		const renoteNote = note.renote ?? await fetchNoteByIdFromDatabase(deps.db, note.renoteId);
		if (renoteNote) {
			quote = renoteNote.uri ?? `${deps.config.url}/notes/${renoteNote.id}`;
		}
	}

	const attributedTo = genLocalUserUri(deps.config, note.userId);

	const mentionedRemoteUserUris: string[] = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(u => u.uri);

	const mentionedUsers = note.mentions.length > 0
		? await listUsersByIdsFromDatabase(deps.db, note.mentions, { includeSuspended: true })
		: [];

	const hashtagTags = note.tags.map(tag => ({
		type: 'Hashtag' as const,
		href: `${deps.config.url}/tags/${encodeURIComponent(tag)}`,
		name: `#${tag}`,
	}));

	const mentionTags = mentionedUsers.map(u => renderMention(deps.config, u));

	const files = note.fileIds.length > 0 ? await listDriveFilesByIdsFromDatabase(deps.db, note.fileIds) : [];
	const orderedFiles = note.fileIds
		.map(id => files.find(f => f.id === id))
		.filter((f): f is MiDriveFile => f != null);

	const poll = note.hasPoll ? await fetchPollByNoteIdFromDatabase(deps.db, note.id) : null;

	const summary = note.cw === '' ? '​' : (note.cw ?? undefined);

	const mfmService = new MfmService(deps.config as Config);
	const parsed = note.text ? mfm.parse(note.text) : [];
	const extraHtml = quote != null
		? `<br><br><span class="quote-inline">RE: <a href="${quote}">${quote}</a></span>`
		: null;
	const noMisskeyContent = extraHtml == null && parsed.every(n => ['text', 'unicodeEmoji', 'emojiCode', 'mention', 'hashtag', 'url'].includes(n.type));
	const content = mfmService.toHtml(parsed, JSON.parse(note.mentionedRemoteUsers), extraHtml);

	const emojiRows = (await Promise.all(note.emojis.map(name => fetchEmojiByNameAndHostFromDatabase(deps.db, name, null))))
		.filter((e): e is MiEmoji => e != null && !e.localOnly);
	const apemojis = emojiRows.map(e => renderEmoji(deps.config, e));

	const tag = [...hashtagTags, ...mentionTags, ...apemojis];

	const Public = 'https://www.w3.org/ns/activitystreams#Public';
	const followers = `${attributedTo}/followers`;
	let to: string[];
	let cc: string[];
	switch (note.visibility) {
		case 'public':
			to = [Public];
			cc = [followers, ...mentionedRemoteUserUris];
			break;
		case 'home':
			to = [followers];
			cc = [Public, ...mentionedRemoteUserUris];
			break;
		case 'followers':
			to = [followers];
			cc = mentionedRemoteUserUris;
			break;
		default:
			to = mentionedRemoteUserUris;
			cc = [];
			break;
	}

	const asPoll = poll ? {
		type: 'Question',
		[poll.expiresAt && poll.expiresAt < new Date() ? 'closed' : 'endTime']: poll.expiresAt,
		[poll.multiple ? 'anyOf' : 'oneOf']: poll.choices.map((text, i) => ({
			type: 'Note',
			name: text,
			replies: { type: 'Collection', totalItems: poll.votes[i] },
		})),
	} : {};

	return {
		id: `${deps.config.url}/notes/${note.id}`,
		type: 'Note',
		attributedTo,
		summary,
		content: content ?? undefined,
		...(noMisskeyContent ? {} : {
			_misskey_content: note.text ?? '',
			source: { content: note.text ?? '', mediaType: 'text/x.misskeymarkdown' },
		}),
		_misskey_quote: quote,
		quoteUrl: quote,
		published: parseId(deps.config as Config, note.id).date.toISOString(),
		to,
		cc,
		inReplyTo,
		attachment: orderedFiles.map(f => renderDocument(deps, f)),
		sensitive: note.cw != null || orderedFiles.some(f => f.isSensitive),
		tag,
		...asPoll,
	};
}

export function renderCreateForHonoApi(config: Pick<Config, 'url'>, object: Record<string, unknown>, note: MiNote): Record<string, unknown> {
	const activity: Record<string, unknown> = {
		id: `${config.url}/notes/${note.id}/activity`,
		actor: genLocalUserUri(config, note.userId),
		type: 'Create',
		published: parseId(config as Config, note.id).date.toISOString(),
		object,
	};
	if (object.to) activity.to = object.to;
	if (object.cc) activity.cc = object.cc;
	return activity;
}

function renderAnnounceForHonoApi(config: Pick<Config, 'url'>, object: string, note: MiNote): Record<string, unknown> {
	const attributedTo = genLocalUserUri(config, note.userId);
	const Public = 'https://www.w3.org/ns/activitystreams#Public';
	const followers = `${attributedTo}/followers`;

	let to: string[];
	let cc: string[];
	switch (note.visibility) {
		case 'public':
			to = [Public];
			cc = [followers];
			break;
		case 'home':
			to = [followers];
			cc = [Public];
			break;
		case 'followers':
			to = [followers];
			cc = [];
			break;
		default:
			throw new Error('cannot render non-public note');
	}

	return {
		id: `${config.url}/notes/${note.id}/activity`,
		actor: attributedTo,
		type: 'Announce',
		published: parseId(config as Config, note.id).date.toISOString(),
		to,
		cc,
		object,
	};
}

export async function renderNoteOrRenoteActivityForHonoApi(
	deps: HonoApiNoteApDependencies,
	data: { localOnly: boolean; renote: MiNote | null; isQuote: boolean },
	note: MiNote,
): Promise<Record<string, unknown> | null> {
	if (data.localOnly) return null;

	const content = data.renote != null && !data.isQuote
		? renderAnnounceForHonoApi(deps.config, data.renote.uri ?? `${deps.config.url}/notes/${data.renote.id}`, note)
		: renderCreateForHonoApi(deps.config, await renderNoteForHonoApi(deps, note, false), note);

	return addActivityContext(deps.config, content);
}

export async function deliverNoteActivityForHonoApi(
	deps: HonoApiNoteApDependencies,
	author: { id: MiUser['id'] },
	activity: Record<string, unknown> | null,
	options: {
		directRecipients: MiUser[];
		deliverToFollowers: boolean;
	},
): Promise<void> {
	if (activity == null) return;

	const inboxes = new Map<string, boolean>();

	if (options.deliverToFollowers) {
		const followerInboxes = await listFollowerInboxesByFolloweeIdFromDatabase(deps.db, author.id);
		for (const f of followerInboxes) {
			const inbox = f.followerSharedInbox ?? f.followerInbox;
			if (inbox == null) continue;
			inboxes.set(inbox, f.followerSharedInbox != null);
		}
	}

	for (const to of options.directRecipients) {
		if (to.sharedInbox != null && inboxes.has(to.sharedInbox)) continue;
		if (to.inbox == null) continue;
		inboxes.set(to.inbox, false);
	}

	if (inboxes.size === 0) return;

	// JSON.stringify + digest はフォロワー数に比例するホットパスのため、enqueueDeliverJob を
	// inbox ごとにループするのではなく QueueService#deliverMany 相当を addBulk で一括投入する。
	const contentBody = JSON.stringify(activity);
	const digest = ApRequestCreator.createDigest(contentBody);
	const opts = {
		attempts: deps.config.deliverJobMaxAttempts ?? 12,
		backoff: { type: 'custom' as const },
		removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
		removeOnFail: { age: 3600 * 24 * 7, count: 100 },
	};

	await deps.deliverQueue.addBulk(Array.from(inboxes.entries(), ([to, isSharedInbox]) => ({
		name: to.replace('https://', '').replace('/inbox', ''),
		data: { user: { id: author.id }, content: contentBody, digest, to, isSharedInbox } as DeliverJobData,
		opts,
	})));
}

export async function resolveRemoteRecipientForHonoApi(deps: HonoApiNoteApDependencies, userId: MiUser['id']): Promise<MiUser | null> {
	const u = await fetchUserByIdFromDatabase(deps.db, userId);
	if (u == null || !isRemoteUser(u)) return null;
	return u;
}

function renderTombstoneForHonoApi(id: string): Record<string, unknown> {
	return { id, type: 'Tombstone' };
}

function renderDeleteForHonoApi(config: Pick<Config, 'url'>, object: Record<string, unknown> | string, user: { id: MiUser['id'] }): Record<string, unknown> {
	return {
		type: 'Delete',
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

export function renderUndoForHonoApi(config: Pick<Config, 'url'>, object: string | Record<string, unknown>, user: { id: MiUser['id'] }): Record<string, unknown> {
	const id = typeof object !== 'string' && typeof object.id === 'string' && object.id.startsWith(config.url) ? `${object.id}/undo` : undefined;
	return {
		type: 'Undo',
		...(id ? { id } : {}),
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

export async function renderLikeForHonoApi(
	deps: HonoApiNoteApDependencies,
	noteReaction: { id: string; userId: MiUser['id']; reaction: string },
	note: { uri: string | null; id: MiNote['id'] },
): Promise<Record<string, unknown>> {
	const reaction = noteReaction.reaction;

	const object: Record<string, unknown> = {
		type: 'Like',
		id: `${deps.config.url}/likes/${noteReaction.id}`,
		actor: `${deps.config.url}/users/${noteReaction.userId}`,
		object: note.uri ? note.uri : `${deps.config.url}/notes/${note.id}`,
		content: reaction,
		_misskey_reaction: reaction,
	};

	if (reaction.startsWith(':')) {
		const name = reaction.replaceAll(':', '');
		const emoji = await fetchEmojiByNameAndHostFromDatabase(deps.db, name, null);
		if (emoji != null && !emoji.localOnly) {
			object.tag = [renderEmoji(deps.config, emoji)];
		}
	}

	return object;
}

export async function renderNoteDeleteOrUndoAnnounceActivityForHonoApi(
	deps: HonoApiNoteApDependencies,
	note: MiNote,
	user: { id: MiUser['id'] },
): Promise<Record<string, unknown>> {
	let renote: MiNote | null = null;
	if (note.renoteId != null) {
		const isQuote = note.text != null || note.replyId != null || note.cw != null || note.hasPoll || note.fileIds.length > 0;
		if (!isQuote) {
			renote = await fetchNoteByIdFromDatabase(deps.db, note.renoteId);
		}
	}

	const content = renote != null
		? renderUndoForHonoApi(deps.config, renderAnnounceForHonoApi(deps.config, renote.uri ?? `${deps.config.url}/notes/${renote.id}`, note), user)
		: renderDeleteForHonoApi(deps.config, renderTombstoneForHonoApi(`${deps.config.url}/notes/${note.id}`), user);

	return addActivityContext(deps.config, content);
}

export async function resolveMentionedAndInvolvedRemoteUsersForHonoApi(deps: HonoApiNoteApDependencies, note: MiNote): Promise<MiUser[]> {
	const mentionUris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);
	const byUriOrId = await listUsersByUrisOrIdsFromDatabase(deps.db, {
		uris: mentionUris,
		ids: note.renoteUserId ? [note.renoteUserId] : [],
	});
	const renotedOrReplied = await listRemoteUsersWhoRenotedOrRepliedNoteFromDatabase(deps.db, note.id);

	const all = [...byUriOrId, ...renotedOrReplied];
	return all.filter((u, i, self) => i === self.findIndex(u2 => u.id === u2.id));
}

export function renderUpdateForHonoApi(config: Pick<Config, 'url'>, object: string | Record<string, unknown>, user: { id: MiUser['id'] }): Record<string, unknown> {
	return {
		id: `${config.url}/users/${user.id}#updates/${Date.now()}`,
		actor: genLocalUserUri(config, user.id),
		type: 'Update',
		to: ['https://www.w3.org/ns/activitystreams#Public'],
		object,
		published: new Date().toISOString(),
	};
}

export function renderVoteForHonoApi(
	config: Pick<Config, 'url'>,
	user: { id: MiUser['id'] },
	vote: { id: string; choice: number },
	note: { uri: string | null },
	poll: { choices: string[] },
	pollOwner: { uri: string },
): Record<string, unknown> {
	return {
		id: `${config.url}/users/${user.id}#votes/${vote.id}/activity`,
		actor: genLocalUserUri(config, user.id),
		type: 'Create',
		to: [pollOwner.uri],
		published: new Date().toISOString(),
		object: {
			id: `${config.url}/users/${user.id}#votes/${vote.id}`,
			type: 'Note',
			attributedTo: genLocalUserUri(config, user.id),
			to: [pollOwner.uri],
			inReplyTo: note.uri,
			name: poll.choices[vote.choice],
		},
	};
}

export async function deliverSingleActivityForHonoApi(
	deps: HonoApiNoteApDependencies,
	author: { id: MiUser['id'] },
	activity: Record<string, unknown>,
	inbox: string,
): Promise<void> {
	enqueueDeliverJob(deps.deliverQueue, deps.config as Config, author, activity as unknown as IActivity, inbox, false);
}

export async function deliverQuestionUpdateForHonoApi(deps: HonoApiRelayDeliverDependencies, noteId: MiNote['id']): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, noteId);
	if (note == null) throw new Error('note not found');
	if (note.localOnly) return;

	const user = await fetchUserByIdFromDatabase(deps.db, note.userId);
	if (user == null) throw new Error('note not found');

	if (!isRemoteUser(user)) {
		const content = addActivityContext(deps.config, renderUpdateForHonoApi(deps.config, await renderNoteForHonoApi(deps, note, false), user));
		await deliverNoteActivityForHonoApi(deps, user, content, { directRecipients: [], deliverToFollowers: true });
		// 原典 PollService#deliverQuestionUpdate 同様、リレー配信は await しない。
		void deliverToRelaysForHonoApi(deps, { id: user.id, host: null }, content).catch(() => {});
	}
}

/** ApRendererService#attachLdSignature 相当。RsaSignature2017 (LD 署名) をアクティビティに付与する。 */
export async function attachLdSignatureForHonoApi(
	deps: Pick<HonoApiRelayDeliverDependencies, 'db' | 'config' | 'httpRequestService'>,
	activity: Record<string, unknown>,
	user: { id: MiUser['id']; host: null },
): Promise<Record<string, unknown>> {
	const keypair = await fetchUserKeypairFromDatabase(deps.db, user.id);

	const jsonLd = new JsonLd(deps.httpRequestService);
	jsonLd.debug = false;
	return await jsonLd.signRsaSignature2017(activity, keypair.privateKey, `${deps.config.url}/users/${user.id}#main-key`);
}

/** RelayService#deliverToRelays 相当。原典の 10 分 MemorySingleCache (relaysCache) は、確立済みの
 * 「hono 側では in-process cache を持たない」方針に従い accepted リレーの直接 DB 読みに置換
 * (小さなテーブルの単純 SELECT で、リレー未設定インスタンスでは空配列即 return)。 */
export async function deliverToRelaysForHonoApi(
	deps: HonoApiRelayDeliverDependencies,
	user: { id: MiUser['id']; host: null },
	activity: Record<string, unknown> | null,
): Promise<void> {
	if (activity == null) return;

	const relays = await listRelaysByStatusFromDatabase(deps.db, 'accepted');
	if (relays.length === 0) return;

	const copy = deepClone(activity as Parameters<typeof deepClone>[0]) as Record<string, unknown> & { to?: unknown };
	if (!copy.to) copy.to = ['https://www.w3.org/ns/activitystreams#Public'];

	const signed = await attachLdSignatureForHonoApi(deps, copy, user);

	for (const relay of relays) {
		void enqueueDeliverJob(deps.deliverQueue, deps.config, user, signed as unknown as IActivity, relay.inbox, false);
	}
}
