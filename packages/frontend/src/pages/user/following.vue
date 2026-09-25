<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XFollowPage :acct="acct" type="following"/>
</template>

<script lang="ts" setup>
import XFollowPage from './follow-page.vue';

defineProps<{
	acct: string;
}>();
</script>
