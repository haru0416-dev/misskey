/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef, shallowReadonly } from 'vue';
import { hashKey } from '@tanstack/vue-query';
import type { QueryKey } from '@tanstack/vue-query';
import { queryClient } from '@/query/client.js';

type QueryCacheOptions<T> = {
	initialData?: T;
	updatedAt?: number;
	onUpdate?: (value: T | undefined, updatedAt: number) => void;
};

/** 購読の所有者はdisposeする。ページ全体のcacheもHMRによる置換時には解放する。 */
export class QueryCacheView<T> {
	private readonly data = shallowRef<T>();
	public readonly value = shallowReadonly(this.data);
	private readonly unsubscribe: () => void;

	constructor(
		protected readonly queryKey: QueryKey,
		options: QueryCacheOptions<T> = {},
	) {
		// 表示中のsingletonをGCして別の正本を必要としないよう、所有者の寿命まで保持する。
		queryClient.setQueryDefaults(this.queryKey, { gcTime: Infinity });
		const current = queryClient.getQueryState(this.queryKey);
		if (
			options.initialData !== undefined &&
			(current?.data === undefined || (options.updatedAt ?? 0) > current.dataUpdatedAt)
		) {
			queryClient.setQueryData(this.queryKey, options.initialData, { updatedAt: options.updatedAt ?? 0 });
		}
		this.data.value = queryClient.getQueryData<T>(this.queryKey);
		const queryHash = hashKey(this.queryKey);
		this.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
			if (event.query.queryHash !== queryHash) return;
			if (event.type === 'removed') {
				this.data.value = undefined;
				options.onUpdate?.(undefined, 0);
			} else if (event.type === 'updated' && event.action.type === 'success') {
				const value = event.query.state.data as T;
				this.data.value = value;
				options.onUpdate?.(value, event.query.state.dataUpdatedAt);
			}
		});
		if (this.data.value !== undefined) {
			options.onUpdate?.(this.data.value, queryClient.getQueryState(this.queryKey)?.dataUpdatedAt ?? 0);
		}
	}

	public set(value: T): void {
		queryClient.setQueryData(this.queryKey, value);
	}

	public delete(): void {
		void queryClient.invalidateQueries({ queryKey: this.queryKey, exact: true });
	}

	public dispose(): void {
		this.unsubscribe();
	}
}

export class QueryBackedCache<T> extends QueryCacheView<T> {
	constructor(
		queryKey: QueryKey,
		private readonly queryFn: (signal: AbortSignal) => Promise<T>,
		private readonly staleTime: number,
		options: QueryCacheOptions<T> = {},
	) {
		super(queryKey, options);
	}

	public fetch(): Promise<T> {
		return queryClient.fetchQuery({
			queryKey: this.queryKey,
			queryFn: ({ signal }) => this.queryFn(signal),
			staleTime: this.staleTime,
		});
	}
}
