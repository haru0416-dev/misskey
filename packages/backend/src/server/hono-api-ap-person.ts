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
import { fetchUserByIdFromDatabase, updateUserIfNotDeletedInDatabase } from '@/core/UserStore.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { updateUserPublickeyInDatabase } from '@/core/UserPublickeyStore.js';
import { updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { updateFollowingsByFollowerIdInDatabase } from '@/core/FollowingStore.js';
import { listEmojisByHostAndNamesFromDatabase, updateEmojiByHostAndNameInDatabase, insertEmojiInDatabase } from '@/core/EmojiStore.js';
import { fetchDriveFileByIdOrFailFromDatabase, updateDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { StatusError } from '@/misc/status-error.js';
import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import type { Config } from '@/config.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import { resolveApObjectForHonoApi, resolveCollectionForHonoApi, type HonoApiApResolveDependencies } from './hono-api-ap-resolve.js';
import { uploadDriveFileFromUrlForHonoApi, type HonoApiDriveFileUploadDependencies } from './hono-api-drive-file-upload.js';
import { updateUsertagsForHonoApi } from './hono-api-account-update.js';
import { getHonoApiRolePolicies } from './hono-api-role-policy.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiApPersonDependencies = HonoApiApResolveDependencies & HonoApiDriveFileUploadDependencies;

const nameLength = 128;
const summaryLength = 2048;

function serializeAlsoKnownAs(value: string[] | null | undefined): string | null | undefined {
	return value == null ? value : value.join(',');
}

function validateActorForHonoApi(config: Pick<Config, 'url'>, x: IObject, uri: string): IActor {
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

function toPunyForHonoApi(host: string): string {
	return domainToASCII(host.toLowerCase());
}

function punyHostForHonoApi(url: string): string {
	const urlObj = new URL(url);
	return `${toPunyForHonoApi(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
}

function analyzeAttachmentsForHonoApi(config: Pick<Config, 'url'>, attachments: IObject | IObject[] | undefined): { name: string; value: string }[] {
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

async function extractEmojisForHonoApi(deps: HonoApiApPersonDependencies, tags: IObject | IObject[], host: string): Promise<MiEmoji[]> {
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

async function resolveImageForHonoApi(deps: HonoApiApPersonDependencies, actor: MiRemoteUser, value: string | IObject): Promise<MiDriveFile | null> {
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

async function resolveAvatarAndBannerForHonoApi(
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

async function isPublicCollectionForHonoApi(
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
