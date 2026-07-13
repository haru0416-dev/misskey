/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { MiMeta } from '@/models/Meta.js';

export const adminUpdateMetaParamDef = z.object({
	disableRegistration: z.boolean().nullable().optional(),
	signupRateLimitMinIntervalSeconds: z.number().int().min(0).max(86400).optional(),
	signupRateLimitMaxPerHour: z.number().int().min(0).max(100000).optional(),
	pinnedUsers: z.array(z.string()).nullable().optional(),
	hiddenTags: z.array(z.string()).nullable().optional(),
	blockedHosts: z.array(z.string()).nullable().optional(),
	sensitiveWords: z.array(z.string()).nullable().optional(),
	prohibitedWords: z.array(z.string()).nullable().optional(),
	prohibitedWordsForNameOfUser: z.array(z.string()).nullable().optional(),
	themeColor: z.string().regex(new RegExp('^#[0-9a-fA-F]{6}$')).nullable().optional(),
	mascotImageUrl: z.string().nullable().optional(),
	bannerUrl: z.string().nullable().optional(),
	serverErrorImageUrl: z.string().nullable().optional(),
	infoImageUrl: z.string().nullable().optional(),
	notFoundImageUrl: z.string().nullable().optional(),
	iconUrl: z.string().nullable().optional(),
	app192IconUrl: z.string().nullable().optional(),
	app512IconUrl: z.string().nullable().optional(),
	backgroundImageUrl: z.string().nullable().optional(),
	logoImageUrl: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
	shortName: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	defaultLightTheme: z.string().nullable().optional(),
	defaultDarkTheme: z.string().nullable().optional(),
	clientOptions: z.object({
		entrancePageStyle: z.enum(['classic', 'simple']).optional(),
		showTimelineForVisitor: z.boolean().optional(),
		showActivitiesForVisitor: z.boolean().optional(),
	}).optional(),
	cacheRemoteFiles: z.boolean().optional(),
	cacheRemoteSensitiveFiles: z.boolean().optional(),
	emailRequiredForSignup: z.boolean().optional(),
	enableHcaptcha: z.boolean().optional(),
	hcaptchaSiteKey: z.string().nullable().optional(),
	hcaptchaSecretKey: z.string().nullable().optional(),
	enableMcaptcha: z.boolean().optional(),
	mcaptchaSiteKey: z.string().nullable().optional(),
	mcaptchaInstanceUrl: z.string().nullable().optional(),
	mcaptchaSecretKey: z.string().nullable().optional(),
	enableRecaptcha: z.boolean().optional(),
	recaptchaSiteKey: z.string().nullable().optional(),
	recaptchaSecretKey: z.string().nullable().optional(),
	enableTurnstile: z.boolean().optional(),
	turnstileSiteKey: z.string().nullable().optional(),
	turnstileSecretKey: z.string().nullable().optional(),
	enableTestcaptcha: z.boolean().optional(),
	googleAnalyticsMeasurementId: z.string().nullable().optional(),
	sensitiveMediaDetection: z.enum(['none', 'all', 'local', 'remote']).optional(),
	sensitiveMediaDetectionSensitivity: z.enum(['medium', 'low', 'high', 'veryLow', 'veryHigh']).optional(),
	setSensitiveFlagAutomatically: z.boolean().optional(),
	enableSensitiveMediaDetectionForVideos: z.boolean().optional(),
	sensitiveMediaDetectionApiUrl: z.string().nullable().optional(),
	sensitiveMediaDetectionApiKey: z.string().nullable().optional(),
	sensitiveMediaDetectionTimeout: z.number().int().min(1).optional(),
	sensitiveMediaDetectionMaxImagesPerRequest: z.number().int().min(1).optional(),
	maintainerName: z.string().nullable().optional(),
	maintainerEmail: z.string().nullable().optional(),
	langs: z.array(z.string()).optional(),
	deeplAuthKey: z.string().nullable().optional(),
	deeplIsPro: z.boolean().optional(),
	translatorProvider: z.enum(['deepl', 'libreTranslate']).optional(),
	libreTranslateApiUrl: z.union([z.string().url(), z.literal('')]).nullable().optional(),
	libreTranslateApiKey: z.string().nullable().optional(),
	enableEmail: z.boolean().optional(),
	email: z.string().nullable().optional(),
	smtpSecure: z.boolean().optional(),
	smtpHost: z.string().nullable().optional(),
	smtpPort: z.number().int().nullable().optional(),
	smtpUser: z.string().nullable().optional(),
	smtpPass: z.string().nullable().optional(),
	enableServiceWorker: z.boolean().optional(),
	swPublicKey: z.string().nullable().optional(),
	swPrivateKey: z.string().nullable().optional(),
	tosUrl: z.string().nullable().optional(),
	repositoryUrl: z.string().nullable().optional(),
	feedbackUrl: z.string().nullable().optional(),
	impressumUrl: z.string().nullable().optional(),
	privacyPolicyUrl: z.string().nullable().optional(),
	inquiryUrl: z.string().nullable().optional(),
	useObjectStorage: z.boolean().optional(),
	objectStorageBaseUrl: z.string().nullable().optional(),
	objectStorageBucket: z.string().nullable().optional(),
	objectStoragePrefix: z.string().regex(/^[a-zA-Z0-9-._]*$/).nullable().optional(),
	objectStorageEndpoint: z.string().nullable().optional(),
	objectStorageRegion: z.string().nullable().optional(),
	objectStoragePort: z.number().int().nullable().optional(),
	objectStorageAccessKey: z.string().nullable().optional(),
	objectStorageSecretKey: z.string().nullable().optional(),
	objectStorageUseSSL: z.boolean().optional(),
	objectStorageUseProxy: z.boolean().optional(),
	objectStorageSetPublicRead: z.boolean().optional(),
	objectStorageS3ForcePathStyle: z.boolean().optional(),
	enableIpLogging: z.boolean().optional(),
	enableActiveEmailValidation: z.boolean().optional(),
	enableVerifymailApi: z.boolean().optional(),
	verifymailAuthKey: z.string().nullable().optional(),
	enableTruemailApi: z.boolean().optional(),
	truemailInstance: z.string().nullable().optional(),
	truemailAuthKey: z.string().nullable().optional(),
	enableChartsForRemoteUser: z.boolean().optional(),
	enableChartsForFederatedInstances: z.boolean().optional(),
	enableStatsForFederatedInstances: z.boolean().optional(),
	enableServerMachineStats: z.boolean().optional(),
	enableIdenticonGeneration: z.boolean().optional(),
	serverRules: z.array(z.string()).optional(),
	bannedEmailDomains: z.array(z.string()).optional(),
	preservedUsernames: z.array(z.string()).optional(),
	manifestJsonOverride: z.string().optional(),
	enableFanoutTimeline: z.boolean().optional(),
	enableFanoutTimelineDbFallback: z.boolean().optional(),
	perLocalUserUserTimelineCacheMax: z.number().int().optional(),
	perRemoteUserUserTimelineCacheMax: z.number().int().optional(),
	perUserHomeTimelineCacheMax: z.number().int().optional(),
	perUserListTimelineCacheMax: z.number().int().optional(),
	enableReactionsBuffering: z.boolean().optional(),
	notesPerOneAd: z.number().int().optional(),
	silencedHosts: z.array(z.string()).nullable().optional(),
	mediaSilencedHosts: z.array(z.string()).nullable().optional(),
	urlPreviewEnabled: z.boolean().optional(),
	urlPreviewAllowRedirect: z.boolean().optional(),
	urlPreviewTimeout: z.number().int().optional(),
	urlPreviewMaximumContentLength: z.number().int().optional(),
	urlPreviewRequireContentLength: z.boolean().optional(),
	urlPreviewUserAgent: z.string().nullable().optional(),
	urlPreviewSummaryProxyUrl: z.string().nullable().optional(),
	urlPreviewSensitiveList: z.array(z.string()).nullable().optional(),
	federation: z.enum(['all', 'none', 'specified']).optional(),
	federationHosts: z.array(z.string()).optional(),
	deliverSuspendedSoftware: z.array(z.object({
		software: z.string(),
		versionRange: z.string(),
	})).optional(),
	singleUserMode: z.boolean().optional(),
	ugcVisibilityForVisitor: z.enum(['all', 'local', 'none']).optional(),
	proxyRemoteFiles: z.boolean().optional(),
	signToActivityPubGet: z.boolean().optional(),
	allowExternalApRedirect: z.boolean().optional(),
	enableRemoteNotesCleaning: z.boolean().optional(),
	remoteNotesCleaningExpiryDaysForEachNotes: z.number().optional(),
	remoteNotesCleaningMaxProcessingDurationInMinutes: z.number().optional(),
	showRoleBadgesOfRemoteUsers: z.boolean().optional(),
});

// server/api/metas/admin.ts の 'admin/update-meta' paramDef (docs/misskey-js生成専用) が
// このJSON Schema版を参照する。全paramDef中これが最後の非Zod形式 (server/api/endpoints.ts
// 参照)。Zodからこの形状を導出できるようになったら削除する。
export const adminUpdateMetaJsonSchema = {
	type: 'object',
	properties: {
		disableRegistration: { type: 'boolean', nullable: true },
		signupRateLimitMinIntervalSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
		signupRateLimitMaxPerHour: { type: 'integer', minimum: 0, maximum: 100000 },
		pinnedUsers: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		hiddenTags: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		blockedHosts: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		sensitiveWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWords: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		prohibitedWordsForNameOfUser: {
			type: 'array', nullable: true, items: {
				type: 'string',
			},
		},
		themeColor: { type: 'string', nullable: true, pattern: '^#[0-9a-fA-F]{6}$' },
		mascotImageUrl: { type: 'string', nullable: true },
		bannerUrl: { type: 'string', nullable: true },
		serverErrorImageUrl: { type: 'string', nullable: true },
		infoImageUrl: { type: 'string', nullable: true },
		notFoundImageUrl: { type: 'string', nullable: true },
		iconUrl: { type: 'string', nullable: true },
		app192IconUrl: { type: 'string', nullable: true },
		app512IconUrl: { type: 'string', nullable: true },
		backgroundImageUrl: { type: 'string', nullable: true },
		logoImageUrl: { type: 'string', nullable: true },
		name: { type: 'string', nullable: true },
		shortName: { type: 'string', nullable: true },
		description: { type: 'string', nullable: true },
		defaultLightTheme: { type: 'string', nullable: true },
		defaultDarkTheme: { type: 'string', nullable: true },
		clientOptions: {
			type: 'object', nullable: false,
			properties: {
				entrancePageStyle: { type: 'string', nullable: false, enum: ['classic', 'simple'] },
				showTimelineForVisitor: { type: 'boolean', nullable: false },
				showActivitiesForVisitor: { type: 'boolean', nullable: false },
			},
		},
		cacheRemoteFiles: { type: 'boolean' },
		cacheRemoteSensitiveFiles: { type: 'boolean' },
		emailRequiredForSignup: { type: 'boolean' },
		enableHcaptcha: { type: 'boolean' },
		hcaptchaSiteKey: { type: 'string', nullable: true },
		hcaptchaSecretKey: { type: 'string', nullable: true },
		enableMcaptcha: { type: 'boolean' },
		mcaptchaSiteKey: { type: 'string', nullable: true },
		mcaptchaInstanceUrl: { type: 'string', nullable: true },
		mcaptchaSecretKey: { type: 'string', nullable: true },
		enableRecaptcha: { type: 'boolean' },
		recaptchaSiteKey: { type: 'string', nullable: true },
		recaptchaSecretKey: { type: 'string', nullable: true },
		enableTurnstile: { type: 'boolean' },
		turnstileSiteKey: { type: 'string', nullable: true },
		turnstileSecretKey: { type: 'string', nullable: true },
		enableTestcaptcha: { type: 'boolean' },
		googleAnalyticsMeasurementId: { type: 'string', nullable: true },
		sensitiveMediaDetection: { type: 'string', enum: ['none', 'all', 'local', 'remote'] },
		sensitiveMediaDetectionSensitivity: { type: 'string', enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'] },
		setSensitiveFlagAutomatically: { type: 'boolean' },
		enableSensitiveMediaDetectionForVideos: { type: 'boolean' },
		sensitiveMediaDetectionApiUrl: { type: 'string', nullable: true },
		sensitiveMediaDetectionApiKey: { type: 'string', nullable: true },
		sensitiveMediaDetectionTimeout: { type: 'integer', minimum: 1 },
		sensitiveMediaDetectionMaxImagesPerRequest: { type: 'integer', minimum: 1 },
		maintainerName: { type: 'string', nullable: true },
		maintainerEmail: { type: 'string', nullable: true },
		langs: {
			type: 'array', items: {
				type: 'string',
			},
		},
		deeplAuthKey: { type: 'string', nullable: true },
		deeplIsPro: { type: 'boolean' },
		translatorProvider: { type: 'string', enum: ['deepl', 'libreTranslate'] },
		libreTranslateApiUrl: { type: 'string', nullable: true },
		libreTranslateApiKey: { type: 'string', nullable: true },
		enableEmail: { type: 'boolean' },
		email: { type: 'string', nullable: true },
		smtpSecure: { type: 'boolean' },
		smtpHost: { type: 'string', nullable: true },
		smtpPort: { type: 'integer', nullable: true },
		smtpUser: { type: 'string', nullable: true },
		smtpPass: { type: 'string', nullable: true },
		enableServiceWorker: { type: 'boolean' },
		swPublicKey: { type: 'string', nullable: true },
		swPrivateKey: { type: 'string', nullable: true },
		tosUrl: { type: 'string', nullable: true },
		repositoryUrl: { type: 'string', nullable: true },
		feedbackUrl: { type: 'string', nullable: true },
		impressumUrl: { type: 'string', nullable: true },
		privacyPolicyUrl: { type: 'string', nullable: true },
		inquiryUrl: { type: 'string', nullable: true },
		useObjectStorage: { type: 'boolean' },
		objectStorageBaseUrl: { type: 'string', nullable: true },
		objectStorageBucket: { type: 'string', nullable: true },
		objectStoragePrefix: { type: 'string', pattern: /^[a-zA-Z0-9-._]*$/.source, nullable: true },
		objectStorageEndpoint: { type: 'string', nullable: true },
		objectStorageRegion: { type: 'string', nullable: true },
		objectStoragePort: { type: 'integer', nullable: true },
		objectStorageAccessKey: { type: 'string', nullable: true },
		objectStorageSecretKey: { type: 'string', nullable: true },
		objectStorageUseSSL: { type: 'boolean' },
		objectStorageUseProxy: { type: 'boolean' },
		objectStorageSetPublicRead: { type: 'boolean' },
		objectStorageS3ForcePathStyle: { type: 'boolean' },
		enableIpLogging: { type: 'boolean' },
		enableActiveEmailValidation: { type: 'boolean' },
		enableVerifymailApi: { type: 'boolean' },
		verifymailAuthKey: { type: 'string', nullable: true },
		enableTruemailApi: { type: 'boolean' },
		truemailInstance: { type: 'string', nullable: true },
		truemailAuthKey: { type: 'string', nullable: true },
		enableChartsForRemoteUser: { type: 'boolean' },
		enableChartsForFederatedInstances: { type: 'boolean' },
		enableStatsForFederatedInstances: { type: 'boolean' },
		enableServerMachineStats: { type: 'boolean' },
		enableIdenticonGeneration: { type: 'boolean' },
		serverRules: { type: 'array', items: { type: 'string' } },
		bannedEmailDomains: { type: 'array', items: { type: 'string' } },
		preservedUsernames: { type: 'array', items: { type: 'string' } },
		manifestJsonOverride: { type: 'string' },
		enableFanoutTimeline: { type: 'boolean' },
		enableFanoutTimelineDbFallback: { type: 'boolean' },
		perLocalUserUserTimelineCacheMax: { type: 'integer' },
		perRemoteUserUserTimelineCacheMax: { type: 'integer' },
		perUserHomeTimelineCacheMax: { type: 'integer' },
		perUserListTimelineCacheMax: { type: 'integer' },
		enableReactionsBuffering: { type: 'boolean' },
		notesPerOneAd: { type: 'integer' },
		silencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		mediaSilencedHosts: {
			type: 'array',
			nullable: true,
			items: {
				type: 'string',
			},
		},
		urlPreviewEnabled: { type: 'boolean' },
		urlPreviewAllowRedirect: { type: 'boolean' },
		urlPreviewTimeout: { type: 'integer' },
		urlPreviewMaximumContentLength: { type: 'integer' },
		urlPreviewRequireContentLength: { type: 'boolean' },
		urlPreviewUserAgent: { type: 'string', nullable: true },
		urlPreviewSummaryProxyUrl: { type: 'string', nullable: true },
		urlPreviewSensitiveList: {
			type: 'array',
			nullable: true,
			items: { type: 'string' },
		},
		federation: {
			type: 'string',
			enum: ['all', 'none', 'specified'],
		},
		federationHosts: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		deliverSuspendedSoftware: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					software: { type: 'string' },
					versionRange: { type: 'string' },
				},
				required: ['software', 'versionRange'],
			},
		},
		singleUserMode: { type: 'boolean' },
		ugcVisibilityForVisitor: {
			type: 'string',
			enum: ['all', 'local', 'none'],
		},
		proxyRemoteFiles: { type: 'boolean' },
		signToActivityPubGet: { type: 'boolean' },
		allowExternalApRedirect: { type: 'boolean' },
		enableRemoteNotesCleaning: { type: 'boolean' },
		remoteNotesCleaningExpiryDaysForEachNotes: { type: 'number' },
		remoteNotesCleaningMaxProcessingDurationInMinutes: { type: 'number' },
		showRoleBadgesOfRemoteUsers: { type: 'boolean' },
	},
	required: [],
} as const;

export type AdminUpdateMetaParams = z.infer<typeof adminUpdateMetaParamDef> & Record<string, unknown>;

const directAdminUpdateMetaFields = [
	'themeColor',
	'mascotImageUrl',
	'bannerUrl',
	'iconUrl',
	'app192IconUrl',
	'app512IconUrl',
	'serverErrorImageUrl',
	'infoImageUrl',
	'notFoundImageUrl',
	'backgroundImageUrl',
	'logoImageUrl',
	'name',
	'shortName',
	'description',
	'defaultLightTheme',
	'defaultDarkTheme',
	'cacheRemoteFiles',
	'cacheRemoteSensitiveFiles',
	'emailRequiredForSignup',
	'signupRateLimitMinIntervalSeconds',
	'signupRateLimitMaxPerHour',
	'enableHcaptcha',
	'hcaptchaSiteKey',
	'hcaptchaSecretKey',
	'enableMcaptcha',
	'mcaptchaInstanceUrl',
	'mcaptchaSecretKey',
	'enableRecaptcha',
	'recaptchaSiteKey',
	'recaptchaSecretKey',
	'enableTurnstile',
	'turnstileSiteKey',
	'turnstileSecretKey',
	'enableTestcaptcha',
	'sensitiveMediaDetection',
	'sensitiveMediaDetectionSensitivity',
	'setSensitiveFlagAutomatically',
	'enableSensitiveMediaDetectionForVideos',
	'sensitiveMediaDetectionTimeout',
	'sensitiveMediaDetectionMaxImagesPerRequest',
	'maintainerName',
	'maintainerEmail',
	'enableEmail',
	'email',
	'smtpSecure',
	'smtpHost',
	'smtpPort',
	'smtpUser',
	'smtpPass',
	'enableServiceWorker',
	'swPublicKey',
	'swPrivateKey',
	'feedbackUrl',
	'impressumUrl',
	'privacyPolicyUrl',
	'inquiryUrl',
	'useObjectStorage',
	'objectStorageBaseUrl',
	'objectStorageBucket',
	'objectStoragePrefix',
	'objectStorageEndpoint',
	'objectStorageRegion',
	'objectStoragePort',
	'objectStorageAccessKey',
	'objectStorageSecretKey',
	'objectStorageUseSSL',
	'objectStorageUseProxy',
	'objectStorageSetPublicRead',
	'objectStorageS3ForcePathStyle',
	'deeplIsPro',
	'translatorProvider',
	'enableIpLogging',
	'enableActiveEmailValidation',
	'enableVerifymailApi',
	'enableTruemailApi',
	'enableChartsForRemoteUser',
	'enableChartsForFederatedInstances',
	'enableStatsForFederatedInstances',
	'enableServerMachineStats',
	'enableIdenticonGeneration',
	'serverRules',
	'preservedUsernames',
	'manifestJsonOverride',
	'enableFanoutTimeline',
	'enableFanoutTimelineDbFallback',
	'perLocalUserUserTimelineCacheMax',
	'perRemoteUserUserTimelineCacheMax',
	'perUserHomeTimelineCacheMax',
	'perUserListTimelineCacheMax',
	'enableReactionsBuffering',
	'notesPerOneAd',
	'bannedEmailDomains',
	'urlPreviewEnabled',
	'urlPreviewAllowRedirect',
	'urlPreviewTimeout',
	'urlPreviewMaximumContentLength',
	'urlPreviewRequireContentLength',
	'federation',
	'deliverSuspendedSoftware',
	'singleUserMode',
	'ugcVisibilityForVisitor',
	'proxyRemoteFiles',
	'signToActivityPubGet',
	'allowExternalApRedirect',
	'enableRemoteNotesCleaning',
	'remoteNotesCleaningExpiryDaysForEachNotes',
	'remoteNotesCleaningMaxProcessingDurationInMinutes',
	'showRoleBadgesOfRemoteUsers',
] as const;

function copyDefinedMetaFields(set: Partial<MiMeta>, params: AdminUpdateMetaParams): void {
	const writable = set as Record<string, unknown>;

	for (const field of directAdminUpdateMetaFields) {
		const value = params[field];
		if (value !== undefined) {
			writable[field] = value;
		}
	}
}

function filterTruthyStrings(values: string[]): string[] {
	return values.filter(Boolean);
}

function normalizeHostList(values: string[]): string[] {
	return values.filter(Boolean).map(x => x.toLowerCase());
}

function normalizeSilencedHosts(values: string[], blockedHosts: string[] | undefined): string[] {
	let lastValue = '';
	return [...values].sort().filter((h) => {
		const lv = lastValue;
		lastValue = h;
		return h !== '' && h !== lv && !blockedHosts?.includes(h);
	});
}

function emptyStringToNull(value: string | null): string | null {
	return value === '' ? null : value;
}

export function buildAdminUpdateMetaPatch(
	serverSettings: MiMeta,
	params: AdminUpdateMetaParams,
): Partial<MiMeta> {
	const set = {} as Partial<MiMeta>;

	if (typeof params.disableRegistration === 'boolean') {
		set.disableRegistration = params.disableRegistration;
	}

	if (Array.isArray(params.pinnedUsers)) {
		set.pinnedUsers = filterTruthyStrings(params.pinnedUsers);
	}

	if (Array.isArray(params.hiddenTags)) {
		set.hiddenTags = filterTruthyStrings(params.hiddenTags);
	}

	if (Array.isArray(params.blockedHosts)) {
		set.blockedHosts = normalizeHostList(params.blockedHosts);
	}

	if (Array.isArray(params.sensitiveWords)) {
		set.sensitiveWords = filterTruthyStrings(params.sensitiveWords);
	}

	if (Array.isArray(params.prohibitedWords)) {
		set.prohibitedWords = filterTruthyStrings(params.prohibitedWords);
	}

	if (Array.isArray(params.prohibitedWordsForNameOfUser)) {
		set.prohibitedWordsForNameOfUser = filterTruthyStrings(params.prohibitedWordsForNameOfUser);
	}

	if (Array.isArray(params.silencedHosts)) {
		set.silencedHosts = normalizeSilencedHosts(params.silencedHosts, set.blockedHosts);
	}

	if (Array.isArray(params.mediaSilencedHosts)) {
		set.mediaSilencedHosts = normalizeSilencedHosts(params.mediaSilencedHosts, set.blockedHosts);
	}

	if (Array.isArray(params.urlPreviewSensitiveList)) {
		set.urlPreviewSensitiveList = params.urlPreviewSensitiveList.map(value => value.trim()).filter(Boolean);
	}

	copyDefinedMetaFields(set, params);

	if (params.clientOptions !== undefined) {
		set.clientOptions = {
			...serverSettings.clientOptions,
			...params.clientOptions,
		};
	}

	if (params.mcaptchaSiteKey !== undefined) {
		set.mcaptchaSitekey = params.mcaptchaSiteKey;
	}

	if (params.googleAnalyticsMeasurementId !== undefined) {
		// 空文字列をnullにしたいので??は使わない
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		set.googleAnalyticsMeasurementId = params.googleAnalyticsMeasurementId || null;
	}

	if (params.sensitiveMediaDetectionApiUrl !== undefined) {
		set.sensitiveMediaDetectionApiUrl = emptyStringToNull(params.sensitiveMediaDetectionApiUrl);
	}

	if (params.sensitiveMediaDetectionApiKey !== undefined) {
		set.sensitiveMediaDetectionApiKey = emptyStringToNull(params.sensitiveMediaDetectionApiKey);
	}

	if (Array.isArray(params.langs)) {
		set.langs = filterTruthyStrings(params.langs);
	}

	if (params.tosUrl !== undefined) {
		set.termsOfServiceUrl = params.tosUrl;
	}

	if (params.repositoryUrl !== undefined) {
		set.repositoryUrl = URL.canParse(params.repositoryUrl as string) ? params.repositoryUrl : null;
	}

	if (params.deeplAuthKey !== undefined) {
		set.deeplAuthKey = emptyStringToNull(params.deeplAuthKey);
	}

	if (params.libreTranslateApiUrl !== undefined) {
		set.libreTranslateApiUrl = emptyStringToNull(params.libreTranslateApiUrl);
	}

	if (params.libreTranslateApiKey !== undefined) {
		set.libreTranslateApiKey = emptyStringToNull(params.libreTranslateApiKey);
	}

	if (params.verifymailAuthKey !== undefined) {
		set.verifymailAuthKey = emptyStringToNull(params.verifymailAuthKey);
	}

	if (params.truemailInstance !== undefined) {
		set.truemailInstance = emptyStringToNull(params.truemailInstance);
	}

	if (params.truemailAuthKey !== undefined) {
		set.truemailAuthKey = emptyStringToNull(params.truemailAuthKey);
	}

	if (params.urlPreviewUserAgent !== undefined) {
		const value = (params.urlPreviewUserAgent ?? '').trim();
		set.urlPreviewUserAgent = value === '' ? null : params.urlPreviewUserAgent;
	}

	if (params.urlPreviewSummaryProxyUrl !== undefined) {
		const value = (params.urlPreviewSummaryProxyUrl ?? '').trim();
		set.urlPreviewSummaryProxyUrl = value === '' ? null : value;
	}

	if (Array.isArray(params.federationHosts)) {
		set.federationHosts = normalizeHostList(params.federationHosts);
	}

	return set;
}
