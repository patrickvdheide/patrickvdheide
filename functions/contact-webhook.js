/**
 * Cloudflare Pages Function — Contact & Offerte Webhook
 * patrickvdheide.nl
 *
 * Omgevingsvariabelen (Cloudflare Dashboard → Settings → Environment Variables):
 *   RESEND_API_KEY  — Resend API-sleutel  (zet als Secret)
 *   TO_EMAIL        — jouw ontvangstadres (bijv. hallo@patrickvdheide.nl)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://patrickvdheide.nl",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let payload = {};
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      for (const [key, val] of params.entries()) payload[key] = val;
    } else {
      payload = await request.json();
    }
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Ongeldige payload" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const root   = payload?.payload ?? payload;
  const fields = root?.data?.submissionData ?? root?.data ?? root?.submissionData ?? root;
  const formName = (root?.name ?? root?.formName ?? root?.data?.name ?? payload?.formName ?? "").toLowerCase();

  const isOfferte =
    formName.includes("offerte") ||
    fields["Pakket"] !== undefined ||
    fields["Budget indicatie"] !== undefined;

  let email, naam, telefoon, bedrijf, bericht, pakket, budget;

  if (!isOfferte) {
    naam     = fields["Full Name"]               ?? fields["naam"]           ?? "Beste bezoeker";
    email    = fields["Email Address"]           ?? fields["e-mail"]         ?? fields["email"] ?? null;
    telefoon = fields["Phone Number"]            ?? fields["telefoonnummer"] ?? "—";
    bedrijf  = fields["Name"]                    ?? fields["bedrijfsnaam"]   ?? "—";
    bericht  = fields["Message / Campaign Goal"] ?? fields["bericht"]        ?? "—";
  } else {
    naam     = fields["Voor- en achternaam"] ?? fields["Name"]  ?? "Beste bezoeker";
    email    = fields["E-mail"]              ?? fields["email"] ?? null;
    telefoon = fields["Telefoonnummer"]      ?? "—";
    bedrijf  = fields["Bedrijfsnaam"]        ?? "—";
    bericht  = fields["Bericht"]             ?? "—";
    pakket   = fields["Pakket"]              ?? "—";
    budget   = fields["Budget indicatie"]    ?? "—";
  }

  if (!email) {
    return new Response(
      JSON.stringify({ ok: false, error: "Geen e-mailadres gevonden" }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const inkomstDatum = new Date().toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
  });
  const voornaam = naam.split(" ")[0];

  const emailHtml = isOfferte
    ? buildOfferteEmail({ naam, voornaam, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum })
    : buildContactEmail({ naam, voornaam, telefoon, bedrijf, bericht, inkomstDatum });

  const internalHtml = isOfferte
    ? buildInternalOfferte({ naam, email, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum })
    : buildInternalContact({ naam, email, telefoon, bedrijf, bericht, inkomstDatum });

  const subjectBezoeker = isOfferte
    ? `${voornaam}, jouw offerte-aanvraag is ontvangen`
    : `${voornaam}, jouw bericht is ontvangen`;

  const subjectIntern = isOfferte
    ? `Nieuwe offerte-aanvraag — ${naam} | ${pakket}`
    : `Nieuw contactverzoek — ${naam} | ${bedrijf}`;

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Server configuratiefout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Patrick vd Heide <hallo@patrickvdheide.nl>",
      to: [email],
      subject: subjectBezoeker,
      html: emailHtml,
    }),
  });

  if (!resendResponse.ok) {
    const err = await resendResponse.text();
    console.error("Resend fout:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Mail kon niet worden verzonden" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const internalTo = env.TO_EMAIL || "hallo@patrickvdheide.nl";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Website Formulier <hallo@patrickvdheide.nl>",
      to: [internalTo],
      subject: subjectIntern,
      html: internalHtml,
    }),
  });

  return new Response(
    JSON.stringify({ ok: true, message: "Mail verzonden", type: isOfferte ? "offerte" : "contact" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/* ═══════════════════════════════════════════════════════════════
 * CONSTANTEN
 * ═══════════════════════════════════════════════════════════════ */
const PHOTO_URL  = "https://cdn.prod.website-files.com/69e0d7dd8d567c254b883a87/69edd68503e45afbba78fec6_Patrickvdheide-Webclip.avif";
const AGENDA_URL = "https://meetings-eu1.hubspot.com/patrick-van-der-heide?uuid=0e32d639-d879-48e4-bd2d-d032fb386119";

/* ═══════════════════════════════════════════════════════════════
 * GEDEELDE CSS
 * ═══════════════════════════════════════════════════════════════ */
const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a { text-decoration: none; color: inherit; }

  body {
    margin: 0 !important;
    padding: 0 !important;
    background-color: #fffff5;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    color: #111111;
    -webkit-font-smoothing: antialiased;
  }

  .wrapper { width: 100%; background-color: #fffff5; padding: 40px 16px; }
  .card { max-width: 560px; margin: 0 auto; background-color: #ffffff; }

  /* Header */
  .hdr { background-color: #111111; padding: 20px 36px; }
  .hdr-inner { display: flex; align-items: center; gap: 10px; }
  .hdr-photo { width: 32px; height: 32px; border-radius: 50%; display: block; object-fit: cover; }
  .hdr-name {
    font-family: Impact, 'Arial Black', Arial, sans-serif;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #ffffff;
    margin: 0;
  }

  /* Hero */
  .hero { background-color: #111111; padding: 28px 36px 44px; border-bottom: 4px solid #fab3db; }
  .hero-eyebrow {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #878787;
    margin: 0 0 16px;
  }
  .hero-title {
    font-family: Impact, 'Arial Black', Arial, sans-serif;
    font-size: 46px;
    font-weight: 900;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #ffffff;
    line-height: 1.0;
    margin: 0 0 20px;
  }
  .hero-title .pink { color: #fab3db; }
  .hero-body { font-size: 14px; line-height: 1.8; color: #878787; margin: 0; }
  .hero-body strong { color: #ffffff; font-weight: 600; }

  /* Content — plat, geen kaders */
  .content { padding: 36px 36px 0; }
  .field-block { margin-bottom: 20px; }
  .field-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #878787;
    margin: 0 0 4px;
    display: block;
  }
  .field-value { font-size: 15px; color: #111111; margin: 0; line-height: 1.6; }
  .pill {
    display: inline-block;
    background-color: #111111;
    color: #fab3db;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 14px;
    border-radius: 100px;
  }

  /* Divider */
  .divider { height: 1px; background-color: #ececec; margin: 32px 36px 0; }

  /* Stappenplan */
  .steps { background-color: #111111; padding: 36px 36px; margin-top: 32px; border-bottom: 4px solid #fab3db; }
  .step { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 24px; }
  .step:last-child { margin-bottom: 0; }
  .step-num {
    font-family: Impact, 'Arial Black', Arial, sans-serif;
    font-size: 30px;
    font-weight: 900;
    color: #fab3db;
    line-height: 1;
    width: 34px;
    flex-shrink: 0;
  }
  .step-body { flex: 1; padding-top: 3px; }
  .step-title { font-size: 13px; font-weight: 700; color: #ffffff; margin: 0 0 3px; }
  .step-desc { font-size: 13px; color: #878787; line-height: 1.65; margin: 0; }

  /* CTA */
  .cta { padding: 36px 36px; }
  .cta-text { font-size: 15px; color: #111111; line-height: 1.7; margin: 0 0 20px; }
  .cta-btn {
    display: inline-block;
    background-color: #111111;
    color: #ffffff !important;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 14px 28px;
    border-radius: 100px;
    text-decoration: none;
  }

  /* Footer */
  .ftr { background-color: #111111; padding: 28px 36px; border-top: 1px solid #1e1e1e; }
  .ftr-photo { width: 40px; height: 40px; border-radius: 50%; display: block; object-fit: cover; margin-bottom: 12px; }
  .ftr-name {
    font-family: Impact, 'Arial Black', Arial, sans-serif;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #ffffff;
    margin: 0 0 3px;
  }
  .ftr-role { font-size: 12px; color: #878787; margin: 0 0 14px; line-height: 1.5; }
  .ftr-links { font-size: 12px; color: #878787; line-height: 2.0; margin: 0; }
  .ftr-links a { color: #ffffff; }

  @media only screen and (max-width: 600px) {
    .wrapper { padding: 0 !important; }
    .hdr     { padding: 18px 22px !important; }
    .hero    { padding: 24px 22px 36px !important; }
    .hero-title { font-size: 34px !important; }
    .content { padding: 28px 22px 0 !important; }
    .divider { margin: 24px 22px 0 !important; }
    .steps   { padding: 28px 22px !important; margin-top: 24px !important; }
    .cta     { padding: 28px 22px !important; }
    .ftr     { padding: 28px 22px !important; }
    .cta-btn { display: block !important; text-align: center !important; }
  }
`;

/* ═══════════════════════════════════════════════════════════════
 * TEMPLATE 1 — CONTACTFORMULIER
 * ═══════════════════════════════════════════════════════════════ */
function buildContactEmail({ naam, voornaam, telefoon, bedrijf, bericht, inkomstDatum }) {
  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${voornaam}, jouw bericht is ontvangen</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${voornaam}, jouw bericht is ontvangen. Ik neem binnen 1 tot 2 werkdagen contact op. &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
  </div>

  <div class="wrapper">
    <div class="card">

      <div class="hdr">
        <div class="hdr-inner">
          <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="hdr-photo" width="32" height="32"/>
          <p class="hdr-name">Patrick vd Heide</p>
        </div>
      </div>

      <div class="hero">
        <p class="hero-eyebrow">Bevestiging &mdash; ${inkomstDatum}</p>
        <h1 class="hero-title">Bericht<br/>ontvangen,<br/><span class="pink">${voornaam}.</span></h1>
        <p class="hero-body">
          Goed dat je contact opneemt. Ik neem jouw bericht door en
          kom er <strong>binnen 1 tot 2 werkdagen</strong> op terug.
          Liever direct schakelen? Je weet me te vinden.
        </p>
      </div>

      <div class="content">
        <div class="field-block">
          <span class="field-label">Naam</span>
          <p class="field-value">${escapeHtml(naam)}</p>
        </div>
        <div class="field-block">
          <span class="field-label">Telefoon</span>
          <p class="field-value">${escapeHtml(telefoon)}</p>
        </div>
        <div class="field-block">
          <span class="field-label">Bedrijf</span>
          <p class="field-value">${escapeHtml(bedrijf)}</p>
        </div>
        <div class="field-block">
          <span class="field-label">Bericht</span>
          <p class="field-value">${escapeHtml(bericht)}</p>
        </div>
      </div>

      <div class="divider"></div>

      <div class="cta">
        <p class="cta-text">Wil je alvast een gesprek inplannen?<br/>Dat kan direct via de agenda.</p>
        <a href="${AGENDA_URL}" class="cta-btn">Plan een gesprek</a>
      </div>

      <div class="ftr">
        <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="ftr-photo" width="40" height="40"/>
        <p class="ftr-name">Patrick vd Heide</p>
        <p class="ftr-role">Freelance Webflow Designer &amp; White-Label Partner</p>
        <p class="ftr-links">
          <a href="mailto:hallo@patrickvdheide.nl">hallo@patrickvdheide.nl</a><br/>
          <a href="tel:0623220598">06 23 22 05 98</a><br/>
          <a href="https://patrickvdheide.nl">patrickvdheide.nl</a>
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════
 * TEMPLATE 2 — OFFERTEFORMULIER
 * ═══════════════════════════════════════════════════════════════ */
function buildOfferteEmail({ naam, voornaam, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum }) {
  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${voornaam}, jouw offerte-aanvraag is ontvangen</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${voornaam}, jouw offerte-aanvraag is ontvangen. Ik neem binnen één werkdag contact op. &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
  </div>

  <div class="wrapper">
    <div class="card">

      <div class="hdr">
        <div class="hdr-inner">
          <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="hdr-photo" width="32" height="32"/>
          <p class="hdr-name">Patrick vd Heide</p>
        </div>
      </div>

      <div class="hero">
        <p class="hero-eyebrow">Offerte-aanvraag &mdash; ${inkomstDatum}</p>
        <h1 class="hero-title">Aanvraag<br/>ontvangen,<br/><span class="pink">${voornaam}.</span></h1>
        <p class="hero-body">
          Gaaf dat je een offerte aanvraagt. Ik neem jouw aanvraag door
          en neem <strong>binnen één werkdag</strong> contact op om de
          details door te spreken en een passende offerte op te stellen.
        </p>
      </div>

      <div class="content">
        <div class="field-block">
          <span class="field-label">Naam</span>
          <p class="field-value">${escapeHtml(naam)}</p>
        </div>
        <div class="field-block">
          <span class="field-label">Telefoon</span>
          <p class="field-value">${escapeHtml(telefoon)}</p>
        </div>
        <div class="field-block">
          <span class="field-label">Bedrijf</span>
          <p class="field-value">${escapeHtml(bedrijf)}</p>
        </div>
        <div class="field-block">
          <span class="field-label">Pakket</span>
          <p class="field-value"><span class="pill">${escapeHtml(pakket)}</span></p>
        </div>
        <div class="field-block">
          <span class="field-label">Budget</span>
          <p class="field-value"><span class="pill">${escapeHtml(budget)}</span></p>
        </div>
        <div class="field-block">
          <span class="field-label">Uitdaging</span>
          <p class="field-value">${escapeHtml(bericht)}</p>
        </div>
      </div>

      <div class="steps">
        <p style="font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#878787;margin:0 0 24px;">Wat kun je verwachten?</p>
        <div class="step">
          <span class="step-num">01</span>
          <div class="step-body">
            <p class="step-title">Ik neem contact op</p>
            <p class="step-desc">Ik neem jouw aanvraag door en kom er binnen één werkdag op terug.</p>
          </div>
        </div>
        <div class="step">
          <span class="step-num">02</span>
          <div class="step-body">
            <p class="step-title">Kennismakingsgesprek</p>
            <p class="step-desc">We plannen een kort gesprek om de scope en verwachtingen scherp te krijgen.</p>
          </div>
        </div>
        <div class="step">
          <span class="step-num">03</span>
          <div class="step-body">
            <p class="step-title">Offerte op maat</p>
            <p class="step-desc">Je ontvangt een heldere offerte. Geen verrassingen achteraf.</p>
          </div>
        </div>
      </div>

      <div class="cta">
        <p class="cta-text">Wil je alvast een gesprek inplannen?<br/>Dat kan direct via de agenda.</p>
        <a href="${AGENDA_URL}" class="cta-btn">Plan een kennismaking</a>
      </div>

      <div class="ftr">
        <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="ftr-photo" width="40" height="40"/>
        <p class="ftr-name">Patrick vd Heide</p>
        <p class="ftr-role">Freelance Webflow Designer &amp; White-Label Partner</p>
        <p class="ftr-links">
          <a href="mailto:hallo@patrickvdheide.nl">hallo@patrickvdheide.nl</a><br/>
          <a href="tel:0623220598">06 23 22 05 98</a><br/>
          <a href="https://patrickvdheide.nl">patrickvdheide.nl</a>
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════
 * INTERNE NOTIFICATIES
 * ═══════════════════════════════════════════════════════════════ */
function buildInternalContact({ naam, email, telefoon, bedrijf, bericht, inkomstDatum }) {
  return buildInternalEmail({
    badge: "Contactformulier",
    title: `${escapeHtml(naam)} heeft contact opgenomen`,
    meta: `${inkomstDatum} &middot; patrickvdheide.nl/contact`,
    rows: [
      { key: "Naam",     val: escapeHtml(naam) },
      { key: "E-mail",   val: `<a href="mailto:${escapeHtml(email)}" style="color:#fab3db;">${escapeHtml(email)}</a>` },
      { key: "Telefoon", val: escapeHtml(telefoon) },
      { key: "Bedrijf",  val: escapeHtml(bedrijf) },
      { key: "Bericht",  val: escapeHtml(bericht) },
    ],
  });
}

function buildInternalOfferte({ naam, email, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum }) {
  return buildInternalEmail({
    badge: "Offerte-aanvraag",
    title: `${escapeHtml(naam)} vraagt een offerte aan`,
    meta: `${inkomstDatum} &middot; patrickvdheide.nl/offerte-aanvragen`,
    rows: [
      { key: "Naam",      val: escapeHtml(naam) },
      { key: "E-mail",    val: `<a href="mailto:${escapeHtml(email)}" style="color:#fab3db;">${escapeHtml(email)}</a>` },
      { key: "Telefoon",  val: escapeHtml(telefoon) },
      { key: "Bedrijf",   val: escapeHtml(bedrijf) },
      { key: "Pakket",    val: `<span style="display:inline-block;background:#fab3db;color:#111111;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 12px;border-radius:100px;">${escapeHtml(pakket)}</span>` },
      { key: "Budget",    val: `<span style="display:inline-block;background:#fab3db;color:#111111;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 12px;border-radius:100px;">${escapeHtml(budget)}</span>` },
      { key: "Uitdaging", val: escapeHtml(bericht) },
    ],
  });
}

function buildInternalEmail({ badge, title, meta, rows }) {
  const rowsHtml = rows.map(r => `
    <div style="display:flex;border-bottom:1px solid #1e1e1e;align-items:flex-start;">
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#878787;padding:13px 16px;width:100px;flex-shrink:0;border-right:1px solid #1e1e1e;">${r.key}</span>
      <span style="font-size:14px;color:#ffffff;padding:13px 16px;flex:1;word-break:break-word;line-height:1.6;">${r.val}</span>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:32px auto;background:#111111;border:1px solid #1e1e1e;overflow:hidden;">
    <div style="padding:22px 28px;border-bottom:4px solid #fab3db;">
      <span style="display:inline-block;background:#fab3db;color:#111111;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:3px 12px;border-radius:100px;margin-bottom:12px;">${badge}</span>
      <h2 style="font-family:Impact,'Arial Black',Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:#ffffff;margin:0 0 6px;">${title}</h2>
      <p style="font-size:11px;color:#878787;margin:0;">${meta}</p>
    </div>
    <div>${rowsHtml}</div>
    <div style="padding:14px 28px;border-top:1px solid #1e1e1e;text-align:center;">
      <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#878787;">patrickvdheide.nl &mdash; interne notificatie</span>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
