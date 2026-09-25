<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 1200px;">
		<MkAchievements :user="$i"/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import MkAchievements from '@/features/achievements/components/MkAchievements.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { ensureSignin } from '@/i.js';
import { useViewAchievementsTimer } from '@/features/achievements/use-view-achievements-timer.js';

const $i = ensureSignin();

useViewAchievementsTimer();

definePage(() => ({
	title: i18n.ts.achievements,
	icon: 'ti ti-medal',
}));
</script>
