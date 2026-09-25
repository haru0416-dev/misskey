/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/_.js';

// system webhook とユーザー webhook のテスト送信で使うダミーデータ。

export const webhookTestDayMillis = 24 * 60 * 60 * 1000;

export type PopulateWebhookTestEmojis = (
	emojiNames: string[],
	host: string | null,
) => Promise<Packed<'UserLite'>['emojis']>;

export function generateWebhookTestDummyUser(override?: Partial<MiUser>): MiUser {
	return {
		id: 'dummy-user-1',
		updatedAt: new Date(Date.now() - webhookTestDayMillis * 7),
		lastFetchedAt: new Date(Date.now() - webhookTestDayMillis * 5),
		lastActiveDate: new Date(Date.now() - webhookTestDayMillis * 3),
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

export const webhookTestDummyUser1 = generateWebhookTestDummyUser();
export const webhookTestDummyUser2 = generateWebhookTestDummyUser({
	id: 'dummy-user-2',
	updatedAt: new Date(Date.now() - webhookTestDayMillis * 30),
	lastFetchedAt: new Date(Date.now() - webhookTestDayMillis),
	lastActiveDate: new Date(Date.now() - webhookTestDayMillis),
	username: 'dummy2',
	usernameLower: 'dummy2',
	name: 'DummyUser2',
	followersCount: 40,
	followingCount: 50,
	notesCount: 900,
});
export const webhookTestDummyUser3 = generateWebhookTestDummyUser({
	id: 'dummy-user-3',
	updatedAt: new Date(Date.now() - webhookTestDayMillis * 15),
	lastFetchedAt: new Date(Date.now() - webhookTestDayMillis * 2),
	lastActiveDate: new Date(Date.now() - webhookTestDayMillis * 2),
	username: 'dummy3',
	usernameLower: 'dummy3',
	name: 'DummyUser3',
	followersCount: 60,
	followingCount: 70,
	notesCount: 15_900,
});

export async function packWebhookTestUserLite(
	populateEmojis: PopulateWebhookTestEmojis,
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
