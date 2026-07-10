/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { ComputedRef, Ref, ShallowRef, UnwrapRef } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import type { MisskeyEntity } from '@shared/utility/misskey-entity.js';

export type { MisskeyEntity };

const MAX_ITEMS = 30;
const MAX_QUEUE_ITEMS = 100;
const FIRST_FETCH_LIMIT = 15;
const SECOND_FETCH_LIMIT = 30;

type AbsEndpointType = {
	req: unknown;
	res: unknown;
};

type FilterByEpRes<E extends Record<string, AbsEndpointType>> = {
	[K in keyof E]: E[K]['res'] extends Array<{ id: string }> ? K : never;
}[keyof E];
export type PaginatorCompatibleEndpointPaths = FilterByEpRes<Misskey.Endpoints>;
export type PaginatorCompatibleEndpoints = {
	[K in PaginatorCompatibleEndpointPaths]: Misskey.Endpoints[K];
};

export type ExtractorFunction<P extends IPaginator, T> = (item: UnwrapRef<P['items']>[number]) => T;

export interface IPaginator<T = unknown, _T = T & MisskeyEntity> {
	/**
	 * 外部から直接操作しないでください
	 */
	items: Ref<_T[]> | ShallowRef<_T[]>;
	queuedAheadItemsCount: Ref<number>;
	fetching: Ref<boolean>;
	fetchingOlder: Ref<boolean>;
	fetchingNewer: Ref<boolean>;
	canFetchOlder: Ref<boolean>;
	canFetchNewer: Ref<boolean>;
	canSearch: boolean;
	error: Ref<boolean>;
	computedParams: ComputedRef<Misskey.Endpoints[PaginatorCompatibleEndpointPaths]['req'] | null | undefined> | null;
	initialId: MisskeyEntity['id'] | null;
	initialDate: number | null;
	initialDirection: 'newer' | 'older';
	noPaging: boolean;
	searchQuery: Ref<null | string>;
	order: Ref<'newest' | 'oldest'>;

	init(): Promise<void>;
	reload(): Promise<void>;
	fetchOlder(): Promise<void>;
	fetchNewer(options?: { toQueue?: boolean }): Promise<void>;
	trim(trigger?: boolean): void;
	unshiftItems(newItems: _T[]): void;
	pushItems(oldItems: _T[]): void;
	prepend(item: _T): void;
	enqueue(item: _T): void;
	releaseQueue(): void;
	removeItem(id: string): void;
	updateItem(id: string, updater: (item: _T) => _T): void;
}

export class Paginator<
	Endpoint extends PaginatorCompatibleEndpointPaths,
	E extends PaginatorCompatibleEndpoints[Endpoint] = PaginatorCompatibleEndpoints[Endpoint],
	T extends E['res'][number] & MisskeyEntity = E['res'][number] & MisskeyEntity,
	SRef extends boolean = true,
> implements IPaginator {
	/**
	 * 外部から直接操作しないでください
	 */
	public items: SRef extends true ? ShallowRef<T[]> : Ref<T[]>;

	public queuedAheadItemsCount = ref(0);
	public fetching = ref(true);
	public fetchingOlder = ref(false);
	public fetchingNewer = ref(false);
	public canFetchOlder = ref(false);
	public canFetchNewer = ref(false);
	public canSearch = false;
	public error = ref(false);
	private endpoint: Endpoint;
	private limit: number;
	private params: E['req'] | (() => E['req']);
	public computedParams: ComputedRef<E['req'] | null | undefined> | null;
	public initialId: MisskeyEntity['id'] | null = null;
	public initialDate: number | null = null;

	// 初回読み込み時、initialIdを基準にそれより新しいものを取得するか古いものを取得するか
	// newer: initialIdより新しいものを取得する
	// older: initialIdより古いものを取得する (default)
	public initialDirection: 'newer' | 'older';

	private offsetMode: boolean;
	public noPaging: boolean;
	public searchQuery = ref<null | string>('');
	private searchParamName: keyof E['req'] | 'search';
	private canFetchDetection: 'safe' | 'limit' | null = null;
	private aheadQueue: T[] = [];
	private initAbortController: AbortController | null = null;
	private olderAbortController: AbortController | null = null;
	private newerAbortController: AbortController | null = null;

	// 配列内の要素をどのような順序で並べるか
	// newest: 新しいものが先頭 (default)
	// oldest: 古いものが先頭
	// NOTE: このようなプロパティを用意してこっち側で並びを管理せずに、Setで持っておき参照者側が好きに並び変えるような設計の方がすっきりしそうなものの、Vueのレンダリングのたびに並び替え処理が発生することになったりしそうでパフォーマンス上の懸念がある
	public order: Ref<'newest' | 'oldest'>;

	constructor(
		endpoint: Endpoint,
		props: {
			limit?: number;
			params?: E['req'] | (() => E['req']);
			computedParams?: ComputedRef<E['req'] | null | undefined>;

			/**
			 * 検索APIのような、ページング不可なエンドポイントを利用する場合
			 * (そのようなAPIをこの関数で使うのは若干矛盾してるけど)
			 */
			noPaging?: boolean;

			offsetMode?: boolean;

			initialId?: MisskeyEntity['id'];
			initialDate?: number | null;
			initialDirection?: 'newer' | 'older';

			order?: 'newest' | 'oldest';

			// 一部のAPIはさらに遡れる場合でもパフォーマンス上の理由でlimit以下の結果を返す場合があり、その場合はsafe、それ以外はlimitにすることを推奨
			canFetchDetection?: 'safe' | 'limit';

			useShallowRef?: SRef;

			canSearch?: boolean;
			searchParamName?: keyof E['req'];
		},
	) {
		this.endpoint = endpoint;
		const useShallowRef = (props.useShallowRef ?? true) as SRef;
		if (useShallowRef) {
			this.items = shallowRef<T[]>([]);
		} else {
			this.items = ref<T[]>([]) as Ref<T[]>;
		}

		this.limit = props.limit ?? FIRST_FETCH_LIMIT;
		this.params = props.params ?? {};
		this.computedParams = props.computedParams ?? null;
		this.order = ref(props.order ?? 'newest');
		this.initialId = props.initialId ?? null;
		this.initialDate = props.initialDate ?? null;
		this.initialDirection = props.initialDirection ?? 'older';
		this.canFetchDetection = props.canFetchDetection ?? null;
		this.noPaging = props.noPaging ?? false;
		this.offsetMode = props.offsetMode ?? false;
		this.canSearch = props.canSearch ?? false;
		this.searchParamName = props.searchParamName ?? 'search';

		this.getNewestId = this.getNewestId.bind(this);
		this.getOldestId = this.getOldestId.bind(this);
		this.init = this.init.bind(this);
		this.reload = this.reload.bind(this);
		this.fetchOlder = this.fetchOlder.bind(this);
		this.fetchNewer = this.fetchNewer.bind(this);
		this.unshiftItems = this.unshiftItems.bind(this);
		this.pushItems = this.pushItems.bind(this);
		this.prepend = this.prepend.bind(this);
		this.enqueue = this.enqueue.bind(this);
		this.releaseQueue = this.releaseQueue.bind(this);
		this.removeItem = this.removeItem.bind(this);
		this.updateItem = this.updateItem.bind(this);
	}

	private getNewestId(): string | null | undefined {
		return this.findExtremeId(this.aheadQueue.length > 0 ? this.aheadQueue : this.items.value, 'newest');
	}

	private getOldestId(): string | null | undefined {
		return this.findExtremeId(this.items.value, 'oldest');
	}

	private findExtremeId(items: readonly T[], direction: 'newest' | 'oldest'): string | undefined {
		let result: string | undefined;
		for (const item of items) {
			const id = item.id;
			if (result == null || (direction === 'newest' ? id > result : id < result)) result = id;
		}
		return result;
	}

	private getUniqueItems(items: readonly T[], existingItems: readonly T[]): T[] {
		const ids = new Set(existingItems.map((item) => item.id));
		const uniqueItems: T[] = [];
		for (const item of items) {
			if (ids.has(item.id)) continue;
			ids.add(item.id);
			uniqueItems.push(item);
		}
		return uniqueItems;
	}

	private abortPageRequests(): void {
		this.olderAbortController?.abort();
		this.newerAbortController?.abort();
		this.olderAbortController = null;
		this.newerAbortController = null;
		this.fetchingOlder.value = false;
		this.fetchingNewer.value = false;
	}

	public async init(): Promise<void> {
		this.initAbortController?.abort();
		this.abortPageRequests();
		const abortController = new AbortController();
		this.initAbortController = abortController;
		this.items.value = [];
		this.aheadQueue = [];
		this.queuedAheadItemsCount.value = 0;
		this.fetching.value = true;

		const data: E['req'] = {
			...(typeof this.params === 'function' ? this.params() : this.params),
			...(this.computedParams ? this.computedParams.value : {}),
			...(this.searchQuery.value != null && this.searchQuery.value.trim() !== ''
				? { [this.searchParamName]: this.searchQuery.value }
				: {}),
			limit: this.limit ?? FIRST_FETCH_LIMIT,
			allowPartial: true,
			...(this.initialId == null && this.initialDate == null && this.initialDirection === 'newer'
				? {
						sinceId: '0',
					}
				: this.initialDirection === 'newer'
					? {
							sinceId: this.initialId ?? undefined,
							sinceDate: this.initialDate ?? undefined,
						}
					: (this.initialId || this.initialDate) && this.initialDirection === 'older'
						? {
								untilId: this.initialId ?? undefined,
								untilDate: this.initialDate ?? undefined,
							}
						: {}),
		};

		let apiRes: T[];
		try {
			apiRes = (await misskeyApi(this.endpoint, data, undefined, abortController.signal)) as T[];
		} catch {
			if (!abortController.signal.aborted) this.error.value = true;
			return;
		} finally {
			if (this.initAbortController === abortController) {
				this.initAbortController = null;
				this.fetching.value = false;
			}
		}
		if (abortController.signal.aborted) return;

		// 逆順で返ってくるので
		if ((this.initialId || this.initialDate) && this.initialDirection === 'newer') {
			apiRes.reverse();
		}

		for (let i = 0; i < apiRes.length; i++) {
			const item = apiRes[i];
			if (i === 3) item._shouldInsertAd_ = true;
		}

		this.pushItems(apiRes);

		if (this.canFetchDetection === 'limit') {
			if (apiRes.length < this.limit) {
				(this.initialDirection === 'older' ? this.canFetchOlder : this.canFetchNewer).value = false;
			} else {
				(this.initialDirection === 'older' ? this.canFetchOlder : this.canFetchNewer).value = true;
			}
		} else if (this.canFetchDetection === 'safe' || this.canFetchDetection == null) {
			if (apiRes.length === 0 || this.noPaging) {
				(this.initialDirection === 'older' ? this.canFetchOlder : this.canFetchNewer).value = false;
			} else {
				(this.initialDirection === 'older' ? this.canFetchOlder : this.canFetchNewer).value = true;
			}
		}

		this.error.value = false;
	}

	public reload(): Promise<void> {
		return this.init();
	}

	public async fetchOlder(): Promise<void> {
		if (!this.canFetchOlder.value || this.fetching.value || this.fetchingOlder.value || this.items.value.length === 0)
			return;
		const abortController = new AbortController();
		this.olderAbortController = abortController;
		this.fetchingOlder.value = true;

		const data: E['req'] = {
			...(typeof this.params === 'function' ? this.params() : this.params),
			...(this.computedParams ? this.computedParams.value : {}),
			...(this.searchQuery.value != null && this.searchQuery.value.trim() !== ''
				? { [this.searchParamName]: this.searchQuery.value }
				: {}),
			limit: SECOND_FETCH_LIMIT,
			...(this.offsetMode
				? {
						offset: this.items.value.length,
					}
				: {
						untilId: this.getOldestId(),
					}),
		};

		let apiRes: T[];
		try {
			apiRes = await misskeyApi<T[]>(this.endpoint, data, undefined, abortController.signal);
		} catch {
			return;
		} finally {
			if (this.olderAbortController === abortController) {
				this.olderAbortController = null;
				this.fetchingOlder.value = false;
			}
		}
		if (abortController.signal.aborted) return;

		for (let i = 0; i < apiRes.length; i++) {
			const item = apiRes[i];
			if (i === 10) item._shouldInsertAd_ = true;
		}

		if (this.order.value === 'oldest') {
			this.unshiftItems(apiRes.toReversed(), false);
		} else {
			this.pushItems(apiRes);
		}

		if (this.canFetchDetection === 'limit') {
			if (apiRes.length < SECOND_FETCH_LIMIT) {
				this.canFetchOlder.value = false;
			} else {
				this.canFetchOlder.value = true;
			}
		} else if (this.canFetchDetection === 'safe' || this.canFetchDetection == null) {
			if (apiRes.length === 0) {
				this.canFetchOlder.value = false;
			} else {
				this.canFetchOlder.value = true;
			}
		}
	}

	public async fetchNewer(
		options: {
			toQueue?: boolean;
		} = {},
	): Promise<void> {
		if (this.fetching.value || this.fetchingNewer.value || this.items.value.length === 0) return;
		const abortController = new AbortController();
		this.newerAbortController = abortController;
		this.fetchingNewer.value = true;

		const data: E['req'] = {
			...(typeof this.params === 'function' ? this.params() : this.params),
			...(this.computedParams ? this.computedParams.value : {}),
			...(this.searchQuery.value != null && this.searchQuery.value.trim() !== ''
				? { [this.searchParamName]: this.searchQuery.value }
				: {}),
			limit: SECOND_FETCH_LIMIT,
			...(this.offsetMode
				? {
						offset: this.items.value.length,
					}
				: {
						sinceId: this.getNewestId(),
					}),
		};

		let apiRes: T[];
		try {
			apiRes = await misskeyApi<T[]>(this.endpoint, data, undefined, abortController.signal);
		} catch {
			return;
		} finally {
			if (this.newerAbortController === abortController) {
				this.newerAbortController = null;
				this.fetchingNewer.value = false;
			}
		}
		if (abortController.signal.aborted) return;

		if (apiRes.length === 0) {
			this.canFetchNewer.value = false;
			// 余計なre-renderを防止するためここで終了
			return;
		}

		if (options.toQueue) {
			const queuedItems = this.getUniqueItems(apiRes.toReversed(), [...this.aheadQueue, ...this.items.value]);
			this.aheadQueue = [...queuedItems, ...this.aheadQueue].slice(0, MAX_QUEUE_ITEMS);
			this.queuedAheadItemsCount.value = this.aheadQueue.length;
		} else {
			if (this.order.value === 'oldest') {
				this.pushItems(apiRes);
			} else {
				this.unshiftItems(apiRes.toReversed(), false);
			}
		}

		if (this.canFetchDetection === 'limit') {
			if (apiRes.length < SECOND_FETCH_LIMIT) {
				this.canFetchNewer.value = false;
			} else {
				this.canFetchNewer.value = true;
			}
		}
		// canFetchDetectionが'safe'の場合・apiRes.length === 0 の場合は apiRes.length === 0 の場合に canFetchNewer.value = false になるが、
		// 余計な re-render を防ぐために上部で処理している。そのため、ここでは何もしない
	}

	public trim(_trigger = true): void {
		if (this.items.value.length >= MAX_ITEMS) this.canFetchOlder.value = true;
		if (this.items.value.length > MAX_ITEMS) this.items.value = this.items.value.slice(0, MAX_ITEMS);
	}

	public unshiftItems(newItems: T[], trim = true): void {
		const uniqueItems = this.getUniqueItems(newItems, this.items.value);
		if (uniqueItems.length === 0) return;
		let items = [...uniqueItems, ...this.items.value];
		if (trim && items.length >= MAX_ITEMS) this.canFetchOlder.value = true;
		if (trim && items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
		this.items.value = items;
	}

	public pushItems(oldItems: T[]): void {
		const uniqueItems = this.getUniqueItems(oldItems, this.items.value);
		if (uniqueItems.length === 0) return;
		this.items.value = [...this.items.value, ...uniqueItems];
	}

	public prepend(item: T): void {
		if (this.items.value.some((x) => x.id === item.id)) return;
		const items = [item, ...this.items.value];
		if (items.length >= MAX_ITEMS) this.canFetchOlder.value = true;
		this.items.value = items.length > MAX_ITEMS ? items.slice(0, MAX_ITEMS) : items;
	}

	public enqueue(item: T): void {
		if (this.aheadQueue.some((queuedItem) => queuedItem.id === item.id)) return;
		if (this.items.value.some((currentItem) => currentItem.id === item.id)) return;
		this.aheadQueue = [item, ...this.aheadQueue].slice(0, MAX_QUEUE_ITEMS);
		this.queuedAheadItemsCount.value = this.aheadQueue.length;
	}

	public releaseQueue(): void {
		if (this.aheadQueue.length === 0) return;
		const queuedItems = this.aheadQueue;
		this.aheadQueue = [];
		this.queuedAheadItemsCount.value = 0;
		this.unshiftItems(queuedItems);
	}

	public removeItem(id: string): void {
		const items = this.items.value.filter((item) => item.id !== id);
		if (items.length !== this.items.value.length) this.items.value = items;

		const queuedItems = this.aheadQueue.filter((item) => item.id !== id);
		if (queuedItems.length !== this.aheadQueue.length) {
			this.aheadQueue = queuedItems;
			this.queuedAheadItemsCount.value = queuedItems.length;
		}
	}

	public updateItem(id: string, updater: (item: T) => T): void {
		const index = this.items.value.findIndex((x) => x.id === id);
		if (index !== -1) {
			const items = [...this.items.value];
			items[index] = updater(items[index]!);
			this.items.value = items;
			return;
		}

		const queuedIndex = this.aheadQueue.findIndex((item) => item.id === id);
		if (queuedIndex !== -1) {
			const queuedItems = [...this.aheadQueue];
			queuedItems[queuedIndex] = updater(queuedItems[queuedIndex]!);
			this.aheadQueue = queuedItems;
		}
	}
}
