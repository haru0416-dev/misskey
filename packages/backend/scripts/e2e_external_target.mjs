/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// scripts/run_e2e_bun.js から bun の子プロセスとして起動される、e2e 用のテスト対象サーバー。
// built-test/entry.ts の setup() はコントローラ (listen port + 1000) だけを立ち上げ、
// アプリ本体は vitest 側が /env-reset を叩いた時点で起動される。

const { setup } = await import('../built-test/entry.js');
await setup();

// コントローラの listen だけでも生存するが、setup() の解決後は終了しないことを明示する。
await new Promise(() => {});
