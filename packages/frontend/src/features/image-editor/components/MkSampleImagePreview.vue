<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<canvas ref="canvasEl" :class="$style.previewCanvas"></canvas>
<div :class="$style.previewContainer">
	<div class="_acrylic" :class="$style.previewTitle">{{ i18n.ts.preview }}</div>
	<div v-if="showSampleControls" class="_acrylic" :class="$style.previewControls">
		<button class="_button" :class="[$style.previewControlsButton, sampleImageType === '3_2' ? $style.active : null]" @click="sampleImageType = '3_2'"><i class="ti ti-crop-landscape"></i></button>
		<button class="_button" :class="[$style.previewControlsButton, sampleImageType === '2_3' ? $style.active : null]" @click="sampleImageType = '2_3'"><i class="ti ti-crop-portrait"></i></button>
		<button class="_button" :class="[$style.previewControlsButton]" @click="emit('chooseImage')"><i class="ti ti-upload"></i></button>
	</div>
</div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue';
import type { SampleImageType } from '@/features/image-editor/sample-image-preview.js';
import { i18n } from '@/i18n.js';

defineProps<{
	showSampleControls: boolean;
}>();

const emit = defineEmits<{
	(ev: 'chooseImage'): void;
}>();

const sampleImageType = defineModel<SampleImageType>('sampleImageType', { required: true });

const canvasEl = useTemplateRef('canvasEl');

defineExpose({ canvasEl });
</script>

<style module>
.previewContainer {
	display: flex;
	flex-direction: column;
	height: 100%;
	user-select: none;
	-webkit-user-drag: none;
}

.previewTitle {
	position: absolute;
	z-index: 100;
	top: 8px;
	left: 8px;
	padding: 6px 10px;
	border-radius: 6px;
	font-size: 85%;
}

.previewControls {
	position: absolute;
	z-index: 100;
	bottom: 8px;
	right: 8px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	border-radius: 6px;
}

.previewControlsButton {
	&.active {
		color: var(--MI_THEME-accent);
	}
}

.previewCanvas {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	padding: 20px;
	box-sizing: border-box;
	object-fit: contain;
}
</style>
