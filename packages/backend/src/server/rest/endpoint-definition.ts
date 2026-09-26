/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Context, Hono } from 'hono';
import type { z } from 'zod';
import { errors as commonErrors } from '@/server/api/openapi/errors.js';
import { authenticateApiToken } from './auth/auth.js';
import { applyEndpointGuards } from './endpoint-guards.js';
import type { EndpointGuardDependencies } from './endpoint-guards.js';
import type {
	AnyEndpointHandler,
	ContractErrors,
	EndpointContract,
	EndpointHandler,
	ErrorDeclarations,
} from './endpoint-contract.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from './error.js';
import {
	emptyResponse,
	jsonBody,
	jsonResponse,
	publicCacheHeadersWhenAnonymous,
	runApiEndpoint,
	tokenFromRequest,
} from './shell-helpers.js';
import { queryToApiBody } from './string-params.js';
import { parseApiParams } from './validation.js';

/*
 * エンドポイント 1 本の契約 (meta・入力・応答・エラー) と実装を 1 か所で結ぶ。
 * - 認証・権限・回数制限は meta からだけ組み立てる。登録の手書きが無いので宣言とずれない。
 * - 実装が返す値は meta.res から導いた型に合わなければ型エラーになる。
 * - 実装が投げる業務エラーは meta.errors から作る。サービスの IdentifiableError も id が一致すれば宣言どおりになる。
 *   宣言に無いエラーはテスト環境で 500 にして止める。
 * - HTTP メソッドは allowGet / allowQuery から決まり、api-route-contract の検査と同じ規則に従う。
 */

export type EndpointImplementation<D> = {
	readonly name: string;
	readonly contract: EndpointContract;
	readonly handler: AnyEndpointHandler<D>;
};

/**
 * 契約の集合に実装を割り当てる。契約のキーと実装のキーが 1 対 1 でないと型エラーになる。
 * 依存の型 D だけを明示し、契約の型は引数から推論させるため 2 段で呼ぶ。
 */
export function implementEndpoints<D>() {
	return <C extends Record<string, EndpointContract>>(
		contracts: C,
		handlers: { readonly [K in keyof C]: EndpointHandler<D, C[K]> },
	): EndpointImplementation<D>[] =>
		Object.keys(contracts).map((name) => ({
			name,
			contract: contracts[name]!,
			handler: handlers[name] as unknown as AnyEndpointHandler<D>,
		}));
}

/** 仕様書が全エンドポイント共通として載せるエラー。宣言に無くても投げてよい。 */
const commonErrorIds = new Set(
	Object.values(commonErrors).flatMap((byCode) => Object.values(byCode).map((example) => example.value.error.id)),
);

/** 契約の meta.errors から ApiError を作る関数の表。実装を直接呼ぶテストでも使う。 */
export function contractErrors<C extends EndpointContract>(contract: C): ContractErrors<C> {
	return createErrorFactories(contract.meta.errors) as ContractErrors<C>;
}

function createErrorFactories(errors: ErrorDeclarations | undefined): Record<string, (info?: unknown) => ApiError> {
	const factories: Record<string, (info?: unknown) => ApiError> = {};
	for (const [key, error] of Object.entries(errors ?? {})) {
		factories[key] = (info?: unknown) =>
			new ApiError({
				status: error.httpStatusCode ?? 400,
				message: error.message,
				code: error.code,
				id: error.id,
				...(error.kind === undefined ? {} : { kind: error.kind }),
				info: info ?? error.info,
			});
	}
	return factories;
}

// 宣言と実装のずれは型では処理の奥 (共通の投稿処理など) まで追えない。テストでは実行時に検出する。
const detectUndeclaredErrors = process.env['NODE_ENV'] === 'test';

export function registerEndpoints<D extends EndpointGuardDependencies>(
	app: Hono,
	deps: D,
	implementations: readonly EndpointImplementation<D>[],
): void {
	for (const { name, contract, handler } of implementations) {
		const meta = contract.meta;
		const errors = createErrorFactories(meta.errors);
		const declaredErrorIds = new Set(Object.values(meta.errors ?? {}).map((error) => error.id));
		const errorsById = new Map(Object.entries(meta.errors ?? {}).map(([key, error]) => [error.id, errors[key]!]));
		const cacheSec = 'cacheSec' in meta ? meta.cacheSec : undefined;

		const run = (readBody: (c: Context) => Promise<Record<string, unknown>>) => async (c: Context) =>
			await runApiEndpoint(c, async () => {
				const body = await readBody(c);
				const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
				await applyEndpointGuards(deps, name, meta, auth);
				const input = parseApiParams(contract.paramDef, body);

				let result: unknown;
				try {
					result = await handler({ deps, input, auth, me: auth.user, errors, signal: c.req.raw.signal });
				} catch (err) {
					// サービスが投げる識別子付きのエラーは、契約に同じ id があれば宣言どおりの API エラーにする。
					if (err instanceof IdentifiableError) {
						const declared = errorsById.get(err.id);
						if (declared != null) throw declared();
					}
					if (
						detectUndeclaredErrors &&
						err instanceof ApiError &&
						!declaredErrorIds.has(err.id) &&
						!commonErrorIds.has(err.id)
					) {
						throw new Error(`${name} が meta.errors に無いエラーを投げた: ${err.code} (${err.id})`, { cause: err });
					}
					throw err;
				}

				if (result === undefined) {
					return emptyResponse(c);
				}
				return jsonResponse(c, result, 200, cacheSec == null ? {} : publicCacheHeadersWhenAnonymous(auth, cacheSec));
			});

		const methods = 'allowQuery' in meta && meta.allowQuery === true ? ['POST', 'QUERY'] : ['POST'];
		app.on(methods, `/${name}`, run(jsonBody));

		if ('allowGet' in meta && meta.allowGet === true) {
			app.get(
				`/${name}`,
				run(async (c) => queryToApiBody(contract.paramDef as unknown as z.ZodObject, c.req.query())),
			);
		}
	}
}
