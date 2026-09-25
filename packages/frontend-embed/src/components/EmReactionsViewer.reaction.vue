<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	class="_button"
	:class="[$style.root, { [$style.reacted]: note.myReaction == reaction }]"
>
	<EmReactionIcon :class="$style.limitWidth" :reaction="reaction" :emojiUrl="note.reactionEmojis[reaction.substring(1, reaction.length - 1)]"/>
	<span :class="$style.count">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import EmReactionIcon from '@/components/EmReactionIcon.vue';

const props = defineProps<{
	reaction: string;
	count: number;
	isInitial: boolean;
	note: Misskey.entities.Note;
}>();
</script>

<style lang="scss" module>
@use '@shared/styles/reaction';

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.count, .limitWidth, .reacted, .root {}

@include reaction.base($margin: 2px);
</style>
