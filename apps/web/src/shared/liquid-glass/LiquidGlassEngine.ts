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
/** Tỉ lệ pixel của ảnh chụp so với CSS px; shader dùng kích thước logic nên không lệch. */
const SNAPSHOT_SCALE = 0.5;

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

/**
 * Rút gọn bản clone: khối nằm hẳn ngoài dải cần chụp được làm rỗng nhưng giữ nguyên kích
 * thước, nên bố cục không đổi mà html2canvas có ít phần tử phải phân tích (trang dài như
 * landing ~15.000px giảm từ hàng nghìn phần tử xuống vài trăm).
 */
function pruneOutsideBand(root: Element, top: number, bottom: number, depth: number) {
  const view = root.ownerDocument.defaultView;
  if (!view || depth > 8) return;
  for (const child of Array.from(root.children)) {
    if (!(child instanceof view.HTMLElement) || child.tagName === 'HEAD' || child.tagName === 'STYLE') continue;
    const rect = child.getBoundingClientRect();
    if (rect.height === 0 && rect.width === 0) continue;
    const position = view.getComputedStyle(child).position;
    if (position === 'fixed' || position === 'sticky') continue;
    if (rect.bottom < top || rect.top > bottom) {
      child.style.setProperty('box-sizing', 'border-box', 'important');
      child.style.setProperty('height', `${rect.height}px`, 'important');
      child.style.setProperty('min-height', `${rect.height}px`, 'important');
      child.style.setProperty('width', `${rect.width}px`, 'important');
      child.replaceChildren();
    } else if (child.children.length > 0 && (rect.top < top || rect.bottom > bottom)) {
      // Cắt ngang dải: đi tiếp vào trong để làm rỗng phần con nằm ngoài.
      pruneOutsideBand(child, top, bottom, depth + 1);
    }
  }
}

function prepareClone(doc: Document, bandTop: number, bandBottom: number) {
  // Animation/transition chạy lại từ đầu trong bản clone (vd. hiệu ứng hiện dần của landing),
  // khiến phần tử bị chụp lúc còn trong suốt. Tắt hết để chụp đúng trạng thái đang hiển thị.
  const freeze = doc.createElement('style');
  freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
  doc.head.appendChild(freeze);
  // Clone cuộn ở 0 nên getBoundingClientRect chính là toạ độ tài liệu.
  if (doc.body) pruneOutsideBand(doc.body, bandTop, bandBottom, 0);
  normalizeModernColors(doc);
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
  /** Góc trên-trái (toạ độ tài liệu) và kích thước logic của vùng đã chụp. */
  public snapshotOriginX = 0;
  public snapshotOriginY = 0;
  public snapshotWidth = 0;
  public snapshotHeight = 0;
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
      // Đổi theme sáng/tối (data-theme, class trên <html>): nền phía sau đổi hoàn toàn nên ảnh cũ
      // không còn đúng. Tạm dùng kính CSS và chụp lại ngay.
      new MutationObserver(() => {
        this.contentDirty = true;
        this.requestAllRender();
        this.scheduleRecapture(60);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
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

  /**
   * html2canvas chạy trên main thread (~50–80ms): chỉ chụp lại khi người dùng đã ngừng
   * thao tác một lúc và trình duyệt rảnh, để không khựng ngay lúc vừa dừng cuộn/kéo.
   */
  private scheduleRecapture(delay: number) {
    if (!this.hasActiveGlass()) return;
    if (this.recaptureTimeout) clearTimeout(this.recaptureTimeout);
    this.recaptureTimeout = setTimeout(() => {
      this.recaptureTimeout = null;
      const run = () => { void this.captureSnapshot(); };
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, delay);
  }

  /** Nội dung trong một khung cuộn con đã dịch chuyển: ảnh chụp không còn khớp tới khi chụp lại. */
  private contentDirty = false;

  /**
   * Ảnh chụp còn khớp với những gì đang hiển thị (viewport nằm trong vùng đã chụp và không có
   * khung con nào cuộn). Khi false, lớp kính tạm dùng blur CSS cho tới lần chụp kế tiếp.
   */
  public viewportCovered() {
    if (!this.pageSnapshot || this.contentDirty) return false;
    const top = window.scrollY;
    const left = window.scrollX;
    return top >= this.snapshotOriginY
      && top + window.innerHeight <= this.snapshotOriginY + this.snapshotHeight
      && left >= this.snapshotOriginX
      && left + window.innerWidth <= this.snapshotOriginX + this.snapshotWidth;
  }

  private handleScroll = (event: Event) => {
    const target = event.target;
    // Cuộn bên trong chính lớp kính (danh sách tin nhắn) không đổi nền phía sau.
    if (target instanceof Element && target.closest(`[${LIQUID_GLASS_IGNORE_ATTR}]`)) return;
    if (!this.hasActiveGlass()) return;
    this.requestAllRender();
    const windowScroll = target === document || target === document.documentElement || target === document.body;
    if (!windowScroll) this.contentDirty = true;
    // Cuộn cửa sổ trong vùng đã chụp: shader tự dịch nền, không cần chụp lại.
    if (windowScroll && this.viewportCovered()) return;
    this.scheduleRecapture(windowScroll ? 250 : 450);
  };

  private handleResize = () => {
    this.requestAllRender();
    this.scheduleRecapture(300);
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
    // Chụp thêm ~1 viewport phía trên và dưới để cuộn qua lại không phải chụp lại liên tục.
    const viewportH = window.innerHeight;
    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, viewportH);
    const originX = window.scrollX;
    const originY = Math.max(0, Math.min(window.scrollY - viewportH * 1.5, docH - viewportH * 4));
    const cropW = window.innerWidth;
    const cropH = Math.min(docH - originY, viewportH * 4);
    const dirtyAtStart = this.contentDirty;
    this.contentDirty = false;
    const run = async () => {
      try {
        const { default: html2canvas } = await import('html2canvas');
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const rootBg = getComputedStyle(document.documentElement).backgroundColor;
        const transparent = (c: string) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
        const snapshot = await html2canvas(document.body, {
          // Bản clone giữ cuộn 0 để toạ độ phần tử là toạ độ tài liệu, rồi cắt đúng vùng viewport.
          // (Để mặc định, html2canvas cộng độ cuộn vào trong khi clone không cuộn theo → lệch.)
          scrollX: 0,
          scrollY: 0,
          x: originX,
          y: originY,
          width: cropW,
          height: cropH,
          windowWidth: document.documentElement.clientWidth,
          windowHeight: window.innerHeight,
          // Nền luôn bị blur: nửa độ phân giải nhẹ hơn ~4 lần mà không thấy khác biệt.
          scale: SNAPSHOT_SCALE,
          logging: false,
          useCORS: true,
          backgroundColor: !transparent(bodyBg) ? bodyBg : !transparent(rootBg) ? rootBg : '#1c1c1c',
          onclone: (doc) => prepareClone(doc, originY - 40, originY + cropH + 40),
          ignoreElements: (el) => el.hasAttribute?.(LIQUID_GLASS_IGNORE_ATTR) ?? false,
        });
        // Khung con lại cuộn trong lúc đang chụp: ảnh vẫn cũ, giữ cờ để chụp tiếp.
        if (this.contentDirty) this.recaptureRequested = true;
        this.pageSnapshot = snapshot;
        this.snapshotOriginX = originX;
        this.snapshotOriginY = originY;
        this.snapshotWidth = cropW;
        this.snapshotHeight = cropH;
        this.requestAllRender();
        return true;
      } catch (error) {
        this.contentDirty = this.contentDirty || dirtyAtStart;
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
