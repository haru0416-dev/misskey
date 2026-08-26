/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 本体のモジュールより先に評価させるため、この import は必ず先頭に置く。
import '@/stories/seed-account.js';
import { createApp } from 'vue';
import Catalog from './Catalog.vue';
import { createAppRuntime, startMockServiceWorker } from '@/stories/environment.js';
import '@/style.scss';

const [worker, runtime] = await Promise.all([startMockServiceWorker(), createAppRuntime()]);

const app = createApp(Catalog, { worker });
runtime.install(app);
app.mount('#catalog');
