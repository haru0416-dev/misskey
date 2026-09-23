import { endpointReqTypes } from './autogen/endpoint.js';
import type { components } from './autogen/types.js';
import type { SwitchCaseResponseType, Endpoints } from './api.types.js';

export type { SwitchCaseResponseType } from './api.types.js';

const MK_API_ERROR = Symbol();

export type APIError = components['schemas']['Error']['error'];

export function isAPIError(reason: unknown): reason is APIError {
	return (
		reason !== null && typeof reason === 'object' && (reason as Record<PropertyKey, unknown>)[MK_API_ERROR] === true
	);
}

export type FetchLike = (
	input: string,
	init?: {
		method?: string;
		body?: Blob | FormData | string;
		credentials?: RequestCredentials;
		cache?: RequestCache;
		headers: { [key in string]: string };
		signal?: AbortSignal;
	},
) => Promise<{
	status: number;
	json(): Promise<unknown>;
}>;

export type APITransportRequest = {
	apiUrl: string;
	endpoint: string;
	method: 'GET' | 'POST';
	data?: unknown;
	mediaType?: string;
	credential?: string | null | undefined;
	signal?: AbortSignal | undefined;
	fetch?: FetchLike;
};

export type APITransportResponse = {
	status: number;
	body: unknown;
};

// 認証情報の選択、成功ステータスとエラーの解釈、query cacheは呼び出し側が所有する。
export async function requestAPI(options: APITransportRequest): Promise<APITransportResponse> {
	const { apiUrl, endpoint, method, data = {}, mediaType = 'application/json', signal } = options;
	const params = data !== null && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
	let url = `${apiUrl}/${endpoint}`;
	let body: FormData | string | undefined;
	const headers: Record<string, string> = {};

	if (method === 'GET') {
		const query = new URLSearchParams(data as Record<string, string>);
		url += `?${query}`;
	} else if (mediaType === 'multipart/form-data') {
		const form = new FormData();
		if (options.credential != null) {
			form.append('i', options.credential);
		}
		for (const key in params) {
			const value = params[key];
			if (value == null) continue;
			if (value instanceof Blob) {
				form.append(key, value);
			} else if (typeof value === 'object') {
				form.append(key, JSON.stringify(value));
			} else {
				form.append(key, String(value));
			}
		}
		body = form;
	} else {
		headers['Content-Type'] = mediaType;
		// SDKは明示的なundefinedでもdata.iを上書きする。匿名クライアントはcredentialを渡さない。
		body = mediaType === 'application/json'
			? JSON.stringify('credential' in options ? { ...params, i: options.credential } : data)
			: '{}';
	}

	const init = {
		method,
		...(body === undefined ? {} : { body }),
		headers,
		credentials: 'omit' as const,
		cache: method === 'POST' ? 'no-cache' as const : 'default' as const,
		...(signal === undefined ? {} : { signal }),
	};
	const response = await (options.fetch ? options.fetch(url, init) : fetch(url, init));
	return {
		status: response.status,
		body: response.status === 204 ? null : await response.json(),
	};
}

export class APIClient {
	public origin: string;
	public credential: string | null | undefined;
	public fetch: FetchLike;

	constructor(opts: {
		origin: APIClient['origin'];
		credential?: APIClient['credential'];
		fetch?: APIClient['fetch'] | null | undefined;
	}) {
		this.origin = opts.origin.replace(/\/$/, '');
		this.credential = opts.credential;
		// ネイティブ関数をそのまま変数に代入して使おうとするとChromiumではIllegal invocationエラーが発生するため、
		// 環境で実装されているfetchを使う場合は無名関数でラップして使用する
		this.fetch = opts.fetch ?? ((...args) => fetch(...args));
	}

	private assertIsAPIError(obj: unknown): obj is APIError {
		return (
			obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
			'code' in obj && typeof obj.code === 'string' &&
			'message' in obj && typeof obj.message === 'string' &&
			'id' in obj && typeof obj.id === 'string' &&
			'kind' in obj && (obj.kind === 'client' || obj.kind === 'server' || obj.kind === 'permission')
		);
	}

	private assertSpecialEpReqType(ep: keyof Endpoints): ep is keyof typeof endpointReqTypes {
		return ep in endpointReqTypes;
	}

	public request<E extends keyof Endpoints, P extends Endpoints[E]['req'] = never>(
		endpoint: E,
		...args: Endpoints[E] extends { reqOptional: true }
			? [params?: P, credential?: string | null, signal?: AbortSignal]
			: [params: P, credential?: string | null, signal?: AbortSignal]
	): Promise<SwitchCaseResponseType<E, P>> {
		const params = args[0] ?? ({} as P);
		const credential = args[1];
		const signal = args[2];
		// 生成定義にnullが含まれる場合は、デフォルト値を維持する。
		const mediaType = this.assertSpecialEpReqType(endpoint) ? endpointReqTypes[endpoint] ?? 'application/json' : 'application/json';
		return requestAPI({
			apiUrl: `${this.origin}/api`,
			endpoint,
			method: 'POST',
			data: params,
			mediaType,
			credential: credential !== undefined ? credential : this.credential,
			signal,
			fetch: this.fetch,
		}).then(({ status, body }) => {
			if (status === 200 || status === 204) {
				// エンドポイントごとのレスポンス型はautogenのスキーマ経由でしか静的に表現できないため、
				// サーバーがそのスキーマ通りに応答してくることを信頼してキャストする
				return body as SwitchCaseResponseType<E, P>;
			}
			const error = body !== null && typeof body === 'object' && !Array.isArray(body) && 'error' in body ? body.error : undefined;
			throw this.assertIsAPIError(error)
				? {
						[MK_API_ERROR]: true,
						...error,
					}
				: body;
		});
	}
}
