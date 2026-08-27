/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { toPuny, toPunyNullable } from '@/misc/to-puny.js';
import semver from 'semver';
import type { Config } from '@/config.js';
import { MiMeta, SoftwareSuspension } from '@/models/Meta.js';
import { MiInstance } from '@/models/Instance.js';

export function createUtilityService(config: Config, meta: MiMeta) {
	function getFullApAccount(username: string, host: string | null): string {
		return host ? `${username}@${toPuny(host)}` : `${username}@${toPuny(config.runtime.host)}`;
	}

	function isSelfHost(host: string | null): boolean {
		if (host == null) return true;
		return toPuny(config.runtime.host) === toPuny(host);
	}

	function isUriLocal(uri: string): boolean {
		return punyHost(uri) === toPuny(config.runtime.host);
	}

	// メールアドレスのバリデーションを行う
	// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
	function validateEmailFormat(email: string): boolean {
		const regexp =
			/^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		return regexp.test(email);
	}

	function isBlockedHost(blockedHosts: string[], host: string | null): boolean {
		if (host == null) return false;
		return blockedHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	function isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	function isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.includes(host.toLowerCase());
	}

	function extractDbHost(uri: string): string {
		const url = new URL(uri);
		return toPuny(url.host);
	}

	function punyHost(url: string): string {
		const urlObj = new URL(url);
		const host = `${toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
		return host;
	}

	function isFederationAllowedHost(host: string): boolean {
		if (isSelfHost(host)) return true;
		if (meta.federation === 'none') return false;
		if (
			meta.federation === 'specified' &&
			!meta.federationHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`))
		)
			return false;
		if (isBlockedHost(meta.blockedHosts, host)) return false;

		return true;
	}

	function isFederationAllowedUri(uri: string): boolean {
		const host = extractDbHost(uri);
		return isFederationAllowedHost(host);
	}

	function isDeliverSuspendedSoftware(
		software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>,
	): SoftwareSuspension | undefined {
		if (software.softwareName == null) return undefined;
		if (software.softwareVersion == null) {
			// software version is null; suspend iff versionRange is *
			return meta.deliverSuspendedSoftware.find(
				(x) => x.software === software.softwareName && x.versionRange.trim() === '*',
			);
		} else {
			const softwareVersion = software.softwareVersion;
			return meta.deliverSuspendedSoftware.find(
				(x) =>
					x.software === software.softwareName &&
					semver.satisfies(softwareVersion, x.versionRange, { includePrerelease: true }),
			);
		}
	}

	return {
		getFullApAccount,
		isSelfHost,
		isUriLocal,
		validateEmailFormat,
		isBlockedHost,
		isSilencedHost,
		isMediaSilencedHost,
		extractDbHost,
		toPuny,
		toPunyNullable,
		punyHost,
		isFederationAllowedHost,
		isFederationAllowedUri,
		isDeliverSuspendedSoftware,
	};
}

export type UtilityService = ReturnType<typeof createUtilityService>;
