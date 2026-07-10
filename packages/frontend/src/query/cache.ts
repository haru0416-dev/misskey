/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef } from 'vue';
import type { QueryKey } from '@tanstack/vue-query';
import { queryClient } from '@/query/client.js';

export class QueryBackedCache<T> {
	public readonly value = shallowRef<T>();

	constructor(
		private readonly queryKey: QueryKey,
		private readonly queryFn: (signal: AbortSignal) => Promise<T>,
		private readonly staleTime: number,
	) {
		this.value.value = queryClient.getQueryData<T>(this.queryKey);
		queryClient.getQueryCache().subscribe((event) => {
			const query = queryClient.getQueryCache().find({ queryKey: this.queryKey, exact: true });
			if (query !== event.query) return;
			this.value.value = event.query.state.data as T | undefined;
		});
	}

	public fetch(): Promise<T> {
		return queryClient.fetchQuery({
			queryKey: this.queryKey,
			queryFn: ({ signal }) => this.queryFn(signal),
			staleTime: this.staleTime,
		});
	}

	public set(value: T): void {
		queryClient.setQueryData(this.queryKey, value);
	}

	public delete(): void {
		void queryClient.invalidateQueries({ queryKey: this.queryKey, exact: true });
	}
}
