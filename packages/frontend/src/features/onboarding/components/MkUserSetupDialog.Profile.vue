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

	<MkInput v-model="name" :max="30" data-cy-user-setup-user-name>
		<template #label>{{ i18n.ts._profile.name }}</template>
	</MkInput>

	<MkTextarea v-model="description" :max="500" tall data-cy-user-setup-user-description>
		<template #label>{{ i18n.ts._profile.description }}</template>
	</MkTextarea>

	<MkInfo>{{ i18n.ts._initialAccountSetting.youCanEditMoreSettingsInSettingsPageLater }}</MkInfo>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/form/MkButton.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import FormSlot from '@/components/form/slot.vue';
import MkInfo from '@/components/display/MkInfo.vue';
import * as os from '@/os.js';
import { chooseImageFromPcCropAndUpload } from '@/features/drive/drive.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const $i = ensureSignin();

const name = ref($i.name ?? '');
const description = ref($i.description ?? '');
// 入力中の保存通知でフォーカスを遮らないよう、ステップを離れるときに未保存の変更をまとめて保存する。
let savedName = name.value;
let savedDescription = description.value;

/** 変更があれば保存する。保存できなかったときは理由を知らせて false を返す (ステップを進めない)。 */
async function save(): Promise<boolean> {
	const changes: { name?: string | null; description?: string | null } = {};
	// 空文字列も null にするため ?? ではなく || を使う
	if (name.value !== savedName) changes.name = name.value || null;
	if (description.value !== savedDescription) changes.description = description.value || null;
	if (Object.keys(changes).length === 0) {
		return true;
	}
	try {
		await misskeyApi('i/update', changes);
		savedName = name.value;
		savedDescription = description.value;
		return true;
	} catch (err) {
		const content = os.apiErrorDialogContent(err, {
			'0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191': {
				title: i18n.ts.yourNameContainsProhibitedWords,
				text: i18n.ts.yourNameContainsProhibitedWordsDescription,
			},
		});
		if (content != null) {
			await os.alert({ type: 'error', ...(content.title === undefined ? {} : { title: content.title }), text: content.text });
		}
		return false;
	}
}

// ステップを経ずにダイアログを閉じたときも、入力を捨てない。
onBeforeUnmount(() => {
	void save();
});

defineExpose({ save });

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
