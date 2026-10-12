<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span>
	<span>@{{ user.username }}</span>
	<span v-if="user.host || detail" :class="$style.host">@{{ user.host || host }}</span>
</span>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { toUnicode } from '@/utility/punycode.js';
import { host as hostRaw } from '@/shared/utility/config.js';

defineProps<{
	user: Misskey.entities.UserLite;
	detail?: boolean;
}>();

const host = toUnicode(hostRaw);
</script>

<style lang="scss" module>
/* 名前の色から薄める。opacity 0.5 では Toneriko Dark で 2.7 になる */
.host {
	color: color-mix(in srgb, currentColor 85%, transparent);
}
</style>
