/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';

export const nodeinfo2_1path = '/nodeinfo/2.1';
export const nodeinfo2_0path = '/nodeinfo/2.0';

export function getNodeinfoLinks(config: Config): { rel: string; href: string }[] {
	return [
		{
			rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
			href: config.instance.url + nodeinfo2_1path,
		},
		{
			rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
			href: config.instance.url + nodeinfo2_0path,
		},
	];
}
