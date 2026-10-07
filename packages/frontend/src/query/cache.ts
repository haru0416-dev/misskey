/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, shallowRef, shallowReadonly } from 'vue';
import { hashKey, QueryObserver } from '@tanstack/vue-query';
import type { QueryKey, QueryObserverResult } from '@tanstack/vue-query';
import { queryClient } from '@/query/client.js';
import { fetchWithUpdates, invalidateQueries } from '@/query/updates.js';

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
		// この query key の GC を無効にし、表示中の singleton を維持する。
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
		const invalidated = queryClient.getQueryState(this.queryKey)?.isInvalidated;
		void queryClient.cancelQueries({ queryKey: this.queryKey, exact: true });
		queryClient.setQueryData(this.queryKey, value);
		if (invalidated) void invalidateQueries({ queryKey: this.queryKey, exact: true });
	}

	public delete(): void {
		void invalidateQueries({ queryKey: this.queryKey, exact: true });
	}

	public dispose(): void {
		this.unsubscribe();
	}
}

export class QueryBackedCache<T> extends QueryCacheView<T> {
	private readonly observer: QueryObserver<T>;
	private readonly result;
	public readonly isFetching;
	public readonly isError;
	private readonly unsubscribeObserver: () => void;
	private readonly queryFn: (signal: AbortSignal) => Promise<T>;

	constructor(
		queryKey: QueryKey,
		queryFn: (signal: AbortSignal) => Promise<T>,
		private readonly staleTime: number,
		options: QueryCacheOptions<T> = {},
	) {
		super(queryKey, options);
		this.queryFn = (signal) => fetchWithUpdates(queryKey, () => queryFn(signal));
		// 未使用の account cache は取得せず、一度表示した一覧は mutation の再取得対象にする。
		this.observer = new QueryObserver<T>(queryClient, {
			queryKey,
			queryFn: ({ signal }) => this.queryFn(signal),
			staleTime,
			enabled: false,
		});
		this.result = shallowRef(this.observer.getCurrentResult());
		this.isFetching = computed(() => this.result.value.isFetching);
		this.isError = computed(() => this.result.value.isError);
		this.unsubscribeObserver = this.observer.subscribe((result) => {
			this.result.value = result;
		});
	}

	private activate(): void {
		this.observer.setOptions({ ...this.observer.options, enabled: true });
	}

	public fetch(): Promise<T> {
		this.activate();
		return queryClient.fetchQuery({
			queryKey: this.queryKey,
			queryFn: ({ signal }) => this.queryFn(signal),
			staleTime: this.staleTime,
		});
	}

	// 画面は失敗を result として表示する。API の利用側には fetch の rejection を維持する。
	public fetchResult(): Promise<QueryObserverResult<T>> {
		this.activate();
		const result = this.observer.getCurrentResult();
		return result.isStale ? this.observer.refetch({ cancelRefetch: false }) : Promise.resolve(result);
	}

	public override dispose(): void {
		this.unsubscribeObserver();
		super.dispose();
	}
}
