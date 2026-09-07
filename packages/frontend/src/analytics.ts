/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

type GtagCommand =
	| ['js', Date]
	| ['config', string, Record<string, unknown>]
	| ['set', Record<string, unknown>]
	| ['event', 'page_view', Record<string, unknown>];
type AnalyticsWindow = Window & {
	ga4DataLayer?: unknown[];
	gtag?: (...args: GtagCommand) => void;
};

let gtag: AnalyticsWindow['gtag'];
let userId: string | undefined;
const campaign: Record<string, string> = {};

export const analytics = {
	identify(id: string): void {
		if (!gtag) return;
		userId = id;
		gtag('set', { user_id: id });
	},
	page(properties: { path: string; title?: string }): void {
		if (!gtag) return;
		const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
		const pageUrl = canonical
			? canonical.includes('?')
				? canonical
				: canonical + window.location.search
			: window.location.href.replace(/#.*$/, '');
		gtag('event', 'page_view', {
			page_title: properties.title ?? document.title,
			page_location: pageUrl,
			page_path: properties.path,
			page_hash: window.location.hash,
			page_referrer: document.referrer || undefined,
			...campaign,
			...(userId ? { user_id: userId } : {}),
		});
	},
};

export function initAnalytics(instance: Pick<Misskey.entities.MetaDetailed, 'googleAnalyticsMeasurementId'>): void {
	const measurementId = instance.googleAnalyticsMeasurementId;
	if (!measurementId) return;
	if (gtag) throw new Error('Analytics instance already exists.');

	const parameters = new URLSearchParams(window.location.search);
	for (const [key, field] of Object.entries({
		id: 'Id',
		campaign: 'Name',
		source: 'Source',
		medium: 'Medium',
		content: 'Content',
		keyword: 'Keyword',
	})) {
		const value = parameters.get(`utm_${key}`);
		if (value) campaign[`campaign${field}`] = value;
	}

	const target = window as AnalyticsWindow;
	target.ga4DataLayer ??= [];
	target.gtag ??= function () {
		target.ga4DataLayer!.push(arguments);
	};
	gtag = target.gtag;
	gtag('js', new Date());
	gtag('config', measurementId, {
		send_page_view: false,
		anonymize_ip: false,
		allow_google_signals: true,
		allow_ad_personalization_signals: true,
		cookie_flags: '',
		...(_DEV_ ? { debug_mode: true } : {}),
	});

	// 読込前の identify / page も同じキューに積み、SPA の初回表示を二重送信しない。
	const script = document.createElement('script');
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}&l=ga4DataLayer`;
	document.head.appendChild(script);
}
