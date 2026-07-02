/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type FileServerHeaders = Record<string, string | string[] | undefined>;

export type FileServerRequest<
	Params extends Record<string, string> = Record<string, string>,
	Query extends Record<string, unknown> = Record<string, unknown>,
> = {
	params: Params;
	query: Query;
	headers: FileServerHeaders;
};

export type FileServerReply = {
	code: (statusCode: number) => unknown;
	header: (name: string, value: string | number | undefined) => unknown;
	redirect: (url: string, statusCode?: number) => unknown;
	sendFile: (path: string, root: string) => unknown;
};

export function getFileServerHeader(headers: FileServerHeaders, name: string): string | undefined {
	const value = headers[name.toLowerCase()] ?? headers[name];
	if (Array.isArray(value)) return value[0];
	return value;
}
