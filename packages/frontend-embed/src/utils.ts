/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { url } from '@shared/utility/config.js';

const acct = (user: Misskey.Acct) => {
	return Misskey.acct.toString(user);
};

const userName = (user: Misskey.entities.User) => {
	return user.name || user.username;
};

export const userPage = (user: Misskey.Acct, path?: string, absolute = false) => {
	return `${absolute ? url : ''}/@${acct(user)}${(path ? `/${path}` : '')}`;
};

export const notePage = (note: Misskey.entities.Note) => {
	return `/notes/${note.id}`;
};
