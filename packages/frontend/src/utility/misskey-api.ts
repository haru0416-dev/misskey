/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@shared/utility/config.js';
import { $i } from '@/i.js';
import { fetchMisskeyQuery, invalidateAfterMutation, isCachedEndpoint } from '@/query/api.js';
import type { QueryAccountId } from '@/query/keys.js';
export const pendingApiRequestsCount = ref(0);

type ApiRequestData<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> = P & {
	i?: string | null;
};
type ApiRequestArgs<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'],
> = Misskey.Endpoints[E] extends { reqOptional: true }
	? [data?: ApiRequestData<E, P>, token?: string | null | undefined, signal?: AbortSignal | undefined]
	: [data: ApiRequestData<E, P>, token?: string | null | undefined, signal?: AbortSignal | undefined];
type OptionalEndpoint = {
	[E in keyof Misskey.Endpoints]: Misskey.Endpoints[E] extends { reqOptional: true } ? E : never;
}[keyof Misskey.Endpoints];

function requestMisskeyApi<_ResT, E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']>(
	method: 'GET' | 'POST',
	endpoint: E,
	data: P,
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const payload = { ...data } as Record<string, unknown> & { i?: string | null };
	if (method === 'POST') {
		if (token !== undefined) payload.i = token;
	}
	const promise = Misskey.api
		.requestAPI({
			apiUrl,
			endpoint,
			method,
			data: payload,
			signal,
		})
		.then(({ status, body }) => {
			if (status === 200 || status === 204) {
				return body as _ResT;
			}
			// エラー本文の直接参照を維持し、不正なnull本文を成功や別のAPIエラーに変換しない。
			const errorResponse = body as { error: unknown };
			throw errorResponse.error;
		});

	promise.then(onFinally, onFinally);
	return promise;
}

// Implements Misskey.api.ApiClient.request
export function misskeyApi<
	ResT = void,
	E extends OptionalEndpoint = OptionalEndpoint,
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, never> : ResT,
>(endpoint: E): Promise<_ResT>;
export function misskeyApi<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(endpoint: E, ...args: ApiRequestArgs<E, P>): Promise<_ResT>;
export function misskeyApi<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(endpoint: E, ...args: ApiRequestArgs<E, P>): Promise<_ResT> {
	const [data = {} as ApiRequestData<E, P>, token, signal] = args;
	return prepareMisskeyApiRequest<E, P, _ResT>(endpoint, data, token, signal).execute();
}

type PreparedApiRequest<T> = {
	accountId: QueryAccountId | undefined;
	execute: () => Promise<T>;
};

// 待機中にアカウントが変わっても、送信と完了時の無効化は開始時の所有者へ向ける。
export function prepareMisskeyApiRequest<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'],
	T = Misskey.api.SwitchCaseResponseType<E, P>,
>(endpoint: E, data: ApiRequestData<E, P>, token?: string | null, signal?: AbortSignal): PreparedApiRequest<T> {
	if (endpoint.includes('://')) {
		throw new Error('invalid endpoint');
	}
	const accountId = $i?.id ?? null;
	const accountToken = $i?.token;
	const requestToken = token !== undefined ? token : (accountToken ?? data.i);
	const requestAccountId = requestToken == null ? null : requestToken === accountToken ? accountId : undefined;
	if (token === undefined && data.i === undefined && signal == null && isCachedEndpoint(endpoint)) {
		return {
			accountId,
			execute: () =>
				fetchMisskeyQuery({
					accountId,
					endpoint,
					params: data,
					queryFn: (querySignal) => requestMisskeyApi<T, E, P>('POST', endpoint, data, requestToken, querySignal),
				}),
		};
	}
	return {
		accountId: requestAccountId,
		execute: () =>
			requestMisskeyApi<T, E, P>('POST', endpoint, data, requestToken, signal).then((response) => {
				invalidateAfterMutation(requestAccountId, endpoint);
				return response;
			}),
	};
}

// Implements Misskey.api.ApiClient.request
export function misskeyApiGet<
	ResT = void,
	E extends OptionalEndpoint = OptionalEndpoint,
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, never> : ResT,
>(endpoint: E): Promise<_ResT>;
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	...args: Misskey.Endpoints[E] extends { reqOptional: true }
		? [data?: ApiRequestData<E, P>]
		: [data: ApiRequestData<E, P>]
): Promise<_ResT>;
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	...args: Misskey.Endpoints[E] extends { reqOptional: true }
		? [data?: ApiRequestData<E, P>]
		: [data: ApiRequestData<E, P>]
): Promise<_ResT> {
	if (endpoint.includes('://')) {
		throw new Error('invalid endpoint');
	}
	const data = { ...args[0] } as ApiRequestData<E, P>;
	delete data.i;
	if (isCachedEndpoint(endpoint)) {
		return fetchMisskeyQuery({
			accountId: null,
			endpoint,
			params: data,
			queryFn: (signal) => requestMisskeyApi<_ResT, E, P>('GET', endpoint, data, undefined, signal),
		}) as Promise<_ResT>;
	}
	return requestMisskeyApi<_ResT, E, P>('GET', endpoint, data, undefined);
}
