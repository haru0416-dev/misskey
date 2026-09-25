<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="link ? MkA : 'span'" v-user-preview="preview ? user.id : undefined" v-bind="bound" class="_noSelect" :class="[$style.root, { [$style.animation]: animation, [$style.cat]: user.isCat, [$style.square]: squareAvatars }]" :style="{ color }" :title="acct(user)" @click="onClick">
	<MkImgWithBlurhash v-if="prefer.enableHighQualityImagePlaceholders" :class="$style.inner" :src="url" :hash="user.avatarBlurhash" :cover="true" :onlyAvgColor="true"/>
	<img v-else :class="$style.inner" :src="url" alt="" decoding="async" style="pointer-events: none;"/>
	<MkUserOnlineIndicator v-if="indicator" :class="$style.indicator" :user="user"/>
	<div v-if="user.isCat" :class="[$style.ears]">
		<div :class="$style.earLeft">
			<div v-if="false" :class="$style.layer">
				<div :class="$style.plot" :style="{ backgroundImage: `url(${JSON.stringify(url)})` }"></div>
				<div :class="$style.plot" :style="{ backgroundImage: `url(${JSON.stringify(url)})` }"></div>
				<div :class="$style.plot" :style="{ backgroundImage: `url(${JSON.stringify(url)})` }"></div>
			</div>
		</div>
		<div :class="$style.earRight">
			<div v-if="false" :class="$style.layer">
				<div :class="$style.plot" :style="{ backgroundImage: `url(${JSON.stringify(url)})` }"></div>
				<div :class="$style.plot" :style="{ backgroundImage: `url(${JSON.stringify(url)})` }"></div>
				<div :class="$style.plot" :style="{ backgroundImage: `url(${JSON.stringify(url)})` }"></div>
			</div>
		</div>
	</div>
	<template v-if="showDecoration">
		<img
			v-for="decoration in decorations ?? user.avatarDecorations"
			:class="[$style.decoration, { [$style.decorationBlink]: getDecorationIsBrink(decoration) }]"
			:src="getDecorationUrl(decoration)"
			:style="{
				rotate: getDecorationAngle(decoration),
				scale: getDecorationScale(decoration),
				translate: getDecorationOffset(decoration),
			}"
			alt=""
			draggable="false"
			style="-webkit-user-drag: none;"
		>
	</template>
</component>
</template>

<script lang="ts" setup>
import { watch, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import { extractAvgColorFromBlurhash } from '@shared/utility/extract-avg-color-from-blurhash.js';
import { getDecorationAngle, getDecorationOffset, getDecorationScale } from '@shared/utility/avatar-decoration.js';
import MkImgWithBlurhash from '@/features/media-viewer/components/MkImgWithBlurhash.vue';
import MkA from './MkA.vue';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { acct, userPage } from '@/filters/user.js';
import MkUserOnlineIndicator from '@/features/users/components/MkUserOnlineIndicator.vue';
import { prefer } from '@/preferences.js';

const animation = ref(prefer.animation);
const squareAvatars = ref(prefer.squareAvatars);

type Decoration = Misskey.entities.UserDetailed['avatarDecorations'][number];
type DecorationEditorDecoration = Omit<Misskey.entities.UserDetailed['avatarDecorations'][number], 'id'> & {
	blink?: boolean;
};

const props = withDefaults(
	defineProps<{
		user: Misskey.entities.User;
		target?: string | null;
		link?: boolean;
		preview?: boolean;
		indicator?: boolean;
		decorations?: DecorationEditorDecoration[];
		forceShowDecoration?: boolean;
	}>(),
	{
		target: null,
		link: false,
		preview: false,
		indicator: false,
		forceShowDecoration: false,
	},
);

const emit = defineEmits<{
	(ev: 'click', v: PointerEvent): void;
}>();

const showDecoration = props.forceShowDecoration || prefer.showAvatarDecorations;

const bound = computed(() => (props.link ? { to: userPage(props.user), target: props.target } : {}));

const url = computed(() => {
	if (prefer.disableShowingAnimatedImages || prefer.dataSaver.avatar) {
		return getStaticImageUrl(props.user.avatarUrl);
	}
	return props.user.avatarUrl;
});

function onClick(ev: PointerEvent): void {
	if (props.link) {
		return;
	}
	emit('click', ev);
}

function getDecorationUrl(decoration: Decoration | DecorationEditorDecoration) {
	if (prefer.disableShowingAnimatedImages || prefer.dataSaver.avatar) {
		return getStaticImageUrl(decoration.url);
	}
	return decoration.url;
}

function getDecorationIsBrink(decoration: Decoration | DecorationEditorDecoration) {
	return 'blink' in decoration && decoration.blink === true;
}

const color = ref<string | undefined>();

watch(
	() => props.user.avatarBlurhash,
	() => {
		if (props.user.avatarBlurhash == null) {
			return;
		}
		color.value = extractAvgColorFromBlurhash(props.user.avatarBlurhash);
	},
	{
		immediate: true,
	},
);
</script>

<style lang="scss" module>
@use '@shared/styles/_avatar.scss' as avatar;

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.decoration, .indicator, .layer, .plot, .root {}

@keyframes earwiggleleft {
	from { transform: rotate(37.6deg) skew(30deg); }
	25% { transform: rotate(10deg) skew(30deg); }
	50% { transform: rotate(20deg) skew(30deg); }
	75% { transform: rotate(0deg) skew(30deg); }
	to { transform: rotate(37.6deg) skew(30deg); }
}

@keyframes earwiggleright {
	from { transform: rotate(-37.6deg) skew(-30deg); }
	30% { transform: rotate(-10deg) skew(-30deg); }
	55% { transform: rotate(-20deg) skew(-30deg); }
	75% { transform: rotate(0deg) skew(-30deg); }
	to { transform: rotate(-37.6deg) skew(-30deg); }
}

@keyframes eartightleft {
	from { transform: rotate(37.6deg) skew(30deg); }
	50% { transform: rotate(37.4deg) skew(30deg); }
	to { transform: rotate(37.6deg) skew(30deg); }
}

@keyframes eartightright {
	from { transform: rotate(-37.6deg) skew(-30deg); }
	50% { transform: rotate(-37.4deg) skew(-30deg); }
	to { transform: rotate(-37.6deg) skew(-30deg); }
}

@include avatar.base;

.square {
	border-radius: 20%;

	> .inner {
		border-radius: 20%;
	}
}

.cat {
	@include avatar.cat-ears;

	&.animation:hover {
		> .ears {
			> .earLeft {
				animation: earwiggleleft 1s infinite;
			}

			> .earRight {
				animation: earwiggleright 1s infinite;
			}
		}
	}
}

@include avatar.decoration;

.decorationBlink {
	animation: blink 1s infinite;
}

@keyframes blink {
	0%, 100% {
		filter: brightness(2);
	}
	50% {
		filter: brightness(1);
	}
}
</style>
