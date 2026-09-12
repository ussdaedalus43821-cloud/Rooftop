import type { GameState } from "../types.js";
import type { Rng } from "../rng.js";

export interface AppCtx {
  state: GameState;
  rng: Rng;
  rerender: () => void;
  markDirty: () => void;
}

export interface TabModule {
  key: string;
  label: string;
  render(ctx: AppCtx): string;
  onAction?(ctx: AppCtx, action: string, target: HTMLElement): boolean;
  onInput?(ctx: AppCtx, action: string, target: HTMLElement): boolean;
  hasAlert?(ctx: AppCtx): boolean;
}
