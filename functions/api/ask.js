// functions/api/ask.js
//
// Hoofdendpoint voor de Q&A-widget. Streamt Claude's antwoord rechtstreeks
// terug naar de browser via Server-Sent Events.

import { SYSTEM_PROMPT } from './_system-prompt.js';

const ALLOWED_ORIGINS = [
  'https://patrickvdheide.nl',
  'https://www.patrickvdheide.nl',
];

const RATE_LIMIT_PER_HOUR = 10;
const MAX_QUESTION_LENGTH = 500;
const MIN_QUESTION_LENGTH = 3;

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: 'forbidden' }, 403, request);
  }

  // === Rate limit per gehashte IP ===
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await sha256(ip + (env.RATE_LIMIT_SALT || 'pvh'));
  const rateKey = `rl:${ipHash}`;
  const current = parseInt(await env.RATE_LIMIT_KV.get(rateKey) || '0', 10);
  if (current >= RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limit' }, 429, request);
  }
  await env.RATE_LIMIT_KV.put(rateKey, String(current + 1), {
    expirationTtl: 3600,
  });

  // === Body parsen + valideren ===
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, request);
  }
  const question = (body.question || '').trim();
  if (question.length < MIN_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH) {
    return json({ error: 'invalid_question' }, 400, request);
  }

  // === Anthropic call met streaming + prompt caching ===
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      stream: true,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error('[anthropic]', anthropicRes.status, errText);
    return json({ error: 'upstream_error' }, 502, request);
  }

  // Pipe SSE stream rechtstreeks naar de client
  return new Response(anthropicRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(request),
    },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
