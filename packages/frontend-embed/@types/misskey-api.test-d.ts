/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { misskeyApi, misskeyApiGet } from '../src/misskey-api.js';

void misskeyApi('meta');
// @ts-expect-error notes/create requires a request body even though every individual field is optional.
void misskeyApi('notes/create');
void misskeyApiGet('meta');
// @ts-expect-error notes/create requires query parameters even though every individual field is optional.
void misskeyApiGet('notes/create');
