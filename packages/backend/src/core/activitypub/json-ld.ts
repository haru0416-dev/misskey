/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { promisify } from 'node:util';

import type { HttpRequestService } from '@/core/net/http-request-service.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { getCachedSigner } from './signer-cache.js';
import { CONTEXT, PRELOADED_CONTEXTS } from './misc/contexts.js';
import { validateContentTypeSetAsJsonLD } from './misc/validator.js';
import type { ContextDefinition, JsonLdDocument } from 'jsonld';
import type { JsonLd as JsonLdObject, RemoteDocument } from 'jsonld/jsonld-spec.js';

// RsaSignature2017 の実装は https://github.com/transmute-industries/RsaSignature2017 を基にしている。

/** N-Quads のリテラルとして出せない文字を退避する。 */
function escapeNQuadLiteral(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r');
}

/*
 * jsonld.normalize と同じ出力を保証できる入力だけを高速経路で処理する。
 *
 * jsonld は IRI 中の `<` `>` `"` `\` と制御文字を `\uXXXX` へ退避し、空白を含む IRI や
 * 相対 IRI は safe mode の検証で例外にする。高速経路はこの処理を行わないため、対象に含めると
 * 出力が一致しない。creator はリモート入力であり、`>` と改行を混ぜられると N-Quads の
 * 行そのものを注入できる。
 *
 * 退避が不要な部分集合だけを受け付け、範囲外の入力は null を返して jsonld.normalize で処理する。
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
 * 固定費が主体なので、この極小オブジェクトの正規化にも活動本体と同程度の時間がかかる。
 *
 * 想定外の形は null を返し、呼び出し側で jsonld.normalize を実行する。
 * 署名不一致が例外なしの連合失敗になるため、既知の形以外は組み立てない。
 */
export function canonicalizeSignatureOptions(options: Record<string, unknown>): string | null {
	const { '@context': context, creator, nonce, created, domain, ...rest } = options;
	if (context !== 'https://w3id.org/identity/v1') {
		return null;
	}
	if (typeof creator !== 'string' || typeof nonce !== 'string' || typeof created !== 'string') {
		return null;
	}
	if (domain !== undefined && typeof domain !== 'string') {
		return null;
	}
	if (Object.keys(rest).length > 0) {
		return null;
	}
	if (!SAFE_CREATOR_IRI.test(creator)) {
		return null;
	}
	if (!SAFE_DATE_TIME.test(created)) {
		return null;
	}
	if (!isSafeNQuadLiteral(nonce)) {
		return null;
	}
	if (domain !== undefined && !isSafeNQuadLiteral(domain)) {
		return null;
	}

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
		super('0297f79b-0ed9-4b6c-875f-b0a82ff96781', `${directive} is forbidden by Toneriko in ActivityPub documents`);
	}
}

const FORBIDDEN_DIRECTIVES = new Set(['@included', '@graph', '@reverse']);
const LOADER_TIMEOUT = 5000;

export function createJsonLd(httpRequestService: HttpRequestService) {
	let frozen = false;
	const cache = new Map<string, RemoteDocument>();

	function sha256(data: string): string {
		const hash = crypto.createHash('sha256');
		hash.update(data);
		return hash.digest('hex');
	}

	function checkForForbiddenDirectives(value: unknown): void {
		if (typeof value === 'object' && value !== null) {
			if (Array.isArray(value)) {
				for (const item of value) {
					checkForForbiddenDirectives(item);
				}
			} else {
				const object = value;
				for (const [key, value] of Object.entries(object)) {
					if (FORBIDDEN_DIRECTIVES.has(key)) {
						throw new JsonLdForbiddenDirectiveError(key);
					}

					if (typeof value === 'object' && value !== null) {
						checkForForbiddenDirectives(value);
					}
				}
			}
		}
	}

	async function fetchDocument(url: string): Promise<JsonLdObject> {
		const json = await httpRequestService
			.send(
				url,
				{
					headers: {
						Accept: 'application/ld+json, application/json',
					},
					timeout: LOADER_TIMEOUT,
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

	function getLoader() {
		return async (url: string): Promise<RemoteDocument> => {
			if (!/^https?:\/\//.test(url)) {
				throw new Error(`Invalid URL ${url}`);
			}

			if (url in PRELOADED_CONTEXTS) {
				const document = PRELOADED_CONTEXTS[url];
				if (document == null) {
					throw new Error(`Preloaded JSON-LD context is missing for ${url}`);
				}
				return {
					contextUrl: undefined,
					document,
					documentUrl: url,
				};
			}

			const cached = cache.get(url);
			if (cached) {
				return cached;
			}

			if (frozen) {
				throw new JsonLdCacheFrozenError();
			}

			const document = await fetchDocument(url);
			checkForForbiddenDirectives(document);

			const remoteDocument = {
				contextUrl: undefined,
				document,
				documentUrl: url,
			};
			cache.set(url, remoteDocument);
			if (cache.size > 256) {
				throw new JsonLdCacheOverflowError();
			}
			return remoteDocument;
		};
	}

	async function normalize(data: JsonLdDocument): Promise<string> {
		const customLoader = getLoader();
		return (await import('jsonld')).default.normalize(data, {
			documentLoader: customLoader,
		});
	}

	async function createVerifyData(data: unknown, options: unknown): Promise<string> {
		const transformedOptions: Record<string, unknown> = {
			...(options as Record<string, unknown>),
			'@context': 'https://w3id.org/identity/v1',
		};
		delete transformedOptions['type'];
		delete transformedOptions['id'];
		delete transformedOptions['signatureValue'];
		const canonizedOptions =
			canonicalizeSignatureOptions(transformedOptions) ??
			(await normalize(transformedOptions as unknown as JsonLdDocument)).toString();
		const optionsHash = sha256(canonizedOptions);
		const transformedData: Record<string, unknown> = { ...(data as Record<string, unknown>) };
		delete transformedData['signature'];
		const cannonizedData = await normalize(transformedData as unknown as JsonLdDocument);
		const documentHash = sha256(cannonizedData.toString());
		return `${optionsHash}${documentHash}`;
	}

	return {
		sha256,
		checkForForbiddenDirectives,
		normalize,
		createVerifyData,

		async signRsaSignature2017(
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

			const toBeSigned = await createVerifyData(data, options);

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
		},

		async verifyRsaSignature2017(data: unknown, publicKey: string): Promise<boolean> {
			const signed = data as { signature?: { signatureValue: string } };
			if (signed.signature == null) {
				throw new Error('verifyRsaSignature2017: data.signature is required');
			}
			const toBeSigned = await createVerifyData(data, signed.signature);
			const verifier = crypto.createVerify('sha256');
			verifier.update(toBeSigned);
			return verifier.verify(publicKey, signed.signature.signatureValue, 'base64');
		},

		async compact(data: unknown, context: unknown = CONTEXT): Promise<JsonLdDocument> {
			const customLoader = getLoader();
			// jsonld は読み込むだけで RSS が増え、読み込みに時間がかかる。使うのは LD 署名付きの受信と
			// 署名の作成だけなので、プロセス起動時ではなく必要になった時点で読み込む。
			return (await import('jsonld')).default.compact(data as unknown as JsonLdDocument, context as ContextDefinition, {
				documentLoader: customLoader,
			});
		},

		/** JSON-LD 署名検証のための追加 HTTP リクエストを発生させない。 */
		freeze(): void {
			frozen = true;
		},
	};
}
