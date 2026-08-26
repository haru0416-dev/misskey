/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// localStorage の seed と msw の起動。テストファイル側で呼ぶと import 巻き上げに負けるので、
// setupFile から本体より先に評価させる。
import '@/stories/seed-account.js';
