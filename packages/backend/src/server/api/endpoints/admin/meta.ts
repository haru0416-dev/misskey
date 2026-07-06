/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			cacheRemoteFiles: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			cacheRemoteSensitiveFiles: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			emailRequiredForSignup: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableHcaptcha: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			hcaptchaSiteKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableMcaptcha: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			mcaptchaSiteKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			mcaptchaInstanceUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableRecaptcha: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			recaptchaSiteKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableTurnstile: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			turnstileSiteKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableTestcaptcha: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			googleAnalyticsMeasurementId: {
				type: 'string',
				optional: false, nullable: true,
			},
			swPublickey: {
				type: 'string',
				optional: false, nullable: true,
			},
			mascotImageUrl: {
				type: 'string',
				optional: false, nullable: true,
				default: '/assets/ai.png',
			},
			bannerUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			serverErrorImageUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			infoImageUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			notFoundImageUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			iconUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			app192IconUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			app512IconUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableEmail: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableServiceWorker: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			translatorAvailable: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			silencedHosts: {
				type: 'array',
				optional: true,
				nullable: false,
				items: {
					type: 'string',
					optional: false,
					nullable: false,
				},
			},
			mediaSilencedHosts: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'string',
					optional: false,
					nullable: false,
				},
			},
			pinnedUsers: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			hiddenTags: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			blockedHosts: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			sensitiveWords: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			prohibitedWords: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			prohibitedWordsForNameOfUser: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			bannedEmailDomains: {
				type: 'array',
				optional: true, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
			preservedUsernames: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			hcaptchaSecretKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			mcaptchaSecretKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			recaptchaSecretKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			turnstileSecretKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			sensitiveMediaDetection: {
				type: 'string',
				optional: false, nullable: false,
				enum: ['none', 'all', 'local', 'remote'],
			},
			sensitiveMediaDetectionSensitivity: {
				type: 'string',
				optional: false, nullable: false,
				enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'],
			},
			setSensitiveFlagAutomatically: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableSensitiveMediaDetectionForVideos: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			sensitiveMediaDetectionApiUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			sensitiveMediaDetectionApiKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			sensitiveMediaDetectionTimeout: {
				type: 'number',
				optional: false, nullable: false,
			},
			sensitiveMediaDetectionMaxImagesPerRequest: {
				type: 'number',
				optional: false, nullable: false,
			},
			proxyAccountId: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
			},
			email: {
				type: 'string',
				optional: false, nullable: true,
			},
			smtpSecure: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			smtpHost: {
				type: 'string',
				optional: false, nullable: true,
			},
			smtpPort: {
				type: 'number',
				optional: false, nullable: true,
			},
			smtpUser: {
				type: 'string',
				optional: false, nullable: true,
			},
			smtpPass: {
				type: 'string',
				optional: false, nullable: true,
			},
			swPrivateKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			useObjectStorage: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			objectStorageBaseUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStorageBucket: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStoragePrefix: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStorageEndpoint: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStorageRegion: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStoragePort: {
				type: 'number',
				optional: false, nullable: true,
			},
			objectStorageAccessKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStorageSecretKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStorageUseSSL: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			objectStorageUseProxy: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			objectStorageSetPublicRead: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableIpLogging: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableActiveEmailValidation: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableVerifymailApi: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			verifymailAuthKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableTruemailApi: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			truemailInstance: {
				type: 'string',
				optional: false, nullable: true,
			},
			truemailAuthKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			enableChartsForRemoteUser: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableChartsForFederatedInstances: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableStatsForFederatedInstances: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableServerMachineStats: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableIdenticonGeneration: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			manifestJsonOverride: {
				type: 'string',
				optional: false, nullable: false,
			},
			policies: {
				type: 'object',
				optional: false, nullable: false,
			},
			enableFanoutTimeline: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableFanoutTimelineDbFallback: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			perLocalUserUserTimelineCacheMax: {
				type: 'number',
				optional: false, nullable: false,
			},
			perRemoteUserUserTimelineCacheMax: {
				type: 'number',
				optional: false, nullable: false,
			},
			perUserHomeTimelineCacheMax: {
				type: 'number',
				optional: false, nullable: false,
			},
			perUserListTimelineCacheMax: {
				type: 'number',
				optional: false, nullable: false,
			},
			enableReactionsBuffering: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			notesPerOneAd: {
				type: 'number',
				optional: false, nullable: false,
			},
			backgroundImageUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			deeplAuthKey: {
				type: 'string',
				optional: false, nullable: true,
			},
			deeplIsPro: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			defaultDarkTheme: {
				type: 'string',
				optional: false, nullable: true,
			},
			defaultLightTheme: {
				type: 'string',
				optional: false, nullable: true,
			},
			clientOptions: {
				ref: 'MetaClientOptions',
			},
			description: {
				type: 'string',
				optional: false, nullable: true,
			},
			disableRegistration: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			impressumUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			maintainerEmail: {
				type: 'string',
				optional: false, nullable: true,
			},
			maintainerName: {
				type: 'string',
				optional: false, nullable: true,
			},
			name: {
				type: 'string',
				optional: false, nullable: true,
			},
			shortName: {
				type: 'string',
				optional: false, nullable: true,
			},
			objectStorageS3ForcePathStyle: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			privacyPolicyUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			inquiryUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			repositoryUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			feedbackUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			summalyProxy: {
				type: 'string',
				optional: false, nullable: true,
				deprecated: true,
				description: '[Deprecated] Use "urlPreviewSummaryProxyUrl" instead.',
			},
			themeColor: {
				type: 'string',
				optional: false, nullable: true,
			},
			tosUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			uri: {
				type: 'string',
				optional: false, nullable: false,
			},
			version: {
				type: 'string',
				optional: false, nullable: false,
			},
			urlPreviewEnabled: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			urlPreviewAllowRedirect: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			urlPreviewTimeout: {
				type: 'number',
				optional: false, nullable: false,
			},
			urlPreviewMaximumContentLength: {
				type: 'number',
				optional: false, nullable: false,
			},
			urlPreviewRequireContentLength: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			urlPreviewUserAgent: {
				type: 'string',
				optional: false, nullable: true,
			},
			urlPreviewSummaryProxyUrl: {
				type: 'string',
				optional: false, nullable: true,
			},
			federation: {
				type: 'string',
				enum: ['all', 'specified', 'none'],
				optional: false, nullable: false,
			},
			federationHosts: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
			deliverSuspendedSoftware: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						software: {
							type: 'string',
							optional: false, nullable: false,
						},
						versionRange: {
							type: 'string',
							optional: false, nullable: false,
						},
					},
				},
			},
			singleUserMode: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			ugcVisibilityForVisitor: {
				type: 'string',
				enum: ['all', 'local', 'none'],
				optional: false, nullable: false,
			},
			proxyRemoteFiles: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			signToActivityPubGet: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			allowExternalApRedirect: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			enableRemoteNotesCleaning: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			remoteNotesCleaningExpiryDaysForEachNotes: {
				type: 'number',
				optional: false, nullable: false,
			},
			remoteNotesCleaningMaxProcessingDurationInMinutes: {
				type: 'number',
				optional: false, nullable: false,
			},
			showRoleBadgesOfRemoteUsers: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = z.object({});
