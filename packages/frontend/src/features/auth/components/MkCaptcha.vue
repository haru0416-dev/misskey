<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<span v-if="!available">Loading<MkEllipsis/></span>
	<MkCapCaptcha v-if="props.provider === 'cap'" ref="capWidget" :sitekey="props.sitekey" :instanceUrl="props.instanceUrl ?? null" :secretKey="props.secretKey ?? null" @update:modelValue="emit('update:modelValue', $event)"/>
	<div v-if="props.provider == 'testcaptcha'" style="background: #eee; border: solid 1px #888; padding: 8px; color: #000; max-width: 320px; display: flex; gap: 10px; align-items: center; box-shadow: 2px 2px 6px #0004; border-radius: 4px;">
		<img src="/client-assets/testcaptcha.png" style="width: 60px; height: 60px; " alt=""/>
		<div v-if="testcaptchaPassed">
			<div style="color: green;">Test captcha passed!</div>
		</div>
		<div v-else>
			<div style="font-size: 13px; margin-bottom: 4px;">Type "ai-chan-kawaii" to pass captcha</div>
			<input v-model="testcaptchaInput" aria-label="captcha" data-cy-testcaptcha-input/>
			<button type="button" data-cy-testcaptcha-submit @click="testcaptchaSubmit">Submit</button>
		</div>
	</div>
	<div v-else ref="captchaEl"></div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import MkCapCaptcha from './MkCapCaptcha.vue';
import { store } from '@/store.js';

// 各 CAPTCHA サービスが提供する API。
// https://docs.hcaptcha.com/configuration/#javascript-api
// https://developers.google.com/recaptcha/docs/display?hl=ja
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#explicitly-render-the-turnstile-widget
export type Captcha = {
	render(
		container: string | Node,
		options: {
			readonly [
				_ in
					| 'sitekey'
					| 'theme'
					| 'type'
					| 'size'
					| 'tabindex'
					| 'callback'
					| 'expired'
					| 'expired-callback'
					| 'error-callback'
					| 'endpoint'
			]?: unknown;
		},
	): string;
	remove(id: string): void;
	execute(id: string): void;
	reset(id?: string): void;
	getResponse(id: string): string;
};

export type CaptchaProvider = 'hcaptcha' | 'recaptcha' | 'turnstile' | 'cap' | 'testcaptcha';

type CaptchaContainer = {
	readonly [_ in CaptchaProvider]?: Captcha;
};

declare global {
	// Window を拡張してるため、空ではない
	interface Window extends CaptchaContainer {}
}

const props = defineProps<{
	provider: CaptchaProvider;
	sitekey: string | null; // null を指定するとリクエスト時にエラーを表示する。
	secretKey?: string | null;
	instanceUrl?: string | null;
	modelValue?: string | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', v: string | null): void;
}>();

const available = ref(false);

const captchaEl = useTemplateRef('captchaEl');
const captchaWidgetId = ref<string | undefined>(undefined);

const capWidget = useTemplateRef('capWidget');

const testcaptchaInput = ref('');
const testcaptchaPassed = ref(false);

const variable = computed(() => {
	switch (props.provider) {
		case 'hcaptcha':
			return 'hcaptcha';
		case 'recaptcha':
			return 'grecaptcha';
		case 'turnstile':
			return 'turnstile';
		case 'cap':
			return 'cap';
		case 'testcaptcha':
			return 'testcaptcha';
	}
});

const loaded = !!(window as any)[variable.value];

const src = computed(() => {
	switch (props.provider) {
		case 'hcaptcha':
			return 'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off';
		case 'recaptcha':
			return 'https://www.recaptcha.net/recaptcha/api.js?render=explicit';
		case 'turnstile':
			return 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		case 'cap':
			return null;
		case 'testcaptcha':
			return null;
	}
});

const scriptId = computed(() => `script-${props.provider}`);

const captcha = computed<Captcha>(() => (window as any)[variable.value] ?? ({} as unknown as Captcha));

watch(
	() => [props.instanceUrl, props.sitekey, props.secretKey],
	async () => {
		// 変更があったときはリフレッシュと再レンダリングをしておかないと、変更後の値で再検証が出来ない
		if (available.value) {
			callback(undefined);
			clearWidget();
			await requestRender();
		}
	},
);

if (loaded || props.provider === 'cap' || props.provider === 'testcaptcha') {
	available.value = true;
} else if (src.value !== null) {
	(
		window.document.getElementById(scriptId.value) ??
		window.document.head.appendChild(
			Object.assign(window.document.createElement('script'), {
				async: true,
				id: scriptId.value,
				src: src.value,
			}),
		)
	).addEventListener('load', () => (available.value = true));
}

function reset() {
	capWidget.value?.reset();
	if (captcha.value.reset && captchaWidgetId.value !== undefined) {
		try {
			captcha.value.reset(captchaWidgetId.value);
		} catch (error: unknown) {
			// ignore
			if (_DEV_) {
				console.warn(error);
			}
		}
	}

	testcaptchaPassed.value = false;
	testcaptchaInput.value = '';
}

function remove() {
	if (captcha.value.remove && captchaWidgetId.value) {
		try {
			if (_DEV_) {
				console.log('remove', props.provider, captchaWidgetId.value);
			}
			captcha.value.remove(captchaWidgetId.value);
		} catch (error: unknown) {
			// ignore
			if (_DEV_) {
				console.warn(error);
			}
		}
	}

}

async function requestRender() {
	if (captcha.value.render && captchaEl.value instanceof Element && props.sitekey) {
		// reCAPTCHAのレンダリング重複判定を回避するため、captchaEl配下に仮のdivを用意する.
		// （同じdivに対して複数回renderを呼び出すとreCAPTCHAはエラーを返すので）
		const elem = window.document.createElement('div');
		captchaEl.value.appendChild(elem);

		captchaWidgetId.value = captcha.value.render(elem, {
			sitekey: props.sitekey,
			theme: store.darkMode ? 'dark' : 'light',
			callback: callback,
			'expired-callback': () => callback(undefined),
			'error-callback': () => callback(undefined),
		});
	} else if (props.provider === 'cap') {
		return;
	} else {
		window.setTimeout(requestRender, 50);
	}
}

function clearWidget() {
	reset();
	remove();

	if (captchaEl.value) {
		// レンダリング先のコンテナの中身を掃除し、フォームが増殖するのを抑止
		captchaEl.value.innerHTML = '';
	}
}

function callback(response?: string) {
	emit('update:modelValue', typeof response === 'string' ? response : null);
}

function testcaptchaSubmit() {
	testcaptchaPassed.value = testcaptchaInput.value === 'ai-chan-kawaii';
	callback(testcaptchaPassed.value ? 'testcaptcha-passed' : undefined);
	if (!testcaptchaPassed.value) {
		testcaptchaInput.value = '';
	}
}

onMounted(() => {
	if (available.value) {
		requestRender();
	} else {
		watch(available, requestRender);
	}
});

onBeforeUnmount(() => {
	clearWidget();
});

defineExpose({
	reset,
});
</script>
