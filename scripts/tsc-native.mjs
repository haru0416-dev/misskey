/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * ネイティブ (Go 実装) の TypeScript コンパイラを起動する。
 *
 * TypeScript 7 の JS API は version だけになっており、従来の API を必要とする vue-tsc /
 * api-extractor / packages/i18n の型定義生成が動かないため、`typescript` の名前は 6 系が持つ。
 * そこで 7 系を `typescript-native` という別名で入れており、bin (`tsc`) も 6 系に取られて
 * node_modules/.bin へ出ないので、ここでパスを解決して起動する。
 *
 * 起動先の bin は process.argv.slice(2) をそのまま引数にするので、この経路で読み込めば
 * 呼び出し側の引数がそのまま渡る。
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve('typescript-native/package.json');
const binPath = join(dirname(packageJsonPath), 'bin', 'tsc');

await import(pathToFileURL(binPath).href);
