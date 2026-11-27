'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Lock,
  Scale,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import {
  ELEVATOR_PITCH,
  ENGINEERING_DECISIONS,
  INTERVIEW_QA,
  MODULE_MAP,
  PROJECT_METRICS,
} from '@/data/interviewDocsContent';
import { ArchifyViewerSection } from './ArchifyViewerSection';
import { HeroPipelineSvg } from './HeroPipelineSvg';
import { RemotionWalkthrough } from './RemotionWalkthrough';

const NAV_LINKS = [
  { href: '#resumo', label: 'Resumo' },
  { href: '#video', label: 'Vídeo (Remotion)' },
  { href: '#diagramas', label: 'Diagramas (Archify)' },
  { href: '#decisoes', label: 'Decisões' },
  { href: '#qa', label: 'Q&A Sênior' },
];

export function ProjectDocsClient() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 h-14 border-b border-border-subtle bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pf-green/40 bg-pf-green-100 px-2.5 py-0.5 font-mono text-[11px] font-bold text-pf-green-dark-2">
              <Lock className="h-3 w-3" aria-hidden="true" />
              LOCALHOST ONLY · /docs
            </span>
            <span className="hidden text-sm font-bold text-ink sm:inline">
              PipeLens Architecture Brief
            </span>
          </div>

          <nav
            aria-label="Seções da documentação"
            className="hidden items-center gap-1 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-brand-soft hover:text-brand-shade"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <Link
            href="/"
            className="pf-press inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-8 sm:px-6 sm:py-10">
        {/* 1. Resumo / Elevator Pitch */}
        <section
          id="resumo"
          className="docs-section-anchor docs-blueprint-grid rounded-3xl border border-border-subtle p-6 shadow-pf-card sm:p-8"
        >
          <div className="max-w-4xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft px-3 py-1 text-xs font-bold text-brand-shade">
              Guia de Entrevista · Senior Software Engineer
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              PipeLens: BI Analítico no Browser para Pipes de ~20 mil Cards
            </h1>
            <p className="text-base leading-relaxed text-ink-secondary sm:text-lg">
              {ELEVATOR_PITCH}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PROJECT_METRICS.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-border-subtle bg-surface p-3.5"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                  {metric.label}
                </div>
                <div className="mt-1 font-mono text-base font-bold text-brand-shade">
                  {metric.value}
                </div>
                <div className="mt-1 text-xs leading-snug text-ink-secondary">
                  {metric.detail}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <HeroPipelineSvg />
          </div>
        </section>

        {/* 2. Walkthrough em Vídeo (Remotion) */}
        <section id="video" className="docs-section-anchor space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-shade">
              Storytelling Animado · Remotion Player
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-ink">
              Pitch Guiado de 45 Segundos (5 Capítulos)
            </h2>
            <p className="text-sm text-ink-secondary">
              Clique em qualquer capítulo para saltar direto para a cena no player e ler os pontos-chave prontos para falar na entrevista.
            </p>
          </div>
          <RemotionWalkthrough />
        </section>

        {/* 3. Diagramas Interativos (Archify) */}
        <section id="diagramas" className="docs-section-anchor space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-shade">
              Arquitetura Verificada no Código · Archify
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-ink">
              Diagramas Interativos Baseados no Repositório
            </h2>
            <p className="text-sm text-ink-secondary">
              Compilados com Archify e vinculados ao commit real. Você pode explorar cada nó, alternar tema claro/escuro ou abrir o diagrama em tela cheia.
            </p>
          </div>
          <ArchifyViewerSection />
        </section>

        {/* 4. Decisões de Engenharia & Trade-offs */}
        <section id="decisoes" className="docs-section-anchor space-y-5">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-shade">
              Nível Sênior · Por Que Fizemos Assim
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-ink">
              Decisões de Engenharia &amp; Trade-offs Assumidos
            </h2>
            <p className="text-sm text-ink-secondary">
              Em entrevistas sênior, justificar o que foi rejeitado e o custo aceito vale mais do que listar tecnologias.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {ENGINEERING_DECISIONS.map((item) => (
              <article
                key={item.id}
                className="pf-lift flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface p-5 shadow-pf-card"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold leading-snug text-ink">
                      {item.topic}
                    </h3>
                    <Scale
                      className="h-4 w-4 shrink-0 text-brand"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2 rounded-lg bg-pf-green-100/80 px-3 py-2 text-pf-green-dark-2">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <span className="font-bold">Escolhido: </span>
                        {item.chosen}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg bg-pf-red-100/75 px-3 py-2 text-pf-red-dark-2">
                      <XCircle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <span className="font-bold">Evitado: </span>
                        {item.rejected}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-ink-secondary">
                    <strong className="text-ink">Motivo:</strong> {item.why}
                  </p>
                  <p className="text-xs leading-relaxed text-ink-secondary">
                    <strong className="text-ink">Trade-off assumido:</strong>{' '}
                    {item.tradeoff}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
                  {item.files.map((file) => (
                    <span
                      key={file}
                      className="rounded-md border border-border-subtle bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink"
                    >
                      {file}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 5. Mapa de Módulos + Q&A de Entrevista */}
        <section id="qa" className="docs-section-anchor space-y-8">
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-shade">
                Referência Rápida
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-ink">
                Mapa de Módulos do Projeto
              </h2>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface shadow-pf-card">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-canvas text-xs uppercase tracking-wider text-ink-secondary">
                    <th className="px-4 py-3 font-bold">Camada</th>
                    <th className="px-4 py-3 font-bold">Arquivos principais</th>
                    <th className="px-4 py-3 font-bold">Responsabilidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {MODULE_MAP.map((row) => (
                    <tr key={row.layer} className="align-top">
                      <td className="px-4 py-3 font-semibold text-ink">
                        {row.layer}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-brand-shade">
                        {row.files}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        {row.responsibility}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-shade">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Perguntas Difíceis de Entrevista
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-ink">
                Q&amp;A Direto ao Ponto
              </h2>
            </div>

            <div className="space-y-3">
              {INTERVIEW_QA.map((qa, idx) => (
                <details
                  key={qa.id}
                  open={idx === 0}
                  className="group rounded-2xl border border-border-subtle bg-surface p-4 shadow-pf-card"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-ink marker:hidden">
                    <span className="text-base">{qa.question}</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-ink-secondary transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="mt-3 space-y-2 border-t border-border-subtle pt-3 text-sm leading-relaxed">
                    <p className="font-semibold text-brand-shade">
                      {qa.shortAnswer}
                    </p>
                    <p className="text-ink-secondary">{qa.deepDive}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {qa.files.map((file) => (
                        <span
                          key={file}
                          className="rounded-md border border-border-subtle bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle bg-surface py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-ink-secondary sm:px-6">
          <div className="inline-flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-brand" aria-hidden="true" />
            <span>
              Rota exclusiva para <code>localhost</code> / <code>127.0.0.1</code> — protegida por{' '}
              <code>src/proxy.ts</code>, <code>headers()</code> e API guard.
            </span>
          </div>
          <span>PipeLens Dashboard · Documentação de Entrevista</span>
        </div>
      </footer>
    </div>
  );
}
