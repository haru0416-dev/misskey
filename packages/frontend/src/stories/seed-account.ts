/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { resetLocalStorage, startMockServiceWorker } from './environment.js';

// `@/i.ts` と `@/instance.ts` は import された瞬間に localStorage を読む。
// 本体のモジュールより先に評価される位置で置く必要がある
// (ES モジュールは import 文の順に評価されるので、これを最初の import にすること)。
resetLocalStorage();

// module scope で API を叩くページがあるため、msw も本体を読む前に上げる。
await startMockServiceWorker();
