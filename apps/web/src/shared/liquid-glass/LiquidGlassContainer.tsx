import React, {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { LiquidGlassShape } from './types';
import { glassEngine, GLProgramRefs } from './LiquidGlassEngine';
import { LiquidGlassContext } from './LiquidGlassContext';
import './liquid-glass.css';

interface LiquidGlassContainerProps {
  shape?: LiquidGlassShape;
  borderRadius?: number;
  tintOpacity?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function LiquidGlassContainer({
  shape = 'pill',
  borderRadius = 48,
  tintOpacity = 0.2,
  className = '',
  style,
  children,
}: LiquidGlassContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRefs = useRef<GLProgramRefs | null>(null);
  const radiusRef = useRef(borderRadius);

  useEffect(() => {
    radiusRef.current = borderRadius;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Initialize WebGL
    const refs = glassEngine.setupWebGL(canvas, false);
    glRefs.current = refs;

    // Trigger page capture
    glassEngine.captureSnapshot();

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

      if (w > 0 && h > 0) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.style.borderRadius = `${r}px`;
          container.style.borderRadius = `${r}px`;

          if (refs && refs.gl) {
            refs.gl.viewport(0, 0, w, h);
          }
        }
      }
    };

    updateSize();

    // Render loop function
    const render = () => {
      const refs = glRefs.current;
      if (!refs || !refs.gl) return;
      const gl = refs.gl;
      const snapshot = glassEngine.pageSnapshot;
      if (!snapshot) return;

      const rect = canvas.getBoundingClientRect();
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const viewportHeight = window.innerHeight;

      const posX = rect.left + rect.width / 2;
      const posY = rect.top + rect.height / 2;

      gl.useProgram(refs.program);

      // Upload snapshot texture ONLY if it changed or newly initialized
      gl.bindTexture(gl.TEXTURE_2D, refs.texture);
      if (refs.lastSnapshot !== snapshot) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snapshot);
        refs.lastSnapshot = snapshot;
      }

      // Set uniforms
      gl.uniform2f(refs.resolutionLoc, canvas.width, canvas.height);
      gl.uniform2f(refs.textureSizeLoc, snapshot.width, snapshot.height);
      gl.uniform1f(refs.scrollYLoc, scrollY);
      gl.uniform1f(refs.pageHeightLoc, pageHeight);
      gl.uniform1f(refs.viewportHeightLoc, viewportHeight);
      gl.uniform1f(refs.borderRadiusLoc, radiusRef.current);
      gl.uniform2f(refs.containerPositionLoc, posX, posY);

      const p = glassEngine.params;
      gl.uniform1f(refs.warpLoc, p.warp ? 1.0 : 0.0);
      gl.uniform1f(refs.blurRadiusLoc, p.blurRadius);
      gl.uniform1f(refs.edgeIntensityLoc, p.edgeIntensity);
      gl.uniform1f(refs.rimIntensityLoc, p.rimIntensity);
      gl.uniform1f(refs.baseIntensityLoc, p.baseIntensity);
      gl.uniform1f(refs.edgeDistanceLoc, p.edgeDistance);
      gl.uniform1f(refs.rimDistanceLoc, p.rimDistance);
      gl.uniform1f(refs.baseDistanceLoc, p.baseDistance);
      gl.uniform1f(refs.cornerBoostLoc, p.cornerBoost);
      gl.uniform1f(refs.rippleEffectLoc, p.rippleEffect);
      gl.uniform1f(refs.tintOpacityLoc, tintOpacity ?? p.tintOpacity);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const unregister = glassEngine.registerRenderer(render);
    render();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
      render();
    });
    resizeObserver.observe(container);

    return () => {
      unregister();
      resizeObserver.disconnect();
    };
  }, [shape, borderRadius, tintOpacity]);

  const getCanvas = useCallback(() => {
    return canvasRef.current;
  }, []);

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
    shape === 'circle'
      ? 'glass-container-circle'
      : shape === 'pill'
      ? 'glass-container-pill'
      : '';

  return (
    <LiquidGlassContext.Provider value={{ getCanvas, getContainerInfo }}>
      <div
        ref={containerRef}
        className={`glass-container ${shapeClass} ${className}`}
        style={style}
      >
        <canvas ref={canvasRef} />
        {children}
      </div>
    </LiquidGlassContext.Provider>
  );
}
