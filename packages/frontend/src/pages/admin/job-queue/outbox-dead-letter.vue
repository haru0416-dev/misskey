<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #label>
		<span style="margin-right: 1em;">#{{ deadLetter.id }}</span>
		<span>{{ deadLetter.name }}</span>
	</template>
	<template #suffix>
		<MkTime :time="deadLetter.updatedAt" mode="relative"/>
		<span style="margin-left: 1em; color: var(--MI_THEME-error);">
			<i class="ti ti-circle-x"></i> {{ deadLetter.deadLetterReason === 'deliveryFailed' ? 'Delivery failed' : 'Invalid payload' }}
		</span>
	</template>
	<template #header>
		<MkTabs
			v-model:tab="tab"
			:tabs="[{
					key: 'info',
					title: 'Info',
					icon: 'ti ti-info-circle',
				}, {
					key: 'data',
					title: 'Data',
					icon: 'ti ti-package',
				}, ...(deadLetter.lastError != null ? [{
					key: 'error',
					title: 'Error',
					icon: 'ti ti-alert-triangle',
				}] : [])]"
		/>
	</template>
	<template #footer>
		<div class="_buttons">
			<MkButton rounded @click="copyRaw()"><i class="ti ti-copy"></i> Copy raw</MkButton>
			<MkButton primary rounded @click="retry()"><i class="ti ti-reload"></i> Retry</MkButton>
			<MkButton danger rounded style="margin-left: auto;" @click="abandon()"><i class="ti ti-trash"></i> Abandon</MkButton>
		</div>
	</template>

	<div v-if="tab === 'info'" class="_gaps_s">
		<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px;">
			<MkKeyValue>
				<template #key>ID</template>
				<template #value>{{ deadLetter.id }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>Queue</template>
				<template #value>{{ deadLetter.queue }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>Job name</template>
				<template #value>{{ deadLetter.name }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>Reason</template>
				<template #value><i style="color: var(--MI_THEME-error);" class="ti ti-alert-triangle"></i> {{ deadLetter.deadLetterReason }}</template>
			</MkKeyValue>
			<MkKeyValue v-if="deadLetter.coordinatorId != null">
				<template #key>Coordinator</template>
				<template #value>{{ deadLetter.coordinatorId }}</template>
			</MkKeyValue>
			<MkKeyValue v-if="deadLetter.externalJobId != null">
				<template #key>External job ID</template>
				<template #value>{{ deadLetter.externalJobId }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>Revision</template>
				<template #value>{{ deadLetter.revision }}</template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>Created at</template>
				<template #value><MkTime :time="deadLetter.createdAt" mode="detail"/></template>
			</MkKeyValue>
			<MkKeyValue>
				<template #key>Updated at</template>
				<template #value><MkTime :time="deadLetter.updatedAt" mode="detail"/></template>
			</MkKeyValue>
		</div>
		<MkFolder :withSpacer="false">
			<template #label>Options</template>
			<MkCode :code="JSON5.stringify(deadLetter.opts, null, '\t')" lang="js"/>
		</MkFolder>
	</div>
	<div v-else-if="tab === 'data'">
		<MkCode :code="JSON5.stringify(deadLetter.data, null, '\t')" lang="js"/>
	</div>
	<div v-else-if="tab === 'error'">
		<MkCode :code="JSON5.stringify(deadLetter.lastError, null, '\t')" lang="js"/>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import JSON5 from 'json5';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/form/MkButton.vue';
import MkTabs from '@/components/layout/MkTabs.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkCode from '@/features/code/components/MkCode.vue';
import MkKeyValue from '@/components/display/MkKeyValue.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';

const props = defineProps<{
	deadLetter: Misskey.entities.AdminQueueOutboxDeadLettersResponse[number];
}>();

const emit = defineEmits<{
	(ev: 'needRefresh'): void;
}>();

const tab = ref('info');

async function request(endpoint: 'admin/queue/retry-outbox-dead-letter' | 'admin/queue/abandon-outbox-dead-letter') {
	try {
		await os.apiWithDialog(endpoint, { outboxId: props.deadLetter.id, revision: props.deadLetter.revision });
	} catch {
		// エラーダイアログは apiWithDialog 側が出すのでここでは握り潰す。
		// 他の管理者やワーカーが先に触っていた場合 (QUEUE_OUTBOX_STATE_CHANGED) もここに来るため、
		// 成否に関わらず一覧を取り直して、次の操作が最新の revision で行われるようにする
	}
	emit('needRefresh');
}

async function retry() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
		text: i18n.ts._queueOutbox.retryConfirm,
	});
	if (canceled) return;

	// revision を添えることで、一覧を取得してから状態が変わっていた場合はサーバー側で弾かれる
	await request('admin/queue/retry-outbox-dead-letter');
}

async function abandon() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
		text: i18n.ts._queueOutbox.abandonConfirm,
	});
	if (canceled) return;

	await request('admin/queue/abandon-outbox-dead-letter');
}

function copyRaw() {
	copyToClipboard(JSON.stringify(props.deadLetter, null, '\t'));
}
</script>
