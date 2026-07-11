/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { compile } from '@shared/utility/theme.js';
import type { Theme } from '@shared/utility/theme.js';

let timeout: number | null = null;

export function applyTheme(theme: Theme) {
	if (timeout) window.clearTimeout(timeout);

	window.document.documentElement.classList.add('_themeChanging_');

	timeout = window.setTimeout(() => {
		window.document.documentElement.classList.remove('_themeChanging_');
	}, 1000);

	const colorScheme = theme.base === 'dark' ? 'dark' : 'light';

	window.document.documentElement.dataset.colorScheme = colorScheme;

	const props = compile(theme);

	for (const tag of window.document.head.children) {
		if (tag.tagName === 'META' && tag.getAttribute('name') === 'theme-color') {
			tag.setAttribute('content', props['htmlThemeColor']);
			break;
		}
	}

	for (const [k, v] of Object.entries(props)) {
		window.document.documentElement.style.setProperty(`--MI_THEME-${k}`, v.toString());
	}

	// iframeを正常に透過させるために、cssのcolor-schemeは `light dark;` 固定にしてある。style.scss参照
}
