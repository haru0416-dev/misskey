/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import bcrypt from 'bcryptjs';
import RE2 from 're2';
import type { Config } from '@/config.js';
import { createSignupAccountInDatabase } from '@/core/SignupStore.js';
import { updateMetaInDatabase } from '@/core/MetaStore.js';
import { isUsedUsername } from '@/core/UsedUsernameStore.js';
import { isLocalUsernameTaken } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import { DEFAULT_POLICIES, type RolePolicies } from '@/core/role-policies.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { generateNativeUserToken } from '@/misc/token.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';

type SignupBody = {
	username?: unknown;
	password?: unknown;
	host?: unknown;
	invitationCode?: unknown;
	emailAddress?: unknown;
};

type SignupResponse = Record<string, unknown> & {
	token: string;
};

export type SignupInternalEventPublisher = (
	type: 'metaUpdated',
	value: { before?: MiMeta; after: MiMeta },
) => void;

export type SignupDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: SignupInternalEventPublisher;
};

export class SignupApiError extends Error {
	public readonly status: number;
	public readonly code: string;

	constructor(status: number, code: string, message = code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

function validateUsername(username: unknown): asserts username is string {
	if (typeof username !== 'string' || !/^\w{1,20}$/.test(username)) {
		throw new SignupApiError(400, 'INVALID_USERNAME');
	}
}

function validatePassword(password: unknown): asserts password is string {
	if (typeof password !== 'string' || password.length < 1) {
		throw new SignupApiError(400, 'INVALID_PASSWORD');
	}
}

function normalizeHost(host: unknown): string | null {
	if (host == null) return null;
	if (typeof host !== 'string') throw new SignupApiError(400, 'INVALID_HOST');

	const normalized = domainToASCII(host.toLowerCase());
	if (normalized === '') throw new SignupApiError(400, 'INVALID_HOST');

	return normalized;
}

function isKeywordIncluded(text: string, keywords: string[]): boolean {
	if (keywords.length === 0) return false;
	if (text === '') return false;

	const regexpPattern = /^\/(.+)\/(.*)$/;

	return keywords.some(filter => {
		const regexp = filter.match(regexpPattern);
		if (!regexp) {
			const words = filter.split(' ');
			return words.every(keyword => text.includes(keyword));
		}

		try {
			return new RE2(regexp[1], regexp[2]).test(text);
		} catch {
			return false;
		}
	});
}

function assertSignupGateOpen(meta: MiMeta): void {
	if (process.env.NODE_ENV === 'test') return;

	if (meta.enableHcaptcha && meta.hcaptchaSecretKey) throw new SignupApiError(400, 'CAPTCHA_REQUIRED');
	if (meta.enableMcaptcha && meta.mcaptchaSecretKey && meta.mcaptchaSitekey && meta.mcaptchaInstanceUrl) throw new SignupApiError(400, 'CAPTCHA_REQUIRED');
	if (meta.enableRecaptcha && meta.recaptchaSecretKey) throw new SignupApiError(400, 'CAPTCHA_REQUIRED');
	if (meta.enableTurnstile && meta.turnstileSecretKey) throw new SignupApiError(400, 'CAPTCHA_REQUIRED');
	if (meta.enableTestcaptcha) throw new SignupApiError(400, 'CAPTCHA_REQUIRED');
	if (meta.emailRequiredForSignup) throw new SignupApiError(400, 'EMAIL_REQUIRED_FOR_SIGNUP');
	if (meta.disableRegistration) throw new SignupApiError(400, 'INVITATION_REQUIRED');
}

function getPolicies(config: Config, meta: MiMeta): RolePolicies {
	const policies = { ...DEFAULT_POLICIES, ...meta.policies };
	const serverMaxFileSizeMb = Math.floor(config.maxFileSize / (1024 * 1024));

	return {
		...policies,
		maxFileSizeMb: Math.min(serverMaxFileSizeMb, policies.maxFileSizeMb),
	};
}

function getOnlineStatus(user: MiUser): 'unknown' | 'online' | 'active' | 'offline' {
	if (user.hideOnlineStatus) return 'unknown';
	if (user.lastActiveDate == null) return 'unknown';

	const elapsed = Date.now() - user.lastActiveDate.getTime();

	return (
		elapsed < 1000 * 60 * 10 ? 'online' :
		elapsed < 1000 * 60 * 60 * 24 * 3 ? 'active' :
		'offline'
	);
}

function getIdenticonUrl(config: Config, meta: MiMeta, user: MiUser): string {
	if ((user.host == null || user.host === config.host) && user.username.includes('.') && meta.iconUrl) {
		return meta.iconUrl;
	}

	return `${config.url}/identicon/${user.username.toLowerCase()}@${user.host ?? config.host}`;
}

function backupCodesStock(profile: MiUserProfile): 'none' | 'partial' | 'full' {
	const count = profile.twoFactorBackupSecret?.length ?? 0;
	if (count === 5) return 'full';
	return count > 0 ? 'partial' : 'none';
}

async function assignRootUserIfMissing(deps: SignupDependencies, userId: MiUser['id']): Promise<void> {
	if (deps.meta.rootUserId != null) return;

	const { before, after } = await updateMetaInDatabase(deps.db, { rootUserId: userId });
	Object.assign(deps.meta, after);
	deps.meta.rootUser = null;
	deps.publishInternalEvent?.('metaUpdated', { before, after });
}

async function packSignupUser(deps: SignupDependencies, user: MiUser, token: string): Promise<SignupResponse> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const policies = getPolicies(deps.config, deps.meta);
	const isRoot = deps.meta.rootUserId === user.id;

	return {
		id: user.id,
		name: user.name,
		username: user.username,
		host: user.host,
		avatarUrl: (user.avatarId == null ? null : user.avatarUrl) ?? getIdenticonUrl(deps.config, deps.meta, user),
		avatarBlurhash: user.avatarId == null ? null : user.avatarBlurhash,
		avatarDecorations: user.avatarDecorations,
		isBot: user.isBot,
		isCat: user.isCat,
		requireSigninToViewContents: user.requireSigninToViewContents === false ? undefined : true,
		makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore ?? undefined,
		makeNotesHiddenBefore: user.makeNotesHiddenBefore ?? undefined,
		instance: undefined,
		emojis: {},
		onlineStatus: getOnlineStatus(user),
		badgeRoles: [],
		url: profile.url,
		uri: user.uri,
		movedTo: null,
		alsoKnownAs: user.alsoKnownAs,
		createdAt: parseId(deps.config, user.id).date.toISOString(),
		updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
		lastFetchedAt: user.lastFetchedAt ? user.lastFetchedAt.toISOString() : null,
		bannerUrl: user.bannerId == null ? null : user.bannerUrl,
		bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
		isLocked: user.isLocked,
		isSilenced: !policies.canPublicNote,
		isSuspended: user.isSuspended,
		description: profile.description,
		location: profile.location,
		birthday: profile.birthday,
		lang: profile.lang,
		fields: profile.fields,
		verifiedLinks: profile.verifiedLinks,
		followersCount: user.followersCount,
		followingCount: user.followingCount,
		notesCount: user.notesCount,
		pinnedNoteIds: [],
		pinnedNotes: [],
		pinnedPageId: profile.pinnedPageId,
		pinnedPage: null,
		publicReactions: user.host == null ? profile.publicReactions : false,
		followingVisibility: profile.followingVisibility,
		followersVisibility: profile.followersVisibility,
		chatScope: user.chatScope,
		canChat: policies.chatAvailability === 'available',
		roles: [],
		memo: null,
		twoFactorEnabled: profile.twoFactorEnabled,
		usePasswordLessLogin: profile.usePasswordLessLogin,
		securityKeys: false,
		avatarId: user.avatarId,
		bannerId: user.bannerId,
		followedMessage: profile.followedMessage,
		isModerator: isRoot,
		isAdmin: isRoot,
		injectFeaturedNote: profile.injectFeaturedNote,
		receiveAnnouncementEmail: profile.receiveAnnouncementEmail,
		alwaysMarkNsfw: profile.alwaysMarkNsfw,
		autoSensitive: profile.autoSensitive,
		carefulBot: profile.carefulBot,
		autoAcceptFollowed: profile.autoAcceptFollowed,
		noCrawle: profile.noCrawle,
		preventAiLearning: profile.preventAiLearning,
		isExplorable: user.isExplorable,
		isDeleted: user.isDeleted,
		twoFactorBackupCodesStock: backupCodesStock(profile),
		hideOnlineStatus: user.hideOnlineStatus,
		hasUnreadSpecifiedNotes: false,
		hasUnreadMentions: false,
		hasUnreadAnnouncement: false,
		hasUnreadAntenna: false,
		hasUnreadChannel: false,
		hasUnreadChatMessages: false,
		hasUnreadNotification: false,
		unreadNotificationsCount: 0,
		hasPendingReceivedFollowRequest: false,
		unreadAnnouncements: [],
		mutedWords: profile.mutedWords,
		hardMutedWords: profile.hardMutedWords,
		mutedInstances: profile.mutedInstances,
		mutingNotificationTypes: [],
		notificationRecieveConfig: profile.notificationRecieveConfig,
		emailNotificationTypes: profile.emailNotificationTypes,
		achievements: profile.achievements,
		loggedInDays: profile.loggedInDates.length,
		policies,
		email: profile.email,
		emailVerified: profile.emailVerified,
		securityKeysList: [],
		token,
	};
}

export async function signupWithHonoApi(deps: SignupDependencies, body: SignupBody): Promise<SignupResponse> {
	assertSignupGateOpen(deps.meta);
	validateUsername(body.username);
	validatePassword(body.password);

	const username = body.username;
	const normalizedHost = process.env.NODE_ENV === 'test' ? normalizeHost(body.host) : null;

	if (await isLocalUsernameTaken(deps.db, username)) {
		throw new SignupApiError(400, 'DUPLICATED_USERNAME');
	}

	if (await isUsedUsername(deps.db, username)) {
		throw new SignupApiError(400, 'USED_USERNAME');
	}

	if (deps.meta.rootUserId != null) {
		const usernameLower = username.toLowerCase();
		if (deps.meta.preservedUsernames.map(x => x.toLowerCase()).includes(usernameLower)) {
			throw new SignupApiError(400, 'USED_USERNAME');
		}

		if (isKeywordIncluded(usernameLower, deps.meta.prohibitedWordsForNameOfUser)) {
			throw new SignupApiError(400, 'USED_USERNAME');
		}
	}

	const salt = await bcrypt.genSalt(8);
	const hash = await bcrypt.hash(body.password, salt);
	const token = generateNativeUserToken();
	const keyPair = await genRsaKeyPair();
	const remoteUri = normalizedHost == null ? null : `https://${normalizedHost}/users/${username}`;
	const account = await createSignupAccountInDatabase(deps.db, {
		id: genId(deps.config),
		username,
		usernameLower: username.toLowerCase(),
		host: normalizedHost,
		uri: remoteUri,
		inbox: remoteUri == null ? null : `${remoteUri}/inbox`,
		sharedInbox: normalizedHost == null ? null : `https://${normalizedHost}/inbox`,
		followersUri: remoteUri == null ? null : `${remoteUri}/followers`,
		token,
		passwordHash: hash,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
	});

	await assignRootUserIfMissing(deps, account.id);

	return await packSignupUser(deps, account, token);
}
