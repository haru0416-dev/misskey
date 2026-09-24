/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

declare module '@shared/themes/*.json5' {
	import type { Theme } from '@shared/utility/theme.js';

	const theme: Theme;

	export default theme;
}
