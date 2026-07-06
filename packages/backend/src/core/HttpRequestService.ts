/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as stream from 'node:stream';
import ipaddr from 'ipaddr.js';
import CacheableLookup from 'cacheable-lookup';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { StatusError } from '@/misc/status-error.js';
import { bindThis } from '@/decorators.js';
import { validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import { assertActivityMatchesUrl, FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';
import type { IObject } from '@/core/activitypub/type.js';
import { URL } from 'node:url';

/**
 * `send()` の戻り値。Bun ネイティブ fetch の `Response` から、呼び出し側が実際に使う表面
 * (ok/status/statusText/url/headers と json()/text()) だけを取り出したラッパー。
 * ボディは size 上限付きで読み切った上でメモリに保持しているため json()/text() は同期的に解決する。
 */
export type HttpRequestSendResponse = {
	ok: boolean;
	status: number;
	statusText: string;
	url: string;
	headers: Headers;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
};

export type HttpRequestSendOptions = {
	throwErrorWhenResponseNotOk: boolean;
	validators?: ((res: HttpRequestSendResponse) => void)[];
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;

/** リダイレクト先へ引き継がない (安全側に倒す) ヘッダ。cross-origin では Authorization も別途落とす。 */
const CONTENT_HEADERS = ['content-type', 'content-length', 'content-encoding', 'content-language', 'content-location'];

function deleteHeaderCaseInsensitive(headers: Record<string, string>, name: string): void {
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === name) delete headers[key];
	}
}

/**
 * ip が private / non-unicast かどうか。allowedPrivateNetworks に含まれる CIDR は許可 (= private ではない扱い)。
 * Agent の createConnection と send() の事前 DNS チェックで共有する。
 */
function isPrivateIp(ip: string, allowedPrivateNetworks: string[] | undefined): boolean {
	const parsedIp = ipaddr.parse(ip);

	for (const net of allowedPrivateNetworks ?? []) {
		const cidr = ipaddr.parseCIDR(net);
		if (cidr[0].kind() === parsedIp.kind() && parsedIp.match(cidr)) {
			return false;
		}
	}

	return parsedIp.range() !== 'unicast';
}

/**
 * fetch のレスポンスボディを最大 limit バイトまで読み取る。超過したら例外を投げる。
 * node-fetch の `size` オプション相当 (グローバル fetch には無いので自前で実装)。
 */
async function readBodyWithLimit(res: Response, limit: number): Promise<Uint8Array> {
	const contentLength = res.headers.get('content-length');
	if (contentLength != null) {
		const declared = Number(contentLength);
		if (Number.isFinite(declared) && declared > limit) {
			await res.body?.cancel();
			throw new StatusError(`Response body exceeds size limit (${limit} bytes)`, 400, 'Payload Too Large');
		}
	}

	if (res.body == null) return new Uint8Array(0);

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value == null) continue;
			total += value.byteLength;
			if (total > limit) {
				throw new StatusError(`Response body exceeds size limit (${limit} bytes)`, 400, 'Payload Too Large');
			}
			chunks.push(value);
		}
	} catch (err) {
		await reader.cancel().catch(() => {});
		throw err;
	} finally {
		reader.releaseLock();
	}

	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

function buildSendResponse(res: Response, body: Uint8Array): HttpRequestSendResponse {
	let text: string | undefined;
	const decode = () => (text ??= new TextDecoder().decode(body));
	return {
		ok: res.ok,
		status: res.status,
		statusText: res.statusText,
		url: res.url,
		headers: res.headers,
		json: async () => JSON.parse(decode()),
		text: async () => decode(),
	};
}

class HttpRequestServiceAgent extends http.Agent {
	constructor(
		private config: Config,
		options?: http.AgentOptions,
	) {
		super(options);
	}

	@bindThis
	public createConnection(options: http.ClientRequestArgs, callback?: (err: Error | null, stream: stream.Duplex) => void): stream.Duplex {
		const socket = super.createConnection(options, callback);

		if (socket == null) {
			throw new Error('Failed to create socket');
		}

		socket.on('connect', () => {
			if (socket instanceof net.Socket && process.env.NODE_ENV === 'production') {
				const address = socket.remoteAddress;
				if (address && ipaddr.isValid(address)) {
					if (isPrivateIp(address, this.config.allowedPrivateNetworks)) {
						socket.destroy(new Error(`Blocked address: ${address}`));
					}
				}
			}
		});

		return socket;
	}
}

class HttpsRequestServiceAgent extends https.Agent {
	constructor(
		private config: Config,
		options?: https.AgentOptions,
	) {
		super(options);
	}

	@bindThis
	public createConnection(options: http.ClientRequestArgs, callback?: (err: Error | null, stream: stream.Duplex) => void): stream.Duplex {
		const socket = super.createConnection(options, callback);

		if (socket == null) {
			throw new Error('Failed to create socket');
		}

		socket.on('connect', () => {
			if (socket instanceof net.Socket && process.env.NODE_ENV === 'production') {
				const address = socket.remoteAddress;
				if (address && ipaddr.isValid(address)) {
					if (isPrivateIp(address, this.config.allowedPrivateNetworks)) {
						socket.destroy(new Error(`Blocked address: ${address}`));
					}
				}
			}
		});

		return socket;
	}
}

@Injectable()
export class HttpRequestService {
	/**
	 * Get http non-proxy agent (without local address filtering)
	 */
	private readonly httpNative: http.Agent;

	/**
	 * Get https non-proxy agent (without local address filtering)
	 */
	private readonly httpsNative: https.Agent;

	/**
	 * Get http non-proxy agent
	 */
	private readonly http: http.Agent;

	/**
	 * Get https non-proxy agent
	 */
	private readonly https: https.Agent;

	/**
	 * Get http proxy or non-proxy agent
	 */
	public readonly httpAgent: http.Agent;

	/**
	 * Get https proxy or non-proxy agent
	 */
	public readonly httpsAgent: https.Agent;

	/**
	 * send() の事前 SSRF チェックで使う DNS リゾルバ (結果は 1h キャッシュ)。
	 */
	private readonly dnsCache: CacheableLookup;

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		const cache = new CacheableLookup({
			maxTtl: 3600,	// 1hours
			errorTtl: 30,	// 30secs
			lookup: false,	// nativeのdns.lookupにfallbackしない
		});
		this.dnsCache = cache;

		const agentOption = {
			keepAlive: true,
			keepAliveMsecs: 30 * 1000,
			lookup: cache.lookup as unknown as net.LookupFunction,
			localAddress: config.outgoingAddress,
		};

		this.httpNative = new http.Agent(agentOption);

		this.httpsNative = new https.Agent(agentOption);

		this.http = new HttpRequestServiceAgent(config, agentOption);

		this.https = new HttpsRequestServiceAgent(config, agentOption);

		const maxSockets = Math.max(256, config.deliverJobConcurrency ?? 128);

		this.httpAgent = config.proxy
			? new HttpProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: config.proxy,
				localAddress: config.outgoingAddress,
			})
			: this.http;

		this.httpsAgent = config.proxy
			? new HttpsProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: config.proxy,
				localAddress: config.outgoingAddress,
			})
			: this.https;
	}

	/**
	 * Get agent by URL
	 * @param url URL
	 * @param bypassProxy Always bypass proxy
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentByUrl(url: URL, bypassProxy = false, isLocalAddressAllowed = false): http.Agent | https.Agent {
		if (bypassProxy || (this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			if (isLocalAddressAllowed) {
				return url.protocol === 'http:' ? this.httpNative : this.httpsNative;
			}
			return url.protocol === 'http:' ? this.http : this.https;
		} else {
			if (isLocalAddressAllowed && (!this.config.proxy)) {
				return url.protocol === 'http:' ? this.httpNative : this.httpsNative;
			}
			return url.protocol === 'http:' ? this.httpAgent : this.httpsAgent;
		}
	}

	/**
	 * Get agent for http by URL
	 * @param url URL
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentForHttp(url: URL, isLocalAddressAllowed = false): http.Agent {
		if ((this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			return isLocalAddressAllowed
				? this.httpNative
				: this.http;
		} else {
			return this.httpAgent;
		}
	}

	/**
	 * Get agent for https by URL
	 * @param url URL
	 * @param isLocalAddressAllowed
	 */
	@bindThis
	public getAgentForHttps(url: URL, isLocalAddressAllowed = false): https.Agent {
		if ((this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			return isLocalAddressAllowed
				? this.httpsNative
				: this.https;
		} else {
			return this.httpsAgent;
		}
	}

	/**
	 * fetch() 経路の SSRF 防御。宛先ホスト名を事前に DNS 解決し、解決先が private / non-unicast なら例外を投げる。
	 *
	 * Bun の node:http compat 層はカスタム Agent.createConnection を呼ばないため、Agent クラス側の
	 * private-IP ブロックは Bun ランタイムでは機能しない。そこで fetch を投げる前にこの事前チェックで防ぐ。
	 * 解決とその後の fetch は別々に名前解決するため DNS rebinding の TOCTOU 窓は残るが (dnsCache により
	 * 実質縮小される)、宛先への直接的な private-IP アクセスは確実に遮断できる。
	 * `getAgentByUrl` 等 got/S3 経路は Node 実行時 (テスト) には従来どおり socket レベルで遮断される。
	 */
	@bindThis
	public async assertUrlAllowed(url: URL, isLocalAddressAllowed = false): Promise<void> {
		if (isLocalAddressAllowed) return;
		if (process.env.NODE_ENV !== 'production') return;

		const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '');

		let addresses: string[];
		if (ipaddr.isValid(host)) {
			addresses = [host];
		} else {
			addresses = await new Promise<string[]>((resolve, reject) => {
				this.dnsCache.lookup(host, { all: true }, (err, result) => {
					if (err) return reject(err);
					const entries = Array.isArray(result) ? result : [result];
					resolve(entries.map(e => (typeof e === 'string' ? e : e.address)));
				});
			});
		}

		for (const address of addresses) {
			if (ipaddr.isValid(address) && isPrivateIp(address, this.config.allowedPrivateNetworks)) {
				throw new StatusError(`Blocked address: ${address}`, 403, 'Blocked');
			}
		}
	}

	@bindThis
	public async getActivityJson(url: string, isLocalAddressAllowed = false, allowSoftfail: FetchAllowSoftFailMask = FetchAllowSoftFailMask.Strict): Promise<IObject> {
		const res = await this.send(url, {
			method: 'GET',
			headers: {
				Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
			},
			timeout: 5000,
			size: 1024 * 256,
			isLocalAddressAllowed: isLocalAddressAllowed,
		}, {
			throwErrorWhenResponseNotOk: true,
			validators: [validateContentTypeSetAsActivityPub],
		});

		const finalUrl = res.url; // redirects may have been involved
		const activity = await res.json() as IObject;

		assertActivityMatchesUrl(url, activity, finalUrl, allowSoftfail);

		return activity;
	}

	@bindThis
	public async getJson<T = unknown>(url: string, accept = 'application/json, */*', headers?: Record<string, string>, isLocalAddressAllowed = false): Promise<T> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			size: 1024 * 256,
			isLocalAddressAllowed: isLocalAddressAllowed,
		});

		return await res.json() as T;
	}

	@bindThis
	public async getHtml(url: string, accept = 'text/html, */*', headers?: Record<string, string>, isLocalAddressAllowed = false): Promise<string> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			isLocalAddressAllowed: isLocalAddressAllowed,
		});

		return await res.text();
	}

	/**
	 * グローバル fetch でリダイレクトを手動追跡し、各ホップの宛先を assertUrlAllowed で検査する。
	 *
	 * fetch の `redirect: 'follow'` に任せると、リダイレクト先が assertUrlAllowed を通らず、Bun では
	 * Agent の socket レベル遮断も効かないため、`302 -> http://169.254.169.254/` 等で private アドレスへ
	 * 誘導する SSRF が成立してしまう。そのため `redirect: 'manual'` で 1 ホップずつ検査しながら追跡する。
	 * メソッド/ボディの引き継ぎは WHATWG fetch の既定と同じ (303 と POST への 301/302 は GET 化して body を落とす)。
	 */
	@bindThis
	private async fetchFollowingRedirects(
		initialUrl: string,
		baseInit: { method: string; headers: Record<string, string>; body: RequestInit['body']; signal: AbortSignal },
		isLocalAddressAllowed: boolean,
	): Promise<Response> {
		let currentUrl = new URL(initialUrl);
		let method = baseInit.method;
		let body = baseInit.body;
		const headers = { ...baseInit.headers };

		for (let redirects = 0; ; redirects++) {
			await this.assertUrlAllowed(currentUrl, isLocalAddressAllowed);

			// proxy 経由の宛先解決は proxy 側が行うため、bypass 対象や proxyBypassHosts は素通しにする。
			const useProxy = this.config.proxy != null
				&& !(this.config.proxyBypassHosts ?? []).includes(currentUrl.hostname);

			const init: RequestInit & { proxy?: string } = {
				method,
				headers,
				body,
				redirect: 'manual',
				signal: baseInit.signal,
			};
			if (useProxy) init.proxy = this.config.proxy;

			const res = await fetch(currentUrl, init);

			const location = res.headers.get('location');
			if (!REDIRECT_STATUSES.has(res.status) || location == null) {
				return res;
			}

			if (redirects >= MAX_REDIRECTS) {
				await res.body?.cancel().catch(() => {});
				throw new StatusError('Too many redirects', 400, 'Too Many Redirects');
			}

			const nextUrl = new URL(location, currentUrl);
			// リダイレクトレスポンス自体のボディは不要なので破棄し、keep-alive ソケットを解放する。
			await res.body?.cancel().catch(() => {});

			// メソッド/ボディの変換 (WHATWG fetch 準拠)。
			if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
				method = 'GET';
				body = undefined;
				for (const h of CONTENT_HEADERS) deleteHeaderCaseInsensitive(headers, h);
			}

			// cross-origin リダイレクトでは資格情報を引き継がない。
			if (nextUrl.origin !== currentUrl.origin) {
				deleteHeaderCaseInsensitive(headers, 'authorization');
				deleteHeaderCaseInsensitive(headers, 'cookie');
			}

			currentUrl = nextUrl;
		}
	}

	@bindThis
	public async send(
		url: string,
		args: {
			method?: string,
			body?: RequestInit['body'],
			headers?: Record<string, string>,
			timeout?: number,
			size?: number,
			isLocalAddressAllowed?: boolean,
		} = {},
		extra: HttpRequestSendOptions = {
			throwErrorWhenResponseNotOk: true,
			validators: [],
		},
	): Promise<HttpRequestSendResponse> {
		const timeout = args.timeout ?? 5000;
		const isLocalAddressAllowed = args.isLocalAddressAllowed ?? false;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		let res: Response;
		let body: Uint8Array;
		try {
			res = await this.fetchFollowingRedirects(url, {
				method: args.method ?? 'GET',
				headers: {
					'User-Agent': this.config.userAgent,
					...(args.headers ?? {}),
				},
				body: args.body,
				signal: controller.signal,
			}, isLocalAddressAllowed);
			body = await readBodyWithLimit(res, args.size ?? 10 * 1024 * 1024);
		} finally {
			clearTimeout(timer);
		}

		const wrapped = buildSendResponse(res, body);

		if (!res.ok && extra.throwErrorWhenResponseNotOk) {
			throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
		}

		if (res.ok) {
			for (const validator of (extra.validators ?? [])) {
				validator(wrapped);
			}
		}

		return wrapped;
	}
}
