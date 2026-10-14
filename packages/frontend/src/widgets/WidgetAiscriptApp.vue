<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-aiscriptApp">
	<template #header>{{ i18n.ts._widgets.aiscriptApp }}</template>
	<div :class="$style.root">
		<div v-if="isSyntaxError">Syntax error :(</div>
		<MkAsUi v-else-if="root" :component="root" :components="components" size="small"/>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import { Interpreter, Parser } from 'toneriko-script';
import { useWidgetPropsManager } from './widget.js';
import type { Ref } from 'vue';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import type { AsUiComponent, AsUiRoot } from '@/toneriko-script/ui.js';
import * as os from '@/os.js';
import { tonerikoScriptReadline, alertTonerikoScriptError, createTonerikoScriptEnv } from '@/toneriko-script/api.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import MkAsUi from '@/toneriko-script/components/MkAsUi.vue';
import MkContainer from '@/components/layout/MkContainer.vue';
import { registerAsUiLib } from '@/toneriko-script/ui.js';

const name = 'aiscriptApp';

const widgetPropsDef = {
	script: {
		type: 'string',
		label: i18n.ts.script,
		multiline: true,
		manualSave: true,
		default: '',
	},
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const parser = new Parser();

const root = ref<AsUiRoot>();
const components = ref<Ref<AsUiComponent>[]>([]);
const isSyntaxError = ref(false);

async function run() {
	isSyntaxError.value = false;

	const tonerikoScript = new Interpreter({
		...createTonerikoScriptEnv({
			storageKey: 'widget',
			...($i?.token === undefined ? {} : { token: $i.token }),
		}),
		...registerAsUiLib(components.value, (_root) => {
			root.value = _root.value;
		}),
	}, {
		in: tonerikoScriptReadline,
		err: alertTonerikoScriptError,
		out: (value) => {
			// ウィジェットでは標準出力を使用しない。
		},
		log: (type, params) => {
			// ウィジェットではログ出力を使用しない。
		},
	});

	let ast;
	try {
		ast = parser.parse(widgetProps.script);
	} catch {
		isSyntaxError.value = true;
		return;
	}
	try {
		await tonerikoScript.exec(ast);
	} catch (err) {
		// 実行時のエラーは err で通知されるので、ここに来るのは Toneriko Script の内部のエラーだけ。
		os.alert({
			type: 'error',
			title: 'Internal Error',
			text: err instanceof Error ? err.message : String(err),
		});
	}
}

watch(() => widgetProps.script, () => {
	run();
});

onMounted(() => {
	run();
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-space-lg);
}
</style>
