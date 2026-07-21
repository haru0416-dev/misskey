/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import * as htmlParser from 'node-html-parser';
import convert from 'color-convert';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import type { MiInstance } from '@/models/Instance.js';

type NodeInfo = {
	openRegistrations?: unknown;
	software?: {
		name?: unknown;
		version?: unknown;
	};
	metadata?: {
		name?: unknown;
		nodeName?: unknown;
		nodeDescription?: unknown;
		description?: unknown;
		maintainer?: {
			name?: unknown;
			email?: unknown;
		};
		themeColor?: unknown;
	};
};

/** Web App Manifest (https://developer.mozilla.org/docs/Web/Manifest) のうち実際に参照するフィールドのみ。 */
type WebAppManifest = {
	icons?: { src?: string }[];
	theme_color?: string;
	name?: string;
	short_name?: string;
};

export type FetchInstanceMetadataDependencies = {
	httpRequestService: Pick<HttpRequestService, 'getJson' | 'getHtml' | 'send'>;
	logger: Pick<Logger, 'error' | 'info'> & Partial<Pick<Logger, 'succ'>>;
	tryLock: (host: string) => Promise<string | null>;
	unlock: (host: string) => Promise<unknown>;
	fetchOrRegisterInstance: (host: string) => Promise<Pick<MiInstance, 'infoUpdatedAt'> | null>;
	updateInstance: (id: MiInstance['id'], data: Partial<MiInstance>) => Promise<void>;
};

function logSuccess(deps: Pick<FetchInstanceMetadataDependencies, 'logger'>, message: string): void {
	if (deps.logger.succ) {
		deps.logger.succ(message);
	} else {
		deps.logger.info(message);
	}
}

async function fetchNodeinfo(
	deps: Pick<FetchInstanceMetadataDependencies, 'httpRequestService' | 'logger'>,
	instance: MiInstance,
): Promise<NodeInfo> {
	deps.logger.info(`Fetching nodeinfo of ${instance.host} ...`);

	try {
		const wellknown = (await deps.httpRequestService
			.getJson('https://' + instance.host + '/.well-known/nodeinfo')
			.catch((err) => {
				if (err.statusCode === 404) {
					throw new Error('No nodeinfo provided');
				} else {
					throw err.statusCode ?? err.message;
				}
			})) as Record<string, unknown>;

		if (wellknown['links'] == null || !Array.isArray(wellknown['links'])) {
			throw new Error('No wellknown links');
		}

		const links = wellknown['links'] as { rel: string; href: string }[];

		const link1_0 = links.find((link) => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/1.0');
		const link2_0 = links.find((link) => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.0');
		const link2_1 = links.find((link) => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.1');
		const link = link2_1 ?? link2_0 ?? link1_0;

		if (link == null) {
			throw new Error('No nodeinfo link provided');
		}

		const info = await deps.httpRequestService.getJson(link.href).catch((err) => {
			throw err.statusCode ?? err.message;
		});

		logSuccess(deps, `Successfuly fetched nodeinfo of ${instance.host}`);

		return info as NodeInfo;
	} catch (err) {
		deps.logger.error(`Failed to fetch nodeinfo of ${instance.host}: ${err}`);

		throw err;
	}
}

async function fetchDom(
	deps: Pick<FetchInstanceMetadataDependencies, 'httpRequestService' | 'logger'>,
	instance: MiInstance,
): Promise<htmlParser.HTMLElement> {
	deps.logger.info(`Fetching HTML of ${instance.host} ...`);

	const url = 'https://' + instance.host;
	const html = await deps.httpRequestService.getHtml(url);

	return htmlParser.parse(html);
}

async function fetchManifest(
	deps: Pick<FetchInstanceMetadataDependencies, 'httpRequestService'>,
	instance: MiInstance,
): Promise<WebAppManifest | null> {
	const url = 'https://' + instance.host;
	const manifestUrl = url + '/manifest.json';

	return (await deps.httpRequestService.getJson(manifestUrl)) as WebAppManifest;
}

async function fetchFaviconUrl(
	deps: Pick<FetchInstanceMetadataDependencies, 'httpRequestService'>,
	instance: MiInstance,
	doc: htmlParser.HTMLElement | null,
): Promise<string | null> {
	const url = 'https://' + instance.host;

	if (doc) {
		// https://github.com/misskey-dev/misskey/pull/8220#issuecomment-1025104043
		const href = Array.from(doc.getElementsByTagName('link'))
			.reverse()
			.find((link) => link.attributes['rel'] === 'icon')?.attributes['href'];

		if (href) {
			return new URL(href, url).href;
		}
	}

	const faviconUrl = url + '/favicon.ico';
	const favicon = await deps.httpRequestService.send(
		faviconUrl,
		{
			method: 'HEAD',
		},
		{ throwErrorWhenResponseNotOk: false },
	);

	if (favicon.ok) {
		return faviconUrl;
	}

	return null;
}

async function fetchIconUrl(
	instance: MiInstance,
	doc: htmlParser.HTMLElement | null,
	manifest: WebAppManifest | null,
): Promise<string | null> {
	const manifestIcon = manifest?.icons?.[0];
	if (manifestIcon?.src) {
		const url = 'https://' + instance.host;
		return new URL(manifestIcon.src, url).href;
	}

	if (doc) {
		const url = 'https://' + instance.host;

		// https://github.com/misskey-dev/misskey/pull/8220#issuecomment-1025104043
		const links = Array.from(doc.getElementsByTagName('link')).reverse();
		// https://github.com/misskey-dev/misskey/pull/8220/files/0ec4eba22a914e31b86874f12448f88b3e58dd5a#r796487559
		const href = [
			links.find((link) => link.attributes['rel']?.split(/\s+/).includes('apple-touch-icon-precomposed'))?.attributes[
				'href'
			],
			links.find((link) => link.attributes['rel']?.split(/\s+/).includes('apple-touch-icon'))?.attributes['href'],
			links.find((link) => link.attributes['rel']?.split(/\s+/).includes('icon'))?.attributes['href'],
		].find((href) => href);

		if (href) {
			return new URL(href, url).href;
		}
	}

	return null;
}

async function getThemeColor(
	info: NodeInfo | null,
	doc: htmlParser.HTMLElement | null,
	manifest: WebAppManifest | null,
): Promise<string | null> {
	const themeColor =
		info?.metadata?.themeColor ??
		doc?.querySelector('meta[name="theme-color"]')?.getAttribute('content') ??
		manifest?.theme_color;

	if (typeof themeColor === 'string') {
		return parseCssColorToHex(themeColor);
	}

	return null;
}

// parses hex / rgb() / hsl() / named CSS colors to '#rrggbb' (replaces tinycolor2)
function parseCssColorToHex(input: string): string | null {
	const str = input.trim().toLowerCase();

	const hex = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/)?.[1];
	if (hex) {
		return '#' + (hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex);
	}

	const rgb = str.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})(?:[,\s/]+[\d.%]+)?\s*\)$/);
	if (rgb) {
		const channels = rgb.slice(1, 4).map((v) => Math.min(255, Number(v))) as [number, number, number];
		return '#' + convert.rgb.hex(channels).toLowerCase();
	}

	const hsl = str.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+[\d.%]+)?\s*\)$/);
	if (hsl) {
		return '#' + convert.hsl.hex([Number(hsl[1]), Number(hsl[2]), Number(hsl[3])]).toLowerCase();
	}

	try {
		return '#' + convert.keyword.hex(str as Parameters<typeof convert.keyword.hex>[0]).toLowerCase();
	} catch {
		return null;
	}
}

async function getSiteName(
	info: NodeInfo | null,
	doc: htmlParser.HTMLElement | null,
	manifest: WebAppManifest | null,
): Promise<string | null> {
	if (info?.metadata) {
		if (typeof info.metadata.nodeName === 'string') {
			return info.metadata.nodeName;
		} else if (typeof info.metadata.name === 'string') {
			return info.metadata.name;
		}
	}

	if (doc) {
		const og = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');

		if (og) {
			return og;
		}
	}

	if (manifest) {
		return manifest.name ?? manifest.short_name ?? null;
	}

	return null;
}

async function getDescription(
	info: NodeInfo | null,
	doc: htmlParser.HTMLElement | null,
	manifest: WebAppManifest | null,
): Promise<string | null> {
	if (info?.metadata) {
		if (typeof info.metadata.nodeDescription === 'string') {
			return info.metadata.nodeDescription;
		} else if (typeof info.metadata.description === 'string') {
			return info.metadata.description;
		}
	}

	if (doc) {
		const meta = doc.querySelector('meta[name="description"]')?.getAttribute('content');
		if (meta) {
			return meta;
		}

		const og = doc.querySelector('meta[property="og:description"]')?.getAttribute('content');
		if (og) {
			return og;
		}
	}

	if (manifest) {
		return manifest.name ?? manifest.short_name ?? null;
	}

	return null;
}

export async function tryLockFetchInstanceMetadata(
	deps: Pick<FetchInstanceMetadataDependencies, 'tryLock'>,
	host: string,
): Promise<boolean> {
	return (await deps.tryLock(host)) !== '1';
}

export async function fetchInstanceMetadataWithSideEffects(
	deps: FetchInstanceMetadataDependencies,
	instance: MiInstance,
	force = false,
): Promise<void> {
	const host = instance.host;

	// finallyでunlockされてしまうのでtry内でロックチェックをしない
	// （returnであってもfinallyは実行される）
	if (!force) {
		const lockAcquired = await tryLockFetchInstanceMetadata(deps, host);
		if (!lockAcquired) {
			return;
		}
	}

	try {
		if (!force) {
			const existing = await deps.fetchOrRegisterInstance(host);
			const now = Date.now();
			if (existing?.infoUpdatedAt && now - existing.infoUpdatedAt.getTime() < 1000 * 60 * 60 * 24) {
				return;
			}
		}

		deps.logger.info(`Fetching metadata of ${instance.host} ...`);

		const [info, dom, manifest] = await Promise.all([
			fetchNodeinfo(deps, instance).catch(() => null),
			fetchDom(deps, instance).catch(() => null),
			fetchManifest(deps, instance).catch(() => null),
		]);

		const [favicon, icon, themeColor, name, description] = await Promise.all([
			fetchFaviconUrl(deps, instance, dom).catch(() => null),
			fetchIconUrl(instance, dom, manifest).catch(() => null),
			getThemeColor(info, dom, manifest).catch(() => null),
			getSiteName(info, dom, manifest).catch(() => null),
			getDescription(info, dom, manifest).catch(() => null),
		]);

		logSuccess(deps, `Successfuly fetched metadata of ${instance.host}`);

		const updates = {
			infoUpdatedAt: new Date(),
		} as Partial<MiInstance>;

		if (info) {
			updates.softwareName = typeof info.software?.name === 'string' ? info.software.name.toLowerCase() : '?';
			updates.softwareVersion = info.software?.version as MiInstance['softwareVersion'];
			updates.openRegistrations = info.openRegistrations as MiInstance['openRegistrations'];
			updates.maintainerName = (
				info.metadata ? (info.metadata.maintainer ? (info.metadata.maintainer.name ?? null) : null) : null
			) as MiInstance['maintainerName'];
			updates.maintainerEmail = (
				info.metadata ? (info.metadata.maintainer ? (info.metadata.maintainer.email ?? null) : null) : null
			) as MiInstance['maintainerEmail'];
		}

		if (name) updates.name = name;
		if (description) updates.description = description;
		if (icon ?? favicon) updates.iconUrl = icon && !icon.includes('data:image/png;base64') ? icon : favicon;
		if (favicon) updates.faviconUrl = favicon;
		if (themeColor) updates.themeColor = themeColor;

		await deps.updateInstance(instance.id, updates);

		logSuccess(deps, `Successfuly updated metadata of ${instance.host}`);
	} catch (e) {
		deps.logger.error(`Failed to update metadata of ${instance.host}: ${e}`);
	} finally {
		await deps.unlock(host);
	}
}
