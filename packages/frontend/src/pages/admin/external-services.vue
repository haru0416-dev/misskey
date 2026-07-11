<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/external-services" :label="i18n.ts.externalServices" :keywords="['external', 'services', 'thirdparty']" icon="ti ti-link">
			<div class="_gaps_m">
				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Google Analytics</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="googleAnalyticsMeasurementId">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Measurement ID</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<MkButton primary @click="save_googleAnalytics">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['translation', 'deepl', 'libretranslate']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._translationService.translation }}</SearchLabel></template>

						<div class="_gaps_m">
							<MkRadios
								v-model="translatorProvider"
								:options="[
									{ value: 'deepl', label: 'DeepL' },
									{ value: 'libreTranslate', label: 'LibreTranslate' },
								]"
							>
								<template #label><SearchLabel>{{ i18n.ts._translationService.provider }}</SearchLabel></template>
							</MkRadios>

							<template v-if="translatorProvider === 'deepl'">
								<MkInput v-model="deeplAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>{{ i18n.ts._translationService.apiKey }}</SearchLabel></template>
								</MkInput>
								<MkSwitch v-model="deeplIsPro">
									<template #label><SearchLabel>{{ i18n.ts._translationService.deeplProAccount }}</SearchLabel></template>
								</MkSwitch>
							</template>

							<template v-else>
								<MkInput v-model="libreTranslateApiUrl" type="url" inputmode="url" autocomplete="url" :spellcheck="false">
									<template #prefix><i class="ti ti-link"></i></template>
									<template #label><SearchLabel>{{ i18n.ts._translationService.apiUrl }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._translationService.apiUrlDescription }}</template>
								</MkInput>
								<MkInput v-model="libreTranslateApiKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>{{ i18n.ts._translationService.apiKeyOptional }}</SearchLabel></template>
								</MkInput>
							</template>

							<MkButton primary @click="save_translation">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/form/MkInput.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkRadios from '@/components/form/MkRadios.vue';

const meta = await misskeyApi('admin/meta');

const deeplAuthKey = ref(meta.deeplAuthKey ?? '');
const deeplIsPro = ref(meta.deeplIsPro);
const translatorProvider = ref(meta.translatorProvider);
const libreTranslateApiUrl = ref(meta.libreTranslateApiUrl ?? '');
const libreTranslateApiKey = ref(meta.libreTranslateApiKey ?? '');
const googleAnalyticsMeasurementId = ref(meta.googleAnalyticsMeasurementId ?? '');

function save_translation() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
		translatorProvider: translatorProvider.value,
		libreTranslateApiUrl: libreTranslateApiUrl.value,
		libreTranslateApiKey: libreTranslateApiKey.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_googleAnalytics() {
	os.apiWithDialog('admin/update-meta', {
		googleAnalyticsMeasurementId: googleAnalyticsMeasurementId.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.externalServices,
	icon: 'ti ti-link',
}));
</script>
