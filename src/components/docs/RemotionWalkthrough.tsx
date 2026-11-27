'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type CallbackListener, type PlayerRef } from '@remotion/player';
import { FileCode2, Film, Pause, Play } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  INTERVIEW_CHAPTERS,
  REMOTION_DURATION_IN_FRAMES,
  REMOTION_FPS,
} from './remotion/interviewChapters';
import { PipeLensStoryComposition } from './remotion/PipeLensStoryComposition';

export function RemotionWalkthrough() {
  const playerRef = useRef<PlayerRef>(null);
  const reducedMotion = useReducedMotion();
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate: CallbackListener<'frameupdate'> = (e) => {
      setCurrentFrame(e.detail.frame);
    };
    const onPlay: CallbackListener<'play'> = () => setIsPlaying(true);
    const onPause: CallbackListener<'pause'> = () => setIsPlaying(false);
    const onEnded: CallbackListener<'ended'> = () => setIsPlaying(false);

    player.addEventListener('frameupdate', onFrameUpdate);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('ended', onEnded);

    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('ended', onEnded);
    };
  }, []);

  const activeChapter = useMemo(() => {
    return (
      INTERVIEW_CHAPTERS.find(
        (chapter) =>
          currentFrame >= chapter.startFrame && currentFrame < chapter.endFrame
      ) ?? INTERVIEW_CHAPTERS[INTERVIEW_CHAPTERS.length - 1]
    );
  }, [currentFrame]);

  const inputProps = useMemo(
    () => ({ activeHighlight: activeChapter.id }),
    [activeChapter.id]
  );

  const handleSelectChapter = (startFrame: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(startFrame);
    setCurrentFrame(startFrame);
    if (reducedMotion) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleTogglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Capítulos do vídeo Remotion">
          {INTERVIEW_CHAPTERS.map((chapter) => {
            const isActive = chapter.id === activeChapter.id;
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => handleSelectChapter(chapter.startFrame)}
                aria-pressed={isActive}
                className={`pf-press rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-brand bg-brand text-white shadow-sm'
                    : 'border-border-subtle bg-surface text-ink-secondary hover:border-brand-tint hover:text-ink'
                }`}
              >
                {chapter.shortLabel}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleTogglePlay}
          className="pf-press inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand"
        >
          {isPlaying ? (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              Pausar resumo
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Reproduzir resumo (45s)
            </>
          )}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-[#0E1720] shadow-pf-card">
          <Player
            ref={playerRef}
            component={PipeLensStoryComposition}
            inputProps={inputProps}
            durationInFrames={REMOTION_DURATION_IN_FRAMES}
            fps={REMOTION_FPS}
            compositionWidth={1280}
            compositionHeight={720}
            controls
            loop
            autoPlay={false}
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
            }}
          />
        </div>

        <aside
          aria-live="polite"
          className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface p-5 shadow-pf-card"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-shade">
                <Film className="h-3.5 w-3.5" aria-hidden="true" />
                Roteiro · Capítulo 0{activeChapter.index}
              </span>
              <span className="font-mono text-xs text-ink-secondary">
                {activeChapter.durationLabel}
              </span>
            </div>

            <h3 className="text-lg font-bold leading-snug text-ink">
              {activeChapter.title}
            </h3>
            <p className="text-xs font-semibold text-brand-shade">
              {activeChapter.headline}
            </p>
            <p className="text-sm leading-relaxed text-ink-secondary">
              {activeChapter.talkingPoint}
            </p>
          </div>

          <div className="mt-5 border-t border-border-subtle pt-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
              <FileCode2 className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              Arquivos para citar
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {activeChapter.keyFiles.map((filePath) => (
                <li
                  key={filePath}
                  className="rounded-md border border-border-subtle bg-canvas px-2 py-1 font-mono text-[11px] text-ink"
                >
                  {filePath}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
