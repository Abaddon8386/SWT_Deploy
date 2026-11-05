import { createContext, useContext } from 'react';

export interface LiquidGlassContextValue {
  getCanvas: () => HTMLCanvasElement | null;
  getContainerInfo: () => {
    canvas: HTMLCanvasElement | null;
    width: number;
    height: number;
    x: number;
    y: number;
  };
}

export const LiquidGlassContext = createContext<LiquidGlassContextValue | null>(null);

export function useLiquidGlassParent(): LiquidGlassContextValue | null {
  return useContext(LiquidGlassContext);
}
