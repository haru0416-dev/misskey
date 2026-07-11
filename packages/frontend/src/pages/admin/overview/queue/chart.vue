<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkDataChart :series="series" :ariaLabel="label" :height="200" :detailed="false"/>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkDataChart from '@/components/MkDataChart.vue';
import { chartText } from '@/utility/chart-i18n.js';

const props = defineProps<{ type: string }>();
const values = ref<number[]>([]);
const label = computed(() => props.type === 'process' ? chartText('process') : props.type === 'active' ? chartText('active') : props.type === 'delayed' ? chartText('delayed') : chartText('waiting'));
const series = computed(() => [{
	name: label.value,
	type: 'area' as const,
	data: values.value.map((y, index) => ({ x: Date.now() - (values.value.length - index - 1) * 1000, y })),
}]);
function setData(next: number[]) { values.value = [...values.value, ...next].slice(-100); }
function pushData(value: number) { values.value = [...values.value, value].slice(-100); }
defineExpose({ setData, pushData });
</script>
