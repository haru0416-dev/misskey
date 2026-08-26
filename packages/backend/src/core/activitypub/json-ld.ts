/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { promisify } from 'node:util';

// slacc の SignatureAlgorithmIdentifier は ambient const enum のため isolatedModules 下では値として import できない。
// 値自体は enum メンバー名と同じ文字列なので、型だけ import してリテラルをそのまま渡す。
import { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { getCachedSigner } from './signer-cache.js';
import { CONTEXT, PRELOADED_CONTEXTS } from './misc/contexts.js';
import { validateContentTypeSetAsJsonLD } from './misc/validator.js';
import type { ContextDefinition, JsonLdDocument } from 'jsonld';
import type { JsonLd as JsonLdObject, RemoteDocument } from 'jsonld/jsonld-spec.js';

// RsaSignature2017 の実装は https://github.com/transmute-industries/RsaSignature2017 を基にしている。

/** N-Quads のリテラルとして出せない文字を退避する。 */
function escapeNQuadLiteral(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/*
 * 近道が jsonld.normalize と同じ出力になると確信できる入力だけを通す門。
 *
 * jsonld は IRI 中の `<` `>` `"` `\` と制御文字を `\uXXXX` へ退避し、空白を含む IRI や
 * 相対 IRI は safe mode の検証で例外にする。近道はどちらも行わないので、これらを通すと出力が
 * 食い違う。creator は検証側ではリモートが送ってくる値で、`>` と改行を混ぜられると N-Quads の
 * 行そのものを注入できる。
 *
 * 退避規則を写し取るのではなく、退避が要らないと分かる部分集合だけ受ける。外れた入力は null を
 * 返して jsonld.normalize に委ねるので、正しさは落ちず速度だけ諦める。
 */
const SAFE_CREATOR_IRI = /^https?:\/\/[^\s<>"{}|^`\\\u0000-\u0020\u007F]+$/u;

/** Date#toISOString と同じ形。自インスタンスもリモートもほぼこの形で送ってくる。 */
const SAFE_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/** escapeNQuadLiteral が扱う4文字以外の制御文字は、jsonld と退避のしかたが違う。 */
function isSafeNQuadLiteral(value: string): boolean {
	return !/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

/**
 * RsaSignature2017 の署名オプションを、jsonld.normalize を通さず正規形 (N-Quads) にする。
 *
 * このオブジェクトは creator / nonce / created (と任意の domain) だけの固定構造で、正規形は
 * 述語の辞書順に並んだ3〜4行にしかならない。jsonld.normalize のコストは文書の大きさではなく
 * 固定費が主体で、実測ではこの極小オブジェクトの正規化が活動本体と同じだけかかっていた
 * (1回あたり options 0.318ms / data 0.333ms)。
 *
 * 想定と少しでも違う形が来たら null を返し、呼び出し側は jsonld.normalize に委ねる。
 * 署名が壊れると連合が黙って壊れるため、既知の形以外を自前で組み立てない。
 */
export function canonicalizeSignatureOptions(options: Record<string, unknown>): string | null {
	const { '@context': context, creator, nonce, created, domain, ...rest } = options;
	if (context !== 'https://w3id.org/identity/v1') return null;
	if (typeof creator !== 'string' || typeof nonce !== 'string' || typeof created !== 'string') return null;
	if (domain !== undefined && typeof domain !== 'string') return null;
	if (Object.keys(rest).length > 0) return null;
	if (!SAFE_CREATOR_IRI.test(creator)) return null;
	if (!SAFE_DATE_TIME.test(created)) return null;
	if (!isSafeNQuadLiteral(nonce)) return null;
	if (domain !== undefined && !isSafeNQuadLiteral(domain)) return null;

	const lines = [
		`_:c14n0 <http://purl.org/dc/terms/created> "${escapeNQuadLiteral(created)}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`,
		`_:c14n0 <http://purl.org/dc/terms/creator> <${creator}> .`,
	];
	if (domain !== undefined) {
		lines.push(`_:c14n0 <https://w3id.org/security#domain> "${escapeNQuadLiteral(domain)}" .`);
	}
	lines.push(`_:c14n0 <https://w3id.org/security#nonce> "${escapeNQuadLiteral(nonce)}" .`);

	return `${lines.join('\n')}\n`;
}

export class JsonLdError extends IdentifiableError {}

class JsonLdCacheOverflowError extends JsonLdError {
	constructor() {
		super('42fb039c-69fb-4f75-8187-d3aee412423e', 'context cache overflow');
	}
}

class JsonLdCacheFrozenError extends JsonLdError {
	constructor() {
		super('202c41fa-72d5-4e22-95af-94a8ac83346f', 'attempt to insert into frozen context cache');
	}
}

class JsonLdForbiddenDirectiveError extends JsonLdError {
	constructor(public directive: string) {
		super('0297f79b-0ed9-4b6c-875f-b0a82ff96781', `${directive} is forbidden by Erebia in ActivityPub documents`);
	}
}

export class JsonLd {
	private static forbiddenDirectives = new Set(['@included', '@graph', '@reverse']);

	private frozen = false;
	private cache: Map<string, RemoteDocument> = new Map();

	public debug = false;
	public preLoad = true;
	public loderTimeout = 5000;

	constructor(private httpRequestService: HttpRequestService) {}

	@bindThis
	public async signRsaSignature2017(
		data: unknown,
		privateKey: string,
		creator: string,
		domain?: string,
		created?: Date,
	): Promise<Record<string, unknown>> {
		const options: {
			type: string;
			creator: string;
			domain?: string;
			nonce: string;
			created: string;
		} = {
			type: 'RsaSignature2017',
			creator,
			nonce: crypto.randomBytes(16).toString('hex'),
			created: (created ?? new Date()).toISOString(),
		};

		if (domain) {
			options.domain = domain;
		}

		const toBeSigned = await this.createVerifyData(data, options);

		const signer = getCachedSigner(privateKey);
		const sign = promisify(signer.signRaw).bind(signer);

		const signature = await sign(Buffer.from(toBeSigned));

		return {
			...(data as Record<string, unknown>),
			signature: {
				...options,
				signatureValue: signature.toString('base64'),
			},
		};
	}

	@bindThis
	public async verifyRsaSignature2017(data: unknown, publicKey: string): Promise<boolean> {
		const signed = data as { signature?: { signatureValue: string } };
		if (signed.signature == null) {
			throw new Error('verifyRsaSignature2017: data.signature is required');
		}
		const toBeSigned = await this.createVerifyData(data, signed.signature);
		const verifier = crypto.createVerify('sha256');
		verifier.update(toBeSigned);
		return verifier.verify(publicKey, signed.signature.signatureValue, 'base64');
	}

	@bindThis
	public async createVerifyData(data: unknown, options: unknown): Promise<string> {
		const transformedOptions: Record<string, unknown> = {
			...(options as Record<string, unknown>),
			'@context': 'https://w3id.org/identity/v1',
		};
		delete transformedOptions['type'];
		delete transformedOptions['id'];
		delete transformedOptions['signatureValue'];
		const canonizedOptions =
			canonicalizeSignatureOptions(transformedOptions) ??
			(await this.normalize(transformedOptions as unknown as JsonLdDocument)).toString();
		const optionsHash = this.sha256(canonizedOptions);
		const transformedData: Record<string, unknown> = { ...(data as Record<string, unknown>) };
		delete transformedData['signature'];
		const cannonizedData = await this.normalize(transformedData as unknown as JsonLdDocument);
		if (this.debug) console.debug(`cannonizedData: ${cannonizedData}`);
		const documentHash = this.sha256(cannonizedData.toString());
		const verifyData = `${optionsHash}${documentHash}`;
		return verifyData;
	}

	@bindThis
	public async compact(data: unknown, context: unknown = CONTEXT): Promise<JsonLdDocument> {
		const customLoader = this.getLoader();
		// Jest では jsonld の静的 import が頻繁に失敗するため、動的に import する。
		// https://github.com/misskey-dev/misskey/pull/9894#discussion_r1103753595
		return (await import('jsonld')).default.compact(data as unknown as JsonLdDocument, context as ContextDefinition, {
			documentLoader: customLoader,
		});
	}

	@bindThis
	public async normalize(data: JsonLdDocument): Promise<string> {
		const customLoader = this.getLoader();
		return (await import('jsonld')).default.normalize(data, {
			documentLoader: customLoader,
		});
	}

	/** JSON-LD 署名検証のための追加 HTTP リクエストを発生させない。 */
	@bindThis
	public freeze(): void {
		this.frozen = true;
	}

	@bindThis
	public checkForForbiddenDirectives(value: unknown): void {
		if (typeof value === 'object' && value !== null) {
			if (Array.isArray(value)) {
				for (const item of value) this.checkForForbiddenDirectives(item);
			} else {
				const object = value;
				for (const [key, value] of Object.entries(object)) {
					if (JsonLd.forbiddenDirectives.has(key)) {
						throw new JsonLdForbiddenDirectiveError(key);
					}

					if (typeof value === 'object' && value !== null) {
						this.checkForForbiddenDirectives(value);
					}
				}
			}
		}
	}

	@bindThis
	private getLoader() {
		return async (url: string): Promise<RemoteDocument> => {
			if (!/^https?:\/\//.test(url)) throw new Error(`Invalid URL ${url}`);

			if (this.preLoad) {
				if (url in PRELOADED_CONTEXTS) {
					const document = PRELOADED_CONTEXTS[url];
					if (document == null) throw new Error(`Preloaded JSON-LD context is missing for ${url}`);
					if (this.debug) console.debug(`HIT: ${url}`);
					return {
						contextUrl: undefined,
						document,
						documentUrl: url,
					};
				}
			}

			const cached = this.cache.get(url);
			if (cached) {
				if (this.debug) console.debug(`HIT: ${url}`);
				return cached;
			}

			if (this.debug) console.debug(`MISS: ${url}`);

			if (this.frozen) throw new JsonLdCacheFrozenError();

			const document = await this.fetchDocument(url);
			this.checkForForbiddenDirectives(document);

			const remoteDocument = {
				contextUrl: undefined,
				document: document,
				documentUrl: url,
			};
			this.cache.set(url, remoteDocument);
			if (this.cache.size > 256) throw new JsonLdCacheOverflowError();
			return remoteDocument;
		};
	}

	@bindThis
	private async fetchDocument(url: string): Promise<JsonLdObject> {
		const json = await this.httpRequestService
			.send(
				url,
				{
					headers: {
						Accept: 'application/ld+json, application/json',
					},
					timeout: this.loderTimeout,
				},
				{
					throwErrorWhenResponseNotOk: false,
					validators: [validateContentTypeSetAsJsonLD],
				},
			)
			.then((res) => {
				if (!res.ok) {
					throw new Error(`${res.status} ${res.statusText}`);
				} else {
					return res.json();
				}
			});

		return json as JsonLdObject;
	}

	@bindThis
	public sha256(data: string): string {
		const hash = crypto.createHash('sha256');
		hash.update(data);
		return hash.digest('hex');
	}
}
