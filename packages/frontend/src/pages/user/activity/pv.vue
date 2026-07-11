<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<MkChart src="per-user-pv" :args="{ user }" span="day" :limit="30" :bar="true" :detailed="true"/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkChart from '@/features/charts/components/MkChart.vue';

defineProps<{ user: Misskey.entities.User }>();
</script>

<style lang="scss" module>
.root { padding: 20px; }
</style>
