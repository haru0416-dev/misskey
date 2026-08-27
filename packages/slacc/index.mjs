/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: MIT
 */

// ネイティブモジュールは CJS でしか読めないので、ESM からは createRequire で橋渡しする。
import { createRequire } from 'node:module';

const binding = createRequire(import.meta.url)('./index.cjs');

export const { init, Signer, Verifier, ZipReader, SignatureAlgorithmIdentifier } = binding;
export default binding;
