/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Verifier } from 'slacc';
import type { SignatureAlgorithmIdentifier } from 'slacc';

/**
 * HTTP Signatures (draft-cavage-http-signatures) のうち、ActivityPub の inbox で
 * 実際に流れてくる範囲だけを扱う。
 *
 * 署名の生成は slacc の Signer を使っているので、検証も同じ実装に揃える。
 * 検証は連合先から並列に飛んでくるため、スレッドプールへ逃がせる分だけ効く
 * (実測: RSA-2048 の並列 50 で node:crypto の 3.2 倍)。
 */

export type ParsedSignature = {
	keyId: string;
	algorithm: string;
	/** 署名対象に含めるヘッダ名 (小文字)。 */
	headers: string[];
	/** base64 の署名。 */
	signature: string;
	/** 署名対象として組み立てた文字列。 */
	signingString: string;
};

export type SignatureTargetRequest = {
	method: string;
	/** パスとクエリ (`/inbox?x=1`)。 */
	url: string;
	/** ヘッダ名は小文字。 */
	headers: Record<string, string>;
};

export class HttpSignatureError extends Error {}

// 対応するのは実際に使われている 3 つだけ。列挙にないものは弾く。
const SUPPORTED_ALGORITHMS = new Set(['rsa-sha256', 'hs2019', 'ed25519']);

/**
 * `Signature: keyId="...",algorithm="...",headers="...",signature="..."` を分解する。
 * 値はダブルクォートで囲まれる前提 (draft-cavage の記法)。
 */
function parseSignatureHeader(header: string): Record<string, string> {
	const params: Record<string, string> = {};
	// `key="value"` の並び。value 中のダブルクォートはエスケープされない仕様なので単純に読む。
	const pattern = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
	for (let match = pattern.exec(header); match != null; match = pattern.exec(header)) {
		params[match[1]!.toLowerCase()] = match[2]!;
	}
	return params;
}

/** 署名ヘッダを読み、検証に必要な形へ組み立てる。妥当でなければ例外。 */
export function parseRequestSignature(request: SignatureTargetRequest): ParsedSignature {
	const header = request.headers['signature'];
	if (header == null || header === '') throw new HttpSignatureError('no signature header');

	const params = parseSignatureHeader(header);
	const keyId = params['keyid'];
	const algorithm = params['algorithm']?.toLowerCase();
	const signature = params['signature'];
	if (keyId == null || algorithm == null || signature == null) {
		throw new HttpSignatureError('signature header is missing required parameters');
	}
	if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
		throw new HttpSignatureError(`unsupported algorithm: ${algorithm}`);
	}

	// headers の既定は date のみ (draft-cavage §2.1.3)。
	const headers = (params['headers'] ?? 'date')
		.toLowerCase()
		.split(/\s+/)
		.filter((name) => name !== '');
	if (headers.length === 0) throw new HttpSignatureError('no signed headers');

	const lines: string[] = [];
	for (const name of headers) {
		if (name === '(request-target)') {
			lines.push(`(request-target): ${request.method.toLowerCase()} ${request.url}`);
			continue;
		}
		if (name === '(keyid)') {
			lines.push(`(keyid): ${keyId}`);
			continue;
		}
		if (name === '(algorithm)') {
			lines.push(`(algorithm): ${algorithm}`);
			continue;
		}
		if (name === '(created)' || name === '(expires)' || name === '(opaque)') {
			const value = params[name.slice(1, -1)];
			if (value == null) throw new HttpSignatureError(`${name} was not in the signature header`);
			lines.push(`${name}: ${value}`);
			continue;
		}

		const value = request.headers[name];
		if (value === undefined) throw new HttpSignatureError(`${name} was not in the request`);
		lines.push(`${name}: ${value}`);
	}

	return { keyId, algorithm, headers, signature, signingString: lines.join('\n') };
}

/**
 * 公開鍵の種類から slacc のスイートを選ぶ。
 * `hs2019` は鍵の種類で決まる仕様なので、algorithm ではなく鍵側から決める。
 */
function suiteOf(publicKeyPem: string): SignatureAlgorithmIdentifier {
	const type = crypto.createPublicKey(publicKeyPem).asymmetricKeyType;
	if (type === 'rsa') return 'Rsa2048_8192' as SignatureAlgorithmIdentifier;
	if (type === 'ed25519') return 'Eddsa' as SignatureAlgorithmIdentifier;
	throw new HttpSignatureError(`unsupported key type: ${type ?? 'unknown'}`);
}

// 鍵素材ごとに Verifier を使い回す。Verifier は鍵の保持だけで署名対象に依存しない。
const MAX_VERIFIER_CACHE_SIZE = 1000;
const verifierCache = new Map<string, Verifier>();

function getCachedVerifier(publicKeyPem: string): Verifier {
	const cached = verifierCache.get(publicKeyPem);
	if (cached != null) return cached;

	const verifier = Verifier.fromSpkiPem(suiteOf(publicKeyPem), publicKeyPem);

	if (verifierCache.size >= MAX_VERIFIER_CACHE_SIZE) {
		const oldest = verifierCache.keys().next().value;
		if (oldest !== undefined) verifierCache.delete(oldest);
	}
	verifierCache.set(publicKeyPem, verifier);

	return verifier;
}

/** 署名が公開鍵と一致するか。鍵が読めない・種類が非対応の場合は false。 */
export async function verifyRequestSignature(parsed: ParsedSignature, publicKeyPem: string): Promise<boolean> {
	let verifier: Verifier;
	try {
		verifier = getCachedVerifier(publicKeyPem);
	} catch {
		return false;
	}

	const verifyRaw = promisify(verifier.verifyRaw.bind(verifier)) as (
		signature: Buffer,
		payload: Buffer,
	) => Promise<boolean>;

	try {
		return await verifyRaw(Buffer.from(parsed.signature, 'base64'), Buffer.from(parsed.signingString, 'utf8'));
	} catch {
		return false;
	}
}
