/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import JSON5 from 'json5';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import type { Config } from '@/config.js';
import { DEFAULT_POLICIES } from '@/core/role-policies.js';
import { listActiveAdsFromDatabase } from '@/core/AdStore.js';
import { fetchOrCreateSystemAccount } from '@/core/system-account-runtime.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';

export type MetaEntityPackerDependencies = {
	config: Config;
	meta: MiMeta;
	db: MiDrizzleDatabase;
	listActiveAds?: typeof listActiveAdsFromDatabase;
	fetchProxyAccount?: () => Promise<MiLocalUser>;
};

function parseTheme(theme: string | null): string | null {
	if (theme == null) return null;

	try {
		return JSON.stringify(JSON5.parse(theme));
	} catch {
		return null;
	}
}

export async function packMetaLite(
	deps: MetaEntityPackerDependencies,
	meta = deps.meta,
): Promise<Packed<'MetaLite'>> {
	const ads = await (deps.listActiveAds ?? listActiveAdsFromDatabase)(deps.db);

	return {
		maintainerName: meta.maintainerName,
		maintainerEmail: meta.maintainerEmail,

		version: deps.config.version,
		providesTarball: deps.config.publishTarballInsteadOfProvideRepositoryUrl,

		name: meta.name,
		shortName: meta.shortName,
		uri: deps.config.url,
		description: meta.description,
		langs: meta.langs,
		tosUrl: meta.termsOfServiceUrl,
		repositoryUrl: meta.repositoryUrl,
		feedbackUrl: meta.feedbackUrl,
		impressumUrl: meta.impressumUrl,
		privacyPolicyUrl: meta.privacyPolicyUrl,
		inquiryUrl: meta.inquiryUrl,
		disableRegistration: meta.disableRegistration,
		emailRequiredForSignup: meta.emailRequiredForSignup,
		enableHcaptcha: meta.enableHcaptcha,
		hcaptchaSiteKey: meta.hcaptchaSiteKey,
		enableMcaptcha: meta.enableMcaptcha,
		mcaptchaSiteKey: meta.mcaptchaSitekey,
		mcaptchaInstanceUrl: meta.mcaptchaInstanceUrl,
		enableRecaptcha: meta.enableRecaptcha,
		recaptchaSiteKey: meta.recaptchaSiteKey,
		enableTurnstile: meta.enableTurnstile,
		turnstileSiteKey: meta.turnstileSiteKey,
		enableTestcaptcha: meta.enableTestcaptcha,
		googleAnalyticsMeasurementId: meta.googleAnalyticsMeasurementId,
		swPublickey: meta.swPublicKey,
		themeColor: meta.themeColor,
		mascotImageUrl: meta.mascotImageUrl ?? '/assets/ai.png',
		bannerUrl: meta.bannerUrl,
		infoImageUrl: meta.infoImageUrl,
		serverErrorImageUrl: meta.serverErrorImageUrl,
		notFoundImageUrl: meta.notFoundImageUrl,
		iconUrl: meta.iconUrl,
		backgroundImageUrl: meta.backgroundImageUrl,
		logoImageUrl: meta.logoImageUrl,
		maxNoteTextLength: MAX_NOTE_TEXT_LENGTH,
		defaultLightTheme: parseTheme(meta.defaultLightTheme),
		defaultDarkTheme: parseTheme(meta.defaultDarkTheme),
		clientOptions: meta.clientOptions,
		ads: ads.map(ad => ({
			id: ad.id,
			url: ad.url,
			place: ad.place,
			ratio: ad.ratio,
			imageUrl: ad.imageUrl,
			dayOfWeek: ad.dayOfWeek,
			isSensitive: ad.isSensitive ? true : undefined,
		})),
		notesPerOneAd: meta.notesPerOneAd,
		enableEmail: meta.enableEmail,
		enableServiceWorker: meta.enableServiceWorker,

		translatorAvailable: meta.translatorProvider === 'deepl'
			? meta.deeplAuthKey != null
			: meta.libreTranslateApiUrl != null,

		serverRules: meta.serverRules,

		policies: { ...DEFAULT_POLICIES, ...meta.policies },

		sentryForFrontend: deps.config.sentryForFrontend ?? null,
		mediaProxy: deps.config.mediaProxy,
		enableUrlPreview: meta.urlPreviewEnabled,
		noteSearchableScope: (deps.config.fulltextSearch?.provider === 'meilisearch' && deps.config.meilisearch?.scope === 'local') ? 'local' : 'global',
		maxFileSize: deps.config.maxFileSize,
		federation: deps.meta.federation,
	};
}

export async function packMetaDetailed(
	deps: MetaEntityPackerDependencies,
	meta = deps.meta,
): Promise<Packed<'MetaDetailed'>> {
	const packed = await packMetaLite(deps, meta);
	const proxyAccount = await (deps.fetchProxyAccount ?? (() => fetchOrCreateSystemAccount(deps.db, deps.config, deps.meta, 'proxy')))();

	return {
		...packed,
		cacheRemoteFiles: meta.cacheRemoteFiles,
		cacheRemoteSensitiveFiles: meta.cacheRemoteSensitiveFiles,
		requireSetup: deps.meta.rootUserId == null,
		proxyAccountName: proxyAccount.username,
		features: {
			localTimeline: packed.policies.ltlAvailable,
			globalTimeline: packed.policies.gtlAvailable,
			registration: !meta.disableRegistration,
			emailRequiredForSignup: meta.emailRequiredForSignup,
			hcaptcha: meta.enableHcaptcha,
			recaptcha: meta.enableRecaptcha,
			turnstile: meta.enableTurnstile,
			objectStorage: meta.useObjectStorage,
			serviceWorker: meta.enableServiceWorker,
			miauth: true,
		},
	};
}
