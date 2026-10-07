/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Matter from 'matter-js';

export function physics(container: HTMLElement) {
	const containerWidth = container.offsetWidth;
	const containerHeight = container.offsetHeight;
	const containerCenterX = containerWidth / 2;

	// 子要素を absolute 配置にしても潰れないよう、現在のサイズで固定する。
	container.style.position = 'relative';
	container.style.boxSizing = 'border-box';
	container.style.width = `${containerWidth}px`;
	container.style.height = `${containerHeight}px`;

	const engine = Matter.Engine.create({
		constraintIterations: 4,
		positionIterations: 8,
		velocityIterations: 8,
	});

	const world = engine.world;

	const runner = Matter.Runner.create();
	Matter.Runner.run(runner, engine);

	const groundThickness = 1024;
	const ground = Matter.Bodies.rectangle(
		containerCenterX,
		containerHeight + groundThickness / 2,
		containerWidth,
		groundThickness,
		{
			isStatic: true,
			restitution: 0.1,
			friction: 2,
		},
	);

	Matter.World.add(world, [ground]);

	const objEls = Array.from(container.children) as HTMLElement[];
	const objs: Matter.Body[] = [];
	for (const objEl of objEls) {
		const left = objEl.dataset['physicsX'] ? Number.parseInt(objEl.dataset['physicsX'], 10) : objEl.offsetLeft;
		const top = objEl.dataset['physicsY'] ? Number.parseInt(objEl.dataset['physicsY'], 10) : objEl.offsetTop;

		let obj: Matter.Body;
		if (objEl.classList.contains('_physics_circle_')) {
			obj = Matter.Bodies.circle(
				left + objEl.offsetWidth / 2,
				top + objEl.offsetHeight / 2,
				Math.max(objEl.offsetWidth, objEl.offsetHeight) / 2,
				{
					restitution: 0.5,
				},
			);
		} else {
			const style = window.getComputedStyle(objEl);
			obj = Matter.Bodies.rectangle(
				left + objEl.offsetWidth / 2,
				top + objEl.offsetHeight / 2,
				objEl.offsetWidth,
				objEl.offsetHeight,
				{
					chamfer: { radius: Number.parseInt(style.borderRadius || '0', 10) },
					restitution: 0.5,
				},
			);
		}
		objEl.id = obj.id.toString();
		objs.push(obj);
	}

	Matter.World.add(engine.world, objs);

	const mouse = Matter.Mouse.create(container);
	const mouseConstraint = Matter.MouseConstraint.create(engine, {
		mouse,
		constraint: {
			stiffness: 0.1,
			render: {
				visible: false,
			},
		},
	});

	Matter.World.add(engine.world, mouseConstraint);

	for (const objEl of objEls) {
		objEl.style.position = 'absolute';
		objEl.style.top = '0';
		objEl.style.left = '0';
		objEl.style.margin = '0';
	}

	let stopped = false;
	let paused = false;
	let animationFrameId: number | null = window.requestAnimationFrame(update);

	function update() {
		animationFrameId = null;
		if (stopped || paused) return;
		for (const [i, objEl] of objEls.entries()) {
			const obj = objs[i];
			if (obj == null) {
				continue;
			}
			const x = obj.position.x - objEl.offsetWidth / 2;
			const y = obj.position.y - objEl.offsetHeight / 2;
			const angle = obj.angle;
			objEl.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
		}

		if (!stopped && !paused) {
			animationFrameId = window.requestAnimationFrame(update);
		}
	}

	let intervalId: number | null = window.setInterval(retireFallenBodies, 1000 * 10);

	function retireFallenBodies() {
		for (const obj of objs) {
			if (obj.position.y > containerHeight + 1024) {
				Matter.World.remove(world, obj);
			}
		}
	}

	function removeMouseListeners() {
		// clearSourceEvents は入力履歴だけを消し、Mouse.setElement が登録した native listener は残す。
		const handlers = mouse as Matter.Mouse & {
			mousemove: EventListener;
			mousedown: EventListener;
			mouseup: EventListener;
			mousewheel: EventListener;
		};
		container.removeEventListener('mousemove', handlers.mousemove);
		container.removeEventListener('mousedown', handlers.mousedown);
		container.removeEventListener('mouseup', handlers.mouseup);
		container.removeEventListener('wheel', handlers.mousewheel);
		container.removeEventListener('touchmove', handlers.mousemove);
		container.removeEventListener('touchstart', handlers.mousedown);
		container.removeEventListener('touchend', handlers.mouseup);
		mouse.button = -1;
		Matter.Mouse.clearSourceEvents(mouse);
	}

	function pause() {
		if (stopped || paused) return;
		paused = true;
		if (animationFrameId != null) window.cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		Matter.Runner.stop(runner);
		if (intervalId != null) window.clearInterval(intervalId);
		intervalId = null;
		removeMouseListeners();
	}

	return {
		pause,
		resume: () => {
			if (stopped || !paused) return;
			paused = false;
			Matter.Mouse.setElement(mouse, container);
			Matter.Runner.run(runner, engine);
			animationFrameId = window.requestAnimationFrame(update);
			intervalId = window.setInterval(retireFallenBodies, 1000 * 10);
		},
		stop: () => {
			if (stopped) return;
			pause();
			stopped = true;
			Matter.Engine.clear(engine);
		},
	};
}
