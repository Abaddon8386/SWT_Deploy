import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LiquidGlassShape } from './types';
import { glassEngine, GLProgramRefs } from './LiquidGlassEngine';
import { LiquidGlassContext } from './LiquidGlassContext';
import './liquid-glass.css';

interface LiquidGlassContainerProps {
  shape?: LiquidGlassShape;
  borderRadius?: number;
  tintOpacity?: number;
  /** Bán kính blur của shader (1–15), mặc định theo engine (5). */
  blurRadius?: number;
  /** Lớp kính đang hiển thị: chỉ khi đó mới chụp lại nền trang. */
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function prefersReducedTransparency() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

/**
 * Lớp kính WebGL theo dashersw/liquid-glass-js: shader khúc xạ ảnh chụp thật của trang
 * phía sau (html2canvas). Chỉ gắn class `is-ready` khi đã có ảnh chụp; trước đó (hoặc khi
 * không có WebGL) canvas ẩn và CSS backdrop-filter của phần tử cha làm dự phòng.
 */
export function LiquidGlassContainer({
  shape = 'pill',
  borderRadius = 48,
  tintOpacity = 0.2,
  blurRadius,
  active = true,
  className = '',
  style,
  children,
}: LiquidGlassContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRefs = useRef<GLProgramRefs | null>(null);
  const radiusRef = useRef(borderRadius);
  const activeRef = useRef(active);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    radiusRef.current = borderRadius;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || prefersReducedTransparency()) return;

    const refs = glassEngine.setupWebGL(canvas, false);
    glRefs.current = refs;
    if (!refs) return;

    const updateSize = () => {
      let w = container.offsetWidth || Math.ceil(container.getBoundingClientRect().width);
      let h = container.offsetHeight || Math.ceil(container.getBoundingClientRect().height);
      let r = borderRadius;

      if (shape === 'circle') {
        const size = Math.max(w, h, 64);
        w = size;
        h = size;
        r = size / 2;
      } else if (shape === 'pill') {
        r = h / 2;
      }

      radiusRef.current = r;

      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.borderRadius = `${r}px`;
        refs.gl.viewport(0, 0, w, h);
      }
    };

    updateSize();

    const render = () => {
      const current = glRefs.current;
      const snapshot = glassEngine.pageSnapshot;
      if (!current || !snapshot) return;
      const gl = current.gl;

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Ảnh chụp không khớp vị trí hiện tại: đánh dấu để CSS hiện kính blur dự phòng thay vì
      // kéo giãn mép ảnh cũ; lần chụp kế tiếp sẽ vẽ lại và bỏ dấu.
      const stale = !glassEngine.viewportCovered();
      container.toggleAttribute('data-glass-stale', stale);
      if (stale) return;
      // Ảnh chụp bắt đầu tại snapshotOrigin (toạ độ tài liệu): đổi vị trí viewport sang toạ độ ảnh.
      const dx = window.scrollX - glassEngine.snapshotOriginX;
      const dy = window.scrollY - glassEngine.snapshotOriginY;

      gl.useProgram(current.program);
      gl.bindTexture(gl.TEXTURE_2D, current.texture);
      if (current.lastSnapshot !== snapshot) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snapshot);
        current.lastSnapshot = snapshot;
      }

      gl.uniform2f(current.resolutionLoc, canvas.width, canvas.height);
      // Kích thước logic (CSS px) để toạ độ chuẩn hoá đúng dù ảnh chụp ở tỉ lệ thấp hơn.
      gl.uniform2f(current.textureSizeLoc, glassEngine.snapshotWidth, glassEngine.snapshotHeight);
      gl.uniform1f(current.scrollYLoc, dy);
      gl.uniform1f(current.pageHeightLoc, glassEngine.snapshotHeight);
      gl.uniform1f(current.viewportHeightLoc, window.innerHeight);
      gl.uniform1f(current.borderRadiusLoc, radiusRef.current);
      gl.uniform2f(current.containerPositionLoc, rect.left + rect.width / 2 + dx, rect.top + rect.height / 2);

      const p = glassEngine.params;
      gl.uniform1f(current.warpLoc, p.warp ? 1.0 : 0.0);
      gl.uniform1f(current.blurRadiusLoc, blurRadius ?? p.blurRadius);
      gl.uniform1f(current.edgeIntensityLoc, p.edgeIntensity);
      gl.uniform1f(current.rimIntensityLoc, p.rimIntensity);
      gl.uniform1f(current.baseIntensityLoc, p.baseIntensity);
      gl.uniform1f(current.edgeDistanceLoc, p.edgeDistance);
      gl.uniform1f(current.rimDistanceLoc, p.rimDistance);
      gl.uniform1f(current.baseDistanceLoc, p.baseDistance);
      gl.uniform1f(current.cornerBoostLoc, p.cornerBoost);
      gl.uniform1f(current.rippleEffectLoc, p.rippleEffect);
      gl.uniform1f(current.tintOpacityLoc, tintOpacity);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const unregister = glassEngine.registerRenderer(render, () => activeRef.current);
    render();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
      render();
    });
    resizeObserver.observe(container);

    return () => {
      unregister();
      resizeObserver.disconnect();
      glRefs.current = null;
    };
  }, [shape, borderRadius, tintOpacity, blurRadius]);

  // Mỗi lần lớp kính hiện ra, chụp lại trang phía sau để nền khúc xạ luôn đúng.
  useEffect(() => {
    activeRef.current = active;
    if (!active || prefersReducedTransparency()) {
      setReady(false);
      return;
    }
    let cancelled = false;
    // Đã có ảnh chụp (vd. nút pill vừa chụp): hiện kính WebGL ngay từ khung hình đầu
    // khi mở, rồi chụp lại ở nền để cập nhật. Chưa có thì giữ kính CSS cho tới khi chụp xong.
    const hasSnapshot = glassEngine.pageSnapshot !== null && glRefs.current !== null;
    setReady(hasSnapshot);
    if (hasSnapshot) glassEngine.requestAllRender();
    // Hoãn chụp sang lúc trình duyệt rảnh để không chặn lần vẽ đầu của trang.
    const start = () => {
      void glassEngine.captureSnapshot().then((ok) => {
        if (!cancelled) setReady(ok && glRefs.current !== null);
      });
    };
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(start, { timeout: 600 })
      : window.setTimeout(start, 120);
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [active]);

  const getCanvas = useCallback(() => canvasRef.current, []);

  const getContainerInfo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { canvas: null, width: 0, height: 0, x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      canvas,
      width: rect.width,
      height: rect.height,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  const shapeClass =
    shape === 'circle' ? 'glass-container-circle' : shape === 'pill' ? 'glass-container-pill' : '';

  return (
    <LiquidGlassContext.Provider value={{ getCanvas, getContainerInfo }}>
      <div
        ref={containerRef}
        className={`glass-container ${shapeClass} ${ready ? 'is-ready' : ''} ${className}`}
        style={style}
        aria-hidden={children ? undefined : true}
      >
        <canvas ref={canvasRef} />
        {children}
      </div>
    </LiquidGlassContext.Provider>
  );
}
