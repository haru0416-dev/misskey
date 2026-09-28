<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 800px;">
	<div>
		<UserNotesTimeline :user="user" :pullToRefresh="true"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import UserNotesTimeline from './UserNotesTimeline.vue';

defineProps<{
	user: Misskey.entities.UserDetailed;
}>();
</script>
