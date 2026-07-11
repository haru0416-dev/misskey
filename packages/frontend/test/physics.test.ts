/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const matter = vi.hoisted(() => ({
	Engine: {
		create: vi.fn(() => ({ world: {} })),
		clear: vi.fn(),
	},
	Render: {
		create: vi.fn(() => ({ mouse: null })),
		run: vi.fn(),
		stop: vi.fn(),
	},
	Runner: {
		create: vi.fn(() => ({})),
		run: vi.fn(),
		stop: vi.fn(),
	},
	Bodies: {
		rectangle: vi.fn(() => ({ id: 1, position: { x: 0, y: 0 }, angle: 0 })),
		circle: vi.fn(() => ({ id: 2, position: { x: 0, y: 0 }, angle: 0 })),
	},
	World: {
		add: vi.fn(),
		remove: vi.fn(),
	},
	Mouse: {
		create: vi.fn(() => ({})),
		clearSourceEvents: vi.fn(),
	},
	MouseConstraint: {
		create: vi.fn(() => ({})),
	},
}));

vi.mock('matter-js', () => matter);

describe('physics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('releases animation and Matter.js resources when stopped', async () => {
		const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
		const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
		const container = window.document.createElement('div');
		const child = window.document.createElement('div');
		child.classList.add('_physics_circle_');
		container.append(child);
		const { physics } = await import('@/utility/physics.js');

		const controller = physics(container);
		controller.stop();
		controller.stop();

		expect(requestAnimationFrame).toHaveBeenCalledOnce();
		expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
		expect(matter.Render.stop).toHaveBeenCalledOnce();
		expect(matter.Runner.stop).toHaveBeenCalledOnce();
		expect(matter.Mouse.clearSourceEvents).toHaveBeenCalledOnce();
		expect(matter.Engine.clear).toHaveBeenCalledOnce();
	});
});
