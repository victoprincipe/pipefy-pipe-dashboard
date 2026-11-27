'use client';

import React, { useRef, useState } from 'react';
import { ExternalLink, FileCode2, Layers, RotateCw } from 'lucide-react';
import {
  ARCHIFY_DIAGRAMS,
  type ArchifyDiagramMeta,
} from '@/data/interviewDocsContent';

export function ArchifyViewerSection() {
  const [activeSlug, setActiveSlug] =
    useState<ArchifyDiagramMeta['slug']>('architecture');
  const [reloadNonce, setReloadNonce] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeDiagram =
    ARCHIFY_DIAGRAMS.find((item) => item.slug === activeSlug) ??
    ARCHIFY_DIAGRAMS[0];

  const iframeSrc = `/api/local-docs/archify/${activeDiagram.slug}${
    reloadNonce > 0 ? `?r=${reloadNonce}` : ''
  }`;

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const count = ARCHIFY_DIAGRAMS.length;
    let nextIndex = index;

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % count;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = count - 1;
    } else {
      return;
    }

    event.preventDefault();
    const targetDiagram = ARCHIFY_DIAGRAMS[nextIndex];
    setActiveSlug(targetDiagram.slug);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle">
        <div
          role="tablist"
          aria-label="Diagramas interativos gerados com Archify"
          className="flex flex-nowrap gap-1 overflow-x-auto"
        >
          {ARCHIFY_DIAGRAMS.map((diagram, index) => {
            const isSelected = diagram.slug === activeDiagram.slug;
            return (
              <button
                key={diagram.slug}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={`archify-tab-${diagram.slug}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveSlug(diagram.slug)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
                className={`relative shrink-0 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                  isSelected
                    ? 'text-brand-shade'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {diagram.tabLabel}
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-brand"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pb-2 sm:pb-0">
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="pf-press inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-secondary hover:border-border-strong hover:text-ink"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Recarregar
          </button>
          <a
            href={`/api/local-docs/archify/${activeDiagram.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pf-press inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-shade hover:border-brand"
          >
            Abrir diagrama em tela cheia
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`archify-tab-${activeDiagram.slug}`}
        tabIndex={0}
        className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-pf-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-canvas px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-ink">{activeDiagram.title}</h3>
            <p className="text-xs text-ink-secondary">{activeDiagram.subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-secondary">
            <Layers className="h-3 w-3 text-brand" aria-hidden="true" />
            Archify · verified HTML
          </span>
        </div>

        <iframe
          key={iframeSrc}
          src={iframeSrc}
          title={activeDiagram.title}
          className="h-[640px] w-full border-0 bg-white"
        />

        <div className="border-t border-border-subtle bg-canvas px-5 py-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-shade">
            Como explicar este diagrama na entrevista (30s)
          </div>
          <ul className="space-y-1.5 text-sm text-ink-secondary">
            {activeDiagram.explainBullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2">
            <FileCode2
              className="mr-1 h-3.5 w-3.5 text-ink-secondary"
              aria-hidden="true"
            />
            {activeDiagram.files.map((filePath) => (
              <span
                key={filePath}
                className="rounded-md border border-border-subtle bg-surface px-2 py-0.5 font-mono text-[11px] text-ink"
              >
                {filePath}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
