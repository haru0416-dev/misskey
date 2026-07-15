/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type UserEnvironment =
	| {
			os: string;
			browser: string;
			userAgent: string;
			screenWidth: number;
			screenHeight: number;
			viaGetHighEntropyValues: true;
	  }
	| {
			userAgent: string;
			screenWidth: number;
			screenHeight: number;
			viaGetHighEntropyValues: false;
	  };

type UserAgentHighEntropyData = {
	platformVersion: string;
	fullVersionList: {
		brand: string;
		version: string;
	}[];
};

type UserAgentHighEntropyDataCandidate = Record<string, unknown> & {
	platformVersion?: unknown;
	fullVersionList?: unknown;
};

type UserAgentBrandCandidate = Record<string, unknown> & {
	brand?: unknown;
	version?: unknown;
};

function isUserAgentHighEntropyData(value: unknown): value is UserAgentHighEntropyData {
	if (typeof value !== 'object' || value === null) return false;
	const data = value as UserAgentHighEntropyDataCandidate;
	return (
		typeof data.platformVersion === 'string' &&
		Array.isArray(data.fullVersionList) &&
		data.fullVersionList.every((item) => {
			if (typeof item !== 'object' || item === null) return false;
			const brand = item as UserAgentBrandCandidate;
			return typeof brand.brand === 'string' && typeof brand.version === 'string';
		})
	);
}

export async function getUserEnvironment(): Promise<UserEnvironment> {
	if ('userAgentData' in navigator && navigator.userAgentData != null) {
		try {
			const uaData: unknown = await navigator.userAgentData.getHighEntropyValues([
				'fullVersionList',
				'platformVersion',
			]);
			if (!isUserAgentHighEntropyData(uaData)) return getViaUa();
			const platform = navigator.userAgentData.platform;

			let osVersion = 'v' + uaData.platformVersion;

			if (platform === 'Windows') {
				// https://learn.microsoft.com/ja-jp/microsoft-edge/web-platform/how-to-detect-win11
				const majorPlatformVersion = parseInt(uaData.platformVersion.split('.')[0] ?? '');
				if (majorPlatformVersion >= 13) {
					osVersion = '11 or later';
				} else if (majorPlatformVersion > 0) {
					osVersion = '10';
				} else {
					osVersion = '8.1 or earlier';
				}
			}

			const browserData = uaData.fullVersionList.find((item) => !/^\s*not.+a.+brand\s*$/i.test(item.brand));
			return {
				os: `${platform} ${osVersion}`,
				browser: browserData ? `${browserData.brand} v${browserData.version}` : 'Unknown',
				userAgent: navigator.userAgent,
				screenWidth: window.innerWidth,
				screenHeight: window.innerHeight,
				viaGetHighEntropyValues: true,
			};
		} catch {
			return getViaUa();
		}
	} else {
		return getViaUa();
	}
}

function getViaUa(): UserEnvironment {
	return {
		userAgent: navigator.userAgent,
		screenWidth: window.innerWidth,
		screenHeight: window.innerHeight,
		viaGetHighEntropyValues: false,
	};
}
