/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { isSupportedKeywordFilter } from '@/misc/is-keyword-included.js';
import type { MiMeta } from '@/models/Meta.js';

// 正規表現の形の項目は RE2 で扱えるものに限る (後方参照・先読みは照合時に使えない)。
const keywordFilterList = z
	.array(
		z.string().refine(isSupportedKeywordFilter, {
			message: 'Regular expression is not supported. Backreferences and lookarounds cannot be used.',
		}),
	)
	.nullable()
	.optional();

export const adminUpdateMetaParamDef = z.object({
	disableRegistration: z.boolean().nullable().optional(),
	signupRateLimitMinIntervalSeconds: z.int().min(0).max(86_400).optional(),
	signupRateLimitMaxPerHour: z.int().min(0).max(100_000).optional(),
	pinnedUsers: z.array(z.string()).nullable().optional(),
	hiddenTags: z.array(z.string()).nullable().optional(),
	blockedHosts: z.array(z.string()).nullable().optional(),
	sensitiveWords: keywordFilterList,
	prohibitedWords: keywordFilterList,
	prohibitedWordsForNameOfUser: keywordFilterList,
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
	clientOptions: z
		.object({
			entrancePageStyle: z.enum(['classic', 'simple']).optional(),
			showTimelineForVisitor: z.boolean().optional(),
			showActivitiesForVisitor: z.boolean().optional(),
		})
		.optional(),
	cacheRemoteFiles: z.boolean().optional(),
	cacheRemoteSensitiveFiles: z.boolean().optional(),
	emailRequiredForSignup: z.boolean().optional(),
	enableHcaptcha: z.boolean().optional(),
	hcaptchaSiteKey: z.string().nullable().optional(),
	hcaptchaSecretKey: z.string().nullable().optional(),
	enableCap: z.boolean().optional(),
	capSiteKey: z.string().nullable().optional(),
	capInstanceUrl: z.string().nullable().optional(),
	capSecretKey: z.string().nullable().optional(),
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
	sensitiveMediaDetectionTimeout: z.int().min(1).optional(),
	sensitiveMediaDetectionMaxImagesPerRequest: z.int().min(1).optional(),
	maintainerName: z.string().nullable().optional(),
	maintainerEmail: z.string().nullable().optional(),
	langs: z.array(z.string()).optional(),
	deeplAuthKey: z.string().nullable().optional(),
	deeplIsPro: z.boolean().optional(),
	translatorProvider: z.enum(['deepl', 'libreTranslate']).optional(),
	libreTranslateApiUrl: z
		.union([z.string().url(), z.literal('')])
		.nullable()
		.optional(),
	libreTranslateApiKey: z.string().nullable().optional(),
	enableEmail: z.boolean().optional(),
	email: z.string().nullable().optional(),
	smtpSecure: z.boolean().optional(),
	smtpHost: z.string().nullable().optional(),
	smtpPort: z.int().nullable().optional(),
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
	objectStoragePrefix: z
		.string()
		.regex(/^[a-zA-Z0-9-._]*$/)
		.nullable()
		.optional(),
	objectStorageEndpoint: z.string().nullable().optional(),
	objectStorageRegion: z.string().nullable().optional(),
	objectStoragePort: z.int().nullable().optional(),
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
	perLocalUserUserTimelineCacheMax: z.int().optional(),
	perRemoteUserUserTimelineCacheMax: z.int().optional(),
	perUserHomeTimelineCacheMax: z.int().optional(),
	perUserListTimelineCacheMax: z.int().optional(),
	enableReactionsBuffering: z.boolean().optional(),
	notesPerOneAd: z.int().optional(),
	silencedHosts: z.array(z.string()).nullable().optional(),
	mediaSilencedHosts: z.array(z.string()).nullable().optional(),
	urlPreviewEnabled: z.boolean().optional(),
	urlPreviewAllowRedirect: z.boolean().optional(),
	urlPreviewTimeout: z.int().optional(),
	urlPreviewMaximumContentLength: z.int().optional(),
	urlPreviewRequireContentLength: z.boolean().optional(),
	urlPreviewUserAgent: z.string().nullable().optional(),
	urlPreviewSummaryProxyUrl: z.string().nullable().optional(),
	urlPreviewSensitiveList: keywordFilterList,
	federation: z.enum(['all', 'none', 'specified']).optional(),
	federationHosts: z.array(z.string()).optional(),
	deliverSuspendedSoftware: z
		.array(
			z.object({
				software: z.string(),
				versionRange: z.string(),
			}),
		)
		.optional(),
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
	'enableCap',
	'capInstanceUrl',
	'capSecretKey',
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
	return values.filter(Boolean).map((x) => x.toLowerCase());
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

export function buildAdminUpdateMetaPatch(serverSettings: MiMeta, params: AdminUpdateMetaParams): Partial<MiMeta> {
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
		set.urlPreviewSensitiveList = params.urlPreviewSensitiveList.map((value) => value.trim()).filter(Boolean);
	}

	copyDefinedMetaFields(set, params);

	if (params.clientOptions !== undefined) {
		set.clientOptions = {
			...serverSettings.clientOptions,
			...omitUndefined(params.clientOptions),
		};
	}

	if (params.capSiteKey !== undefined) {
		set.capSiteKey = params.capSiteKey;
	}

	if (params.googleAnalyticsMeasurementId !== undefined) {
		// 空文字列をnullにしたいので??は使わない
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
