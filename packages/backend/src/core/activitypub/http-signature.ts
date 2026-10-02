/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Verifier } from 'slacc';
import type { SignatureAlgorithm } from 'slacc';

/**
 * HTTP Signatures (draft-cavage-http-signatures) のうち、ActivityPub の inbox で
 * 実際に流れてくる範囲だけを扱う。
 *
 * 署名の生成は slacc の Signer を使っているので、検証も同じ実装に揃える。
 * 検証は連合先から並列に届くため、スレッドプールで処理できる分だけ node:crypto より速い。
 */

export type ParsedSignature = {
	keyId: string;
	algorithm: string;
	headers: string[];
	signature: string;
	signingString: string;
	/** 署名ヘッダの created / expires (UNIX 秒の文字列)。無ければ undefined。 */
	created?: string;
	expires?: string;
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
	// `key="value"` の並び。value 中のダブルクォートはエスケープされない仕様なので単純に読む。
	// 署名の検証前に誰でも送れる値なので、読む位置は後ろへしか進めない。非固定の正規表現だと
	// 記号の無い長い値で開始位置ごとに末尾まで読み、16 KB で 260 ms (長さの 2 乗) かかる。
	const params: Record<string, string> = {};
	const isSpace = (code: number) => code === 0x20 || code === 0x09;
	const isKeyChar = (code: number) =>
		(code >= 0x30 && code <= 0x39) ||
		(code >= 0x41 && code <= 0x5a) ||
		(code >= 0x61 && code <= 0x7a) ||
		code === 0x5f ||
		code === 0x2d;
	const length = header.length;
	let index = 0;
	while (index < length) {
		while (index < length && (header.charCodeAt(index) === 0x2c || isSpace(header.charCodeAt(index)))) index++;
		const keyStart = index;
		while (index < length && isKeyChar(header.charCodeAt(index))) index++;
		const key = header.slice(keyStart, index);
		while (index < length && isSpace(header.charCodeAt(index))) index++;
		if (key !== '' && header.charCodeAt(index) === 0x3d) {
			index++;
			while (index < length && isSpace(header.charCodeAt(index))) index++;
			if (header.charCodeAt(index) === 0x22) {
				const end = header.indexOf('"', index + 1);
				if (end === -1) break;
				params[key.toLowerCase()] = header.slice(index + 1, end);
				index = end + 1;
				continue;
			}
		}
		// 形の崩れた部分は次の区切りまで読み飛ばす。
		const next = header.indexOf(',', index);
		if (next === -1) break;
		index = next + 1;
	}
	return params;
}

/** 署名ヘッダを読み、検証に必要な形へ組み立てる。妥当でなければ例外。 */
export function parseRequestSignature(request: SignatureTargetRequest): ParsedSignature {
	const header = request.headers['signature'];
	if (header == null || header === '') {
		throw new HttpSignatureError('no signature header');
	}

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

	// headers のデフォルトは date のみ (draft-cavage §2.1.3)。
	const headers = (params['headers'] ?? 'date')
		.toLowerCase()
		.split(/\s+/)
		.filter((name) => name !== '');
	if (headers.length === 0) {
		throw new HttpSignatureError('no signed headers');
	}

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
			if (value == null) {
				throw new HttpSignatureError(`${name} was not in the signature header`);
			}
			lines.push(`${name}: ${value}`);
			continue;
		}

		const value = request.headers[name];
		if (value === undefined) {
			throw new HttpSignatureError(`${name} was not in the request`);
		}
		lines.push(`${name}: ${value}`);
	}

	return {
		keyId,
		algorithm,
		headers,
		signature,
		signingString: lines.join('\n'),
		...(params['created'] != null ? { created: params['created'] } : {}),
		...(params['expires'] != null ? { expires: params['expires'] } : {}),
	};
}

/** リクエスト時刻のずれと期限切れに対する許容幅。 */
const SIGNATURE_CLOCK_SKEW_MS = 300 * 1000;

/**
 * Date が署名対象なら受信時刻との差を検査し、created / expires が指定されていれば時刻のずれ・期限切れを検査する。
 * 許容幅内の再送は区別できないため、この検査だけではリプレイを防げない。
 * 暗号学的な署名検証より前に呼べるが、時刻検査は署名検証の代わりにはならない。
 */
export function assertSignatureFresh(
	request: SignatureTargetRequest,
	signature: ParsedSignature,
	now: number = Date.now(),
): void {
	if (signature.headers.includes('date')) {
		const date = Date.parse(request.headers['date'] ?? '');
		if (!Number.isFinite(date)) {
			throw new HttpSignatureError('invalid date header');
		}
		if (Math.abs(now - date) > SIGNATURE_CLOCK_SKEW_MS) {
			throw new HttpSignatureError('date header is out of the allowed clock skew');
		}
	}
	if (signature.created != null) {
		const created = Number(signature.created) * 1000;
		if (!Number.isFinite(created) || Math.abs(now - created) > SIGNATURE_CLOCK_SKEW_MS) {
			throw new HttpSignatureError('created is invalid or out of the allowed clock skew');
		}
	}
	if (signature.expires != null) {
		const expires = Number(signature.expires) * 1000;
		if (!Number.isFinite(expires) || now - expires > SIGNATURE_CLOCK_SKEW_MS) {
			throw new HttpSignatureError('signature has expired');
		}
	}
}

/**
 * 公開鍵の種類から slacc のスイートを選ぶ。
 * `hs2019` は鍵の種類で決まる仕様なので、algorithm ではなく鍵側から決める。
 */
function suiteOf(publicKeyPem: string): SignatureAlgorithm {
	const type = crypto.createPublicKey(publicKeyPem).asymmetricKeyType;
	if (type === 'rsa') {
		return 'Rsa2048_8192' as SignatureAlgorithm;
	}
	if (type === 'ed25519') {
		return 'Eddsa' as SignatureAlgorithm;
	}
	throw new HttpSignatureError(`unsupported key type: ${type ?? 'unknown'}`);
}

// 鍵素材ごとに Verifier を使い回す。Verifier は鍵の保持だけで署名対象に依存しない。
const MAX_VERIFIER_CACHE_SIZE = 1000;
const verifierCache = new Map<string, Verifier>();

function getCachedVerifier(publicKeyPem: string): Verifier {
	const cached = verifierCache.get(publicKeyPem);
	if (cached != null) {
		return cached;
	}

	const verifier = Verifier.fromSpkiPem(suiteOf(publicKeyPem), publicKeyPem);

	if (verifierCache.size >= MAX_VERIFIER_CACHE_SIZE) {
		const oldest = verifierCache.keys().next().value;
		if (oldest !== undefined) {
			verifierCache.delete(oldest);
		}
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
