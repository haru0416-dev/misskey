/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { beforeAll, describe, expect, test } from 'vitest';
import { api, host, origin, relativeFetch, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('.well-known', () => {
	let alice: misskey.entities.User;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
		},
		1000 * 60 * 2,
	);

	// .well-known の応答は webfinger を除いて同じヘッダー生成を通るので、CORS はここと webfinger で見る。
	test('nodeinfo', async () => {
		const res = await relativeFetch('.well-known/nodeinfo');
		assert.ok(res.ok);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

		const nodeInfo = await res.json();
		expect(nodeInfo).toStrictEqual({
			links: [
				{
					rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
					href: `${origin}/nodeinfo/2.1`,
				},
				{
					rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
					href: `${origin}/nodeinfo/2.0`,
				},
			],
		});
	});

	test('webfinger', async () => {
		const preflight = await relativeFetch(`.well-known/webfinger?resource=acct:alice@${host}`, {
			method: 'options',
			headers: {
				'Access-Control-Request-Method': 'GET',
				Origin: 'http://example.com',
			},
		});
		assert.ok(preflight.ok);
		expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Accept');

		const res = await relativeFetch(`.well-known/webfinger?resource=acct:alice@${host}`);
		assert.ok(res.ok);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(res.headers.get('Access-Control-Expose-Headers')).toBe('Vary');
		// Accept で表現が変わる。応答は gzip にもなるので Accept-Encoding も並ぶ。
		expect(
			res.headers
				.get('Vary')
				?.split(',')
				.map((v) => v.trim()),
		).toEqual(['Accept', 'Accept-Encoding']);

		const webfinger = await res.json();

		expect(webfinger).toStrictEqual({
			subject: `acct:alice@${host}`,
			links: [
				{
					rel: 'self',
					type: 'application/activity+json',
					href: `${origin}/users/${alice.id}`,
				},
				{
					rel: 'http://webfinger.net/rel/profile-page',
					type: 'text/html',
					href: `${origin}/@alice`,
				},
			],
		});
	});

	test('host-meta', async () => {
		const res = await relativeFetch('.well-known/host-meta');
		assert.ok(res.ok);
		expect(await res.text()).toContain(`template="${origin}/.well-known/webfinger?resource={uri}"`);
	});

	test('host-meta.json', async () => {
		const res = await relativeFetch('.well-known/host-meta.json');
		assert.ok(res.ok);

		const hostMeta = await res.json();
		expect(hostMeta).toStrictEqual({
			links: [
				{
					rel: 'lrdd',
					type: 'application/jrd+json',
					template: `${origin}/.well-known/webfinger?resource={uri}`,
				},
			],
		});
	});

	test('oauth-authorization-server', async () => {
		const res = await relativeFetch('.well-known/oauth-authorization-server');
		assert.ok(res.ok);

		const serverInfo = (await res.json()) as any;
		expect(serverInfo.issuer).toBe(origin);
		expect(serverInfo.authorization_endpoint).toBe(`${origin}/oauth/authorize`);
		expect(serverInfo.token_endpoint).toBe(`${origin}/oauth/token`);
	});

	test('change-password はセキュリティ設定へ案内する', async () => {
		const res = await relativeFetch('.well-known/change-password', { redirect: 'manual' });
		expect(res.status).toBe(302);
		expect(new URL(res.headers.get('Location')!, origin).pathname).toBe('/settings/security');
	});

	// nodeinfo の 2.0 と 2.1 は同じヘッダー生成を通るので、CORS は 2.1 だけで見る。
	test('nodeinfo 2.1', async () => {
		const res = await relativeFetch('nodeinfo/2.1');
		assert.ok(res.ok);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

		const nodeInfo = (await res.json()) as any;
		expect(nodeInfo.software.name).toBe('toneriko');
		expect(nodeInfo.software.homepage).toBe(nodeInfo.metadata.repositoryUrl);
		expect(nodeInfo.software.repository).toBe(nodeInfo.metadata.repositoryUrl);
	});

	test('nodeinfo 2.0', async () => {
		const res = await relativeFetch('nodeinfo/2.0');
		assert.ok(res.ok);

		const nodeInfo = (await res.json()) as any;
		expect(nodeInfo.software.name).toBe('toneriko');
		expect(nodeInfo.software.homepage).toBe(nodeInfo.metadata.repositoryUrl);
	});
});
