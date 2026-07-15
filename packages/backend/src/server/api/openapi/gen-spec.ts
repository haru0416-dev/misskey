/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import endpoints, { IEndpoint } from '../endpoints.js';
import { errors as basicErrors } from './errors.js';
import { getSchemas, convertSchemaToOpenApiSchema, type OpenApiSchemaObject } from './schemas.js';

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
		},

		externalDocs: {
			description: 'Repository',
			url: 'https://github.com/haru0416-dev/misskey',
		},

		servers: [{
			url: config.runtime.apiUrl,
		}],

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
		const errors: Record<string, { value: { error: unknown } }> = {};

		if (endpoint.meta.errors) {
			for (const e of Object.values(endpoint.meta.errors)) {
				errors[e.code] = {
					value: {
						error: e,
					},
				};
			}
		}

		const resSchema = endpoint.meta.res ? convertSchemaToOpenApiSchema(endpoint.meta.res, 'res', includeSelfRef) : {};

		let desc = (endpoint.meta.description ? endpoint.meta.description : 'No description provided.') + '\n\n';

		if (endpoint.meta.secure) {
			desc += '**Internal Endpoint**: This endpoint is an API for the misskey mainframe and is not intended for use by third parties.\n';
		}

		desc += `**Credential required**: *${endpoint.meta.requireCredential ? 'Yes' : 'No'}*`;
		if (endpoint.meta.kind) {
			const kind = endpoint.meta.kind;
			desc += ` / **Permission**: *${kind}*`;
		}

		const requestType = endpoint.meta.requireFile ? 'multipart/form-data' : 'application/json';
		const schema = params instanceof z.ZodType
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
			schema.required = [...schema.required ?? [], 'file'];
		}

		if (schema.required && schema.required.length <= 0) {
			// 空配列は許可されない
			delete schema.required;
		}

		const hasBody = (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length >= 1)
			|| ['allOf', 'oneOf', 'anyOf'].some(o => (Array.isArray(schema[o]) && schema[o].length >= 0));

		const info = {
			operationId: endpoint.name.replaceAll('/', '___'), // NOTE: スラッシュは使えない
			summary: endpoint.name,
			description: desc,
			externalDocs: {
				description: 'Source code',
				url: `https://github.com/haru0416-dev/misskey/blob/develop/packages/backend/src/server/api/endpoints/${endpoint.name}.ts`,
			},
			...(endpoint.meta.tags ? {
				tags: [endpoint.meta.tags[0]],
			} : {}),
			...(endpoint.meta.requireCredential ? {
				security: [{
					bearerAuth: [],
				}],
			} : {}),
			...(hasBody ? {
				requestBody: {
					required: true,
					content: {
						[requestType]: {
							schema,
						},
					},
				},
			} : {}),
			responses: {
				...(endpoint.meta.res ? {
					'200': {
						description: 'OK (with results)',
						content: {
							'application/json': {
								schema: resSchema,
							},
						},
					},
				} : {
					'204': {
						description: 'OK (without any results)',
					},
				}),
				...(endpoint.meta.res?.optional === true || endpoint.meta.res?.nullable === true ? {
					'204': {
						description: 'OK (without any results)',
					},
				} : {}),
				'400': {
					description: 'Client error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: { ...errors, ...basicErrors['400'] },
						},
					},
				},
				'401': {
					description: 'Authentication error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['401'],
						},
					},
				},
				'403': {
					description: 'Forbidden error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['403'],
						},
					},
				},
				'418': {
					description: 'I\'m Ai',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['418'],
						},
					},
				},
				...(endpoint.meta.limit ? {
					'429': {
						description: 'Too many requests',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error',
								},
								examples: basicErrors['429'],
							},
						},
					},
				} : {}),
				'500': {
					description: 'Internal server error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['500'],
						},
					},
				},
			},
		};

		spec.paths['/' + endpoint.name] = {
			...(endpoint.meta.allowGet ? {
				get: {
					...info,
					operationId: 'get___' + info.operationId,
				},
			} : {}),
			post: {
				...info,
				operationId: 'post___' + info.operationId,
			},
		};
	}

	return spec;
}
