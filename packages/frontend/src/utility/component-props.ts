/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Component, MaybeRef } from 'vue';
import type { ComponentProps as CP } from 'vue-component-type-helpers';

// 各 prop に ref も渡せるようにする。
export type ComponentProps<T extends Component> = { [K in keyof CP<T>]: MaybeRef<CP<T>[K]> };
