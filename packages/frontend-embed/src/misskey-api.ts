/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@shared/utility/config.js';

const pendingApiRequestsCount = ref(0);

type ApiRequestArgs<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'],
> = Misskey.Endpoints[E] extends { reqOptional: true }
	? [data?: P, signal?: AbortSignal]
	: [data: P, signal?: AbortSignal];
type ApiGetRequestArgs<
	E extends keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'],
> = Misskey.Endpoints[E] extends { reqOptional: true } ? [data?: P] : [data: P];
type OptionalEndpoint = {
	[E in keyof Misskey.Endpoints]: Misskey.Endpoints[E] extends { reqOptional: true } ? E : never;
}[keyof Misskey.Endpoints];

function requestMisskeyApi<T>(
	method: 'GET' | 'POST',
	endpoint: keyof Misskey.Endpoints,
	data: unknown,
	signal?: AbortSignal,
): Promise<T> {
	pendingApiRequestsCount.value++;
	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};
	const promise = Misskey.api.requestAPI({
		apiUrl,
		endpoint,
		method,
		data: data ?? {},
		signal,
	}).then(({ status, body }) => {
		if (status === 200 || status === 204) {
			return body as T;
		}
		// エラー本文の直接参照を維持し、不正なnull本文を成功や別のAPIエラーに変換しない。
		const errorResponse = body as { error: unknown };
		throw errorResponse.error;
	});
	promise.then(onFinally, onFinally);
	return promise;
}

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
>(endpoint: E, ...[data, signal]: ApiRequestArgs<E, P>): Promise<_ResT> {
	if (endpoint.includes('://')) {
		throw new Error('invalid endpoint');
	}
	return requestMisskeyApi<_ResT>('POST', endpoint, data, signal);
}

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
>(endpoint: E, ...args: ApiGetRequestArgs<E, P>): Promise<_ResT>;
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(endpoint: E, ...[data]: ApiGetRequestArgs<E, P>): Promise<_ResT> {
	return requestMisskeyApi<_ResT>('GET', endpoint, data);
}
