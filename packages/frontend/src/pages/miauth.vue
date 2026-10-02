<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithAnimBg>
	<div :class="$style.formContainer">
		<div :class="$style.form">
			<MkAuthConfirm
				ref="authRoot"
				v-bind="{ ...(name === undefined ? {} : { name }), ...(icon === undefined || icon === '' ? {} : { icon }) }"
				:permissions="_permissions"
				@accept="onAccept"
				@deny="onDeny"
			>
				<template #consentAdditionalInfo>
					<div v-if="callback != null" class="_gaps_s" :class="$style.redirectRoot">
						<div>{{ i18n.ts._auth.byClickingYouWillBeRedirectedToThisUrl }}</div>
						<div class="_monospace" :class="$style.redirectUrl">{{ callback }}</div>
					</div>
				</template>
			</MkAuthConfirm>
		</div>
	</div>
</PageWithAnimBg>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkAuthConfirm from '@/features/auth/components/MkAuthConfirm.vue';
import PageWithAnimBg from '@/components/global/PageWithAnimBg.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { setAuthCallbackUrlParameter } from '@/pages/auth/callback-url.js';

const props = defineProps<{
	session: string;
	callback?: string;
	name?: string;
	icon?: string;
	permission?: string; // コンマ区切り
}>();

const _permissions = computed(() => {
	return (props.permission ? props.permission.split(',').filter((p): p is typeof Misskey.permissions[number] => (Misskey.permissions as readonly string[]).includes(p)) : []);
});

const authRoot = useTemplateRef('authRoot');

async function onAccept(token: string) {
	// 戻り先が使えない URL なら、トークンを発行する前に止める。発行後に失敗を表示すると、
	// 画面は失敗なのにトークンは有効で、セッションを知るアプリが受け取れてしまう。
	let redirectTo: string | null = null;
	if (props.callback && props.callback !== '') {
		try {
			redirectTo = setAuthCallbackUrlParameter(props.callback, 'session', props.session);
		} catch {
			authRoot.value?.showUi('failed');
			return;
		}
	}

	await misskeyApi('miauth/gen-token', {
		session: props.session,
		...(props.name === undefined ? {} : { name: props.name }),
		...(props.icon === undefined ? {} : { iconUrl: props.icon }),
		permission: _permissions.value,
	}, token).then(() => {
		if (redirectTo != null) {
			window.location.href = redirectTo;
		} else {
			authRoot.value?.showUi('success');
		}
	}).catch(() => {
		authRoot.value?.showUi('failed');
	});
}

function onDeny() {
	authRoot.value?.showUi('denied');
}

definePage(() => ({
	title: 'MiAuth',
	icon: 'ti ti-apps',
}));
</script>

<style lang="scss" module>
.formContainer {
	min-height: 100svh;
	padding: 32px 32px calc(env(safe-area-inset-bottom, 0px) + 32px) 32px;
	box-sizing: border-box;
	display: grid;
	place-content: center;
}

.form {
	position: relative;
	z-index: 10;
	border-radius: var(--MI-radius);
	background-color: var(--MI_THEME-panel);
	box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
	overflow: clip;
	max-width: 500px;
	width: calc(100vw - 64px);
	height: min(65svh, calc(100svh - calc(env(safe-area-inset-bottom, 0px) + 64px)));
	overflow-y: scroll;
}

.redirectRoot {
	padding: 16px;
	border-radius: var(--MI-radius);
	background-color: var(--MI_THEME-bg);
}

.redirectUrl {
	font-size: 90%;
	padding: 12px;
	border-radius: var(--MI-radius);
	background-color: var(--MI_THEME-panel);
	overflow-x: scroll;
	white-space: nowrap;
}
</style>
