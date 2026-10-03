/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PostFormProps } from '@/types/post-form.js';
import { popup } from '@/os.js';
import MkPostFormDialog from '@/features/post-composer/components/MkPostFormDialog.vue';
import { pleaseLogin } from '@/features/auth/please-login.js';
import { showMovedDialog } from '@/features/user/show-moved-dialog.js';

export async function post(props: PostFormProps = {}): Promise<void> {
	const isLoggedIn = await pleaseLogin(
		props.initialText || props.initialNote
			? {
					openOnRemote: {
						type: 'share',
						params: {
							text: props.initialText ?? props.initialNote?.text ?? '',
							visibility: props.initialVisibility ?? props.initialNote?.visibility ?? 'public',
							localOnly: props.initialLocalOnly || props.initialNote?.localOnly ? '1' : '0',
						},
					},
				}
			: {},
	);
	if (!isLoggedIn) {
		return;
	}

	showMovedDialog();
	return new Promise((resolve) => {
		// iOS のテキストエリアへ自動フォーカスするため dynamic import は使わない。
		// 同一コンポーネントを再利用すると Vue の内部プロパティを共有し、複数のフォームでエラーになるため、呼び出しごとに props を生成する。
		const dialogProps = {
			...(props.reply === undefined ? {} : { reply: props.reply }),
			...(props.renote === undefined ? {} : { renote: props.renote }),
			...(props.channel === undefined ? {} : { channel: props.channel }),
			...(props.mention === undefined ? {} : { mention: props.mention }),
			...(props.specified === undefined ? {} : { specified: props.specified }),
			...(props.initialText === undefined ? {} : { initialText: props.initialText }),
			...(props.initialCw === undefined ? {} : { initialCw: props.initialCw }),
			...(props.initialVisibility === undefined ? {} : { initialVisibility: props.initialVisibility }),
			...(props.initialFiles === undefined ? {} : { initialFiles: props.initialFiles }),
			...(props.initialLocalOnly === undefined ? {} : { initialLocalOnly: props.initialLocalOnly }),
			...(props.initialVisibleUsers === undefined ? {} : { initialVisibleUsers: props.initialVisibleUsers }),
			...(props.initialNote === undefined ? {} : { initialNote: props.initialNote }),
			...(props.instant === undefined ? {} : { instant: props.instant }),
		};
		const { dispose } = popup(MkPostFormDialog, dialogProps, {
			closed: () => {
				resolve();
				dispose();
			},
		});
	});
}
