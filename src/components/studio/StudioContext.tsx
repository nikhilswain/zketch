import { createContext, useContext } from "react";
import type { StrokeLike } from "@/engine/types";
import type { PlaybackState } from "@/engine/AnimationPlaybackEngine";

export interface StudioHandlers {
  onAnimationFrame?: (layerId: string, strokes: StrokeLike[]) => void;
  onAnimationStateChange?: (layerId: string, state: PlaybackState) => void;
}

export const StudioContext = createContext<StudioHandlers>({});

export const useStudio = () => useContext(StudioContext);
