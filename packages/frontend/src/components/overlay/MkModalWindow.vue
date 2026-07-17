<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :preferType="deviceKind === 'smartphone' ? 'drawer' : 'dialog'" @click="onBgClick" @closed="emit('closed')" @esc="emit('esc')">
	<div ref="rootEl" role="dialog" aria-modal="true" :class="[$style.root, type === 'drawer' ? $style.asDrawer : null]" :style="{ width: type === 'drawer' ? '' : `${width}px`, height: type === 'drawer' ? '' : `min(${height}px, 100%)` }">
		<div :class="$style.header">
			<button v-if="withCloseButton" :class="$style.headerButton" class="_button" :aria-label="i18n.ts.close" data-cy-modal-window-close @click="emit('close')"><i class="ti ti-x" aria-hidden="true"></i></button>
			<span :class="$style.title">
				<slot name="header"></slot>
			</span>
			<div v-if="withOkButton" style="padding: 0 16px; place-content: center;">
				<MkButton primary gradate small rounded :disabled="okButtonDisabled" @click="emit('ok')">{{ i18n.ts.done }} <i class="ti ti-check"></i></MkButton>
			</div>
		</div>
		<div :class="$style.body">
			<slot></slot>
		</div>
		<div v-if="slots.footer" :class="$style.footer">
			<slot name="footer"></slot>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, useTemplateRef, ref } from 'vue';
import MkModal from '@/components/overlay/MkModal.vue';
import MkButton from '@/components/form/MkButton.vue';
import { i18n } from '@/i18n';
import { deviceKind } from '@/utility/device-kind.js';

const props = withDefaults(defineProps<{
	withOkButton?: boolean;
	withCloseButton?: boolean;
	okButtonDisabled?: boolean;
	width?: number;
	height?: number;
}>(), {
	withOkButton: false,
	withCloseButton: true,
	okButtonDisabled: false,
	width: 400,
	height: 500,
});

const emit = defineEmits<{
	(event: 'click'): void;
	(event: 'close'): void;
	(event: 'closed'): void;
	(event: 'ok'): void;
	(event: 'esc'): void;
}>();

const slots = defineSlots<{
	default?: () => void;
	header?: () => void;
	footer?: () => void;
}>();

const modal = useTemplateRef('modal');

function close() {
	modal.value?.close();
}

function onBgClick() {
	emit('click');
}

defineExpose({
	close,
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	contain: content;
	border-radius: var(--MI-radius);

	--root-margin: 24px;

	--headerHeight: 46px;
	--headerHeightNarrow: 42px;

	@media (max-width: 500px) {
		--root-margin: 16px;
	}

	&.asDrawer {
		height: calc(100dvh - 30px);
		border-radius: 0;

		.body {
			padding-bottom: env(safe-area-inset-bottom, 0px);
		}

		.footer {
			padding-bottom: max(12px, env(safe-area-inset-bottom, 0px));
		}
	}
}

.header {
	display: flex;
	flex-shrink: 0;
	background: var(--MI_THEME-windowHeader);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.headerButton {
	height: var(--headerHeight);
	width: var(--headerHeight);

	@media (max-width: 500px) {
		height: var(--headerHeightNarrow);
		width: var(--headerHeightNarrow);
	}
}

.title {
	flex: 1;
	line-height: var(--headerHeight);
	padding-left: 32px;
	font-weight: bold;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	pointer-events: none;

	@media (max-width: 500px) {
		line-height: var(--headerHeightNarrow);
		padding-left: 16px;
	}
}

.headerButton + .title {
	padding-left: 0;
}

.body {
	flex: 1;
	overflow: auto;
	background: var(--MI_THEME-bg);
	container-type: size;
}

.footer {
	padding: 12px 16px;
	overflow: auto;
	background: var(--MI_THEME-bg);
	border-top: 1px solid var(--MI_THEME-divider);
}
</style>
