<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/accounts" :label="i18n.ts.accounts" :keywords="['accounts']" icon="ti ti-users">
	<div class="_gaps">
		<div class="_buttons">
			<MkButton primary @click="addAccount"><i class="ti ti-plus"></i> {{ i18n.ts.addAccount }}</MkButton>
		</div>

		<template v-for="x in accounts" :key="x.host + x.id">
			<MkUserCardMini v-if="x.user" :user="x.user" :class="$style.user" @click.prevent="showMenu(x.host, x.id, $event)"/>
		</template>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import type { MenuItem } from '@/types/menu.js';
import MkButton from '@/components/form/MkButton.vue';
import * as os from '@/os.js';
import { switchAccount, removeAccount, login, getAccountWithSigninDialog, getAccountWithSignupDialog, getAccounts } from '@/accounts.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkUserCardMini from '@/features/users/components/MkUserCardMini.vue';

const accounts = await getAccounts();

function showMenu(host: string, id: string, ev: PointerEvent) {
	let menu: MenuItem[];

	menu = [{
		text: i18n.ts.switch,
		icon: 'ti ti-switch-horizontal',
		action: () => switchAccount(host, id),
	}, {
		text: i18n.ts.remove,
		icon: 'ti ti-trash',
		action: () => removeAccount(host, id),
	}];

	os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

function addAccount(ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.existingAccount,
		action: () => { addExistingAccount(); },
	}, {
		text: i18n.ts.createAccount,
		action: () => { createAccount(); },
	}], ev.currentTarget ?? ev.target);
}

function addExistingAccount() {
	getAccountWithSigninDialog().then((res) => {
		if (res != null) {
			os.success();
		}
	});
}

function createAccount() {
	getAccountWithSignupDialog().then((res) => {
		if (res != null) {
			login(res.token);
		}
	});
}

definePage(() => ({
	title: i18n.ts.accounts,
	icon: 'ti ti-users',
}));
</script>

<style lang="scss" module>
.user {
	cursor: pointer;
}
</style>
