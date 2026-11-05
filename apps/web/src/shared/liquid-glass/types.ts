export type LiquidGlassShape = 'rounded' | 'circle' | 'pill';

export interface LiquidGlassParams {
  edgeIntensity: number;   // default: 0.01
  rimIntensity: number;    // default: 0.05
  baseIntensity: number;   // default: 0.01
  edgeDistance: number;    // default: 0.15
  rimDistance: number;     // default: 0.8
  baseDistance: number;    // default: 0.1
  cornerBoost: number;     // default: 0.02
  rippleEffect: number;    // default: 0.1
  blurRadius: number;      // default: 5.0
  tintOpacity: number;     // default: 0.2
  warp: boolean;           // default: false
}

export const DEFAULT_GLASS_PARAMS: LiquidGlassParams = {
  edgeIntensity: 0.01,
  rimIntensity: 0.05,
  baseIntensity: 0.01,
  edgeDistance: 0.15,
  rimDistance: 0.8,
  baseDistance: 0.1,
  cornerBoost: 0.02,
  rippleEffect: 0.1,
  blurRadius: 5.0,
  tintOpacity: 0.2,
  warp: false,
};
