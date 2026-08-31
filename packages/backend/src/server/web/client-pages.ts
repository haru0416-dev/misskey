/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { fetchGlobalAnnouncementByIdFromDatabase } from '@/core/announcement/AnnouncementStore.js';
import { fetchChannelByIdFromDatabase } from '@/core/channel/ChannelStore.js';
import { fetchClipByIdFromDatabase } from '@/core/clip/ClipStore.js';
import { fetchFlashByIdFromDatabase } from '@/core/flash/FlashStore.js';
import { fetchGalleryPostByIdFromDatabase } from '@/core/gallery/GalleryPostStore.js';
import { fetchNoteByIdFromDatabase } from '@/core/note/NoteStore.js';
import { fetchPageByNameAndUserIdFromDatabase } from '@/core/page/PageStore.js';
import {
	fetchLocalUserByIdFromDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
} from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import * as Acct from '@/misc/acct.js';
import { htmlSafeJsonStringify } from '@/misc/json-stringify-html-safe.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { packAnnouncementForApi } from '@/server/rest/admin/admin-announcements.js';
import { packChannelForSsr, type ApiChannelsDependencies } from '@/server/rest/channel/channels.js';
import { packClipForApi, type ApiClipDependencies } from '@/server/rest/clip/clips.js';
import { packFlashForApi, type ApiFlashDependencies } from '@/server/rest/flash/flash.js';
import { packGalleryPostForApi, type ApiGalleryDependencies } from '@/server/rest/gallery/gallery.js';
import { packNoteForApi, type ApiNoteDependencies } from '@/server/rest/note/note.js';
import { packPageForApi, type ApiPageDependencies } from '@/server/rest/page/pages.js';
import { packUserDetailedNotMeForApi } from '@/server/rest/user/user.js';
import type { CommonData } from './views/_.js';
import { AnnouncementPage } from './views/announcement.js';
import { ChannelPage } from './views/channel.js';
import { BaseEmbed } from './views/base-embed.js';
import { ClipPage } from './views/clip.js';
import { FlashPage } from './views/flash.js';
import { GalleryPostPage } from './views/gallery-post.js';
import { NotePage } from './views/note.js';
import { PagePage } from './views/page.js';
import { UserPage } from './views/user.js';

export type ClientPagesDependencies = ApiNoteDependencies &
	ApiClipDependencies &
	ApiFlashDependencies &
	ApiGalleryDependencies &
	ApiPageDependencies &
	ApiChannelsDependencies & {
		getCommonData: () => Promise<CommonData>;
	};

function htmlResponse(html: unknown, headers: Record<string, string>): Response {
	return new Response(String(html), {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'X-Frame-Options': 'DENY',
			...headers,
		},
	});
}

/**
 * 埋め込みページ用。第三者サイトの iframe から読まれるため、
 * 通常ページと違い X-Frame-Options を付けてはいけない。
 */
function embedHtmlResponse(html: unknown): Response {
	return new Response(String(html), {
		status: 200,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}

function entityPageHeaders(profile: MiUserProfile, cacheControl = 'public, max-age=15'): Record<string, string> {
	return {
		'Cache-Control': cacheControl,
		Vary: 'Accept',
		...(profile.preventAiLearning ? { 'X-Robots-Tag': 'noimageai, noai' } : {}),
	};
}

function isUgcVisibleToVisitor(deps: Pick<ClientPagesDependencies, 'meta'>, userHost: string | null): boolean {
	return (
		deps.meta.ugcVisibilityForVisitor === 'all' || (deps.meta.ugcVisibilityForVisitor === 'local' && userHost == null)
	);
}

/**
 * 該当エンティティが見つからない・可視でない場合は next() で後段の client-base (汎用ページ) に委ねる。
 */
export function createClientPagesApp(deps: ClientPagesDependencies): Hono {
	const app = new Hono();

	// /users/:id → /@:username リダイレクト (HTML閲覧時)
	app.get('/users/:user', async (c) => {
		const user = await fetchLocalUserByIdFromDatabase(deps.db, c.req.param('user'));

		if (user == null || user.isSuspended) {
			return c.body(null, 404, { Vary: 'Accept' });
		}

		return c.redirect(`/@${user.username}${user.host == null ? '' : '@' + user.host}`, 302);
	});

	app.get('/notes/:note', async (c, next) => {
		const note = await fetchNoteByIdFromDatabase(deps.db, c.req.param('note'));
		const noteUser =
			note != null && ['public', 'home'].includes(note.visibility)
				? await fetchUserByIdFromDatabase(deps.db, note.userId)
				: null;

		if (
			note != null &&
			noteUser != null &&
			!noteUser.requireSigninToViewContents &&
			['public', 'home'].includes(note.visibility) &&
			isUgcVisibleToVisitor(deps, note.userHost)
		) {
			const packedNote = await packNoteForApi(deps, note, null, { detail: true });
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, note.userId);

			return htmlResponse(
				NotePage({
					note: packedNote,
					profile,
					...(await deps.getCommonData()),
					clientCtxJson: htmlSafeJsonStringify({ note: packedNote }),
				}),
				entityPageHeaders(profile),
			);
		}

		await next();
		return;
	});

	app.get('/play/:id', async (c, next) => {
		const flash = await fetchFlashByIdFromDatabase(deps.db, c.req.param('id'));

		// 非公開 Play のタイトル等が匿名訪問者へ漏れるため、public のみ SSR する (非公開は汎用ページへ)。
		if (flash?.visibility === 'public') {
			const packedFlash = (await packFlashForApi(deps, flash, null)) as unknown as Packed<'Flash'>;
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, flash.userId);

			return htmlResponse(
				FlashPage({
					flash: packedFlash,
					profile,
					...(await deps.getCommonData()),
				}),
				entityPageHeaders(profile),
			);
		}

		await next();
		return;
	});

	app.get('/clips/:clip', async (c, next) => {
		const clip = await fetchClipByIdFromDatabase(deps.db, c.req.param('clip'));

		if (clip?.isPublic) {
			const packedClip = await packClipForApi(deps, clip, null);
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, clip.userId);

			return htmlResponse(
				ClipPage({
					clip: packedClip,
					profile,
					...(await deps.getCommonData()),
					clientCtxJson: htmlSafeJsonStringify({ clip: packedClip }),
				}),
				entityPageHeaders(profile),
			);
		}

		await next();
		return;
	});

	app.get('/gallery/:post', async (c, next) => {
		const post = await fetchGalleryPostByIdFromDatabase(deps.db, c.req.param('post'));

		if (post != null) {
			const packedPost = await packGalleryPostForApi(deps, post, null);
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, post.userId);

			return htmlResponse(
				GalleryPostPage({
					galleryPost: packedPost,
					profile,
					...(await deps.getCommonData()),
				}),
				entityPageHeaders(profile),
			);
		}

		await next();
		return;
	});

	// 埋め込みページは X-Frame-Options を外すため、通常ページとは別のレスポンスを返す。
	app.get('/embed/user-timeline/:user', async (c, next) => {
		const user = await fetchUserByIdFromDatabase(deps.db, c.req.param('user'));

		// 通常のユーザーページ (/@:user) と同じ可視性判定にする。
		// 埋め込みだけ緩いと、非公開設定を迂回する経路になってしまう。
		if (user == null || user.host != null || user.isSuspended || !isUgcVisibleToVisitor(deps, user.host)) {
			await next();
			return;
		}

		const packedUser = await packUserDetailedNotMeForApi(deps, user, null);

		return embedHtmlResponse(
			BaseEmbed({
				title: deps.meta.name ?? 'Misskey',
				...(await deps.getCommonData()),
				embedCtxJson: htmlSafeJsonStringify({ user: packedUser }),
			}),
		);
	});

	app.get('/embed/notes/:note', async (c, next) => {
		const note = await fetchNoteByIdFromDatabase(deps.db, c.req.param('note'));
		const noteUser =
			note != null && ['public', 'home'].includes(note.visibility)
				? await fetchUserByIdFromDatabase(deps.db, note.userId)
				: null;

		// 通常のノートページ (/notes/:note) と同じ可視性判定にする。
		// requireSigninToViewContents (ユーザー設定) と ugcVisibilityForVisitor
		// (インスタンス設定) を見ないと、埋め込みが非公開設定の抜け道になる。
		if (
			note == null ||
			noteUser == null ||
			noteUser.isSuspended ||
			noteUser.requireSigninToViewContents ||
			!['public', 'home'].includes(note.visibility) ||
			!isUgcVisibleToVisitor(deps, note.userHost)
		) {
			await next();
			return;
		}

		const packedNote = await packNoteForApi(deps, note, null, { detail: true });

		return embedHtmlResponse(
			BaseEmbed({
				title: deps.meta.name ?? 'Misskey',
				...(await deps.getCommonData()),
				embedCtxJson: htmlSafeJsonStringify({ note: packedNote }),
			}),
		);
	});

	app.get('/embed/clips/:clip', async (c, next) => {
		const clip = await fetchClipByIdFromDatabase(deps.db, c.req.param('clip'));

		// 通常のクリップページ (/clips/:clip) と同じく公開クリップのみ。
		// clip はリモートを持たないので isPublic だけ見れば足りる。
		if (clip == null || !clip.isPublic) {
			await next();
			return;
		}

		const packedClip = await packClipForApi(deps, clip, null);

		return embedHtmlResponse(
			BaseEmbed({
				title: deps.meta.name ?? 'Misskey',
				...(await deps.getCommonData()),
				embedCtxJson: htmlSafeJsonStringify({ clip: packedClip }),
			}),
		);
	});

	app.get('/embed/*', async (c) => {
		return embedHtmlResponse(
			BaseEmbed({
				title: deps.meta.name ?? 'Misskey',
				...(await deps.getCommonData()),
			}),
		);
	});
	app.get('/channels/:channel', async (c, next) => {
		const channel = await fetchChannelByIdFromDatabase(deps.db, c.req.param('channel'));

		if (channel != null) {
			const packedChannel = await packChannelForSsr(deps, channel);

			return htmlResponse(
				ChannelPage({
					channel: packedChannel,
					...(await deps.getCommonData()),
				}),
				{ 'Cache-Control': 'public, max-age=15' },
			);
		}

		await next();
		return;
	});

	app.get('/announcements/:announcement', async (c, next) => {
		const announcement = await fetchGlobalAnnouncementByIdFromDatabase(deps.db, c.req.param('announcement'));

		if (announcement != null) {
			const packedAnnouncement = packAnnouncementForApi(deps.config, announcement, null);

			return htmlResponse(
				AnnouncementPage({
					announcement: packedAnnouncement,
					...(await deps.getCommonData()),
				}),
				{ 'Cache-Control': 'public, max-age=3600' },
			);
		}

		await next();
		return;
	});

	// /@:user, /@:user/:sub, /@:user/pages/:page — Hono はセグメント内プレフィックス付き
	// パラメータを扱えないため、feed.ts と同様にワイルドカード+手動パースで処理する。
	app.get('*', async (c: Context, next: Next) => {
		const pathname = new URL(c.req.url).pathname;
		if (!pathname.startsWith('/@')) {
			await next();
			return;
		}

		const segments = pathname
			.slice(2)
			.split('/')
			.map((segment) => decodeURIComponent(segment));
		const acctStr = segments[0] ?? '';
		if (acctStr === '') {
			await next();
			return;
		}

		const { username, host } = Acct.parse(acctStr);
		const user = await fetchUserByUsernameAndHostFromDatabase(deps.db, username, host ?? null);

		// /@:user/pages/:page
		if (segments.length === 3 && segments[1] === 'pages' && segments[2] !== '') {
			if (user == null) {
				await next();
				return;
			}

			const page = await fetchPageByNameAndUserIdFromDatabase(deps.db, segments[2]!, user.id);
			// タイトル等が匿名訪問者へ漏れるため、public のみ SSR する。
			if (page == null || page.visibility !== 'public') {
				await next();
				return;
			}

			const packedPage = await packPageForApi(deps, page, null);
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, page.userId);

			return htmlResponse(
				PagePage({
					page: packedPage,
					profile,
					...(await deps.getCommonData()),
				}),
				entityPageHeaders(profile),
			);
		}

		// /@:user or /@:user/:sub
		if (segments.length > 2) {
			await next();
			return;
		}

		if (user != null && !user.isSuspended && isUgcVisibleToVisitor(deps, user.host)) {
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
			const packedUser = (await packUserDetailedNotMeForApi(deps, user, null)) as unknown as Packed<'UserDetailed'>;

			return htmlResponse(
				UserPage({
					user: packedUser,
					profile,
					...(segments[1] === undefined ? {} : { sub: segments[1] }),
					...(await deps.getCommonData()),
					clientCtxJson: htmlSafeJsonStringify({ user: packedUser }),
				}),
				entityPageHeaders(profile),
			);
		}

		// リモートユーザー等: モデレータがAPI経由で参照可能にするために404にはせず汎用ページへ
		await next();
		return;
	});

	return app;
}
