<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div style="text-align: center;">{{ i18n.ts._initialAccountSetting.followUsers }}</div>

	<MkFolder :defaultOpen="true">
		<template #label>{{ i18n.ts.recommended }}</template>

		<MkPagination :paginator="pinnedUsersPaginator">
			<template #default="{ items }">
				<div :class="$style.users">
					<XUser v-for="item in items" :key="item.id" :user="item"/>
				</div>
			</template>
		</MkPagination>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #label>{{ i18n.ts.popularUsers }}</template>

		<MkPagination :paginator="popularUsersPaginator">
			<template #default="{ items }">
				<div :class="$style.users">
					<XUser v-for="item in items" :key="item.id" :user="item"/>
				</div>
			</template>
		</MkPagination>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import { markRaw } from 'vue';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/layout/MkFolder.vue';
import XUser from '@/features/onboarding/components/MkUserSetupDialog.User.vue';
import MkPagination from '@/components/layout/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';

const pinnedUsersPaginator = markRaw(new Paginator('pinned-users', {
	noPaging: true,
	limit: 10,
}));

const popularUsersPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		state: 'alive',
		origin: 'local',
		sort: '+follower',
	},
}));
</script>

<style lang="scss" module>
.users {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--MI-margin);
}
</style>
