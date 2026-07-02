/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import fastifyStatic from '@fastify/static';
import fastifyProxy from '@fastify/http-proxy';
import vary from 'vary';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import * as Acct from '@/misc/acct.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { GalleryPostEntityService } from '@/core/entities/GalleryPostEntityService.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import type {
	MiMeta,
} from '@/models/_.js';
import type Logger from '@/logger.js';
import { handleRequestRedirectToOmitSearch } from '@/misc/fastify-hook-handlers.js';
import { htmlSafeJsonStringify } from '@/misc/json-stringify-html-safe.js';
import { bindThis } from '@/decorators.js';
import { FlashEntityService } from '@/core/entities/FlashEntityService.js';
import { AnnouncementEntityService } from '@/core/entities/AnnouncementEntityService.js';
import { fetchGlobalAnnouncementByIdFromDatabase } from '@/core/AnnouncementStore.js';
import { fetchClipByIdFromDatabase } from '@/core/ClipStore.js';
import { fetchFlashByIdFromDatabase } from '@/core/FlashStore.js';
import { fetchGalleryPostByIdFromDatabase } from '@/core/GalleryPostStore.js';
import { fetchChannelByIdFromDatabase } from '@/core/ChannelStore.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { fetchPageByNameAndUserIdFromDatabase } from '@/core/PageStore.js';
import { fetchLocalUserByIdFromDatabase, fetchUserByIdFromDatabase, fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ClientLoggerService } from './ClientLoggerService.js';
import { HtmlTemplateService } from './HtmlTemplateService.js';

import { BasePage } from './views/base.js';
import { UserPage } from './views/user.js';
import { NotePage } from './views/note.js';
import { PagePage } from './views/page.js';
import { ClipPage } from './views/clip.js';
import { FlashPage } from './views/flash.js';
import { GalleryPostPage } from './views/gallery-post.js';
import { ChannelPage } from './views/channel.js';
import { AnnouncementPage } from './views/announcement.js';
import { BaseEmbed } from './views/base-embed.js';
import { ErrorPage } from './views/error.js';

import type { FastifyError, FastifyInstance, FastifyPluginOptions, FastifyReply } from 'fastify';

@Injectable()
export class ClientServerService {
	private readonly frontendViteOut: string;
	private readonly frontendEmbedViteOut: string;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private flashEntityService: FlashEntityService,
		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private pageEntityService: PageEntityService,
		private galleryPostEntityService: GalleryPostEntityService,
		private clipEntityService: ClipEntityService,
		private channelEntityService: ChannelEntityService,
		private announcementEntityService: AnnouncementEntityService,
		private htmlTemplateService: HtmlTemplateService,
		private clientLoggerService: ClientLoggerService,
	) {
		//this.createServer = this.createServer.bind(this);
		this.frontendViteOut = resolve(this.config.rootDir, 'built/_frontend_vite_');
		this.frontendEmbedViteOut = resolve(this.config.rootDir, 'built/_frontend_embed_vite_');
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		const configUrl = new URL(this.config.url);

		fastify.addHook('onRequest', (request, reply, done) => {
			// クリックジャッキング防止のためiFrameの中に入れられないようにする
			reply.header('X-Frame-Options', 'DENY');
			done();
		});

		//#region vite assets
		if (this.config.frontendEmbedManifestExists) {
			this.clientLoggerService.logger.info(`[ClientServerService] Using built frontend vite assets. ${this.frontendViteOut}`);
			fastify.register((fastify, options, done) => {
				fastify.register(fastifyStatic, {
					root: this.frontendViteOut,
					prefix: '/vite/',
					maxAge: ms('30 days'),
					immutable: true,
					decorateReply: false,
				});
				fastify.register(fastifyStatic, {
					root: this.frontendEmbedViteOut,
					prefix: '/embed_vite/',
					maxAge: ms('30 days'),
					immutable: true,
					decorateReply: false,
				});
				fastify.addHook('onRequest', handleRequestRedirectToOmitSearch);
				done();
			});
		} else {
			console.log('[ClientServerService] Proxying to Vite dev server.');
			const urlOriginWithoutPort = configUrl.origin.replace(/:\d+$/, '');

			const port = (process.env.VITE_PORT ?? '5173');
			fastify.register(fastifyProxy, {
				upstream: urlOriginWithoutPort + ':' + port,
				prefix: '/vite',
				rewritePrefix: '/vite',
			});

			const embedPort = (process.env.EMBED_VITE_PORT ?? '5174');
			fastify.register(fastifyProxy, {
				upstream: urlOriginWithoutPort + ':' + embedPort,
				prefix: '/embed_vite',
				rewritePrefix: '/embed_vite',
			});
		}
		//#endregion

		const renderBase = async (reply: FastifyReply, data: Partial<Parameters<typeof BasePage>[0]> = {}) => {
			reply.header('Cache-Control', 'public, max-age=30');
			return await HtmlTemplateService.replyHtml(reply, BasePage({
				img: this.meta.bannerUrl ?? undefined,
				title: this.meta.name ?? 'Misskey',
				desc: this.meta.description ?? undefined,
				...(await this.htmlTemplateService.getCommonData()),
				...data,
			}));
		};

		//#region SSR
		// User
		fastify.get<{ Params: { user: string; sub?: string; } }>('/@:user/:sub?', async (request, reply) => {
			const { username, host } = Acct.parse(request.params.user);
			const user = await fetchUserByUsernameAndHostFromDatabase(this.drizzle, username, host ?? null);

			vary(reply.raw, 'Accept');

			if (
				user != null && !user.isSuspended && (
					this.meta.ugcVisibilityForVisitor === 'all' ||
						(this.meta.ugcVisibilityForVisitor === 'local' && user.host == null)
				)
			) {
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, user.id);

				reply.header('Cache-Control', 'public, max-age=15');
				if (profile.preventAiLearning) {
					reply.header('X-Robots-Tag', 'noimageai');
					reply.header('X-Robots-Tag', 'noai');
				}

				const _user = await this.userEntityService.pack(user, null, {
					schema: 'UserDetailed',
					userProfile: profile,
				});

				return await HtmlTemplateService.replyHtml(reply, UserPage({
					user: _user,
					profile,
					sub: request.params.sub,
					...(await this.htmlTemplateService.getCommonData()),
					clientCtxJson: htmlSafeJsonStringify({
						user: _user,
					}),
				}));
			} else {
				// リモートユーザーなので
				// モデレータがAPI経由で参照可能にするために404にはしない
				return await renderBase(reply);
			}
		});

		fastify.get<{ Params: { user: string; } }>('/users/:user', async (request, reply) => {
			const user = await fetchLocalUserByIdFromDatabase(this.drizzle, request.params.user);

			if (user == null || user.isSuspended) {
				reply.code(404);
				return;
			}

			vary(reply.raw, 'Accept');

			reply.redirect(`/@${user.username}${ user.host == null ? '' : '@' + user.host}`);
		});

		// Note
		fastify.get<{ Params: { note: string; } }>('/notes/:note', async (request, reply) => {
			vary(reply.raw, 'Accept');

			const note = await fetchNoteByIdFromDatabase(this.drizzle, request.params.note);
			const noteUser = note != null && ['public', 'home'].includes(note.visibility)
				? await fetchUserByIdFromDatabase(this.drizzle, note.userId)
				: null;

			if (
				note &&
				noteUser != null &&
				!noteUser.requireSigninToViewContents &&
				['public', 'home'].includes(note.visibility) &&
				(this.meta.ugcVisibilityForVisitor === 'all' ||
					(this.meta.ugcVisibilityForVisitor === 'local' && note.userHost == null)
				)
			) {
				const _note = await this.noteEntityService.pack(note);
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, note.userId);
				reply.header('Cache-Control', 'public, max-age=15');
				if (profile.preventAiLearning) {
					reply.header('X-Robots-Tag', 'noimageai');
					reply.header('X-Robots-Tag', 'noai');
				}
				return await HtmlTemplateService.replyHtml(reply, NotePage({
					note: _note,
					profile,
					...(await this.htmlTemplateService.getCommonData()),
					clientCtxJson: htmlSafeJsonStringify({
						note: _note,
					}),
				}));
			} else {
				return await renderBase(reply);
			}
		});

		// Page
		fastify.get<{ Params: { user: string; page: string; } }>('/@:user/pages/:page', async (request, reply) => {
			const { username, host } = Acct.parse(request.params.user);
			const user = await fetchUserByUsernameAndHostFromDatabase(this.drizzle, username, host ?? null);

			if (user == null) return;

			const page = await fetchPageByNameAndUserIdFromDatabase(this.drizzle, request.params.page, user.id);

			if (page) {
				const _page = await this.pageEntityService.pack(page);
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, page.userId);
				if (['public'].includes(page.visibility)) {
					reply.header('Cache-Control', 'public, max-age=15');
				} else {
					reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
				}
				if (profile.preventAiLearning) {
					reply.header('X-Robots-Tag', 'noimageai');
					reply.header('X-Robots-Tag', 'noai');
				}
				return await HtmlTemplateService.replyHtml(reply, PagePage({
					page: _page,
					profile,
					...(await this.htmlTemplateService.getCommonData()),
				}));
			} else {
				return await renderBase(reply);
			}
		});

		// Flash
		fastify.get<{ Params: { id: string; } }>('/play/:id', async (request, reply) => {
			const flash = await fetchFlashByIdFromDatabase(this.drizzle, request.params.id);

			if (flash) {
				const _flash = await this.flashEntityService.pack(flash);
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, flash.userId);
				reply.header('Cache-Control', 'public, max-age=15');
				if (profile.preventAiLearning) {
					reply.header('X-Robots-Tag', 'noimageai');
					reply.header('X-Robots-Tag', 'noai');
				}
				return await HtmlTemplateService.replyHtml(reply, FlashPage({
					flash: _flash,
					profile,
					...(await this.htmlTemplateService.getCommonData()),
				}));
			} else {
				return await renderBase(reply);
			}
		});

		// Clip
		fastify.get<{ Params: { clip: string; } }>('/clips/:clip', async (request, reply) => {
			const clip = await fetchClipByIdFromDatabase(this.drizzle, request.params.clip);

			if (clip && clip.isPublic) {
				const _clip = await this.clipEntityService.pack(clip);
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, clip.userId);
				reply.header('Cache-Control', 'public, max-age=15');
				if (profile.preventAiLearning) {
					reply.header('X-Robots-Tag', 'noimageai');
					reply.header('X-Robots-Tag', 'noai');
				}
				return await HtmlTemplateService.replyHtml(reply, ClipPage({
					clip: _clip,
					profile,
					...(await this.htmlTemplateService.getCommonData()),
					clientCtxJson: htmlSafeJsonStringify({
						clip: _clip,
					}),
				}));
			} else {
				return await renderBase(reply);
			}
		});

		// Gallery post
		fastify.get<{ Params: { post: string; } }>('/gallery/:post', async (request, reply) => {
			const post = await fetchGalleryPostByIdFromDatabase(this.drizzle, request.params.post);

			if (post) {
				const _post = await this.galleryPostEntityService.pack(post);
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(this.drizzle, post.userId);
				reply.header('Cache-Control', 'public, max-age=15');
				if (profile.preventAiLearning) {
					reply.header('X-Robots-Tag', 'noimageai');
					reply.header('X-Robots-Tag', 'noai');
				}
				return await HtmlTemplateService.replyHtml(reply, GalleryPostPage({
					galleryPost: _post,
					profile,
					...(await this.htmlTemplateService.getCommonData()),
				}));
			} else {
				return await renderBase(reply);
			}
		});

		// Channel
		fastify.get<{ Params: { channel: string; } }>('/channels/:channel', async (request, reply) => {
			const channel = await fetchChannelByIdFromDatabase(this.drizzle, request.params.channel);

			if (channel) {
				const _channel = await this.channelEntityService.pack(channel);
				reply.header('Cache-Control', 'public, max-age=15');
				return await HtmlTemplateService.replyHtml(reply, ChannelPage({
					channel: _channel,
					...(await this.htmlTemplateService.getCommonData()),
				}));
			} else {
				return await renderBase(reply);
			}
		});

		// 個別お知らせページ
		fastify.get<{ Params: { announcementId: string; } }>('/announcements/:announcementId', async (request, reply) => {
			const announcement = await fetchGlobalAnnouncementByIdFromDatabase(this.drizzle, request.params.announcementId);

			if (announcement) {
				const _announcement = await this.announcementEntityService.pack(announcement);
				reply.header('Cache-Control', 'public, max-age=3600');
				return await HtmlTemplateService.replyHtml(reply, AnnouncementPage({
					announcement: _announcement,
					...(await this.htmlTemplateService.getCommonData()),
				}));
			} else {
				return await renderBase(reply);
			}
		});
		//#endregion

		//#region noindex pages
		// Tags
		fastify.get<{ Params: { clip: string; } }>('/tags/:tag', async (request, reply) => {
			return await renderBase(reply, { noindex: true });
		});

		// User with Tags
		fastify.get<{ Params: { clip: string; } }>('/user-tags/:tag', async (request, reply) => {
			return await renderBase(reply, { noindex: true });
		});
		//#endregion

		//#region embed pages
		fastify.get<{ Params: { user: string; } }>('/embed/user-timeline/:user', async (request, reply) => {
			reply.removeHeader('X-Frame-Options');

			const user = await fetchUserByIdFromDatabase(this.drizzle, request.params.user);

			if (user == null) return;
			if (user.host != null) return;

			const _user = await this.userEntityService.pack(user);

			reply.header('Cache-Control', 'public, max-age=3600');
			return await HtmlTemplateService.replyHtml(reply, BaseEmbed({
				title: this.meta.name ?? 'Misskey',
				...(await this.htmlTemplateService.getCommonData()),
				embedCtxJson: htmlSafeJsonStringify({
					user: _user,
				}),
			}));
		});

		fastify.get<{ Params: { note: string; } }>('/embed/notes/:note', async (request, reply) => {
			reply.removeHeader('X-Frame-Options');

			const note = await fetchNoteByIdFromDatabase(this.drizzle, request.params.note);

			if (note == null) return;
			if (['specified', 'followers'].includes(note.visibility)) return;
			if (note.userHost != null) return;

			const _note = await this.noteEntityService.pack(note, null, { detail: true });

			reply.header('Cache-Control', 'public, max-age=3600');
			return await HtmlTemplateService.replyHtml(reply, BaseEmbed({
				title: this.meta.name ?? 'Misskey',
				...(await this.htmlTemplateService.getCommonData()),
				embedCtxJson: htmlSafeJsonStringify({
					note: _note,
				}),
			}));
		});

		fastify.get<{ Params: { clip: string; } }>('/embed/clips/:clip', async (request, reply) => {
			reply.removeHeader('X-Frame-Options');

			const clip = await fetchClipByIdFromDatabase(this.drizzle, request.params.clip);

			if (clip == null) return;

			const _clip = await this.clipEntityService.pack(clip);

			reply.header('Cache-Control', 'public, max-age=3600');
			return await HtmlTemplateService.replyHtml(reply, BaseEmbed({
				title: this.meta.name ?? 'Misskey',
				...(await this.htmlTemplateService.getCommonData()),
				embedCtxJson: htmlSafeJsonStringify({
					clip: _clip,
				}),
			}));
		});

		fastify.get('/embed/*', async (request, reply) => {
			reply.removeHeader('X-Frame-Options');

			reply.header('Cache-Control', 'public, max-age=3600');
			return await HtmlTemplateService.replyHtml(reply, BaseEmbed({
				title: this.meta.name ?? 'Misskey',
				...(await this.htmlTemplateService.getCommonData()),
			}));
		});

		//#endregion

		// Render base html for all requests
		fastify.get('*', async (request, reply) => {
			return await renderBase(reply);
		});

		fastify.setErrorHandler<FastifyError>(async (error, request, reply) => {
			const errId = randomUUID();
			this.clientLoggerService.logger.error(`Internal error occurred in ${request.routeOptions.url}: ${error.message}`, {
				path: request.routeOptions.url,
				params: request.params,
				query: request.query,
				code: error.name,
				stack: error.stack,
				id: errId,
			});
			reply.code(500);
			reply.header('Cache-Control', 'max-age=10, must-revalidate');
			return await HtmlTemplateService.replyHtml(reply, ErrorPage({
				code: error.code,
				id: errId,
			}));
		});

		done();
	}
}
