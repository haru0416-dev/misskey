/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Vue の型検査と型生成には TypeScript 6 の JS API が必要なため、ネイティブ版は別名で導入する。
// tsc の bin 名が競合するので、typescript-native の実体を直接読み込む。

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve('typescript-native/package.json');
const binPath = join(dirname(packageJsonPath), 'bin', 'tsc');

await import(pathToFileURL(binPath).href);
