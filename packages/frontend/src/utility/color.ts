/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import tinycolor from 'tinycolor2';

export const alpha = (hex: string, a: number): string => {
	return tinycolor(hex).setAlpha(a).toRgbString();
};
