<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1200px;">
	<MkAchievements :user="user" :withLocked="false" :withDescription="$i != null && (props.user.id === $i.id)"/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkAchievements from '@/features/achievements/components/MkAchievements.vue';
import { useViewAchievementsTimer } from '@/features/achievements/use-view-achievements-timer.js';
import { $i } from '@/i.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

useViewAchievementsTimer(() => $i != null && props.user.id === $i.id);
</script>
