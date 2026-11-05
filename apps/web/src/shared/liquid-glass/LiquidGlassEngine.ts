import {
  DEFAULT_GLASS_PARAMS,
  LiquidGlassParams,
} from './types';
import {
  CONTAINER_FRAGMENT_SHADER_SOURCE,
  NESTED_FRAGMENT_SHADER_SOURCE,
  VERTEX_SHADER_SOURCE,
} from './shaders';

type ParamListener = (params: LiquidGlassParams) => void;

export interface GLProgramRefs {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  texcoordBuffer: WebGLBuffer;
  texture: WebGLTexture;
  // Uniform locations
  imageLoc: WebGLUniformLocation | null;
  resolutionLoc: WebGLUniformLocation | null;
  textureSizeLoc: WebGLUniformLocation | null;
  scrollYLoc: WebGLUniformLocation | null;
  pageHeightLoc: WebGLUniformLocation | null;
  viewportHeightLoc: WebGLUniformLocation | null;
  blurRadiusLoc: WebGLUniformLocation | null;
  borderRadiusLoc: WebGLUniformLocation | null;
  containerPositionLoc: WebGLUniformLocation | null;
  warpLoc: WebGLUniformLocation | null;
  edgeIntensityLoc: WebGLUniformLocation | null;
  rimIntensityLoc: WebGLUniformLocation | null;
  baseIntensityLoc: WebGLUniformLocation | null;
  edgeDistanceLoc: WebGLUniformLocation | null;
  rimDistanceLoc: WebGLUniformLocation | null;
  baseDistanceLoc: WebGLUniformLocation | null;
  cornerBoostLoc: WebGLUniformLocation | null;
  rippleEffectLoc: WebGLUniformLocation | null;
  tintOpacityLoc: WebGLUniformLocation | null;
  // Nested-specific locations
  buttonPositionLoc?: WebGLUniformLocation | null;
  containerSizeLoc?: WebGLUniformLocation | null;
  lastSnapshot?: HTMLCanvasElement | null;
}

class LiquidGlassEngine {
  private static instance: LiquidGlassEngine;
  public params: LiquidGlassParams = { ...DEFAULT_GLASS_PARAMS };
  private listeners: Set<ParamListener> = new Set();
  
  public pageSnapshot: HTMLCanvasElement | null = null;
  public isCapturing = false;
  private waitingInstances: Array<() => void> = [];
  private activeRenderers: Set<() => void> = new Set();
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private animFrameId: number | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.pageSnapshot = this.createFallbackTexture();
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      window.addEventListener('resize', this.handleResize, { passive: true });
    }
  }

  public static getInstance(): LiquidGlassEngine {
    if (!LiquidGlassEngine.instance) {
      LiquidGlassEngine.instance = new LiquidGlassEngine();
    }
    return LiquidGlassEngine.instance;
  }

  public setParams(newParams: Partial<LiquidGlassParams>) {
    this.params = { ...this.params, ...newParams };
    this.listeners.forEach((listener) => listener(this.params));
    this.requestAllRender();
  }

  public subscribe(listener: ParamListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public registerRenderer(renderFn: () => void) {
    this.activeRenderers.add(renderFn);
    return () => {
      this.activeRenderers.delete(renderFn);
    };
  }

  public requestAllRender() {
    if (this.animFrameId) return;
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      this.activeRenderers.forEach((render) => render());
    });
  }

  private handleScroll = () => {
    this.requestAllRender();
  };

  private handleResize = () => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.pageSnapshot = this.createFallbackTexture();
      this.requestAllRender();
    }, 250);
  };

  public captureSnapshot(onComplete?: () => void) {
    if (typeof window === 'undefined') return;

    if (!this.pageSnapshot) {
      this.pageSnapshot = this.createFallbackTexture();
    }

    if (onComplete) onComplete();
    this.requestAllRender();
  }

  private createFallbackTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(window.innerWidth, 1200);
    canvas.height = Math.max(window.innerHeight * 2, 2000);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create rich organic ambient gradient representing Söl Sanctuary
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#1A1614');
      grad.addColorStop(0.3, '#2A231F');
      grad.addColorStop(0.6, '#3A302A');
      grad.addColorStop(1, '#1A1614');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gold warm ambient orbs
      ctx.fillStyle = 'rgba(194, 166, 132, 0.15)';
      ctx.beginPath();
      ctx.arc(canvas.width * 0.3, 400, 300, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(212, 184, 150, 0.12)';
      ctx.beginPath();
      ctx.arc(canvas.width * 0.7, 900, 400, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  public setupWebGL(
    canvas: HTMLCanvasElement,
    isNested: boolean = false
  ): GLProgramRefs | null {
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      alpha: true,
      antialias: true,
    });
    if (!gl) return null;

    const fsSource = isNested
      ? NESTED_FRAGMENT_SHADER_SOURCE
      : CONTAINER_FRAGMENT_SHADER_SOURCE;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    gl.useProgram(program);

    // Quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinates
    const texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0,
      ]),
      gl.STATIC_DRAW
    );

    const texLoc = gl.getAttribLocation(program, 'a_texcoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return {
      gl,
      program,
      positionBuffer: positionBuffer!,
      texcoordBuffer: texcoordBuffer!,
      texture,
      imageLoc: gl.getUniformLocation(program, 'u_image'),
      resolutionLoc: gl.getUniformLocation(program, 'u_resolution'),
      textureSizeLoc: gl.getUniformLocation(program, 'u_textureSize'),
      scrollYLoc: gl.getUniformLocation(program, 'u_scrollY'),
      pageHeightLoc: gl.getUniformLocation(program, 'u_pageHeight'),
      viewportHeightLoc: gl.getUniformLocation(program, 'u_viewportHeight'),
      blurRadiusLoc: gl.getUniformLocation(program, 'u_blurRadius'),
      borderRadiusLoc: gl.getUniformLocation(program, 'u_borderRadius'),
      containerPositionLoc: gl.getUniformLocation(program, 'u_containerPosition'),
      warpLoc: gl.getUniformLocation(program, 'u_warp'),
      edgeIntensityLoc: gl.getUniformLocation(program, 'u_edgeIntensity'),
      rimIntensityLoc: gl.getUniformLocation(program, 'u_rimIntensity'),
      baseIntensityLoc: gl.getUniformLocation(program, 'u_baseIntensity'),
      edgeDistanceLoc: gl.getUniformLocation(program, 'u_edgeDistance'),
      rimDistanceLoc: gl.getUniformLocation(program, 'u_rimDistance'),
      baseDistanceLoc: gl.getUniformLocation(program, 'u_baseDistance'),
      cornerBoostLoc: gl.getUniformLocation(program, 'u_cornerBoost'),
      rippleEffectLoc: gl.getUniformLocation(program, 'u_rippleEffect'),
      tintOpacityLoc: gl.getUniformLocation(program, 'u_tintOpacity'),
      buttonPositionLoc: isNested ? gl.getUniformLocation(program, 'u_buttonPosition') : null,
      containerSizeLoc: isNested ? gl.getUniformLocation(program, 'u_containerSize') : null,
    };
  }

  private compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}

export const glassEngine = LiquidGlassEngine.getInstance();
