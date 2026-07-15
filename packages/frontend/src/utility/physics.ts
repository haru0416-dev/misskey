/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Matter from 'matter-js';

export function physics(container: HTMLElement) {
	const containerWidth = container.offsetWidth;
	const containerHeight = container.offsetHeight;
	const containerCenterX = containerWidth / 2;

	// サイズ固定化(要らないかも？)
	container.style.position = 'relative';
	container.style.boxSizing = 'border-box';
	container.style.width = `${containerWidth}px`;
	container.style.height = `${containerHeight}px`;

	// create engine
	const engine = Matter.Engine.create({
		constraintIterations: 4,
		positionIterations: 8,
		velocityIterations: 8,
	});

	const world = engine.world;

	// create renderer
	const render = Matter.Render.create({
		engine: engine,
		options: {
			width: containerWidth,
			height: containerHeight,
			background: 'transparent', // transparent to hide
			wireframeBackground: 'transparent', // transparent to hide
		},
	});

	// Disable to hide debug
	Matter.Render.run(render);

	// create runner
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
		const left = objEl.dataset.physicsX ? parseInt(objEl.dataset.physicsX) : objEl.offsetLeft;
		const top = objEl.dataset.physicsY ? parseInt(objEl.dataset.physicsY) : objEl.offsetTop;

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
					chamfer: { radius: parseInt(style.borderRadius || '0', 10) },
					restitution: 0.5,
				},
			);
		}
		objEl.id = obj.id.toString();
		objs.push(obj);
	}

	Matter.World.add(engine.world, objs);

	// Add mouse control

	const mouse = Matter.Mouse.create(container);
	const mouseConstraint = Matter.MouseConstraint.create(engine, {
		mouse: mouse,
		constraint: {
			stiffness: 0.1,
			render: {
				visible: false,
			},
		},
	});

	Matter.World.add(engine.world, mouseConstraint);

	// keep the mouse in sync with rendering
	render.mouse = mouse;

	for (const objEl of objEls) {
		objEl.style.position = 'absolute';
		objEl.style.top = '0';
		objEl.style.left = '0';
		objEl.style.margin = '0';
	}

	let stop = false;
	let animationFrameId = window.requestAnimationFrame(update);

	function update() {
		for (const [i, objEl] of objEls.entries()) {
			const obj = objs[i];
			if (obj == null) continue;
			const x = obj.position.x - objEl.offsetWidth / 2;
			const y = obj.position.y - objEl.offsetHeight / 2;
			const angle = obj.angle;
			objEl.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
		}

		if (!stop) {
			animationFrameId = window.requestAnimationFrame(update);
		}
	}

	// 奈落に落ちたオブジェクトは消す
	const intervalId = window.setInterval(() => {
		for (const obj of objs) {
			if (obj.position.y > containerHeight + 1024) Matter.World.remove(world, obj);
		}
	}, 1000 * 10);

	return {
		stop: () => {
			if (stop) return;
			stop = true;
			window.cancelAnimationFrame(animationFrameId);
			Matter.Render.stop(render);
			Matter.Runner.stop(runner);
			Matter.Mouse.clearSourceEvents(mouse);
			Matter.Engine.clear(engine);
			window.clearInterval(intervalId);
		},
	};
}
