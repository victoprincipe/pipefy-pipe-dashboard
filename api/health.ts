export default function handler(_req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    service: 'pipelens-dashboard',
    runtime: 'vercel-serverless',
    timestamp: new Date().toISOString(),
  });
}
