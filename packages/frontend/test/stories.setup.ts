/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// テストファイル側で呼ぶと import 巻き上げに負けるので、setupFile で先に置く。
import '@/stories/seed-account.js';
import { startMockServiceWorker } from '@/stories/environment.js';

// テストファイルが本体のモジュールを import する前に msw を上げる。
await startMockServiceWorker();
