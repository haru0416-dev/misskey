/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: MIT
 */

// Node.js の ESM import は .node をサポートしないため、createRequire を使う。
import { createRequire } from 'node:module';

const binding = createRequire(import.meta.url)('./index.cjs');

export const { init, Signer, Verifier, ZipArchiveReader, SignatureAlgorithmIdentifier } = binding;
export default binding;
