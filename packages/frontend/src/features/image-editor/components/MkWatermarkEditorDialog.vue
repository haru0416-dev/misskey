<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="1000"
	:height="600"
	:scroll="false"
	:withOkButton="true"
	@close="cancel()"
	@ok="save()"
	@closed="emit('closed')"
>
	<template #header><i class="ti ti-copyright"></i> {{ i18n.ts._watermarkEditor.title }}</template>

	<MkPreviewWithControls>
		<template #preview>
			<MkSampleImagePreview ref="preview" v-model:sampleImageType="sampleImageType" :showSampleControls="props.image == null" @chooseImage="chooseImage"/>
		</template>

		<template #controls>
			<div class="_spacer _gaps">
				<div class="_gaps_s">
					<MkFolder v-for="(layer, i) in layers" :key="layer.id" :defaultOpen="false" :canPage="false">
						<template #label>
							<div v-if="layer.type === 'text'">{{ i18n.ts._watermarkEditor.text }}</div>
							<div v-if="layer.type === 'image'">{{ i18n.ts._watermarkEditor.image }}</div>
							<div v-if="layer.type === 'qr'">{{ i18n.ts._watermarkEditor.qr }}</div>
							<div v-if="layer.type === 'stripe'">{{ i18n.ts._watermarkEditor.stripe }}</div>
							<div v-if="layer.type === 'polkadot'">{{ i18n.ts._watermarkEditor.polkadot }}</div>
							<div v-if="layer.type === 'checker'">{{ i18n.ts._watermarkEditor.checker }}</div>
						</template>
						<template #footer>
							<div class="_buttons">
								<MkButton iconOnly @click="removeLayer(layer)"><i class="ti ti-trash"></i></MkButton>
								<MkButton iconOnly @click="swapUpLayer(layer)"><i class="ti ti-arrow-up"></i></MkButton>
								<MkButton iconOnly @click="swapDownLayer(layer)"><i class="ti ti-arrow-down"></i></MkButton>
							</div>
						</template>

						<XLayer
							v-if="layers[i] != null"
							v-model:layer="layers[i]"
						></XLayer>
					</MkFolder>

					<MkButton rounded primary style="margin: 0 auto;" @click="addLayer"><i class="ti ti-plus"></i></MkButton>
				</div>
			</div>
		</template>
	</MkPreviewWithControls>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, watch, reactive } from 'vue';
import type { WatermarkLayers, WatermarkPreset } from '@/features/image-editor/watermark/WatermarkRenderer.js';
import { WatermarkRenderer } from '@/features/image-editor/watermark/WatermarkRenderer.js';
import { i18n } from '@/i18n.js';
import MkModalWindow from '@/components/overlay/MkModalWindow.vue';
import MkPreviewWithControls from '@/features/ui-preview/components/MkPreviewWithControls.vue';
import MkSampleImagePreview from '@/features/image-editor/components/MkSampleImagePreview.vue';
import { useSampleImagePreview } from '@/features/image-editor/sample-image-preview.js';
import MkSelect from '@/components/form/MkSelect.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import XLayer from '@/features/image-editor/components/MkWatermarkEditorDialog.Layer.vue';
import * as os from '@/os.js';
import { deepClone } from '@/utility/clone.js';
import { ensureSignin } from '@/i.js';
import { genId } from '@/utility/id.js';
import { useMkSelect } from '@/composables/useMkSelect.js';
import { prefer } from '@/preferences.js';

const $i = ensureSignin();

function createTextLayer(): WatermarkPreset['layers'][number] {
	return {
		id: genId(),
		type: 'text',
		text: `(c) @${$i.username}`,
		align: { x: 'right', y: 'bottom', margin: 0 },
		scale: 0.3,
		angle: 0,
		opacity: 0.75,
		repeat: false,
		noBoundingBoxExpansion: false,
	};
}

function createImageLayer(): WatermarkPreset['layers'][number] {
	return {
		id: genId(),
		type: 'image',
		imageId: null,
		imageUrl: null,
		align: { x: 'right', y: 'bottom', margin: 0 },
		scale: 0.3,
		angle: 0,
		opacity: 0.75,
		repeat: false,
		noBoundingBoxExpansion: false,
		cover: false,
	};
}

function createQrLayer(): WatermarkPreset['layers'][number] {
	return {
		id: genId(),
		type: 'qr',
		data: '',
		align: { x: 'right', y: 'bottom', margin: 0 },
		scale: 0.3,
		opacity: 1,
	};
}

function createStripeLayer(): WatermarkPreset['layers'][number] {
	return {
		id: genId(),
		type: 'stripe',
		angle: 0.5,
		frequency: 10,
		threshold: 0.1,
		color: [1, 1, 1],
		opacity: 0.75,
	};
}

function createPolkadotLayer(): WatermarkPreset['layers'][number] {
	return {
		id: genId(),
		type: 'polkadot',
		angle: 0.5,
		scale: 3,
		majorRadius: 0.1,
		minorRadius: 0.25,
		majorOpacity: 0.75,
		minorOpacity: 0.5,
		minorDivisions: 4,
		color: [1, 1, 1],
		opacity: 0.75,
	};
}

function createCheckerLayer(): WatermarkPreset['layers'][number] {
	return {
		id: genId(),
		type: 'checker',
		angle: 0.5,
		scale: 3,
		color: [1, 1, 1],
		opacity: 0.75,
	};
}

const props = defineProps<{
	presetEditMode?: boolean;
	preset?: WatermarkPreset | null;
	layers?: WatermarkLayers | null;
	image?: File | null;
}>();

const preset = deepClone(props.preset) ?? {
	id: genId(),
	name: '',
};

const layers = reactive<WatermarkLayers>(props.layers ?? []);

const emit = defineEmits<{
	(ev: 'ok', layers: WatermarkLayers): void;
	(ev: 'presetOk', preset: WatermarkPreset): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

async function cancel() {
	if (props.presetEditMode) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.ts._watermarkEditor.quitWithoutSaveConfirm,
		});
		if (canceled) {
			return;
		}
	}

	emit('cancel');
	dialog.value?.close();
}

watch(
	layers,
	async (newValue, oldValue) => {
		getRenderer()?.render(layers);
	},
	{ deep: true },
);

const preview = useTemplateRef<InstanceType<typeof MkSampleImagePreview>>('preview');

const { sampleImageType, chooseImage, getRenderer, destroyRenderer } = useSampleImagePreview({
	canvasEl: computed(() => preview.value?.canvasEl ?? null),
	image: props.image,
	createRenderer: (canvas, source) => {
		if (source.type !== 'provided') {
			const landscape = source.type === '3_2';
			return new WatermarkRenderer({
				canvas,
				renderWidth: landscape ? 1500 : 1000,
				renderHeight: landscape ? 1000 : 1500,
				image: source.image,
			});
		}

		const MAX_W = 1000;
		const MAX_H = 1000;
		let w = source.bitmap.width;
		let h = source.bitmap.height;

		if (w > MAX_W || h > MAX_H) {
			const scale = Math.min(MAX_W / w, MAX_H / h);
			w = Math.floor(w * scale);
			h = Math.floor(h * scale);
		}

		return new WatermarkRenderer({ canvas, renderWidth: w, renderHeight: h, image: source.bitmap });
	},
	render: (renderer) => renderer.render(layers),
	failedToLoadImageText: i18n.ts._watermarkEditor.failedToLoadImage,
});

async function save() {
	if (props.presetEditMode) {
		const { canceled, result: name } = await os.inputText({
			title: i18n.ts.name,
			default: preset.name,
		});
		if (canceled) {
			return;
		}

		preset.name = name || '';

		dialog.value?.close();
		destroyRenderer();

		emit('presetOk', {
			...preset,
			layers: deepClone(layers),
		});
	} else {
		dialog.value?.close();
		destroyRenderer();

		emit('ok', layers);
	}
}

function addLayer(ev: PointerEvent) {
	os.popupMenu(
		[
			{
				text: i18n.ts._watermarkEditor.text,
				action: () => {
					layers.push(createTextLayer());
				},
			},
			{
				text: i18n.ts._watermarkEditor.image,
				action: () => {
					layers.push(createImageLayer());
				},
			},
			{
				text: i18n.ts._watermarkEditor.qr,
				action: () => {
					layers.push(createQrLayer());
				},
			},
			{
				text: i18n.ts._watermarkEditor.stripe,
				action: () => {
					layers.push(createStripeLayer());
				},
			},
			{
				text: i18n.ts._watermarkEditor.polkadot,
				action: () => {
					layers.push(createPolkadotLayer());
				},
			},
			{
				text: i18n.ts._watermarkEditor.checker,
				action: () => {
					layers.push(createCheckerLayer());
				},
			},
		],
		ev.currentTarget ?? ev.target,
	);
}

function swapUpLayer(layer: WatermarkPreset['layers'][number]) {
	const index = layers.findIndex((l) => l.id === layer.id);
	if (index > 0) {
		const tmp = layers[index - 1];
		const current = layers[index];
		if (tmp == null || current == null) {
			return;
		}
		layers[index - 1] = current;
		layers[index] = tmp;
	}
}

function swapDownLayer(layer: WatermarkPreset['layers'][number]) {
	const index = layers.findIndex((l) => l.id === layer.id);
	if (index < layers.length - 1) {
		const tmp = layers[index + 1];
		const current = layers[index];
		if (tmp == null || current == null) {
			return;
		}
		layers[index + 1] = current;
		layers[index] = tmp;
	}
}

function removeLayer(layer: WatermarkPreset['layers'][number]) {
	const index = layers.findIndex((l) => l.id === layer.id);
	if (index !== -1) {
		layers.splice(index, 1);
	}
}
</script>
