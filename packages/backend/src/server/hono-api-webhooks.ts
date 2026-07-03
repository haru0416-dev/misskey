/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { countWebhooksByUserIdFromDatabase, createWebhookInDatabase, deleteWebhookFromDatabase, fetchWebhookByIdAndUserIdFromDatabase, listWebhooksByUserIdFromDatabase, updateWebhookInDatabase } from '@/core/WebhookStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { UserWebhookDeliverQueue } from '@/core/QueueModule.js';
import type { UserWebhookDeliverJobData } from '@/queue/types.js';
import { MiNote } from '@/models/Note.js';
import type { MiLocalUser } from '@/models/User.js';
import { MiUser } from '@/models/User.js';
import { webhookEventTypes, type MiWebhook, type WebhookEventTypes } from '@/models/Webhook.js';
import type { HonoApiInternalEventPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { populateEmojis, type HonoApiEmojiPopulateDependencies } from './hono-api-note.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiWebhookDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

export type HonoApiWebhookTestDependencies = HonoApiWebhookDependencies & HonoApiEmojiPopulateDependencies & {
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
};

export type HonoApiUserWebhook = {
	id: string;
	userId: string;
	name: string;
	on: WebhookEventTypes[];
	url: string;
	secret: string;
	active: boolean;
	latestSentAt: string | null;
	latestStatus: number | null;
};

const webhooksListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const webhooksCreateParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		url: { type: 'string', minLength: 1, maxLength: 1024 },
		secret: { type: 'string', maxLength: 1024, default: '' },
		on: { type: 'array', items: {
			type: 'string', enum: webhookEventTypes,
		} },
	},
	required: ['name', 'url', 'on'],
} as const;

type WebhooksCreateParams = {
	name: string;
	url: string;
	secret: string;
	on: WebhookEventTypes[];
};

const webhooksShowParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
	},
	required: ['webhookId'],
} as const;

const webhooksDeleteParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
	},
	required: ['webhookId'],
} as const;

const webhooksUpdateParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		url: { type: 'string', minLength: 1, maxLength: 1024 },
		secret: { type: 'string', nullable: true, maxLength: 1024 },
		on: { type: 'array', items: {
			type: 'string', enum: webhookEventTypes,
		} },
		active: { type: 'boolean' },
	},
	required: ['webhookId'],
} as const;

type WebhooksShowParams = {
	webhookId: string;
};

type WebhooksDeleteParams = {
	webhookId: string;
};

type WebhooksUpdateParams = {
	webhookId: string;
	name?: string;
	url?: string;
	secret?: string | null;
	on?: WebhookEventTypes[];
	active?: boolean;
};

function packUserWebhook(webhook: MiWebhook): HonoApiUserWebhook {
	return {
		id: webhook.id,
		userId: webhook.userId,
		name: webhook.name,
		on: webhook.on,
		url: webhook.url,
		secret: webhook.secret,
		active: webhook.active,
		latestSentAt: webhook.latestSentAt ? webhook.latestSentAt.toISOString() : null,
		latestStatus: webhook.latestStatus,
	};
}

export async function handleHonoApiIWebhooksList(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiUserWebhook[]> {
	parseHonoApiParams(webhooksListParamDef, body);
	const webhooks = await listWebhooksByUserIdFromDatabase(deps.db, me.id);
	return webhooks.map(webhook => packUserWebhook(webhook));
}

export async function handleHonoApiIWebhooksShow(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiUserWebhook> {
	const params = parseHonoApiParams(webhooksShowParamDef, body) as WebhooksShowParams;
	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);

	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: '50f614d9-3047-4f7e-90d8-ad6b2d5fb098',
		});
	}

	return packUserWebhook(webhook);
}

export async function handleHonoApiIWebhooksDelete(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(webhooksDeleteParamDef, body) as WebhooksDeleteParams;
	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);

	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'bae73e5a-5522-4965-ae19-3a8688e71d82',
		});
	}

	await deleteWebhookFromDatabase(deps.db, webhook.id);
	deps.publishInternalEvent?.('webhookDeleted', webhook);
}

export async function handleHonoApiIWebhooksUpdate(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(webhooksUpdateParamDef, body) as WebhooksUpdateParams;
	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);

	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'fb0fea69-da18-45b1-828d-bd4fd1612518',
		});
	}

	const updated = await updateWebhookInDatabase(deps.db, webhook.id, {
		name: params.name,
		url: params.url,
		secret: params.secret === null ? '' : params.secret,
		on: params.on,
		active: params.active,
	});

	if (updated == null) {
		throw new Error(`Webhook ${webhook.id} not found`);
	}

	deps.publishInternalEvent?.('webhookUpdated', updated);
}

export async function handleHonoApiIWebhooksCreate(
	deps: HonoApiWebhookDependencies,
	me: MiLocalUser,
	webhookLimit: number,
	body: Record<string, unknown>,
): Promise<HonoApiUserWebhook> {
	const params = parseHonoApiParams(webhooksCreateParamDef, body) as WebhooksCreateParams;

	const currentWebhooksCount = await countWebhooksByUserIdFromDatabase(deps.db, me.id);
	if (currentWebhooksCount >= webhookLimit) {
		throw new HonoApiError({
			status: 400,
			message: 'You cannot create webhook any more.',
			code: 'TOO_MANY_WEBHOOKS',
			id: '87a9bb19-111e-4e37-81d3-a3e7426453b0',
		});
	}

	const webhook = await createWebhookInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		name: params.name,
		url: params.url,
		secret: params.secret,
		on: params.on,
	});

	deps.publishInternalEvent?.('webhookCreated', webhook);

	return packUserWebhook(webhook);
}

const webhooksTestParamDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
		type: { type: 'string', enum: webhookEventTypes },
		override: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				secret: { type: 'string' },
			},
		},
	},
	required: ['webhookId', 'type'],
} as const;

type WebhooksTestParams = {
	webhookId: string;
	type: WebhookEventTypes;
	override?: { url?: string; secret?: string };
};

const oneDayMillis = 24 * 60 * 60 * 1000;

function generateWebhookTestDummyUser(override?: Partial<MiUser>): MiUser {
	return {
		id: 'dummy-user-1',
		updatedAt: new Date(Date.now() - oneDayMillis * 7),
		lastFetchedAt: new Date(Date.now() - oneDayMillis * 5),
		lastActiveDate: new Date(Date.now() - oneDayMillis * 3),
		hideOnlineStatus: false,
		username: 'dummy1',
		usernameLower: 'dummy1',
		name: 'DummyUser1',
		followersCount: 10,
		followingCount: 5,
		movedToUri: null,
		movedAt: null,
		alsoKnownAs: null,
		notesCount: 30,
		avatarId: null,
		avatar: null,
		bannerId: null,
		banner: null,
		avatarUrl: null,
		bannerUrl: null,
		avatarBlurhash: null,
		bannerBlurhash: null,
		avatarDecorations: [],
		tags: [],
		isSuspended: false,
		isLocked: false,
		isBot: false,
		isCat: true,
		isExplorable: true,
		isHibernated: false,
		isDeleted: false,
		requireSigninToViewContents: false,
		makeNotesFollowersOnlyBefore: null,
		makeNotesHiddenBefore: null,
		chatScope: 'mutual',
		emojis: [],
		score: 0,
		host: null,
		inbox: null,
		sharedInbox: null,
		featured: null,
		uri: null,
		followersUri: null,
		token: null,
		...override,
	} as MiUser;
}

function generateWebhookTestDummyNote(override?: Partial<MiNote>): MiNote {
	return {
		id: 'dummy-note-1',
		replyId: null,
		reply: null,
		renoteId: null,
		renote: null,
		threadId: null,
		text: 'This is a dummy note for testing purposes.',
		name: null,
		cw: null,
		userId: 'dummy-user-1',
		user: null,
		localOnly: true,
		reactionAcceptance: 'likeOnly',
		renoteCount: 10,
		repliesCount: 5,
		clippedCount: 0,
		pageCount: 0,
		reactions: {},
		visibility: 'public',
		uri: null,
		url: null,
		fileIds: [],
		attachedFileTypes: [],
		visibleUserIds: [],
		mentions: [],
		mentionedRemoteUsers: '[]',
		reactionAndUserPairCache: [],
		emojis: [],
		tags: [],
		hasPoll: false,
		channelId: null,
		channel: null,
		userHost: null,
		replyUserId: null,
		replyUserHost: null,
		renoteUserId: null,
		renoteUserHost: null,
		renoteChannelId: null,
		...override,
	} as MiNote;
}

const webhookTestDummyUser1 = generateWebhookTestDummyUser();
const webhookTestDummyUser2 = generateWebhookTestDummyUser({
	id: 'dummy-user-2',
	updatedAt: new Date(Date.now() - oneDayMillis * 30),
	lastFetchedAt: new Date(Date.now() - oneDayMillis),
	lastActiveDate: new Date(Date.now() - oneDayMillis),
	username: 'dummy2',
	usernameLower: 'dummy2',
	name: 'DummyUser2',
	followersCount: 40,
	followingCount: 50,
	notesCount: 900,
});
const webhookTestDummyUser3 = generateWebhookTestDummyUser({
	id: 'dummy-user-3',
	updatedAt: new Date(Date.now() - oneDayMillis * 15),
	lastFetchedAt: new Date(Date.now() - oneDayMillis * 2),
	lastActiveDate: new Date(Date.now() - oneDayMillis * 2),
	username: 'dummy3',
	usernameLower: 'dummy3',
	name: 'DummyUser3',
	followersCount: 60,
	followingCount: 70,
	notesCount: 15900,
});

async function toWebhookTestPackedUserLite(
	deps: HonoApiEmojiPopulateDependencies,
	user: MiUser,
	override?: Packed<'UserLite'>,
): Promise<Packed<'UserLite'>> {
	return {
		id: user.id,
		name: user.name,
		username: user.username,
		host: user.host,
		avatarUrl: (user.avatarId == null ? null : user.avatarUrl) ?? '',
		avatarBlurhash: user.avatarId == null ? null : user.avatarBlurhash,
		avatarDecorations: user.avatarDecorations.map(it => ({
			id: it.id,
			angle: it.angle,
			flipH: it.flipH,
			url: 'https://example.com/dummy-image001.png',
			offsetX: it.offsetX,
			offsetY: it.offsetY,
		})),
		isBot: user.isBot,
		isCat: user.isCat,
		emojis: await populateEmojis(deps, user.emojis, user.host),
		onlineStatus: 'active',
		badgeRoles: [],
		...override,
	} as Packed<'UserLite'>;
}

async function toWebhookTestPackedUserDetailedNotMe(
	deps: HonoApiEmojiPopulateDependencies,
	user: MiUser,
	override?: Packed<'UserDetailedNotMe'>,
): Promise<Packed<'UserDetailedNotMe'>> {
	return {
		...await toWebhookTestPackedUserLite(deps, user),
		url: null,
		uri: null,
		movedTo: null,
		alsoKnownAs: [],
		createdAt: new Date().toISOString(),
		updatedAt: user.updatedAt?.toISOString() ?? null,
		lastFetchedAt: user.lastFetchedAt?.toISOString() ?? null,
		bannerUrl: user.bannerId == null ? null : user.bannerUrl,
		bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
		isLocked: user.isLocked,
		isSilenced: false,
		isSuspended: user.isSuspended,
		description: null,
		location: null,
		birthday: null,
		lang: null,
		fields: [],
		verifiedLinks: [],
		followersCount: user.followersCount,
		followingCount: user.followingCount,
		notesCount: user.notesCount,
		pinnedNoteIds: [],
		pinnedNotes: [],
		pinnedPageId: null,
		pinnedPage: null,
		publicReactions: true,
		followersVisibility: 'public',
		followingVisibility: 'public',
		chatScope: 'mutual',
		canChat: true,
		twoFactorEnabled: false,
		usePasswordLessLogin: false,
		securityKeys: false,
		roles: [],
		memo: null,
		moderationNote: undefined,
		isFollowing: false,
		isFollowed: false,
		hasPendingFollowRequestFromYou: false,
		hasPendingFollowRequestToYou: false,
		isBlocking: false,
		isBlocked: false,
		isMuted: false,
		isRenoteMuted: false,
		notify: 'none',
		withReplies: true,
		...override,
	} as Packed<'UserDetailedNotMe'>;
}

async function toWebhookTestPackedNote(
	deps: HonoApiEmojiPopulateDependencies,
	note: MiNote,
	detail = true,
	override?: Packed<'Note'>,
): Promise<Packed<'Note'>> {
	return {
		id: note.id,
		createdAt: new Date().toISOString(),
		deletedAt: null,
		text: note.text,
		cw: note.cw,
		userId: note.userId,
		user: await toWebhookTestPackedUserLite(deps, note.user ?? generateWebhookTestDummyUser()),
		replyId: note.replyId,
		renoteId: note.renoteId,
		isHidden: false,
		visibility: note.visibility,
		mentions: note.mentions,
		visibleUserIds: note.visibleUserIds,
		fileIds: note.fileIds,
		files: [],
		tags: note.tags,
		poll: null,
		emojis: await populateEmojis(deps, note.emojis, note.userHost),
		channelId: note.channelId,
		channel: note.channel,
		localOnly: note.localOnly,
		reactionAcceptance: note.reactionAcceptance,
		reactionEmojis: {},
		reactions: {},
		reactionCount: 0,
		renoteCount: note.renoteCount,
		repliesCount: note.repliesCount,
		uri: note.uri ?? undefined,
		url: note.url ?? undefined,
		reactionAndUserPairCache: note.reactionAndUserPairCache,
		...(detail ? {
			clippedCount: note.clippedCount,
			reply: note.reply ? await toWebhookTestPackedNote(deps, note.reply, false) : null,
			renote: note.renote ? await toWebhookTestPackedNote(deps, note.renote, true) : null,
			myReaction: null,
		} : {}),
		...override,
	} as Packed<'Note'>;
}

export async function handleHonoApiIWebhooksTest(
	deps: HonoApiWebhookTestDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(webhooksTestParamDef, body) as WebhooksTestParams;

	const webhook = await fetchWebhookByIdAndUserIdFromDatabase(deps.db, params.webhookId, me.id);
	if (webhook == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: '0c52149c-e913-18f8-5dc7-74870bfe0cf9',
		});
	}

	const send = <T extends WebhookEventTypes>(type: T, contents: unknown): void => {
		const merged = { ...webhook, ...params.override };
		const data: UserWebhookDeliverJobData = {
			type,
			content: contents as UserWebhookDeliverJobData['content'],
			webhookId: merged.id,
			userId: merged.userId,
			to: merged.url,
			secret: merged.secret,
			createdAt: Date.now(),
			eventId: randomUUID(),
		};

		deps.userWebhookDeliverQueue.add(merged.id, data, {
			attempts: 1,
			backoff: { type: 'custom' },
			removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
			removeOnFail: { age: 3600 * 24 * 7, count: 100 },
		});
	};

	const dummyNote1 = generateWebhookTestDummyNote({
		userId: webhookTestDummyUser1.id,
		user: webhookTestDummyUser1,
	});
	const dummyReply1 = generateWebhookTestDummyNote({
		id: 'dummy-reply-1',
		replyId: dummyNote1.id,
		reply: dummyNote1,
		userId: webhookTestDummyUser1.id,
		user: webhookTestDummyUser1,
	});
	const dummyRenote1 = generateWebhookTestDummyNote({
		id: 'dummy-renote-1',
		renoteId: dummyNote1.id,
		renote: dummyNote1,
		userId: webhookTestDummyUser2.id,
		user: webhookTestDummyUser2,
		text: null,
	});
	const dummyMention1 = generateWebhookTestDummyNote({
		id: 'dummy-mention-1',
		userId: webhookTestDummyUser1.id,
		user: webhookTestDummyUser1,
		text: `@${webhookTestDummyUser2.username} This is a mention to you.`,
		mentions: [webhookTestDummyUser2.id],
	});

	switch (params.type) {
		case 'note': {
			send('note', { note: await toWebhookTestPackedNote(deps, dummyNote1) });
			break;
		}
		case 'reply': {
			send('reply', { note: await toWebhookTestPackedNote(deps, dummyReply1) });
			break;
		}
		case 'renote': {
			send('renote', { note: await toWebhookTestPackedNote(deps, dummyRenote1) });
			break;
		}
		case 'mention': {
			send('mention', { note: await toWebhookTestPackedNote(deps, dummyMention1) });
			break;
		}
		case 'follow': {
			send('follow', { user: await toWebhookTestPackedUserDetailedNotMe(deps, webhookTestDummyUser1) });
			break;
		}
		case 'followed': {
			send('followed', { user: await toWebhookTestPackedUserLite(deps, webhookTestDummyUser2) });
			break;
		}
		case 'unfollow': {
			send('unfollow', { user: await toWebhookTestPackedUserDetailedNotMe(deps, webhookTestDummyUser3) });
			break;
		}
		case 'reaction':
			return;
		default: {
			return;
		}
	}
}
