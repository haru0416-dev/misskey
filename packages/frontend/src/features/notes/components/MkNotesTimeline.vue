<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination :paginator="paginator" :direction="direction" :autoLoad="autoLoad" :pullToRefresh="pullToRefresh" :withControl="withControl" :forceDisableInfiniteScroll="forceDisableInfiniteScroll">
	<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

	<template #default="{ items: notes }">
		<div
			ref="rootEl"
			data-cy-notes-timeline
			:class="[$style.root, { [$style.noGap]: noGap }]"
			:style="canVirtualize ? { height: `${virtualizer.getTotalSize()}px` } : undefined"
		>
			<template v-if="canVirtualize">
				<div
					v-for="row in virtualRows"
					:key="row.note.id"
					:ref="measureElement"
					:data-index="row.index"
					:data-scroll-anchor="row.note.id"
					:class="[$style.row, { [$style.gapped]: !noGap, [$style.last]: row.index === notes.length - 1 }]"
					:style="{ transform: `translateY(${row.start - scrollMargin}px)` }"
				>
					<div v-if="row.separatorInfo" :class="[$style.date, { [$style.noGap]: noGap }]">
						<span><i class="ti ti-chevron-up"></i> {{ row.separatorInfo.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ row.separatorInfo.nextText }} <i class="ti ti-chevron-down"></i></span>
					</div>
					<MkNote :class="$style.note" :note="row.note" :withHardMute="true"/>
					<div v-if="row.note._shouldInsertAd_" :class="$style.ad">
						<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
			</template>
			<template v-else>
				<div
					v-for="(note, i) in notes"
					:key="note.id"
					:data-scroll-anchor="note.id"
					:class="[$style.rowFallback, { [$style.gapped]: !noGap, [$style.last]: i === notes.length - 1 }]"
				>
					<div v-if="i > 0 && isSeparatorNeeded(notes[i - 1].createdAt, note.createdAt)" :class="[$style.date, { [$style.noGap]: noGap }]">
						<span><i class="ti ti-chevron-up"></i> {{ getSeparatorInfo(notes[i - 1].createdAt, note.createdAt)?.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ getSeparatorInfo(notes[i - 1].createdAt, note.createdAt)?.nextText }} <i class="ti ti-chevron-down"></i></span>
					</div>
					<MkNote :class="$style.note" :note="note" :withHardMute="true"/>
					<div v-if="note._shouldInsertAd_" :class="$style.ad">
						<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
			</template>
		</div>
	</template>
</MkPagination>
</template>

<script lang="ts" setup generic="T extends IPaginator<Misskey.entities.Note>">
import { useVirtualizer } from '@tanstack/vue-virtual';
import * as Misskey from 'misskey-js';
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { getScrollContainer } from '@shared/utility/scroll.js';
import type { MkPaginationOptions } from '@/components/MkPagination.vue';
import type { IPaginator } from '@/utility/paginator.js';
import MkNote from '@/features/notes/components/MkNote.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';
import { useGlobalEvent } from '@/events.js';
import { isSeparatorNeeded, getSeparatorInfo } from '@/features/notes/timeline-date-separate.js';

const props = withDefaults(defineProps<MkPaginationOptions & {
	paginator: T;
	noGap?: boolean;
}>(), {
	autoLoad: true,
	direction: 'down',
	pullToRefresh: true,
	withControl: true,
	forceDisableInfiniteScroll: false,
});

const rootEl = useTemplateRef('rootEl');
const scrollElement = shallowRef<HTMLElement | null>(null);
const scrollMargin = ref(0);
const canVirtualize = computed(() => scrollElement.value != null);

const virtualizer = useVirtualizer(computed(() => ({
	count: props.paginator.items.value.length,
	getScrollElement: () => scrollElement.value,
	estimateSize: () => 220,
	getItemKey: (index) => props.paginator.items.value[index]?.id ?? index,
	overscan: 5,
	scrollMargin: scrollMargin.value,
	useScrollendEvent: true,
	useAnimationFrameWithResizeObserver: true,
})));

const virtualRows = computed(() => virtualizer.value.getVirtualItems().map((virtualItem) => {
	const note = props.paginator.items.value[virtualItem.index];
	const previousNote = props.paginator.items.value[virtualItem.index - 1];
	const separatorInfo = previousNote && isSeparatorNeeded(previousNote.createdAt, note.createdAt)
		? getSeparatorInfo(previousNote.createdAt, note.createdAt)
		: null;
	return {
		index: virtualItem.index,
		start: virtualItem.start,
		note,
		separatorInfo,
	};
}));

function measureElement(node: Element | ComponentPublicInstance | null) {
	if (node instanceof Element) virtualizer.value.measureElement(node);
}

function updateScrollMargin() {
	if (!rootEl.value || !scrollElement.value) return;
	const rootRect = rootEl.value.getBoundingClientRect();
	const scrollRect = scrollElement.value.getBoundingClientRect();
	scrollMargin.value = rootRect.top - scrollRect.top + scrollElement.value.scrollTop;
}

let scrollMarginFrame: number | null = null;
function scheduleScrollMarginUpdate() {
	if (scrollMarginFrame != null) return;
	scrollMarginFrame = window.requestAnimationFrame(() => {
		scrollMarginFrame = null;
		updateScrollMargin();
	});
}

watch(rootEl, (el) => {
	scrollElement.value = getScrollContainer(el);
	nextTick(scheduleScrollMarginUpdate);
});

watch(() => props.paginator.items.value.length, () => {
	nextTick(scheduleScrollMarginUpdate);
});

onMounted(() => {
	window.addEventListener('resize', scheduleScrollMarginUpdate, { passive: true });
});

onUnmounted(() => {
	window.removeEventListener('resize', scheduleScrollMarginUpdate);
	if (scrollMarginFrame != null) window.cancelAnimationFrame(scrollMarginFrame);
});

useGlobalEvent('noteDeleted', (noteId) => {
	props.paginator.removeItem(noteId);
});

function reload() {
	return props.paginator.reload();
}

defineExpose({
	reload,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	position: relative;

	&.noGap {
		background: var(--MI_THEME-panel);

		.note {
			border-bottom: solid 0.5px var(--MI_THEME-divider);
		}

		.ad {
			padding: 8px;
			background-size: auto auto;
			background-image: repeating-linear-gradient(45deg, transparent, transparent 8px, var(--MI_THEME-bg) 8px, var(--MI_THEME-bg) 14px);
			border-bottom: solid 0.5px var(--MI_THEME-divider);
		}
	}

	&:not(.noGap) {
		background: var(--MI_THEME-bg);

		.note {
			background: var(--MI_THEME-panel);
			border-radius: var(--MI-radius);
		}
	}
}

.row,
.rowFallback {
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: 100%;

	&.gapped {
		gap: var(--MI-margin);
		padding-bottom: var(--MI-margin);

		&.last {
			padding-bottom: 0;
		}
	}
}

.row {
	position: absolute;
	top: 0;
	left: 0;
}

.date {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 1em;
	opacity: 0.75;
	padding: 8px 8px;
	margin: 0 auto;

	&.noGap {
		border-bottom: solid 0.5px var(--MI_THEME-divider);
	}
}

.ad:empty {
	display: none;
}
</style>
