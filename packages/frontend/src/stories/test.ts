/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// story の play は toHaveTextContent / toBeInTheDocument など jest-dom のマッチャーを使う。
// このエントリが expect.extend と型の拡張をまとめて行う。
import '@testing-library/jest-dom/vitest';

export { expect } from 'vitest';
export { within, waitFor } from '@testing-library/dom';
export { default as userEvent } from '@testing-library/user-event';
