/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp } from 'vue';
import Catalog from './Catalog.vue';
import { createAppRuntime, resetLocalStorage, startMockServiceWorker } from '@/stories/environment.js';
import '@/style.scss';

// 本体のモジュールを読む前に済ませる。account を見て初期化するものがあるため。
resetLocalStorage();

const [worker, runtime] = await Promise.all([startMockServiceWorker(), createAppRuntime()]);

const app = createApp(Catalog, { worker });
runtime.install(app);
app.mount('#catalog');
