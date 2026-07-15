/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { role } from '../../../../.storybook/fakes.js';
import { commonHandlers } from '../../../../.storybook/mocks.js';
import MkRoleSelectDialog from '@/features/roles/components/MkRoleSelectDialog.vue';

const roles = [
	role({ displayOrder: 1 }, '1'),
	role({ displayOrder: 1 }, '1'),
	role({ displayOrder: 1 }, '1'),
	role({ displayOrder: 1 }, '1'),
	role({ displayOrder: 2 }, '2'),
	role({ displayOrder: 2 }, '2'),
	role({ displayOrder: 3 }, '3'),
	role({ displayOrder: 3 }, '3'),
	role({ displayOrder: 4 }, '4'),
	role({ displayOrder: 5 }, '5'),
	role({ displayOrder: 6 }, '6'),
	role({ displayOrder: 7 }, '7'),
	role({ displayOrder: 999, name: 'privateRole', isPublic: false }, '999'),
];

function requireRole(index: number) {
	const value = roles[index];
	if (value == null) throw new Error(`Missing role fixture at index ${index}`);
	return value;
}

export const Default = {
	render(args) {
		return {
			components: {
				MkRoleSelectDialog,
			},
			setup() {
				return {
					args,
				};
			},
			computed: {
				props() {
					return {
						...this.args,
					};
				},
			},
			template: '<MkRoleSelectDialog v-bind="props" />',
		};
	},
	args: {
		initialRoleIds: undefined,
		infoMessage: undefined,
		title: undefined,
		publicOnly: true,
	},
	parameters: {
		layout: 'centered',
		msw: {
			handlers: [
				...commonHandlers,
				http.post('/api/admin/roles/list', ({ params }) => {
					return HttpResponse.json(roles);
				}),
			],
		},
	},
	decorators: [
		() => ({
			template: '<div style="width:100cqmin"><story/></div>',
		}),
	],
} satisfies StoryObj<typeof MkRoleSelectDialog>;

export const InitialIds = {
	...Default,
	args: {
		...Default.args,
		initialRoleIds: [0, 1, 4, 6, 8, 10].map(index => requireRole(index).id),
	},
} satisfies StoryObj<typeof MkRoleSelectDialog>;

export const InfoMessage = {
	...Default,
	args: {
		...Default.args,
		infoMessage: 'This is a message.',
	},
} satisfies StoryObj<typeof MkRoleSelectDialog>;

export const Title = {
	...Default,
	args: {
		...Default.args,
		title: 'Select roles',
	},
} satisfies StoryObj<typeof MkRoleSelectDialog>;

export const Full = {
	...Default,
	args: {
		...Default.args,
		initialRoleIds: roles.map((it) => it.id),
		infoMessage: InfoMessage.args.infoMessage,
		title: Title.args.title,
	},
} satisfies StoryObj<typeof MkRoleSelectDialog>;

export const FullWithPrivate = {
	...Default,
	args: {
		...Default.args,
		initialRoleIds: roles.map((it) => it.id),
		infoMessage: InfoMessage.args.infoMessage,
		title: Title.args.title,
		publicOnly: false,
	},
} satisfies StoryObj<typeof MkRoleSelectDialog>;
