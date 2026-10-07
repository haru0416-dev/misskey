<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkLoading v-if="fetching"/>

<EmError v-else-if="error" @retry="init()"/>

<div v-else-if="empty" key="_empty_" class="empty">
	<slot name="empty">
		<div class="_fullinfo">
			<div>{{ i18n.ts.nothing }}</div>
		</div>
	</slot>
</div>

<div v-else ref="rootEl">
	<div v-show="pagination.reversed && more" key="_more_" class="_margin">
		<button v-if="!moreFetching" class="_buttonPrimary" :class="$style.more" @click="fetchMoreAhead">
			{{ i18n.ts.loadMore }}
		</button>
		<MkLoading v-else class="loading"/>
	</div>
	<slot :items="Array.from(items.values())" :fetching="fetching || moreFetching"></slot>
	<div v-show="!pagination.reversed && more" key="_more_" class="_margin">
		<button v-if="!moreFetching" class="_buttonRounded _buttonPrimary" :class="$style.more" @click="fetchMore">
			{{ i18n.ts.loadMore }}
		</button>
		<MkLoading v-else class="loading"/>
	</div>
</div>
</template>

<script lang="ts">
import {
	computed,
	isRef,
	nextTick,
	onActivated,
	onBeforeMount,
	onBeforeUnmount,
	onDeactivated,
	ref,
	shallowRef,
	watch,
} from 'vue';
import * as Misskey from 'misskey-js';
import { useDocumentVisibility } from '@/shared/utility/use-document-visibility.js';
import {
	onScrollTop,
	getBodyScrollHeight,
	getScrollContainer,
	onScrollBottom,
	scrollToBottom,
	scrollInContainer,
	isTailVisible,
	isHeadVisible,
} from '@/shared/utility/scroll.js';
import type { ComputedRef } from 'vue';
import { misskeyApi } from '@/embed/misskey-api.js';
import { i18n } from '@/i18n.js';
import type { MisskeyEntity as MisskeyEntityBase } from '@/shared/utility/misskey-entity.js';

const SECOND_FETCH_LIMIT = 30;
const TOLERANCE = 16;

export type Paging<E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints> = {
	endpoint: E;
	limit: number;
	params?: Misskey.Endpoints[E]['req'] | ComputedRef<Misskey.Endpoints[E]['req']>;

	/** 検索 API のような、ページング不可なエンドポイントを利用する場合に指定する。 */
	noPaging?: boolean;

	/** 追加読み込みボタンを上端に置き、初期表示を末尾へスクロールする。 */
	reversed?: boolean;

	offsetMode?: boolean;
};

type MisskeyEntity = MisskeyEntityBase & {
	_featuredId_?: string;
	_prId_?: string;
	[x: string]: any;
};

type MisskeyEntityMap = Map<string, MisskeyEntity>;

function arrayToEntries(entities: MisskeyEntity[]): [string, MisskeyEntity][] {
	return entities.map((en) => [en.id, en]);
}

function concatMapWithArray(map: MisskeyEntityMap, entities: MisskeyEntity[]): MisskeyEntityMap {
	return new Map([...map, ...arrayToEntries(entities)]);
}
</script>
<script lang="ts" setup>
import EmError from '@/embed/components/EmError.vue';
import MkLoading from '@/components/global/MkLoading.vue';

const props = withDefaults(
	defineProps<{
		pagination: Paging;
		disableAutoLoad?: boolean;
		displayLimit?: number;
	}>(),
	{
		displayLimit: 20,
	},
);

const emit = defineEmits<{
	(ev: 'queue', count: number): void;
	(ev: 'status', error: boolean): void;
}>();

const rootEl = shallowRef<HTMLElement>();

const backed = ref(false);

const scrollRemove = ref<(() => void) | null>(null);

const items = ref<MisskeyEntityMap>(new Map());

/**
 * タブが非アクティブなどの場合に更新を貯めておく
 * 最新が0番目
 */
const queue = ref<MisskeyEntityMap>(new Map());

const offset = ref(0);

const fetching = ref(true);

const moreFetching = ref(false);
const more = ref(false);
const isBackTop = ref(false);
const empty = computed(() => items.value.size === 0);
const error = ref(false);

const scrollableElement = computed(() => (rootEl.value ? getScrollContainer(rootEl.value) : window.document.body));

const visibility = useDocumentVisibility();

let isPausingUpdate = false;
let timerForSetPause: number | null = null;
const BACKGROUND_PAUSE_WAIT_SEC = 10;

// https://qiita.com/mkataigi/items/0154aefd2223ce23398e
const scrollObserver = ref<IntersectionObserver>();

watch(
	[() => props.pagination.reversed, scrollableElement],
	() => {
		if (scrollObserver.value) {
			scrollObserver.value.disconnect();
		}

		scrollObserver.value = new IntersectionObserver(
			(entries) => {
				backed.value = entries[0]?.isIntersecting ?? false;
			},
			{
				root: scrollableElement.value,
				rootMargin: props.pagination.reversed ? '-100% 0px 100% 0px' : '100% 0px -100% 0px',
				threshold: 0.01,
			},
		);
	},
	{ immediate: true },
);

watch(rootEl, () => {
	scrollObserver.value?.disconnect();
	nextTick(() => {
		if (rootEl.value) {
			scrollObserver.value?.observe(rootEl.value);
		}
	});
});

watch([backed, rootEl], () => {
	if (!backed.value) {
		if (!rootEl.value) {
			return;
		}

		scrollRemove.value = (props.pagination.reversed ? onScrollBottom : onScrollTop)(
			rootEl.value,
			executeQueue,
			TOLERANCE,
		);
	} else {
		if (scrollRemove.value) {
			scrollRemove.value();
		}
		scrollRemove.value = null;
	}
});

// チャンネル ID などのパラメータが変わったら再読込する。
watch(() => [props.pagination.endpoint, props.pagination.params], init, { deep: true });

watch(
	queue,
	(a, b) => {
		if (a.size === 0 && b.size === 0) {
			return;
		}
		emit('queue', queue.value.size);
	},
	{ deep: true },
);

watch(error, (n, o) => {
	if (n === o) {
		return;
	}
	emit('status', n);
});

async function init(): Promise<void> {
	items.value = new Map();
	queue.value = new Map();
	fetching.value = true;
	const params = props.pagination.params
		? isRef(props.pagination.params)
			? props.pagination.params.value
			: props.pagination.params
		: {};
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: props.pagination.limit ?? 10,
		allowPartial: true,
	}).then(
		(res) => {
			const adItem = res[3];
			if (adItem !== undefined) {
				adItem._shouldInsertAd_ = true;
			}

			if (res.length === 0 || props.pagination.noPaging) {
				concatItems(res);
				more.value = false;
			} else {
				if (props.pagination.reversed) {
					moreFetching.value = true;
				}
				concatItems(res);
				more.value = true;
			}

			offset.value = res.length;
			error.value = false;
			fetching.value = false;
		},
		(err) => {
			error.value = true;
			fetching.value = false;
		},
	);
}

const reload = (): Promise<void> => {
	return init();
};

const fetchMore = async (): Promise<void> => {
	if (!more.value || fetching.value || moreFetching.value || items.value.size === 0) {
		return;
	}
	moreFetching.value = true;
	const params = props.pagination.params
		? isRef(props.pagination.params)
			? props.pagination.params.value
			: props.pagination.params
		: {};
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: SECOND_FETCH_LIMIT,
		...(props.pagination.offsetMode
			? {
					offset: offset.value,
				}
			: {
					untilId: Array.from(items.value.keys()).at(-1),
				}),
	}).then(
		(res) => {
			const adItem = res[10];
			if (adItem !== undefined) {
				adItem._shouldInsertAd_ = true;
			}

			const reverseConcat = (_res: MisskeyEntity[]) => {
				const oldHeight = scrollableElement.value ? scrollableElement.value.scrollHeight : getBodyScrollHeight();
				const oldScroll = scrollableElement.value ? scrollableElement.value.scrollTop : window.scrollY;

				items.value = concatMapWithArray(items.value, _res);

				return nextTick(() => {
					if (scrollableElement.value) {
						scrollInContainer(scrollableElement.value, {
							top: oldScroll + (scrollableElement.value.scrollHeight - oldHeight),
							behavior: 'instant',
						});
					} else {
						window.scroll({ top: oldScroll + (getBodyScrollHeight() - oldHeight), behavior: 'instant' });
					}

					return nextTick();
				});
			};

			const hasMore = res.length !== 0;
			if (props.pagination.reversed) {
				reverseConcat(res).then(() => {
					more.value = hasMore;
					moreFetching.value = false;
				});
			} else {
				items.value = concatMapWithArray(items.value, res);
				more.value = hasMore;
				moreFetching.value = false;
			}
			offset.value += res.length;
		},
		(err) => {
			moreFetching.value = false;
		},
	);
};

const fetchMoreAhead = async (): Promise<void> => {
	if (!more.value || fetching.value || moreFetching.value || items.value.size === 0) {
		return;
	}
	moreFetching.value = true;
	const params = props.pagination.params
		? isRef(props.pagination.params)
			? props.pagination.params.value
			: props.pagination.params
		: {};
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: SECOND_FETCH_LIMIT,
		...(props.pagination.offsetMode
			? {
					offset: offset.value,
				}
			: {
					sinceId: Array.from(items.value.keys()).at(-1),
				}),
	}).then(
		(res) => {
			items.value = concatMapWithArray(items.value, res);
			more.value = res.length !== 0;
			offset.value += res.length;
			moreFetching.value = false;
		},
		(err) => {
			moreFetching.value = false;
		},
	);
};

const isTop = (): boolean =>
	isBackTop.value || (props.pagination.reversed ? isTailVisible : isHeadVisible)(rootEl.value!, TOLERANCE);

watch(visibility, () => {
	if (visibility.value === 'hidden') {
		timerForSetPause = window.setTimeout(() => {
			isPausingUpdate = true;
			timerForSetPause = null;
		}, BACKGROUND_PAUSE_WAIT_SEC * 1000);
	} else {
		if (timerForSetPause) {
			window.clearTimeout(timerForSetPause);
			timerForSetPause = null;
		} else {
			isPausingUpdate = false;
			if (isTop()) {
				executeQueue();
			}
		}
	}
});

const prepend = (item: MisskeyEntity): void => {
	if (items.value.size === 0) {
		items.value.set(item.id, item);
		fetching.value = false;
		return;
	}

	if (isTop() && !isPausingUpdate) {
		unshiftItems([item]);
	} else {
		prependQueue(item);
	}
};

function unshiftItems(newItems: MisskeyEntity[]) {
	const length = newItems.length + items.value.size;
	items.value = new Map([...arrayToEntries(newItems), ...items.value].slice(0, props.displayLimit));

	if (length >= props.displayLimit) {
		more.value = true;
	}
}

function concatItems(oldItems: MisskeyEntity[]) {
	const length = oldItems.length + items.value.size;
	items.value = new Map([...items.value, ...arrayToEntries(oldItems)].slice(0, props.displayLimit));

	if (length >= props.displayLimit) {
		more.value = true;
	}
}

function executeQueue() {
	unshiftItems(Array.from(queue.value.values()));
	queue.value = new Map();
}

function prependQueue(newItem: MisskeyEntity) {
	queue.value = new Map(
		[[newItem.id, newItem], ...queue.value].slice(0, props.displayLimit) as [string, MisskeyEntity][],
	);
}

const appendItem = (item: MisskeyEntity): void => {
	items.value.set(item.id, item);
};

const removeItem = (id: string) => {
	items.value.delete(id);
	queue.value.delete(id);
};

const updateItem = (id: MisskeyEntity['id'], replacer: (old: MisskeyEntity) => MisskeyEntity): void => {
	const item = items.value.get(id);
	if (item) {
		items.value.set(id, replacer(item));
	}

	const queueItem = queue.value.get(id);
	if (queueItem) {
		queue.value.set(id, replacer(queueItem));
	}
};

onActivated(() => {
	isBackTop.value = false;
});

onDeactivated(() => {
	isBackTop.value = props.pagination.reversed
		? window.scrollY >= (rootEl.value ? rootEl.value.scrollHeight - window.innerHeight : 0)
		: window.scrollY === 0;
});

function toBottom() {
	scrollToBottom(rootEl.value!);
}

onBeforeMount(() => {
	init().then(() => {
		if (props.pagination.reversed) {
			nextTick(() => {
				window.setTimeout(toBottom, 800);

				// 初期スクロール中は追加読み込みボタンをローディング表示に保つ。
				window.setTimeout(() => {
					moreFetching.value = false;
				}, 2000);
			});
		}
	});
});

onBeforeUnmount(() => {
	if (timerForSetPause) {
		window.clearTimeout(timerForSetPause);
		timerForSetPause = null;
	}
	scrollObserver.value?.disconnect();
});

defineExpose({
	items,
	queue,
	backed: backed.value,
	more,
	reload,
	prepend,
	append: appendItem,
	removeItem,
	updateItem,
});
</script>

<style lang="scss" module>
.more {
	display: block;
	margin-left: auto;
	margin-right: auto;
}
</style>
