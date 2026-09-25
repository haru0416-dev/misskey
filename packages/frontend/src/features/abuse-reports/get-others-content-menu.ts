/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

// ページ・Play・ギャラリー投稿を他人が見たときのメニュー項目。削除はモデレーターと管理者だけに出す。
export function getOthersContentMenuItems(opts: {
	owner: Misskey.entities.User;
	reportComment: string;
	onDelete: () => void;
}): MenuItem[] {
	if (!$i || $i.id === opts.owner.id) {
		return [];
	}

	const menuItems: MenuItem[] = [
		{
			icon: 'ti ti-exclamation-circle',
			text: i18n.ts.reportAbuse,
			action: async () => {
				const { dispose } = await os.popupAsyncWithDialog(
					import('@/features/abuse-reports/components/MkAbuseReportWindow.vue').then((x) => x.default),
					{
						user: opts.owner,
						initialComment: opts.reportComment,
					},
					{
						closed: () => dispose(),
					},
				);
			},
		},
	];

	if ($i.isModerator || $i.isAdmin) {
		menuItems.push(
			{
				type: 'divider',
			},
			{
				icon: 'ti ti-trash',
				text: i18n.ts.delete,
				danger: true,
				action: () =>
					os
						.confirm({
							type: 'warning',
							text: i18n.ts.deleteConfirm,
						})
						.then(({ canceled }) => {
							if (canceled) {
								return;
							}

							opts.onDelete();
						}),
			},
		);
	}

	return menuItems;
}
