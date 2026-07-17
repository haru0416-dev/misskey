<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<XWidgets
		:edit="editMode"
		:widgets="widgets"
		@addWidget="addWidget"
		@removeWidget="removeWidget"
		@updateWidget="updateWidget"
		@updateWidgets="updateWidgets"
		@exit="editMode = false"
	/>

	<button v-if="editMode" class="_textButton" :class="$style.toggle" @click="editMode = false"><i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts.editWidgetsExit }}</button>
	<button v-else class="_textButton" data-cy-widget-edit :class="$style.toggle" @click="editMode = true"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.editWidgets }}</button>
</div>
</template>

<script lang="ts">
import { computed, ref } from 'vue';
const editMode = ref(false);
</script>

<script lang="ts" setup>
import type { DefaultStoredWidget, Widget } from '@/widgets/components/MkWidgets.vue';
import XWidgets from '@/widgets/components/MkWidgets.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	// null = 全てのウィジェットを表示
	// left = place: leftだけを表示
	// right = rightとnullを表示
	place?: 'left' | null | 'right';
}>(), {
	place: null,
});

const widgets = computed(() => {
	if (props.place === null) return prefer.widgets;
	if (props.place === 'left') return prefer.widgets.filter(w => w.place === 'left');
	return prefer.widgets.filter(w => w.place !== 'left');
});

function addWidget(widget: Widget) {
	prefer.commit('widgets', [{
		...widget,
		place: props.place,
	}, ...prefer.widgets]);
}

function removeWidget(widget: Widget) {
	prefer.commit('widgets', prefer.widgets.filter(w => w.id !== widget.id));
}

function updateWidget(widget: { id: Widget['id']; data: Widget['data']; }) {
	prefer.commit('widgets', prefer.widgets.map(w => w.id === widget.id ? {
		...w,
		data: widget.data,
		place: props.place,
	} : w));
}

function updateWidgets(thisWidgets: Widget[]) {
	if (props.place === null) {
		prefer.commit('widgets', thisWidgets as DefaultStoredWidget[]);
		return;
	}

	if (props.place === 'left') {
		prefer.commit('widgets', [
			...thisWidgets.map(w => ({ ...w, place: 'left' })),
			...prefer.widgets.filter(w => w.place !== 'left' && !thisWidgets.some(t => w.id === t.id)),
		]);
		return;
	}

	prefer.commit('widgets', [
		...prefer.widgets.filter(w => w.place === 'left' && !thisWidgets.some(t => w.id === t.id)),
		...thisWidgets.map(w => ({ ...w, place: 'right' })),
	]);
}
</script>

<style lang="scss" module>
.toggle {
	width: 100%;
	margin-top: var(--MI-space-lg);
	font-size: 0.9em;
}
</style>
