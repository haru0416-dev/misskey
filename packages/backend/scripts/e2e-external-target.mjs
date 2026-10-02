/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 外部 e2e ターゲットの setup() はコントローラ (listen port + 1000) だけを起動する。
// アプリ本体は vitest からの /env-reset で起動する。

const { setup } = await import('../built-test/entry.js');
await setup();

await new Promise(() => {});
