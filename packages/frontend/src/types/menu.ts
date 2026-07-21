/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import type { Component, ComputedRef, Ref } from 'vue';
import type { OptionValue } from '@/types/option-value.js';
import type { ComponentProps } from '@/utility/component-props.js';

type Text = string | ComputedRef<string>;

export type MenuAction = (ev: PointerEvent) => void;

interface MenuButton {
	type?: 'button';
	text: Text;
	caption?: Text | null | undefined | ComputedRef<null | undefined>;
	icon?: string;
	indicate?: boolean;
	danger?: boolean;
	active?: boolean | ComputedRef<boolean>;
	avatar?: Misskey.entities.User;
	action: MenuAction;
}

interface MenuBase {
	type: string;
}

interface TextMenuBase extends MenuBase {
	text: Text;
	caption?: Text | null | undefined | ComputedRef<null | undefined>;
	icon?: string;
}

interface MenuDivider extends MenuBase {
	type: 'divider';
}

interface MenuLabel extends MenuBase {
	type: 'label';
	text: Text;
	caption?: Text | null | undefined | ComputedRef<null | undefined>;
}

interface MenuLink extends TextMenuBase {
	type: 'link';
	to: string;
	indicate?: boolean;
	avatar?: Misskey.entities.User;
}

interface MenuA extends TextMenuBase {
	type: 'a';
	href: string;
	target?: string;
	download?: string;
	indicate?: boolean;
}

interface MenuUser extends MenuBase {
	type: 'user';
	user: Misskey.entities.User;
	active?: boolean;
	indicate?: boolean;
	action: MenuAction;
}

export interface MenuSwitch extends TextMenuBase {
	type: 'switch';
	ref: Ref<boolean>;
	disabled?: boolean | Ref<boolean>;
}

export interface MenuRadio extends TextMenuBase {
	type: 'radio';
	ref: Ref<OptionValue>;
	options: {
		label: string;
		value: OptionValue;
	}[];
	disabled?: boolean | Ref<boolean>;
}

export interface MenuRadioOption extends MenuBase {
	type: 'radioOption';
	text: Text;
	caption?: Text | null | undefined | ComputedRef<null | undefined>;
	action: MenuAction;
	active?: boolean | ComputedRef<boolean>;
}

interface MenuComponent<T extends Component = any> extends MenuBase {
	type: 'component';
	component: T;
	props?: ComponentProps<T>;
}

export interface MenuParent extends TextMenuBase {
	type: 'parent';
	children: MenuItem[] | (() => Promise<MenuItem[]> | MenuItem[]);
}

export interface MenuPending extends MenuBase {
	type: 'pending';
}

type OuterMenuItem =
	| MenuDivider
	| MenuLabel
	| MenuLink
	| MenuA
	| MenuUser
	| MenuSwitch
	| MenuButton
	| MenuRadio
	| MenuRadioOption
	| MenuComponent
	| MenuParent;
type OuterPromiseMenuItem = Promise<
	MenuLabel | MenuLink | MenuA | MenuUser | MenuSwitch | MenuButton | MenuComponent | MenuParent
>;
export type MenuItem = OuterMenuItem | OuterPromiseMenuItem;
export type InnerMenuItem =
	| MenuDivider
	| MenuPending
	| MenuLabel
	| MenuLink
	| MenuA
	| MenuUser
	| MenuSwitch
	| MenuButton
	| MenuRadio
	| MenuRadioOption
	| MenuComponent
	| MenuParent;
