// functions/api/feedback.js
//
// Slaat thumbs up/down feedback op in KV. Bij negatieve feedback ook de
// vraag en het antwoord — daar wil Patrick van leren.
// 30 dagen retentie, geen IP, geen persistent ID.

const ALLOWED_ORIGINS = [
  'https://patrickvdheide.nl',
  'https://www.patrickvdheide.nl',
];

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', {
      status: 403,
      headers: corsHeaders(request),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad request', {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  const { sessionId, question, answer, rating } = body;
  if (!sessionId || !['up', 'down'].includes(rating)) {
    return new Response('Invalid', {
      status: 400,
      headers: corsHeaders(request),
    });
  }

  const record = {
    ts: new Date().toISOString(),
    rating,
    question: String(question || '').slice(0, 500),
    // Antwoord alleen bij negatieve feedback opslaan.
    answer: rating === 'down' ? String(answer || '').slice(0, 2000) : null,
  };

  await env.FEEDBACK_KV.put(
    `fb:${record.ts}:${sessionId}`,
    JSON.stringify(record),
    { expirationTtl: 60 * 60 * 24 * 30 },
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
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
  };
}
