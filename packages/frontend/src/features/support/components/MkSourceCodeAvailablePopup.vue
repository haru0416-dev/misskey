<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel _shadow" :class="$style.root">
	<div :class="$style.icon">
		<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-brand-open-source" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
			<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
			<path d="M12 3a9 9 0 0 1 3.618 17.243l-2.193 -5.602a3 3 0 1 0 -2.849 0l-2.193 5.603a9 9 0 0 1 3.617 -17.244z"/>
		</svg>
	</div>
	<div :class="$style.main">
		<div :class="$style.title">
			<I18n :src="i18n.ts.aboutX" tag="span">
				<template #x>
					{{ instance.name ?? host }}
				</template>
			</I18n>
		</div>
		<div :class="$style.text">
			<I18n :src="i18n.ts._aboutMisskey.thisIsModifiedVersion" tag="span">
				<template #name>
					{{ instance.name ?? host }}
				</template>
			</I18n>
			<I18n :src="i18n.ts.correspondingSourceIsAvailable" tag="span">
				<template #anchor>
					<MkA to="/about-misskey" class="_link">{{ i18n.ts.aboutMisskey }}</MkA>
				</template>
			</I18n>
		</div>
		<div class="_buttons">
			<MkButton @click="close">{{ i18n.ts.gotIt }}</MkButton>
		</div>
	</div>
	<button class="_button" :class="$style.close" @click="close"><i class="ti ti-x"></i></button>
</div>
</template>

<script lang="ts" setup>
import MkButton from '@/components/form/MkButton.vue';
import { host } from '@shared/utility/config.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { miLocalStorage } from '@/local-storage.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const zIndex = os.claimZIndex('low');

function close() {
	miLocalStorage.setItem('modifiedVersionMustProminentlyOfferInAgplV3Section13Read', 'true');
	emit('closed');
}
</script>

<style lang="scss" module>
@use './bottom-notice-popup';

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.close, .icon, .main, .root, .text, .title {}

@include bottom-notice-popup.styles;

.root {
	z-index: v-bind(zIndex);
}
</style>
