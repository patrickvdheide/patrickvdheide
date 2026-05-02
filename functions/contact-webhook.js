/**
 * Cloudflare Pages Function — Contact & Offerte Webhook
 * patrickvdheide.nl
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

  // DEBUG — log ruwe payload (tijdelijk)
  console.log("WEBFLOW RAW PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("CONTENT-TYPE:", request.headers.get("content-type"));

  // Webflow wikkelt de echte data in een buitenste "payload" sleutel
  const root = payload?.payload ?? payload;

  const fields = root?.data?.submissionData
    ?? root?.data
    ?? root?.submissionData
    ?? root;

  const formName = (
    root?.name
    ?? root?.formName
    ?? root?.data?.name
    ?? payload?.formName
    ?? ""
  ).toLowerCase();

  console.log("FORM NAME:", formName);
  console.log("FIELDS:", JSON.stringify(fields, null, 2));

  const isOfferte =
    formName.includes("offerte") ||
    fields["Pakket"] !== undefined ||
    fields["Budget-indicatie"] !== undefined;

  let email, naam, telefoon, bedrijf, bericht;
  let pakket, budget;

  if (!isOfferte) {
    naam     = fields["naam"]           ?? fields["Name"]    ?? "Beste bezoeker";
    email    = fields["e-mail"]         ?? fields["Email"]   ?? fields["email"]   ?? null;
    telefoon = fields["telefoonnummer"] ?? fields["Phone"]   ?? "—";
    bedrijf  = fields["bedrijfsnaam"]   ?? fields["Company"] ?? "—";
    bericht  = fields["bericht"]        ?? fields["Message"] ?? "—";
  } else {
    naam     = fields["Voor--en-achternaam"] ?? fields["Name"]  ?? "Beste bezoeker";
    email    = fields["E-mail"]              ?? fields["email"] ?? null;
    telefoon = fields["Telefoonnummer"]      ?? "—";
    bedrijf  = fields["Bedrijfsnaam"]        ?? "—";
    bericht  = fields["Bericht"]            ?? "—";
    pakket   = fields["Pakket"]             ?? "—";
    budget   = fields["Budget-indicatie"]   ?? "—";
  }

  if (!email) {
    console.log("GEEN EMAIL GEVONDEN — fields waren:", JSON.stringify(fields));
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
    ? buildOfferteThankYouEmail({ naam, voornaam, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum })
    : buildContactThankYouEmail({ naam, voornaam, telefoon, bedrijf, bericht, inkomstDatum });

  const internalHtml = isOfferte
    ? buildInternalOfferte({ naam, email, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum })
    : buildInternalContact({ naam, email, telefoon, bedrijf, bericht, inkomstDatum });

  const subjectBezoeker = isOfferte
    ? `Hey ${voornaam} 🙌 — jouw offerte-aanvraag is ontvangen`
    : `Hey ${voornaam} 👋 — ik heb je bericht ontvangen`;

  const subjectIntern = isOfferte
    ? `💼 Nieuwe offerte-aanvraag van ${naam} — ${pakket}`
    : `📬 Nieuw contactverzoek van ${naam} — ${bedrijf}`;

  const apiKey = env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("RESEND_API_KEY is niet ingesteld.");
    return new Response(
      JSON.stringify({ ok: false, error: "Server configuratiefout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  a { color: inherit; text-decoration: none; }
  body {
    margin: 0 !important;
    padding: 0 !important;
    background-color: #080b10;
    font-family: 'Inter', 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .email-wrapper { width: 100%; background-color: #080b10; padding: 40px 16px; }
  .email-card {
    max-width: 560px;
    margin: 0 auto;
    background-color: #0f1319;
    border-radius: 16px;
    border: 1px solid #1e2530;
    overflow: hidden;
  }
  .email-header { padding: 36px 40px 28px; text-align: center; border-bottom: 1px solid #1e2530; }
  .header-label { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5a6a7e; margin-bottom: 12px; }
  .header-wordmark { font-size: 17px; font-weight: 800; color: #ffffff; letter-spacing: -0.03em; }
  .header-wordmark span { color: #4c9eff; }
  .email-hero { padding: 44px 40px 32px; text-align: center; }
  .emoji-badge { font-size: 38px; margin-bottom: 18px; display: block; }
  .hero-title { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.04em; line-height: 1.2; margin: 0 0 14px; }
  .hero-subtitle { font-size: 15px; line-height: 1.7; color: #8a9bb0; margin: 0 auto; max-width: 420px; }
  .hero-subtitle strong { color: #c9d5e3; font-weight: 600; }
  .divider { height: 1px; background-color: #1e2530; margin: 0 40px; }
  .summary-section { padding: 30px 40px; }
  .summary-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #5a6a7e; margin: 0 0 14px; }
  .summary-card { background-color: #13181f; border-radius: 10px; border: 1px solid #1e2530; overflow: hidden; }
  .summary-row { display: flex; padding: 12px 18px; border-bottom: 1px solid #1e2530; align-items: flex-start; gap: 12px; }
  .summary-row:last-child { border-bottom: none; }
  .summary-key { font-size: 11px; font-weight: 700; color: #5a6a7e; text-transform: uppercase; letter-spacing: 0.07em; width: 110px; flex-shrink: 0; padding-top: 2px; }
  .summary-val { font-size: 14px; color: #c9d5e3; line-height: 1.55; flex: 1; word-break: break-word; }
  .highlight-pill { display: inline-block; background-color: #1c2b40; color: #4c9eff; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 100px; letter-spacing: 0.02em; }
  .steps-card { background-color: #13181f; border-radius: 10px; border: 1px solid #1e2530; overflow: hidden; }
  .step-row { display: flex; padding: 13px 18px; border-bottom: 1px solid #1e2530; align-items: flex-start; gap: 14px; }
  .step-row:last-child { border-bottom: none; }
  .step-num { font-size: 13px; font-weight: 800; color: #4c9eff; width: 20px; flex-shrink: 0; padding-top: 1px; }
  .step-text { font-size: 14px; color: #8a9bb0; line-height: 1.55; flex: 1; }
  .step-text strong { color: #c9d5e3; font-weight: 600; }
  .cta-section { padding: 8px 40px 40px; text-align: center; }
  .cta-text { font-size: 15px; color: #8a9bb0; margin: 0 0 22px; line-height: 1.65; }
  .cta-text strong { color: #c9d5e3; font-weight: 600; }
  .cta-btn { display: inline-block; background-color: #ffffff; color: #0c0f16 !important; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; padding: 14px 30px; border-radius: 100px; }
  .email-footer { padding: 26px 40px; border-top: 1px solid #1e2530; text-align: center; }
  .footer-signature { font-size: 13px; font-weight: 700; color: #5a6a7e; margin: 0 0 6px; }
  .footer-text { font-size: 11px; color: #3d4d5e; line-height: 1.8; margin: 0; }
  .footer-text a { color: #5a6a7e; }
  @media only screen and (max-width: 600px) {
    .email-wrapper   { padding: 20px 12px !important; }
    .email-header    { padding: 24px 22px 22px !important; }
    .email-hero      { padding: 32px 22px 26px !important; }
    .hero-title      { font-size: 21px !important; }
    .divider         { margin: 0 22px !important; }
    .summary-section { padding: 22px 22px !important; }
    .cta-section     { padding: 8px 22px 30px !important; }
    .email-footer    { padding: 22px 22px !important; }
    .summary-row     { flex-direction: column; gap: 3px; }
    .summary-key     { width: auto !important; }
    .cta-btn         { display: block !important; }
  }
`;

function buildContactThankYouEmail({ naam, voornaam, telefoon, bedrijf, bericht, inkomstDatum }) {
  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>Hey ${voornaam} — bericht ontvangen</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;">
    Hey ${voornaam}, ik heb je bericht ontvangen en kom er zo snel mogelijk op terug.
  </div>
  <div class="email-wrapper">
    <div class="email-card">
      <div class="email-header">
        <div class="header-label">Patrick vd Heide</div><br/>
        <span class="header-wordmark">Patrick<span>.</span></span>
      </div>
      <div class="email-hero">
        <span class="emoji-badge">☕</span>
        <h1 class="hero-title">Hey ${voornaam}, bericht ontvangen!</h1>
        <p class="hero-subtitle">
          Goed dat je contact opneemt. Ik neem jouw bericht door en kom er
          <strong>doorgaans binnen 1–2 werkdagen</strong> op terug.
          Liever direct schakelen? Je weet me te vinden.
        </p>
      </div>
      <div class="divider"></div>
      <div class="summary-section">
        <p class="summary-label">Jouw inzending — ${inkomstDatum}</p>
        <div class="summary-card">
          <div class="summary-row">
            <span class="summary-key">Naam</span>
            <span class="summary-val">${escapeHtml(naam)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Telefoon</span>
            <span class="summary-val">${escapeHtml(telefoon)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Bedrijf</span>
            <span class="summary-val">${escapeHtml(bedrijf)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Bericht</span>
            <span class="summary-val">${escapeHtml(bericht)}</span>
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="cta-section">
        <p class="cta-text" style="margin-top:28px;">
          Liever meteen een <strong>digitaal bakkie koffie</strong> plannen?
        </p>
        <a href="https://meetings-eu1.hubspot.com/patrick-van-der-heide?uuid=0e32d639-d879-48e4-bd2d-d032fb386119" class="cta-btn">
          Plan een gesprek →
        </a>
      </div>
      <div class="email-footer">
        <p class="footer-signature">Patrick vd Heide</p>
        <p class="footer-text">
          Freelance Webflow Designer &amp; White-Label Partner<br/>
          <a href="mailto:hallo@patrickvdheide.nl">hallo@patrickvdheide.nl</a>
          &nbsp;·&nbsp;
          <a href="tel:0623220598">06 23 22 05 98</a>
          &nbsp;·&nbsp;
          <a href="https://patrickvdheide.nl">patrickvdheide.nl</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildOfferteThankYouEmail({ naam, voornaam, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum }) {
  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="color-scheme" content="dark"/>
  <meta name="supported-color-schemes" content="dark"/>
  <title>Hey ${voornaam} — offerte-aanvraag ontvangen</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;">
    Jouw offerte-aanvraag is ontvangen, ${voornaam}. Ik neem binnen één werkdag contact op.
  </div>
  <div class="email-wrapper">
    <div class="email-card">
      <div class="email-header">
        <div class="header-label">Patrick vd Heide</div><br/>
        <span class="header-wordmark">Patrick<span>.</span></span>
      </div>
      <div class="email-hero">
        <span class="emoji-badge">🙌</span>
        <h1 class="hero-title">Offerte-aanvraag ontvangen, ${voornaam}!</h1>
        <p class="hero-subtitle">
          Gaaf dat je een offerte aanvraagt. Ik neem jouw aanvraag door en
          neem <strong>binnen één werkdag</strong> contact met je op om de
          details door te spreken en een passende offerte op te stellen.
        </p>
      </div>
      <div class="divider"></div>
      <div class="summary-section">
        <p class="summary-label">Jouw aanvraag — ${inkomstDatum}</p>
        <div class="summary-card">
          <div class="summary-row">
            <span class="summary-key">Naam</span>
            <span class="summary-val">${escapeHtml(naam)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Telefoon</span>
            <span class="summary-val">${escapeHtml(telefoon)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Bedrijf</span>
            <span class="summary-val">${escapeHtml(bedrijf)}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Pakket</span>
            <span class="summary-val"><span class="highlight-pill">${escapeHtml(pakket)}</span></span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Budget</span>
            <span class="summary-val"><span class="highlight-pill">${escapeHtml(budget)}</span></span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Uitdaging</span>
            <span class="summary-val">${escapeHtml(bericht)}</span>
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="summary-section" style="padding-top:26px;padding-bottom:0;">
        <p class="summary-label">Wat gebeurt er nu?</p>
        <div class="steps-card">
          <div class="step-row">
            <span class="step-num">1.</span>
            <span class="step-text">Ik neem jouw aanvraag door en kom er <strong>binnen één werkdag</strong> op terug.</span>
          </div>
          <div class="step-row">
            <span class="step-num">2.</span>
            <span class="step-text">We plannen een kort gesprek om de scope scherp te krijgen.</span>
          </div>
          <div class="step-row">
            <span class="step-num">3.</span>
            <span class="step-text">Je ontvangt een <strong>heldere offerte</strong> — geen verrassingen achteraf.</span>
          </div>
        </div>
      </div>
      <div class="cta-section">
        <p class="cta-text" style="margin-top:28px;">
          Wil je alvast een gesprek inplannen? <strong>Dat kan direct.</strong>
        </p>
        <a href="https://meetings-eu1.hubspot.com/patrick-van-der-heide?uuid=0e32d639-d879-48e4-bd2d-d032fb386119" class="cta-btn">
          Plan een kennismaking →
        </a>
      </div>
      <div class="email-footer">
        <p class="footer-signature">Patrick vd Heide</p>
        <p class="footer-text">
          Freelance Webflow Designer &amp; White-Label Partner<br/>
          <a href="mailto:hallo@patrickvdheide.nl">hallo@patrickvdheide.nl</a>
          &nbsp;·&nbsp;
          <a href="tel:0623220598">06 23 22 05 98</a>
          &nbsp;·&nbsp;
          <a href="https://patrickvdheide.nl">patrickvdheide.nl</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildInternalContact({ naam, email, telefoon, bedrijf, bericht, inkomstDatum }) {
  return buildInternalEmail({
    badge: "📬 Contactformulier",
    title: `${escapeHtml(naam)} heeft contact opgenomen`,
    meta: `${inkomstDatum} · patrickvdheide.nl/contact`,
    rows: [
      { key: "Naam",     val: escapeHtml(naam) },
      { key: "E-mail",   val: `<a href="mailto:${escapeHtml(email)}" style="color:#4c9eff;">${escapeHtml(email)}</a>` },
      { key: "Telefoon", val: escapeHtml(telefoon) },
      { key: "Bedrijf",  val: escapeHtml(bedrijf) },
      { key: "Bericht",  val: escapeHtml(bericht) },
    ],
  });
}

function buildInternalOfferte({ naam, email, telefoon, bedrijf, bericht, pakket, budget, inkomstDatum }) {
  return buildInternalEmail({
    badge: "💼 Offerte-aanvraag",
    title: `${escapeHtml(naam)} vraagt een offerte aan`,
    meta: `${inkomstDatum} · patrickvdheide.nl/offerte-aanvragen`,
    rows: [
      { key: "Naam",      val: escapeHtml(naam) },
      { key: "E-mail",    val: `<a href="mailto:${escapeHtml(email)}" style="color:#4c9eff;">${escapeHtml(email)}</a>` },
      { key: "Telefoon",  val: escapeHtml(telefoon) },
      { key: "Bedrijf",   val: escapeHtml(bedrijf) },
      { key: "Pakket",    val: `<span style="display:inline-block;background:#1c2b40;color:#4c9eff;font-size:12px;font-weight:700;padding:2px 10px;border-radius:100px;">${escapeHtml(pakket)}</span>` },
      { key: "Budget",    val: `<span style="display:inline-block;background:#1c2b40;color:#4c9eff;font-size:12px;font-weight:700;padding:2px 10px;border-radius:100px;">${escapeHtml(budget)}</span>` },
      { key: "Uitdaging", val: escapeHtml(bericht) },
    ],
  });
}

function buildInternalEmail({ badge, title, meta, rows }) {
  const rowsHtml = rows.map(r => `
    <div style="display:flex;border-bottom:1px solid #1e2530;padding:11px 0;align-items:flex-start;gap:12px;">
      <span style="font-size:11px;font-weight:700;color:#5a6a7e;text-transform:uppercase;letter-spacing:.06em;width:80px;flex-shrink:0;padding-top:2px;">${r.key}</span>
      <span style="font-size:14px;color:#c9d5e3;flex:1;word-break:break-word;line-height:1.55;">${r.val}</span>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#080b10;font-family:'Inter','Lato',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#0f1319;border-radius:14px;border:1px solid #1e2530;overflow:hidden;">
    <div style="padding:22px 28px;border-bottom:1px solid #1e2530;">
      <div style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:#1c2b40;color:#4c9eff;padding:4px 10px;border-radius:100px;margin-bottom:10px;">${badge}</div>
      <h2 style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-.03em;margin:0 0 4px;">${title}</h2>
      <div style="font-size:11px;color:#5a6a7e;">${meta}</div>
    </div>
    <div style="padding:4px 28px 20px;">
      ${rowsHtml}
    </div>
    <div style="padding:14px 28px;border-top:1px solid #1e2530;text-align:center;font-size:10px;color:#3d4d5e;">
      patrickvdheide.nl — interne notificatie
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
