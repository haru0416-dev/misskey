<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<UserNotesTimeline :user="user" :pullToRefresh="false"/>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import UserNotesTimeline from '../UserNotesTimeline.vue';

defineProps<{
	user: Misskey.entities.UserDetailed;
}>();
</script>
