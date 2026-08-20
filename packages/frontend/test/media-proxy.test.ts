/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type * as Misskey from 'misskey-js';
import { MediaProxy } from '@shared/utility/media-proxy.js';

describe('MediaProxy', () => {
	test('extracts the source URL from a relative local proxy URL', () => {
		const mediaProxy = new MediaProxy(
			{ mediaProxy: 'https://media.example.com' } as Misskey.entities.MetaDetailed,
			'https://example.com',
		);

		expect(mediaProxy.getProxiedImageUrl('/proxy/image.webp?url=https%3A%2F%2Forigin.example%2Fimage.png')).toContain(
			'url=https%3A%2F%2Forigin.example%2Fimage.png',
		);
	});
});
