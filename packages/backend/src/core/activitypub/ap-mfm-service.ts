/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MfmService } from '@/core/mfm/mfm-service.js';
import { extractApHashtagObjects } from './models/tag.js';
import type { IObject } from './type.js';

export function createApMfmService(mfmService: MfmService) {
	function htmlToMfm(html: string, tag?: IObject | IObject[]): string {
		const hashtagNames = extractApHashtagObjects(tag).map((x) => x.name);
		return mfmService.fromHtml(html, hashtagNames);
	}

	return { htmlToMfm };
}
