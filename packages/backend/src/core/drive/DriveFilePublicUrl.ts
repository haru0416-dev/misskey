/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiMeta } from '@/models/_.js';
import { appendQuery, query } from '@/misc/prelude/url.js';

export function getProxiedUrl(config: Config, url: string, mode?: 'static' | 'avatar'): string {
	return appendQuery(
		`${config.media.proxyUrl}/${mode ?? 'image'}.webp`,
		query({
			url,
			...(mode ? { [mode]: '1' } : {}),
		}),
	);
}

export function getDriveFilePublicUrl(
	file: MiDriveFile,
	deps: {
		config: Config;
		meta: MiMeta;
		mode?: 'avatar';
	},
): string {
	if (file.uri != null && file.userHost != null && deps.config.media.externalProxyEnabled) {
		return getProxiedUrl(deps.config, file.uri, deps.mode);
	}

	if (file.uri != null && file.isLink && deps.meta.proxyRemoteFiles) {
		const key = file.webpublicAccessKey;

		if (key && !key.match('/')) {
			const url = `${deps.config.instance.url}/files/${key}`;
			if (deps.mode === 'avatar') return getProxiedUrl(deps.config, file.uri, 'avatar');
			return url;
		}
	}

	const url = file.webpublicUrl ?? file.url;

	if (deps.mode === 'avatar') {
		return getProxiedUrl(deps.config, url, 'avatar');
	}

	return url;
}
