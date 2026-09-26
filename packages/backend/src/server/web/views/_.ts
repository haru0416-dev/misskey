/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';

export const comment = `<!--
  E R E B I A
 Thank you for using Toneriko!
 If you are reading this message... how about joining the development?
 https://github.com/haru0416-dev/misskey

-->`;

export const defaultDescription = '✨🌎✨ A interplanetary communication platform ✨🚀✨';

type MinimumCommonData = {
	version: string;
	config: Config;
};

export type ViteFiles = {
	entryJs: string | null;
	css: string[];
	modulePreloads: string[];
};

export type CommonData = MinimumCommonData & {
	langs: string[];
	instanceName: string;
	icon: string | null;
	appleTouchIcon: string | null;
	themeColor: string | null;
	serverErrorImageUrl: string | null;
	infoImageUrl: string | null;
	notFoundImageUrl: string | null;
	instanceUrl: string;
	now: number;
	federationEnabled: boolean;
	frontendViteFiles: ViteFiles | null;
	frontendBootloaderJs: string | null;
	frontendBootloaderCss: string | null;
	frontendEmbedViteFiles: ViteFiles | null;
	frontendEmbedBootloaderJs: string | null;
	frontendEmbedBootloaderCss: string | null;
	metaJson?: string;
	clientCtxJson?: string;
};

export type CommonPropsMinimum<T = Record<string, unknown>> = MinimumCommonData & T;

export type CommonProps<T = Record<string, unknown>> = CommonData & T;
