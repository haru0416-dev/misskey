/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import { Signer } from 'slacc';
import type { SignatureAlgorithmIdentifier } from 'slacc';

// slacc の SignatureAlgorithmIdentifier は ambient const enum のため isolatedModules 下では値として import できない。
// 値自体は enum メンバー名と同じ文字列なので、型だけ import してリテラルをそのまま渡す。
const RSA_2048_8192 = 'Rsa2048_8192' as SignatureAlgorithmIdentifier;

type Request = {
	url: string;
	method: string;
	headers: Record<string, string>;
};

type Signed = {
	request: Request;
	signingString: string;
	signature: string;
	signatureHeader: string;
};

type PrivateKey = {
	privateKeyPem: string;
	keyId: string;
};

// PEM の ASN.1 パースは配送先ホスト毎に発生する deliver ジョブの数だけ繰り返されるとCPUコストが無視できないため、
// 鍵素材 (privateKeyPem) をキーにパース済み Signer をキャッシュする。Signer 自体は鍵の保持のみで署名対象文字列に
// 依存しないため使い回して問題ない。ローカルユーザー数程度のカーディナリティを想定し上限付きMapで運用する。
const MAX_SIGNER_CACHE_SIZE = 1000;
const signerCache = new Map<string, Signer>();

function getCachedSigner(privateKeyPem: string): Signer {
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

export class ApRequestCreator {
	static async createSignedPost(args: { key: PrivateKey, url: string, body: string, digest?: string, additionalHeaders: Record<string, string> }): Promise<Signed> {
		const u = new URL(args.url);
		const digestHeader = args.digest ?? this.createDigest(args.body);

		const request: Request = {
			url: u.href,
			method: 'POST',
			headers: this.#objectAssignWithLcKey({
				'Date': new Date().toUTCString(),
				'Host': u.host,
				'Content-Type': 'application/activity+json',
				'Digest': digestHeader,
			}, args.additionalHeaders),
		};

		const result = await this.#signToRequest(request, args.key, ['(request-target)', 'date', 'host', 'digest']);

		return {
			request,
			signingString: result.signingString,
			signature: result.signature,
			signatureHeader: result.signatureHeader,
		};
	}

	static createDigest(body: string) {
		return `SHA-256=${crypto.createHash('sha256').update(body).digest('base64')}`;
	}

	static async createSignedGet(args: { key: PrivateKey, url: string, additionalHeaders: Record<string, string> }): Promise<Signed> {
		const u = new URL(args.url);

		const request: Request = {
			url: u.href,
			method: 'GET',
			headers: this.#objectAssignWithLcKey({
				'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
				'Date': new Date().toUTCString(),
				'Host': new URL(args.url).host,
			}, args.additionalHeaders),
		};

		const result = await this.#signToRequest(request, args.key, ['(request-target)', 'date', 'host']);

		return {
			request,
			signingString: result.signingString,
			signature: result.signature,
			signatureHeader: result.signatureHeader,
		};
	}

	static async #signToRequest(request: Request, key: PrivateKey, includeHeaders: string[]): Promise<Signed> {
		const signingString = this.#genSigningString(request, includeHeaders);
		const signer = getCachedSigner(key.privateKeyPem);
		const sign = promisify(signer.signRaw).bind(signer);
		const signature = (await sign(Buffer.from(signingString))).toString('base64');
		const signatureHeader = `keyId="${key.keyId}",algorithm="rsa-sha256",headers="${includeHeaders.join(' ')}",signature="${signature}"`;

		request.headers = this.#objectAssignWithLcKey(request.headers, {
			Signature: signatureHeader,
		});
		// node-fetch will generate this for us. if we keep 'Host', it won't change with redirects!
		delete request.headers['host'];

		return {
			request,
			signingString,
			signature,
			signatureHeader,
		};
	}

	static #genSigningString(request: Request, includeHeaders: string[]): string {
		request.headers = this.#lcObjectKey(request.headers);

		const results: string[] = [];

		for (const key of includeHeaders.map(x => x.toLowerCase())) {
			if (key === '(request-target)') {
				const url = new URL(request.url);
				results.push(`(request-target): ${request.method.toLowerCase()} ${url.pathname}${url.search}`);
			} else {
				results.push(`${key}: ${request.headers[key]}`);
			}
		}

		return results.join('\n');
	}

	static #lcObjectKey(src: Record<string, string>): Record<string, string> {
		const dst: Record<string, string> = {};
		for (const key of Object.keys(src).filter(x => x !== '__proto__' && typeof src[x] === 'string')) dst[key.toLowerCase()] = src[key];
		return dst;
	}

	static #objectAssignWithLcKey(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
		return Object.assign(this.#lcObjectKey(a), this.#lcObjectKey(b));
	}
}
