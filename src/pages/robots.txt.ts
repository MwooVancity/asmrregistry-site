// src/pages/robots.txt.ts
export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /status/
Disallow: /debug/

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://asmrregistry.com/sitemap.xml
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
