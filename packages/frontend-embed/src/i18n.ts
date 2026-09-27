/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { markRaw } from 'vue';
import { I18n } from '@shared/utility/i18n.js';
import { locale } from '@shared/utility/locale.js';
import type { Locale } from 'i18n';

export const i18n = markRaw(new I18n<Locale>(locale, _DEV_));
