/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { apiUrl } from '@shared/utility/config.js';

const pendingApiRequestsCount = ref(0);

type ApiRequestArgs<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> =
	Misskey.Endpoints[E] extends { reqOptional: true }
		? [data?: P, signal?: AbortSignal]
		: [data: P, signal?: AbortSignal];
type ApiGetRequestArgs<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> =
	Misskey.Endpoints[E] extends { reqOptional: true } ? [data?: P] : [data: P];
type OptionalEndpoint = {
	[E in keyof Misskey.Endpoints]: Misskey.Endpoints[E] extends { reqOptional: true } ? E : never;
}[keyof Misskey.Endpoints];

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
	...[data, signal]: ApiRequestArgs<E, P>
): Promise<_ResT> {
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const promise = new Promise<_ResT>((resolve, reject) => {
		window.fetch(`${apiUrl}/${endpoint}`, {
			method: 'POST',
			body: JSON.stringify(data ?? {}),
			credentials: 'omit',
			cache: 'no-cache',
			headers: {
				'Content-Type': 'application/json',
			},
			...(signal === undefined ? {} : { signal }),
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(body);
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
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
>(
	endpoint: E,
	...[data]: ApiGetRequestArgs<E, P>
): Promise<_ResT> {
	pendingApiRequestsCount.value++;

	const onFinally = () => {
		pendingApiRequestsCount.value--;
	};

	const query = new URLSearchParams(
		Object.entries(data ?? {}).map(([key, value]): [string, string] => [key, String(value)]),
	);

	const promise = new Promise<_ResT>((resolve, reject) => {
		window.fetch(`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(body);
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}
