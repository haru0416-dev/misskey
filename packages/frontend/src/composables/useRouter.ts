/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject } from 'vue';
import type { Router } from '@/router.js';
import { DI } from '@/di.js';

// router.ts は全ルートの定義を通して画面と機能を読み込む。部品や機能がルーターを使うたびに router.ts を
// import すると循環するので、router.ts が起動時にここへ既定のルーターを登録し、利用側はここから受け取る。
let mainRouter: Router | null = null;

export function registerMainRouter(router: Router): void {
	mainRouter = router;
}

export function getMainRouter(): Router {
	if (mainRouter == null) {
		throw new Error('The main router is not registered. Import @/router.js before using the router.');
	}
	return mainRouter;
}

/** 別ウィンドウなどで提供されたルーターがあればそれを、無ければ既定のルーターを返す。 */
export function useRouter(): Router {
	return inject(DI.router, null) ?? getMainRouter();
}
