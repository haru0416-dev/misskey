/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from 'node:os';
import type { Config } from '@/config.js';
import { packMetaDetailed, packMetaLite } from '@/core/MetaEntityPacker.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/_.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiMetaDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

const metaParamDef = {
	type: 'object',
	properties: {
		detail: { type: 'boolean', default: true },
	},
	required: [],
} as const;

const testParamDef = {
	type: 'object',
	properties: {
		required: { type: 'boolean' },
		string: { type: 'string' },
		default: { type: 'string', default: 'hello' },
		nullableDefault: { type: 'string', nullable: true, default: 'hello' },
		id: { type: 'string', format: 'misskey:id' },
	},
	required: ['required'],
} as const;

type MetaParams = SchemaType<typeof metaParamDef>;
type TestParams = SchemaType<typeof testParamDef>;

export async function handleHonoApiMeta(
	deps: HonoApiMetaDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'MetaLite'> | Packed<'MetaDetailed'>> {
	const params = parseHonoApiParams(metaParamDef, body) as MetaParams;
	return params.detail ? await packMetaDetailed(deps) : await packMetaLite(deps);
}

export async function handleHonoApiAdminMeta(
	deps: HonoApiMetaDependencies,
): Promise<Record<string, unknown>> {
	const instance = await fetchMetaFromDatabase(deps.db);
	const proxy = await fetchOrCreateSystemAccount(deps.db, deps.config, instance, 'proxy');

	return {
		maintainerName: instance.maintainerName,
		maintainerEmail: instance.maintainerEmail,
		version: deps.config.version,
		name: instance.name,
		shortName: instance.shortName,
		uri: deps.config.url,
		description: instance.description,
		langs: instance.langs,
		tosUrl: instance.termsOfServiceUrl,
		repositoryUrl: instance.repositoryUrl,
		feedbackUrl: instance.feedbackUrl,
		impressumUrl: instance.impressumUrl,
		privacyPolicyUrl: instance.privacyPolicyUrl,
		inquiryUrl: instance.inquiryUrl,
		disableRegistration: instance.disableRegistration,
		emailRequiredForSignup: instance.emailRequiredForSignup,
		enableHcaptcha: instance.enableHcaptcha,
		hcaptchaSiteKey: instance.hcaptchaSiteKey,
		enableMcaptcha: instance.enableMcaptcha,
		mcaptchaSiteKey: instance.mcaptchaSitekey,
		mcaptchaInstanceUrl: instance.mcaptchaInstanceUrl,
		enableRecaptcha: instance.enableRecaptcha,
		recaptchaSiteKey: instance.recaptchaSiteKey,
		enableTurnstile: instance.enableTurnstile,
		turnstileSiteKey: instance.turnstileSiteKey,
		enableTestcaptcha: instance.enableTestcaptcha,
		googleAnalyticsMeasurementId: instance.googleAnalyticsMeasurementId,
		swPublickey: instance.swPublicKey,
		themeColor: instance.themeColor,
		mascotImageUrl: instance.mascotImageUrl,
		bannerUrl: instance.bannerUrl,
		serverErrorImageUrl: instance.serverErrorImageUrl,
		notFoundImageUrl: instance.notFoundImageUrl,
		infoImageUrl: instance.infoImageUrl,
		iconUrl: instance.iconUrl,
		app192IconUrl: instance.app192IconUrl,
		app512IconUrl: instance.app512IconUrl,
		backgroundImageUrl: instance.backgroundImageUrl,
		logoImageUrl: instance.logoImageUrl,
		defaultLightTheme: instance.defaultLightTheme,
		defaultDarkTheme: instance.defaultDarkTheme,
		clientOptions: instance.clientOptions,
		enableEmail: instance.enableEmail,
		enableServiceWorker: instance.enableServiceWorker,
		translatorAvailable: instance.deeplAuthKey != null,
		cacheRemoteFiles: instance.cacheRemoteFiles,
		cacheRemoteSensitiveFiles: instance.cacheRemoteSensitiveFiles,
		pinnedUsers: instance.pinnedUsers,
		hiddenTags: instance.hiddenTags,
		blockedHosts: instance.blockedHosts,
		silencedHosts: instance.silencedHosts,
		mediaSilencedHosts: instance.mediaSilencedHosts,
		sensitiveWords: instance.sensitiveWords,
		prohibitedWords: instance.prohibitedWords,
		prohibitedWordsForNameOfUser: instance.prohibitedWordsForNameOfUser,
		preservedUsernames: instance.preservedUsernames,
		hcaptchaSecretKey: instance.hcaptchaSecretKey,
		mcaptchaSecretKey: instance.mcaptchaSecretKey,
		recaptchaSecretKey: instance.recaptchaSecretKey,
		turnstileSecretKey: instance.turnstileSecretKey,
		sensitiveMediaDetection: instance.sensitiveMediaDetection,
		sensitiveMediaDetectionSensitivity: instance.sensitiveMediaDetectionSensitivity,
		setSensitiveFlagAutomatically: instance.setSensitiveFlagAutomatically,
		enableSensitiveMediaDetectionForVideos: instance.enableSensitiveMediaDetectionForVideos,
		sensitiveMediaDetectionApiUrl: instance.sensitiveMediaDetectionApiUrl,
		sensitiveMediaDetectionApiKey: instance.sensitiveMediaDetectionApiKey,
		sensitiveMediaDetectionTimeout: instance.sensitiveMediaDetectionTimeout,
		sensitiveMediaDetectionMaxImagesPerRequest: instance.sensitiveMediaDetectionMaxImagesPerRequest,
		proxyAccountId: proxy.id,
		email: instance.email,
		smtpSecure: instance.smtpSecure,
		smtpHost: instance.smtpHost,
		smtpPort: instance.smtpPort,
		smtpUser: instance.smtpUser,
		smtpPass: instance.smtpPass,
		swPrivateKey: instance.swPrivateKey,
		useObjectStorage: instance.useObjectStorage,
		objectStorageBaseUrl: instance.objectStorageBaseUrl,
		objectStorageBucket: instance.objectStorageBucket,
		objectStoragePrefix: instance.objectStoragePrefix,
		objectStorageEndpoint: instance.objectStorageEndpoint,
		objectStorageRegion: instance.objectStorageRegion,
		objectStoragePort: instance.objectStoragePort,
		objectStorageAccessKey: instance.objectStorageAccessKey,
		objectStorageSecretKey: instance.objectStorageSecretKey,
		objectStorageUseSSL: instance.objectStorageUseSSL,
		objectStorageUseProxy: instance.objectStorageUseProxy,
		objectStorageSetPublicRead: instance.objectStorageSetPublicRead,
		objectStorageS3ForcePathStyle: instance.objectStorageS3ForcePathStyle,
		deeplAuthKey: instance.deeplAuthKey,
		deeplIsPro: instance.deeplIsPro,
		enableIpLogging: instance.enableIpLogging,
		enableActiveEmailValidation: instance.enableActiveEmailValidation,
		enableVerifymailApi: instance.enableVerifymailApi,
		verifymailAuthKey: instance.verifymailAuthKey,
		enableTruemailApi: instance.enableTruemailApi,
		truemailInstance: instance.truemailInstance,
		truemailAuthKey: instance.truemailAuthKey,
		enableChartsForRemoteUser: instance.enableChartsForRemoteUser,
		enableChartsForFederatedInstances: instance.enableChartsForFederatedInstances,
		enableStatsForFederatedInstances: instance.enableStatsForFederatedInstances,
		enableServerMachineStats: instance.enableServerMachineStats,
		enableIdenticonGeneration: instance.enableIdenticonGeneration,
		bannedEmailDomains: instance.bannedEmailDomains,
		policies: { ...DEFAULT_POLICIES, ...instance.policies },
		manifestJsonOverride: instance.manifestJsonOverride,
		enableFanoutTimeline: instance.enableFanoutTimeline,
		enableFanoutTimelineDbFallback: instance.enableFanoutTimelineDbFallback,
		perLocalUserUserTimelineCacheMax: instance.perLocalUserUserTimelineCacheMax,
		perRemoteUserUserTimelineCacheMax: instance.perRemoteUserUserTimelineCacheMax,
		perUserHomeTimelineCacheMax: instance.perUserHomeTimelineCacheMax,
		perUserListTimelineCacheMax: instance.perUserListTimelineCacheMax,
		enableReactionsBuffering: instance.enableReactionsBuffering,
		notesPerOneAd: instance.notesPerOneAd,
		summalyProxy: instance.urlPreviewSummaryProxyUrl,
		urlPreviewEnabled: instance.urlPreviewEnabled,
		urlPreviewAllowRedirect: instance.urlPreviewAllowRedirect,
		urlPreviewTimeout: instance.urlPreviewTimeout,
		urlPreviewMaximumContentLength: instance.urlPreviewMaximumContentLength,
		urlPreviewRequireContentLength: instance.urlPreviewRequireContentLength,
		urlPreviewUserAgent: instance.urlPreviewUserAgent,
		urlPreviewSummaryProxyUrl: instance.urlPreviewSummaryProxyUrl,
		federation: instance.federation,
		federationHosts: instance.federationHosts,
		deliverSuspendedSoftware: instance.deliverSuspendedSoftware,
		singleUserMode: instance.singleUserMode,
		ugcVisibilityForVisitor: instance.ugcVisibilityForVisitor,
		proxyRemoteFiles: instance.proxyRemoteFiles,
		signToActivityPubGet: instance.signToActivityPubGet,
		allowExternalApRedirect: instance.allowExternalApRedirect,
		enableRemoteNotesCleaning: instance.enableRemoteNotesCleaning,
		remoteNotesCleaningExpiryDaysForEachNotes: instance.remoteNotesCleaningExpiryDaysForEachNotes,
		remoteNotesCleaningMaxProcessingDurationInMinutes: instance.remoteNotesCleaningMaxProcessingDurationInMinutes,
		showRoleBadgesOfRemoteUsers: instance.showRoleBadgesOfRemoteUsers,
	};
}

export function handleHonoApiPing(): { pong: number } {
	return {
		pong: Date.now(),
	};
}

export function handleHonoApiTest(body: Record<string, unknown>): TestParams {
	return parseHonoApiParams(testParamDef, body) as TestParams;
}

export async function handleHonoApiServerInfo(meta: MiMeta): Promise<{
	machine: string;
	cpu: {
		model: string;
		cores: number;
	};
	mem: {
		total: number;
	};
	fs: {
		total: number;
		used: number;
	};
}> {
	if (!meta.enableServerMachineStats) {
		return {
			machine: '?',
			cpu: {
				model: '?',
				cores: 0,
			},
			mem: {
				total: 0,
			},
			fs: {
				total: 0,
				used: 0,
			},
		};
	}

	const systemInformation = await import('systeminformation');
	const [memStats, fsStats] = await Promise.all([
		systemInformation.mem(),
		systemInformation.fsSize(),
	]);

	return {
		machine: os.hostname(),
		cpu: {
			model: os.cpus()[0].model,
			cores: os.cpus().length,
		},
		mem: {
			total: memStats.total,
		},
		fs: {
			total: fsStats[0].size,
			used: fsStats[0].used,
		},
	};
}
