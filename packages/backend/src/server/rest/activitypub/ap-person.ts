/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { toPuny } from '@/misc/to-puny.js';
import { z } from 'zod';
import { toArray, toSingle } from '@/misc/prelude/array.js';
import { truncate } from '@/misc/truncate.js';
import { checkHttps } from '@/misc/check-https.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import { omitUndefined } from '@/misc/clone.js';
import { createMfmService } from '@/core/mfm/MfmService.js';
import { createApMfmService } from '@/core/activitypub/ApMfmService.js';
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
} from '@/core/user/UserStore.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import {
	fetchUserPublickeyByUserIdFromDatabase,
	updateUserPublickeyInDatabase,
} from '@/core/user/UserPublickeyStore.js';
import { updateUserProfileInDatabase } from '@/core/user/UserProfileStore.js';
import { updateFollowingsByFollowerIdInDatabase } from '@/core/user/FollowingStore.js';
import {
	listEmojisByHostAndNamesFromDatabase,
	updateEmojiByHostAndNameInDatabase,
	insertEmojiInDatabase,
} from '@/core/emoji/EmojiStore.js';
import { fetchDriveFileByIdOrFailFromDatabase, updateDriveFileInDatabase } from '@/core/drive/DriveFileStore.js';
import { adjustInstanceUsersCountFromDatabase } from '@/core/instance/InstanceStore.js';
import { StatusError } from '@/misc/status-error.js';
import { getDriveFilePublicUrl } from '@/core/drive/DriveFilePublicUrl.js';
import { query as urlQuery } from '@/misc/prelude/url.js';
import type { Config } from '@/config.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import {
	extractDbHost,
	getUserFromApIdForApi,
	isSelfHost,
	parseLocalApUri,
	resolveApObjectForApi,
	resolveCollectionForApi,
	type ApiApResolveDependencies,
	type ApiAuthUser,
} from './ap-resolve.js';
import { ApiError } from '../error.js';
import { postMoveProcessForApi, type ApiAccountMoveDependencies } from '../account/account-move.js';
import { uploadDriveFileFromUrlForApi, type ApiDriveFileUploadDependencies } from '../drive/drive-file-upload.js';
import { updateUsertagsForApi } from '../account/account-update.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';
import { fetchOrRegisterInstanceForApi } from '../note/notes-create.js';
import type { RelationshipQueue } from '@/core/queue/queues.js';

export type ApiApPersonDependencies = ApiApResolveDependencies &
	ApiDriveFileUploadDependencies & {
		relationshipQueue: RelationshipQueue;
	};

const nameLength = 128;
const summaryLength = 2048;

function serializeAlsoKnownAs(value: string[] | null | undefined): string | null | undefined {
	return value == null ? value : value.join(',');
}

function validateActorForApi(config: Pick<Config, 'instance'>, x: IObject, uri: string): IActor {
	const expectHost = punyHostForApi(uri);

	if (!isActor(x)) {
		throw new Error(`invalid Actor type '${x.type}'`);
	}

	if (!(typeof x.id === 'string' && x.id.length > 0)) {
		throw new Error('invalid Actor: wrong id');
	}

	if (!(typeof x.inbox === 'string' && x.inbox.length > 0)) {
		throw new Error('invalid Actor: wrong inbox');
	}

	if (punyHostForApi(x.inbox) !== expectHost) {
		throw new Error('invalid Actor: inbox has different host');
	}

	const sharedInboxObject = x.sharedInbox ?? (x.endpoints ? x.endpoints.sharedInbox : undefined);
	if (sharedInboxObject != null) {
		const sharedInbox = getApId(sharedInboxObject);
		if (!(typeof sharedInbox === 'string' && sharedInbox.length > 0 && new URL(sharedInbox).host === expectHost)) {
			delete x.sharedInbox;
			if (x.endpoints?.sharedInbox) {
				delete x.endpoints.sharedInbox;
			}
		}
	}

	for (const collection of ['outbox', 'followers', 'following'] as (keyof IActor)[]) {
		const xCollection = (x as IActor)[collection];
		if (xCollection != null) {
			const collectionUri = getApId(xCollection);
			if (typeof collectionUri === 'string' && collectionUri.length > 0) {
				if (punyHostForApi(collectionUri) !== expectHost) {
					throw new Error(`invalid Actor: ${collection} has different host`);
				}
			} else if (collectionUri != null) {
				throw new Error(`invalid Actor: wrong ${collection}`);
			}
		}
	}

	if (
		!(
			typeof x.preferredUsername === 'string' &&
			x.preferredUsername.length > 0 &&
			x.preferredUsername.length <= 128 &&
			/^\w([\w-.]*\w)?$/.test(x.preferredUsername)
		)
	) {
		throw new Error('invalid Actor: wrong username');
	}

	if (x.name) {
		if (!(typeof x.name === 'string' && x.name.length > 0)) {
			throw new Error('invalid Actor: wrong name');
		}
		x.name = truncate(x.name, nameLength);
	} else if (x.name === '') {
		delete x.name;
	}
	if (x.summary) {
		if (!(typeof x.summary === 'string' && x.summary.length > 0)) {
			throw new Error('invalid Actor: wrong summary');
		}
		x.summary = truncate(x.summary, summaryLength);
	}

	const idHost = punyHostForApi(x.id);
	if (idHost !== expectHost) {
		throw new Error('invalid Actor: id has different host');
	}

	if (x.publicKey) {
		if (typeof x.publicKey.id !== 'string') {
			throw new Error('invalid Actor: publicKey.id is not a string');
		}

		const publicKeyIdHost = punyHostForApi(x.publicKey.id);
		if (publicKeyIdHost !== expectHost) {
			throw new Error('invalid Actor: publicKey.id has different host');
		}
	}

	return x;
}

function punyHostForApi(url: string): string {
	const urlObj = new URL(url);
	return `${toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
}

function analyzeAttachmentsForApi(
	config: Pick<Config, 'instance'>,
	attachments: IObject | IObject[] | undefined,
): { name: string; value: string }[] {
	const fields: { name: string; value: string }[] = [];

	if (Array.isArray(attachments)) {
		for (const attachment of attachments.filter(isPropertyValue)) {
			fields.push({
				name: attachment.name,
				value: createMfmService(config as Config).fromHtml(attachment.value),
			});
		}
	}

	return fields;
}

export async function extractEmojisForApi(
	deps: ApiApPersonDependencies,
	tags: IObject | IObject[],
	host: string,
): Promise<MiEmoji[]> {
	const punyHost = toPuny(host);
	const emojiTags = toArray(tags).filter(isEmoji);

	const existingEmojis = await listEmojisByHostAndNamesFromDatabase(
		deps.db,
		punyHost,
		emojiTags.map((tag) => tag.name.replaceAll(':', '')),
	);
	const existingEmojiByName = new Map(existingEmojis.map((emoji) => [emoji.name, emoji]));

	return await Promise.all(
		emojiTags.map(async (tag): Promise<MiEmoji> => {
			const name = tag.name.replaceAll(':', '');
			const icon = toSingle(tag.icon) as { url?: string } | undefined;

			const exists = existingEmojiByName.get(name);

			if (exists) {
				if (
					exists.updatedAt == null ||
					(tag.id != null && exists.uri == null) ||
					new Date(tag.updated) > exists.updatedAt ||
					icon?.url !== exists.originalUrl
				) {
					const emoji = await updateEmojiByHostAndNameInDatabase(
						deps.db,
						punyHost,
						name,
						omitUndefined({
							uri: tag.id,
							originalUrl: icon?.url,
							publicUrl: icon?.url,
							updatedAt: new Date(),
							license: tag._misskey_license?.freeText ?? null,
						}),
					);
					if (emoji == null) throw new Error('emoji update failed');
					return emoji;
				}

				return exists;
			}

			return await insertEmojiInDatabase(deps.db, {
				id: genId(),
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
		}),
	);
}

export async function resolveImageForApi(
	deps: ApiApPersonDependencies,
	actor: MiRemoteUser,
	value: string | IObject,
): Promise<MiDriveFile | null> {
	if (actor.isSuspended) {
		throw new Error('actor has been suspended');
	}

	const image = await resolveApObjectForApi(deps, value);

	if (!isDocument(image)) return null;
	if (image.url == null || typeof image.url !== 'string') return null;
	if (!checkHttps(image.url)) return null;

	const shouldBeCached = deps.meta.cacheRemoteFiles && (deps.meta.cacheRemoteSensitiveFiles || !image.sensitive);

	try {
		const file = await uploadDriveFileFromUrlForApi(
			deps,
			omitUndefined({
				url: image.url,
				user: actor,
				uri: image.url,
				sensitive: image.sensitive,
				isLink: !shouldBeCached,
				comment: truncate(image.name ?? undefined, 512),
			}),
		);

		if (!file.isLink || file.url === image.url) return file;

		// リンクとして保持するファイルの URL が変わった場合は、現在の画像 URL に更新する。
		await updateDriveFileInDatabase(deps.db, file.id, { url: image.url, uri: image.url });
		return await fetchDriveFileByIdOrFailFromDatabase(deps.db, file.id);
	} catch {
		return null;
	}
}

async function resolveAvatarAndBannerForApi(
	deps: ApiApPersonDependencies,
	user: MiRemoteUser,
	icon: unknown,
	image: unknown,
): Promise<
	Partial<Pick<MiRemoteUser, 'avatarId' | 'bannerId' | 'avatarUrl' | 'bannerUrl' | 'avatarBlurhash' | 'bannerBlurhash'>>
> {
	const [avatar, banner] = await Promise.all(
		[icon, image].map(async (img) => {
			if (Array.isArray(img)) {
				img = img.find((item: unknown) => item && (item as { url?: unknown }).url) ?? null;
			}

			if (img == null || (typeof img === 'object' && (img as { url?: unknown }).url == null)) {
				return { id: null, url: null, blurhash: null };
			}

			return await resolveImageForApi(deps, user, img as string | IObject).catch(() => null);
		}),
	);

	if (
		((avatar != null && avatar.id != null) || (banner != null && banner.id != null)) &&
		!(await getApiRolePolicies(deps, user)).canUpdateBioMedia
	) {
		return {};
	}

	return {
		...(avatar
			? {
					avatarId: avatar.id,
					avatarUrl: avatar.url
						? getDriveFilePublicUrl(avatar as MiDriveFile, { config: deps.config, meta: deps.meta, mode: 'avatar' })
						: null,
					avatarBlurhash: (avatar as { blurhash?: string | null }).blurhash ?? null,
				}
			: {}),
		...(banner
			? {
					bannerId: banner.id,
					bannerUrl: banner.url
						? getDriveFilePublicUrl(banner as MiDriveFile, { config: deps.config, meta: deps.meta })
						: null,
					bannerBlurhash: (banner as { blurhash?: string | null }).blurhash ?? null,
				}
			: {}),
	} as Partial<
		Pick<MiRemoteUser, 'avatarId' | 'bannerId' | 'avatarUrl' | 'bannerUrl' | 'avatarBlurhash' | 'bannerBlurhash'>
	>;
}

async function isPublicCollectionForApi(
	deps: ApiApPersonDependencies,
	collection: string | IObject | undefined,
	history: Set<string>,
): Promise<boolean> {
	if (collection) {
		const resolved = await resolveCollectionForApi(deps, collection, history);
		const rec = resolved as { first?: unknown; items?: unknown; orderedItems?: unknown };
		if (rec.first || rec.items || rec.orderedItems) {
			return true;
		}
	}

	return false;
}

export type ApiUpdatePersonDependencies = ApiApPersonDependencies & ApiAccountMoveDependencies;

/**
 * updatePersonForApi が movedToUri の新規出現・変更を検知したときに呼ぶ。
 * 移行先が移行元を alsoKnownAs で承認している場合だけ移行カスケードを実行する。
 */
async function processRemoteMoveForApi(
	deps: ApiUpdatePersonDependencies,
	src: MiRemoteUser,
	movePreventUris: string[] = [],
): Promise<string> {
	if (!src.movedToUri) return 'skip: no movedToUri';
	if (src.uri === src.movedToUri) return 'skip: movedTo itself (src)';
	if (movePreventUris.length > 10) return 'skip: too many moves';

	let dst: MiLocalUser | MiRemoteUser | null = await fetchPersonForApi(deps, src.movedToUri);

	if (dst && dst.host == null) {
		// ローカルユーザーだった場合はDBから読み直す
		dst = (await fetchUserByUriFromDatabase(deps.db, src.movedToUri)) as MiLocalUser | null;
		if (dst == null) throw new Error('user not found');
	} else if (dst) {
		if (movePreventUris.includes(src.movedToUri)) return 'skip: circular move';

		// dst自体も移行済みの可能性があるので再取得しておく (連鎖的な引っ越しの追跡)
		await updatePersonForApi(deps, src.movedToUri, dst as MiRemoteUser, [...movePreventUris, src.uri]);
		dst = (await fetchPersonForApi(deps, src.movedToUri)) ?? dst;
	} else {
		if (isSelfHost(deps.config, extractDbHost(src.movedToUri))) {
			return 'failed: movedTo is local but not found';
		}
		dst = await resolvePersonForApi(deps, src.movedToUri);
	}

	if (dst.movedToUri === dst.uri) return 'skip: movedTo itself (dst)';
	if (src.movedToUri !== dst.uri) return 'skip: missmatch uri';
	if (dst.movedToUri === src.uri) return 'skip: dst.movedToUri === src.uri';
	if (!dst.alsoKnownAs || dst.alsoKnownAs.length === 0) return 'skip: dst.alsoKnownAs is empty';
	if (!dst.alsoKnownAs.includes(src.uri)) return 'skip: alsoKnownAs does not include from.uri';

	await postMoveProcessForApi(deps, src, dst);

	return 'ok';
}

/**
 * updateFeatured に必要なノート作成・解決の依存を持たないため、この経路では実行しない。
 * リモートユーザーの再取得だけではピン留めノート一覧は更新されない。
 * uriPersonCache はプロセス内メモリキャッシュのため、この経路では更新しない。
 */
export async function updatePersonForApi(
	deps: ApiUpdatePersonDependencies,
	uri: string,
	exist: MiRemoteUser,
	movePreventUris: string[] = [],
	hint?: IObject,
): Promise<void> {
	const history = new Set<string>();
	// Update activity に埋め込まれたオブジェクトが渡されていれば再フェッチしない (中間キャッシュ (nginx 等) が
	// 古い Person を返すと更新が反映されないため、hint の利用は正しさに直結する)
	const object = hint ?? (await resolveApObjectForApi(deps, uri, FetchAllowSoftFailMask.Strict, history));

	const person = validateActorForApi(deps.config, object, uri);

	const emojis = await extractEmojisForApi(deps, person.tag ?? [], exist.host).catch(() => [] as MiEmoji[]);
	const emojiNames = emojis.map((emoji) => emoji.name);

	const fields = analyzeAttachmentsForApi(deps.config, person.attachment ?? []);

	const tags = extractApHashtags(person.tag).map(normalizeForSearch).splice(0, 32);

	const [followingVisibility, followersVisibility] = await Promise.all(
		[
			isPublicCollectionForApi(deps, person.following, history),
			isPublicCollectionForApi(deps, person.followers, history),
		].map((p): Promise<'public' | 'private' | undefined> =>
			p
				.then((isPublic) => (isPublic ? 'public' : 'private') as 'public' | 'private')
				.catch((err) => {
					if (!(err instanceof StatusError) || err.isRetryable) {
						// 一時的なエラーでは既存の公開設定を保持する (更新しない)
						return undefined;
					}
					return 'private';
				}),
		),
	);

	const bday = (person as { 'vcard:bday'?: string })['vcard:bday']?.match(/^\d{4}-\d{2}-\d{2}/);

	const url = getOneApHrefNullable(person.url);

	if (person.id == null) {
		throw new Error('Refusing to update person without id');
	}

	if (url != null) {
		if (!checkHttps(url)) {
			throw new Error('unexpected schema of person url: ' + url);
		}

		if (punyHostForApi(url) !== punyHostForApi(person.id)) {
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
		...(await resolveAvatarAndBannerForApi(deps, exist, person.icon, person.image).catch(() => ({}))),
	};

	const moving = (() => {
		if (exist.movedToUri === null && updates.movedToUri) return true;
		if (exist.movedToUri !== null && updates.movedToUri !== null && exist.movedToUri !== updates.movedToUri)
			return true;
		return false;
	})();

	const updatesWithMove = moving ? { ...updates, movedAt: new Date() } : updates;
	const { alsoKnownAs, ...userUpdates } = updatesWithMove;
	const serializedAlsoKnownAs = serializeAlsoKnownAs(alsoKnownAs);
	const updated = await updateUserIfNotDeletedInDatabase(
		deps.db,
		exist.id,
		omitUndefined({
			...userUpdates,
			...(serializedAlsoKnownAs === undefined ? {} : { alsoKnownAs: serializedAlsoKnownAs }),
		}),
	);
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
		description = createApMfmService(createMfmService(deps.config as Config)).htmlToMfm(
			truncate(person.summary, summaryLength),
			person.tag,
		);
	}

	await updateUserProfileInDatabase(
		deps.db,
		exist.id,
		omitUndefined({
			url,
			fields,
			description,
			followedMessage: person._misskey_followedMessage != null ? truncate(person._misskey_followedMessage, 256) : null,
			followingVisibility,
			followersVisibility,
			birthday: bday?.[0] ?? null,
			location: (person as { 'vcard:Address'?: string })['vcard:Address'] ?? null,
		}),
	);

	deps.publishInternalEvent?.('remoteUserUpdated', { id: exist.id });

	await updateUsertagsForApi(deps, exist, tags);

	await updateFollowingsByFollowerIdInDatabase(deps.db, exist.id, {
		followerSharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
	});

	const mergedUpdated = { ...exist, ...updatesWithMove } as MiRemoteUser;

	// 移行処理を行う: 初めての移行 (exist.movedAt == null) か、前回の移行から14日以上経過した場合のみ許可
	// (Mastodonのクールダウン期間は30日だが若干緩めに設定)
	if (
		mergedUpdated.movedAt &&
		(exist.movedAt == null || exist.movedAt.getTime() + 1000 * 60 * 60 * 24 * 14 < mergedUpdated.movedAt.getTime())
	) {
		await processRemoteMoveForApi(deps, mergedUpdated, movePreventUris).catch(() => 'failed');
	}
}

/**
 * updateFeatured に必要なノート作成の依存を持たないため、この経路では実行しない。
 * インスタンスメタデータ取得とチャート更新は分析用の副作用なので、ユーザー作成経路には含めない。
 * インスタンス行の作成とユーザー数更新は、この経路内で完了させる。
 */
export async function createPersonForApi(
	deps: ApiApPersonDependencies,
	uri: string,
	history: Set<string> = new Set(),
): Promise<MiRemoteUser> {
	const host = punyHostForApi(uri);
	if (host === toPuny(deps.config.runtime.host)) {
		throw new StatusError('cannot resolve local user', 400, 'cannot resolve local user');
	}

	const object = await resolveApObjectForApi(deps, uri, FetchAllowSoftFailMask.Strict, history);
	if (object.id == null) throw new Error('invalid object.id: ' + object.id);

	const person = validateActorForApi(deps.config, object, uri);

	if (person.id == null) {
		throw new Error('Refusing to create person without id');
	}
	if (person.preferredUsername == null) {
		throw new Error('Refusing to create person without preferredUsername');
	}

	const fields = analyzeAttachmentsForApi(deps.config, person.attachment ?? []);
	const tags = extractApHashtags(person.tag).map(normalizeForSearch).splice(0, 32);
	const isBot = getApType(object) === 'Service' || getApType(object) === 'Application';

	const [followingVisibility, followersVisibility] = await Promise.all(
		[
			isPublicCollectionForApi(deps, person.following, history),
			isPublicCollectionForApi(deps, person.followers, history),
		].map((p): Promise<'public' | 'private'> =>
			p.then((isPublic) => (isPublic ? 'public' : 'private') as 'public' | 'private').catch(() => 'private' as const),
		),
	);

	const bday = (person as { 'vcard:bday'?: string })['vcard:bday']?.match(/^\d{4}-\d{2}-\d{2}/);
	const url = getOneApHrefNullable(person.url);

	if (url != null && !checkHttps(url)) {
		throw new Error('unexpected schema of person url: ' + url);
	}

	const emojis = await extractEmojisForApi(deps, person.tag ?? [], host)
		.then((_emojis) => _emojis.map((emoji) => emoji.name))
		.catch(() => [] as string[]);

	let description: string | null = null;
	if (person._misskey_summary) {
		description = truncate(person._misskey_summary, summaryLength);
	} else if (person.summary) {
		description = createApMfmService(createMfmService(deps.config as Config)).htmlToMfm(
			truncate(person.summary, summaryLength),
			person.tag,
		);
	}

	let user: MiRemoteUser;
	const userId = genId();
	try {
		user = (await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: omitUndefined({
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
				requireSigninToViewContents:
					(person as { requireSigninToViewContents?: unknown }).requireSigninToViewContents === true,
				makeNotesFollowersOnlyBefore:
					(person as { makeNotesFollowersOnlyBefore?: number | null }).makeNotesFollowersOnlyBefore ?? null,
				makeNotesHiddenBefore: (person as { makeNotesHiddenBefore?: number | null }).makeNotesHiddenBefore ?? null,
				emojis,
			}),
			profile: {
				userId,
				description,
				followedMessage:
					person._misskey_followedMessage != null ? truncate(person._misskey_followedMessage, 256) : null,
				url,
				fields,
				followingVisibility,
				followersVisibility,
				birthday: bday?.[0] ?? null,
				location: (person as { 'vcard:Address'?: string })['vcard:Address'] ?? null,
				userHost: host,
			},
			...(person.publicKey
				? {
						publickey: {
							userId,
							keyId: person.publicKey.id,
							keyPem: person.publicKey.publicKeyPem,
						},
					}
				: {}),
		})) as MiRemoteUser;
	} catch (e) {
		if (isDuplicateKeyValueError(e)) {
			// /users/@a => /users/:id のように入力がaliasなときにエラーになることがあるのを対応
			const u = await fetchUserByUriFromDatabase(deps.db, person.id);
			if (u == null) throw new Error('already registered', { cause: e });
			user = u as MiRemoteUser;
		} else {
			throw e;
		}
	}

	if (deps.meta.enableStatsForFederatedInstances) {
		fetchOrRegisterInstanceForApi(deps, host)
			.then(async (i) => {
				await adjustInstanceUsersCountFromDatabase(deps.db, i.id, 1);
			})
			.catch(() => {});
	}

	await updateUsertagsForApi(deps, user, tags);

	try {
		const updates = await resolveAvatarAndBannerForApi(deps, user, person.icon, person.image);
		await updateUserInDatabase(deps.db, user.id, updates);
		user = { ...user, ...updates };
	} catch {
		// アバター/バナー取得の失敗はユーザー作成自体を失敗させない
	}

	return user;
}

/** uriPersonCache はプロセス内キャッシュのため、この経路では更新しない。 */
export async function fetchPersonForApi(
	deps: ApiApPersonDependencies,
	uri: string,
): Promise<MiLocalUser | MiRemoteUser | null> {
	if (uri.startsWith(`${deps.config.instance.url}/`)) {
		const id = uri.split('/').pop();
		if (id == null) return null;
		const u = await fetchUserByIdFromDatabase(deps.db, id);
		return u as MiLocalUser | null;
	}

	return (await fetchUserByUriFromDatabase(deps.db, uri)) as MiLocalUser | MiRemoteUser | null;
}

export async function resolvePersonForApi(
	deps: ApiApPersonDependencies,
	uri: string,
	history: Set<string> = new Set(),
): Promise<MiLocalUser | MiRemoteUser> {
	const exist = await fetchPersonForApi(deps, uri);
	if (exist) return exist;

	return await createPersonForApi(deps, uri, history);
}

/** 認証済み・レート制限付きの AP 解決経路で使うため、プロセスローカルキャッシュを持たず直接DBを読む。 */
export async function getAuthUserFromApIdForApi(
	deps: ApiApPersonDependencies,
	uri: string,
): Promise<ApiAuthUser | null> {
	const user = (await resolvePersonForApi(deps, uri)) as MiRemoteUser;
	if (user.isDeleted) return null;

	const key = await fetchUserPublickeyByUserIdFromDatabase(deps.db, user.id);
	return { user, key };
}

function getUserUriForApPerson(config: Pick<Config, 'instance'>, user: MiLocalUser | MiRemoteUser): string {
	return user.host == null ? `${config.instance.url}/users/${user.id}` : user.uri;
}

/**
 * dst の alsoKnownAs を辿り、movedToUri が dst を指す旧アカウントが実在するかを調べる。
 */
export async function validateAlsoKnownAsForApi(
	deps: ApiApPersonDependencies,
	dstInput: MiLocalUser | MiRemoteUser,
	check: (
		oldUser: MiLocalUser | MiRemoteUser | null,
		newUser: MiLocalUser | MiRemoteUser,
	) => boolean | Promise<boolean> = () => true,
	instant = false,
): Promise<MiLocalUser | MiRemoteUser | null> {
	let dst = dstInput;
	let resultUser: MiLocalUser | MiRemoteUser | null = null;

	if (dst.host != null) {
		if (Date.now() - (dst.lastFetchedAt?.getTime() ?? 0) > 10 * 1000) {
			await updatePersonForApi(deps, dst.uri, dst);
		}
		dst = (await fetchPersonForApi(deps, dst.uri)) ?? dst;
	}

	if (!dst.alsoKnownAs || dst.alsoKnownAs.length === 0) return null;

	const dstUri = getUserUriForApPerson(deps.config, dst);

	for (const srcUri of dst.alsoKnownAs) {
		try {
			let src = await fetchPersonForApi(deps, srcUri);
			if (!src) continue; // このサーバーに存在しない旧アカウントにはフォロー関係がないため対象外とする。

			if (dst.host != null && src.host != null) {
				if (Date.now() - (src.lastFetchedAt?.getTime() ?? 0) > 10 * 1000) {
					await updatePersonForApi(deps, srcUri, src);
				}
				src = (await fetchPersonForApi(deps, srcUri)) ?? src;
			}

			if (src.movedToUri === dstUri) {
				if (await check(resultUser, src)) {
					resultUser = src;
				}
				if (instant && resultUser) return resultUser;
			}
		} catch {
			/* エラーが発生した候補は対象外とする。 */
		}
	}

	return resultUser;
}

export const federationUpdateRemoteUserParamDef = z.object({
	userId: misskeyId(),
});

export async function handleApiFederationUpdateRemoteUser(
	deps: ApiApPersonDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(federationUpdateRemoteUserParamDef, body);

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	// IdentifiableError も生の Error も runApiEndpoint では 500 INTERNAL_ERROR になってしまうため、
	// 「そのIDのユーザーが居ない」「ローカルユーザーを指定した」は明示的なAPIエラーとして返す
	if (user == null) {
		throw new ApiError({
			status: 400,
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '15348ddd-432d-49c2-8a5a-8069753becff',
		});
	}
	if (user.host == null) {
		throw new ApiError({
			status: 400,
			message: 'User is not a remote user.',
			code: 'NOT_REMOTE_USER',
			id: 'e3ad347a-2493-4f8f-bac0-f91c88daa754',
		});
	}

	await updatePersonForApi(deps, user.uri!, user as MiRemoteUser);
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

async function webfingerForApi(
	deps: { httpRequestService: Pick<HttpRequestService, 'getJson'> },
	query: string,
): Promise<WebfingerResult> {
	let url: string;
	if (webfingerUrlRegex.test(query)) {
		const u = new URL(query);
		url = `${u.protocol}//${u.hostname}/.well-known/webfinger?${urlQuery({ resource: query })}`;
	} else {
		const m = query.match(webfingerAcctRegex);
		if (!m) throw new Error(`Invalid query (${query})`);
		const hostname = m[2];
		const useHttp =
			process.env['MISSKEY_WEBFINGER_USE_HTTP'] && process.env['MISSKEY_WEBFINGER_USE_HTTP'].toLowerCase() === 'true';
		url = `http${useHttp ? '' : 's'}://${hostname}/.well-known/webfinger?${urlQuery({ resource: `acct:${query}` })}`;
	}

	return await deps.httpRequestService.getJson<WebfingerResult>(url, 'application/jrd+json, application/json');
}

async function resolveSelfForApi(
	deps: { httpRequestService: Pick<HttpRequestService, 'getJson'> },
	acctLower: string,
): Promise<WebfingerLink> {
	const finger = await webfingerForApi(deps, acctLower).catch((err) => {
		throw new Error(`Failed to WebFinger for ${acctLower}: ${err.statusCode ?? err.message}`);
	});
	const self = finger.links.find((link) => link.rel != null && link.rel.toLowerCase() === 'self');
	if (!self) {
		throw new Error('self link not found');
	}
	return self;
}

/**
 * リモートユーザーが未登録ならWebFingerで解決して作成し、登録済みかつ
 * 24時間以上再取得していなければWebFinger→updatePersonForApiで再同期する。
 */
export async function resolveUserForApi(
	deps: ApiApPersonDependencies,
	username: string,
	host: string | null,
): Promise<MiLocalUser | MiRemoteUser> {
	const usernameLower = username.toLowerCase();

	if (host == null || toPuny(host) === toPuny(deps.config.runtime.host)) {
		const localUser = await fetchLocalUserByUsernameFromDatabase(deps.db, usernameLower);
		if (localUser == null) {
			throw new Error('user not found');
		}
		return localUser;
	}

	const punyHost = toPuny(host);
	const user = (await fetchUserByUsernameAndHostFromDatabase(deps.db, usernameLower, punyHost)) as MiRemoteUser | null;

	const acctLower = `${usernameLower}@${punyHost}`;

	if (user == null) {
		const self = await resolveSelfForApi(deps, acctLower);

		if (punyHostForApi(self.href) === toPuny(deps.config.runtime.host)) {
			const local = parseLocalApUri(deps.config, self.href);
			if (local.local && local.type === 'users') {
				const u = await getUserFromApIdForApi(deps, self.href);
				if (u == null) {
					throw new Error('local user not found');
				}
				return u as MiLocalUser;
			}
		}

		return await createPersonForApi(deps, self.href);
	}

	// ユーザー情報が古い場合は、WebFingerからやりなおして返す
	if (user.lastFetchedAt == null || Date.now() - user.lastFetchedAt.getTime() > 1000 * 60 * 60 * 24) {
		// 繋がらないインスタンスに何回も試行するのを防ぐ, 後続の同様処理の連続試行を防ぐ ため 試行前にも更新する
		await updateUserLastFetchedAtInDatabase(deps.db, user.id, new Date());

		const self = await resolveSelfForApi(deps, acctLower);

		if (user.uri !== self.href) {
			// URI が一致しない場合は user@host と AP の Person ID (RemoteUser.uri) の対応を修正する。
			const uri = new URL(self.href);
			if (uri.hostname !== punyHost) {
				throw new Error('Invalid uri');
			}

			await updateUserUriByUsernameAndHostInDatabase(deps.db, usernameLower, punyHost, self.href);
		}

		await updatePersonForApi(deps, self.href, user);

		const resynced = await fetchUserByUriFromDatabase(deps.db, self.href);
		if (resynced == null) {
			throw new Error('user not found');
		}
		return resynced as MiLocalUser | MiRemoteUser;
	}

	return user;
}
