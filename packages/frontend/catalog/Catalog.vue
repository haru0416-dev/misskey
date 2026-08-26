<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<nav :class="$style.sidebar">
		<input v-model="filter" :class="$style.filter" type="search" placeholder="絞り込み" aria-label="story を絞り込む">
		<ul :class="$style.list">
			<li v-for="group in groups" :key="group.title">
				<p :class="$style.groupTitle">{{ group.title }}</p>
				<ul>
					<li v-for="entry in group.entries" :key="entry.id">
						<button
							:class="[$style.entry, { [$style.entryActive]: entry.id === selectedId }]"
							type="button"
							@click="select(entry.id)"
						>{{ entry.name }}</button>
					</li>
				</ul>
			</li>
		</ul>
	</nav>

	<main :class="$style.main">
		<header :class="$style.header">
			<span :class="$style.headerTitle">{{ selectedId ?? 'story を選択してください' }}</span>
			<select v-model="theme" :class="$style.theme" aria-label="テーマ">
				<option v-for="id in themeIds()" :key="id" :value="id">{{ id }}</option>
			</select>
		</header>

		<div ref="canvas" :class="[$style.canvas, $style[`layout_${layout}`]]">
			<StoryFrame :key="renderKey" :component="storyComponent"/>
			<PopupHost/>
		</div>

		<section v-if="actions.length > 0" :class="$style.actions">
			<p :class="$style.actionsTitle">actions</p>
			<ol>
				<li v-for="(record, i) in actions" :key="i"><code>{{ record.name }}</code> {{ format(record.args) }}</li>
			</ol>
		</section>
	</main>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { Component } from 'vue';
import type { SetupWorker } from 'msw/browser';
import StoryFrame from './StoryFrame.vue';
import PopupHost from '@/stories/PopupHost.vue';
import { loadStories, type StoryEntry } from './registry.js';
import { buildStoryComponent, createStoryContext } from '@/stories/render.js';
import { applyStoryHandlers, resetIndexedDb, resetLocalStorage, resetPopups, themeIds } from '@/stories/environment.js';
import { onAction, type ActionRecord } from '@/stories/action.js';

const props = defineProps<{
	worker: SetupWorker;
}>();

const entries = shallowRef<StoryEntry[]>([]);
const filter = ref('');
const selectedId = ref<string | null>(null);
const storyComponent = shallowRef<Component | null>(null);
const layout = ref<'centered' | 'fullscreen' | 'padded'>('padded');
const actions = ref<ActionRecord[]>([]);
const theme = ref(document.documentElement.dataset['misskeyTheme'] ?? 'l-light');
// story を選び直したときは同じ story でも作り直す。
const renderKey = ref(0);

const canvas = useTemplateRef<HTMLElement>('canvas');
const groups = computed(() => {
	const needle = filter.value.trim().toLowerCase();
	const matched = needle === '' ? entries.value : entries.value.filter((e) => e.id.toLowerCase().includes(needle));

	const byTitle = new Map<string, StoryEntry[]>();
	for (const entry of matched) {
		const list = byTitle.get(entry.title);
		if (list == null) byTitle.set(entry.title, [entry]);
		else list.push(entry);
	}
	return [...byTitle].map(([title, list]) => ({ title, entries: list }));
});

function format(args: unknown[]): string {
	try {
		return JSON.stringify(args);
	} catch {
		return '[表示できない値]';
	}
}

// 切り替えが速いと select() が重なり、描画途中の component を作り直して Vue が壊れる。
// 最後に始めた選択だけを反映する。
let selectionToken = 0;

async function select(id: string): Promise<void> {
	const entry = entries.value.find((e) => e.id === id);
	if (entry == null) return;

	const token = ++selectionToken;
	selectedId.value = id;
	if (decodeURIComponent(window.location.hash.slice(1)) !== id) {
		window.location.hash = encodeURIComponent(id);
	}
	actions.value = [];

	// story 間で状態が漏れないよう、毎回同じ初期状態へ戻す。
	await resetIndexedDb();
	await resetPopups();
	resetLocalStorage();

	const story = await entry.load();
	if (token !== selectionToken) return;

	applyStoryHandlers(props.worker, story.parameters?.msw);
	layout.value = story.parameters?.layout ?? 'padded';
	renderKey.value += 1;
	storyComponent.value = buildStoryComponent(story, createStoryContext(story, canvas.value ?? document.body));
}

watch(theme, (value) => {
	document.documentElement.dataset['misskeyTheme'] = value;
});

let stopAction = (): void => {};

function onHashChange(): void {
	const id = decodeURIComponent(window.location.hash.slice(1));
	if (id !== '' && id !== selectedId.value) void select(id);
}

onMounted(async () => {
	stopAction = onAction((record) => {
		actions.value = [...actions.value.slice(-49), record];
	});

	entries.value = await loadStories();

	const fromHash = decodeURIComponent(window.location.hash.slice(1));
	const initial = entries.value.find((e) => e.id === fromHash) ?? entries.value[0];
	if (initial != null) await select(initial.id);

	window.addEventListener('hashchange', onHashChange);
});

onUnmounted(() => {
	stopAction();
	window.removeEventListener('hashchange', onHashChange);
});
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: 320px minmax(0, 1fr);
	height: 100dvh;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
}

.sidebar {
	display: flex;
	flex-direction: column;
	min-height: 0;
	border-right: solid 1px var(--MI_THEME-divider);
}

.filter {
	margin: 12px;
	padding: 6px 10px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	color: inherit;
	font: inherit;
}

.list {
	flex: 1;
	overflow-y: auto;
	margin: 0;
	padding: 0 0 24px;
	list-style: none;

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
}

.groupTitle {
	margin: 12px 12px 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
	word-break: break-all;
}

.entry {
	display: block;
	width: 100%;
	padding: 4px 12px 4px 24px;
	border: none;
	background: none;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.entryActive {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.main {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.headerTitle {
	flex: 1;
	overflow: hidden;
	font-weight: 700;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.theme {
	padding: 4px 8px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	color: inherit;
	font: inherit;
}

.canvas {
	flex: 1;
	min-height: 0;
	overflow: auto;
}

.layout_padded {
	padding: 24px;
}

.layout_centered {
	display: grid;
	place-items: center;
	padding: 24px;
}

.layout_fullscreen {
	padding: 0;
}

.actions {
	max-height: 30%;
	overflow-y: auto;
	padding: 8px 16px 16px;
	border-top: solid 1px var(--MI_THEME-divider);
	font-size: 0.85em;

	ol {
		margin: 0;
		padding-left: 20px;
	}
}

.actionsTitle {
	margin: 0 0 4px;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
