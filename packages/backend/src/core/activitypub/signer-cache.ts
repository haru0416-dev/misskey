/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Signer } from 'slacc';
import type { SignatureAlgorithm } from 'slacc';

// slacc の SignatureAlgorithm は ambient const enum のため isolatedModules 下では値として import できない。
// 値は enum メンバー名と同じ文字列なので、型だけ import してリテラルを渡す。
const RSA_2048_8192 = 'Rsa2048_8192' as SignatureAlgorithm;

// PEM の ASN.1 パースを deliver ジョブごとに繰り返すと CPU コストが無視できないため、鍵素材ごとに
// パース済み Signer を使い回す。Signer は鍵だけを持ち署名対象に依存せず、HTTP 署名と LD 署名で共有する。
// 上限はローカルユーザー数程度を想定する。
const MAX_SIGNER_CACHE_SIZE = 1000;
const signerCache = new Map<string, Signer>();

export function getCachedSigner(privateKeyPem: string): Signer {
	const cached = signerCache.get(privateKeyPem);
	if (cached) {
		return cached;
	}

	const signer = Signer.fromPkcs8Pem(RSA_2048_8192, privateKeyPem);

	if (signerCache.size >= MAX_SIGNER_CACHE_SIZE) {
		const oldestKey = signerCache.keys().next().value;
		if (oldestKey !== undefined) {
			signerCache.delete(oldestKey);
		}
	}
	signerCache.set(privateKeyPem, signer);

	return signer;
}
