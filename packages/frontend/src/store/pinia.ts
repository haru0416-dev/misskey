/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createPinia, setActivePinia } from 'pinia';
import type { App } from 'vue';
import { createPersistedStatePlugin } from '@/store/persisted-state.js';
import { persistedStateIo } from '@/store/persisted-state-io.js';

export const pinia = createPinia();

pinia.use(createPersistedStatePlugin(persistedStateIo));
setActivePinia(pinia);

export function installPinia(app: App): void {
	app.use(pinia);
}
