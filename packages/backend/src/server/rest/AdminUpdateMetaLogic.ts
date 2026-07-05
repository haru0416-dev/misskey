/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SchemaType } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/Meta.js';

export const adminUpdateMetaParamDef = {
	type: 'object',
	properties: {
		disableRegistration: { type: 'boolean', nullable: true },
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
		summalyProxy: {
			type: 'string', nullable: true,
			description: '[Deprecated] Use "urlPreviewSummaryProxyUrl" instead.',
		},
		urlPreviewEnabled: { type: 'boolean' },
		urlPreviewAllowRedirect: { type: 'boolean' },
		urlPreviewTimeout: { type: 'integer' },
		urlPreviewMaximumContentLength: { type: 'integer' },
		urlPreviewRequireContentLength: { type: 'boolean' },
		urlPreviewUserAgent: { type: 'string', nullable: true },
		urlPreviewSummaryProxyUrl: { type: 'string', nullable: true },
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

export type AdminUpdateMetaParams = SchemaType<typeof adminUpdateMetaParamDef> & Record<string, unknown>;

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

	if (params.summalyProxy !== undefined || params.urlPreviewSummaryProxyUrl !== undefined) {
		const value = ((params.urlPreviewSummaryProxyUrl ?? params.summalyProxy) ?? '').trim();
		set.urlPreviewSummaryProxyUrl = value === '' ? null : value;
	}

	if (Array.isArray(params.federationHosts)) {
		set.federationHosts = normalizeHostList(params.federationHosts);
	}

	return set;
}
