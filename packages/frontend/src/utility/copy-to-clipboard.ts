/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export function copyToClipboard(input: string | null) {
	if (input) {
		navigator.clipboard.writeText(input);
		// os.ts もこの関数を使うので、静的に import すると循環する。トーストは表示する時点で読み込む。
		void import('@/os.js').then((os) => os.toast(i18n.ts.copiedToClipboard));
	}
}
