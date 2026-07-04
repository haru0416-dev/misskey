/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { toArray, toSingle } from '@/misc/prelude/array.js';
import { truncate } from '@/misc/truncate.js';
import { checkHttps } from '@/misc/check-https.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { genId } from '@/misc/id/gen-id.js';
import { MfmService } from '@/core/MfmService.js';
import { ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { extractApHashtags } from '@/core/activitypub/models/tag.js';
import {
	getApId,
	getApType,
	getOneApHrefNullable,
	isActor,
	isDocument,
	isEmoji,
	isPropertyValue,
	type IActor,
	type IObject,
} from '@/core/activitypub/type.js';
import { FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import {
	fetchLocalUserByUsernameFromDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByUriFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	updateUserIfNotDeletedInDatabase,
	updateUserInDatabase,
	updateUserLastFetchedAtInDatabase,
	updateUserUriByUsernameAndHostInDatabase,
	createUserWithProfileAndPublickeyInDatabase,
} from '@/core/UserStore.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { updateUserPublickeyInDatabase } from '@/core/UserPublickeyStore.js';
import { updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { updateFollowingsByFollowerIdInDatabase } from '@/core/FollowingStore.js';
import { listEmojisByHostAndNamesFromDatabase, updateEmojiByHostAndNameInDatabase, insertEmojiInDatabase } from '@/core/EmojiStore.js';
import { fetchDriveFileByIdOrFailFromDatabase, updateDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { adjustInstanceUsersCountFromDatabase } from '@/core/InstanceStore.js';
import { StatusError } from '@/misc/status-error.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { query as urlQuery } from '@/misc/prelude/url.js';
import type { Config } from '@/config.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import {
	getUserFromApIdForHonoApi,
	parseLocalApUri,
	resolveApObjectForHonoApi,
	resolveCollectionForHonoApi,
	type HonoApiApResolveDependencies,
} from './hono-api-ap-resolve.js';
import { uploadDriveFileFromUrlForHonoApi, type HonoApiDriveFileUploadDependencies } from './hono-api-drive-file-upload.js';
import { updateUsertagsForHonoApi } from './hono-api-account-update.js';
import { getHonoApiRolePolicies } from './hono-api-role-policy.js';
import { parseHonoApiParams } from './hono-api-validation.js';
import { fetchOrRegisterInstanceForHonoApi } from './hono-api-notes-create.js';

export type HonoApiApPersonDependencies = HonoApiApResolveDependencies & HonoApiDriveFileUploadDependencies;

const nameLength = 128;
const summaryLength = 2048;

function serializeAlsoKnownAs(value: string[] | null | undefined): string | null | undefined {
	return value == null ? value : value.join(',');
}

export function validateActorForHonoApi(config: Pick<Config, 'url'>, x: IObject, uri: string): IActor {
	const expectHost = punyHostForHonoApi(uri);

	if (!isActor(x)) {
		throw new Error(`invalid Actor type '${x.type}'`);
	}

	if (!(typeof x.id === 'string' && x.id.length > 0)) {
		throw new Error('invalid Actor: wrong id');
	}

	if (!(typeof x.inbox === 'string' && x.inbox.length > 0)) {
		throw new Error('invalid Actor: wrong inbox');
	}

	if (punyHostForHonoApi(x.inbox) !== expectHost) {
		throw new Error('invalid Actor: inbox has different host');
	}

	const sharedInboxObject = x.sharedInbox ?? (x.endpoints ? x.endpoints.sharedInbox : undefined);
	if (sharedInboxObject != null) {
		const sharedInbox = getApId(sharedInboxObject);
		if (!(typeof sharedInbox === 'string' && sharedInbox.length > 0 && new URL(sharedInbox).host === expectHost)) {
			x.sharedInbox = undefined;
			if (x.endpoints?.sharedInbox) {
				x.endpoints.sharedInbox = undefined;
			}
		}
	}

	for (const collection of ['outbox', 'followers', 'following'] as (keyof IActor)[]) {
		const xCollection = (x as IActor)[collection];
		if (xCollection != null) {
			const collectionUri = getApId(xCollection);
			if (typeof collectionUri === 'string' && collectionUri.length > 0) {
				if (punyHostForHonoApi(collectionUri) !== expectHost) {
					throw new Error(`invalid Actor: ${collection} has different host`);
				}
			} else if (collectionUri != null) {
				throw new Error(`invalid Actor: wrong ${collection}`);
			}
		}
	}

	if (!(typeof x.preferredUsername === 'string' && x.preferredUsername.length > 0 && x.preferredUsername.length <= 128 && /^\w([\w-.]*\w)?$/.test(x.preferredUsername))) {
		throw new Error('invalid Actor: wrong username');
	}

	if (x.name) {
		if (!(typeof x.name === 'string' && x.name.length > 0)) {
			throw new Error('invalid Actor: wrong name');
		}
		x.name = truncate(x.name, nameLength);
	} else if (x.name === '') {
		x.name = undefined;
	}
	if (x.summary) {
		if (!(typeof x.summary === 'string' && x.summary.length > 0)) {
			throw new Error('invalid Actor: wrong summary');
		}
		x.summary = truncate(x.summary, summaryLength);
	}

	const idHost = punyHostForHonoApi(x.id);
	if (idHost !== expectHost) {
		throw new Error('invalid Actor: id has different host');
	}

	if (x.publicKey) {
		if (typeof x.publicKey.id !== 'string') {
			throw new Error('invalid Actor: publicKey.id is not a string');
		}

		const publicKeyIdHost = punyHostForHonoApi(x.publicKey.id);
		if (publicKeyIdHost !== expectHost) {
			throw new Error('invalid Actor: publicKey.id has different host');
		}
	}

	return x;
}

export function toPunyForHonoApi(host: string): string {
	return domainToASCII(host.toLowerCase());
}

export function punyHostForHonoApi(url: string): string {
	const urlObj = new URL(url);
	return `${toPunyForHonoApi(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
}

export function analyzeAttachmentsForHonoApi(config: Pick<Config, 'url'>, attachments: IObject | IObject[] | undefined): { name: string; value: string }[] {
	const fields: { name: string; value: string }[] = [];

	if (Array.isArray(attachments)) {
		for (const attachment of attachments.filter(isPropertyValue)) {
			fields.push({
				name: attachment.name,
				value: new MfmService(config as Config).fromHtml(attachment.value),
			});
		}
	}

	return fields;
}

export async function extractEmojisForHonoApi(deps: HonoApiApPersonDependencies, tags: IObject | IObject[], host: string): Promise<MiEmoji[]> {
	const punyHost = toPunyForHonoApi(host);
	const emojiTags = toArray(tags).filter(isEmoji);

	const existingEmojis = await listEmojisByHostAndNamesFromDatabase(deps.db, punyHost, emojiTags.map(tag => tag.name.replaceAll(':', '')));

	return await Promise.all(emojiTags.map(async (tag): Promise<MiEmoji> => {
		const name = tag.name.replaceAll(':', '');
		const icon = toSingle(tag.icon) as { url?: string } | undefined;

		const exists = existingEmojis.find(x => x.name === name);

		if (exists) {
			if ((exists.updatedAt == null)
				|| (tag.id != null && exists.uri == null)
				|| (new Date(tag.updated) > exists.updatedAt)
				|| (icon?.url !== exists.originalUrl)
			) {
				const emoji = await updateEmojiByHostAndNameInDatabase(deps.db, punyHost, name, {
					uri: tag.id,
					originalUrl: icon?.url,
					publicUrl: icon?.url,
					updatedAt: new Date(),
					license: tag._misskey_license?.freeText ?? null,
				});
				if (emoji == null) throw new Error('emoji update failed');
				return emoji;
			}

			return exists;
		}

		return await insertEmojiInDatabase(deps.db, {
			id: genId(deps.config),
			host: punyHost,
			name,
			uri: tag.id,
			// isEmoji のtype guardによりこの時点で icon.url は存在が保証されている
			originalUrl: icon!.url!,
			publicUrl: icon!.url!,
			updatedAt: new Date(),
			aliases: [],
			license: tag._misskey_license?.freeText ?? null,
		});
	}));
}

export async function resolveImageForHonoApi(deps: HonoApiApPersonDependencies, actor: MiRemoteUser, value: string | IObject): Promise<MiDriveFile | null> {
	if (actor.isSuspended) {
		throw new Error('actor has been suspended');
	}

	const image = await resolveApObjectForHonoApi(deps, value);

	if (!isDocument(image)) return null;
	if (image.url == null || typeof image.url !== 'string') return null;
	if (!checkHttps(image.url)) return null;

	const shouldBeCached = deps.meta.cacheRemoteFiles && (deps.meta.cacheRemoteSensitiveFiles || !image.sensitive);

	try {
		const file = await uploadDriveFileFromUrlForHonoApi(deps, {
			url: image.url,
			user: actor,
			uri: image.url,
			sensitive: image.sensitive,
			isLink: !shouldBeCached,
			comment: truncate(image.name ?? undefined, 512),
		});

		if (!file.isLink || file.url === image.url) return file;

		// URLが異なっている場合、同じ画像が以前に異なるURLで登録されていたということなので、URLを更新する
		await updateDriveFileInDatabase(deps.db, file.id, { url: image.url, uri: image.url });
		return await fetchDriveFileByIdOrFailFromDatabase(deps.db, file.id);
	} catch {
		return null;
	}
}

export async function resolveAvatarAndBannerForHonoApi(
	deps: HonoApiApPersonDependencies,
	user: MiRemoteUser,
	icon: unknown,
	image: unknown,
): Promise<Partial<Pick<MiRemoteUser, 'avatarId' | 'bannerId' | 'avatarUrl' | 'bannerUrl' | 'avatarBlurhash' | 'bannerBlurhash'>>> {
	const [avatar, banner] = await Promise.all([icon, image].map(async img => {
		if (Array.isArray(img)) {
			img = img.find((item: unknown) => item && (item as { url?: unknown }).url) ?? null;
		}

		if ((img == null) || (typeof img === 'object' && (img as { url?: unknown }).url == null)) {
			return { id: null, url: null, blurhash: null };
		}

		return await resolveImageForHonoApi(deps, user, img as string | IObject).catch(() => null);
	}));

	if (((avatar != null && avatar.id != null) || (banner != null && banner.id != null))
			&& !(await getHonoApiRolePolicies(deps, user)).canUpdateBioMedia) {
		return {};
	}

	return {
		...(avatar ? {
			avatarId: avatar.id,
			avatarUrl: avatar.url ? getDriveFilePublicUrl(avatar as MiDriveFile, { config: deps.config, meta: deps.meta, mode: 'avatar' }) : null,
			avatarBlurhash: (avatar as { blurhash?: string | null }).blurhash ?? null,
		} : {}),
		...(banner ? {
			bannerId: banner.id,
			bannerUrl: banner.url ? getDriveFilePublicUrl(banner as MiDriveFile, { config: deps.config, meta: deps.meta }) : null,
			bannerBlurhash: (banner as { blurhash?: string | null }).blurhash ?? null,
		} : {}),
	} as Partial<Pick<MiRemoteUser, 'avatarId' | 'bannerId' | 'avatarUrl' | 'bannerUrl' | 'avatarBlurhash' | 'bannerBlurhash'>>;
}

export async function isPublicCollectionForHonoApi(
	deps: HonoApiApPersonDependencies,
	collection: string | IObject | undefined,
	history: Set<string>,
): Promise<boolean> {
	if (collection) {
		const resolved = await resolveCollectionForHonoApi(deps, collection, history);
		const rec = resolved as { first?: unknown; items?: unknown; orderedItems?: unknown };
		if (rec.first || rec.items || rec.orderedItems) {
			return true;
		}
	}

	return false;
}

/**
 * ApPersonService.updatePerson 相当。
 *
 * 意図的な簡略化:
 * - updateFeatured (ピン留めノートの再取得): ApNoteService.createNote/resolveNote 相当 (数百行、ap/show 移植と同じ
 *   インフラが必要) が未移植のため今回は呼び出しを省略する。ピン留めノートの一覧はリモートユーザーの再フェッチだけでは
 *   更新されなくなるが、プロフィール本体の更新という本エンドポイントの主目的には影響しない。
 * - processRemoteMove (引っ越し処理): AccountMoveService 相当 (フォロワーの移行、ブロック/ミュート/リストの引き継ぎ等)
 *   が未移植のため呼び出しを省略する。movedToUri/movedAt 自体は通常どおり DB に反映されるため
 *   「引っ越し済みであること」自体は表示されるが、フォロワーの自動移行は行われない。
 * - cacheService.uriPersonCache の更新: プロセス内メモリキャッシュのため省略 (既存の移行方針と同様)。
 */
export async function updatePersonForHonoApi(deps: HonoApiApPersonDependencies, uri: string, exist: MiRemoteUser): Promise<void> {
	const history = new Set<string>();
	const object = await resolveApObjectForHonoApi(deps, uri, FetchAllowSoftFailMask.Strict, history);

	const person = validateActorForHonoApi(deps.config, object, uri);

	const emojis = await extractEmojisForHonoApi(deps, person.tag ?? [], exist.host).catch(() => [] as MiEmoji[]);
	const emojiNames = emojis.map(emoji => emoji.name);

	const fields = analyzeAttachmentsForHonoApi(deps.config, person.attachment ?? []);

	const tags = extractApHashtags(person.tag).map(normalizeForSearch).splice(0, 32);

	const [followingVisibility, followersVisibility] = await Promise.all([
		isPublicCollectionForHonoApi(deps, person.following, history),
		isPublicCollectionForHonoApi(deps, person.followers, history),
	].map((p): Promise<'public' | 'private' | undefined> => p
		.then(isPublic => (isPublic ? 'public' : 'private') as 'public' | 'private')
		.catch(err => {
			if (!(err instanceof StatusError) || err.isRetryable) {
				// 一時的なエラーでは既存の公開設定を保持する (更新しない)
				return undefined;
			}
			return 'private';
		})));

	const bday = (person as { 'vcard:bday'?: string })['vcard:bday']?.match(/^\d{4}-\d{2}-\d{2}/);

	const url = getOneApHrefNullable(person.url);

	if (person.id == null) {
		throw new Error('Refusing to update person without id');
	}

	if (url != null) {
		if (!checkHttps(url)) {
			throw new Error('unexpected schema of person url: ' + url);
		}

		if (punyHostForHonoApi(url) !== punyHostForHonoApi(person.id)) {
			throw new Error(`person url <> uri host mismatch: ${url} <> ${person.id}`);
		}
	}

	const updates = {
		lastFetchedAt: new Date(),
		inbox: person.inbox,
		sharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
		followersUri: person.followers ? getApId(person.followers) : undefined,
		featured: person.featured ? getApId(person.featured) : undefined,
		emojis: emojiNames,
		name: truncate(person.name, nameLength),
		tags,
		isBot: getApType(object) === 'Service' || getApType(object) === 'Application',
		isCat: (person as { isCat?: unknown }).isCat === true,
		isLocked: person.manuallyApprovesFollowers,
		movedToUri: person.movedTo ?? null,
		alsoKnownAs: person.alsoKnownAs ? toArray(person.alsoKnownAs) : null,
		isExplorable: person.discoverable,
		...(await resolveAvatarAndBannerForHonoApi(deps, exist, person.icon, person.image).catch(() => ({}))),
	} as Record<string, unknown>;

	const moving = (() => {
		if (exist.movedToUri === null && updates.movedToUri) return true;
		if (
			exist.movedToUri !== null &&
			updates.movedToUri !== null &&
			exist.movedToUri !== updates.movedToUri
		) return true;
		return false;
	})();

	if (moving) updates.movedAt = new Date();

	const updated = await updateUserIfNotDeletedInDatabase(deps.db, exist.id, {
		...updates,
		alsoKnownAs: serializeAlsoKnownAs(updates.alsoKnownAs as string[] | null | undefined),
	});
	if (!updated) return;

	if (person.publicKey) {
		await updateUserPublickeyInDatabase(deps.db, exist.id, {
			keyId: person.publicKey.id,
			keyPem: person.publicKey.publicKeyPem,
		});
	}

	let description: string | null = null;
	if (person._misskey_summary) {
		description = truncate(person._misskey_summary, summaryLength);
	} else if (person.summary) {
		description = new ApMfmService(new MfmService(deps.config as Config)).htmlToMfm(truncate(person.summary, summaryLength), person.tag);
	}

	await updateUserProfileInDatabase(deps.db, exist.id, {
		url,
		fields,
		description,
		followedMessage: person._misskey_followedMessage != null ? truncate(person._misskey_followedMessage, 256) : null,
		followingVisibility,
		followersVisibility,
		birthday: bday?.[0] ?? null,
		location: (person as { 'vcard:Address'?: string })['vcard:Address'] ?? null,
	});

	deps.publishInternalEvent?.('remoteUserUpdated', { id: exist.id });

	await updateUsertagsForHonoApi(deps, exist, tags);

	await updateFollowingsByFollowerIdInDatabase(deps.db, exist.id, {
		followerSharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
	});
}

/**
 * ApPersonService.createPerson 相当。
 *
 * 意図的な簡略化:
 * - updateFeatured (ピン留めノート再取得): updatePersonForHonoApi と同様、ApNoteService.createNote 相当が
 *   未移植のため呼び出しを省略する。
 * - fetchInstanceMetadataService.fetchInstanceMetadata (新規インスタンスのfavicon/nodeinfo取得) と
 *   chart類 (usersChart/instanceChart) の更新: 分析目的の副作用であり、ap/show の主目的である
 *   「リモートユーザーを作成してレスポンスとして返す」ことには影響しないため省略する。
 *   インスタンス行自体の作成/ユーザー数カウントは `fetchOrRegisterInstanceForHonoApi` +
 *   `adjustInstanceUsersCountFromDatabase` で再現する。
 */
export async function createPersonForHonoApi(deps: HonoApiApPersonDependencies, uri: string, history: Set<string> = new Set()): Promise<MiRemoteUser> {
	const host = punyHostForHonoApi(uri);
	if (host === toPunyForHonoApi(deps.config.host)) {
		throw new StatusError('cannot resolve local user', 400, 'cannot resolve local user');
	}

	const object = await resolveApObjectForHonoApi(deps, uri, FetchAllowSoftFailMask.Strict, history);
	if (object.id == null) throw new Error('invalid object.id: ' + object.id);

	const person = validateActorForHonoApi(deps.config, object, uri);

	if (person.id == null) {
		throw new Error('Refusing to create person without id');
	}
	if (person.preferredUsername == null) {
		throw new Error('Refusing to create person without preferredUsername');
	}

	const fields = analyzeAttachmentsForHonoApi(deps.config, person.attachment ?? []);
	const tags = extractApHashtags(person.tag).map(normalizeForSearch).splice(0, 32);
	const isBot = getApType(object) === 'Service' || getApType(object) === 'Application';

	const [followingVisibility, followersVisibility] = await Promise.all([
		isPublicCollectionForHonoApi(deps, person.following, history),
		isPublicCollectionForHonoApi(deps, person.followers, history),
	].map((p): Promise<'public' | 'private'> => p
		.then(isPublic => (isPublic ? 'public' : 'private') as 'public' | 'private')
		.catch(() => 'private' as const)));

	const bday = (person as { 'vcard:bday'?: string })['vcard:bday']?.match(/^\d{4}-\d{2}-\d{2}/);
	const url = getOneApHrefNullable(person.url);

	if (url != null && !checkHttps(url)) {
		throw new Error('unexpected schema of person url: ' + url);
	}

	const emojis = await extractEmojisForHonoApi(deps, person.tag ?? [], host)
		.then(_emojis => _emojis.map(emoji => emoji.name))
		.catch(() => [] as string[]);

	let description: string | null = null;
	if (person._misskey_summary) {
		description = truncate(person._misskey_summary, summaryLength);
	} else if (person.summary) {
		description = new ApMfmService(new MfmService(deps.config as Config)).htmlToMfm(truncate(person.summary, summaryLength), person.tag);
	}

	let user: MiRemoteUser;
	const userId = genId(deps.config);
	try {
		user = await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id: userId,
				avatarId: null,
				bannerId: null,
				lastFetchedAt: new Date(),
				name: truncate(person.name, nameLength),
				isLocked: person.manuallyApprovesFollowers,
				movedToUri: person.movedTo ?? null,
				movedAt: person.movedTo ? new Date() : null,
				alsoKnownAs: serializeAlsoKnownAs(person.alsoKnownAs ? toArray(person.alsoKnownAs) : null),
				isExplorable: person.discoverable,
				username: person.preferredUsername,
				usernameLower: person.preferredUsername.toLowerCase(),
				host,
				inbox: person.inbox,
				sharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
				followersUri: person.followers ? getApId(person.followers) : undefined,
				featured: person.featured ? getApId(person.featured) : undefined,
				uri: person.id,
				tags,
				isBot,
				isCat: (person as { isCat?: unknown }).isCat === true,
				requireSigninToViewContents: (person as { requireSigninToViewContents?: unknown }).requireSigninToViewContents === true,
				makeNotesFollowersOnlyBefore: (person as { makeNotesFollowersOnlyBefore?: number | null }).makeNotesFollowersOnlyBefore ?? null,
				makeNotesHiddenBefore: (person as { makeNotesHiddenBefore?: number | null }).makeNotesHiddenBefore ?? null,
				emojis,
			},
			profile: {
				userId,
				description,
				followedMessage: person._misskey_followedMessage != null ? truncate(person._misskey_followedMessage, 256) : null,
				url,
				fields,
				followingVisibility,
				followersVisibility,
				birthday: bday?.[0] ?? null,
				location: (person as { 'vcard:Address'?: string })['vcard:Address'] ?? null,
				userHost: host,
			},
			publickey: person.publicKey ? {
				userId,
				keyId: person.publicKey.id,
				keyPem: person.publicKey.publicKeyPem,
			} : undefined,
		}) as MiRemoteUser;
	} catch (e) {
		if (isDuplicateKeyValueError(e)) {
			// /users/@a => /users/:id のように入力がaliasなときにエラーになることがあるのを対応
			const u = await fetchUserByUriFromDatabase(deps.db, person.id);
			if (u == null) throw new Error('already registered');
			user = u as MiRemoteUser;
		} else {
			throw e;
		}
	}

	if (deps.meta.enableStatsForFederatedInstances) {
		fetchOrRegisterInstanceForHonoApi(deps, host).then(async i => {
			await adjustInstanceUsersCountFromDatabase(deps.db, i.id, 1);
		}).catch(() => {});
	}

	await updateUsertagsForHonoApi(deps, user, tags);

	try {
		const updates = await resolveAvatarAndBannerForHonoApi(deps, user, person.icon, person.image);
		await updateUserInDatabase(deps.db, user.id, updates);
		user = { ...user, ...updates };
	} catch {
		// アバター/バナー取得の失敗はユーザー作成自体を失敗させない
	}

	return user;
}

/** ApPersonService.fetchPerson 相当。プロセス内キャッシュ (uriPersonCache) は既存の移行方針に沿って省略。 */
export async function fetchPersonForHonoApi(deps: HonoApiApPersonDependencies, uri: string): Promise<MiLocalUser | MiRemoteUser | null> {
	if (uri.startsWith(`${deps.config.url}/`)) {
		const id = uri.split('/').pop();
		if (id == null) return null;
		const u = await fetchUserByIdFromDatabase(deps.db, id);
		return u as MiLocalUser | null;
	}

	return await fetchUserByUriFromDatabase(deps.db, uri) as MiLocalUser | MiRemoteUser | null;
}

/** ApPersonService.resolvePerson 相当。 */
export async function resolvePersonForHonoApi(deps: HonoApiApPersonDependencies, uri: string, history: Set<string> = new Set()): Promise<MiLocalUser | MiRemoteUser> {
	const exist = await fetchPersonForHonoApi(deps, uri);
	if (exist) return exist;

	return await createPersonForHonoApi(deps, uri, history);
}

function getUserUriForApPerson(config: Pick<Config, 'url'>, user: MiLocalUser | MiRemoteUser): string {
	return user.host == null ? `${config.url}/users/${user.id}` : user.uri;
}

/**
 * AccountMoveService.validateAlsoKnownAs 相当。
 * dst の alsoKnownAs を辿り、movedToUri が dst を指す旧アカウントが実在するかを調べる。
 */
export async function validateAlsoKnownAsForHonoApi(
	deps: HonoApiApPersonDependencies,
	dstInput: MiLocalUser | MiRemoteUser,
	check: (oldUser: MiLocalUser | MiRemoteUser | null, newUser: MiLocalUser | MiRemoteUser) => boolean | Promise<boolean> = () => true,
	instant = false,
): Promise<MiLocalUser | MiRemoteUser | null> {
	let dst = dstInput;
	let resultUser: MiLocalUser | MiRemoteUser | null = null;

	if (dst.host != null) {
		if (Date.now() - (dst.lastFetchedAt?.getTime() ?? 0) > 10 * 1000) {
			await updatePersonForHonoApi(deps, dst.uri, dst);
		}
		dst = (await fetchPersonForHonoApi(deps, dst.uri)) ?? dst;
	}

	if (!dst.alsoKnownAs || dst.alsoKnownAs.length === 0) return null;

	const dstUri = getUserUriForApPerson(deps.config, dst);

	for (const srcUri of dst.alsoKnownAs) {
		try {
			let src = await fetchPersonForHonoApi(deps, srcUri);
			if (!src) continue; // oldAccountを探してもこのサーバーに存在しない場合はフォロー関係もないということなのでスルー

			if (dst.host != null && src.host != null) {
				if (Date.now() - (src.lastFetchedAt?.getTime() ?? 0) > 10 * 1000) {
					await updatePersonForHonoApi(deps, srcUri, src);
				}
				src = (await fetchPersonForHonoApi(deps, srcUri)) ?? src;
			}

			if (src.movedToUri === dstUri) {
				if (await check(resultUser, src)) {
					resultUser = src;
				}
				if (instant && resultUser) return resultUser;
			}
		} catch {
			/* skip if any error happens */
		}
	}

	return resultUser;
}

const federationUpdateRemoteUserParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

type FederationUpdateRemoteUserParams = {
	userId: MiUser['id'];
};

export async function handleHonoApiFederationUpdateRemoteUser(deps: HonoApiApPersonDependencies, body: Record<string, unknown>): Promise<void> {
	const params = parseHonoApiParams(federationUpdateRemoteUserParamDef, body) as FederationUpdateRemoteUserParams;

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) {
		throw new IdentifiableError('15348ddd-432d-49c2-8a5a-8069753becff', 'No such user.');
	}
	if (user.host == null) {
		throw new Error('user is not a remote user');
	}

	await updatePersonForHonoApi(deps, user.uri!, user as MiRemoteUser);
}

type WebfingerLink = {
	href: string;
	rel?: string;
};

type WebfingerResult = {
	links: WebfingerLink[];
	subject: string;
};

const webfingerUrlRegex = /^https?:\/\//;
const webfingerAcctRegex = /^([^@]+)@(.*)/;

/** WebfingerService.webfinger 相当。 */
async function webfingerForHonoApi(deps: { httpRequestService: Pick<HttpRequestService, 'getJson'> }, query: string): Promise<WebfingerResult> {
	let url: string;
	if (webfingerUrlRegex.test(query)) {
		const u = new URL(query);
		url = `${u.protocol}//${u.hostname}/.well-known/webfinger?${urlQuery({ resource: query })}`;
	} else {
		const m = query.match(webfingerAcctRegex);
		if (!m) throw new Error(`Invalid query (${query})`);
		const hostname = m[2];
		const useHttp = process.env.MISSKEY_WEBFINGER_USE_HTTP && process.env.MISSKEY_WEBFINGER_USE_HTTP.toLowerCase() === 'true';
		url = `http${useHttp ? '' : 's'}://${hostname}/.well-known/webfinger?${urlQuery({ resource: `acct:${query}` })}`;
	}

	return await deps.httpRequestService.getJson<WebfingerResult>(url, 'application/jrd+json, application/json');
}

async function resolveSelfForHonoApi(deps: { httpRequestService: Pick<HttpRequestService, 'getJson'> }, acctLower: string): Promise<WebfingerLink> {
	const finger = await webfingerForHonoApi(deps, acctLower).catch(err => {
		throw new Error(`Failed to WebFinger for ${acctLower}: ${err.statusCode ?? err.message}`);
	});
	const self = finger.links.find(link => link.rel != null && link.rel.toLowerCase() === 'self');
	if (!self) {
		throw new Error('self link not found');
	}
	return self;
}

/**
 * RemoteUserResolveService.resolveUser 相当。username@host からローカル/リモートユーザーを解決する。
 * リモートの場合、未登録ならWebFinger→createPersonForHonoApiで新規作成し、登録済みかつ
 * 24時間以上再取得していなければWebFinger→updatePersonForHonoApiで再同期する。
 */
export async function resolveUserForHonoApi(
	deps: HonoApiApPersonDependencies,
	username: string,
	host: string | null,
): Promise<MiLocalUser | MiRemoteUser> {
	const usernameLower = username.toLowerCase();

	if (host == null || toPunyForHonoApi(host) === toPunyForHonoApi(deps.config.host)) {
		const localUser = await fetchLocalUserByUsernameFromDatabase(deps.db, usernameLower);
		if (localUser == null) {
			throw new Error('user not found');
		}
		return localUser;
	}

	const punyHost = toPunyForHonoApi(host);
	const user = await fetchUserByUsernameAndHostFromDatabase(deps.db, usernameLower, punyHost) as MiRemoteUser | null;

	const acctLower = `${usernameLower}@${punyHost}`;

	if (user == null) {
		const self = await resolveSelfForHonoApi(deps, acctLower);

		if (punyHostForHonoApi(self.href) === toPunyForHonoApi(deps.config.host)) {
			const local = parseLocalApUri(deps.config, self.href);
			if (local.local && local.type === 'users') {
				const u = await getUserFromApIdForHonoApi(deps, self.href);
				if (u == null) {
					throw new Error('local user not found');
				}
				return u as MiLocalUser;
			}
		}

		return await createPersonForHonoApi(deps, self.href);
	}

	// ユーザー情報が古い場合は、WebFingerからやりなおして返す
	if (user.lastFetchedAt == null || Date.now() - user.lastFetchedAt.getTime() > (1000 * 60 * 60 * 24)) {
		// 繋がらないインスタンスに何回も試行するのを防ぐ, 後続の同様処理の連続試行を防ぐ ため 試行前にも更新する
		await updateUserLastFetchedAtInDatabase(deps.db, user.id, new Date());

		const self = await resolveSelfForHonoApi(deps, acctLower);

		if (user.uri !== self.href) {
			// if uri mismatch, Fix (user@host <=> AP's Person id(RemoteUser.uri)) mapping.
			const uri = new URL(self.href);
			if (uri.hostname !== punyHost) {
				throw new Error('Invalid uri');
			}

			await updateUserUriByUsernameAndHostInDatabase(deps.db, usernameLower, punyHost, self.href);
		}

		await updatePersonForHonoApi(deps, self.href, user);

		const resynced = await fetchUserByUriFromDatabase(deps.db, self.href);
		if (resynced == null) {
			throw new Error('user not found');
		}
		return resynced as MiLocalUser | MiRemoteUser;
	}

	return user;
}
