import Link from 'next/link';

export default function DocsNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center text-ink">
      <div className="max-w-md space-y-4 rounded-2xl border border-border-subtle bg-surface p-8 shadow-pf-card">
        <div className="font-mono text-xs font-bold uppercase tracking-widest text-ink-secondary">
          404 · Not Found
        </div>
        <h1 className="text-xl font-bold text-ink">Página não encontrada</h1>
        <p className="text-sm text-ink-secondary">
          O recurso solicitado não está disponível neste ambiente.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-shade"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
