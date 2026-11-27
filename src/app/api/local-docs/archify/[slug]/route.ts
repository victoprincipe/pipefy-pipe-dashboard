import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { isLocalhostHeaders } from '@/lib/localhostGuard';

function resolveArchifyFilename(slug: string): string | null {
  switch (slug) {
    case 'architecture':
      return 'architecture.html';
    case 'data-flow':
      return 'data-flow.html';
    case 'chart-pipeline':
      return 'chart-pipeline.html';
    default:
      return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  if (!isLocalhostHeaders(request.headers)) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    });
  }

  const { slug } = await context.params;
  const filename = resolveArchifyFilename(slug);
  if (!filename) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    });
  }

  const targetFile = path.join(process.cwd(), 'docs', 'archify', filename);
  const html = await readFile(/*turbopackIgnore: true*/ targetFile, 'utf8');
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "frame-ancestors 'self'",
    },
  });
}
