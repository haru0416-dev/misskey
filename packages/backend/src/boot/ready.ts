/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const readyRef = { value: false };

// HTTP-only ホストは consumer を所有せず、queue の必須性は boot の topology が決める。
export const queueReadyRef = { value: true };
