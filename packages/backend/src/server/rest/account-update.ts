/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createPublicKey } from 'node:crypto';
import { domainToASCII } from 'node:url';
import RE2 from 're2';
import * as mfm from 'mfm-js';
import * as htmlParser from 'node-html-parser';
import type { Config } from '@/config.js';
import { listAvatarDecorationsFromDatabase } from '@/core/AvatarDecorationStore.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { fetchDriveFileByIdAndUserIdFromDatabase, fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { listLocalEmojisFromDatabase } from '@/core/EmojiStore.js';
import { recordHashtagUsageInDatabase } from '@/core/HashtagStore.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { MfmService } from '@/core/MfmService.js';
import { fetchPageByIdFromDatabase } from '@/core/PageStore.js';
import { listRolesFromDatabase } from '@/core/RoleStore.js';
import { appendVerifiedLinkToUserProfileInDatabase, fetchUserProfileByUserIdOrFailFromDatabase, updateUserProfileInDatabase, type UserProfileUpdate } from '@/core/UserProfileStore.js';
import { fetchUserByIdOrFailFromDatabase, fetchUserByUsernameAndHostFromDatabase, updateUserInDatabase, type UserUpdate } from '@/core/UserStore.js';
import { fetchUserKeypairFromDatabase } from '@/core/UserKeypairStore.js';
import { genId } from '@/misc/id/gen-id.js';
import * as Acct from '@/misc/acct.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { langmap } from '@/misc/langmap.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { safeForSql } from '@/misc/safe-for-sql.js';
import { birthdaySchema, descriptionSchema, followedMessageSchema, locationSchema, nameSchema } from '@/models/User.js';
import { notificationRecieveConfig } from '@/models/json-schema/user.js';
import type { MiMeta } from '@/models/_.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';
import { acceptAllFollowRequestsForHonoApi, type HonoApiFollowingDependencies } from './following.js';
import { HonoApiError } from './error.js';
import { addActivityContext, deliverNoteActivityForHonoApi, renderEmoji, renderUpdateForHonoApi, type HonoApiNoteApDependencies } from './notes-ap.js';
import { isKeyWordIncludedForHonoApi } from './notes-create.js';
import { getHonoApiRolePolicies, getHonoApiUserRoles, isHonoApiModerator, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { getIdenticonUrl, packMeDetailedForHonoApi, type MeDetailedHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAccountUpdateDependencies =
	HonoApiRolePolicyDependencies &
	HonoApiFollowingDependencies &
	UserPackingDependencies &
	HonoApiNoteApDependencies & {
		httpRequestService: Pick<HttpRequestService, 'getHtml'>;
	};

function iUpdateNoSuchAvatarError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such avatar file.', code: 'NO_SUCH_AVATAR', id: '539f3a45-f215-4f81-a9a8-31293640207f' });
}
function iUpdateNoSuchBannerError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such banner file.', code: 'NO_SUCH_BANNER', id: '0d8f5629-f210-41c2-9433-735831a58595' });
}
function iUpdateAvatarNotAnImageError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'The file specified as an avatar is not an image.', code: 'AVATAR_NOT_AN_IMAGE', id: 'f419f9f8-2f4d-46b1-9fb4-49d3a2fd7191' });
}
function iUpdateBannerNotAnImageError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'The file specified as a banner is not an image.', code: 'BANNER_NOT_AN_IMAGE', id: '75aedb19-2afd-4e6d-87fc-67941256fa60' });
}
function iUpdateNoSuchPageError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such page.', code: 'NO_SUCH_PAGE', id: '8e01b590-7eb9-431b-a239-860e086c408e' });
}
function iUpdateInvalidRegexpError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Invalid Regular Expression.', code: 'INVALID_REGEXP', id: '0d786918-10df-41cd-8f33-8dec7d9a89a5' });
}
function iUpdateTooManyMutedWordsError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Too many muted words.', code: 'TOO_MANY_MUTED_WORDS', id: '010665b1-a211-42d2-bc64-8f6609d79785' });
}
function iUpdateNoSuchUserError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5' });
}
function iUpdateUriNullError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'User ActivityPup URI is null.', code: 'URI_NULL', id: 'bf326f31-d430-4f97-9933-5d61e4d48a23' });
}
function iUpdateForbiddenToSetYourselfError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You can\'t set yourself as your own alias.', code: 'FORBIDDEN_TO_SET_YOURSELF', id: '25c90186-4ab0-49c8-9bba-a1fa6c202ba4' });
}
function iUpdateRestrictedByRoleError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'This feature is restricted by your role.', code: 'RESTRICTED_BY_ROLE', id: '8feff0ba-5ab5-585b-31f4-4df816663fad' });
}
function iUpdateNameContainsProhibitedWordsError(): HonoApiError {
	return new HonoApiError({ status: 422, message: 'Your new name contains prohibited words.', code: 'YOUR_NAME_CONTAINS_PROHIBITED_WORDS', id: '0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191' });
}
function iUpdateYourAccountMovedError(): HonoApiError {
	return new HonoApiError({ status: 403, message: 'You have moved your account.', code: 'YOUR_ACCOUNT_MOVED', id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31' });
}

const muteWords = { type: 'array', items: { oneOf: [
	{ type: 'array', items: { type: 'string' } },
	{ type: 'string' },
] } } as const;

const iUpdateParamDef = {
	type: 'object',
	properties: {
		name: { ...nameSchema, nullable: true },
		description: { ...descriptionSchema, nullable: true },
		followedMessage: { ...followedMessageSchema, nullable: true },
		location: { ...locationSchema, nullable: true },
		birthday: { ...birthdaySchema, nullable: true },
		lang: { type: 'string', enum: [null, ...Object.keys(langmap)] as string[], nullable: true },
		avatarId: { type: 'string', format: 'misskey:id', nullable: true },
		avatarDecorations: { type: 'array', maxItems: 16, items: {
			type: 'object',
			properties: {
				id: { type: 'string', format: 'misskey:id' },
				angle: { type: 'number', nullable: true, maximum: 0.5, minimum: -0.5 },
				flipH: { type: 'boolean', nullable: true },
				offsetX: { type: 'number', nullable: true, maximum: 0.25, minimum: -0.25 },
				offsetY: { type: 'number', nullable: true, maximum: 0.25, minimum: -0.25 },
			},
			required: ['id'],
		} },
		bannerId: { type: 'string', format: 'misskey:id', nullable: true },
		fields: {
			type: 'array',
			minItems: 0,
			maxItems: 16,
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					value: { type: 'string' },
				},
				required: ['name', 'value'],
			},
		},
		isLocked: { type: 'boolean' },
		isExplorable: { type: 'boolean' },
		hideOnlineStatus: { type: 'boolean' },
		publicReactions: { type: 'boolean' },
		carefulBot: { type: 'boolean' },
		autoAcceptFollowed: { type: 'boolean' },
		noCrawle: { type: 'boolean' },
		preventAiLearning: { type: 'boolean' },
		requireSigninToViewContents: { type: 'boolean' },
		makeNotesFollowersOnlyBefore: { type: 'integer', nullable: true },
		makeNotesHiddenBefore: { type: 'integer', nullable: true },
		isBot: { type: 'boolean' },
		isCat: { type: 'boolean' },
		injectFeaturedNote: { type: 'boolean' },
		receiveAnnouncementEmail: { type: 'boolean' },
		alwaysMarkNsfw: { type: 'boolean' },
		autoSensitive: { type: 'boolean' },
		followingVisibility: { type: 'string', enum: ['public', 'followers', 'private'] },
		followersVisibility: { type: 'string', enum: ['public', 'followers', 'private'] },
		chatScope: { type: 'string', enum: ['everyone', 'followers', 'following', 'mutual', 'none'] },
		pinnedPageId: { type: 'string', format: 'misskey:id', nullable: true },
		mutedWords: muteWords,
		hardMutedWords: muteWords,
		mutedInstances: { type: 'array', items: {
			type: 'string',
		} },
		notificationRecieveConfig: {
			type: 'object',
			nullable: false,
			properties: {
				note: notificationRecieveConfig,
				follow: notificationRecieveConfig,
				mention: notificationRecieveConfig,
				reply: notificationRecieveConfig,
				renote: notificationRecieveConfig,
				quote: notificationRecieveConfig,
				reaction: notificationRecieveConfig,
				pollEnded: notificationRecieveConfig,
				scheduledNotePosted: notificationRecieveConfig,
				scheduledNotePostFailed: notificationRecieveConfig,
				receiveFollowRequest: notificationRecieveConfig,
				followRequestAccepted: notificationRecieveConfig,
				roleAssigned: notificationRecieveConfig,
				chatRoomInvitationReceived: notificationRecieveConfig,
				achievementEarned: notificationRecieveConfig,
				app: notificationRecieveConfig,
				test: notificationRecieveConfig,
			},
		},
		emailNotificationTypes: { type: 'array', items: {
			type: 'string',
		} },
		alsoKnownAs: {
			type: 'array',
			maxItems: 10,
			uniqueItems: true,
			items: { type: 'string' },
		},
	},
} as const;

type IUpdateParams = {
	name?: string | null;
	description?: string | null;
	followedMessage?: string | null;
	location?: string | null;
	birthday?: string | null;
	lang?: string | null;
	avatarId?: string | null;
	avatarDecorations?: { id: string; angle?: number | null; flipH?: boolean | null; offsetX?: number | null; offsetY?: number | null }[];
	bannerId?: string | null;
	fields?: { name: string; value: string }[];
	isLocked?: boolean;
	isExplorable?: boolean;
	hideOnlineStatus?: boolean;
	publicReactions?: boolean;
	carefulBot?: boolean;
	autoAcceptFollowed?: boolean;
	noCrawle?: boolean;
	preventAiLearning?: boolean;
	requireSigninToViewContents?: boolean;
	makeNotesFollowersOnlyBefore?: number | null;
	makeNotesHiddenBefore?: number | null;
	isBot?: boolean;
	isCat?: boolean;
	injectFeaturedNote?: boolean;
	receiveAnnouncementEmail?: boolean;
	alwaysMarkNsfw?: boolean;
	autoSensitive?: boolean;
	followingVisibility?: 'public' | 'followers' | 'private';
	followersVisibility?: 'public' | 'followers' | 'private';
	chatScope?: 'everyone' | 'followers' | 'following' | 'mutual' | 'none';
	pinnedPageId?: string | null;
	mutedWords?: (string[] | string)[];
	hardMutedWords?: (string[] | string)[];
	mutedInstances?: string[];
	notificationRecieveConfig?: Record<string, unknown>;
	emailNotificationTypes?: string[];
	alsoKnownAs?: string[];
};

function checkMuteWordCount(mutedWords: (string[] | string)[], limit: number): void {
	const count = (arr: (string[] | string)[]) => {
		let length = 0;
		for (const item of arr) {
			if (typeof item === 'string') {
				length += item.length;
			} else if (Array.isArray(item)) {
				for (const subItem of item) {
					length += subItem.length;
				}
			}
		}
		return length;
	};
	if (count(mutedWords) > limit) throw iUpdateTooManyMutedWordsError();
}

function validateMuteWordRegex(mutedWords: (string[] | string)[]): void {
	for (const mutedWord of mutedWords) {
		if (typeof mutedWord !== 'string') continue;

		const regexp = mutedWord.match(/^\/(.+)\/(.*)$/);
		if (!regexp) throw iUpdateInvalidRegexpError();

		try {
			new RE2(regexp[1], regexp[2]);
		} catch {
			throw iUpdateInvalidRegexpError();
		}
	}
}

function genLocalUserUri(config: Pick<Config, 'url'>, userId: MiUser['id']): string {
	return `${config.url}/users/${userId}`;
}

function tryRewriteUrl(maybeUrl: string): string {
	const urlSafeRegex = /^(?:http[s]?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@%._+~#=]{2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_+.~#?&/=]*)/;
	try {
		const match = maybeUrl.match(urlSafeRegex);
		if (!match) return maybeUrl;

		const urlPart = match[0];
		const urlPartParsed = new URL(urlPart);
		const restPart = maybeUrl.slice(match[0].length);

		return `<a href="${urlPartParsed.href}" rel="me nofollow noopener" target="_blank">${urlPart}</a>${restPart}`;
	} catch {
		return maybeUrl;
	}
}

function renderKeyForHonoApi(config: Pick<Config, 'url'>, user: MiLocalUser, key: MiUserKeypair, postfix?: string): Record<string, unknown> {
	return {
		id: `${config.url}/users/${user.id}${postfix ?? '/publickey'}`,
		type: 'Key',
		owner: genLocalUserUri(config, user.id),
		publicKeyPem: createPublicKey(key.publicKey).export({ type: 'spki', format: 'pem' }),
	};
}

export async function renderPersonForHonoApi(deps: HonoApiAccountUpdateDependencies, user: MiLocalUser): Promise<Record<string, unknown>> {
	const id = genLocalUserUri(deps.config, user.id);
	const isSystem = user.username.includes('.');

	const [avatar, banner, profile, keypair] = await Promise.all([
		user.avatarId ? fetchDriveFileByIdFromDatabase(deps.db, user.avatarId) : Promise.resolve(undefined),
		user.bannerId ? fetchDriveFileByIdFromDatabase(deps.db, user.bannerId) : Promise.resolve(undefined),
		fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id),
		fetchUserKeypairFromDatabase(deps.db, user.id),
	]);

	const attachment = profile.fields.map(field => ({
		type: 'PropertyValue',
		name: field.name,
		value: (field.value.startsWith('http://') || field.value.startsWith('https://'))
			? tryRewriteUrl(field.value)
			: field.value,
	}));

	const localEmojis = user.emojis.length > 0 ? await listLocalEmojisFromDatabase(deps.db) : [];
	const localEmojiByName = new Map(localEmojis.map(e => [e.name, e]));
	const emojis = user.emojis.map(name => localEmojiByName.get(name)).filter(e => e != null);
	const apemojis = emojis.filter(emoji => !emoji.localOnly).map(emoji => renderEmoji(deps.config, emoji));

	const hashtagTags = user.tags.map(tag => ({
		type: 'Hashtag' as const,
		href: `${deps.config.url}/tags/${encodeURIComponent(tag)}`,
		name: `#${tag}`,
	}));

	const tag = [...apemojis, ...hashtagTags];

	const person: Record<string, unknown> = {
		type: isSystem ? 'Application' : user.isBot ? 'Service' : 'Person',
		id,
		inbox: `${id}/inbox`,
		outbox: `${id}/outbox`,
		followers: `${id}/followers`,
		following: `${id}/following`,
		featured: `${id}/collections/featured`,
		sharedInbox: `${deps.config.url}/inbox`,
		endpoints: { sharedInbox: `${deps.config.url}/inbox` },
		url: `${deps.config.url}/@${user.username}`,
		preferredUsername: user.username,
		name: user.name,
		summary: profile.description ? new MfmService(deps.config as Config).toHtml(mfm.parse(profile.description)) : null,
		_misskey_summary: profile.description,
		_misskey_followedMessage: profile.followedMessage,
		_misskey_requireSigninToViewContents: user.requireSigninToViewContents,
		_misskey_makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore,
		_misskey_makeNotesHiddenBefore: user.makeNotesHiddenBefore,
		icon: avatar ? { type: 'Image', url: getDriveFilePublicUrl(avatar, { config: deps.config as Config, meta: deps.meta as MiMeta }), sensitive: avatar.isSensitive, name: avatar.comment }
			: isSystem ? (deps.meta.iconUrl ? { type: 'Image', url: deps.meta.iconUrl, sensitive: false, name: null } : { type: 'Image', url: getIdenticonUrl(deps.config as Config, deps.meta as MiMeta, user), sensitive: false, name: null })
				: { type: 'Image', url: getIdenticonUrl(deps.config as Config, deps.meta as MiMeta, user), sensitive: false, name: null },
		image: banner ? { type: 'Image', url: getDriveFilePublicUrl(banner, { config: deps.config as Config, meta: deps.meta as MiMeta }), sensitive: banner.isSensitive, name: banner.comment }
			: isSystem ? (deps.meta.bannerUrl ? { type: 'Image', url: deps.meta.bannerUrl, sensitive: false, name: null } : null)
				: null,
		tag,
		manuallyApprovesFollowers: user.isLocked,
		discoverable: user.isExplorable,
		publicKey: renderKeyForHonoApi(deps.config, user, keypair, '#main-key'),
		isCat: user.isCat,
		attachment: attachment.length ? attachment : undefined,
	};

	if (user.movedToUri) person.movedTo = user.movedToUri;
	if (user.alsoKnownAs) person.alsoKnownAs = user.alsoKnownAs;
	if (profile.birthday) person['vcard:bday'] = profile.birthday;
	if (profile.location) person['vcard:Address'] = profile.location;

	return person;
}

export async function publishAccountUpdateToFollowersForHonoApi(deps: HonoApiAccountUpdateDependencies, userId: MiUser['id']): Promise<void> {
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, userId);
	if (user.host != null) return;

	const localUser = user as MiLocalUser;
	const person = await renderPersonForHonoApi(deps, localUser);
	const content = addActivityContext(deps.config, renderUpdateForHonoApi(deps.config, person, localUser));

	// リレーへの配信は LD-signature (attachLdSignature) が必要だが、hono 側に JsonLd 署名基盤が未移植のため見送っている。
	await deliverNoteActivityForHonoApi(deps, localUser, content, { directRecipients: [], deliverToFollowers: true });
}

function toPunyForHonoApi(host: string): string {
	return domainToASCII(host.toLowerCase());
}

async function resolveAlsoKnownAsUserForHonoApi(deps: HonoApiAccountUpdateDependencies, acct: string): Promise<MiUser> {
	const { username, host } = Acct.parse(acct);
	const normalizedHost = host == null || toPunyForHonoApi(host) === toPunyForHonoApi(deps.config.host) ? null : toPunyForHonoApi(host);
	const user = await fetchUserByUsernameAndHostFromDatabase(deps.db, username, normalizedHost);
	if (user == null) throw iUpdateNoSuchUserError();
	return user;
}

function getUserUriForHonoApi(config: Pick<Config, 'url'>, user: MiUser): string | null {
	return user.host != null ? user.uri : genLocalUserUri(config, user.id);
}

export async function updateUsertagsForHonoApi(deps: HonoApiAccountUpdateDependencies, user: MiUser, tags: string[]): Promise<void> {
	for (const tag of tags) {
		await recordHashtagUsageInDatabase(deps.db, {
			id: genId(deps.config),
			name: normalizeForSearch(tag),
			userId: user.id,
			isLocalUser: user.host == null,
			isRemoteUser: user.host != null,
			isUserAttached: true,
			increment: true,
		});
	}

	for (const tag of user.tags.filter(x => !tags.includes(x))) {
		await recordHashtagUsageInDatabase(deps.db, {
			id: genId(deps.config),
			name: normalizeForSearch(tag),
			userId: user.id,
			isLocalUser: user.host == null,
			isRemoteUser: user.host != null,
			isUserAttached: true,
			increment: false,
		});
	}
}

async function verifyLinkForHonoApi(deps: HonoApiAccountUpdateDependencies, url: string, user: MiLocalUser): Promise<void> {
	if (!safeForSql(url)) return;

	try {
		const html = await deps.httpRequestService.getHtml(url);
		const doc = htmlParser.parse(html);
		const myLink = `${deps.config.url}/@${user.username}`;

		const aEls = Array.from(doc.getElementsByTagName('a'));
		const linkEls = Array.from(doc.getElementsByTagName('link'));

		const includesMyLink = aEls.some(a => a.attributes.href === myLink);
		const includesRelMeLinks = [...aEls, ...linkEls].some(link => link.attributes.rel?.split(/\s+/).includes('me') && link.attributes.href === myLink);

		if (includesMyLink || includesRelMeLinks) {
			await appendVerifiedLinkToUserProfileInDatabase(deps.db, user.id, url);
		}
	} catch {
		// なにもしない
	}
}

export async function handleHonoApiIUpdate(
	deps: HonoApiAccountUpdateDependencies,
	me: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const ps = parseHonoApiParams(iUpdateParamDef, body) as IUpdateParams;
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, me.id) as MiLocalUser;
	const isSecure = token == null;

	const updates: UserUpdate = {};
	const profileUpdates: UserProfileUpdate = {};

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	let policies: Awaited<ReturnType<typeof getHonoApiRolePolicies>> | null = null;

	if (ps.name !== undefined) {
		if (ps.name === null) {
			updates.name = null;
		} else {
			const trimmedName = ps.name.trim();
			updates.name = trimmedName === '' ? null : trimmedName;
		}
	}
	if (ps.description !== undefined) profileUpdates.description = ps.description;
	if (ps.followedMessage !== undefined) profileUpdates.followedMessage = ps.followedMessage;
	if (ps.lang !== undefined) profileUpdates.lang = ps.lang as UserProfileUpdate['lang'];
	if (ps.location !== undefined) profileUpdates.location = ps.location;
	if (ps.birthday !== undefined) profileUpdates.birthday = ps.birthday;
	if (ps.followingVisibility !== undefined) profileUpdates.followingVisibility = ps.followingVisibility;
	if (ps.followersVisibility !== undefined) profileUpdates.followersVisibility = ps.followersVisibility;
	if (ps.chatScope !== undefined) updates.chatScope = ps.chatScope;

	if (ps.mutedWords !== undefined) {
		policies ??= await getHonoApiRolePolicies(deps, user);
		checkMuteWordCount(ps.mutedWords, policies.wordMuteLimit);
		validateMuteWordRegex(ps.mutedWords);

		profileUpdates.mutedWords = ps.mutedWords;
		profileUpdates.enableWordMute = ps.mutedWords.length > 0;
	}
	if (ps.hardMutedWords !== undefined) {
		policies ??= await getHonoApiRolePolicies(deps, user);
		checkMuteWordCount(ps.hardMutedWords, policies.wordMuteLimit);
		validateMuteWordRegex(ps.hardMutedWords);
		profileUpdates.hardMutedWords = ps.hardMutedWords;
	}
	if (ps.mutedInstances !== undefined) profileUpdates.mutedInstances = ps.mutedInstances;
	if (ps.notificationRecieveConfig !== undefined) profileUpdates.notificationRecieveConfig = ps.notificationRecieveConfig as UserProfileUpdate['notificationRecieveConfig'];
	if (typeof ps.isLocked === 'boolean') updates.isLocked = ps.isLocked;
	if (typeof ps.isExplorable === 'boolean') updates.isExplorable = ps.isExplorable;
	if (typeof ps.hideOnlineStatus === 'boolean') updates.hideOnlineStatus = ps.hideOnlineStatus;
	if (typeof ps.publicReactions === 'boolean') profileUpdates.publicReactions = ps.publicReactions;
	if (typeof ps.isBot === 'boolean') updates.isBot = ps.isBot;
	if (typeof ps.carefulBot === 'boolean') profileUpdates.carefulBot = ps.carefulBot;
	if (typeof ps.autoAcceptFollowed === 'boolean') profileUpdates.autoAcceptFollowed = ps.autoAcceptFollowed;
	if (typeof ps.noCrawle === 'boolean') profileUpdates.noCrawle = ps.noCrawle;
	if (typeof ps.preventAiLearning === 'boolean') profileUpdates.preventAiLearning = ps.preventAiLearning;
	if (typeof ps.requireSigninToViewContents === 'boolean') updates.requireSigninToViewContents = ps.requireSigninToViewContents;
	if ((typeof ps.makeNotesFollowersOnlyBefore === 'number') || (ps.makeNotesFollowersOnlyBefore === null)) updates.makeNotesFollowersOnlyBefore = ps.makeNotesFollowersOnlyBefore;
	if ((typeof ps.makeNotesHiddenBefore === 'number') || (ps.makeNotesHiddenBefore === null)) updates.makeNotesHiddenBefore = ps.makeNotesHiddenBefore;
	if (typeof ps.isCat === 'boolean') updates.isCat = ps.isCat;
	if (typeof ps.injectFeaturedNote === 'boolean') profileUpdates.injectFeaturedNote = ps.injectFeaturedNote;
	if (typeof ps.receiveAnnouncementEmail === 'boolean') profileUpdates.receiveAnnouncementEmail = ps.receiveAnnouncementEmail;
	if (typeof ps.alwaysMarkNsfw === 'boolean') {
		policies ??= await getHonoApiRolePolicies(deps, user);
		if (policies.alwaysMarkNsfw) throw iUpdateRestrictedByRoleError();
		profileUpdates.alwaysMarkNsfw = ps.alwaysMarkNsfw;
	}
	if (typeof ps.autoSensitive === 'boolean') profileUpdates.autoSensitive = ps.autoSensitive;
	if (ps.emailNotificationTypes !== undefined) profileUpdates.emailNotificationTypes = ps.emailNotificationTypes;

	if (ps.avatarId) {
		policies ??= await getHonoApiRolePolicies(deps, user);
		if (!policies.canUpdateBioMedia) throw iUpdateRestrictedByRoleError();

		const avatar = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, ps.avatarId, user.id);

		if (avatar == null) throw iUpdateNoSuchAvatarError();
		if (!avatar.type.startsWith('image/')) throw iUpdateAvatarNotAnImageError();

		updates.avatarId = avatar.id;
		updates.avatarUrl = getDriveFilePublicUrl(avatar, { config: deps.config as Config, meta: deps.meta as MiMeta, mode: 'avatar' });
		updates.avatarBlurhash = avatar.blurhash;
	} else if (ps.avatarId === null) {
		updates.avatarId = null;
		updates.avatarUrl = null;
		updates.avatarBlurhash = null;
	}

	if (ps.bannerId) {
		policies ??= await getHonoApiRolePolicies(deps, user);
		if (!policies.canUpdateBioMedia) throw iUpdateRestrictedByRoleError();

		const banner = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, ps.bannerId, user.id);

		if (banner == null) throw iUpdateNoSuchBannerError();
		if (!banner.type.startsWith('image/')) throw iUpdateBannerNotAnImageError();

		updates.bannerId = banner.id;
		updates.bannerUrl = getDriveFilePublicUrl(banner, { config: deps.config as Config, meta: deps.meta as MiMeta });
		updates.bannerBlurhash = banner.blurhash;
	} else if (ps.bannerId === null) {
		updates.bannerId = null;
		updates.bannerUrl = null;
		updates.bannerBlurhash = null;
	}

	if (ps.avatarDecorations) {
		policies ??= await getHonoApiRolePolicies(deps, user);
		const [decorations, myRoles, allRoles] = await Promise.all([
			listAvatarDecorationsFromDatabase(deps.db),
			getHonoApiUserRoles(deps, user),
			listRolesFromDatabase(deps.db),
		]);
		const decorationIds = decorations
			.filter(d => d.roleIdsThatCanBeUsedThisDecoration.filter(roleId => allRoles.some(r => r.id === roleId)).length === 0 || myRoles.some(r => d.roleIdsThatCanBeUsedThisDecoration.includes(r.id)))
			.map(d => d.id);

		if (ps.avatarDecorations.length > policies.avatarDecorationLimit) throw iUpdateRestrictedByRoleError();

		updates.avatarDecorations = ps.avatarDecorations.filter(d => decorationIds.includes(d.id)).map(d => ({
			id: d.id,
			angle: d.angle ?? 0,
			flipH: d.flipH ?? false,
			offsetX: d.offsetX ?? 0,
			offsetY: d.offsetY ?? 0,
		}));
	}

	if (ps.pinnedPageId) {
		const page = await fetchPageByIdFromDatabase(deps.db, ps.pinnedPageId);

		if (page == null || page.userId !== user.id) throw iUpdateNoSuchPageError();

		profileUpdates.pinnedPageId = page.id;
	} else if (ps.pinnedPageId === null) {
		profileUpdates.pinnedPageId = null;
	}

	if (ps.fields) {
		profileUpdates.fields = ps.fields
			.filter(x => typeof x.name === 'string' && x.name.trim() !== '' && typeof x.value === 'string' && x.value.trim() !== '')
			.map(x => ({ name: x.name.trim(), value: x.value.trim() }));
	}

	if (ps.alsoKnownAs) {
		if (me.movedToUri) throw iUpdateYourAccountMovedError();

		const newAlsoKnownAs = new Set<string>();
		for (const line of ps.alsoKnownAs) {
			if (!line) throw iUpdateNoSuchUserError();

			const knownAs = await resolveAlsoKnownAsUserForHonoApi(deps, line);
			if (knownAs.id === me.id) throw iUpdateForbiddenToSetYourselfError();

			const toUrl = getUserUriForHonoApi(deps.config, knownAs);
			if (!toUrl) throw iUpdateUriNullError();

			newAlsoKnownAs.add(toUrl);
		}

		updates.alsoKnownAs = newAlsoKnownAs.size > 0 ? Array.from(newAlsoKnownAs).join(',') : null;
	}

	//#region emojis/tags

	let emojis: string[] = [];
	let tags: string[] = [];

	const newName = updates.name === undefined ? user.name : updates.name;
	const newDescription = profileUpdates.description === undefined ? profile.description : profileUpdates.description;
	const newFields = profileUpdates.fields === undefined ? profile.fields : profileUpdates.fields;
	const newFollowedMessage = profileUpdates.followedMessage === undefined ? profile.followedMessage : profileUpdates.followedMessage;

	if (newName != null) {
		let hasProhibitedWords = false;
		if (!await isHonoApiModerator(deps, user)) {
			hasProhibitedWords = isKeyWordIncludedForHonoApi(newName, deps.meta.prohibitedWordsForNameOfUser);
		}
		if (hasProhibitedWords) throw iUpdateNameContainsProhibitedWordsError();

		const tokens = mfm.parseSimple(newName);
		emojis = emojis.concat(extractCustomEmojisFromMfm(tokens));
	}

	if (newDescription != null) {
		const tokens = mfm.parse(newDescription);
		emojis = emojis.concat(extractCustomEmojisFromMfm(tokens));
		tags = extractHashtags(tokens).map(tag => normalizeForSearch(tag)).splice(0, 32);
	}

	for (const field of newFields) {
		const nameTokens = mfm.parseSimple(field.name);
		const valueTokens = mfm.parseSimple(field.value);
		emojis = emojis.concat([
			...extractCustomEmojisFromMfm(nameTokens),
			...extractCustomEmojisFromMfm(valueTokens),
		]);
	}

	if (newFollowedMessage != null) {
		const tokens = mfm.parse(newFollowedMessage);
		emojis = emojis.concat(extractCustomEmojisFromMfm(tokens));
	}

	updates.emojis = emojis;
	updates.tags = tags;

	// ハッシュタグ更新 (ランキング更新 (Redis) は hono 側未移植のため見送り)
	void updateUsertagsForHonoApi(deps, user, tags).catch(() => {});
	//#endregion

	if (Object.keys(updates).length > 0) {
		await updateUserInDatabase(deps.db, user.id, updates);
		deps.publishInternalEvent?.('localUserUpdated', { id: user.id });
	}

	await updateUserProfileInDatabase(deps.db, user.id, {
		...profileUpdates,
		verifiedLinks: [],
	});

	const freshUser = await fetchUserByIdOrFailFromDatabase(deps.db, user.id) as MiLocalUser;
	const iObj = await packMeDetailedForHonoApi(deps, freshUser, { includeSecrets: isSecure });

	const updatedProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);

	// Publish meUpdated event
	deps.publishMainStream?.(user.id, 'meUpdated', iObj);

	// 鍵垢を解除したとき、溜まっていたフォローリクエストがあるならすべて承認
	if (user.isLocked && ps.isLocked === false) {
		void acceptAllFollowRequestsForHonoApi(deps, user).catch(() => {});
	}

	// フォロワーにUpdateを配信
	void publishAccountUpdateToFollowersForHonoApi(deps, user.id).catch(() => {});

	const urls = updatedProfile.fields.filter(x => x.value.startsWith('https://'));
	for (const url of urls) {
		void verifyLinkForHonoApi(deps, url.value, user);
	}

	return iObj;
}
