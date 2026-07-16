/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { Config } from '@/config.js';
import endpoints from '@/server/api/endpoints.js';
import { genOpenapiSpec } from '@/server/api/openapi/gen-spec.js';

type ErrorBody = {
	error: {
		message: string;
		code: string;
		id: string;
		kind: 'client' | 'server' | 'permission';
		info?: unknown;
	};
};

type ErrorResponse = {
	content?: {
		'application/json'?: {
			examples?: Record<string, { value: ErrorBody }>;
		};
	};
};

type Operation = {
	parameters?: Array<{
		name: string;
		in: string;
		required: boolean;
		schema: Record<string, unknown>;
	}>;
	requestBody?: {
		required: boolean;
	};
	responses: Record<string, ErrorResponse>;
	security?: Array<Record<string, unknown>>;
};

const spec = genOpenapiSpec({
	runtime: {
		version: 'test',
		apiUrl: 'https://example.test/api',
	},
} as Config);

function operationFor(endpointName: string, method: 'get' | 'post' = 'post'): Operation {
	const operation = spec.paths[`/${endpointName}`]?.[method];
	if (operation == null) throw new Error(`Missing OpenAPI operation: ${endpointName}`);
	return operation as Operation;
}

function responsesFor(endpointName: string, method: 'get' | 'post' = 'post'): Record<string, ErrorResponse> {
	return operationFor(endpointName, method).responses;
}

function examplesFor(endpointName: string, status: number, method: 'get' | 'post' = 'post'): Record<string, { value: ErrorBody }> {
	return responsesFor(endpointName, method)[String(status)]?.content?.['application/json']?.examples ?? {};
}

describe('OpenAPI errors', () => {
	test('places every endpoint error under its declared HTTP status without leaking metadata fields', () => {
		for (const endpoint of endpoints) {
			for (const [key, error] of Object.entries(endpoint.meta.errors ?? {})) {
				const example = examplesFor(endpoint.name, error.httpStatusCode ?? 400)[key];
				expect(example, `${endpoint.name}.${key}`).toBeDefined();
				expect(example!.value.error).toEqual({
					message: error.message,
					code: error.code,
					id: error.id,
					kind: error.kind ?? 'client',
					...(error.info === undefined ? {} : { info: error.info }),
				});
				expect(example!.value.error).not.toHaveProperty('httpStatusCode');
			}
		}
	});

	test('documents common errors with their runtime status and shape', () => {
		expect(examplesFor('i', 401)['AUTHENTICATION_FAILED']?.value.error).toMatchObject({
			code: 'AUTHENTICATION_FAILED',
			kind: 'client',
		});
		expect(responsesFor('ping')['401']).toBeUndefined();
		expect(examplesFor('drive/files/create', 413)['maxFileSizeExceeded']?.value.error.code).toBe('MAX_FILE_SIZE_EXCEEDED');
		expect(examplesFor('i/update', 422)['nameContainsProhibitedWords']?.value.error.code).toBe('YOUR_NAME_CONTAINS_PROHIBITED_WORDS');
		expect(examplesFor('users/show', 404)['noSuchUser']?.value.error.code).toBe('NO_SUCH_USER');
		expect(examplesFor('users/show', 500)['failedToResolveRemoteUser']?.value.error.kind).toBe('server');
		expect(examplesFor('fetch-rss', 429)['RATE_LIMIT_EXCEEDED']?.value.error.code).toBe('RATE_LIMIT_EXCEEDED');
		expect(responsesFor('ping')['429']).toBeUndefined();
		expect(examplesFor('users/show', 401)['AUTHENTICATION_FAILED']?.value.error.code).toBe('AUTHENTICATION_FAILED');
		expect(examplesFor('users/show', 401)['CREDENTIAL_REQUIRED']).toBeUndefined();
		expect(examplesFor('users/show', 403)['YOUR_ACCOUNT_SUSPENDED']?.value.error.kind).toBe('permission');
		expect(responsesFor('endpoints')['413']).toBeUndefined();
		expect(examplesFor('endpoints', 400)['INVALID_JSON_BODY']).toBeUndefined();
		expect(responsesFor('fetch-rss', 'get')).toBeDefined();
		expect(examplesFor('fetch-rss', 400, 'get')['INVALID_JSON_BODY']).toBeUndefined();
		expect(responsesFor('fetch-rss', 'get')['413']).toBeUndefined();
		expect(examplesFor('fetch-rss', 400)['INVALID_JSON_BODY']?.value.error.code).toBe('INVALID_PARAM');
		expect(responsesFor('fetch-rss')['413']).toBeDefined();
		expect(examplesFor('admin/captcha/save', 400)['invalidProvider']).toBeUndefined();
		expect(examplesFor('admin/captcha/save', 400)['noResponseProvided']).toBeUndefined();
		for (const path of Object.values(spec.paths)) {
			expect(path.post['responses']).not.toHaveProperty('418');
			if (path.get != null) expect(path.get['responses']).not.toHaveProperty('418');
		}
	});

	test('separates GET and POST request/authentication contracts', () => {
		expect(operationFor('fetch-rss', 'get')).not.toHaveProperty('requestBody');
		expect(operationFor('fetch-rss', 'get').parameters).toEqual([{
			name: 'url',
			in: 'query',
			required: true,
			schema: { type: 'string' },
		}]);
		expect(operationFor('charts/active-users', 'get').parameters).toEqual(expect.arrayContaining([
			expect.objectContaining({ name: 'span', in: 'query', required: true }),
			expect.objectContaining({ name: 'limit', in: 'query', required: false }),
		]));
		expect(operationFor('users/show').security).toEqual([{}, { bearerAuth: [] }]);
		expect(operationFor('i').security).toEqual([{ bearerAuth: [] }]);
		expect(operationFor('ping')).not.toHaveProperty('security');
		expect(operationFor('i/update').requestBody?.required).toBe(false);
		expect(operationFor('users/show').requestBody?.required).toBe(true);
		expect(operationFor('drive/files/create').requestBody?.required).toBe(true);
	});

	test('keeps nullable JSON responses on 200 without inventing a 204 response', () => {
		expect(responsesFor('federation/show-instance')['200']).toBeDefined();
		expect(responsesFor('federation/show-instance')['204']).toBeUndefined();
	});

	test('documents empty JSON objects as 200 responses instead of no-content responses', () => {
		for (const endpoint of ['i/2fa/update-key', 'i/2fa/remove-key']) {
			expect(responsesFor(endpoint)['200']).toBeDefined();
			expect(responsesFor(endpoint)['204']).toBeUndefined();
		}
	});

	test('keeps endpoint and common errors with the same code as separate examples', () => {
		const examples = examplesFor('users/lists/list', 400);
		expect(examples['invalidParam']?.value.error.code).toBe('INVALID_PARAM');
		expect(examples['INVALID_PARAM']?.value.error.code).toBe('INVALID_PARAM');
		expect(examples['invalidParam']?.value.error.id).not.toBe(examples['INVALID_PARAM']?.value.error.id);
	});

	test('requires the runtime error kind and permits optional info', () => {
		const errorSchema = spec.components.schemas.Error as {
			properties: {
				error: {
					properties: Record<string, unknown>;
					required: string[];
				};
			};
		};
		expect(errorSchema.properties.error.required).toContain('kind');
		expect(errorSchema.properties.error.properties['kind']).toMatchObject({
			enum: ['client', 'server', 'permission'],
		});
		expect(errorSchema.properties.error.properties).toHaveProperty('info');
	});
});
