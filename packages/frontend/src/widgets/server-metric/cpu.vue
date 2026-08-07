<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="vrvdvrys">
	<XPie class="pie" :value="usage"/>
	<div>
		<p><i class="ti ti-cpu" aria-hidden="true"></i>CPU</p>
		<p>{{ meta.cpu.cores }} Logical cores</p>
		<p>{{ meta.cpu.model }}</p>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XPie from './pie.vue';

const props = defineProps<{
	connection: Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
	meta: Misskey.entities.ServerInfoResponse
}>();

const usage = ref<number>(0);

function onStats(stats: Misskey.entities.ServerStats) {
	usage.value = stats.cpu;
}

onMounted(() => {
	props.connection.on('stats', onStats);
});

onBeforeUnmount(() => {
	props.connection.off('stats', onStats);
});
</script>

<style lang="scss" scoped>
@use './pie-metric';

.vrvdvrys {
	@include pie-metric.root;
}
</style>
