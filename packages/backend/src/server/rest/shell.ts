/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { DownloadService } from '@/core/net/DownloadService.js';
import type { FileInfoService } from '@/core/drive/FileInfoService.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import type { ImageProcessingService } from '@/core/drive/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { S3Service } from '@/core/drive/S3Service.js';
import type { UserAuthService } from '@/core/account/UserAuthService.js';
import type { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
import type { WebAuthnService } from '@/core/account/WebAuthnService.js';
import type { EmailService } from '@/core/email/EmailService.js';
import type { ChartWriters } from '@/server/chart-runtime.js';
import type Logger from '@/logger.js';
import type { ApiAdminQueueDependencies } from './admin/admin-queue.js';
import type { ApiMainStreamPublisher } from './notification/notification.js';
import type {
	ApiAdminStreamPublisher,
	ApiBroadcastStreamPublisher,
	ApiChatRoomStreamPublisher,
	ApiChatUserStreamPublisher,
	ApiDriveStreamPublisher,
	ApiInternalEventPublisher,
	ApiNoteStreamPublisher,
	ApiNotesStreamPublisher,
	ApiUserListStreamPublisher,
} from './events.js';
import { jsonResponse, setApiHeaders } from './shell-helpers.js';
import { registerAuthAccountRoutes } from './routes/auth-account.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminQueueRoutes } from './routes/admin-queue.js';
import { registerAnnouncementsRoutes } from './routes/announcements.js';
import { registerDriveRoutes } from './routes/drive.js';
import { registerEmojisRoutes } from './routes/emojis.js';
import { registerAuthSessionMutesRoutes } from './routes/auth-session-mutes.js';
import { registerChannelsRoutes } from './routes/channels.js';
import { registerChartsRoutes } from './routes/charts.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerClipsRoutes } from './routes/clips.js';
import { registerNotesRoutes } from './routes/notes.js';
import { registerFederationApRoutes } from './routes/federation-ap.js';
import { registerExportImportRoutes } from './routes/export-import.js';
import { registerFollowingGalleryFlashRoutes } from './routes/following-gallery-flash.js';
import { registerHashtagsInviteNotificationsRoutes } from './routes/hashtags-invite-notifications.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerAccountIRoutes } from './routes/account-i.js';
import { registerUsersRoutes } from './routes/users.js';

export type ApiShellDependencies = ApiAdminQueueDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	dbPool: MiDrizzlePool;
	meta: MiMeta;
	redis: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	downloadService: Pick<DownloadService, 'downloadUrl' | 'downloadTextFile'>;
	fileInfoService: Pick<FileInfoService, 'getFileInfo'>;
	httpRequestService: HttpRequestService;
	imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
	internalStorageService: Pick<InternalStorageService, 'del' | 'saveFromBuffer' | 'saveFromPath'>;
	s3Service: Pick<S3Service, 'upload' | 'delete'>;
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate' | 'validateOtp'>;
	videoProcessingService: Pick<VideoProcessingService, 'generateVideoThumbnail'>;
	webAuthnService: Pick<
		WebAuthnService,
		| 'initiateAuthentication'
		| 'verifyAuthentication'
		| 'initiateSignInWithPasskeyAuthentication'
		| 'verifySignInWithPasskeyAuthentication'
		| 'initiateRegistration'
		| 'verifyRegistration'
	>;
	emailService: Pick<EmailService, 'sendEmail' | 'validateEmailForAccount'>;
	chartWriters: ChartWriters;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	publishInternalEvent?: ApiInternalEventPublisher;
	publishBroadcastStream?: ApiBroadcastStreamPublisher;
	publishMainStream?: ApiMainStreamPublisher;
	publishAdminStream?: ApiAdminStreamPublisher;
	publishDriveStream?: ApiDriveStreamPublisher;
	publishUserListStream?: ApiUserListStreamPublisher;
	publishChatUserStream?: ApiChatUserStreamPublisher;
	publishChatRoomStream?: ApiChatRoomStreamPublisher;
	publishNotesStream?: ApiNotesStreamPublisher;
	publishNoteStream?: ApiNoteStreamPublisher;
};

const unknownApiEndpoint = {
	error: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		kind: 'client',
	},
};

export function createApiShellApp(deps: ApiShellDependencies): Hono {
	const app = new Hono();

	app.options('*', (c) => {
		setApiHeaders(c);
		c.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
		const requestedHeaders = c.req.header('Access-Control-Request-Headers');
		if (requestedHeaders != null) {
			c.header('Access-Control-Allow-Headers', requestedHeaders);
		}
		return c.body(null, 204);
	});

	registerAuthAccountRoutes(app, deps);
	registerAdminRoutes(app, deps);
	registerAdminQueueRoutes(app, deps);
	registerAnnouncementsRoutes(app, deps);
	registerDriveRoutes(app, deps);
	registerEmojisRoutes(app, deps);
	registerAuthSessionMutesRoutes(app, deps);
	registerChannelsRoutes(app, deps);
	registerChartsRoutes(app, deps);
	registerChatRoutes(app, deps);
	registerClipsRoutes(app, deps);
	registerNotesRoutes(app, deps);
	registerFederationApRoutes(app, deps);
	registerExportImportRoutes(app, deps);
	registerFollowingGalleryFlashRoutes(app, deps);
	registerHashtagsInviteNotificationsRoutes(app, deps);
	registerMiscRoutes(app, deps);
	registerAccountIRoutes(app, deps);
	registerUsersRoutes(app, deps);

	app.all('/clear-browser-cache', (c) => {
		setApiHeaders(c);
		if (c.req.method === 'GET' || c.req.method === 'POST') {
			c.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
			return c.body(null, 204);
		}

		return c.body(null, 405);
	});

	app.all('/*', (c) => jsonResponse(c, unknownApiEndpoint, 404));

	app.notFound((c) => {
		setApiHeaders(c);
		return c.body('404 Not Found', 404);
	});

	return app;
}
