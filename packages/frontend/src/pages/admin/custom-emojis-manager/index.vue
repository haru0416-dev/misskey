<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="headerTab" :tabs="headerTabs" :actions="headerActions">
	<XGridLocalComponent v-if="headerTab === 'local'"/>
	<XGridRemoteComponent v-else-if="headerTab === 'remote'"/>
	<XRegisterComponent v-else-if="headerTab === 'register'"/>
</PageWithHeader>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFile } from '@/features/drive/drive.js';
import XGridLocalComponent from '@/pages/admin/custom-emojis-manager/local/list/index.vue';
import XGridRemoteComponent from '@/pages/admin/custom-emojis-manager/remote.vue';
import XRegisterComponent from '@/pages/admin/custom-emojis-manager/register.vue';
import type { PageHeaderItem } from '@/types/page-header.js';

type PageMode = 'local' | 'remote' | 'register';

const headerTab = ref<PageMode>('local');

const headerTabs = computed(() => [{
	key: 'local',
	title: i18n.ts.local,
}, {
	key: 'remote',
	title: i18n.ts.remote,
}, {
	key: 'register',
	title: i18n.ts._customEmojisManager._local.tabTitleRegister,
}]);

function exportEmojis() {
	misskeyApi('export-custom-emojis', {}).then(() => {
		os.alert({ type: 'info', text: i18n.ts.exportRequested });
	}).catch((err) => {
		os.alert({ type: 'error', text: err.message });
	});
}

async function importEmojisFromZip(ev: PointerEvent) {
	const file = await selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
	});
	misskeyApi('admin/emoji/import-zip', { fileId: file.id }).then(() => {
		os.alert({ type: 'info', text: i18n.ts.importRequested });
	}).catch((err) => {
		os.alert({ type: 'error', text: err.message });
	});
}

// ZIP の書き出しと取り込みは、どのタブからでも使えるようにヘッダーのメニューに置く
const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-dots',
	text: i18n.ts.menu,
	handler: (ev) => {
		os.popupMenu([{
			icon: 'ti ti-download',
			text: i18n.ts._customEmojisManager._gridCommon.exportZip,
			action: exportEmojis,
		}, {
			icon: 'ti ti-upload',
			text: i18n.ts._customEmojisManager._gridCommon.importZip,
			action: () => importEmojisFromZip(ev),
		}], ev.currentTarget ?? ev.target);
	},
}]);

definePage(computed(() => ({
	title: i18n.ts.customEmojis,
	icon: 'ti ti-icons',
	needWideArea: true,
})));
</script>
