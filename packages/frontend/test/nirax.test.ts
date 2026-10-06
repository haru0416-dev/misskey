/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { defineComponent } from 'vue';
import { Nirax } from '@/lib/nirax.js';
import type { RouteDef } from '@/lib/nirax.js';

const Secret = defineComponent({ name: 'Secret', render: () => null });
const NotFound = defineComponent({ name: 'NotFound', render: () => null });
const componentOf = (route: object) => ('component' in route ? route.component : undefined);

describe('Nirax', () => {
	// ルート定義は全ルーターで共有する静的な配列。未ログイン向けの差し替えで定義を書き換えると、
	// 同じページ内の別のルーター (ログイン済みの側など) でも、そのページが「見つかりません」になる。
	test('未ログイン向けの差し替えで共有のルート定義を書き換えない', () => {
		const routes = [
			{ path: '/secret', component: Secret, loginRequired: true },
			{ path: '/:(*)', component: NotFound },
		];

		const anonymous = new Nirax(routes, '/secret', false, NotFound);
		anonymous.init();
		expect(componentOf(anonymous.current.route)).toBe(NotFound);
		expect(anonymous.current.props.get('showLoginPopup')).toBe(true);

		const loggedIn = new Nirax(routes, '/secret', true, NotFound);
		loggedIn.init();
		expect(componentOf(loggedIn.current.route)).toBe(Secret);
	});

	test('重なるパスは静的部分の多さではなく宣言順で選ぶ', () => {
		const routes = [
			{ path: '/:id', component: Secret },
			{ path: '/fixed', component: NotFound },
		];
		const router = new Nirax(routes, '/fixed', true, NotFound);
		expect(router.current.route).toBe(routes[0]);
		expect([...router.current.props]).toEqual([['id', 'fixed']]);

		const reversed = new Nirax([...routes].reverse(), '/fixed', true, NotFound);
		expect(reversed.current.route).toBe(routes[1]);
		expect([...reversed.current.props]).toEqual([]);
	});

	test.each([
		['/', '/', []],
		['/', '////', []],
		['/:id?', '/', []],
		['/:id?/:other?', '/', []],
		['/:id?/fixed', '/fixed', null],
		['/:id?/fixed', '/value/fixed', [['id', 'value']]],
		['/item/:id', '//item///a%2Fb//', [['id', 'a/b']]],
		['/@:user', '/@alice', [['user', 'alice']]],
		['/@:user', '/@', [['user', '']]],
		['/@:user?', '/', null],
		['/@:user', '/%40alice', null],
		['/:tail(*)', '/', null],
		['/:tail(*)?', '/', []],
		['/:tail(*)', '/a//b%2Fc/', [['tail', 'a/b/c']]],
		['/@:tail(*)/ignored', '/anything/else', [['tail', 'anything/else']]],
		['/:id/:id', '/first/last', [['id', 'last']]],
		['/literal/', '/literal', []],
	] as [string, string, [string, string][] | null][])('パス %s の境界 %s を維持する', (routePath, fullPath, props) => {
		const route = { path: routePath, component: Secret };
		const router = new Nirax([route, { path: '/:(*)', component: NotFound }], '/initial', true, NotFound);
		const result = router.resolve(fullPath);
		if (props === null) {
			expect(result?.route).not.toBe(route);
		} else {
			expect(result?.route).toBe(route);
			expect([...(result?.props ?? [])]).toEqual(props);
		}
	});

	test('親と空の子ルートはそれぞれの props を持ち、query と hash は末端だけに渡す', () => {
		const routes = [
			{
				path: '/parent/:parent',
				component: Secret,
				query: { q: 'parentQuery' },
				hash: 'parentHash',
				children: [
					{
						path: '/',
						component: Secret,
						children: [
							{
								path: '/:optional?',
								component: Secret,
								query: { q: 'query' },
								hash: 'hash',
							},
						],
					},
				],
			},
		];
		const fullPath = '/parent/a%2Fb//?q=value#fragment';
		const router = new Nirax(routes, fullPath, true, NotFound);
		const result = router.current;
		expect(result.route).toBe(routes[0]);
		expect([...result.props]).toEqual([['parent', 'a/b']]);
		expect(result.child?.route).toBe(routes[0]!.children[0]!);
		expect([...(result.child?.props ?? [])]).toEqual([]);
		expect(result.child?.child?.route).toBe(routes[0]!.children[0]!.children[0]!);
		expect([...(result.child?.child?.props ?? [])]).toEqual([
			['hash', 'fragment'],
			['query', 'value'],
		]);
		expect(result.child?.child?._parsedRoute).toEqual({
			fullPath,
			queryString: 'q=value',
			hash: 'fragment',
		});
	});

	test('親の wildcard は残りを消費して空の子ルートへ進む', () => {
		const routes = [
			{
				path: '/files/:tail(*)',
				component: Secret,
				children: [
					{ path: '/unexpected', component: NotFound },
					{ path: '/', component: Secret, query: { q: 'query' } },
				],
			},
		];
		const router = new Nirax(routes, '/files/a//b%2Fc?q=child', true, NotFound);
		expect([...router.current.props]).toEqual([['tail', 'a/b/c']]);
		expect(router.current.child?.route).toBe(routes[0]!.children[1]!);
		expect([...(router.current.child?.props ?? [])]).toEqual([['query', 'child']]);
		expect(router.resolve('/files')).toBeNull();
	});

	test('不一致の子候補や空の children は後続候補へ位置やパラメータを漏らさない', () => {
		const routes = [
			{ path: '/:rejected', component: Secret, children: [{ path: '/missing', component: Secret }] },
			{ path: '/target', component: Secret, children: [] },
			{
				path: '/target',
				component: Secret,
				children: [
					{ path: '/:discarded/wrong', component: Secret },
					{ path: '/:accepted', component: NotFound },
					{ path: '/', component: NotFound },
				],
			},
		];
		const router = new Nirax(routes, '/target/value', true, NotFound);
		expect(router.current.route).toBe(routes[2]);
		expect([...router.current.props]).toEqual([]);
		expect(router.current.child?.route).toBe(routes[2]!.children?.[1]);
		expect([...(router.current.child?.props ?? [])]).toEqual([['accepted', 'value']]);
		const defaultResult = router.resolve('/target');
		expect(defaultResult?.route).toBe(routes[2]);
		expect(defaultResult?.child?.route).toBe(routes[2]!.children?.[2]);
		expect([...(defaultResult?.child?.props ?? [])]).toEqual([]);
	});

	test('hash と query の上書き順、重複 query の末尾値、挿入順を維持する', () => {
		const route = {
			path: '/:value/:keep',
			component: Secret,
			hash: 'value',
			query: { first: 'value', second: 'extra', third: 'value', missing: 'unused' },
		};
		const router = new Nirax([route], '/path/keep?first=first&second=a+b&third=old&third=%252F#hash', true, NotFound);
		expect([...router.current.props]).toEqual([
			['value', '/'],
			['keep', 'keep'],
			['extra', 'a b'],
		]);
		expect(router.current._parsedRoute.queryString).toBe('first=first&second=a+b&third=old&third=%252F');
		expect(router.current._parsedRoute.hash).toBe('hash');
	});

	test('不正な URI と二重エンコードを既存のデコード規則で扱う', () => {
		const route = { path: '/:id', component: Secret, query: { q: 'query' }, hash: 'hash' };
		const router = new Nirax([route], '/%E0%A4%A?q=%25ZZ#%E0%A4%A', true, NotFound);
		expect([...router.current.props]).toEqual([
			['id', '%E0%A4%A'],
			['hash', '%E0%A4%A'],
			['query', '%ZZ'],
		]);
		const encoded = router.resolve('/%252F?q=%252F#%252F');
		expect([...(encoded?.props ?? [])]).toEqual([
			['id', '%2F'],
			['hash', '%2F'],
			['query', '/'],
		]);
		const hashQuery = router.resolve('/value#fragment?not=query');
		expect(hashQuery?._parsedRoute.queryString).toBeNull();
		expect(hashQuery?.props.get('hash')).toBe('fragment?not=query');
	});

	test('共有定義を使うルーターと各解決結果の Map は独立して変更できる', () => {
		const routes = [
			{
				path: '/:parent',
				component: Secret,
				children: [{ path: '/:child', component: Secret }],
			},
		];
		const first = new Nirax(routes, '/one/two', true, NotFound);
		const second = new Nirax(routes, '/one/two', true, NotFound);
		const resolved = first.resolve('/one/two')!;
		first.current.props.set('parent', 'changed');
		first.current.child!.props.set('child', 'changed');
		resolved.props.set('local', 'resolved');
		expect([...second.current.props]).toEqual([['parent', 'one']]);
		expect([...second.current.child!.props]).toEqual([['child', 'two']]);
		expect([...resolved.props]).toEqual([
			['parent', 'one'],
			['local', 'resolved'],
		]);
		expect([...resolved.child!.props]).toEqual([['child', 'two']]);
		expect(routes[0]!.path).toBe('/:parent');
		expect(routes[0]!.children[0]!.path).toBe('/:child');
	});

	test('同じルートへの遷移でも参照と履歴イベントを更新し、同じ URL とキャンセルは更新しない', () => {
		const routes = [{ path: '/:id', component: Secret }];
		const router = new Nirax(routes, '/one', true, NotFound);
		const events: unknown[] = [];
		router.on('change', (ctx) => events.push(['change', ctx.beforeFullPath, ctx.fullPath, ctx.resolved]));
		router.on('push', (ctx) => events.push(['push', ctx.beforeFullPath, ctx.fullPath, ctx.route, ctx.props]));
		router.on('replace', (ctx) => events.push(['replace', ctx.fullPath]));
		router.on('same', () => events.push(['same']));
		router.init();
		expect(events).toEqual([['replace', '/one']]);
		events.length = 0;
		const previous = router.current;
		router.pushByPath('/two?unmapped=1');
		expect(router.current).not.toBe(previous);
		expect(router.currentRef.value).toBe(router.current);
		expect(router.currentRoute.value).toBe(routes[0]);
		expect(events).toEqual([
			['change', '/one', '/two?unmapped=1', router.current],
			['push', '/one', '/two?unmapped=1', routes[0], router.current.props],
		]);
		events.length = 0;
		router.pushByPath('/two?unmapped=1');
		expect(events).toEqual([['same']]);
		const current = router.current;
		router.navHook = () => true;
		router.pushByPath('/cancelled');
		expect(router.current).toBe(current);
		expect(router.getCurrentFullPath()).toBe('/two?unmapped=1');
		events.length = 0;
		router.replaceByPath('/three');
		expect(events).toEqual([
			['change', '/two?unmapped=1', '/three', router.current],
			['replace', '/three'],
		]);
	});

	test('redirect の props と query/hash 引き継ぎ、ログイン差し替え、fallback イベントを維持する', () => {
		const redirectProps: [string, string | boolean][][] = [];
		const routes: RouteDef[] = [
			{ path: '/', component: Secret },
			{
				path: '/old/:id',
				redirect: (props) => {
					redirectProps.push([...props]);
					return '/alias/' + encodeURIComponent(String(props.get('id'))) + '?q=carried#fragment';
				},
			},
			{ path: '/alias/:id', component: Secret, children: [{ path: '/', redirect: '/secret/value' }] },
			{ path: '/secret/:id', component: Secret, loginRequired: true, query: { q: 'query' }, hash: 'hash' },
			{ path: '/:(*)', component: NotFound },
		];
		const router = new Nirax(routes, '/', false, NotFound);
		const events: unknown[] = [];
		router.on('push', (ctx) => events.push(['push', ctx.fullPath, ctx.route, ctx.props]));
		router.on('change', (ctx) => events.push(['change', ctx.fullPath]));
		router.on('forcePush', (ctx) => events.push(['forcePush', ctx]));
		router.on('forceReplace', (ctx) => events.push(['forceReplace', ctx]));
		router.pushByPath('/old/a%2Fb');
		expect(redirectProps).toEqual([[['id', 'a/b']]]);
		expect(router.getCurrentFullPath()).toBe('/secret/value?q=carried#fragment');
		expect(router.current.redirected).toBe(true);
		expect(componentOf(router.current.route)).toBe(NotFound);
		expect(componentOf(routes[3]!)).toBe(Secret);
		expect([...router.current.props]).toEqual([
			['id', 'value'],
			['hash', 'fragment'],
			['query', 'carried'],
			['showLoginPopup', true],
		]);
		expect(events).toEqual([
			['change', '/secret/value?q=carried#fragment'],
			['push', '/secret/value?q=carried#fragment', routes[3], router.current.props],
		]);
		events.length = 0;
		const current = router.current;
		router.pushByPath('/unknown/path');
		router.replaceByPath('/unknown/path');
		expect(router.current).toBe(current);
		expect(events).toEqual([
			['forcePush', { onInit: false, fullPath: '/unknown/path' }],
			['forceReplace', { onInit: false, fullPath: '/unknown/path' }],
		]);
		const fallback = new Nirax(routes, '/unknown/path', true, NotFound);
		fallback.on('forceReplace', (ctx) => events.push(['initForceReplace', ctx]));
		fallback.on('replace', (ctx) => events.push(['initReplace', ctx.fullPath]));
		fallback.init(true);
		expect(events.slice(2)).toEqual([
			['initForceReplace', { onInit: true, fullPath: '/unknown/path' }],
			['initReplace', '/unknown/path'],
		]);
	});

	test('push と replace はパラメータ、任意パラメータ、query/hash を組み立てる', () => {
		const routes = [{ path: '/page/:id/:optional?', component: Secret, query: { q: 'query' }, hash: 'hash' }];
		const router = new Nirax(routes, '/page/initial', true, NotFound);
		router.push('/page/:id/:optional?', { params: { id: 'a/b' }, query: { q: 'a b' }, hash: 'a/b' });
		expect(router.getCurrentFullPath()).toBe('/page/a%2Fb?q=a+b#a%2Fb');
		expect([...router.current.props]).toEqual([
			['id', 'a/b'],
			['hash', 'a/b'],
			['query', 'a b'],
		]);
		router.replace('/page/:id/:optional?', { params: { id: 'next', optional: 'tail' } });
		expect(router.getCurrentFullPath()).toBe('/page/next/tail');
		expect([...router.current.props]).toEqual([
			['id', 'next'],
			['optional', 'tail'],
		]);
	});
});
