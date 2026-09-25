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
	<template #header><i class="ti ti-device-ipad-horizontal"></i> {{ i18n.ts._imageFrameEditor.title }}</template>

	<MkPreviewWithControls>
		<template #preview>
			<MkSampleImagePreview ref="preview" v-model:sampleImageType="sampleImageType" :showSampleControls="props.image == null" @chooseImage="chooseImage"/>
		</template>

		<template #controls>
			<div class="_spacer _gaps">
				<MkRange v-model="params.borderThickness" :min="0" :max="0.2" :step="0.01" :continuousUpdate="true">
					<template #label>{{ i18n.ts._imageFrameEditor.borderThickness }}</template>
				</MkRange>

				<MkInput :modelValue="rgbToHex(params.bgColor)" type="color" @update:modelValue="v => { const c = hexToRgb(v); if (c != null) params.bgColor = c; }">
					<template #label>{{ i18n.ts._imageFrameEditor.backgroundColor }}</template>
				</MkInput>

				<MkInput :modelValue="rgbToHex(params.fgColor)" type="color" @update:modelValue="v => { const c = hexToRgb(v); if (c != null) params.fgColor = c; }">
					<template #label>{{ i18n.ts._imageFrameEditor.textColor }}</template>
				</MkInput>

				<MkSelect
					v-model="params.font" :items="[
						{ label: i18n.ts._imageFrameEditor.fontSansSerif, value: 'sans-serif' },
						{ label: i18n.ts._imageFrameEditor.fontSerif, value: 'serif' },
					]"
				>
					<template #label>{{ i18n.ts._imageFrameEditor.font }}</template>
				</MkSelect>

				<MkFolder :defaultOpen="params.labelTop.enabled">
					<template #label>{{ i18n.ts._imageFrameEditor.header }}</template>

					<div class="_gaps">
						<MkSwitch v-model="params.labelTop.enabled">
							<template #label>{{ i18n.ts.show }}</template>
						</MkSwitch>

						<MkRange v-model="params.labelTop.padding" :min="0.01" :max="0.5" :step="0.01" :continuousUpdate="true">
							<template #label>{{ i18n.ts._imageFrameEditor.labelThickness }}</template>
						</MkRange>

						<MkRange v-model="params.labelTop.scale" :min="0.5" :max="2.0" :step="0.01" :continuousUpdate="true">
							<template #label>{{ i18n.ts._imageFrameEditor.labelScale }}</template>
						</MkRange>

						<MkSwitch v-model="params.labelTop.centered">
							<template #label>{{ i18n.ts._imageFrameEditor.centered }}</template>
						</MkSwitch>

						<MkInput v-model="params.labelTop.textBig">
							<template #label>{{ i18n.ts._imageFrameEditor.captionMain }}</template>
						</MkInput>

						<MkTextarea v-model="params.labelTop.textSmall">
							<template #label>{{ i18n.ts._imageFrameEditor.captionSub }}</template>
						</MkTextarea>

						<MkSwitch v-model="params.labelTop.withQrCode">
							<template #label>{{ i18n.ts._imageFrameEditor.withQrCode }}</template>
						</MkSwitch>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="params.labelBottom.enabled">
					<template #label>{{ i18n.ts._imageFrameEditor.footer }}</template>

					<div class="_gaps">
						<MkSwitch v-model="params.labelBottom.enabled">
							<template #label>{{ i18n.ts.show }}</template>
						</MkSwitch>

						<MkRange v-model="params.labelBottom.padding" :min="0.01" :max="0.5" :step="0.01" :continuousUpdate="true">
							<template #label>{{ i18n.ts._imageFrameEditor.labelThickness }}</template>
						</MkRange>

						<MkRange v-model="params.labelBottom.scale" :min="0.5" :max="2.0" :step="0.01" :continuousUpdate="true">
							<template #label>{{ i18n.ts._imageFrameEditor.labelScale }}</template>
						</MkRange>

						<MkSwitch v-model="params.labelBottom.centered">
							<template #label>{{ i18n.ts._imageFrameEditor.centered }}</template>
						</MkSwitch>

						<MkInput v-model="params.labelBottom.textBig">
							<template #label>{{ i18n.ts._imageFrameEditor.captionMain }}</template>
						</MkInput>

						<MkTextarea v-model="params.labelBottom.textSmall">
							<template #label>{{ i18n.ts._imageFrameEditor.captionSub }}</template>
						</MkTextarea>

						<MkSwitch v-model="params.labelBottom.withQrCode">
							<template #label>{{ i18n.ts._imageFrameEditor.withQrCode }}</template>
						</MkSwitch>
					</div>
				</MkFolder>

				<MkInfo>
					<div>{{ i18n.ts._imageFrameEditor.availableVariables }}:</div>
					<div><code class="_selectableAtomic">{filename}</code> - {{ i18n.ts._imageEditing._vars.filename }}</div>
					<div><code class="_selectableAtomic">{filename_without_ext}</code> - {{ i18n.ts._imageEditing._vars.filename_without_ext }}</div>
					<div><code class="_selectableAtomic">{caption}</code> - {{ i18n.ts._imageEditing._vars.caption }}</div>
					<div><code class="_selectableAtomic">{year}</code> - {{ i18n.ts._imageEditing._vars.year }}</div>
					<div><code class="_selectableAtomic">{month}</code> - {{ i18n.ts._imageEditing._vars.month }}</div>
					<div><code class="_selectableAtomic">{day}</code> - {{ i18n.ts._imageEditing._vars.day }}</div>
					<div><code class="_selectableAtomic">{hour}</code> - {{ i18n.ts._imageEditing._vars.hour }}</div>
					<div><code class="_selectableAtomic">{minute}</code> - {{ i18n.ts._imageEditing._vars.minute }}</div>
					<div><code class="_selectableAtomic">{second}</code> - {{ i18n.ts._imageEditing._vars.second }}</div>
					<div><code class="_selectableAtomic">{0month}</code> - {{ i18n.ts._imageEditing._vars.month }} ({{ i18n.ts.zeroPadding }})</div>
					<div><code class="_selectableAtomic">{0day}</code> - {{ i18n.ts._imageEditing._vars.day }} ({{ i18n.ts.zeroPadding }})</div>
					<div><code class="_selectableAtomic">{0hour}</code> - {{ i18n.ts._imageEditing._vars.hour }} ({{ i18n.ts.zeroPadding }})</div>
					<div><code class="_selectableAtomic">{0minute}</code> - {{ i18n.ts._imageEditing._vars.minute }} ({{ i18n.ts.zeroPadding }})</div>
					<div><code class="_selectableAtomic">{0second}</code> - {{ i18n.ts._imageEditing._vars.second }} ({{ i18n.ts.zeroPadding }})</div>
					<div><code class="_selectableAtomic">{camera_model}</code> - {{ i18n.ts._imageEditing._vars.camera_model }}</div>
					<div><code class="_selectableAtomic">{camera_lens_model}</code> - {{ i18n.ts._imageEditing._vars.camera_lens_model }}</div>
					<div><code class="_selectableAtomic">{camera_mm}</code> - {{ i18n.ts._imageEditing._vars.camera_mm }}</div>
					<div><code class="_selectableAtomic">{camera_mm_35}</code> - {{ i18n.ts._imageEditing._vars.camera_mm_35 }}</div>
					<div><code class="_selectableAtomic">{camera_f}</code> - {{ i18n.ts._imageEditing._vars.camera_f }}</div>
					<div><code class="_selectableAtomic">{camera_s}</code> - {{ i18n.ts._imageEditing._vars.camera_s }}</div>
					<div><code class="_selectableAtomic">{camera_iso}</code> - {{ i18n.ts._imageEditing._vars.camera_iso }}</div>
					<div><code class="_selectableAtomic">{gps_lat}</code> - {{ i18n.ts._imageEditing._vars.gps_lat }}</div>
					<div><code class="_selectableAtomic">{gps_long}</code> - {{ i18n.ts._imageEditing._vars.gps_long }}</div>
				</MkInfo>
			</div>
		</template>
	</MkPreviewWithControls>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, watch, reactive } from 'vue';
import ExifReader from 'exifreader';
import { throttle } from 'throttle-debounce';
import MkPreviewWithControls from '@/features/ui-preview/components/MkPreviewWithControls.vue';
import MkSampleImagePreview from '@/features/image-editor/components/MkSampleImagePreview.vue';
import { useSampleImagePreview } from '@/features/image-editor/sample-image-preview.js';
import type { ImageFrameParams, ImageFramePreset } from '@/features/image-editor/frame/ImageFrameRenderer.js';
import { ImageFrameRenderer } from '@/features/image-editor/frame/ImageFrameRenderer.js';
import { i18n } from '@/i18n.js';
import { hexToRgb, rgbToHex } from '@/features/image-editor/color.js';
import MkModalWindow from '@/components/overlay/MkModalWindow.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkRange from '@/components/form/MkRange.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import * as os from '@/os.js';
import { deepClone } from '@/utility/clone.js';
import { ensureSignin } from '@/i.js';
import { genId } from '@/utility/id.js';

const $i = ensureSignin();

const props = defineProps<{
	presetEditMode?: boolean;
	preset?: ImageFramePreset | null;
	params?: ImageFrameParams | null;
	image?: File | null;
	imageCaption?: string | null;
	imageFilename?: string | null;
}>();

const preset = deepClone(props.preset) ?? {
	id: genId(),
	name: '',
};

const params = reactive<ImageFrameParams>(
	deepClone(props.params) ?? {
		borderThickness: 0.05,
		borderRadius: 0,
		labelTop: {
			enabled: false,
			scale: 1.0,
			padding: 0.2,
			textBig: '',
			textSmall: '',
			centered: false,
			withQrCode: false,
		},
		labelBottom: {
			enabled: true,
			scale: 1.0,
			padding: 0.2,
			textBig: '{year}/{0month}/{0day}',
			textSmall: '{camera_mm}mm   f/{camera_f}   {camera_s}s   ISO{camera_iso}',
			centered: false,
			withQrCode: true,
		},
		bgColor: [1, 1, 1],
		fgColor: [0, 0, 0],
		font: 'sans-serif',
	},
);

const emit = defineEmits<{
	(ev: 'ok', frame: ImageFrameParams): void;
	(ev: 'presetOk', preset: ImageFramePreset): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

async function cancel() {
	if (props.presetEditMode) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.ts._imageFrameEditor.quitWithoutSaveConfirm,
		});
		if (canceled) {
			return;
		}
	}

	dialog.value?.close();
}

const updateThrottled = throttle(50, () => {
	getRenderer()?.render(params);
});

watch(
	params,
	async (newValue, oldValue) => {
		updateThrottled();
	},
	{ deep: true },
);

const preview = useTemplateRef<InstanceType<typeof MkSampleImagePreview>>('preview');

const { sampleImageType, chooseImage, getRenderer, destroyRenderer } = useSampleImagePreview({
	canvasEl: computed(() => preview.value?.canvasEl ?? null),
	image: props.image,
	createRenderer: async (canvas, source) => {
		if (source.type !== 'provided') {
			return new ImageFrameRenderer({
				canvas,
				image: source.image,
				exif: null,
				caption: 'Example caption',
				filename: 'example_file_name.jpg',
				renderAsPreview: true,
			});
		}

		const exif = ExifReader.load(await source.file.arrayBuffer());

		return new ImageFrameRenderer({
			canvas,
			image: source.bitmap,
			exif,
			caption: props.imageCaption ?? null,
			filename: props.imageFilename ?? null,
			renderAsPreview: true,
		});
	},
	render: (renderer) => renderer.render(params),
	failedToLoadImageText: i18n.ts._imageFrameEditor.failedToLoadImage,
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
			params: deepClone(params),
		});
	} else {
		dialog.value?.close();
		destroyRenderer();

		emit('ok', params);
	}
}

</script>
