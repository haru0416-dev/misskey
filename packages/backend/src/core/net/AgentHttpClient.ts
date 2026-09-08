/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import type { Config } from '@/config.js';

export function createAgentHttpClient(config: Config) {
	const network = config.outboundNetwork;
	const options = {
		keepAlive: true,
		keepAliveMsecs: network.http.keepAliveDurationMs,
		maxSockets: network.http.maximumSockets,
		maxFreeSockets: network.http.maximumFreeSockets,
		timeout: network.http.connectionTimeoutMs,
		localAddress: network.bindAddress,
		family: network.addressFamily === 'ipv4' ? 4 : network.addressFamily === 'ipv6' ? 6 : 0,
	};
	const direct = { http: new http.Agent(options), https: new https.Agent(options) };
	// hpagentはCONNECT用オプションをhttp.requestへ渡すため、送信元指定もここに設定する。
	const proxyRequestOptions = { localAddress: network.bindAddress, family: options.family, headers: {} };
	const proxy = network.proxy.url
		? {
				http: new HttpProxyAgent({
					...options,
					proxy: network.proxy.url,
					proxyRequestOptions,
				}),
				https: new HttpsProxyAgent({
					...options,
					proxy: network.proxy.url,
					proxyRequestOptions,
				}),
			}
		: undefined;

	const agents = [direct.http, direct.https, proxy?.http, proxy?.https];
	// Agentのコンストラクタは0を既定値へ置換するため、待機ソケット数は生成後にも適用する。
	for (const agent of agents) if (agent) agent.maxFreeSockets = network.http.maximumFreeSockets;

	async function request(
		url: URL,
		init: RequestInit & { tls?: { serverName: string } },
		useProxy: boolean,
	): Promise<Response> {
		const body = init.body == null ? undefined : Buffer.from(await new Request(url, init).arrayBuffer());
		const secure = url.protocol === 'https:';
		const agents = useProxy ? proxy! : direct;
		return new Promise((resolve, reject) => {
			const req = (secure ? https : http).request(
				url,
				{
					method: init.method,
					headers: Object.fromEntries(new Headers(init.headers)),
					signal: init.signal ?? undefined,
					agent: secure ? agents.https : agents.http,
					...(init.tls ? { servername: init.tls.serverName } : {}),
				},
				(res) => {
					const headers = new Headers();
					for (let i = 0; i < res.rawHeaders.length; i += 2) headers.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
					const status = res.statusCode!;
					const hasBody = init.method !== 'HEAD' && ![204, 205, 304].includes(status);
					let stream: Readable = res;
					if (hasBody) {
						const encoding = headers.get('content-encoding')?.toLowerCase();
						const decoder =
							encoding === 'gzip'
								? createGunzip()
								: encoding === 'deflate'
									? createInflate()
									: encoding === 'br'
										? createBrotliDecompress()
										: undefined;
						if (decoder) {
							res.on('error', (error) => decoder.destroy(error));
							decoder.on('close', () => res.destroy());
							stream = res.pipe(decoder);
						}
					} else {
						res.resume();
					}
					// Responseのcancelをソケット破棄へ伝え、サイズ超過やリダイレクト時に受信を止める。
					const response = new Response(hasBody ? (Readable.toWeb(stream) as ReadableStream<Uint8Array>) : null, {
						status,
						statusText: res.statusMessage ?? '',
						headers,
					});
					Object.defineProperty(response, 'url', { value: url.href, configurable: true });
					resolve(response);
				},
			);
			req.on('error', reject);
			req.on('timeout', () => req.destroy(new Error('HTTP connection timed out')));
			req.end(body);
		});
	}

	function dispose() {
		for (const agent of agents) agent?.destroy();
	}

	return { request, dispose };
}
