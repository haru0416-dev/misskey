/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';

// unique without hash
// [ http://a/#1, http://a/#2, http://b/#3 ] => [ http://a/#1, http://b/#3 ]
const removeHash = (x: string) => x.replace(/#[^#]*$/, '');

export function extractUrlFromMfm(nodes: mfm.MfmNode[], respectSilentFlag = true): string[] {
	const urlNodes = mfm.extract(nodes, (node) => {
		return node.type === 'url' || (node.type === 'link' && (!respectSilentFlag || !node.props.silent));
	}) as mfm.MfmUrl[];
	const seenUrls = new Set<string>();
	const seenUrlsWithoutHash = new Set<string>();
	const urls: string[] = [];
	for (const {
		props: { url },
	} of urlNodes) {
		if (seenUrls.has(url)) continue;
		seenUrls.add(url);
		const urlWithoutHash = removeHash(url);
		if (seenUrlsWithoutHash.has(urlWithoutHash)) continue;
		seenUrlsWithoutHash.add(urlWithoutHash);
		urls.push(url);
	}
	return urls;
}
