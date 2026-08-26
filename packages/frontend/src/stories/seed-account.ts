/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { resetLocalStorage } from './environment.js';

// `@/i.ts` は import された瞬間に localStorage の account から $i を組み立てる。
// 後から localStorage を書いても遅いので、本体のモジュールより先に評価される位置で置く。
// (ES モジュールは import 文の順に評価されるので、これを最初の import にすること)
resetLocalStorage();
