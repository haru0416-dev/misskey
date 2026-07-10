/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import { common } from './common.js';
import type { App, Component } from 'vue';
import { emojiPicker } from '@/utility/emoji-picker.js';
import UiMinimum from '@/ui/minimum.vue';

export async function subBoot(app: App<Element>, setRootComponent: (component: Component) => void) {
	const { isClientUpdated } = await common(app, async () => setRootComponent(UiMinimum));

	emojiPicker.init();
}
