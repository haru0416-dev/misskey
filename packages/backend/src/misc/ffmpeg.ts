/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// fluent-ffmpeg と同じ環境変数でバイナリの場所を上書きできるようにする
const FFMPEG_BIN = process.env['FFMPEG_PATH'] ?? 'ffmpeg';
const FFPROBE_BIN = process.env['FFPROBE_PATH'] ?? 'ffprobe';

export type FfprobeResult = {
	streams: {
		codec_type?: string;
	}[];
	format: {
		duration?: string;
	};
};

export function spawnFfmpeg(args: string[]): ChildProcess {
	return spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

export function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawnFfmpeg(args);
		let stderr = '';
		proc.stderr?.on('data', (chunk) => {
			// エラー時の診断用に末尾のみ保持する
			stderr = (stderr + String(chunk)).slice(-4096);
		});
		proc.on('error', reject);
		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
			}
		});
	});
}

export function ffprobe(path: string): Promise<FfprobeResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(FFPROBE_BIN, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', (chunk) => {
			stdout += String(chunk);
		});
		proc.stderr.on('data', (chunk) => {
			stderr = (stderr + String(chunk)).slice(-4096);
		});
		proc.on('error', reject);
		proc.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout) as FfprobeResult);
			} catch (e) {
				reject(e);
			}
		});
	});
}
