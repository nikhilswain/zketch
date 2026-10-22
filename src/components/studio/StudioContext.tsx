import { createContext, useContext } from "react";
import type { PlaybackElement } from "@/engine/AnimationPlaybackEngine";
import type { PlaybackState } from "@/engine/AnimationPlaybackEngine";

export interface StudioHandlers {
  onAnimationFrame?: (layerId: string, frame: PlaybackElement[]) => void;
  onAnimationStateChange?: (layerId: string, state: PlaybackState) => void;
}

export const StudioContext = createContext<StudioHandlers>({});

export const useStudio = () => useContext(StudioContext);
