'use client';

import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  INTERVIEW_CHAPTERS,
  REMOTION_DURATION_IN_FRAMES,
} from './interviewChapters';

export interface PipeLensStoryProps {
  activeHighlight?: string;
}

const PALETTE = {
  bg: '#0E1720',
  surface: '#16222E',
  surfaceElevated: '#1D2D3D',
  border: 'rgba(193, 213, 228, 0.16)',
  ink: '#F4F9FC',
  muted: '#9AB0C1',
  brand: '#3C85FF',
  brandSolid: '#0B66FF',
  teal: '#00BFA5',
  coral: '#FF5019',
  amber: '#FFBC33',
  purple: '#C084FC',
};

function clampRange(
  frame: number,
  input: [number, number],
  output: [number, number]
): number {
  return interpolate(frame, input, output, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function SceneHeader({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title: string;
  subtitle: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 180 },
  });

  const translateY = interpolate(progress, [0, 1], [18, 0]);
  const opacity = clampRange(frame, [0, 18], [0, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translate3d(0, ${translateY}px, 0)`,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 999,
          backgroundColor: 'rgba(60, 133, 255, 0.14)',
          border: '1px solid rgba(60, 133, 255, 0.35)',
          color: '#8CB8FF',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        {badge}
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 800,
          color: PALETTE.ink,
          lineHeight: 1.12,
          letterSpacing: '-0.025em',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 22,
          color: PALETTE.muted,
          lineHeight: 1.4,
          maxWidth: 960,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function SceneProblem20k() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const graphqlWidth = clampRange(frame, [24, 175], [6, 92]);
  const batchWidth = clampRange(frame, [30, 88], [6, 22]);
  const calloutScale = spring({
    frame: Math.max(0, frame - 95),
    fps,
    config: { damping: 18, stiffness: 160 },
  });

  return (
    <AbsoluteFill style={{ padding: '56px 68px', justifyContent: 'space-between' }}>
      <SceneHeader
        badge="Capítulo 01 · O Problema de Escala"
        title="~20 mil cards não cabem em paginação GraphQL"
        subtitle="Paginar allCards (50 cards/página) exige ~400 requisições sequenciais por cursor. O PipeLens troca isso por uma exportação em lote."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            backgroundColor: PALETTE.surface,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 20,
            padding: '24px 28px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: '#FF9E7F' }}>
              Abordagem Rejeitada · Cursor GraphQL (allCards)
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 18,
                color: '#FF9E7F',
              }}
            >
              ~400 requests · risco de rate limit · minutos
            </span>
          </div>
          <div
            style={{
              height: 28,
              borderRadius: 999,
              backgroundColor: 'rgba(255, 80, 25, 0.12)',
              overflow: 'hidden',
              padding: 4,
            }}
          >
            <div
              style={{
                width: `${graphqlWidth}%`,
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #FF5019, #FF9E7F)',
              }}
            />
          </div>
        </div>

        <div
          style={{
            backgroundColor: PALETTE.surface,
            border: '1px solid rgba(0, 191, 165, 0.45)',
            borderRadius: 20,
            padding: '24px 28px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: '#7FDFD2' }}>
              Abordagem PipeLens · [PipeLens] Snapshot (.xlsx) + DuckDB-WASM
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 18,
                color: '#7FDFD2',
              }}
            >
              1 exportação em lote · queries locais em ms
            </span>
          </div>
          <div
            style={{
              height: 28,
              borderRadius: 999,
              backgroundColor: 'rgba(0, 191, 165, 0.14)',
              overflow: 'hidden',
              padding: 4,
            }}
          >
            <div
              style={{
                width: `${batchWidth}%`,
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #00BFA5, #3C85FF)',
              }}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          opacity: clampRange(frame, [95, 125], [0, 1]),
          transform: `scale(${interpolate(calloutScale, [0, 1], [0.95, 1])})`,
        }}
      >
        {[
          'createPipeReport / reuse "[PipeLens] Snapshot"',
          'exportPipeReport + polling até 95s',
          'Download direto via fileURL no browser',
        ].map((item) => (
          <div
            key={item}
            style={{
              flex: 1,
              padding: '14px 18px',
              borderRadius: 14,
              backgroundColor: PALETTE.surfaceElevated,
              border: `1px solid ${PALETTE.border}`,
              fontFamily: 'monospace',
              fontSize: 16,
              color: PALETTE.ink,
              textAlign: 'center',
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function SceneWorkerDuckDb() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stages = [
    {
      num: '01',
      title: 'Pipefy SDK',
      detail: 'Buffer .xlsx assíncrono',
      accent: PALETTE.brand,
    },
    {
      num: '02',
      title: 'Web Worker',
      detail: 'SheetJS + 500 linhas',
      accent: PALETTE.purple,
    },
    {
      num: '03',
      title: 'DuckDB-WASM',
      detail: 'mvp / eh single-thread',
      accent: PALETTE.teal,
    },
    {
      num: '04',
      title: 'Parquet',
      detail: 'COPY TO FORMAT PARQUET',
      accent: PALETTE.amber,
    },
  ];

  const packetProgress = clampRange(frame, [35, 220], [0, 1]);

  return (
    <AbsoluteFill style={{ padding: '56px 68px', justifyContent: 'space-between' }}>
      <SceneHeader
        badge="Capítulo 02 · Pipeline Off-Main-Thread"
        title="Worker + DuckDB-WASM sem SharedArrayBuffer"
        subtitle="Iframes cross-origin no Pipefy não têm isolamento COOP/COEP. Por isso escolhemos bundles mvp/eh single-threaded."
      />

      <div style={{ position: 'relative', paddingTop: 18, paddingBottom: 18 }}>
        <div
          style={{
            position: 'absolute',
            left: 80,
            right: 80,
            top: '50%',
            height: 4,
            backgroundColor: 'rgba(154, 176, 193, 0.2)',
            borderRadius: 4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 80,
            width: `${packetProgress * 980}px`,
            top: '50%',
            height: 4,
            background: 'linear-gradient(90deg, #3C85FF, #00BFA5)',
            borderRadius: 4,
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
          }}
        >
          {stages.map((stage, idx) => {
            const enter = spring({
              frame: Math.max(0, frame - idx * 14),
              fps,
              config: { damping: 20, stiffness: 170 },
            });
            return (
              <div
                key={stage.num}
                style={{
                  backgroundColor: PALETTE.surface,
                  border: `1px solid ${stage.accent}`,
                  borderRadius: 20,
                  padding: '26px 22px',
                  opacity: clampRange(frame, [idx * 14, idx * 14 + 16], [0, 1]),
                  transform: `translate3d(0, ${interpolate(enter, [0, 1], [22, 0])}px, 0)`,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 15,
                    fontWeight: 700,
                    color: stage.accent,
                    marginBottom: 10,
                  }}
                >
                  PASSO {stage.num}
                </div>
                <div
                  style={{
                    fontSize: 25,
                    fontWeight: 800,
                    color: PALETTE.ink,
                    marginBottom: 8,
                  }}
                >
                  {stage.title}
                </div>
                <div style={{ fontSize: 17, color: PALETTE.muted, lineHeight: 1.4 }}>
                  {stage.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          backgroundColor: PALETTE.surfaceElevated,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 16,
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: clampRange(frame, [70, 100], [0, 1]),
        }}
      >
        <span style={{ fontSize: 19, color: PALETTE.ink, fontWeight: 600 }}>
          UI mantém 60fps durante parsing de planilhas grandes (fallback automático na main thread).
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 16,
            color: '#7FDFD2',
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(0, 191, 165, 0.14)',
          }}
        >
          public/duckdb/duckdb-eh.wasm
        </span>
      </div>
    </AbsoluteFill>
  );
}

function SceneCacheIsolation() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardEnter = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 160 },
  });

  const states = [
    {
      label: 'HIT (<= 15 min)',
      desc: 'Restaura Parquet direto do IndexedDB · 0 chamadas ao Pipefy',
      color: PALETTE.teal,
    },
    {
      label: 'STALE (> 15 min · SWR)',
      desc: 'Exibe cache na tela na hora + sincroniza snapshot em background',
      color: PALETTE.amber,
    },
    {
      label: 'MISS',
      desc: 'Executa pipeline completo [PipeLens] Snapshot e grava Parquet',
      color: PALETTE.brand,
    },
  ];

  return (
    <AbsoluteFill style={{ padding: '56px 68px', justifyContent: 'space-between' }}>
      <SceneHeader
        badge="Capítulo 03 · Cache Multi-Usuário"
        title="IndexedDB Parquet isolado por ${userId}::${pipeId}"
        subtitle="Cada usuário no mesmo navegador possui seu próprio slot validado explicitamente por record.userId === userId."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          transform: `translate3d(0, ${interpolate(cardEnter, [0, 1], [20, 0])}px, 0)`,
        }}
      >
        {[
          { key: '10492::307435909', user: 'Membro A (Alice)', rows: '19.840 rows · Parquet' },
          { key: '88310::307435909', user: 'Membro B (Bruno)', rows: '19.840 rows · Isolado' },
        ].map((vault, i) => (
          <div
            key={vault.key}
            style={{
              backgroundColor: PALETTE.surface,
              border: `1px solid ${i === 0 ? PALETTE.teal : PALETTE.brand}`,
              borderRadius: 18,
              padding: '22px 24px',
            }}
          >
            <div style={{ fontSize: 16, color: PALETTE.muted, marginBottom: 6 }}>
              {vault.user}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 22,
                fontWeight: 700,
                color: PALETTE.ink,
                marginBottom: 8,
              }}
            >
              key: &quot;{vault.key}&quot;
            </div>
            <div style={{ fontSize: 16, color: '#7FDFD2', fontWeight: 600 }}>
              {vault.rows}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {states.map((st, idx) => {
          const delay = 40 + idx * 24;
          return (
            <div
              key={st.label}
              style={{
                backgroundColor: PALETTE.surfaceElevated,
                border: `1px solid ${st.color}`,
                borderRadius: 16,
                padding: '18px 20px',
                opacity: clampRange(frame, [delay, delay + 20], [0, 1]),
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 17,
                  fontWeight: 800,
                  color: st.color,
                  marginBottom: 8,
                }}
              >
                {st.label}
              </div>
              <div style={{ fontSize: 16, color: PALETTE.muted, lineHeight: 1.4 }}>
                {st.desc}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function SceneChartEngine() {
  const frame = useCurrentFrame();

  const cascade = ['1. exact', '2. normalized', '3. label / header', '4. role único'];

  return (
    <AbsoluteFill style={{ padding: '56px 68px', justifyContent: 'space-between' }}>
      <SceneHeader
        badge="Capítulo 04 · Motor Semântico"
        title="Resolução explícita sem fallbacks silenciosos"
        subtitle="Se um campo do Pipe é renomeado ou apagado, o gráfico nunca substitui silenciosamente por columns[0]."
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {cascade.map((step, idx) => {
          const start = 15 + idx * 18;
          return (
            <div
              key={step}
              style={{
                flex: 1,
                backgroundColor: PALETTE.surface,
                border: '1px solid rgba(60, 133, 255, 0.45)',
                borderRadius: 16,
                padding: '20px 16px',
                textAlign: 'center',
                opacity: clampRange(frame, [start, start + 18], [0, 1]),
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 19,
                  fontWeight: 700,
                  color: PALETTE.ink,
                }}
              >
                {step}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <div
          style={{
            backgroundColor: 'rgba(255, 80, 25, 0.1)',
            border: '1px solid rgba(255, 80, 25, 0.45)',
            borderRadius: 18,
            padding: '22px 24px',
            opacity: clampRange(frame, [85, 110], [0, 1]),
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#FF9E7F', marginBottom: 8 }}>
            ✕ Proibido: Fallback para columns[0]
          </div>
          <div style={{ fontSize: 17, color: PALETTE.muted, lineHeight: 1.45 }}>
            Em vez de desenhar dado errado, emitimos ChartConfigIssue com status acionável no card.
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'rgba(0, 191, 165, 0.1)',
            border: '1px solid rgba(0, 191, 165, 0.45)',
            borderRadius: 18,
            padding: '22px 24px',
            opacity: clampRange(frame, [105, 130], [0, 1]),
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7FDFD2', marginBottom: 8 }}>
            ✓ SQL Builder Sanitizado
          </div>
          <div style={{ fontSize: 17, color: PALETTE.muted, lineHeight: 1.45 }}>
            quoteIdent, quoteLiteral, escapeIlikeLiteral e sanitizeTableName protegem cada query DuckDB.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SceneTradeoffs() {
  const frame = useCurrentFrame();

  const pillars = [
    {
      title: 'Zero Tokens no Client',
      desc: 'Comunicação exclusiva via canal autenticado do Pipefy Apps SDK.',
      color: PALETTE.teal,
    },
    {
      title: 'Rotas Dev Protegidas',
      desc: '/api/dev/* retorna HTTP 403 em produção; /docs retorna 404 fora de localhost.',
      color: PALETTE.brand,
    },
    {
      title: 'Trade-off: Snapshot vs Delta',
      desc: 'Exporta snapshot completo em lote; futuro: listeners incrementais onCardCreated.',
      color: PALETTE.amber,
    },
    {
      title: 'Trade-off: RAM do Cliente',
      desc: 'Ideal até dezenas de milhares de cards; escala para 200k+ movendo DuckDB ao servidor.',
      color: PALETTE.purple,
    },
  ];

  return (
    <AbsoluteFill style={{ padding: '56px 68px', justifyContent: 'space-between' }}>
      <SceneHeader
        badge="Capítulo 05 · Visão Sênior"
        title="Segurança, Qualidade & Limites Conscientes"
        subtitle="Decisões explícitas documentadas para defender arquitetura, segurança e plano de evolução em entrevista."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {pillars.map((p, idx) => {
          const start = 14 + idx * 18;
          return (
            <div
              key={p.title}
              style={{
                backgroundColor: PALETTE.surface,
                border: `1px solid ${p.color}`,
                borderRadius: 18,
                padding: '22px 24px',
                opacity: clampRange(frame, [start, start + 20], [0, 1]),
              }}
            >
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 800,
                  color: p.color,
                  marginBottom: 8,
                }}
              >
                {p.title}
              </div>
              <div style={{ fontSize: 17, color: PALETTE.muted, lineHeight: 1.45 }}>
                {p.desc}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 16,
          color: PALETTE.muted,
          textAlign: 'center',
          opacity: clampRange(frame, [95, 120], [0, 1]),
        }}
      >
        Next.js 16 · React 19 · DuckDB-WASM · Parquet IndexedDB · Vitest
      </div>
    </AbsoluteFill>
  );
}

export const PipeLensStoryComposition: React.FC<PipeLensStoryProps> = () => {
  const frame = useCurrentFrame();
  const progressPct = Math.min(
    100,
    Math.max(0, (frame / REMOTION_DURATION_IN_FRAMES) * 100)
  );
  const currentChapter =
    INTERVIEW_CHAPTERS.find(
      (c) => frame >= c.startFrame && frame < c.endFrame
    ) ?? INTERVIEW_CHAPTERS[INTERVIEW_CHAPTERS.length - 1];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PALETTE.bg,
        color: PALETTE.ink,
        fontFamily:
          'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        backgroundImage:
          'radial-gradient(rgba(60, 133, 255, 0.14) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <Sequence from={0} durationInFrames={270}>
        <SceneProblem20k />
      </Sequence>
      <Sequence from={270} durationInFrames={270}>
        <SceneWorkerDuckDb />
      </Sequence>
      <Sequence from={540} durationInFrames={270}>
        <SceneCacheIsolation />
      </Sequence>
      <Sequence from={810} durationInFrames={270}>
        <SceneChartEngine />
      </Sequence>
      <Sequence from={1080} durationInFrames={270}>
        <SceneTradeoffs />
      </Sequence>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 34,
          backgroundColor: 'rgba(14, 23, 32, 0.92)',
          borderTop: `1px solid ${PALETTE.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          fontSize: 13,
          color: PALETTE.muted,
          fontFamily: 'monospace',
        }}
      >
        <span>PipeLens · {currentChapter.shortLabel}</span>
        <span>{currentChapter.durationLabel}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 4,
          width: `${progressPct}%`,
          background: 'linear-gradient(90deg, #0B66FF, #00BFA5)',
        }}
      />
    </AbsoluteFill>
  );
};
