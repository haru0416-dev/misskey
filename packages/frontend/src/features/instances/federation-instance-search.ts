/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, markRaw, ref } from 'vue';
import { i18n } from '@/i18n.js';
import { useMkSelect } from '@/composables/useMkSelect.js';
import { Paginator } from '@/utility/paginator.js';

type FederationInstanceState =
	| 'all'
	| 'federating'
	| 'subscribing'
	| 'publishing'
	| 'suspended'
	| 'silenced'
	| 'blocked'
	| 'notResponding';

// 公開ページと管理画面で状態の並び順が異なるため、状態の選択肢は呼び出し側が渡す。
export function useFederationInstanceSearch(stateItems: { label: string; value: FederationInstanceState }[]) {
	const host = ref('');
	const { model: state, def: stateDef } = useMkSelect({
		items: stateItems,
		initialValue: 'federating',
	});
	const { model: sort, def: sortDef } = useMkSelect({
		items: [
			{ label: `${i18n.ts.pubSub} (${i18n.ts.descendingOrder})`, value: '+pubSub' },
			{ label: `${i18n.ts.pubSub} (${i18n.ts.ascendingOrder})`, value: '-pubSub' },
			{ label: `${i18n.ts.notes} (${i18n.ts.descendingOrder})`, value: '+notes' },
			{ label: `${i18n.ts.notes} (${i18n.ts.ascendingOrder})`, value: '-notes' },
			{ label: `${i18n.ts.users} (${i18n.ts.descendingOrder})`, value: '+users' },
			{ label: `${i18n.ts.users} (${i18n.ts.ascendingOrder})`, value: '-users' },
			{ label: `${i18n.ts.following} (${i18n.ts.descendingOrder})`, value: '+following' },
			{ label: `${i18n.ts.following} (${i18n.ts.ascendingOrder})`, value: '-following' },
			{ label: `${i18n.ts.followers} (${i18n.ts.descendingOrder})`, value: '+followers' },
			{ label: `${i18n.ts.followers} (${i18n.ts.ascendingOrder})`, value: '-followers' },
			{ label: `${i18n.ts.registeredAt} (${i18n.ts.descendingOrder})`, value: '+firstRetrievedAt' },
			{ label: `${i18n.ts.registeredAt} (${i18n.ts.ascendingOrder})`, value: '-firstRetrievedAt' },
		],
		initialValue: '+pubSub',
	});
	const paginator = markRaw(
		new Paginator('federation/instances', {
			limit: 10,
			offsetMode: true,
			computedParams: computed(() => ({
				sort: sort.value,
				host: host.value !== '' ? host.value : null,
				...(state.value === 'federating'
					? { federating: true, suspended: false, blocked: false }
					: state.value === 'subscribing'
						? { subscribing: true, suspended: false, blocked: false }
						: state.value === 'publishing'
							? { publishing: true, suspended: false, blocked: false }
							: state.value === 'suspended'
								? { suspended: true }
								: state.value === 'blocked'
									? { blocked: true }
									: state.value === 'silenced'
										? { silenced: true }
										: state.value === 'notResponding'
											? { notResponding: true }
											: {}),
			})),
		}),
	);

	return { host, state, stateDef, sort, sortDef, paginator };
}
