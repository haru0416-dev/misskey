/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { defineComponent } from 'vue';
import { Nirax } from '@/lib/nirax.js';

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

		expect(componentOf(routes[0]!)).toBe(Secret);
		const loggedIn = new Nirax(routes, '/secret', true, NotFound);
		loggedIn.init();
		expect(componentOf(loggedIn.current.route)).toBe(Secret);
	});
});
