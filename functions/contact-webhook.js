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

  /* ── Payload parsen ─────────────────────────────────────────── */
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

  /* ── Webflow payload uitpakken ──────────────────────────────── */
  const root   = payload?.payload ?? payload;
  const fields = root?.data?.submissionData ?? root?.data ?? root?.submissionData ?? root;
  const formName = (root?.name ?? root?.formName ?? root?.data?.name ?? payload?.formName ?? "").toLowerCase();

  /* ── Formulier detectie ─────────────────────────────────────── */
  const isOfferte =
    formName.includes("offerte") ||
    fields["Pakket"] !== undefined ||
    fields["Budget indicatie"] !== undefined;

  /* ── Velden uitlezen ────────────────────────────────────────── */
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

  /* ── Templates kiezen ───────────────────────────────────────── */
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

  /* ── Verstuur via Resend ────────────────────────────────────── */
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
const PHOTO_URL = "https://cdn.prod.website-files.com/69e0d7dd8d567c254b883a87/69edd68503e45afbba78fec6_Patrickvdheide-Webclip.avif";
const AGENDA_URL = "https://meetings-eu1.hubspot.com/patrick-van-der-heide?uuid=0e32d639-d879-48e4-bd2d-d032fb386119";

/* ═══════════════════════════════════════════════════════════════
 * GEDEELDE CSS
 * Brand: patrickvdheide.nl
 *   Achtergrond  : #fffff5
 *   Donker blok  : #111111
 *   Roze accent  : #fab3db
 *   Tekst        : #111111
 *   Subtekst     : #878787
 *   Stroke       : #cecece
 *   Field BG     : #fafafa
 *   Heading      : Impact (Tanker-equivalent voor email)
 *   Body         : Inter / system-ui
 * ═══════════════════════════════════════════════════════════════ */
const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
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
  .email-wrapper { width: 100%; background-color: #fffff5; padding: 40px 16px; }
  .email-card { max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #cecece; overflow: hidden; }

  /* ── Header ── */
  .email-header { background-color: #111111; padding: 22px 32px; }
  .header-inner { display: flex; align-items: center; gap: 12px; }
  .header-photo { width: 36px; height: 36px; border-radius: 50%; border: 2px solid #fab3db; display: block; object-fit: cover; }
  .header-name {
    font-family: Impact, 'Arial Black', 'Arial Bold', Arial, sans-serif;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffffff;
    margin: 0;
  }

  /* ── Hero ── */
  .email-hero { background-color: #111111; padding: 32px 32px 44px; border-bottom: 4px solid #fab3db; }
  .hero-eyebrow {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #878787;
    margin: 0 0 18px;
  }
  .hero-title {
    font-family: Impact, 'Arial Black', 'Arial Bold', Arial, sans-serif;
    font-size: 44px;
    font-weight: 900;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #ffffff;
    line-height: 1.05;
    margin: 0 0 22px;
  }
  .hero-title .pink { color: #fab3db; }
  .hero-body { font-size: 15px; line-height: 1.75; color: #878787; margin: 0; max-width: 440px; }
  .hero-body strong { color: #ffffff; font-weight: 600; }

  /* ── Samenvatting ── */
  .content-section { padding: 32px 32px; border-bottom: 1px solid #cecece; }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #878787;
    margin: 0 0 14px;
  }
  .summary-wrap { border: 1px solid #cecece; overflow: hidden; }
  .s-row { display: flex; border-bottom: 1px solid #cecece; align-items: flex-start; }
  .s-row:last-child { border-bottom: none; }
  .s-key {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #878787;
    background-color: #fafafa;
    padding: 13px 14px;
    width: 120px;
    flex-shrink: 0;
    border-right: 1px solid #cecece;
    line-height: 1.4;
  }
  .s-val { font-size: 14px; color: #111111; padding: 13px 16px; flex: 1; line-height: 1.6; word-break: break-word; }
  .pill {
    display: inline-block;
    background-color: #111111;
    color: #fab3db;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 100px;
  }

  /* ── Stappenplan ── */
  .steps-section { padding: 32px 32px; background-color: #111111; border-bottom: 4px solid #fab3db; }
  .step-row-item { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 22px; }
  .step-row-item:last-child { margin-bottom: 0; }
  .step-num {
    font-family: Impact, 'Arial Black', 'Arial Bold', Arial, sans-serif;
    font-size: 28px;
    font-weight: 900;
    color: #fab3db;
    line-height: 1;
    width: 32px;
    flex-shrink: 0;
    padding-top: 1px;
  }
  .step-content { flex: 1; }
  .step-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.02em;
    margin: 0 0 4px;
  }
  .step-desc { font-size: 13px; color: #878787; line-height: 1.65; margin: 0; }

  /* ── CTA ── */
  .cta-section { padding: 32px 32px; border-bottom: 1px solid #cecece; }
  .cta-text { font-size: 15px; color: #111111; line-height: 1.7; margin: 0 0 22px; }
  .cta-btn {
    display: inline-block;
    background-color: #111111;
    color: #ffffff !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 15px 30px;
    border-radius: 100px;
    text-decoration: none;
  }

  /* ── Footer ── */
  .email-footer { background-color: #111111; padding: 28px 32px; }
  .footer-photo { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #fab3db; display: block; object-fit: cover; margin-bottom: 14px; }
  .footer-name {
    font-family: Impact, 'Arial Black', 'Arial Bold', Arial, sans-serif;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffffff;
    margin: 0 0 4px;
  }
  .footer-role { font-size: 12px; color: #878787; margin: 0 0 14px; }
  .footer-links { font-size: 12px; color: #878787; line-height: 2; margin: 0; }
  .footer-links a { color: #ffffff; }

  /* ── Responsive ── */
  @media only screen and (max-width: 600px) {
    .email-wrapper   { padding: 0 !important; }
    .email-card      { border-left: none !important; border-right: none !important; }
    .email-header    { padding: 18px 20px !important; }
    .email-hero      { padding: 28px 20px 36px !important; }
    .hero-title      { font-size: 32px !important; }
    .content-section { padding: 24px 20px !important; }
    .steps-section   { padding: 28px 20px !important; }
    .cta-section     { padding: 28px 20px !important; }
    .email-footer    { padding: 28px 20px !important; }
    .s-row           { flex-direction: column; }
    .s-key           { width: 100% !important; border-right: none !important; border-bottom: 1px solid #cecece; }
    .cta-btn         { display: block !important; text-align: center !important; }
  }
`;

/* ═══════════════════════════════════════════════════════════════
 * TEMPLATE 1 — BEDANKMAIL CONTACTFORMULIER
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

  <div class="email-wrapper">
    <div class="email-card">

      <!-- Header -->
      <div class="email-header">
        <div class="header-inner">
          <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="header-photo" width="36" height="36"/>
          <p class="header-name">Patrick vd Heide</p>
        </div>
      </div>

      <!-- Hero -->
      <div class="email-hero">
        <p class="hero-eyebrow">Bevestiging &mdash; ${inkomstDatum}</p>
        <h1 class="hero-title">Bericht<br/>ontvangen,<br/><span class="pink">${voornaam}.</span></h1>
        <p class="hero-body">
          Goed dat je contact opneemt. Ik neem jouw bericht door
          en kom er <strong>binnen 1 tot 2 werkdagen</strong> op terug.
          Liever direct schakelen? Je weet me te vinden.
        </p>
      </div>

      <!-- Samenvatting -->
      <div class="content-section">
        <p class="section-label">Jouw inzending</p>
        <div class="summary-wrap">
          <div class="s-row">
            <span class="s-key">Naam</span>
            <span class="s-val">${escapeHtml(naam)}</span>
          </div>
          <div class="s-row">
            <span class="s-key">Telefoon</span>
            <span class="s-val">${escapeHtml(telefoon)}</span>
          </div>
          <div class="s-row">
            <span class="s-key">Bedrijf</span>
            <span class="s-val">${escapeHtml(bedrijf)}</span>
          </div>
          <div class="s-row">
            <span class="s-key">Bericht</span>
            <span class="s-val">${escapeHtml(bericht)}</span>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="cta-section">
        <p class="cta-text">
          Wil je alvast een gesprek inplannen?<br/>
          Dat kan direct via de agenda.
        </p>
        <a href="${AGENDA_URL}" class="cta-btn">Plan een gesprek</a>
      </div>

      <!-- Footer -->
      <div class="email-footer">
        <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="footer-photo" width="44" height="44"/>
        <p class="footer-name">Patrick vd Heide</p>
        <p class="footer-role">Freelance Webflow Designer &amp; White-Label Partner</p>
        <p class="footer-links">
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
 * TEMPLATE 2 — BEDANKMAIL OFFERTEFORMULIER
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

  <div class="email-wrapper">
    <div class="email-card">

      <!-- Header -->
      <div class="email-header">
        <div class="header-inner">
          <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="header-photo" width="36" height="36"/>
          <p class="header-name">Patrick vd Heide</p>
        </div>
      </div>

      <!-- Hero -->
      <div class="email-hero">
        <p class="hero-eyebrow">Offerte-aanvraag &mdash; ${inkomstDatum}</p>
        <h1 class="hero-title">Aanvraag<br/>ontvangen,<br/><span class="pink">${voornaam}.</span></h1>
        <p class="hero-body">
          Gaaf dat je een offerte aanvraagt. Ik neem jouw aanvraag door
          en neem <strong>binnen één werkdag</strong> contact op om de
          details door te spreken en een passende offerte op te stellen.
        </p>
      </div>

      <!-- Samenvatting -->
      <div class="content-section">
        <p class="section-label">Jouw aanvraag</p>
        <div class="summary-wrap">
          <div class="s-row">
            <span class="s-key">Naam</span>
            <span class="s-val">${escapeHtml(naam)}</span>
          </div>
          <div class="s-row">
            <span class="s-key">Telefoon</span>
            <span class="s-val">${escapeHtml(telefoon)}</span>
          </div>
          <div class="s-row">
            <span class="s-key">Bedrijf</span>
            <span class="s-val">${escapeHtml(bedrijf)}</span>
          </div>
          <div class="s-row">
            <span class="s-key">Pakket</span>
            <span class="s-val"><span class="pill">${escapeHtml(pakket)}</span></span>
          </div>
          <div class="s-row">
            <span class="s-key">Budget</span>
            <span class="s-val"><span class="pill">${escapeHtml(budget)}</span></span>
          </div>
          <div class="s-row">
            <span class="s-key">Uitdaging</span>
            <span class="s-val">${escapeHtml(bericht)}</span>
          </div>
        </div>
      </div>

      <!-- Stappenplan -->
      <div class="steps-section">
        <p class="section-label" style="color:#878787;margin-bottom:24px;">Wat kun je verwachten?</p>
        <div class="step-row-item">
          <span class="step-num">01</span>
          <div class="step-content">
            <p class="step-title">Ik neem contact op</p>
            <p class="step-desc">Ik neem jouw aanvraag door en kom er binnen één werkdag op terug.</p>
          </div>
        </div>
        <div class="step-row-item">
          <span class="step-num">02</span>
          <div class="step-content">
            <p class="step-title">Kennismakingsgesprek</p>
            <p class="step-desc">We plannen een kort gesprek om de scope en verwachtingen scherp te krijgen.</p>
          </div>
        </div>
        <div class="step-row-item">
          <span class="step-num">03</span>
          <div class="step-content">
            <p class="step-title">Offerte op maat</p>
            <p class="step-desc">Je ontvangt een heldere offerte. Geen verrassingen achteraf.</p>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="cta-section">
        <p class="cta-text">
          Wil je alvast een gesprek inplannen?<br/>
          Dat kan direct via de agenda.
        </p>
        <a href="${AGENDA_URL}" class="cta-btn">Plan een kennismaking</a>
      </div>

      <!-- Footer -->
      <div class="email-footer">
        <img src="${PHOTO_URL}" alt="Patrick vd Heide" class="footer-photo" width="44" height="44"/>
        <p class="footer-name">Patrick vd Heide</p>
        <p class="footer-role">Freelance Webflow Designer &amp; White-Label Partner</p>
        <p class="footer-links">
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
      { key: "E-mail",   val: `<a href="mailto:${escapeHtml(email)}" style="color:#fab3db;font-weight:600;">${escapeHtml(email)}</a>` },
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
      { key: "E-mail",    val: `<a href="mailto:${escapeHtml(email)}" style="color:#fab3db;font-weight:600;">${escapeHtml(email)}</a>` },
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
    <div style="display:flex;border-bottom:1px solid #cecece;align-items:flex-start;">
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#878787;background:#fafafa;padding:13px 14px;width:110px;flex-shrink:0;border-right:1px solid #cecece;line-height:1.4;">${r.key}</span>
      <span style="font-size:14px;color:#111111;padding:13px 16px;flex:1;word-break:break-word;line-height:1.6;">${r.val}</span>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#fffff5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #cecece;overflow:hidden;">
    <div style="background:#111111;padding:20px 28px;">
      <div style="margin-bottom:10px;">
        <span style="display:inline-block;background:#fab3db;color:#111111;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:3px 12px;border-radius:100px;">${badge}</span>
      </div>
      <h2 style="font-family:Impact,'Arial Black',Arial,sans-serif;font-size:20px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:#ffffff;margin:0 0 6px;">${title}</h2>
      <p style="font-size:11px;color:#878787;margin:0;">${meta}</p>
    </div>
    <div style="border-top:4px solid #fab3db;">
      ${rowsHtml}
      <div style="height:1px;background:#ffffff;"></div>
    </div>
    <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #cecece;text-align:center;">
      <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#878787;">patrickvdheide.nl &mdash; interne notificatie</span>
    </div>
  </div>
</body>
</html>`;
}

/* ── HTML-escaping ─────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
