"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { getSnapshot } from "mobx-state-tree";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Play, Pause, Square, ChevronDown } from "lucide-react";
import {
  AnimationPlaybackEngine,
  type PlaybackSpeed,
  type PlaybackState,
  type StrokeLike,
} from "@/engine";
import type { IStrokeLayer } from "@/models/LayerModel";

interface LayerAnimationControlsProps {
  layer: IStrokeLayer;
  onPlaybackFrame?: (visibleStrokes: StrokeLike[]) => void;
  onPlaybackStateChange?: (state: PlaybackState) => void;
  className?: string;
}

/**
 * Format milliseconds to mm:ss display
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 2, 4];

const LayerAnimationControls: React.FC<LayerAnimationControlsProps> = observer(
  ({ layer, onPlaybackFrame, onPlaybackStateChange, className = "" }) => {
    const engineRef = useRef<AnimationPlaybackEngine | null>(null);
    const [playbackState, setPlaybackState] =
      useState<PlaybackState>("stopped");
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const [isSeeking, setIsSeeking] = useState(false);

    // Store callbacks in refs to avoid stale closures
    const onPlaybackFrameRef = useRef(onPlaybackFrame);
    const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);

    useEffect(() => {
      onPlaybackFrameRef.current = onPlaybackFrame;
      onPlaybackStateChangeRef.current = onPlaybackStateChange;
    }, [onPlaybackFrame, onPlaybackStateChange]);

    // Initialize engine
    useEffect(() => {
      const engine = new AnimationPlaybackEngine({
        onFrame: (info, visibleStrokes) => {
          if (!isSeeking) {
            setCurrentTime(info.currentTime);
          }
          onPlaybackFrameRef.current?.(visibleStrokes);
        },
        onStateChange: (state) => {
          setPlaybackState(state);
          onPlaybackStateChangeRef.current?.(state);
        },
        onComplete: () => {
          // Animation finished
        },
      });

      engineRef.current = engine;

      return () => {
        // Notify parent that animation is stopping when component unmounts
        onPlaybackStateChangeRef.current?.("stopped");
        engine.destroy();
        engineRef.current = null;
      };
    }, []);

    // Update strokes when layer changes
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;

      try {
        const snapshot = getSnapshot(layer) as any;
        const strokes = (snapshot.strokes || []) as StrokeLike[];
        engine.setStrokes(strokes);
        const info = engine.getPlaybackInfo();
        setTotalDuration(info.totalDuration);
        setCurrentTime(0);
      } catch (e) {
        // Layer might be detached during reordering
        console.warn("LayerAnimationControls: layer access error", e);
      }
    }, [layer, layer.strokes.length]);

    // Update speed
    useEffect(() => {
      engineRef.current?.setSpeed(speed);
    }, [speed]);

    const handlePlay = useCallback(() => {
      engineRef.current?.play();
    }, []);

    const handlePause = useCallback(() => {
      engineRef.current?.pause();
    }, []);

    const handleStop = useCallback(() => {
      engineRef.current?.stop();
      setCurrentTime(0);
    }, []);

    const handleSeekStart = useCallback(() => {
      setIsSeeking(true);
    }, []);

    const handleSeekChange = useCallback((values: number[]) => {
      const time = values[0];
      setCurrentTime(time);
      engineRef.current?.seek(time);
    }, []);

    const handleSeekEnd = useCallback(() => {
      setIsSeeking(false);
    }, []);

    // Don't render if no strokes or no timing data
    const strokeCount = layer.strokes.length;
    if (strokeCount === 0 || totalDuration === 0) {
      return null;
    }

    const progress =
      totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
    const isPlaying = playbackState === "playing";
    const isPaused = playbackState === "paused";

    return (
      <div
        className={`px-2 py-1.5 border-t border-border/30 bg-muted/20 ${className}`}
      >
        {/* Controls Row */}
        <div className="flex items-center gap-1 mb-1">
          {/* Play/Pause Button */}
          {isPlaying ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handlePause}
              title="Pause"
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handlePlay}
              title="Play"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Stop Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleStop}
            title="Stop"
            disabled={playbackState === "stopped"}
          >
            <Square className="h-3 w-3" />
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Speed Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                {speed}x
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[60px]">
              {SPEED_OPTIONS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={speed === s ? "bg-accent" : ""}
                >
                  {s}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progress Bar Row */}
        <div className="flex items-center gap-2">
          <Slider
            value={[currentTime]}
            min={0}
            max={totalDuration}
            step={100}
            onValueChange={handleSeekChange}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            className="flex-1"
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap min-w-[65px] text-right">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
      </div>
    );
  },
);

export default LayerAnimationControls;
