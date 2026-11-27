import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProjectDocsClient } from '@/components/docs/ProjectDocsClient';
import { isLocalhostHeaders } from '@/lib/localhostGuard';
import '@/styles/docs.css';

export const metadata: Metadata = {
  title: 'PipeLens · Documentação de Entrevista (Localhost)',
  description:
    'Guia arquitetural interativo com Archify e Remotion para apresentação em entrevista sênior (exclusivo localhost).',
  robots: {
    index: false,
    follow: false,
  },
};

function DocsLoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-sm text-ink-secondary">
      Verificando acesso local e carregando documentação...
    </div>
  );
}

async function LocalhostDocsGate() {
  const requestHeaders = await headers();
  if (!isLocalhostHeaders(requestHeaders)) {
    notFound();
  }
  return <ProjectDocsClient />;
}

export default function DocsPage() {
  return (
    <Suspense fallback={<DocsLoadingShell />}>
      <LocalhostDocsGate />
    </Suspense>
  );
}
