/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// ネイティブ (Go 実装) の TypeScript コンパイラを起動する。
// TypeScript 7 の JS API は version だけで、vue-tsc / api-extractor / packages/i18n の型定義生成が動かないため、
// `typescript` の名前は 6 系が持ち、7 系は `typescript-native` の別名で入れている。bin (`tsc`) も 6 系に取られて
// node_modules/.bin へ出ないので、ここでパスを解決して起動する。起動先は process.argv.slice(2) をそのまま引数にする。

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve('typescript-native/package.json');
const binPath = join(dirname(packageJsonPath), 'bin', 'tsc');

await import(pathToFileURL(binPath).href);
