/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';

export class MiMeta {
	public id: string;

	public rootUserId: MiUser['id'] | null;

	public rootUser: MiUser | null;

	public name: string | null;

	public shortName: string | null;

	public description: string | null;

	/**
	 * メンテナの名前
	 */
	public maintainerName: string | null;

	/**
	 * メンテナの連絡先
	 */
	public maintainerEmail: string | null;

	public disableRegistration: boolean;

	public langs: string[];

	public pinnedUsers: string[];

	public hiddenTags: string[];

	public blockedHosts: string[];

	public sensitiveWords: string[];

	public prohibitedWords: string[];

	public prohibitedWordsForNameOfUser: string[];

	public silencedHosts: string[];

	public mediaSilencedHosts: string[];

	public themeColor: string | null;

	public mascotImageUrl: string | null;

	public bannerUrl: string | null;

	public backgroundImageUrl: string | null;

	public logoImageUrl: string | null;

	public iconUrl: string | null;

	public app192IconUrl: string | null;

	public app512IconUrl: string | null;

	public serverErrorImageUrl: string | null;

	public notFoundImageUrl: string | null;

	public infoImageUrl: string | null;

	public cacheRemoteFiles: boolean;

	public cacheRemoteSensitiveFiles: boolean;

	public emailRequiredForSignup: boolean;

	public enableHcaptcha: boolean;

	public hcaptchaSiteKey: string | null;

	public hcaptchaSecretKey: string | null;

	public enableMcaptcha: boolean;

	public mcaptchaSitekey: string | null;

	public mcaptchaSecretKey: string | null;

	public mcaptchaInstanceUrl: string | null;

	public enableRecaptcha: boolean;

	public recaptchaSiteKey: string | null;

	public recaptchaSecretKey: string | null;

	public enableTurnstile: boolean;

	public turnstileSiteKey: string | null;

	public turnstileSecretKey: string | null;

	public enableTestcaptcha: boolean;

	// chaptcha系を追加した際にはnodeinfoのレスポンスに追加するのを忘れないようにすること

	public sensitiveMediaDetection: 'none' | 'all' | 'local' | 'remote';

	public sensitiveMediaDetectionSensitivity: 'medium' | 'low' | 'high' | 'veryLow' | 'veryHigh';

	public setSensitiveFlagAutomatically: boolean;

	public enableSensitiveMediaDetectionForVideos: boolean;

	public sensitiveMediaDetectionApiUrl: string | null;

	public sensitiveMediaDetectionApiKey: string | null;

	public sensitiveMediaDetectionTimeout: number;

	public sensitiveMediaDetectionMaxImagesPerRequest: number;

	public enableEmail: boolean;

	public email: string | null;

	public smtpSecure: boolean;

	public smtpHost: string | null;

	public smtpPort: number | null;

	public smtpUser: string | null;

	public smtpPass: string | null;

	public enableServiceWorker: boolean;

	public swPublicKey: string | null;

	public swPrivateKey: string | null;

	public deeplAuthKey: string | null;

	public deeplIsPro: boolean;

	public termsOfServiceUrl: string | null;

	public repositoryUrl: string | null;

	public feedbackUrl: string | null;

	public impressumUrl: string | null;

	public privacyPolicyUrl: string | null;

	public inquiryUrl: string | null;

	public defaultLightTheme: string | null;

	public defaultDarkTheme: string | null;

	public useObjectStorage: boolean;

	public objectStorageBucket: string | null;

	public objectStoragePrefix: string | null;

	public objectStorageBaseUrl: string | null;

	public objectStorageEndpoint: string | null;

	public objectStorageRegion: string | null;

	public objectStorageAccessKey: string | null;

	public objectStorageSecretKey: string | null;

	public objectStoragePort: number | null;

	public objectStorageUseSSL: boolean;

	public objectStorageUseProxy: boolean;

	public objectStorageSetPublicRead: boolean;

	public objectStorageS3ForcePathStyle: boolean;

	public enableIpLogging: boolean;

	public enableActiveEmailValidation: boolean;

	public enableVerifymailApi: boolean;

	public verifymailAuthKey: string | null;

	public enableTruemailApi: boolean;

	public truemailInstance: string | null;

	public truemailAuthKey: string | null;

	public enableChartsForRemoteUser: boolean;

	public enableChartsForFederatedInstances: boolean;

	public enableStatsForFederatedInstances: boolean;

	public enableServerMachineStats: boolean;

	public enableIdenticonGeneration: boolean;

	public policies: Record<string, any>;

	public serverRules: string[];

	public manifestJsonOverride: string;

	public bannedEmailDomains: string[];

	public preservedUsernames: string[];

	public enableFanoutTimeline: boolean;

	public enableFanoutTimelineDbFallback: boolean;

	public perLocalUserUserTimelineCacheMax: number;

	public perRemoteUserUserTimelineCacheMax: number;

	public perUserHomeTimelineCacheMax: number;

	public perUserListTimelineCacheMax: number;

	public enableReactionsBuffering: boolean;

	public notesPerOneAd: number;

	public urlPreviewEnabled: boolean;

	public urlPreviewAllowRedirect: boolean;

	public urlPreviewTimeout: number;

	public urlPreviewMaximumContentLength: number;

	public urlPreviewRequireContentLength: boolean;

	public urlPreviewSummaryProxyUrl: string | null;

	public urlPreviewUserAgent: string | null;

	public federation: 'all' | 'specified' | 'none';

	public federationHosts: string[];

	public ugcVisibilityForVisitor: 'all' | 'local' | 'none';

	public googleAnalyticsMeasurementId: string | null;

	public deliverSuspendedSoftware: SoftwareSuspension[];

	public singleUserMode: boolean;

	public proxyRemoteFiles: boolean;

	public signToActivityPubGet: boolean;

	public allowExternalApRedirect: boolean;

	public enableRemoteNotesCleaning: boolean;

	public remoteNotesCleaningMaxProcessingDurationInMinutes: number;

	public remoteNotesCleaningExpiryDaysForEachNotes: number;

	public showRoleBadgesOfRemoteUsers: boolean;

	public clientOptions: {
		entrancePageStyle: 'classic' | 'simple';
		showTimelineForVisitor: boolean;
		showActivitiesForVisitor: boolean;
	};
}

export type SoftwareSuspension = {
	software: string,
	versionRange: string,
};
