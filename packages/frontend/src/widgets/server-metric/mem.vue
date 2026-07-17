<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="zlxnikvl">
	<XPie class="pie" :value="usage"/>
	<div>
		<p><i class="ti ti-section" aria-hidden="true"></i>RAM</p>
		<p>Total: {{ bytes(total, 1) }}</p>
		<p>Used: {{ bytes(used, 1) }}</p>
		<p>Free: {{ bytes(free, 1) }}</p>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XPie from './pie.vue';
import bytes from '@/filters/bytes.js';

const props = defineProps<{
	connection: Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
	meta: Misskey.entities.ServerInfoResponse
}>();

const usage = ref<number>(0);
const total = computed(() => props.meta.mem.total);
const used = ref<number>(0);
const free = computed(() => total.value - used.value);

function onStats(stats: Misskey.entities.ServerStats) {
	usage.value = stats.mem.active / props.meta.mem.total;
	used.value = stats.mem.active;
}

onMounted(() => {
	props.connection.on('stats', onStats);
});

onBeforeUnmount(() => {
	props.connection.off('stats', onStats);
});
</script>

<style lang="scss" scoped>
.zlxnikvl {
	display: flex;
	padding: var(--MI-space-lg);

	> .pie {
		height: 82px;
		flex-shrink: 0;
		margin-right: var(--MI-space-lg);
	}

	> div {
		flex: 1;

		> p {
			margin: 0;
			font-size: 0.8em;

			&:first-child {
				font-weight: bold;
				margin-bottom: var(--MI-space-xs);

				> i {
					margin-right: var(--MI-space-xs);
				}
			}
		}
	}
}
</style>
