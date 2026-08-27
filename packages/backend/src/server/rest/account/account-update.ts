/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createPublicKey } from 'node:crypto';
import { toPuny } from '@/misc/to-puny.js';
import type * as Redis from 'ioredis';
import * as mfm from 'mfm-js';
import * as htmlParser from 'node-html-parser';
import type { Config } from '@/config.js';
import RE2 from '@/misc/re2.js';
import { listAvatarDecorationsFromDatabase } from '@/core/avatar-decoration/AvatarDecorationStore.js';
import { getDriveFilePublicUrl } from '@/core/drive/DriveFilePublicUrl.js';
import { getIdenticonUrl } from '@/core/drive/IdenticonUrl.js';
import {
	fetchDriveFileByIdAndUserIdFromDatabase,
	fetchDriveFileByIdFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import { listLocalEmojisFromDatabase } from '@/core/emoji/EmojiStore.js';
import { recordHashtagUsagesInDatabase } from '@/core/hashtag/HashtagStore.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { createMfmService } from '@/core/mfm/MfmService.js';
import { fetchPageByIdFromDatabase } from '@/core/page/PageStore.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import {
	appendVerifiedLinkToUserProfileInDatabase,
	fetchUserProfileByUserIdOrFailFromDatabase,
	updateUserProfileInDatabase,
	type UserProfileUpdate,
} from '@/core/user/UserProfileStore.js';
import { fetchUserByIdOrFailFromDatabase, updateUserInDatabase, type UserUpdate } from '@/core/user/UserStore.js';
import { fetchUserKeypairFromDatabaseCached } from '@/core/user/UserKeypairStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import * as Acct from '@/misc/acct.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { langmap } from 'misskey-js/langmap.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { safeForSql } from '@/misc/safe-for-sql.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { misskeyId, uniqueItems } from '@/misc/zod-params.js';
import {
	birthdaySchema,
	descriptionSchema,
	followedMessageSchema,
	locationSchema,
	nameSchema,
	profileFieldNameSchema,
	profileFieldValueSchema,
} from '@/models/User.js';
import { notificationRecieveConfigZodSchema } from '@/models/json-schema/user.js';
import type { MiMeta } from '@/models/_.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';
import { acceptAllFollowRequestsForApi, genLocalUserUri, type ApiFollowingDependencies } from '../user/following.js';
import { ApiError } from '../error.js';
import {
	addActivityContext,
	deliverNoteActivityForApi,
	renderEmoji,
	renderUpdateForApi,
	type ApiNoteApDependencies,
} from '../activitypub/notes-ap.js';
import { isKeyWordIncludedForApi, updateHashtagsRankingsForApi } from '../note/notes-create.js';
import {
	getApiRolePolicies,
	getApiUserRoles,
	isApiModerator,
	type ApiRolePolicyDependencies,
} from '../role/role-policy.js';
import { packMeDetailedForApi, type MeDetailedApiResponse, type UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';
import { resolveUserForApi, type ApiApPersonDependencies } from '../activitypub/ap-person.js';

export type ApiAccountUpdateDependencies = ApiRolePolicyDependencies &
	ApiFollowingDependencies &
	UserPackingDependencies &
	ApiNoteApDependencies & {
		httpRequestService: Pick<HttpRequestService, 'getHtml'>;
		/** hashtag ランキング (updateHashtagsRankingsForApi) 用。 */
		redis: Redis.Redis;
	};

type RenderedPerson = Record<string, unknown> & {
	movedTo?: string;
	alsoKnownAs?: string[];
};

function iUpdateNoSuchAvatarError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such avatar file.',
		code: 'NO_SUCH_AVATAR',
		id: '539f3a45-f215-4f81-a9a8-31293640207f',
	});
}
function iUpdateNoSuchBannerError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such banner file.',
		code: 'NO_SUCH_BANNER',
		id: '0d8f5629-f210-41c2-9433-735831a58595',
	});
}
function iUpdateAvatarNotAnImageError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'The file specified as an avatar is not an image.',
		code: 'AVATAR_NOT_AN_IMAGE',
		id: 'f419f9f8-2f4d-46b1-9fb4-49d3a2fd7191',
	});
}
function iUpdateBannerNotAnImageError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'The file specified as a banner is not an image.',
		code: 'BANNER_NOT_AN_IMAGE',
		id: '75aedb19-2afd-4e6d-87fc-67941256fa60',
	});
}
function iUpdateNoSuchPageError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such page.',
		code: 'NO_SUCH_PAGE',
		id: '8e01b590-7eb9-431b-a239-860e086c408e',
	});
}
function iUpdateInvalidRegexpError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Invalid Regular Expression.',
		code: 'INVALID_REGEXP',
		id: '0d786918-10df-41cd-8f33-8dec7d9a89a5',
	});
}
function iUpdateTooManyMutedWordsError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Too many muted words.',
		code: 'TOO_MANY_MUTED_WORDS',
		id: '010665b1-a211-42d2-bc64-8f6609d79785',
	});
}
function iUpdateNoSuchUserError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
	});
}
function iUpdateUriNullError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'User ActivityPup URI is null.',
		code: 'URI_NULL',
		id: 'bf326f31-d430-4f97-9933-5d61e4d48a23',
	});
}
function iUpdateForbiddenToSetYourselfError(): ApiError {
	return new ApiError({
		status: 400,
		message: "You can't set yourself as your own alias.",
		code: 'FORBIDDEN_TO_SET_YOURSELF',
		id: '25c90186-4ab0-49c8-9bba-a1fa6c202ba4',
	});
}
function iUpdateRestrictedByRoleError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'This feature is restricted by your role.',
		code: 'RESTRICTED_BY_ROLE',
		id: '8feff0ba-5ab5-585b-31f4-4df816663fad',
	});
}
function iUpdateNameContainsProhibitedWordsError(): ApiError {
	return new ApiError({
		status: 422,
		message: 'Your new name contains prohibited words.',
		code: 'YOUR_NAME_CONTAINS_PROHIBITED_WORDS',
		id: '0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191',
	});
}
function iUpdateYourAccountMovedError(): ApiError {
	return new ApiError({
		status: 403,
		message: 'You have moved your account.',
		code: 'YOUR_ACCOUNT_MOVED',
		id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31',
		kind: 'permission',
	});
}

const muteWordsZodSchema = z.array(z.union([z.array(z.string()), z.string()]));

export const iUpdateParamDef = z.object({
	name: nameSchema.nullable().optional(),
	description: descriptionSchema.nullable().optional(),
	followedMessage: followedMessageSchema.nullable().optional(),
	location: locationSchema.nullable().optional(),
	birthday: birthdaySchema.nullable().optional(),
	lang: z.union([z.enum(Object.keys(langmap) as [string, ...string[]]), z.null()]).optional(),
	avatarId: misskeyId().nullable().optional(),
	avatarDecorations: z
		.array(
			z.object({
				id: misskeyId(),
				angle: z.number().min(-0.5).max(0.5).nullable().optional(),
				flipH: z.boolean().nullable().optional(),
				offsetX: z.number().min(-0.25).max(0.25).nullable().optional(),
				offsetY: z.number().min(-0.25).max(0.25).nullable().optional(),
			}),
		)
		.max(16)
		.optional(),
	bannerId: misskeyId().nullable().optional(),
	fields: z
		.array(
			z.object({
				name: profileFieldNameSchema,
				value: profileFieldValueSchema,
			}),
		)
		.min(0)
		.max(16)
		.optional(),
	isLocked: z.boolean().optional(),
	isExplorable: z.boolean().optional(),
	hideOnlineStatus: z.boolean().optional(),
	publicReactions: z.boolean().optional(),
	carefulBot: z.boolean().optional(),
	autoAcceptFollowed: z.boolean().optional(),
	noCrawle: z.boolean().optional(),
	preventAiLearning: z.boolean().optional(),
	requireSigninToViewContents: z.boolean().optional(),
	makeNotesFollowersOnlyBefore: z.int().nullable().optional(),
	makeNotesHiddenBefore: z.int().nullable().optional(),
	isBot: z.boolean().optional(),
	isCat: z.boolean().optional(),
	injectFeaturedNote: z.boolean().optional(),
	receiveAnnouncementEmail: z.boolean().optional(),
	alwaysMarkNsfw: z.boolean().optional(),
	autoSensitive: z.boolean().optional(),
	followingVisibility: z.enum(['public', 'followers', 'private']).optional(),
	followersVisibility: z.enum(['public', 'followers', 'private']).optional(),
	chatScope: z.enum(['everyone', 'followers', 'following', 'mutual', 'none']).optional(),
	pinnedPageId: misskeyId().nullable().optional(),
	mutedWords: muteWordsZodSchema.optional(),
	hardMutedWords: muteWordsZodSchema.optional(),
	mutedInstances: z.array(z.string()).optional(),
	notificationRecieveConfig: z
		.object({
			note: notificationRecieveConfigZodSchema.optional(),
			follow: notificationRecieveConfigZodSchema.optional(),
			mention: notificationRecieveConfigZodSchema.optional(),
			reply: notificationRecieveConfigZodSchema.optional(),
			renote: notificationRecieveConfigZodSchema.optional(),
			quote: notificationRecieveConfigZodSchema.optional(),
			reaction: notificationRecieveConfigZodSchema.optional(),
			pollEnded: notificationRecieveConfigZodSchema.optional(),
			scheduledNotePosted: notificationRecieveConfigZodSchema.optional(),
			scheduledNotePostFailed: notificationRecieveConfigZodSchema.optional(),
			receiveFollowRequest: notificationRecieveConfigZodSchema.optional(),
			followRequestAccepted: notificationRecieveConfigZodSchema.optional(),
			roleAssigned: notificationRecieveConfigZodSchema.optional(),
			chatRoomInvitationReceived: notificationRecieveConfigZodSchema.optional(),
			achievementEarned: notificationRecieveConfigZodSchema.optional(),
			app: notificationRecieveConfigZodSchema.optional(),
			test: notificationRecieveConfigZodSchema.optional(),
		})
		.optional(),
	emailNotificationTypes: z.array(z.string()).optional(),
	alsoKnownAs: uniqueItems(z.array(z.string()).max(10)).optional(),
});

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
			const [, pattern, flags] = regexp;
			if (pattern == null || flags == null) throw iUpdateInvalidRegexpError();
			// 正規表現として妥当かどうかだけを見る (不正なら throw する)
			void new RE2(pattern, flags);
		} catch {
			throw iUpdateInvalidRegexpError();
		}
	}
}

function tryRewriteUrl(maybeUrl: string): string {
	const urlSafeRegex =
		/^(?:http[s]?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@%._+~#=]{2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_+.~#?&/=]*)/;
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

export function renderKeyForApi(
	config: Pick<Config, 'instance'>,
	user: MiLocalUser,
	key: MiUserKeypair,
	postfix?: string,
): Record<string, unknown> {
	return {
		id: `${config.instance.url}/users/${user.id}${postfix ?? '/publickey'}`,
		type: 'Key',
		owner: genLocalUserUri(config, user.id),
		publicKeyPem: createPublicKey(key.publicKey).export({ type: 'spki', format: 'pem' }),
	};
}

export async function renderPersonForApi(
	deps: ApiAccountUpdateDependencies,
	user: MiLocalUser,
): Promise<Record<string, unknown>> {
	const id = genLocalUserUri(deps.config, user.id);
	const isSystem = user.username.includes('.');

	const [avatar, banner, profile, keypair] = await Promise.all([
		user.avatarId ? fetchDriveFileByIdFromDatabase(deps.db, user.avatarId) : Promise.resolve(undefined),
		user.bannerId ? fetchDriveFileByIdFromDatabase(deps.db, user.bannerId) : Promise.resolve(undefined),
		fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id),
		fetchUserKeypairFromDatabaseCached(deps.db, user.id),
	]);

	const attachment = profile.fields.map((field) => ({
		type: 'PropertyValue',
		name: field.name,
		value:
			field.value.startsWith('http://') || field.value.startsWith('https://')
				? tryRewriteUrl(field.value)
				: field.value,
	}));

	const localEmojis = user.emojis.length > 0 ? await listLocalEmojisFromDatabase(deps.db) : [];
	const localEmojiByName = new Map(localEmojis.map((e) => [e.name, e]));
	const emojis = user.emojis.map((name) => localEmojiByName.get(name)).filter((e) => e != null);
	const apemojis = emojis.filter((emoji) => !emoji.localOnly).map((emoji) => renderEmoji(deps.config, emoji));

	const hashtagTags = user.tags.map((tag) => ({
		type: 'Hashtag' as const,
		href: `${deps.config.instance.url}/tags/${encodeURIComponent(tag)}`,
		name: `#${tag}`,
	}));

	const tag = [...apemojis, ...hashtagTags];

	const person: RenderedPerson = {
		type: isSystem ? 'Application' : user.isBot ? 'Service' : 'Person',
		id,
		inbox: `${id}/inbox`,
		outbox: `${id}/outbox`,
		followers: `${id}/followers`,
		following: `${id}/following`,
		featured: `${id}/collections/featured`,
		sharedInbox: `${deps.config.instance.url}/inbox`,
		endpoints: { sharedInbox: `${deps.config.instance.url}/inbox` },
		url: `${deps.config.instance.url}/@${user.username}`,
		published: parseId(user.id).date.toISOString(),
		preferredUsername: user.username,
		name: user.name,
		summary: profile.description
			? createMfmService(deps.config as Config).toHtml(mfm.parse(profile.description))
			: null,
		_misskey_summary: profile.description,
		_misskey_followedMessage: profile.followedMessage,
		_misskey_requireSigninToViewContents: user.requireSigninToViewContents,
		_misskey_makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore,
		_misskey_makeNotesHiddenBefore: user.makeNotesHiddenBefore,
		icon: avatar
			? {
					type: 'Image',
					url: getDriveFilePublicUrl(avatar, { config: deps.config as Config, meta: deps.meta as MiMeta }),
					sensitive: avatar.isSensitive,
					name: avatar.comment,
				}
			: isSystem
				? deps.meta.iconUrl
					? { type: 'Image', url: deps.meta.iconUrl, sensitive: false, name: null }
					: {
							type: 'Image',
							url: getIdenticonUrl(deps.config as Config, deps.meta as MiMeta, user),
							sensitive: false,
							name: null,
						}
				: {
						type: 'Image',
						url: getIdenticonUrl(deps.config as Config, deps.meta as MiMeta, user),
						sensitive: false,
						name: null,
					},
		image: banner
			? {
					type: 'Image',
					url: getDriveFilePublicUrl(banner, { config: deps.config as Config, meta: deps.meta as MiMeta }),
					sensitive: banner.isSensitive,
					name: banner.comment,
				}
			: isSystem
				? deps.meta.bannerUrl
					? { type: 'Image', url: deps.meta.bannerUrl, sensitive: false, name: null }
					: null
				: null,
		tag,
		manuallyApprovesFollowers: user.isLocked,
		discoverable: user.isExplorable,
		publicKey: renderKeyForApi(deps.config, user, keypair, '#main-key'),
		isCat: user.isCat,
		attachment: attachment.length ? attachment : undefined,
	};

	if (user.movedToUri) person.movedTo = user.movedToUri;
	if (user.alsoKnownAs) person.alsoKnownAs = user.alsoKnownAs;
	if (profile.birthday) person['vcard:bday'] = profile.birthday;
	if (profile.location) person['vcard:Address'] = profile.location;

	return person;
}

async function publishAccountUpdateToFollowersForApi(
	deps: ApiAccountUpdateDependencies,
	userId: MiUser['id'],
): Promise<void> {
	const user = await fetchUserByIdOrFailFromDatabase(deps.db, userId);
	if (user.host != null) return;

	const localUser = user as MiLocalUser;
	const person = await renderPersonForApi(deps, localUser);
	const content = addActivityContext(deps.config, renderUpdateForApi(deps.config, person, localUser));

	// リレー配送には LD-signature が必要なため、署名しないこの経路ではフォロワー配送だけを行う。
	await deliverNoteActivityForApi(deps, localUser, content, { directRecipients: [], deliverToFollowers: true });
}

async function resolveAlsoKnownAsUserForApi(deps: ApiAccountUpdateDependencies, acct: string): Promise<MiUser> {
	const { username, host } = Acct.parse(acct);
	const normalizedHost = host == null || toPuny(host) === toPuny(deps.config.runtime.host) ? null : toPuny(host);
	// 未知のリモートユーザーは WebFinger で解決する。
	// deps の型に ApiApPersonDependencies を混ぜると型エイリアスが循環参照になるため、呼び出し時にキャストする
	// (shell の実 deps は両方を満たす)
	return await resolveUserForApi(deps as unknown as ApiApPersonDependencies, username, normalizedHost).catch(() => {
		throw iUpdateNoSuchUserError();
	});
}

function getUserUriForApi(config: Pick<Config, 'instance'>, user: MiUser): string | null {
	return user.host != null ? user.uri : genLocalUserUri(config, user.id);
}

export async function updateUsertagsForApi(
	deps: ApiAccountUpdateDependencies,
	user: MiUser,
	tags: string[],
): Promise<void> {
	const attachedNames = [...new Set(tags.map((tag) => normalizeForSearch(tag)))];
	const detachedNames = [
		...new Set(user.tags.filter((tag) => !tags.includes(tag)).map((tag) => normalizeForSearch(tag))),
	];
	// ランキング更新は fire-and-forget とし、タグ更新処理を待たせない。
	void updateHashtagsRankingsForApi(deps, [...attachedNames, ...detachedNames], user.id).catch(() => {});
	await recordHashtagUsagesInDatabase(deps.db, {
		entries: attachedNames.map((name) => ({ id: genId(), name })),
		userId: user.id,
		isLocalUser: user.host == null,
		isRemoteUser: user.host != null,
		isUserAttached: true,
		increment: true,
	});
	await recordHashtagUsagesInDatabase(deps.db, {
		entries: detachedNames.map((name) => ({ id: genId(), name })),
		userId: user.id,
		isLocalUser: user.host == null,
		isRemoteUser: user.host != null,
		isUserAttached: true,
		increment: false,
	});
}

async function verifyLinkForApi(deps: ApiAccountUpdateDependencies, url: string, user: MiLocalUser): Promise<void> {
	if (!safeForSql(url)) return;

	try {
		const html = await deps.httpRequestService.getHtml(url);
		const doc = htmlParser.parse(html);
		const myLink = `${deps.config.instance.url}/@${user.username}`;

		const aEls = Array.from(doc.getElementsByTagName('a'));
		const linkEls = Array.from(doc.getElementsByTagName('link'));

		const includesMyLink = aEls.some((a) => a.attributes['href'] === myLink);
		const includesRelMeLinks = [...aEls, ...linkEls].some(
			(link) => link.attributes['rel']?.split(/\s+/).includes('me') && link.attributes['href'] === myLink,
		);

		if (includesMyLink || includesRelMeLinks) {
			await appendVerifiedLinkToUserProfileInDatabase(deps.db, user.id, url);
		}
	} catch {
		// なにもしない
	}
}

export async function handleApiIUpdate(
	deps: ApiAccountUpdateDependencies,
	me: MiLocalUser,
	token: MiAccessToken | null,
	body: Record<string, unknown>,
): Promise<MeDetailedApiResponse> {
	const ps = parseApiParams(iUpdateParamDef, body);
	const user = (await fetchUserByIdOrFailFromDatabase(deps.db, me.id)) as MiLocalUser;
	const isSecure = token == null;

	const updates: UserUpdate = {};
	const profileUpdates: UserProfileUpdate = {};

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	let policies: Awaited<ReturnType<typeof getApiRolePolicies>> | null = null;

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
	if (ps.lang !== undefined) profileUpdates.lang = ps.lang;
	if (ps.location !== undefined) profileUpdates.location = ps.location;
	if (ps.birthday !== undefined) profileUpdates.birthday = ps.birthday;
	if (ps.followingVisibility !== undefined) profileUpdates.followingVisibility = ps.followingVisibility;
	if (ps.followersVisibility !== undefined) profileUpdates.followersVisibility = ps.followersVisibility;
	if (ps.chatScope !== undefined) updates.chatScope = ps.chatScope;

	if (ps.mutedWords !== undefined) {
		policies ??= await getApiRolePolicies(deps, user);
		checkMuteWordCount(ps.mutedWords, policies.wordMuteLimit);
		validateMuteWordRegex(ps.mutedWords);

		profileUpdates.mutedWords = ps.mutedWords;
		profileUpdates.enableWordMute = ps.mutedWords.length > 0;
	}
	if (ps.hardMutedWords !== undefined) {
		policies ??= await getApiRolePolicies(deps, user);
		checkMuteWordCount(ps.hardMutedWords, policies.wordMuteLimit);
		validateMuteWordRegex(ps.hardMutedWords);
		profileUpdates.hardMutedWords = ps.hardMutedWords;
	}
	if (ps.mutedInstances !== undefined) profileUpdates.mutedInstances = ps.mutedInstances;
	if (ps.notificationRecieveConfig !== undefined)
		profileUpdates.notificationRecieveConfig = omitUndefined(ps.notificationRecieveConfig);
	if (typeof ps.isLocked === 'boolean') updates.isLocked = ps.isLocked;
	if (typeof ps.isExplorable === 'boolean') updates.isExplorable = ps.isExplorable;
	if (typeof ps.hideOnlineStatus === 'boolean') updates.hideOnlineStatus = ps.hideOnlineStatus;
	if (typeof ps.publicReactions === 'boolean') profileUpdates.publicReactions = ps.publicReactions;
	if (typeof ps.isBot === 'boolean') updates.isBot = ps.isBot;
	if (typeof ps.carefulBot === 'boolean') profileUpdates.carefulBot = ps.carefulBot;
	if (typeof ps.autoAcceptFollowed === 'boolean') profileUpdates.autoAcceptFollowed = ps.autoAcceptFollowed;
	if (typeof ps.noCrawle === 'boolean') profileUpdates.noCrawle = ps.noCrawle;
	if (typeof ps.preventAiLearning === 'boolean') profileUpdates.preventAiLearning = ps.preventAiLearning;
	if (typeof ps.requireSigninToViewContents === 'boolean')
		updates.requireSigninToViewContents = ps.requireSigninToViewContents;
	if (typeof ps.makeNotesFollowersOnlyBefore === 'number' || ps.makeNotesFollowersOnlyBefore === null)
		updates.makeNotesFollowersOnlyBefore = ps.makeNotesFollowersOnlyBefore;
	if (typeof ps.makeNotesHiddenBefore === 'number' || ps.makeNotesHiddenBefore === null)
		updates.makeNotesHiddenBefore = ps.makeNotesHiddenBefore;
	if (typeof ps.isCat === 'boolean') updates.isCat = ps.isCat;
	if (typeof ps.injectFeaturedNote === 'boolean') profileUpdates.injectFeaturedNote = ps.injectFeaturedNote;
	if (typeof ps.receiveAnnouncementEmail === 'boolean')
		profileUpdates.receiveAnnouncementEmail = ps.receiveAnnouncementEmail;
	if (typeof ps.alwaysMarkNsfw === 'boolean') {
		policies ??= await getApiRolePolicies(deps, user);
		if (policies.alwaysMarkNsfw) throw iUpdateRestrictedByRoleError();
		profileUpdates.alwaysMarkNsfw = ps.alwaysMarkNsfw;
	}
	if (typeof ps.autoSensitive === 'boolean') profileUpdates.autoSensitive = ps.autoSensitive;
	if (ps.emailNotificationTypes !== undefined) profileUpdates.emailNotificationTypes = ps.emailNotificationTypes;

	if (ps.avatarId) {
		policies ??= await getApiRolePolicies(deps, user);
		if (!policies.canUpdateBioMedia) throw iUpdateRestrictedByRoleError();

		const avatar = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, ps.avatarId, user.id);

		if (avatar == null) throw iUpdateNoSuchAvatarError();
		if (!avatar.type.startsWith('image/')) throw iUpdateAvatarNotAnImageError();

		updates.avatarId = avatar.id;
		updates.avatarUrl = getDriveFilePublicUrl(avatar, {
			config: deps.config as Config,
			meta: deps.meta as MiMeta,
			mode: 'avatar',
		});
		updates.avatarBlurhash = avatar.blurhash;
	} else if (ps.avatarId === null) {
		updates.avatarId = null;
		updates.avatarUrl = null;
		updates.avatarBlurhash = null;
	}

	if (ps.bannerId) {
		policies ??= await getApiRolePolicies(deps, user);
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
		policies ??= await getApiRolePolicies(deps, user);
		const [decorations, myRoles, allRoles] = await Promise.all([
			listAvatarDecorationsFromDatabase(deps.db),
			getApiUserRoles(deps, user),
			listRolesFromDatabase(deps.db),
		]);
		const allRoleIds = new Set(allRoles.map((role) => role.id));
		const myRoleIds = new Set(myRoles.map((role) => role.id));
		const decorationIds = decorations
			.filter(
				(d) =>
					d.roleIdsThatCanBeUsedThisDecoration.filter((roleId) => allRoleIds.has(roleId)).length === 0 ||
					d.roleIdsThatCanBeUsedThisDecoration.some((roleId) => myRoleIds.has(roleId)),
			)
			.map((d) => d.id);
		const decorationIdSet = new Set(decorationIds);

		if (ps.avatarDecorations.length > policies.avatarDecorationLimit) throw iUpdateRestrictedByRoleError();

		updates.avatarDecorations = ps.avatarDecorations
			.filter((d) => decorationIdSet.has(d.id))
			.map((d) => ({
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
			.filter(
				(x) =>
					typeof x.name === 'string' && x.name.trim() !== '' && typeof x.value === 'string' && x.value.trim() !== '',
			)
			.map((x) => ({ name: x.name.trim(), value: x.value.trim() }));
	}

	if (ps.alsoKnownAs) {
		if (me.movedToUri) throw iUpdateYourAccountMovedError();

		const newAlsoKnownAs = new Set<string>();
		for (const line of ps.alsoKnownAs) {
			if (!line) throw iUpdateNoSuchUserError();

			const knownAs = await resolveAlsoKnownAsUserForApi(deps, line);
			if (knownAs.id === me.id) throw iUpdateForbiddenToSetYourselfError();

			const toUrl = getUserUriForApi(deps.config, knownAs);
			if (!toUrl) throw iUpdateUriNullError();

			newAlsoKnownAs.add(toUrl);
		}

		updates.alsoKnownAs = newAlsoKnownAs.size > 0 ? Array.from(newAlsoKnownAs).join(',') : null;
	}

	const emojis: string[] = [];
	let tags: string[] = [];

	const newName = updates.name === undefined ? user.name : updates.name;
	const newDescription = profileUpdates.description === undefined ? profile.description : profileUpdates.description;
	const newFields = profileUpdates.fields === undefined ? profile.fields : profileUpdates.fields;
	const newFollowedMessage =
		profileUpdates.followedMessage === undefined ? profile.followedMessage : profileUpdates.followedMessage;

	if (newName != null) {
		let hasProhibitedWords = false;
		if (!(await isApiModerator(deps, user))) {
			hasProhibitedWords = isKeyWordIncludedForApi(newName, deps.meta.prohibitedWordsForNameOfUser);
		}
		if (hasProhibitedWords) throw iUpdateNameContainsProhibitedWordsError();

		const tokens = mfm.parseSimple(newName);
		emojis.push(...extractCustomEmojisFromMfm(tokens));
	}

	if (newDescription != null) {
		const tokens = mfm.parse(newDescription);
		emojis.push(...extractCustomEmojisFromMfm(tokens));
		tags = extractHashtags(tokens)
			.map((tag) => normalizeForSearch(tag))
			.splice(0, 32);
	}

	for (const field of newFields) {
		const nameTokens = mfm.parseSimple(field.name);
		const valueTokens = mfm.parseSimple(field.value);
		emojis.push(...extractCustomEmojisFromMfm(nameTokens), ...extractCustomEmojisFromMfm(valueTokens));
	}

	if (newFollowedMessage != null) {
		const tokens = mfm.parse(newFollowedMessage);
		emojis.push(...extractCustomEmojisFromMfm(tokens));
	}

	updates.emojis = emojis;
	updates.tags = tags;

	// ハッシュタグ更新 (ランキング更新 (Redis) 込み)
	void updateUsertagsForApi(deps, user, tags).catch(() => {});

	if (Object.keys(updates).length > 0) {
		await updateUserInDatabase(deps.db, user.id, updates);
		deps.publishInternalEvent?.('localUserUpdated', { id: user.id });
	}

	await updateUserProfileInDatabase(deps.db, user.id, {
		...profileUpdates,
		verifiedLinks: [],
	});

	const freshUser = (await fetchUserByIdOrFailFromDatabase(deps.db, user.id)) as MiLocalUser;
	const iObj = await packMeDetailedForApi(deps, freshUser, { includeSecrets: isSecure });

	const updatedProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	deps.publishInternalEvent?.('updateUserProfile', updatedProfile);

	deps.publishMainStream?.(user.id, 'meUpdated', iObj);

	// 鍵垢を解除したとき、溜まっていたフォローリクエストがあるならすべて承認
	if (user.isLocked && ps.isLocked === false) {
		void acceptAllFollowRequestsForApi(deps, user).catch(() => {});
	}

	// フォロワーにUpdateを配信
	void publishAccountUpdateToFollowersForApi(deps, user.id).catch(() => {});

	const urls = updatedProfile.fields.filter((x) => x.value.startsWith('https://'));
	for (const url of urls) {
		void verifyLinkForApi(deps, url.value, user);
	}

	return iObj;
}
