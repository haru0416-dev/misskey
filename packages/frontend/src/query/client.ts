/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import type { App } from 'vue';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 1000 * 60 * 30,
			retry: false,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
		mutations: {
			retry: false,
		},
	},
});

export function installQueryClient(app: App): void {
	app.use(VueQueryPlugin, { queryClient });
}
