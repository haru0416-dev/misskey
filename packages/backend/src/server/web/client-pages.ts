/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { fetchClipByIdFromDatabase } from '@/core/ClipStore.js';
import { fetchFlashByIdFromDatabase } from '@/core/FlashStore.js';
import { fetchGalleryPostByIdFromDatabase } from '@/core/GalleryPostStore.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { fetchPageByNameAndUserIdFromDatabase } from '@/core/PageStore.js';
import { fetchLocalUserByIdFromDatabase, fetchUserByIdFromDatabase, fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import * as Acct from '@/misc/acct.js';
import { htmlSafeJsonStringify } from '@/misc/json-stringify-html-safe.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { packClipForHonoApi, type HonoApiClipDependencies } from '../rest/clips.js';
import { packFlashForHonoApi, type HonoApiFlashDependencies } from '../rest/flash.js';
import { packGalleryPostForHonoApi, type HonoApiGalleryDependencies } from '../rest/gallery.js';
import { packNoteForHonoApi, type HonoApiNoteDependencies } from '../rest/note.js';
import { packPageForHonoApi, type HonoApiPageDependencies } from '../rest/pages.js';
import { packUserDetailedNotMeForHonoApi } from '../rest/user.js';
import type { CommonData } from './views/_.js';
import { ClipPage } from './views/clip.js';
import { FlashPage } from './views/flash.js';
import { GalleryPostPage } from './views/gallery-post.js';
import { NotePage } from './views/note.js';
import { PagePage } from './views/page.js';
import { UserPage } from './views/user.js';

export type ClientPagesDependencies =
	& HonoApiNoteDependencies
	& HonoApiClipDependencies
	& HonoApiFlashDependencies
	& HonoApiGalleryDependencies
	& HonoApiPageDependencies
	& {
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

function entityPageHeaders(profile: MiUserProfile, cacheControl = 'public, max-age=15'): Record<string, string> {
	return {
		'Cache-Control': cacheControl,
		'Vary': 'Accept',
		...(profile.preventAiLearning ? { 'X-Robots-Tag': 'noimageai, noai' } : {}),
	};
}

function isUgcVisibleToVisitor(deps: Pick<ClientPagesDependencies, 'meta'>, userHost: string | null): boolean {
	return deps.meta.ugcVisibilityForVisitor === 'all' ||
		(deps.meta.ugcVisibilityForVisitor === 'local' && userHost == null);
}

/**
 * ClientServerService のエンティティ別SSRページ (ユーザー/ノート/Pages/Play/クリップ/ギャラリー) 相当。
 * 該当エンティティが見つからない・可視でない場合は next() で後段の client-base (汎用ページ) に委ねる。
 */
export function createClientPagesApp(deps: ClientPagesDependencies): Hono {
	const app = new Hono();

	// /users/:id → /@:username リダイレクト (HTML閲覧時)
	app.get('/users/:user', async (c) => {
		const user = await fetchLocalUserByIdFromDatabase(deps.db, c.req.param('user'));

		if (user == null || user.isSuspended) {
			return c.body(null, 404, { 'Vary': 'Accept' });
		}

		return c.redirect(`/@${user.username}${user.host == null ? '' : '@' + user.host}`, 302);
	});

	app.get('/notes/:note', async (c, next) => {
		const note = await fetchNoteByIdFromDatabase(deps.db, c.req.param('note'));
		const noteUser = note != null && ['public', 'home'].includes(note.visibility)
			? await fetchUserByIdFromDatabase(deps.db, note.userId)
			: null;

		if (
			note != null &&
			noteUser != null &&
			!noteUser.requireSigninToViewContents &&
			['public', 'home'].includes(note.visibility) &&
			isUgcVisibleToVisitor(deps, note.userHost)
		) {
			const packedNote = await packNoteForHonoApi(deps, note, null, { detail: true });
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, note.userId);

			return htmlResponse(NotePage({
				note: packedNote,
				profile,
				...(await deps.getCommonData()),
				clientCtxJson: htmlSafeJsonStringify({ note: packedNote }),
			}), entityPageHeaders(profile));
		}

		await next();
		return;
	});

	app.get('/play/:id', async (c, next) => {
		const flash = await fetchFlashByIdFromDatabase(deps.db, c.req.param('id'));

		if (flash != null) {
			const packedFlash = await packFlashForHonoApi(deps, flash, null) as unknown as Packed<'Flash'>;
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, flash.userId);

			return htmlResponse(FlashPage({
				flash: packedFlash,
				profile,
				...(await deps.getCommonData()),
			}), entityPageHeaders(profile));
		}

		await next();
		return;
	});

	app.get('/clips/:clip', async (c, next) => {
		const clip = await fetchClipByIdFromDatabase(deps.db, c.req.param('clip'));

		if (clip != null && clip.isPublic) {
			const packedClip = await packClipForHonoApi(deps, clip, null);
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, clip.userId);

			return htmlResponse(ClipPage({
				clip: packedClip,
				profile,
				...(await deps.getCommonData()),
				clientCtxJson: htmlSafeJsonStringify({ clip: packedClip }),
			}), entityPageHeaders(profile));
		}

		await next();
		return;
	});

	app.get('/gallery/:post', async (c, next) => {
		const post = await fetchGalleryPostByIdFromDatabase(deps.db, c.req.param('post'));

		if (post != null) {
			const packedPost = await packGalleryPostForHonoApi(deps, post, null);
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, post.userId);

			return htmlResponse(GalleryPostPage({
				galleryPost: packedPost,
				profile,
				...(await deps.getCommonData()),
			}), entityPageHeaders(profile));
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

		const segments = pathname.slice(2).split('/').map(segment => decodeURIComponent(segment));
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
			if (page == null) {
				await next();
				return;
			}

			const packedPage = await packPageForHonoApi(deps, page, null);
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, page.userId);

			return htmlResponse(PagePage({
				page: packedPage,
				profile,
				...(await deps.getCommonData()),
			}), entityPageHeaders(profile, page.visibility === 'public' ? 'public, max-age=15' : 'private, max-age=0, must-revalidate'));
		}

		// /@:user or /@:user/:sub
		if (segments.length > 2) {
			await next();
			return;
		}

		if (
			user != null && !user.isSuspended && isUgcVisibleToVisitor(deps, user.host)
		) {
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
			const packedUser = await packUserDetailedNotMeForHonoApi(deps, user, null) as unknown as Packed<'UserDetailed'>;

			return htmlResponse(UserPage({
				user: packedUser,
				profile,
				sub: segments[1],
				...(await deps.getCommonData()),
				clientCtxJson: htmlSafeJsonStringify({ user: packedUser }),
			}), entityPageHeaders(profile));
		}

		// リモートユーザー等: モデレータがAPI経由で参照可能にするために404にはせず汎用ページへ
		await next();
		return;
	});

	return app;
}
