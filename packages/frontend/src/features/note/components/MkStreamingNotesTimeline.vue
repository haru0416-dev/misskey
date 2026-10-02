<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="prefer.enablePullToRefresh ? MkPullToRefresh : 'div'" ref="containerEl" :refresher="() => reloadTimeline()">
	<MkLoading v-if="paginator.fetching.value"/>

	<MkError v-else-if="paginator.error.value" @retry="paginator.init()"/>

	<div v-else-if="paginator.items.value.length === 0" key="_empty_">
		<slot name="empty"><MkResult type="empty" :text="i18n.ts.noNotes"/></slot>
	</div>

	<div v-else ref="rootEl" data-cy-streaming-timeline>
		<div v-if="paginator.queuedAheadItemsCount.value > 0" :class="$style.new">
			<div :class="$style.newBg1"></div>
			<div :class="$style.newBg2"></div>
			<button data-cy-streaming-new-notes class="_button" :class="$style.newButton" @click="releaseQueue()"><i class="ti ti-circle-arrow-up"></i> {{ i18n.ts.newNote }}</button>
		</div>
		<div v-if="props.viewMode === 'media'" ref="notesEl" :class="$style.mediaGrid">
			<article v-for="{ note, files } in mediaNotes" :key="note.id" :data-scroll-anchor="note.id" :class="$style.mediaCard">
				<MkMediaList :mediaList="files.slice(0, 4)" :square="true"/>
				<div v-if="files.length > 4" :class="$style.mediaCount">+{{ files.length - 4 }}</div>
				<MkA :to="notePage(note)" :class="$style.mediaMeta">
					<MkAvatar :user="note.user" :class="$style.mediaAvatar"/>
					<span :class="$style.mediaAuthor"><MkUserName :user="note.user"/></span>
					<MkTime :time="note.createdAt" :class="$style.mediaTime"/>
				</MkA>
			</article>
			<MkResult v-if="mediaNotes.length === 0" type="empty" :text="i18n.ts.noNotes" :class="$style.mediaEmpty"/>
		</div>
		<div
			v-else-if="canVirtualize"
			ref="notesEl"
			data-cy-streaming-notes
			:class="[$style.notes, { [$style.layoutPending]: virtualLayoutPending }]"
			:style="{ height: `${virtualizer.getTotalSize()}px` }"
		>
			<div
				v-for="row in virtualRows"
				:key="row.note.id"
				:ref="measureElement"
				:data-index="row.index"
				:data-scroll-anchor="row.note.id"
				:class="$style.virtualRow"
				:style="{ top: `${row.start - scrollMargin}px` }"
			>
				<div :class="[$style.rowContent, { [$style.rowEntering]: enteringNoteIds.has(row.note.id), [$style.rowLeaving]: leavingNoteIds.has(row.note.id) }]">
					<div v-if="row.separatorInfo" :class="$style.date">
						<span><i class="ti ti-chevron-up"></i> {{ row.separatorInfo.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ row.separatorInfo.nextText }} <i class="ti ti-chevron-down"></i></span>
					</div>
					<MkNote :key="noteRenderKey(row.note)" :class="$style.note" :note="row.note" :withHardMute="true"/>
					<div v-if="row.note._shouldInsertAd_ && !row.separatorInfo" :class="$style.ad">
						<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
			</div>
		</div>
		<component
			v-else
			:is="prefer.animation ? TransitionGroup : 'div'"
			:class="$style.notes"
			:enterActiveClass="$style.transition_x_enterActive"
			:leaveActiveClass="$style.transition_x_leaveActive"
			:enterFromClass="$style.transition_x_enterFrom"
			:leaveToClass="$style.transition_x_leaveTo"
			:moveClass="$style.transition_x_move"
			tag="div"
		>
			<template v-for="{ note, separatorInfo } in nonVirtualRows" :key="note.id">
				<div v-if="separatorInfo != null" :data-scroll-anchor="note.id">
					<div :class="$style.date">
						<span><i class="ti ti-chevron-up"></i> {{ separatorInfo.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ separatorInfo.nextText }} <i class="ti ti-chevron-down"></i></span>
					</div>
					<MkNote :key="noteRenderKey(note)" :class="$style.note" :note="note" :withHardMute="true"/>
				</div>
				<div v-else-if="note._shouldInsertAd_" :data-scroll-anchor="note.id">
					<MkNote :key="noteRenderKey(note)" :class="$style.note" :note="note" :withHardMute="true"/>
					<div :class="$style.ad">
						<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
				<!-- TransitionGroup の子の key は note.id のまま保つ。MkNote の key を直に子にすると、編集で描き直すたびに退場と登場のアニメーションが重なる。 -->
				<div v-else :data-scroll-anchor="note.id">
					<MkNote :key="noteRenderKey(note)" :class="$style.note" :note="note" :withHardMute="true"/>
				</div>
			</template>
		</component>
		<MkPaginatorFailure v-if="paginator.canFetchOlder.value && !paginator.fetchingOlder.value" :failure="paginator.olderFailure.value"/>
		<!-- v-appear は mounted でしか値を読まないので、失敗の有無で作り直して自動の読み込みを止める・戻す。 -->
		<button v-show="paginator.canFetchOlder.value" :key="paginator.olderFailure.value ? '_more_failed_' : '_more_'" v-appear="prefer.enableInfiniteScroll && !paginator.olderFailure.value ? paginator.fetchOlder : null" data-cy-streaming-load-more :disabled="paginator.fetchingOlder.value" class="_button" :class="$style.more" @click="paginator.fetchOlder">
			<div v-if="!paginator.fetchingOlder.value">{{ paginator.olderFailure.value ? i18n.ts.retry : i18n.ts.loadMore }}</div>
			<MkLoading v-else :inline="true"/>
		</button>
	</div>
</component>
</template>

<script lang="ts" setup>
import { useVirtualizer } from '@tanstack/vue-virtual';
import {
	computed,
	watch,
	onUnmounted,
	provide,
	useTemplateRef,
	TransitionGroup,
	onMounted,
	shallowRef,
	ref,
	nextTick,
} from 'vue';
import type { ComponentPublicInstance } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer, scrollToTop } from '@shared/utility/scroll.js';
import type { BasicTimelineType } from '@/timelines.js';
import type { SoundStore } from '@/preferences/def.js';
import MkPullToRefresh from '@/components/layout/MkPullToRefresh.vue';
import * as sfx from '@/features/sound/sound.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import MkNote from '@/features/note/components/MkNote.vue';
import MkMediaList from '@/features/media-viewer/components/MkMediaList.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkPaginatorFailure from '@/components/layout/MkPaginatorFailure.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';
import { isSeparatorNeeded, getSeparatorInfo } from '@/features/note/timeline-date-separate.js';
import { useStreamingNotesTimeline } from '@/features/note/useStreamingNotesTimeline.js';
import { noteRenderKey } from '@/features/note/useNoteCapture.js';
import { notePage } from '@/filters/note.js';

const props = withDefaults(
	defineProps<{
		src: BasicTimelineType | 'mentions' | 'directs' | 'list' | 'antenna' | 'channel' | 'role';
		list?: string;
		antenna?: string;
		channel?: string;
		role?: string;
		sound?: boolean;
		customSound?: SoundStore | null;
		withRenotes?: boolean;
		withReplies?: boolean;
		withSensitive?: boolean;
		onlyFiles?: boolean;
		viewMode?: 'notes' | 'media';
	}>(),
	{
		withRenotes: true,
		withReplies: false,
		withSensitive: true,
		onlyFiles: false,
		viewMode: 'notes',
		sound: false,
		customSound: null,
	},
);

provide('inTimeline', true);
provide(
	'tl_withSensitive',
	computed(() => props.withSensitive),
);
provide(
	DI.inChannel,
	computed(() => (props.src === 'channel' ? (props.channel ?? null) : null)),
);

const {
	paginator,
	reloadTimeline,
	releaseQueue,
	onViewportChanged: onScrollContainerScroll,
} = useStreamingNotesTimeline(props, {
	isAtTop: isTop,
	onBeforePrepend: markNoteEntering,
	onNote: (note) => {
		if (props.sound) {
			if (props.customSound) {
				sfx.playMisskeySfxFile(props.customSound);
			} else {
				sfx.playMisskeySfx($i && note.userId === $i.id ? 'noteMy' : 'note');
			}
		}
	},
	onRemove: removeItem,
	onQueueReleased: () => scrollToTop(rootEl.value!),
});

function isTop() {
	if (scrollElement.value == null) {
		return true;
	}
	if (rootEl.value == null) {
		return true;
	}
	return scrollElement.value.scrollTop <= rootScrollMargin.value + 1;
}

const scrollElement = shallowRef<HTMLElement | null>(null);
const scrollMargin = ref(0);
const rootScrollMargin = ref(0);
const canVirtualize = computed(() => props.viewMode === 'notes' && scrollElement.value != null);
const mediaNotes = computed(() => {
	const result: { note: Misskey.entities.Note; files: Misskey.entities.DriveFile[] }[] = [];
	for (const note of paginator.value.items.value) {
		const files = (note.files ?? []).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
		if (files.length > 0 && (props.withSensitive || files.every((file) => !file.isSensitive))) {
			result.push({ note, files });
		}
	}
	return result;
});

const virtualizer = useVirtualizer(
	computed(() => ({
		count: paginator.value.items.value.length,
		getScrollElement: () => scrollElement.value,
		estimateSize: () => 220,
		getItemKey: (index) => paginator.value.items.value[index]?.id ?? index,
		overscan: 5,
		scrollMargin: scrollMargin.value,
		useScrollendEvent: true,
		// 計測適用をrAFに遅延させると、アイテム投入直後に全行 start=0 の縮退フレームが描画される
		// (「全投稿が一瞬重なる」フラッシュの根本原因) ため同期計測にする
		useAnimationFrameWithResizeObserver: false,
	})),
);

const virtualRows = computed(() =>
	virtualizer.value.getVirtualItems().flatMap((virtualItem) => {
		const note = paginator.value.items.value[virtualItem.index];
		if (note == null) {
			return [];
		}
		const previousNote = paginator.value.items.value[virtualItem.index - 1];
		const separatorInfo =
			previousNote && isSeparatorNeeded(previousNote.createdAt, note.createdAt)
				? getSeparatorInfo(previousNote.createdAt, note.createdAt)
				: null;
		return [
			{
				index: virtualItem.index,
				start: virtualItem.start,
				note,
				separatorInfo,
			},
		];
	}),
);

// virtualizer の計測が終わるまで start=0 の行が重なる場合がある。
// DOM 更新後に配置を検査し、未確定でも 300ms 後には表示する。
const virtualLayoutVerified = ref(false);
let layoutVerifyTimer: number | null = null;

// media モードは複数列で offsetTop が重なるため、仮想ブランチへ入るときだけ検査状態を戻す。
const virtualGateActive = computed(() => props.viewMode === 'notes' && canVirtualize.value);
watch(virtualGateActive, (active, prev) => {
	if (active && !prev) {
		virtualLayoutVerified.value = false;
	}
});

function isVirtualLayoutSane(len: number): boolean {
	if (!virtualGateActive.value || len <= 1) {
		return true;
	}
	const container = notesEl.value;
	// 描画途中に確定扱いすると、直後の重なった行を表示してしまう。
	if (container == null) {
		return false;
	}
	const rowEls = [...container.children] as HTMLElement[];
	if (rowEls.length < 2) {
		return false;
	}
	// 直前の行が高さ 0 なら同じ位置を許容し、位置比較には 2px の誤差を許容する。
	for (let i = 1; i < rowEls.length; i++) {
		const prev = rowEls[i - 1]!;
		if (rowEls[i]!.offsetTop < prev.offsetTop + prev.offsetHeight - 2) {
			return false;
		}
	}
	return true;
}

watch(
	[virtualRows, () => paginator.value.items.value.length],
	([, len]) => {
		if (len === 0) {
			virtualLayoutVerified.value = false;
			if (layoutVerifyTimer != null) {
				window.clearTimeout(layoutVerifyTimer);
				layoutVerifyTimer = null;
			}
			return;
		}
		if (virtualLayoutVerified.value) {
			return;
		}
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
	},
	{ immediate: true, flush: 'post' },
);

const virtualLayoutPending = computed(() => paginator.value.items.value.length > 0 && !virtualLayoutVerified.value);

const nonVirtualRows = computed(() => {
	const notes = paginator.value.items.value;
	return notes.map((note, index) => {
		const previousNote = notes[index - 1];
		return {
			note,
			separatorInfo:
				previousNote && isSeparatorNeeded(previousNote.createdAt, note.createdAt)
					? getSeparatorInfo(previousNote.createdAt, note.createdAt)
					: null,
		};
	});
});

const enteringNoteIds = shallowRef(new Set<string>());
const leavingNoteIds = shallowRef(new Set<string>());
const animationTimers = new Map<string, number>();

function measureElement(node: Element | ComponentPublicInstance | null) {
	if (node instanceof Element) {
		virtualizer.value.measureElement(node);
	}
}

function updateScrollMargins() {
	if (!rootEl.value || !notesEl.value || !scrollElement.value) {
		return;
	}
	const rootRect = rootEl.value.getBoundingClientRect();
	const notesRect = notesEl.value.getBoundingClientRect();
	const scrollRect = scrollElement.value.getBoundingClientRect();
	const scrollTop = scrollElement.value.scrollTop;
	rootScrollMargin.value = rootRect.top - scrollRect.top + scrollTop;
	scrollMargin.value = notesRect.top - scrollRect.top + scrollTop;
}

let scrollMarginFrame: number | null = null;
function scheduleScrollMarginUpdate() {
	if (scrollMarginFrame != null) {
		return;
	}
	scrollMarginFrame = window.requestAnimationFrame(() => {
		scrollMarginFrame = null;
		updateScrollMargins();
	});
}

function markNoteEntering(noteId: string) {
	if (!prefer.animation || !canVirtualize.value) {
		return;
	}
	enteringNoteIds.value = new Set(enteringNoteIds.value).add(noteId);
	const timerKey = `enter:${noteId}`;
	const previousTimer = animationTimers.get(timerKey);
	if (previousTimer != null) {
		window.clearTimeout(previousTimer);
	}
	animationTimers.set(
		timerKey,
		window.setTimeout(() => {
			const ids = new Set(enteringNoteIds.value);
			ids.delete(noteId);
			enteringNoteIds.value = ids;
			animationTimers.delete(timerKey);
		}, 700),
	);
}

function removeItem(noteId: string) {
	const notePaginator = paginator.value;
	if (!prefer.animation || !canVirtualize.value || !notePaginator.items.value.some((note) => note.id === noteId)) {
		notePaginator.removeItem(noteId);
		return;
	}
	if (leavingNoteIds.value.has(noteId)) {
		return;
	}
	leavingNoteIds.value = new Set(leavingNoteIds.value).add(noteId);
	const timerKey = `leave:${noteId}`;
	animationTimers.set(
		timerKey,
		window.setTimeout(() => {
			notePaginator.removeItem(noteId);
			const ids = new Set(leavingNoteIds.value);
			ids.delete(noteId);
			leavingNoteIds.value = ids;
			animationTimers.delete(timerKey);
		}, 200),
	);
}

const rootEl = useTemplateRef('rootEl');
const notesEl = useTemplateRef('notesEl');
const containerEl = useTemplateRef('containerEl');

function attachScrollElement(el: HTMLElement | null) {
	const nextScrollElement = getScrollContainer(el);
	// 一度解決したスクロールコンテナは維持する (リロード等で rootEl が一時的に消えても
	// canVirtualize を落とさない。null に戻すと復帰時に非仮想ブランチで全ノートを
	// 無駄にフルマウントしてから仮想ブランチへ入れ替えるスラッシングが起きる)
	if (nextScrollElement == null || nextScrollElement === scrollElement.value) {
		return;
	}
	scrollElement.value?.removeEventListener('scroll', onScrollContainerScroll);
	scrollElement.value = nextScrollElement;
	// 先頭へ戻った時点でキューを開放するため、スクロール中も軽量な位置判定だけを行う。
	scrollElement.value.addEventListener('scroll', onScrollContainerScroll, { passive: true });
	nextTick().then(scheduleScrollMarginUpdate);
}

// ローディング中から存在するコンポーネントルートでスクロールコンテナを先に解決しておく。
// rootEl (ノート描画後にしか存在しない) だけに頼ると、初回表示が非仮想ブランチ→仮想ブランチの
// 二重マウントになり、仮想化レイアウト確定前の1〜2フレームで全行が同座標に重なって見える
watch(
	containerEl,
	(comp) => {
		const el =
			comp == null ? null : comp instanceof HTMLElement ? comp : comp.$el instanceof HTMLElement ? comp.$el : null;
		attachScrollElement(el);
	},
	{ immediate: true },
);
watch(
	rootEl,
	(el) => {
		attachScrollElement(el);
	},
	{ immediate: true },
);

watch(notesEl, () => nextTick().then(scheduleScrollMarginUpdate));
watch(
	() => paginator.value.queuedAheadItemsCount.value,
	async () => {
		const previousNotesTop = notesEl.value?.getBoundingClientRect().top;
		await nextTick();
		if (previousNotesTop != null && notesEl.value && scrollElement.value && scrollElement.value.scrollTop > 0) {
			const notesTopDelta = notesEl.value.getBoundingClientRect().top - previousNotesTop;
			scrollElement.value.scrollTop += notesTopDelta;
		}
		scheduleScrollMarginUpdate();
	},
);

onMounted(() => {
	window.addEventListener('resize', scheduleScrollMarginUpdate, { passive: true });
});

onUnmounted(() => {
	scrollElement.value?.removeEventListener('scroll', onScrollContainerScroll);
	window.removeEventListener('resize', scheduleScrollMarginUpdate);
	if (scrollMarginFrame != null) {
		window.cancelAnimationFrame(scrollMarginFrame);
	}
	if (layoutVerifyTimer != null) {
		window.clearTimeout(layoutVerifyTimer);
	}
	for (const timer of animationTimers.values()) {
		window.clearTimeout(timer);
	}
	animationTimers.clear();
});

defineExpose({
	reloadTimeline,
});
</script>

<style lang="scss" module>
.transition_x_move {
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

.transition_x_enterActive {
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.7s cubic-bezier(0.23, 1, 0.32, 1);

	&.note,
	.note {
		/* Skip Note Rendering有効時、TransitionGroupでnoteを追加するときに一瞬がくっとなる問題を抑制する */
		content-visibility: visible !important;
	}
}

.transition_x_leaveActive {
	transition: height 0.2s cubic-bezier(0,.5,.5,1), opacity 0.2s cubic-bezier(0,.5,.5,1);
}

.transition_x_enterFrom {
	opacity: 0;
	transform: translateY(max(-64px, -100%));
}

@supports (interpolate-size: allow-keywords) {
	.transition_x_leaveTo {
		interpolate-size: allow-keywords; // heightのtransitionを動作させるために必要
		height: 0;
	}
}

.transition_x_leaveTo {
	opacity: 0;
}

.notes {
	container-type: inline-size;
	position: relative;
	background: var(--MI-surface-panel);

	&.layoutPending {
		visibility: hidden;
	}
}

.mediaGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: var(--MI-margin);
	padding: var(--MI-margin);
	container-type: inline-size;
	background: var(--MI_THEME-bg);
}

.mediaCard {
	position: relative;
	min-width: 0;
	overflow: hidden;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.mediaCount {
	position: absolute;
	top: 8px;
	right: 8px;
	padding: 3px 7px;
	border-radius: 999px;
	background: rgb(0 0 0 / 70%);
	color: #fff;
	font-weight: 700;
	pointer-events: none;
}

.mediaMeta {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 44px;
	padding: 8px 10px;
	color: var(--MI_THEME-fg);
}

.mediaAvatar {
	flex: 0 0 28px;
	width: 28px;
	height: 28px;
}

.mediaAuthor {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.mediaTime {
	flex: none;
	margin-left: auto;
	font-size: 0.85em;
	opacity: 0.7;
}

.mediaEmpty {
	grid-column: 1 / -1;
}

@container (max-width: 520px) {
	.mediaGrid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 2px;
		padding: 0;
	}

	.mediaCard {
		border-radius: 0;
	}

	.mediaMeta {
		min-height: 40px;
		padding: 6px 8px;
	}

	.mediaAvatar {
		display: none;
	}
}

.virtualRow {
	position: absolute;
	top: 0;
	left: 0;
	box-sizing: border-box;
	width: 100%;
}

.rowContent {
	width: 100%;

	.note {
		/* 仮想化がDOMを画面近傍に限定済みなので content-visibility: auto は冗長。
		 * それどころか初回ペイントで contain-intrinsic-size のプレースホルダ (150px) が
		 * 描かれ、その仮サイズを measureElement が計測してしまい、全行が同座標に
		 * 重なって見えるフラッシュの原因になるため常に visible に固定する */
		content-visibility: visible !important;
	}
}

.rowEntering {
	animation: rowEnter 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

.rowLeaving {
	pointer-events: none;
	animation: rowLeave 0.2s cubic-bezier(0,.5,.5,1) forwards;
}

@keyframes rowEnter {
	from {
		opacity: 0;
		transform: translateY(max(-64px, -100%));
	}
}

@keyframes rowLeave {
	to {
		opacity: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.rowEntering,
	.rowLeaving {
		animation-duration: 0.01ms;
	}
}

.note:not(:empty) {
	border-bottom: solid 1px var(--MI-border-muted);
}

.new {
	--gapFill: 0.5px; // ヘッダーの高さが小数になる場合の丸め誤差で隙間が見えないよう、少し重ねる。

	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) - var(--gapFill));
	z-index: 1000;
	width: 100%;
	box-sizing: border-box;
	padding: calc(10px + var(--gapFill)) 0 10px 0;
}

.newBg1, .newBg2 {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
}

.newBg1 {
	height: 100%;
	-webkit-backdrop-filter: var(--MI-blur, blur(2px));
	backdrop-filter: var(--MI-blur, blur(2px));
	mask-image: linear-gradient(
		to top,
		rgb(0 0 0 / 0%) 0%,
		rgb(0 0 0 / 4.9%) 7.75%,
		rgb(0 0 0 / 10.4%) 11.25%,
		rgb(0 0 0 / 45%) 23.55%,
		rgb(0 0 0 / 55%) 26.45%,
		rgb(0 0 0 / 89.6%) 38.75%,
		rgb(0 0 0 / 95.1%) 42.25%,
		rgb(0 0 0 / 100%) 50%
	);
}

.newBg2 {
	height: 75%;
	-webkit-backdrop-filter: var(--MI-blur, blur(4px));
	backdrop-filter: var(--MI-blur, blur(4px));
	mask-image: linear-gradient(
		to top,
		rgb(0 0 0 / 0%) 0%,
		rgb(0 0 0 / 4.9%) 15.5%,
		rgb(0 0 0 / 10.4%) 22.5%,
		rgb(0 0 0 / 45%) 47.1%,
		rgb(0 0 0 / 55%) 52.9%,
		rgb(0 0 0 / 89.6%) 77.5%,
		rgb(0 0 0 / 95.1%) 91.9%,
		rgb(0 0 0 / 100%) 100%
	);
}

.newButton {
	position: relative;
	display: block;
	padding: 6px 12px;
	border-radius: 999px;
	width: max-content;
	margin: auto;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 90%;

	&:hover {
		background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
	}

	&:active {
		background: hsl(from var(--MI_THEME-accent) h s calc(l - 5));
	}
}

.date {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 1em;
	padding: 8px 8px;
	margin: 0 auto;
	color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
	border-bottom: solid 1px var(--MI-border-muted);
}

.ad {
	padding: 8px;
	background: var(--MI-surface-subtle);
	border-bottom: solid 1px var(--MI-border-muted);

	&:empty {
		display: none;
	}
}

.more {
	display: block;
	width: 100%;
	box-sizing: border-box;
	padding: 16px;
	background: var(--MI_THEME-panel);
}
</style>
