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

interface GlassRenderer {
  render: () => void;
  /** Chỉ chụp lại trang khi có ít nhất một lớp kính đang hiển thị. */
  isActive: () => boolean;
}

/** Phần tử có thuộc tính này (và chính lớp kính) không được chụp vào nền khúc xạ. */
export const LIQUID_GLASS_IGNORE_ATTR = 'data-liquid-glass-ignore';

// html2canvas 1.4 chỉ hiểu rgb/hsl: màu computed dạng color(srgb …), oklch, oklab, lab, lch
// (sinh ra từ color-mix/oklch trong CSS) làm nó ném lỗi. Đổi về rgba trong bản clone.
const MODERN_COLOR = /\b(?:color|oklch|oklab|lab|lch)\([^()]*\)/g;
const COLOR_PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color',
  'box-shadow', 'text-shadow', 'fill', 'stroke', 'caret-color', 'column-rule-color',
];
const colorCache = new Map<string, string>();
let colorCtx: CanvasRenderingContext2D | null = null;

function toRgba(value: string): string {
  const cached = colorCache.get(value);
  if (cached) return cached;
  if (!colorCtx) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    colorCtx = c.getContext('2d', { willReadFrequently: true });
  }
  let result = 'rgba(0, 0, 0, 0)';
  if (colorCtx) {
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = '#000';
    colorCtx.fillStyle = value;
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
    result = `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
  }
  colorCache.set(value, result);
  return result;
}

function normalizeModernColors(doc: Document) {
  const view = doc.defaultView;
  if (!view) return;
  doc.querySelectorAll<HTMLElement | SVGElement>('*').forEach((el) => {
    const computed = view.getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && MODERN_COLOR.test(value)) {
        MODERN_COLOR.lastIndex = 0;
        el.style.setProperty(prop, value.replace(MODERN_COLOR, toRgba), 'important');
      }
      MODERN_COLOR.lastIndex = 0;
    }
  });
}

class LiquidGlassEngine {
  private static instance: LiquidGlassEngine;
  public params: LiquidGlassParams = { ...DEFAULT_GLASS_PARAMS };
  private listeners: Set<ParamListener> = new Set();

  /** Ảnh chụp viewport thật (html2canvas) mà shader khúc xạ, giống liquid-glass-js. */
  public pageSnapshot: HTMLCanvasElement | null = null;
  /** Vị trí cuộn của cửa sổ tại thời điểm chụp, để dịch nền khi người dùng cuộn tiếp. */
  public snapshotScrollX = 0;
  public snapshotScrollY = 0;
  public isCapturing = false;
  private pendingCapture: Promise<boolean> | null = null;
  private recaptureRequested = false;
  private activeRenderers: Set<GlassRenderer> = new Set();
  private recaptureTimeout: ReturnType<typeof setTimeout> | null = null;
  private animFrameId: number | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      // capture: true để bắt cả vùng cuộn bên trong (portal, landing) chứ không chỉ window.
      document.addEventListener('scroll', this.handleScroll, { passive: true, capture: true });
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

  public registerRenderer(render: () => void, isActive: () => boolean = () => true) {
    const entry: GlassRenderer = { render, isActive };
    this.activeRenderers.add(entry);
    return () => {
      this.activeRenderers.delete(entry);
    };
  }

  public requestAllRender() {
    if (this.animFrameId) return;
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      this.activeRenderers.forEach((entry) => entry.render());
    });
  }

  private hasActiveGlass() {
    for (const entry of this.activeRenderers) if (entry.isActive()) return true;
    return false;
  }

  private scheduleRecapture(delay: number) {
    if (!this.hasActiveGlass()) return;
    if (this.recaptureTimeout) clearTimeout(this.recaptureTimeout);
    this.recaptureTimeout = setTimeout(() => {
      this.recaptureTimeout = null;
      void this.captureSnapshot();
    }, delay);
  }

  private handleScroll = (event: Event) => {
    const target = event.target;
    // Cuộn bên trong chính lớp kính (danh sách tin nhắn) không đổi nền phía sau.
    if (target instanceof Element && target.closest(`[${LIQUID_GLASS_IGNORE_ATTR}]`)) return;
    if (!this.hasActiveGlass()) return;
    this.requestAllRender();
    this.scheduleRecapture(180);
  };

  private handleResize = () => {
    this.requestAllRender();
    this.scheduleRecapture(250);
  };

  /**
   * Chụp viewport hiện tại bằng html2canvas (bỏ qua lớp kính) làm texture khúc xạ.
   * Trả về false nếu không chụp được; khi đó giao diện giữ kính CSS dự phòng.
   */
  public captureSnapshot(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (this.pendingCapture) {
      this.recaptureRequested = true;
      return this.pendingCapture;
    }
    this.isCapturing = true;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const run = async () => {
      try {
        const { default: html2canvas } = await import('html2canvas');
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const rootBg = getComputedStyle(document.documentElement).backgroundColor;
        const transparent = (c: string) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
        const snapshot = await html2canvas(document.body, {
          x: scrollX,
          y: scrollY,
          width: window.innerWidth,
          height: window.innerHeight,
          windowWidth: document.documentElement.clientWidth,
          windowHeight: window.innerHeight,
          scale: 1,
          logging: false,
          useCORS: true,
          backgroundColor: !transparent(bodyBg) ? bodyBg : !transparent(rootBg) ? rootBg : '#1c1c1c',
          onclone: (doc) => normalizeModernColors(doc),
          ignoreElements: (el) => el.hasAttribute?.(LIQUID_GLASS_IGNORE_ATTR) ?? false,
        });
        this.pageSnapshot = snapshot;
        this.snapshotScrollX = scrollX;
        this.snapshotScrollY = scrollY;
        this.requestAllRender();
        return true;
      } catch (error) {
        if (import.meta.env.DEV) console.warn('[liquid-glass] snapshot failed', error);
        return false;
      } finally {
        this.isCapturing = false;
        this.pendingCapture = null;
        if (this.recaptureRequested) {
          this.recaptureRequested = false;
          this.scheduleRecapture(0);
        }
      }
    };
    this.pendingCapture = run();
    return this.pendingCapture;
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
