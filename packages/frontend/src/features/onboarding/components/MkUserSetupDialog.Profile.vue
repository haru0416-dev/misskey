<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ i18n.ts._initialAccountSetting.theseSettingsCanEditLater }}</MkInfo>

	<FormSlot>
		<template #label>{{ i18n.ts.avatar }}</template>
		<div v-adaptive-bg :class="$style.avatarSection" class="_panel">
			<MkAvatar :class="$style.avatar" :user="$i" @click="setAvatar"/>
			<div style="margin-top: var(--MI-space-lg);">
				<MkButton primary rounded inline @click="setAvatar">{{ i18n.ts._profile.changeAvatar }}</MkButton>
			</div>
		</div>
	</FormSlot>

	<MkInput v-model="name" :max="30" manualSave data-cy-user-setup-user-name>
		<template #label>{{ i18n.ts._profile.name }}</template>
	</MkInput>

	<MkTextarea v-model="description" :max="500" tall manualSave data-cy-user-setup-user-description>
		<template #label>{{ i18n.ts._profile.description }}</template>
	</MkTextarea>

	<MkInfo>{{ i18n.ts._initialAccountSetting.youCanEditMoreSettingsInSettingsPageLater }}</MkInfo>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/form/MkButton.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import FormSlot from '@/components/form/slot.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import * as os from '@/os.js';
import { chooseImageFromPcCropAndUpload } from '@/features/drive/drive.js';
import { ensureSignin } from '@/i.js';

const $i = ensureSignin();

const name = ref($i.name ?? '');
const description = ref($i.description ?? '');

watch(name, () => {
	os.apiWithDialog(
		'i/update',
		{
			// 空文字列も null にするため ?? ではなく || を使う

			name: name.value || null,
		},
		undefined,
		{
			'0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191': {
				title: i18n.ts.yourNameContainsProhibitedWords,
				text: i18n.ts.yourNameContainsProhibitedWordsDescription,
			},
		},
	);
});

watch(description, () => {
	os.apiWithDialog('i/update', {
		// 空文字列も null にするため ?? ではなく || を使う

		description: description.value || null,
	});
});

async function setAvatar(ev: PointerEvent) {
	const driveFile = await chooseImageFromPcCropAndUpload(1);
	if (driveFile == null) {
		return;
	}

	const i = await os.apiWithDialog('i/update', {
		avatarId: driveFile.id,
	});
	$i.avatarId = i.avatarId;
	$i.avatarUrl = i.avatarUrl;
}
</script>

<style lang="scss" module>
.avatarSection {
	text-align: center;
	padding: var(--MI-space-xl);
}

.avatar {
	width: 100px;
	height: 100px;
}
</style>
