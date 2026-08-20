/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type {
	AbuseReportPayload,
	InactiveModeratorsWarningPayload,
	SystemWebhookPayload,
} from '@/core/system-webhook-types.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiAbuseUserReport, MiUser } from '@/models/_.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';

const oneDayMillis = 24 * 60 * 60 * 1000;

type PopulateDummyEmojis = (emojiNames: string[], host: string | null) => Promise<Packed<'UserLite'>['emojis']>;

export type SystemWebhookTestDependencies = {
	fetchSystemWebhooksByIds: (ids: MiSystemWebhook['id'][]) => Promise<MiSystemWebhook[]>;
	enqueueSystemWebhookDeliver: <T extends SystemWebhookEventType>(
		webhook: MiSystemWebhook,
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: { attempts?: number },
	) => void | Promise<unknown>;
	populateEmojis: PopulateDummyEmojis;
};

export class NoSuchSystemWebhookForTestError extends Error {}

function generateDummyUser(override?: Partial<MiUser>): MiUser {
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
		suspensionTransitionId: null,
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
	};
}

const dummyUser1 = generateDummyUser();
const dummyUser2 = generateDummyUser({
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
const dummyUser3 = generateDummyUser({
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

async function toPackedUserLiteForSystemWebhookTest(
	populateEmojis: PopulateDummyEmojis,
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
		avatarDecorations: user.avatarDecorations.map((it) => ({
			id: it.id,
			angle: it.angle,
			flipH: it.flipH,
			url: 'https://example.com/dummy-image001.png',
			offsetX: it.offsetX,
			offsetY: it.offsetY,
		})),
		isBot: user.isBot,
		isCat: user.isCat,
		emojis: await populateEmojis(user.emojis, user.host),
		onlineStatus: 'active',
		badgeRoles: [],
		...override,
	};
}

async function generateSystemWebhookTestAbuseReport(
	populateEmojis: PopulateDummyEmojis,
	override?: Partial<MiAbuseUserReport>,
): Promise<AbuseReportPayload> {
	const result: MiAbuseUserReport = {
		id: 'dummy-abuse-report1',
		targetUserId: 'dummy-target-user',
		targetUser: null,
		reporterId: 'dummy-reporter-user',
		reporter: null,
		assigneeId: null,
		assignee: null,
		resolved: false,
		forwarded: false,
		comment: 'This is a dummy report for testing purposes.',
		targetUserHost: null,
		reporterHost: null,
		resolvedAs: null,
		moderationNote: 'foo',
		...override,
	};

	return {
		...result,
		targetUser: result.targetUser
			? await toPackedUserLiteForSystemWebhookTest(populateEmojis, result.targetUser)
			: null,
		reporter: result.reporter ? await toPackedUserLiteForSystemWebhookTest(populateEmojis, result.reporter) : null,
		assignee: result.assignee ? await toPackedUserLiteForSystemWebhookTest(populateEmojis, result.assignee) : null,
	};
}

async function createSystemWebhookTestPayload<T extends SystemWebhookEventType>(
	populateEmojis: PopulateDummyEmojis,
	type: T,
): Promise<SystemWebhookPayload<T>> {
	switch (type) {
		case 'abuseReport': {
			return (await generateSystemWebhookTestAbuseReport(populateEmojis, {
				targetUserId: dummyUser1.id,
				targetUser: dummyUser1,
				reporterId: dummyUser2.id,
				reporter: dummyUser2,
			})) as SystemWebhookPayload<T>;
		}
		case 'abuseReportResolved': {
			return (await generateSystemWebhookTestAbuseReport(populateEmojis, {
				targetUserId: dummyUser1.id,
				targetUser: dummyUser1,
				reporterId: dummyUser2.id,
				reporter: dummyUser2,
				assigneeId: dummyUser3.id,
				assignee: dummyUser3,
				resolved: true,
			})) as SystemWebhookPayload<T>;
		}
		case 'userCreated': {
			return (await toPackedUserLiteForSystemWebhookTest(populateEmojis, dummyUser1)) as SystemWebhookPayload<T>;
		}
		case 'inactiveModeratorsWarning': {
			const dummyTime: InactiveModeratorsWarningPayload['remainingTime'] = {
				time: 100000,
				asDays: 1,
				asHours: 24,
			};

			return {
				remainingTime: dummyTime,
			} as SystemWebhookPayload<T>;
		}
		case 'inactiveModeratorsInvitationOnlyChanged': {
			return {} as SystemWebhookPayload<T>;
		}
		default: {
			const _exhaustiveAssertion: never = type;
			return _exhaustiveAssertion;
		}
	}
}

export async function testSystemWebhookWithQueue<T extends SystemWebhookEventType>(
	deps: SystemWebhookTestDependencies,
	params: {
		webhookId: MiSystemWebhook['id'];
		type: T;
		override?: Partial<Omit<MiSystemWebhook, 'id'>>;
	},
): Promise<void> {
	const webhooks = await deps.fetchSystemWebhooksByIds([params.webhookId]);
	if (webhooks.length === 0) {
		throw new NoSuchSystemWebhookForTestError();
	}
	const storedWebhook = webhooks[0];
	if (storedWebhook == null) throw new NoSuchSystemWebhookForTestError();

	const webhook = {
		...storedWebhook,
		...params.override,
	};
	const payload = await createSystemWebhookTestPayload(deps.populateEmojis, params.type);

	void deps.enqueueSystemWebhookDeliver(webhook, params.type, payload, { attempts: 1 });
}
