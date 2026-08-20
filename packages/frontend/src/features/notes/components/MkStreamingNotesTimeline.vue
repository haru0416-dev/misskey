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
			<article v-for="note in mediaNotes" :key="note.id" :data-scroll-anchor="note.id" :class="$style.mediaCard">
				<MkMediaList :mediaList="mediaFiles(note).slice(0, 4)" :square="true"/>
				<div v-if="mediaFiles(note).length > 4" :class="$style.mediaCount">+{{ mediaFiles(note).length - 4 }}</div>
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
					<MkNote :class="$style.note" :note="row.note" :withHardMute="true"/>
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
			<template v-for="(note, i) in paginator.items.value" :key="note.id">
			<div v-if="getNoteSeparator(paginator.items.value, i, note.createdAt) != null" :data-scroll-anchor="note.id">
					<div :class="$style.date">
						<span><i class="ti ti-chevron-up"></i> {{ getNoteSeparator(paginator.items.value, i, note.createdAt)?.prevText }}</span>
						<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
						<span>{{ getNoteSeparator(paginator.items.value, i, note.createdAt)?.nextText }} <i class="ti ti-chevron-down"></i></span>
					</div>
					<MkNote :class="$style.note" :note="note" :withHardMute="true"/>
				</div>
				<div v-else-if="note._shouldInsertAd_" :data-scroll-anchor="note.id">
					<MkNote :class="$style.note" :note="note" :withHardMute="true"/>
					<div :class="$style.ad">
						<MkAd :preferForms="['horizontal', 'horizontal-big']"/>
					</div>
				</div>
				<MkNote v-else :class="$style.note" :note="note" :withHardMute="true" :data-scroll-anchor="note.id"/>
			</template>
		</component>
		<button v-show="paginator.canFetchOlder.value" key="_more_" v-appear="prefer.enableInfiniteScroll ? paginator.fetchOlder : null" data-cy-streaming-load-more :disabled="paginator.fetchingOlder.value" class="_button" :class="$style.more" @click="paginator.fetchOlder">
			<div v-if="!paginator.fetchingOlder.value">{{ i18n.ts.loadMore }}</div>
			<MkLoading v-else :inline="true"/>
		</button>
	</div>
</component>
</template>

<script lang="ts" setup>
import { useVirtualizer } from '@tanstack/vue-virtual';
import { computed, watch, onUnmounted, provide, useTemplateRef, TransitionGroup, onMounted, shallowRef, ref, markRaw, nextTick } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@shared/utility/use-interval.js';
import { useDocumentVisibility } from '@shared/utility/use-document-visibility.js';
import { getScrollContainer, scrollToTop } from '@shared/utility/scroll.js';
import type { BasicTimelineType } from '@/timelines.js';
import type { SoundStore } from '@/preferences/def.js';
import type { IPaginator, MisskeyEntity } from '@/utility/paginator.js';
import MkPullToRefresh from '@/components/layout/MkPullToRefresh.vue';
import { useStream } from '@/stream.js';
import * as sound from '@/features/sound/sound.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import { store } from '@/store.js';
import MkNote from '@/features/notes/components/MkNote.vue';
import MkMediaList from '@/features/media-viewer/components/MkMediaList.vue';
import MkButton from '@/components/form/MkButton.vue';
import { i18n } from '@/i18n.js';
import { DI } from '@/di.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { isSeparatorNeeded, getSeparatorInfo } from '@/features/notes/timeline-date-separate.js';
import { Paginator } from '@/utility/paginator.js';
import { notePage } from '@/filters/note.js';

const props = withDefaults(defineProps<{
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
}>(), {
	withRenotes: true,
	withReplies: false,
	withSensitive: true,
	onlyFiles: false,
	viewMode: 'notes',
	sound: false,
	customSound: null,
});

provide('inTimeline', true);
provide('tl_withSensitive', computed(() => props.withSensitive));
provide(DI.inChannel, computed(() => props.src === 'channel' ? props.channel ?? null : null));

let paginator: IPaginator<Misskey.entities.Note>;

function getWithFilesParam(): { withFiles?: true } {
	return props.onlyFiles ? { withFiles: true } : {};
}

if (props.src === 'antenna') {
	paginator = markRaw(new Paginator('antennas/notes', {
		computedParams: computed(() => ({
			antennaId: props.antenna!,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'home') {
	paginator = markRaw(new Paginator('notes/timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			...getWithFilesParam(),
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'local') {
	paginator = markRaw(new Paginator('notes/local-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			...getWithFilesParam(),
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'social') {
	paginator = markRaw(new Paginator('notes/hybrid-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			...getWithFilesParam(),
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'global') {
	paginator = markRaw(new Paginator('notes/global-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			...getWithFilesParam(),
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'mentions') {
	paginator = markRaw(new Paginator('notes/mentions', {
		useShallowRef: true,
	}));
} else if (props.src === 'directs') {
	paginator = markRaw(new Paginator('notes/mentions', {
		params: {
			visibility: 'specified',
		},
		useShallowRef: true,
	}));
} else if (props.src === 'list') {
	paginator = markRaw(new Paginator('notes/user-list-timeline', {
		computedParams: computed(() => ({
			withRenotes: props.withRenotes,
			...getWithFilesParam(),
			listId: props.list!,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'channel') {
	paginator = markRaw(new Paginator('channels/timeline', {
		computedParams: computed(() => ({
			channelId: props.channel!,
		})),
		useShallowRef: true,
	}));
} else if (props.src === 'role') {
	paginator = markRaw(new Paginator('roles/notes', {
		computedParams: computed(() => ({
			roleId: props.role!,
		})),
		useShallowRef: true,
	}));
} else {
	throw new Error('Unrecognized timeline type: ' + props.src);
}

onMounted(() => {
	paginator.init();

	if (paginator.computedParams) {
		watch(paginator.computedParams, () => {
			paginator.reload();
		}, { immediate: false, deep: true });
	}
});

function isTop() {
	if (scrollElement.value == null) return true;
	if (rootEl.value == null) return true;
	return scrollElement.value.scrollTop <= rootScrollMargin.value + 1;
}

const scrollElement = shallowRef<HTMLElement | null>(null);
const scrollMargin = ref(0);
const rootScrollMargin = ref(0);
const canVirtualize = computed(() => props.viewMode === 'notes' && scrollElement.value != null);
const mediaFiles = (note: Misskey.entities.Note) => (note.files ?? []).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
const mediaNotes = computed(() => paginator.items.value.filter(note => {
	const files = mediaFiles(note);
	return files.length > 0 && (props.withSensitive || files.every(file => !file.isSensitive));
}));

const virtualizer = useVirtualizer(computed(() => ({
	count: paginator.items.value.length,
	getScrollElement: () => scrollElement.value,
	estimateSize: () => 220,
	getItemKey: (index) => paginator.items.value[index]?.id ?? index,
	overscan: 5,
	scrollMargin: scrollMargin.value,
	useScrollendEvent: true,
	// 計測適用をrAFに遅延させると、アイテム投入直後に全行 start=0 の縮退フレームが描画される
	// (「全投稿が一瞬重なる」フラッシュの根本原因) ため同期計測にする
	useAnimationFrameWithResizeObserver: false,
})));

const virtualRows = computed(() => virtualizer.value.getVirtualItems().flatMap((virtualItem) => {
	const note = paginator.items.value[virtualItem.index];
	if (note == null) return [];
	const previousNote = paginator.items.value[virtualItem.index - 1];
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

// virtualizerはアイテム投入直後、計測が出揃うまでの1〜数フレームを全行 start=0 (=全行が
// 同座標に重なる) の状態で描画することがある。「全投稿が一瞬グチャッと重なってから展開する」
// フラッシュの正体。対策として初期状態を visibility: hidden にし、DOM更新後・ペイント前に
// 走る flush:'post' watch で実際の行配置を検査して、正常に展開されたときだけ表示する。
// (virtualizer内部のstart値はレンダーとの整合をライブラリ内部実装に依存するため、描画結果の
// DOMそのものを真実として判定する)
const virtualLayoutVerified = ref(false);
let layoutVerifyTimer: number | null = null;

// ゲートが意味を持つのは仮想ブランチが描画されている間だけ。media モード等では検査せず
// 即確定扱いにし (mediaGrid のマルチカラムは同 offsetTop が正常なため誤検出する)、
// 仮想ブランチへ切り替わった時点でラッチをリセットして検査をやり直す
const virtualGateActive = computed(() => props.viewMode === 'notes' && canVirtualize.value);
watch(virtualGateActive, (active, prev) => {
	if (active && !prev) virtualLayoutVerified.value = false;
});

function isVirtualLayoutSane(len: number): boolean {
	if (!virtualGateActive.value) return true; // 仮想ブランチ以外は対象外
	if (len <= 1) return true; // 1件以下なら重なりようがない
	const container = notesEl.value;
	// コンテナや行がまだ出揃っていない (アイテム到着直後の中間レンダー) 間は「未確定」。
	// ここで確定扱いすると、直後に描かれる縮退状態を素通ししてしまう
	if (container == null) return false;
	const rowEls = [...container.children] as HTMLElement[];
	if (rowEls.length < 2) return false;
	// 隣接行が重なっていないかを検査する。縮退状態は「先頭数行が同座標に積み重なり後方は正常」の
	// 混合形で現れるため、全行同topの判定では取りこぼす。高さ0の行 (ハードミュート等) は
	// top が同値でも重ならないので誤検出しない (-2px は丸め誤差の許容)
	for (let i = 1; i < rowEls.length; i++) {
		const prev = rowEls[i - 1]!;
		if (rowEls[i]!.offsetTop < prev.offsetTop + prev.offsetHeight - 2) return false;
	}
	return true;
}

watch([virtualRows, () => paginator.items.value.length], ([, len]) => {
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

const virtualLayoutPending = computed(() => paginator.items.value.length > 0 && !virtualLayoutVerified.value);

function getNoteSeparator(notes: Misskey.entities.Note[], index: number, createdAt: string) {
	const previousNote = notes[index - 1];
	if (previousNote == null || !isSeparatorNeeded(previousNote.createdAt, createdAt)) return null;
	return getSeparatorInfo(previousNote.createdAt, createdAt);
}

const enteringNoteIds = shallowRef(new Set<string>());
const leavingNoteIds = shallowRef(new Set<string>());
const animationTimers = new Map<string, number>();

function measureElement(node: Element | ComponentPublicInstance | null) {
	if (node instanceof Element) virtualizer.value.measureElement(node);
}

function updateScrollMargins() {
	if (!rootEl.value || !notesEl.value || !scrollElement.value) return;
	const rootRect = rootEl.value.getBoundingClientRect();
	const notesRect = notesEl.value.getBoundingClientRect();
	const scrollRect = scrollElement.value.getBoundingClientRect();
	const scrollTop = scrollElement.value.scrollTop;
	rootScrollMargin.value = rootRect.top - scrollRect.top + scrollTop;
	scrollMargin.value = notesRect.top - scrollRect.top + scrollTop;
}

let scrollMarginFrame: number | null = null;
function scheduleScrollMarginUpdate() {
	if (scrollMarginFrame != null) return;
	scrollMarginFrame = window.requestAnimationFrame(() => {
		scrollMarginFrame = null;
		updateScrollMargins();
	});
}

function markNoteEntering(noteId: string) {
	if (!prefer.animation || !canVirtualize.value) return;
	enteringNoteIds.value = new Set(enteringNoteIds.value).add(noteId);
	const timerKey = `enter:${noteId}`;
	const previousTimer = animationTimers.get(timerKey);
	if (previousTimer != null) window.clearTimeout(previousTimer);
	animationTimers.set(timerKey, window.setTimeout(() => {
		const ids = new Set(enteringNoteIds.value);
		ids.delete(noteId);
		enteringNoteIds.value = ids;
		animationTimers.delete(timerKey);
	}, 700));
}

function removeItem(noteId: string) {
	if (!prefer.animation || !canVirtualize.value || !paginator.items.value.some(note => note.id === noteId)) {
		paginator.removeItem(noteId);
		return;
	}
	if (leavingNoteIds.value.has(noteId)) return;
	leavingNoteIds.value = new Set(leavingNoteIds.value).add(noteId);
	const timerKey = `leave:${noteId}`;
	animationTimers.set(timerKey, window.setTimeout(() => {
		paginator.removeItem(noteId);
		const ids = new Set(leavingNoteIds.value);
		ids.delete(noteId);
		leavingNoteIds.value = ids;
		animationTimers.delete(timerKey);
	}, 200));
}

function onScrollContainerScroll() {
	if (isTop()) {
		paginator.releaseQueue();
	}
}

const rootEl = useTemplateRef('rootEl');
const notesEl = useTemplateRef('notesEl');
const containerEl = useTemplateRef('containerEl');

function attachScrollElement(el: HTMLElement | null) {
	const nextScrollElement = getScrollContainer(el);
	// 一度解決したスクロールコンテナは維持する (リロード等で rootEl が一時的に消えても
	// canVirtualize を落とさない。null に戻すと復帰時に非仮想ブランチで全ノートを
	// 無駄にフルマウントしてから仮想ブランチへ入れ替えるスラッシングが起きる)
	if (nextScrollElement == null || nextScrollElement === scrollElement.value) return;
	scrollElement.value?.removeEventListener('scroll', onScrollContainerScroll);
	scrollElement.value = nextScrollElement;
	// 先頭へ戻った瞬間にキューを開放するため、スクロール中も軽量な位置判定だけを行う。
	scrollElement.value.addEventListener('scroll', onScrollContainerScroll, { passive: true });
	nextTick(scheduleScrollMarginUpdate);
}

// ローディング中から存在するコンポーネントルートでスクロールコンテナを先に解決しておく。
// rootEl (ノート描画後にしか存在しない) だけに頼ると、初回表示が非仮想ブランチ→仮想ブランチの
// 二重マウントになり、仮想化レイアウト確定前の1〜2フレームで全行が同座標に重なって見える
watch(containerEl, (comp) => {
	const el = comp == null ? null : comp instanceof HTMLElement ? comp : comp.$el instanceof HTMLElement ? comp.$el : null;
	attachScrollElement(el);
}, { immediate: true });
watch(rootEl, (el) => {
	attachScrollElement(el);
}, { immediate: true });

watch(notesEl, () => nextTick(scheduleScrollMarginUpdate));
watch(() => paginator.queuedAheadItemsCount.value, async () => {
	const previousNotesTop = notesEl.value?.getBoundingClientRect().top;
	await nextTick();
	if (previousNotesTop != null && notesEl.value && scrollElement.value && scrollElement.value.scrollTop > 0) {
		const notesTopDelta = notesEl.value.getBoundingClientRect().top - previousNotesTop;
		scrollElement.value.scrollTop += notesTopDelta;
	}
	scheduleScrollMarginUpdate();
});

onMounted(() => {
	window.addEventListener('resize', scheduleScrollMarginUpdate, { passive: true });
});

onUnmounted(() => {
	scrollElement.value?.removeEventListener('scroll', onScrollContainerScroll);
	window.removeEventListener('resize', scheduleScrollMarginUpdate);
	if (scrollMarginFrame != null) window.cancelAnimationFrame(scrollMarginFrame);
	if (layoutVerifyTimer != null) window.clearTimeout(layoutVerifyTimer);
	for (const timer of animationTimers.values()) window.clearTimeout(timer);
	animationTimers.clear();
});

const visibility = useDocumentVisibility();
let isPausingUpdate = false;

watch(visibility, () => {
	if (visibility.value === 'hidden') {
		isPausingUpdate = true;
	} else { // 'visible'
		isPausingUpdate = false;
		if (isTop()) {
			releaseQueue();
		}
	}
});

let adInsertionCounter = 0;

const MIN_POLLING_INTERVAL = 1000 * 10;
const POLLING_INTERVAL =
	prefer.pollingInterval === 1 ? MIN_POLLING_INTERVAL * 1.5 * 1.5 :
	prefer.pollingInterval === 2 ? MIN_POLLING_INTERVAL * 1.5 :
	MIN_POLLING_INTERVAL;

if (!store.realtimeMode) {
	useInterval(async () => {
		paginator.fetchNewer({
			toQueue: !isTop() || isPausingUpdate,
		});
	}, POLLING_INTERVAL, {
		immediate: false,
		afterMounted: true,
	});

	useGlobalEvent('notePosted', (note) => {
		paginator.fetchNewer({
			toQueue: !isTop() || isPausingUpdate,
		});
	});
}

useGlobalEvent('noteDeleted', (noteId) => {
	removeItem(noteId);
});

useGlobalEvent('noteRemovedFromAntenna', (antennaId, noteId) => {
	if (props.src === 'antenna' && props.antenna === antennaId) {
		removeItem(noteId);
	}
});

function releaseQueue() {
	paginator.releaseQueue();
	scrollToTop(rootEl.value!);
}

function prepend(note: Misskey.entities.Note & MisskeyEntity) {
	adInsertionCounter++;

	if (instance.notesPerOneAd > 0 && adInsertionCounter % instance.notesPerOneAd === 0) {
		note._shouldInsertAd_ = true;
	}

	if (isTop() && !isPausingUpdate) {
		markNoteEntering(note.id);
		paginator.prepend(note);
	} else {
		paginator.enqueue(note);
	}

	if (props.sound) {
		if (props.customSound) {
			sound.playMisskeySfxFile(props.customSound);
		} else {
			sound.playMisskeySfx($i && (note.userId === $i.id) ? 'noteMy' : 'note');
		}
	}
}

const stream = store.realtimeMode ? useStream() : null;

const connections = {
	antenna: null as Misskey.IChannelConnection<Misskey.Channels['antenna']> | null,
	homeTimeline: null as Misskey.IChannelConnection<Misskey.Channels['homeTimeline']> | null,
	localTimeline: null as Misskey.IChannelConnection<Misskey.Channels['localTimeline']> | null,
	hybridTimeline: null as Misskey.IChannelConnection<Misskey.Channels['hybridTimeline']> | null,
	globalTimeline: null as Misskey.IChannelConnection<Misskey.Channels['globalTimeline']> | null,
	main: null as Misskey.IChannelConnection<Misskey.Channels['main']> | null,
	userList: null as Misskey.IChannelConnection<Misskey.Channels['userList']> | null,
	channel: null as Misskey.IChannelConnection<Misskey.Channels['channel']> | null,
	roleTimeline: null as Misskey.IChannelConnection<Misskey.Channels['roleTimeline']> | null,
};

function connectChannel() {
	if (stream == null) return;
	if (props.src === 'antenna') {
		if (props.antenna == null) return;
		connections.antenna = stream.useChannel('antenna', {
			antennaId: props.antenna,
		});
		connections.antenna.on('note', prepend);
	} else if (props.src === 'home') {
		connections.homeTimeline = stream.useChannel('homeTimeline', {
			withRenotes: props.withRenotes,
			...getWithFilesParam(),
		});
		connections.main = stream.useChannel('main');
		connections.homeTimeline.on('note', prepend);
	} else if (props.src === 'local') {
		connections.localTimeline = stream.useChannel('localTimeline', {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			...getWithFilesParam(),
		});
		connections.localTimeline.on('note', prepend);
	} else if (props.src === 'social') {
		connections.hybridTimeline = stream.useChannel('hybridTimeline', {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			...getWithFilesParam(),
		});
		connections.hybridTimeline.on('note', prepend);
	} else if (props.src === 'global') {
		connections.globalTimeline = stream.useChannel('globalTimeline', {
			withRenotes: props.withRenotes,
			...getWithFilesParam(),
		});
		connections.globalTimeline.on('note', prepend);
	} else if (props.src === 'mentions') {
		connections.main = stream.useChannel('main');
		connections.main.on('mention', prepend);
	} else if (props.src === 'directs') {
		connections.main = stream.useChannel('main');
		connections.main.on('mention', note => {
			if (note.visibility === 'specified') {
				prepend(note);
			}
		});
	} else if (props.src === 'list') {
		if (props.list == null) return;
		connections.userList = stream.useChannel('userList', {
			withRenotes: props.withRenotes,
			...getWithFilesParam(),
			listId: props.list,
		});
		connections.userList.on('note', prepend);
	} else if (props.src === 'channel') {
		if (props.channel == null) return;
		connections.channel = stream.useChannel('channel', {
			channelId: props.channel,
		});
		connections.channel.on('note', prepend);
	} else if (props.src === 'role') {
		if (props.role == null) return;
		connections.roleTimeline = stream.useChannel('roleTimeline', {
			roleId: props.role,
		});
		connections.roleTimeline.on('note', prepend);
	}
}

function disconnectChannel() {
	for (const key in connections) {
		const conn = connections[key as keyof typeof connections];
		if (conn != null) {
			conn.dispose();
			connections[key as keyof typeof connections] = null;
		}
	}
}

if (store.realtimeMode) {
	connectChannel();
}

watch(() => [props.list, props.antenna, props.channel, props.role, props.withRenotes], () => {
	if (store.realtimeMode) {
		disconnectChannel();
		connectChannel();
	}
});
watch(() => props.withSensitive, reloadTimeline);

onUnmounted(() => {
	disconnectChannel();
});

function reloadTimeline() {
	return new Promise<void>((res) => {
		adInsertionCounter = 0;

		paginator.reload().then(() => {
			res();
		});
	});
}

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
	--gapFill: 0.5px; // 上位ヘッダーの高さにフォントの関係などで少数が含まれると、レンダリングエンジンによっては隙間が表示されてしまうため、隙間を隠すために少しずらす

	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) - var(--gapFill));
	z-index: 1000;
	width: 100%;
	box-sizing: border-box;
	padding: calc(10px + var(--gapFill)) 0 10px 0;
}

/* 疑似progressive blur */
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
	mask-image: linear-gradient( /* 疑似Easing Linear Gradients */
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
	mask-image: linear-gradient( /* 疑似Easing Linear Gradients */
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
