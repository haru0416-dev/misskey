/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { z } from 'zod';
import type { Schema, SchemaType } from '@/misc/json-schema.js';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { ApiAuthenticated } from './auth/auth.js';
import type { AuthedCredential } from './endpoint-guards.js';
import type { ApiError } from './error.js';
import type { parseApiParams } from './validation.js';

// 契約 (meta・入力) と、そこから導く実装側の型。宣言のファイルから読み込むので実行時の依存を持たない。

export type ErrorDeclarations = NonNullable<IEndpointMeta['errors']>;

export type EndpointContract<M extends IEndpointMeta = IEndpointMeta, P extends z.ZodType = z.ZodType> = {
	readonly meta: M;
	readonly paramDef: P;
};

/** 型だけを確定させる。meta は as const 相当のリテラル型で保持する。 */
export function defineContract<const M extends IEndpointMeta, P extends z.ZodType>(
	contract: EndpointContract<M, P>,
): EndpointContract<M, P> {
	return contract;
}

/** カテゴリの一部だけを契約から登録するときに使う。残りは routes/ の手書き登録が受け持つ。 */
export function pickContracts<C extends Record<string, unknown>, const K extends keyof C & string>(
	contracts: C,
	keys: readonly K[],
): Pick<C, K> {
	return Object.fromEntries(keys.map((key) => [key, contracts[key]])) as Pick<C, K>;
}

type RequiresCredential<M> = M extends { readonly requireCredential: true }
	? true
	: M extends { readonly requireModerator: true }
		? true
		: M extends { readonly requireAdmin: true }
			? true
			: false;

export type EndpointAuth<M extends IEndpointMeta> =
	RequiresCredential<M> extends true ? AuthedCredential : ApiAuthenticated;

/** meta.res から導いた応答の型。res を宣言しないエンドポイントは 204 を返す。 */
export type EndpointResult<M extends IEndpointMeta> = M extends { readonly res: infer R extends Schema }
	? SchemaType<R>
	: void;

export type EndpointErrors<M extends IEndpointMeta> = M extends { readonly errors: infer E extends ErrorDeclarations }
	? { readonly [K in keyof E]: (info?: unknown) => ApiError }
	: Record<never, never>;

/** 実装を別の関数に分けたとき、その関数が受け取る宣言由来のエラー。 */
export type ContractErrors<C extends EndpointContract> = EndpointErrors<C['meta']>;

export type EndpointContext<D, C extends EndpointContract> = {
	readonly deps: D;
	readonly input: ReturnType<typeof parseApiParams<C['paramDef']>>;
	readonly auth: EndpointAuth<C['meta']>;
	readonly me: EndpointAuth<C['meta']>['user'];
	readonly errors: EndpointErrors<C['meta']>;
	readonly signal: AbortSignal;
	/** リクエスト元の IP。信頼するリバースプロキシの設定を反映する。 */
	readonly requestIp: () => string;
	readonly requestHeaders: () => Record<string, string>;
};

export type EndpointHandler<D, C extends EndpointContract> = (
	context: EndpointContext<D, C>,
) => Promise<EndpointResult<C['meta']>>;

export type AnyEndpointHandler<D> = (context: EndpointContext<D, EndpointContract>) => Promise<unknown>;
