<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkInput v-model="name">
		<template #label>{{ i18n.ts._webhookSettings.name }}</template>
	</MkInput>

	<MkInput v-model="url" type="url">
		<template #label>URL</template>
	</MkInput>

	<MkInput v-model="secret">
		<template #prefix><i class="ti ti-lock"></i></template>
		<template #label>{{ i18n.ts._webhookSettings.secret }}</template>
	</MkInput>

	<FormSection>
		<template #label>{{ i18n.ts._webhookSettings.trigger }}</template>

		<div class="_gaps_s">
			<MkSwitch v-model="events.follow">{{ i18n.ts._webhookSettings._events.follow }}</MkSwitch>
			<MkSwitch v-model="events.followed">{{ i18n.ts._webhookSettings._events.followed }}</MkSwitch>
			<MkSwitch v-model="events.note">{{ i18n.ts._webhookSettings._events.note }}</MkSwitch>
			<MkSwitch v-model="events.reply">{{ i18n.ts._webhookSettings._events.reply }}</MkSwitch>
			<MkSwitch v-model="events.renote">{{ i18n.ts._webhookSettings._events.renote }}</MkSwitch>
			<MkSwitch v-model="events.reaction" :disabled="true">{{ i18n.ts._webhookSettings._events.reaction }}</MkSwitch>
			<MkSwitch v-model="events.mention">{{ i18n.ts._webhookSettings._events.mention }}</MkSwitch>
		</div>
	</FormSection>

	<div class="_buttons">
		<MkButton primary inline @click="create"><i class="ti ti-check"></i> {{ i18n.ts.create }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/form/MkInput.vue';
import FormSection from '@/components/form/section.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkButton from '@/components/form/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useUserWebhookEventToggles } from '@/features/webhooks/user-webhook-events.js';

const name = ref('');
const url = ref('');
const secret = ref('');

const { events, selectedEvents } = useUserWebhookEventToggles(() => true);

async function create(): Promise<void> {
	os.apiWithDialog('i/webhooks/create', {
		name: name.value,
		url: url.value,
		secret: secret.value,
		on: selectedEvents(),
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: 'Create new webhook',
	icon: 'ti ti-webhook',
}));
</script>
