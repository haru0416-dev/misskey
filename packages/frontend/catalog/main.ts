/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// localStorage の seed と msw の起動を本体より先に済ませる。この import は必ず先頭に置く。
import '@/stories/seed-account.js';
import { createApp } from 'vue';
import Catalog from './Catalog.vue';
import { createAppRuntime, startMockServiceWorker } from '@/stories/environment.js';
import '@/style.scss';

// seed-account.js で起動済み。singleton なので同じ worker が返る。
const worker = await startMockServiceWorker();
const runtime = await createAppRuntime();

const app = createApp(Catalog, { worker });
runtime.install(app);
app.mount('#catalog');
