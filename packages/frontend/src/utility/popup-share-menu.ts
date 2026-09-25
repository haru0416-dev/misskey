/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { isSupportShare } from '@/utility/navigator.js';

// ノートで共有する項目は常に出し、OS の共有は navigator.share がある環境だけ出す。
export function popupShareMenu(ev: PointerEvent, opts: { noteText: string; shareData: ShareData }) {
	const menuItems: MenuItem[] = [];

	menuItems.push({
		text: i18n.ts.shareWithNote,
		icon: 'ti ti-pencil',
		action: () => {
			os.post({
				initialText: opts.noteText,
				instant: true,
			});
		},
	});

	if (isSupportShare()) {
		menuItems.push({
			text: i18n.ts.share,
			icon: 'ti ti-share',
			action: () => {
				navigator.share(opts.shareData);
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}
