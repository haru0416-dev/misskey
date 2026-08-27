/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import endpoints, { IEndpoint } from '../endpoints.js';
import { errors as basicErrors } from './errors.js';
import { getSchemas, convertSchemaToOpenApiSchema, type OpenApiSchemaObject } from './schemas.js';

type ErrorExample = {
	value: {
		error: {
			message: string;
			code: string;
			id: string;
			kind: 'client' | 'server' | 'permission';
			info?: unknown;
		};
	};
};
const errorResponseDescriptions: Record<string, string> = {
	'400': 'Client error',
	'401': 'Authentication error',
	'403': 'Forbidden error',
	'404': 'Not found',
	'413': 'Payload too large',
	'422': 'Unprocessable content',
	'429': 'Too many requests',
	'500': 'Internal server error',
};

const unauthenticatedEndpoints = new Set([
	'email-address/available',
	'emoji',
	'emojis',
	'fetch-rss',
	'endpoints',
	'endpoint',
	'federation/followers',
	'federation/following',
	'federation/update-remote-user',
	'hashtags/list',
	'hashtags/search',
	'hashtags/show',
	'hashtags/trend',
	'meta',
	'ping',
	'retention',
	'request-reset-password',
	'reset-password',
	'reset-db',
	'roles/show',
	'server-info',
	'test',
	'get-online-users-count',
	'get-avatar-decorations',
	'users/achievements',
	'users/pages',
	'users/flashs',
	'username/available',
]);

type AuthenticationMode = 'none' | 'optional' | 'required';
type RequestMethod = 'get' | 'post';
type RequestBodyKind = 'none' | 'json' | 'multipart';

function authenticationMode(endpoint: IEndpoint): AuthenticationMode {
	if (
		endpoint.meta.requireCredential === true ||
		endpoint.meta.requireAdmin === true ||
		endpoint.meta.requireModerator === true
	)
		return 'required';
	if (unauthenticatedEndpoints.has(endpoint.name)) return 'none';
	return 'optional';
}

function requestBodyKind(endpoint: IEndpoint, method: RequestMethod): RequestBodyKind {
	if (method === 'get' || endpoint.name === 'endpoints') return 'none';
	return endpoint.meta.requireFile === true ? 'multipart' : 'json';
}

function buildQueryParameters(schema: OpenApiSchemaObject): Record<string, unknown>[] {
	const required = new Set(schema.required ?? []);
	return Object.entries(schema.properties ?? {}).map(([name, propertySchema]) => ({
		name,
		in: 'query',
		required: required.has(name),
		schema: propertySchema,
	}));
}

function acceptsEmptyObject(params: IEndpoint['params'], schema: OpenApiSchemaObject): boolean {
	if (params instanceof z.ZodType) return params.safeParse({}).success;
	return (schema.required?.length ?? 0) === 0;
}

function buildErrorResponses(
	endpoint: IEndpoint,
	method: RequestMethod,
	hasInputParams: boolean,
): Record<string, Record<string, unknown>> {
	const examplesByStatus = new Map<string, Record<string, ErrorExample>>();
	const authMode = authenticationMode(endpoint);
	const bodyKind = requestBodyKind(endpoint, method);
	for (const [status, examples] of Object.entries(basicErrors)) {
		if (status === '429' && endpoint.meta.limit == null) continue;
		const selected = Object.fromEntries(
			Object.entries(examples).filter(([, example]) => {
				switch (example.value.error.code) {
					case 'INVALID_PARAM':
						return example.value.error.id === '3d81ceae-475f-4600-b2a8-2bc116157532'
							? hasInputParams
							: bodyKind === 'json';
					case 'ACCESS_DENIED':
						return endpoint.meta.secure === true;
					case 'CREDENTIAL_REQUIRED':
						return authMode === 'required';
					case 'AUTHENTICATION_FAILED':
						return authMode !== 'none';
					case 'PERMISSION_DENIED':
						return authMode !== 'none' && endpoint.meta.kind != null && endpoint.meta.secure !== true;
					case 'ROLE_PERMISSION_DENIED':
						return (
							endpoint.meta.requireAdmin === true ||
							endpoint.meta.requireModerator === true ||
							endpoint.meta.requiredRolePolicy != null ||
							endpoint.meta.kind === 'read:chat' ||
							endpoint.meta.kind === 'write:chat'
						);
					case 'YOUR_ACCOUNT_SUSPENDED':
						return authMode !== 'none';
					case 'YOUR_ACCOUNT_MOVED':
						return endpoint.meta.prohibitMoved === true;
					case 'PAYLOAD_TOO_LARGE':
						return bodyKind !== 'none';
					default:
						return true;
				}
			}),
		);
		if (Object.keys(selected).length > 0) examplesByStatus.set(status, selected);
	}

	for (const [key, error] of Object.entries(endpoint.meta.errors ?? {})) {
		const status = String(error.httpStatusCode ?? 400);
		const examples = examplesByStatus.get(status) ?? {};
		examples[key] = {
			value: {
				error: {
					message: error.message,
					code: error.code,
					id: error.id,
					kind: error.kind ?? 'client',
					...(error.info === undefined ? {} : { info: error.info }),
				},
			},
		};
		examplesByStatus.set(status, examples);
	}

	return Object.fromEntries(
		[...examplesByStatus.entries()].map(([status, examples]) => [
			status,
			{
				description: errorResponseDescriptions[status] ?? `HTTP ${status} error`,
				content: {
					'application/json': {
						schema: { $ref: '#/components/schemas/Error' },
						examples,
					},
				},
			},
		]),
	);
}

/**
 * Zod スキーマを JSON Schema (OpenAPI 互換) に変換する。
 * Misskey 独自拡張 (optional/ref/selfRef 等) を持たないため schemas.ts の変換は不要で、
 * zod の `toJSONSchema` 出力(標準 JSON Schema)をそのまま使える。`$schema` キーだけ落とす。
 */
function convertZodParamsToOpenApiSchema(schema: z.ZodType): OpenApiSchemaObject {
	// io: 'input' — .default() を持つフィールドはリクエストでは省略可能なので required に含めない
	// (省略時はサーバー側でデフォルト値が補完される。'output' だと補完後の値の存在を前提に required 扱いになってしまう)。
	const { $schema, ...rest } = z.toJSONSchema(schema, { io: 'input' });
	return rest as OpenApiSchemaObject;
}

export function genOpenapiSpec(config: Config, includeSelfRef = false) {
	const spec = {
		openapi: '3.1.0',

		info: {
			version: config.runtime.version,
			title: 'Erebia API',
			// 個々のパラメータに書くと同じ説明が数百回複製されるので、形式の説明はここに 1 度だけ置く。
			description: [
				'`format: misskey:id` のパラメータは、ハイフンを除いた小文字 hex 32 桁の UUIDv7 です。',
				'先頭 12 桁が生成時刻 (UNIX ミリ秒) なので、ID の辞書順は生成順と一致します。',
			].join('\n'),
		},

		externalDocs: {
			description: 'Repository',
			url: 'https://github.com/haru0416-dev/misskey',
		},

		servers: [
			{
				url: config.runtime.apiUrl,
			},
		],

		paths: {} as Record<string, { get?: Record<string, unknown>; post: Record<string, unknown> }>,

		components: {
			schemas: getSchemas(includeSelfRef),

			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
				},
			},
		},
	};

	// 書き換えたりするのでディープコピーしておく。そのまま編集するとメモリ上の値が汚れて次回以降の出力に影響する。
	// ただし JSON.stringify は Zod スキーマインスタンスを保持できない (プレーンオブジェクトとして潰れる) ため、
	// params が Zod スキーマのエンドポイントだけは元の (非コピー) 配列から都度参照する。
	const copiedEndpoints = JSON.parse(JSON.stringify(endpoints)) as IEndpoint[];
	for (const [i, endpoint] of copiedEndpoints.entries()) {
		const originalEndpoint = endpoints[i];
		if (originalEndpoint == null) throw new Error(`OpenAPI endpoint copy is missing index ${i}`);
		const originalParams = originalEndpoint.params;
		const params = originalParams instanceof z.ZodType ? originalParams : endpoint.params;
		const resSchema = endpoint.meta.res ? convertSchemaToOpenApiSchema(endpoint.meta.res, 'res', includeSelfRef) : {};

		let desc = (endpoint.meta.description ? endpoint.meta.description : 'No description provided.') + '\n\n';

		if (endpoint.meta.secure) {
			desc +=
				'**Internal Endpoint**: This endpoint is an API for the misskey mainframe and is not intended for use by third parties.\n';
		}

		desc += `**Credential required**: *${endpoint.meta.requireCredential ? 'Yes' : 'No'}*`;
		if (endpoint.meta.kind) {
			const kind = endpoint.meta.kind;
			desc += ` / **Permission**: *${kind}*`;
		}

		const requestType = endpoint.meta.requireFile ? 'multipart/form-data' : 'application/json';
		const schema =
			params instanceof z.ZodType
				? { ...convertZodParamsToOpenApiSchema(params) }
				: { ...convertSchemaToOpenApiSchema(params, 'param', false) };

		if (endpoint.meta.requireFile) {
			schema.properties = {
				...schema.properties,
				file: {
					type: 'string',
					format: 'binary',
					description: 'The file contents.',
				},
			};
			schema.required = [...(schema.required ?? []), 'file'];
		}

		if (schema.required && schema.required.length <= 0) {
			// 空配列は許可されない
			delete schema.required;
		}

		const hasBody =
			(schema.type === 'object' && schema.properties && Object.keys(schema.properties).length >= 1) ||
			['allOf', 'oneOf', 'anyOf'].some((o) => Array.isArray(schema[o]) && schema[o].length > 0);
		const queryParameters = buildQueryParameters(schema);
		const requestBodyRequired = endpoint.meta.requireFile === true || !acceptsEmptyObject(params, schema);

		const authMode = authenticationMode(originalEndpoint);
		const security =
			authMode === 'required' ? [{ bearerAuth: [] }] : authMode === 'optional' ? [{}, { bearerAuth: [] }] : undefined;
		const baseInfo = {
			// misskey-js generator は `___` をエンドポイントパスの区切り文字として扱う。
			operationId: endpoint.name.replaceAll('/', '___'),
			summary: endpoint.name,
			description: desc,
			externalDocs: {
				description: 'Source code',
				url: `https://github.com/haru0416-dev/misskey/blob/develop/packages/backend/src/server/api/endpoints/${endpoint.name}.ts`,
			},
			...(endpoint.meta.tags
				? {
						tags: [endpoint.meta.tags[0]],
					}
				: {}),
			...(security === undefined ? {} : { security }),
		};
		const successResponses = {
			...(endpoint.meta.res
				? {
						'200': {
							description: 'OK (with results)',
							content: {
								'application/json': {
									schema: resSchema,
								},
							},
						},
					}
				: {
						'204': {
							description: 'OK (without any results)',
						},
					}),
			...(endpoint.meta.res?.optional === true
				? {
						'204': {
							description: 'OK (without any results)',
						},
					}
				: {}),
		};
		const hasInputParams = hasBody;

		spec.paths['/' + endpoint.name] = {
			...(endpoint.meta.allowGet
				? {
						get: {
							...baseInfo,
							operationId: 'get___' + baseInfo.operationId,
							...(queryParameters.length === 0 ? {} : { parameters: queryParameters }),
							responses: {
								...successResponses,
								...buildErrorResponses(originalEndpoint, 'get', hasInputParams),
							},
						},
					}
				: {}),
			post: {
				...baseInfo,
				operationId: 'post___' + baseInfo.operationId,
				...(hasBody
					? {
							requestBody: {
								required: requestBodyRequired,
								content: {
									[requestType]: {
										schema,
									},
								},
							},
						}
					: {}),
				responses: {
					...successResponses,
					...buildErrorResponses(originalEndpoint, 'post', hasInputParams),
				},
			},
		};
	}

	return spec;
}
