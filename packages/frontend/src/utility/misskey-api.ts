/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@shared/utility/config.js';
import { $i } from '@/i.js';
import { fetchMisskeyQuery, invalidateAfterMutation, isCachedEndpoint } from '@/query/api.js';
export const pendingApiRequestsCount = ref(0);

type ApiRequestData<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> = P & { i?: string | null };
type ApiRequestArgs<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> =
	Misskey.Endpoints[E] extends { reqOptional: true }
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

	const payload = { ...(data ?? {}) } as Record<string, unknown> & { i?: string | null };
	if (method === 'POST') {
		if ($i) payload.i = $i.token;
		if (token !== undefined) payload.i = token;
	}
	const query = new URLSearchParams(payload as Record<string, string>);

	const promise = window
		.fetch(method === 'POST' ? `${apiUrl}/${endpoint}` : `${apiUrl}/${endpoint}?${query}`, {
			method,
			...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
			credentials: 'omit',
			cache: method === 'POST' ? 'no-cache' : 'default',
			...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' } } : {}),
			...(signal === undefined ? {} : { signal }),
		})
		.then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) return body as _ResT;
			if (res.status === 204) return body as _ResT;
			throw body.error;
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
>(
	endpoint: E,
	...args: ApiRequestArgs<E, P>
): Promise<_ResT> {
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	const [data = {} as ApiRequestData<E, P>, token, signal] = args;

	if (token === undefined && data.i === undefined && signal == null && isCachedEndpoint(endpoint)) {
		return fetchMisskeyQuery({
			accountId: $i?.id ?? null,
			endpoint,
			params: data,
			queryFn: (querySignal) => requestMisskeyApi<_ResT, E, P>('POST', endpoint, data, token, querySignal),
		}) as Promise<_ResT>;
	}

	return requestMisskeyApi<_ResT, E, P>('POST', endpoint, data, token, signal).then((response) => {
		invalidateAfterMutation($i?.id ?? null, endpoint);
		return response;
	});
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
>(endpoint: E, ...args: Misskey.Endpoints[E] extends { reqOptional: true }
	? [data?: ApiRequestData<E, P>]
	: [data: ApiRequestData<E, P>]): Promise<_ResT>;
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
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	const [data = {} as ApiRequestData<E, P>] = args;
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
