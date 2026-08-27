/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Signer } from 'slacc';
import type { SignatureAlgorithm } from 'slacc';

const RSA_2048_8192 = 'Rsa2048_8192' as SignatureAlgorithm;

// 鍵素材 (privateKeyPem) をキーにパース済み Signer をキャッシュする。Signer 自体は鍵の保持のみで
// 署名対象文字列に依存しないため使い回して問題ない。ローカルユーザー数程度のカーディナリティを
// 想定し上限付きMapで運用する。HTTP署名とLD署名の双方が同じ鍵を使うので実体を共有する。
const MAX_SIGNER_CACHE_SIZE = 1000;
const signerCache = new Map<string, Signer>();

export function getCachedSigner(privateKeyPem: string): Signer {
	const cached = signerCache.get(privateKeyPem);
	if (cached) return cached;

	const signer = Signer.fromPkcs8Pem(RSA_2048_8192, privateKeyPem);

	if (signerCache.size >= MAX_SIGNER_CACHE_SIZE) {
		const oldestKey = signerCache.keys().next().value;
		if (oldestKey !== undefined) signerCache.delete(oldestKey);
	}
	signerCache.set(privateKeyPem, signer);

	return signer;
}
