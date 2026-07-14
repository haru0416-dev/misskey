<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="el" :class="$style.tabs" :style="{ '--tabAnchorName': tabAnchorName }" @wheel="onTabWheel">
	<div :class="$style.tabsInner">
		<button
			v-for="t in tabs"
			:ref="(el) => tabRefs[t.key] = (el as HTMLElement)"
			v-tooltip.noDelay="t.title"
			:aria-label="t.title"
			class="_button"
			:class="[$style.tab, {
				[$style.active]: t.key != null && t.key === props.tab,
				[$style.animate]: prefer.animation
			}]"
			:style="getTabStyle(t)"
			@mousedown="(ev) => onTabMousedown(t, ev)"
			@click="(ev) => onTabClick(t, ev)"
		>
			<div :class="$style.tabInner">
				<i v-if="t.icon" :class="[$style.tabIcon, t.icon]"></i>
				<div
					v-if="!t.iconOnly || (!prefer.animation && t.key === tab)"
					:class="$style.tabTitle"
				>
					{{ t.title }}
				</div>
				<Transition
					v-else mode="in-out" @enter="enter" @afterEnter="afterEnter" @leave="leave"
					@afterLeave="afterLeave"
				>
					<div v-show="t.key === tab" :class="[$style.tabTitle, $style.animate]">{{ t.title }}</div>
				</Transition>
			</div>
		</button>
	</div>
	<div
		ref="tabHighlightEl"
		:class="[$style.tabHighlight, { [$style.animate]: prefer.animation }]"
	></div>
</div>
</template>

<script lang="ts">
import type { Tab } from '@/components/layout/MkTabs.vue';

export type { Tab };
</script>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { prefer } from '@/preferences.js';
import { genId } from '@/utility/id.js';

const cssAnchorSupported = CSS.supports('position-anchor', '--anchor-name');
const tabAnchorName = `--${genId()}-currentTab`;

const props = withDefaults(defineProps<{
	tabs?: Tab[];
	tab?: string;
	rootEl?: HTMLElement | null;
}>(), {
	tabs: () => ([] as Tab[]),
});

const emit = defineEmits<{
	(ev: 'update:tab', key: string): void;
	(ev: 'tabClick', key: string): void;
}>();

const el = useTemplateRef('el');
const tabHighlightEl = useTemplateRef('tabHighlightEl');
const tabRefs: Record<string, HTMLElement | null> = {};

function getTabStyle(t: Tab) {
	if (!cssAnchorSupported) return {};
	if (t.key === props.tab) {
		return {
			anchorName: tabAnchorName,
		};
	} else {
		return {};
	}
}

function onTabMousedown(tab: Tab, ev: MouseEvent): void {
	// ユーザビリティの観点からmousedown時にはonClickは呼ばない
	if (tab.key) {
		emit('update:tab', tab.key);
	}
}

function onTabClick(t: Tab, ev: PointerEvent): void {
	emit('tabClick', t.key);

	if (t.onClick) {
		ev.preventDefault();
		ev.stopPropagation();
		t.onClick(ev);
	}

	if (t.key) {
		emit('update:tab', t.key);
	}
}

function renderTab() {
	if (cssAnchorSupported) return;

	const tabEl = props.tab ? tabRefs[props.tab] : undefined;
	if (tabEl && tabHighlightEl.value && tabHighlightEl.value.parentElement) {
		// offsetWidth や offsetLeft は少数を丸めてしまうため getBoundingClientRect を使う必要がある
		// https://developer.mozilla.org/ja/docs/Web/API/HTMLElement/offsetWidth#%E5%80%A4
		const parentRect = tabHighlightEl.value.parentElement.getBoundingClientRect();
		const rect = tabEl.getBoundingClientRect();
		tabHighlightEl.value.style.width = rect.width + 'px';
		tabHighlightEl.value.style.left = (rect.left - parentRect.left + tabHighlightEl.value.parentElement.scrollLeft) + 'px';
	}
}

function onTabWheel(ev: WheelEvent) {
	if (ev.deltaY !== 0 && ev.deltaX === 0) {
		ev.preventDefault();
		ev.stopPropagation();
		(ev.currentTarget as HTMLElement).scrollBy({
			left: ev.deltaY,
			behavior: 'instant',
		});
	}
	return false;
}

let entering = false;

async function enter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	entering = true;
	const elementWidth = el.getBoundingClientRect().width;
	el.style.width = '0';
	el.style.paddingLeft = '0';
	el.offsetWidth; // reflow
	el.style.width = `${elementWidth}px`;
	el.style.paddingLeft = '';
	nextTick(() => {
		entering = false;
	});

	window.setTimeout(renderTab, 170);
}

function afterEnter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
}

async function leave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementWidth = el.getBoundingClientRect().width;
	el.style.width = `${elementWidth}px`;
	el.style.paddingLeft = '';
	el.offsetWidth; // reflow
	el.style.width = '0';
	el.style.paddingLeft = '0';
}

function afterLeave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.width = '';
}

let ro2: ResizeObserver | null;

// タブがオーバーフローしているとき、アクティブタブを可視域中央へスクロールする
function scrollActiveTabIntoView() {
	const tabEl = props.tab ? tabRefs[props.tab] : null;
	if (!tabEl || !el.value || el.value.scrollWidth <= el.value.clientWidth) return;
	const rect = tabEl.getBoundingClientRect();
	const parentRect = el.value.getBoundingClientRect();
	el.value.scrollTo({
		left: el.value.scrollLeft + rect.left - parentRect.left - (el.value.clientWidth - rect.width) / 2,
		behavior: prefer.animation ? 'smooth' : 'instant',
	});
}

onMounted(() => {
	// tabsは非同期に到着するため props.tabs も監視する。ラベル展開Transition(150ms)後に座標が確定するため遅延補正も行う
	watch([() => props.tab, () => props.tabs], () => {
		nextTick(() => scrollActiveTabIntoView());
		window.setTimeout(scrollActiveTabIntoView, 170);
	}, { immediate: true });

	if (!cssAnchorSupported) {
		watch([() => props.tab, () => props.tabs], () => {
			nextTick(() => {
				if (entering) return;
				renderTab();
			});
		}, {
			immediate: true,
		});

		if (props.rootEl) {
			ro2 = new ResizeObserver(() => {
				if (window.document.body.contains(el.value as HTMLElement)) {
					nextTick(() => renderTab());
				}
			});
			ro2.observe(props.rootEl);
		}
	}
});

onUnmounted(() => {
	if (ro2) ro2.disconnect();
});
</script>

<style lang="scss" module>
.tabs {
	display: block;
	position: relative;
	margin: 0;
	height: var(--height);
	font-size: 0.84em;
	text-align: center;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;

	/* オーバーフロー時のみ見切れ側をフェード (タイムラインはオーバーフロー無しだと不活性 = マスク非適用) */
	@supports (animation-timeline: scroll()) {
		scroll-timeline: --tabsScroll x;
		animation: tabsEdgeFade linear both;
		animation-timeline: --tabsScroll; /* shorthandがtimelineをリセットするため必ず後に書く */
	}
}

@keyframes tabsEdgeFade {
	0% { mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%); }
	100% { mask-image: linear-gradient(to right, transparent 0, #000 32px, #000 100%); }
}

.tabsInner {
	display: inline-block;
	height: var(--height);
	white-space: nowrap;
}

.tab {
	display: inline-block;
	position: relative;
	padding: 0 12px;
	height: 100%;
	font-weight: 500;
	color: color-mix(in oklab, var(--MI_THEME-pageHeaderFg) 72%, transparent);

	&:hover {
		color: var(--MI_THEME-pageHeaderFg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		font-weight: 650;
	}

	&.animate {
		transition: color var(--MI-duration-fast) var(--MI-ease-out);
	}
}

.tabInner {
	display: flex;
	align-items: center;
}

.tabIcon + .tabTitle {
	padding-left: 4px;
}

.tabTitle {
	overflow: hidden;

	&.animate {
		transition: width .15s linear, padding-left .15s linear;
	}
}

.tabHighlight {
	position: absolute;
	bottom: 0;
	height: 2px;
	background: var(--MI_THEME-accent);
	border-radius: 999px;
	transition: none;
	pointer-events: none;

	&.animate {
		transition: width var(--MI-duration-normal) var(--MI-ease-out), left var(--MI-duration-normal) var(--MI-ease-out);
	}
}

@supports (position-anchor: --anchor-name) {
	.tabHighlight {
		left: anchor(var(--tabAnchorName) start);
		width: anchor-size(var(--tabAnchorName) width);
	}
}
</style>
