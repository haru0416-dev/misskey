/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { registerContractEndpoints } from './endpoints/index.js';
import { Hono } from 'hono';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { NotePostProcessing } from '@/core/note/note-post-processing.js';
import type { MiMeta } from '@/models/_.js';
import type { DownloadService } from '@/core/net/download-service.js';
import type { FileInfoService } from '@/core/drive/file-info-service.js';
import type { HttpRequestService } from '@/core/net/http-request-service.js';
import type { ImageProcessingService } from '@/core/drive/image-processing-service.js';
import type { InternalStorageService } from '@/core/drive/internal-storage-service.js';
import type { S3Service } from '@/core/drive/s3-service.js';
import type { UserAuthService } from '@/core/account/user-auth-service.js';
import type { VideoProcessingService } from '@/core/drive/video-processing-service.js';
import type { WebAuthnService } from '@/core/account/webauthn-service.js';
import type { EmailService } from '@/core/email/email-service.js';
import type { ChartWriters } from '@/core/chart/chart-runtime.js';
import type Logger from '@/logger.js';
import type { AdminQueueEndpointDependencies } from './admin/admin-queue.js';
import type { MainStreamPublisher } from '../../core/notification/notification.js';
import type {
	AdminStreamPublisher,
	BroadcastStreamPublisher,
	ChatRoomStreamPublisher,
	ChatUserStreamPublisher,
	DriveStreamPublisher,
	CredentialEventPublisher,
	InternalEventPublisher,
	NoteStreamPublisher,
	NotesStreamPublisher,
	UserListStreamPublisher,
} from '../../core/events.js';
import { jsonResponse, setApiHeaders } from './shell-helpers.js';
import { registerAuthAccountRoutes } from './routes/auth-account.js';
import { registerDriveRoutes } from './routes/drive.js';
import { registerUsersRoutes } from './routes/users.js';

export type ShellDependencies = AdminQueueEndpointDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	redis: Redis.Redis;
	redisForTimelines: Redis.Redis;
	downloadService: Pick<DownloadService, 'downloadUrl' | 'fetchFileName'>;
	fileInfoService: Pick<FileInfoService, 'fetchFileInfo'>;
	httpRequestService: HttpRequestService;
	imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
	internalStorageService: Pick<InternalStorageService, 'del' | 'resolvePath' | 'saveFromBuffer' | 'saveFromPath'>;
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
	notePostProcessing: NotePostProcessing;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	publishInternalEvent?: InternalEventPublisher;
	publishCredentialEvent: CredentialEventPublisher;
	publishBroadcastStream?: BroadcastStreamPublisher;
	publishMainStream?: MainStreamPublisher;
	publishAdminStream?: AdminStreamPublisher;
	publishDriveStream?: DriveStreamPublisher;
	publishUserListStream?: UserListStreamPublisher;
	publishChatUserStream?: ChatUserStreamPublisher;
	publishChatRoomStream?: ChatRoomStreamPublisher;
	publishNotesStream?: NotesStreamPublisher;
	publishNoteStream?: NoteStreamPublisher;
};

const unknownApiEndpoint = {
	error: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		kind: 'client',
	},
};

export function createApiShellApp(deps: ShellDependencies): Hono {
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

	registerContractEndpoints(app, deps);
	registerAuthAccountRoutes(app, deps);
	registerDriveRoutes(app, deps);
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
