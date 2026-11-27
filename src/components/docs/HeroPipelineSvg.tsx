'use client';

import React from 'react';

const NODES = [
  {
    x: 16,
    title: '1. Pipefy Iframe',
    sub: 'Apps SDK · zero tokens',
    badge: 'manifest.json',
    stroke: '#0B66FF',
    fill: '#EEF4FF',
  },
  {
    x: 244,
    title: '2. Export em Lote',
    sub: '[PipeLens] Snapshot .xlsx',
    badge: '1 request vs 400',
    stroke: '#3C85FF',
    fill: '#F9FCFE',
  },
  {
    x: 472,
    title: '3. Worker + DuckDB',
    sub: 'SheetJS + mvp/eh WASM',
    badge: 'off-main-thread',
    stroke: '#079D88',
    fill: '#F2FCFA',
  },
  {
    x: 700,
    title: '4. Parquet IndexedDB',
    sub: '${userId}::${pipeId}',
    badge: 'TTL 15m · SWR',
    stroke: '#007A6A',
    fill: '#F2FCFA',
  },
];

export function HeroPipelineSvg() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-pf-card">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
        <span>Fluxo End-to-End em 10 Segundos</span>
        <span className="font-mono text-brand-shade">Pipefy → Browser OLAP</span>
      </div>
      <svg
        viewBox="0 0 920 132"
        role="img"
        aria-label="Diagrama resumido do pipeline PipeLens: Pipefy Iframe, Export em Lote, Worker e DuckDB-WASM, Parquet no IndexedDB"
        className="h-auto w-full"
      >
        {[220, 448, 676].map((startX, idx) => (
          <g key={startX}>
            <line
              x1={startX}
              y1={66}
              x2={startX + 24}
              y2={66}
              stroke="#0B66FF"
              strokeWidth={2.5}
              strokeLinecap="round"
              pathLength={1}
              className="docs-svg-draw"
              style={{ ['--draw-delay' as string]: `${180 + idx * 140}ms` }}
            />
            <polygon
              points={`${startX + 24},66 ${startX + 17},61 ${startX + 17},71`}
              fill="#0B66FF"
            />
          </g>
        ))}

        {NODES.map((node) => (
          <g key={node.title} transform={`translate(${node.x}, 14)`}>
            <rect
              width={204}
              height={104}
              rx={14}
              fill={node.fill}
              stroke={node.stroke}
              strokeWidth={1.6}
            />
            <text
              x={16}
              y={34}
              fill="#1F2C33"
              fontSize={14}
              fontWeight={700}
              fontFamily="var(--font-inter), sans-serif"
            >
              {node.title}
            </text>
            <text
              x={16}
              y={56}
              fill="#607D8B"
              fontSize={12}
              fontFamily="var(--font-inter), sans-serif"
            >
              {node.sub}
            </text>
            <rect
              x={16}
              y={70}
              width={172}
              height={22}
              rx={6}
              fill="#FFFFFF"
              stroke="#DBEAF5"
              strokeWidth={1}
            />
            <text
              x={24}
              y={85}
              fill="#0952CC"
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {node.badge}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
