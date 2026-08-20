/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createTexture, initShaderProgram } from '@/utility/webgl.js';

export type ImageCompositorFunctionParams = Record<string, any>;

export type ImageCompositorFunction<PS extends ImageCompositorFunctionParams = ImageCompositorFunctionParams> = {
	shader: string;
	main: (ctx: {
		gl: WebGL2RenderingContext;
		program: WebGLProgram;
		params: PS;
		u: (name: string) => WebGLUniformLocation;
		width: number;
		height: number;
		textures: Map<string, { texture: WebGLTexture; width: number; height: number }>;
	}) => void;
};

export type ImageCompositorLayer<
	FNS extends Record<string, ImageCompositorFunction> = Record<string, ImageCompositorFunction>,
> = {
	[K in keyof FNS]: {
		id: string;
		functionId: K;
		params: Parameters<FNS[K]['main']>[0]['params'];
	};
}[keyof FNS];

export function defineImageCompositorFunction<PS extends ImageCompositorFunctionParams>(
	fn: ImageCompositorFunction<PS>,
) {
	return fn;
}

export class ImageCompositor<FNS extends Record<string, ImageCompositorFunction<any>>> {
	private gl: WebGL2RenderingContext;
	private canvas: HTMLCanvasElement | null = null;
	private renderWidth: number;
	private renderHeight: number;
	private baseTexture: WebGLTexture;
	private vertexBuffer: WebGLBuffer;
	private shaderCache: Map<string, WebGLProgram> = new Map();
	private uniformLocationCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
	private perLayerResultTextures: Map<string, WebGLTexture> = new Map();
	private perLayerResultFrameBuffers: Map<string, WebGLFramebuffer> = new Map();
	private nopProgram: WebGLProgram;
	private registeredTextures: Map<string, { texture: WebGLTexture; width: number; height: number }> = new Map();
	private registeredFunctions: Map<string, ImageCompositorFunction & { id: string; uniforms: string[] }> = new Map();

	constructor(options: {
		canvas: HTMLCanvasElement;
		renderWidth: number;
		renderHeight: number;
		image: ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement | null;
		functions: FNS;
	}) {
		this.canvas = options.canvas;
		this.renderWidth = options.renderWidth;
		this.renderHeight = options.renderHeight;

		this.canvas.width = this.renderWidth;
		this.canvas.height = this.renderHeight;

		const gl = this.canvas.getContext('webgl2', {
			preserveDrawingBuffer: false,
			alpha: true,
			premultipliedAlpha: false,
		});

		if (gl == null) throw new Error('Failed to initialize WebGL2 context');

		this.gl = gl;

		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

		const VERTICES = new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]);
		const vertexBuffer = gl.createBuffer();
		if (vertexBuffer == null) throw new Error('Failed to create vertex buffer');
		this.vertexBuffer = vertexBuffer;
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, VERTICES, gl.STATIC_DRAW);

		if (options.image != null) {
			this.baseTexture = createTexture(gl);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				options.image.width,
				options.image.height,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				options.image,
			);
			gl.bindTexture(gl.TEXTURE_2D, null);
		} else {
			this.baseTexture = createTexture(gl);
			gl.activeTexture(gl.TEXTURE0);
		}

		this.nopProgram = initShaderProgram(
			this.gl,
			`#version 300 es
			in vec2 position;
			out vec2 in_uv;

			void main() {
				in_uv = (position + 1.0) / 2.0;
				gl_Position = vec4(position * vec2(1.0, -1.0), 0.0, 1.0);
			}
		`,
			`#version 300 es
			precision mediump float;

			in vec2 in_uv;
			uniform sampler2D u_texture;
			out vec4 out_color;

			void main() {
				out_color = texture(u_texture, in_uv);
			}
		`,
		);

		// レジスタ番号はシェーダープログラムに属しているわけではなく、独立の存在なので、とりあえず nopProgram を使って設定する(その後は効果が持続する)
		// ref. https://qiita.com/emadurandal/items/5966c8374f03d4de3266
		const positionLocation = gl.getAttribLocation(this.nopProgram, 'position');
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(positionLocation);

		for (const [id, fn] of Object.entries(options.functions)) {
			const uniforms = this.extractUniformNamesFromShader(fn.shader);
			this.registeredFunctions.set(id, { ...fn, id, uniforms });
		}
	}

	private extractUniformNamesFromShader(shader: string): string[] {
		const uniformRegex = /uniform\s+\w+\s+(\w+)\s*;/g;
		const uniforms: string[] = [];
		let match;
		while ((match = uniformRegex.exec(shader)) !== null) {
			const name = match[1];
			if (name != null) uniforms.push(name.replace(/^u_/, ''));
		}
		return uniforms;
	}

	private getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
		let locations = this.uniformLocationCache.get(program);
		if (locations == null) {
			locations = new Map();
			this.uniformLocationCache.set(program, locations);
		}
		if (locations.has(name)) return locations.get(name) ?? null;
		const location = this.gl.getUniformLocation(program, name);
		locations.set(name, location);
		return location;
	}

	private renderLayer(layer: ImageCompositorLayer, preTexture: WebGLTexture, invert = false) {
		const gl = this.gl;

		const fn = this.registeredFunctions.get(layer.functionId);
		if (fn == null) return;

		const cachedShader = this.shaderCache.get(fn.id);
		const shaderProgram =
			cachedShader ??
			initShaderProgram(
				this.gl,
				`#version 300 es
			in vec2 position;
			uniform bool u_invert;
			out vec2 in_uv;

			void main() {
				in_uv = (position + 1.0) / 2.0;
				gl_Position = u_invert ? vec4(position * vec2(1.0, -1.0), 0.0, 1.0) : vec4(position, 0.0, 1.0);
			}
		`,
				fn.shader,
			);
		if (cachedShader == null) {
			this.shaderCache.set(fn.id, shaderProgram);
		}

		gl.useProgram(shaderProgram);

		const in_resolution = this.getUniformLocation(shaderProgram, 'in_resolution');
		gl.uniform2fv(in_resolution, [this.renderWidth, this.renderHeight]);

		const u_invert = this.getUniformLocation(shaderProgram, 'u_invert');
		gl.uniform1i(u_invert, invert ? 1 : 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, preTexture);
		const in_texture = this.getUniformLocation(shaderProgram, 'in_texture');
		gl.uniform1i(in_texture, 0);

		fn.main({
			gl: gl,
			program: shaderProgram,
			params: layer.params,
			u: (name) => {
				if (!fn.uniforms.includes(name)) {
					throw new Error(`Unknown uniform "${name}" in image compositor function "${fn.id}"`);
				}
				const location = this.getUniformLocation(shaderProgram, 'u_' + name);
				if (location == null) {
					throw new Error(`Uniform "${name}" is unavailable in image compositor function "${fn.id}"`);
				}
				return location;
			},
			width: this.renderWidth,
			height: this.renderHeight,
			textures: this.registeredTextures,
		});

		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	public render(layers: ImageCompositorLayer<FNS>[]) {
		const gl = this.gl;
		const intermediateLayerIds = new Set(layers.slice(0, -1).map((layer) => layer.id));
		for (const [id, texture] of this.perLayerResultTextures) {
			if (intermediateLayerIds.has(id)) continue;
			gl.deleteTexture(texture);
			this.perLayerResultTextures.delete(id);
		}
		for (const [id, framebuffer] of this.perLayerResultFrameBuffers) {
			if (intermediateLayerIds.has(id)) continue;
			gl.deleteFramebuffer(framebuffer);
			this.perLayerResultFrameBuffers.delete(id);
		}

		// 入力をそのまま出力
		if (layers.length === 0) {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);

			gl.useProgram(this.nopProgram);
			gl.uniform1i(this.getUniformLocation(this.nopProgram, 'u_texture'), 0);

			gl.drawArrays(gl.TRIANGLES, 0, 6);
			return;
		}

		let preTexture = this.baseTexture;

		for (const [i, layer] of layers.entries()) {
			const isLast = i === layers.length - 1;
			if (isLast) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				this.renderLayer(layer as ImageCompositorLayer, preTexture, true);
				continue;
			}

			const cachedResultTexture = this.perLayerResultTextures.get(layer.id);
			const resultTexture = cachedResultTexture ?? createTexture(gl);
			if (cachedResultTexture == null) {
				this.perLayerResultTextures.set(layer.id, resultTexture);
			}
			gl.bindTexture(gl.TEXTURE_2D, resultTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.renderWidth, this.renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindTexture(gl.TEXTURE_2D, null);

			const cachedResultFrameBuffer = this.perLayerResultFrameBuffers.get(layer.id);
			const resultFrameBuffer = cachedResultFrameBuffer ?? gl.createFramebuffer();
			if (resultFrameBuffer == null) throw new Error('Failed to create framebuffer');
			if (cachedResultFrameBuffer == null) {
				this.perLayerResultFrameBuffers.set(layer.id, resultFrameBuffer);
			}
			gl.bindFramebuffer(gl.FRAMEBUFFER, resultFrameBuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resultTexture, 0);

			this.renderLayer(layer as ImageCompositorLayer, preTexture);

			preTexture = resultTexture;
		}
	}

	public registerTexture(key: string, image: ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement) {
		const gl = this.gl;

		const existing = this.registeredTextures.get(key);
		if (existing != null) {
			gl.deleteTexture(existing.texture);
			this.registeredTextures.delete(key);
		}

		const texture = createTexture(gl);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
		gl.bindTexture(gl.TEXTURE_2D, null);

		this.registeredTextures.set(key, {
			texture: texture,
			width: image.width,
			height: image.height,
		});
	}

	public unregisterTexture(key: string) {
		const gl = this.gl;

		const existing = this.registeredTextures.get(key);
		if (existing != null) {
			gl.deleteTexture(existing.texture);
			this.registeredTextures.delete(key);
		}
	}

	public hasTexture(key: string) {
		return this.registeredTextures.has(key);
	}

	public getKeysOfRegisteredTextures() {
		return this.registeredTextures.keys();
	}

	public changeResolution(width: number, height: number) {
		if (this.renderWidth === width && this.renderHeight === height) return;

		this.renderWidth = width;
		this.renderHeight = height;
		if (this.canvas) {
			this.canvas.width = this.renderWidth;
			this.canvas.height = this.renderHeight;
		}
		this.gl.viewport(0, 0, this.renderWidth, this.renderHeight);
	}

	/*
	 * disposeCanvas = true だとloseContextを呼ぶため、コンストラクタで渡されたcanvasも再利用不可になるので注意
	 */
	public destroy(disposeCanvas = true) {
		this.gl.deleteBuffer(this.vertexBuffer);
		this.gl.deleteProgram(this.nopProgram);

		for (const shader of this.shaderCache.values()) {
			this.gl.deleteProgram(shader);
		}
		this.shaderCache.clear();

		for (const texture of this.perLayerResultTextures.values()) {
			this.gl.deleteTexture(texture);
		}
		this.perLayerResultTextures.clear();

		for (const framebuffer of this.perLayerResultFrameBuffers.values()) {
			this.gl.deleteFramebuffer(framebuffer);
		}
		this.perLayerResultFrameBuffers.clear();

		for (const texture of this.registeredTextures.values()) {
			this.gl.deleteTexture(texture.texture);
		}
		this.registeredTextures.clear();

		this.gl.deleteTexture(this.baseTexture);

		if (disposeCanvas) {
			const loseContextExt = this.gl.getExtension('WEBGL_lose_context');
			if (loseContextExt) loseContextExt.loseContext();
		}
	}
}
