<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination ref="paginationEl" :paginator="paginator" :direction="direction" :autoLoad="autoLoad" :pullToRefresh="pullToRefresh" :withControl="withControl" :forceDisableInfiniteScroll="forceDisableInfiniteScroll">
	<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

	<template #default="{ items: notes }">
		<div
			ref="rootEl"
			data-cy-notes-timeline
			:class="[$style.root, { [$style.noGap]: noGap, [$style.layoutPending]: canVirtualize && virtualLayoutPending }]"
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
					:style="{ top: `${row.start - scrollMargin}px` }"
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
					<div v-if="getNoteSeparator(notes, i, note.createdAt) != null" :class="[$style.date, { [$style.noGap]: noGap }]">
						<span><i class="ti ti-chevron-up"></i> {{ getNoteSeparator(notes, i, note.createdAt)?.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ getNoteSeparator(notes, i, note.createdAt)?.nextText }} <i class="ti ti-chevron-down"></i></span>
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
import type { MkPaginationOptions } from '@/components/layout/MkPagination.vue';
import type { IPaginator } from '@/utility/paginator.js';
import MkNote from '@/features/notes/components/MkNote.vue';
import MkPagination from '@/components/layout/MkPagination.vue';
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
	// 計測適用をrAFに遅延させると、アイテム投入直後に全行 start=0 の縮退フレームが描画される
	// (「全投稿が一瞬重なる」フラッシュの根本原因) ため同期計測にする
	useAnimationFrameWithResizeObserver: false,
})));

const virtualRows = computed(() => virtualizer.value.getVirtualItems().flatMap((virtualItem) => {
	const note = props.paginator.items.value[virtualItem.index];
	if (note == null) return [];
	const previousNote = props.paginator.items.value[virtualItem.index - 1];
	const separatorInfo = previousNote && isSeparatorNeeded(previousNote.createdAt, note.createdAt)
		? getSeparatorInfo(previousNote.createdAt, note.createdAt)
		: null;
	return [{
		index: virtualItem.index,
		start: virtualItem.start,
		note,
		separatorInfo,
	}];
}));

function getNoteSeparator(notes: Misskey.entities.Note[], index: number, createdAt: string) {
	const previousNote = notes[index - 1];
	if (previousNote == null || !isSeparatorNeeded(previousNote.createdAt, createdAt)) return null;
	return getSeparatorInfo(previousNote.createdAt, createdAt);
}

// virtualizerはアイテム投入直後、計測が出揃うまでの1〜数フレームを全行 start=0 (=全行が
// 同座標に重なる) の状態で描画することがある。初期状態を visibility: hidden にし、DOM更新後・
// ペイント前に走る flush:'post' watch で実際の行配置を検査して、正常に展開されたときだけ
// 表示する (詳細は MkStreamingNotesTimeline の同名ロジック参照)
const virtualLayoutVerified = ref(false);
let layoutVerifyTimer: number | null = null;

// 非仮想フォールバック中は検査せず即確定扱いにする代わりに、仮想化が有効になった時点で
// ラッチをリセットして検査をやり直す (フォールバック中の確定が仮想初回レンダーを素通しさせない)
watch(canVirtualize, (active, prev) => {
	if (active && !prev) virtualLayoutVerified.value = false;
});

function isVirtualLayoutSane(len: number): boolean {
	if (!canVirtualize.value) return true; // 非仮想フォールバックは通常フローなので対象外
	if (len <= 1) return true; // 1件以下なら重なりようがない
	const container = rootEl.value;
	// コンテナや行がまだ出揃っていない (アイテム到着直後の中間レンダー) 間は「未確定」。
	// ここで確定扱いすると、直後に描かれる縮退状態を素通ししてしまう
	if (container == null) return false;
	const rowEls = [...container.children] as HTMLElement[];
	if (rowEls.length < 2) return false;
	// 隣接行の重なり検査 (詳細は MkStreamingNotesTimeline の同名ロジック参照)。
	// 高さ0の行 (ハードミュート等) は top 同値でも重ならないので誤検出しない
	for (let i = 1; i < rowEls.length; i++) {
		const prev = rowEls[i - 1]!;
		if (rowEls[i]!.offsetTop < prev.offsetTop + prev.offsetHeight - 2) return false;
	}
	return true;
}

watch([virtualRows, () => props.paginator.items.value.length], ([, len]) => {
	if (len === 0) {
		virtualLayoutVerified.value = false;
		if (layoutVerifyTimer != null) {
			window.clearTimeout(layoutVerifyTimer);
			layoutVerifyTimer = null;
		}
		return;
	}
	if (virtualLayoutVerified.value) return;
	if (isVirtualLayoutSane(len)) {
		virtualLayoutVerified.value = true;
		if (layoutVerifyTimer != null) {
			window.clearTimeout(layoutVerifyTimer);
			layoutVerifyTimer = null;
		}
	} else {
		// フェイルセーフ: 想定外の理由でレイアウトが確定しない場合も一定時間で必ず表示する
		layoutVerifyTimer ??= window.setTimeout(() => {
			layoutVerifyTimer = null;
			virtualLayoutVerified.value = true;
		}, 300);
	}
}, { immediate: true, flush: 'post' });

const virtualLayoutPending = computed(() => props.paginator.items.value.length > 0 && !virtualLayoutVerified.value);

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

const paginationEl = useTemplateRef<ComponentPublicInstance>('paginationEl');

function attachScrollElement(el: HTMLElement | null) {
	const next = getScrollContainer(el);
	// 一度解決したスクロールコンテナは維持 (リロードで rootEl が消えても仮想化を落とさない)
	if (next == null || next === scrollElement.value) return;
	scrollElement.value = next;
	nextTick(scheduleScrollMarginUpdate);
}

// ローディング中から存在する MkPagination のルートでスクロールコンテナを先に解決する。
// rootEl (アイテム描画後にしか存在しない) だけだと初回表示が非仮想→仮想の二重マウントになる
watch(paginationEl, (comp) => {
	attachScrollElement(comp?.$el instanceof HTMLElement ? comp.$el : null);
}, { immediate: true });
watch(rootEl, (el) => {
	attachScrollElement(el);
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
	if (layoutVerifyTimer != null) window.clearTimeout(layoutVerifyTimer);
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

	&.layoutPending {
		visibility: hidden;
	}

	&.noGap {
		background: var(--MI-surface-panel);

		.note {
			border-bottom: solid 1px var(--MI-border-muted);
		}

		.ad {
			padding: 8px;
			background: var(--MI-surface-subtle);
			border-bottom: solid 1px var(--MI-border-muted);
		}
	}

	&:not(.noGap) {
		background: var(--MI-surface-page);

		.note {
			background: var(--MI-surface-panel);
			border-radius: var(--MI-radius-md);
			outline: solid 1px var(--MI-border-muted);
			outline-offset: -1px;
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

	.note {
		/* 仮想化がDOMを画面近傍に限定済みなので content-visibility: auto は冗長。
		 * contain-intrinsic-size プレースホルダの初回ペイント + 誤計測による
		 * レイアウトフラッシュを防ぐため常に visible に固定する (rowFallback 側は
		 * 全件マウントするため auto の恩恵が残るので対象外) */
		content-visibility: visible !important;
	}
}

.date {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 1em;
	color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
	padding: 8px 8px;
	margin: 0 auto;

	&.noGap {
		border-bottom: solid 1px var(--MI-border-muted);
	}
}

.ad:empty {
	display: none;
}
</style>
