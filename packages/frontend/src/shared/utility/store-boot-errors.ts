/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Locale } from 'i18n';

/** 起動に失敗したときにローダー (src/loader/) が出す文言。アプリの起動時に保存し、次回の起動失敗で読む。 */
export type BootLoaderLocaleBody = Locale['_bootErrors'] & { reload: Locale['reload'] };

export const BOOTLOADER_LOCALES_KEY = 'bootloaderLocales';

export function storeBootloaderErrors(locale: BootLoaderLocaleBody) {
	localStorage.setItem(BOOTLOADER_LOCALES_KEY, JSON.stringify(locale));
}
