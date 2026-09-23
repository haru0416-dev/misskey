<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="loaded">
	<XSetup v-if="instance.requireSetup"/>
	<XEntranceClassic v-else-if="(instance.clientOptions.entrancePageStyle ?? 'classic') === 'classic'"/>
	<XEntranceSimple v-else/>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { instanceName } from '@shared/utility/config.js';
import XSetup from './setup.vue';
import XEntranceClassic from './entrance/classic.vue';
import XEntranceSimple from './entrance/simple.vue';
import { definePage } from '@/page.js';
import { instance, fetchInstance } from '@/instance.js';

const loaded = ref(false);

fetchInstance(true).then(() => {
	loaded.value = true;
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: instanceName,
	icon: null,
}));
</script>
