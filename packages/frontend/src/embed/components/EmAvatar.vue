<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="link ? EmA : 'span'" v-bind="bound" class="_noSelect" :class="[$style.root, { [$style.cat]: user.isCat }]">
	<EmImgWithBlurhash :class="$style.inner" :src="user.avatarUrl" :hash="user.avatarBlurhash" :cover="true" :onlyAvgColor="true"/>
	<div v-if="user.isCat" :class="$style.ears">
		<div :class="$style.earLeft"></div>
		<div :class="$style.earRight"></div>
	</div>
	<img
		v-for="decoration in user.avatarDecorations"
		:class="[$style.decoration]"
		:src="decoration.url"
		:style="{
			rotate: getDecorationAngle(decoration),
			scale: getDecorationScale(decoration),
			translate: getDecorationOffset(decoration),
		}"
		alt=""
	>
</component>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import EmImgWithBlurhash from './EmImgWithBlurhash.vue';
import EmA from './EmA.vue';
import { userPage } from '@/embed/utils.js';
import { getDecorationAngle, getDecorationOffset, getDecorationScale } from '@/shared/utility/avatar-decoration.js';

const props = withDefaults(
	defineProps<{
		user: Misskey.entities.User;
		link?: boolean;
		preview?: boolean;
		indicator?: boolean;
	}>(),
	{
		link: false,
		preview: false,
		indicator: false,
	},
);

const emit = defineEmits<{
	(ev: 'click', v: MouseEvent): void;
}>();

const bound = computed(() => (props.link ? { to: userPage(props.user) } : {}));

</script>

<style lang="scss" module>
@use '@/shared/styles/_avatar.scss' as avatar;

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.decoration, .earLeft, .earRight, .ears, .inner, .layer, .plot, .root {}

@include avatar.base;

.cat {
	@include avatar.cat-ears;
}

@include avatar.decoration;
</style>
