// Cloudflare Worker. Set TELEGRAM_BOT_TOKEN as a Worker secret before use.
// Disable request URL/access logging: the Bot API path contains the bot token.
export default {
  async fetch(request, env) {
    const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
    const reply = (status, message) => new Response(JSON.stringify({ ok: false, description: message }), { status, headers });
    const token = env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return reply(503, 'Proxy is not configured');
    const incoming = new URL(request.url);
    const match = /^\/bot([^/]+)\/([A-Za-z][A-Za-z0-9]*)$/.exec(incoming.pathname);
    if (!match || match[1] !== token) return reply(404, 'Not Found');
    if (request.method !== 'GET' && request.method !== 'POST') return reply(405, 'Method Not Allowed');
    // Fixed upstream; callers cannot turn this Worker into an arbitrary proxy.
    const upstream = new URL(`https://api.telegram.org/bot${token}/${match[2]}`);
    upstream.search = incoming.search;
    const forwardedHeaders = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) forwardedHeaders.set('Content-Type', contentType);
    try {
      const response = await fetch(upstream, {
        method: request.method,
        headers: forwardedHeaders,
        body: request.method === 'POST' ? request.body : undefined,
        redirect: 'manual',
        signal: request.signal,
      });
      if (response.status >= 300 && response.status < 400) return reply(502, 'Unexpected upstream redirect');
      return new Response(response.body, { status: response.status, headers: {
        ...headers, 'Content-Type': response.headers.get('content-type') || 'application/json',
      } });
    } catch {
      // Do not log the request or exception: either can expose the token.
      return reply(502, 'Telegram upstream unavailable');
    }
  },
};
