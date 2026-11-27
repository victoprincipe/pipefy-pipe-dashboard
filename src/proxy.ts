import { NextResponse, type NextRequest } from 'next/server';
import { isLocalhostHeaders } from '@/lib/localhostGuard';

export function proxy(request: NextRequest) {
  if (!isLocalhostHeaders(request.headers)) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: ['/docs', '/docs/:path*', '/api/local-docs/:path*'],
};
