/**
 * vraag het patrick — embed loader
 *
 * Auto-injecteert de Q&A-widget in elk element met id="pvh-ask-mount".
 * Wordt geserveerd vanaf https://api.patrickvdheide.nl/embed.js
 *
 * Installatie in Webflow:
 *   1. Site Settings → Custom Code → Footer Code:
 *      <script src="https://api.patrickvdheide.nl/embed.js" defer></script>
 *   2. Voeg overal waar de widget moet verschijnen een Embed-element toe met:
 *      <div id="pvh-ask-mount"></div>
 */
(() => {
  'use strict';

  // === API endpoints worden auto-detected vanuit script-locatie ===
  const API_BASE = (() => {
    try {
      const script = document.currentScript
        || document.querySelector('script[src*="embed.js"]');
      if (script && script.src) {
        const url = new URL(script.src);
        return `${url.protocol}//${url.host}`;
      }
    } catch (_) {}
    return 'https://api.patrickvdheide.nl';
  })();
  const API_ENDPOINT = `${API_BASE}/api/ask`;
  const FEEDBACK_ENDPOINT = `${API_BASE}/api/feedback`;
  const MEETING_LINK = 'https://meetings-eu1.hubspot.com/patrick-van-der-heide?uuid=0e32d639-d879-48e4-bd2d-d032fb386119';

  // === CSS ===
  const CSS = `
.pvh-ask {
  background: #f2f2f2;
  color: #111111;
  padding: clamp(48px, 8vw, 120px) 24px;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.pvh-ask *, .pvh-ask *::before, .pvh-ask *::after { box-sizing: border-box; }
.pvh-ask__inner { max-width: 760px; margin: 0 auto; }
.pvh-ask__sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
.pvh-ask__head { margin-bottom: 40px; }
.pvh-ask__eyebrow {
  font-size: 14px; font-weight: 500; letter-spacing: 0.02em;
  color: #111111; opacity: 0.55; margin: 0 0 16px;
}
.pvh-ask__title {
  font-family: 'Tanker', 'Impact', sans-serif;
  font-size: clamp(36px, 6vw, 64px); line-height: 1.0;
  font-weight: 400; margin: 0 0 20px; letter-spacing: -0.01em;
  text-transform: lowercase;
}
.pvh-ask__lead {
  font-size: 17px; line-height: 1.6; margin: 0; opacity: 0.75; max-width: 560px;
}
.pvh-ask__form {
  display: flex; flex-direction: column; gap: 12px;
  background: #ffffff; border: 1px solid rgba(17,17,17,0.12);
  border-radius: 16px; padding: 18px; margin-bottom: 16px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.pvh-ask__form:focus-within {
  border-color: #111111;
  box-shadow: 0 0 0 4px rgba(250, 179, 219, 0.25);
}
.pvh-ask__input {
  width: 100%; border: 0; resize: none; outline: 0; background: transparent;
  font: inherit; color: inherit; font-size: 17px; line-height: 1.5;
  padding: 4px 0; min-height: 72px;
}
.pvh-ask__input::placeholder { color: rgba(17,17,17,0.35); }
.pvh-ask__actions {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding-top: 10px; border-top: 1px solid rgba(17,17,17,0.06);
}
.pvh-ask__count { font-size: 13px; opacity: 0.45; font-variant-numeric: tabular-nums; }
.pvh-ask__submit {
  background: #111111; color: #ffffff; border: 0;
  border-radius: 999px; padding: 12px 24px;
  font: inherit; font-weight: 500; font-size: 15px;
  cursor: pointer; transition: background 0.2s ease, color 0.2s ease, transform 0.1s ease;
  min-height: 44px; text-transform: lowercase;
}
.pvh-ask__submit:hover:not(:disabled) { background: #fab3db; color: #111111; }
.pvh-ask__submit:active:not(:disabled) { transform: translateY(1px); }
.pvh-ask__submit:disabled { opacity: 0.5; cursor: not-allowed; }
.pvh-ask__submit-loading { display: none; }
.pvh-ask__submit.is-loading .pvh-ask__submit-label { display: none; }
.pvh-ask__submit.is-loading .pvh-ask__submit-loading { display: inline; }
.pvh-ask__suggestions {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 32px;
}
.pvh-ask__chip {
  background: transparent; border: 1px solid rgba(17,17,17,0.15);
  border-radius: 999px; padding: 8px 14px;
  font: inherit; font-size: 14px; color: #111111;
  cursor: pointer; transition: all 0.2s ease; text-transform: lowercase;
}
.pvh-ask__chip:hover { border-color: #111111; background: #ffffff; }
.pvh-ask__response {
  display: block; padding-left: 20px; border-left: 4px solid #fab3db;
  margin-top: 32px; animation: pvh-fade-in 0.3s ease;
}
@keyframes pvh-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.pvh-ask__attrib {
  font-size: 13px; font-weight: 500; opacity: 0.55;
  margin: 0 0 12px; letter-spacing: 0.01em;
}
.pvh-ask__answer {
  font-size: 18px; line-height: 1.65; margin: 0 0 24px; white-space: pre-wrap;
}
.pvh-ask__answer::after {
  content: '▍'; display: inline-block; margin-left: 2px; opacity: 0.7;
  animation: pvh-blink 1s steps(2) infinite;
}
.pvh-ask__answer.is-done::after { display: none; }
@keyframes pvh-blink { 50% { opacity: 0; } }
.pvh-ask__followup {
  display: flex; flex-direction: column; gap: 18px; padding-top: 18px;
  border-top: 1px solid rgba(17,17,17,0.08);
}
.pvh-ask__feedback {
  display: flex; align-items: center; gap: 8px; font-size: 14px;
}
.pvh-ask__feedback-q { opacity: 0.55; margin-right: 4px; text-transform: lowercase; }
.pvh-ask__fb {
  background: transparent; border: 1px solid rgba(17,17,17,0.15);
  border-radius: 999px; padding: 6px 14px;
  font: inherit; font-size: 14px; color: #111111;
  cursor: pointer; transition: all 0.2s ease; text-transform: lowercase;
}
.pvh-ask__fb:hover { border-color: #111111; }
.pvh-ask__fb.is-selected {
  background: #111111; color: #ffffff; border-color: #111111;
}
.pvh-ask__cta {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.pvh-ask__cta-link {
  color: #111111; font-weight: 500; text-decoration: none;
  border-bottom: 2px solid #fab3db; padding-bottom: 2px;
  transition: border-color 0.2s ease;
}
.pvh-ask__cta-link:hover { border-bottom-color: #111111; }
.pvh-ask__reset {
  background: transparent; border: 0; padding: 0;
  font: inherit; font-size: 14px; color: #111111;
  opacity: 0.55; cursor: pointer; text-decoration: underline;
  text-transform: lowercase;
}
.pvh-ask__reset:hover { opacity: 1; }
.pvh-ask__error {
  margin-top: 16px; padding: 14px 18px;
  background: rgba(17,17,17,0.05); border-radius: 12px;
  font-size: 14px; color: #111111;
}
@media (max-width: 600px) {
  .pvh-ask__title { font-size: 36px; }
  .pvh-ask__lead, .pvh-ask__answer { font-size: 16px; }
  .pvh-ask__cta { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .pvh-ask__response, .pvh-ask__answer::after { animation: none; }
  .pvh-ask__submit, .pvh-ask__chip, .pvh-ask__form { transition: none; }
}
`;

  // === HTML template ===
  const HTML = `
<section class="pvh-ask" aria-label="Vraag het Patrick">
  <div class="pvh-ask__inner">
    <header class="pvh-ask__head">
      <p class="pvh-ask__eyebrow">vraag het patrick</p>
      <h2 class="pvh-ask__title">direct antwoord op wat je echt wilt weten.</h2>
      <p class="pvh-ask__lead">Over Webflow, mijn werkwijze, prijzen, of wat er ook in je hoofd zit. Dit is een AI-versie van mij. Voor de echte versie plan je een gesprek.</p>
    </header>
    <form class="pvh-ask__form" data-pvh="form" novalidate>
      <label class="pvh-ask__sr">Je vraag</label>
      <textarea class="pvh-ask__input" data-pvh="input"
        placeholder="bijvoorbeeld: kun je ook werken aan een bestaande site?"
        rows="3" maxlength="500" required></textarea>
      <div class="pvh-ask__actions">
        <span class="pvh-ask__count" data-pvh="count" aria-hidden="true">0 / 500</span>
        <button type="submit" class="pvh-ask__submit" data-pvh="submit">
          <span class="pvh-ask__submit-label">vraag stellen</span>
          <span class="pvh-ask__submit-loading" aria-hidden="true">bezig…</span>
        </button>
      </div>
    </form>
    <div class="pvh-ask__suggestions" data-pvh="suggestions">
      <button type="button" class="pvh-ask__chip" data-suggestion="Wat zit er in het Partner-pakket en voor wie is het bedoeld?">wat zit er in het partner-pakket?</button>
      <button type="button" class="pvh-ask__chip" data-suggestion="Hoe lang duurt een nieuwe website van begin tot eind?">hoe lang duurt een traject?</button>
      <button type="button" class="pvh-ask__chip" data-suggestion="Werk je ook aan bestaande websites of alleen aan nieuwe?">werk je ook met bestaande sites?</button>
      <button type="button" class="pvh-ask__chip" data-suggestion="Wat is het verschil tussen jou inhuren en een bureau inschakelen?">jij vs. een bureau?</button>
    </div>
    <output class="pvh-ask__response" data-pvh="response" hidden aria-live="polite">
      <p class="pvh-ask__attrib">patrick zegt:</p>
      <div class="pvh-ask__answer" data-pvh="answer"></div>
      <div class="pvh-ask__followup" data-pvh="followup" hidden>
        <div class="pvh-ask__feedback">
          <span class="pvh-ask__feedback-q">hielp dit?</span>
          <button type="button" class="pvh-ask__fb" data-fb="up" aria-label="Ja, dit hielp">ja</button>
          <button type="button" class="pvh-ask__fb" data-fb="down" aria-label="Nee, niet echt">niet echt</button>
        </div>
        <div class="pvh-ask__cta">
          <a href="${MEETING_LINK}" class="pvh-ask__cta-link" target="_blank" rel="noopener">verder praten? plan een kort gesprek →</a>
          <button type="button" class="pvh-ask__reset" data-pvh="reset">stel nog een vraag</button>
        </div>
      </div>
    </output>
    <p class="pvh-ask__error" data-pvh="error" hidden role="alert"></p>
  </div>
</section>
`.trim();

  // === Mount op alle pvh-ask-mount divs ===
  function init() {
    const mounts = document.querySelectorAll('#pvh-ask-mount, [data-pvh-mount]');
    if (!mounts.length) return;

    if (!document.getElementById('pvh-ask-styles')) {
      const style = document.createElement('style');
      style.id = 'pvh-ask-styles';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    mounts.forEach((mount) => {
      if (mount.dataset.pvhInitialized === 'true') return;
      mount.dataset.pvhInitialized = 'true';
      mount.innerHTML = HTML;
      attach(mount);
    });
  }

  // === Behavior wiring per mount ===
  function attach(root) {
    const $ = (key) => root.querySelector(`[data-pvh="${key}"]`);
    const form = $('form');
    const input = $('input');
    const submit = $('submit');
    const count = $('count');
    const suggestions = $('suggestions');
    const response = $('response');
    const answer = $('answer');
    const followup = $('followup');
    const reset = $('reset');
    const errorEl = $('error');

    let session = null;

    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    const updateCount = () => {
      count.textContent = `${input.value.length} / 500`;
    };
    input.addEventListener('input', updateCount);

    suggestions.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-suggestion]');
      if (!chip) return;
      input.value = chip.dataset.suggestion;
      updateCount();
      input.focus();
    });

    reset.addEventListener('click', () => {
      input.value = '';
      updateCount();
      response.hidden = true;
      followup.hidden = true;
      answer.textContent = '';
      answer.classList.remove('is-done');
      errorEl.hidden = true;
      input.focus();
    });

    followup.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-fb]');
      if (!btn) return;
      btn.parentElement.querySelectorAll('[data-fb]')
        .forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      if (!session) return;
      try {
        await fetch(FEEDBACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            question: session.question,
            answer: session.answer,
            rating: btn.dataset.fb,
          }),
        });
      } catch (_) { /* feedback faalt stil */ }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = input.value.trim();
      if (question.length < 3) {
        showError('Stel even een iets uitgebreidere vraag — een paar woorden helpt me al.');
        return;
      }

      submit.disabled = true;
      submit.classList.add('is-loading');
      errorEl.hidden = true;
      response.hidden = false;
      followup.hidden = true;
      answer.textContent = '';
      answer.classList.remove('is-done');

      session = {
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        question,
        answer: '',
      };

      try {
        const res = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });

        if (res.status === 429) {
          showError('Je hebt vandaag al best wat vragen gesteld. Probeer het straks nog eens, of plan even een kort gesprek voor je verdere vragen.');
          response.hidden = true;
          return;
        }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'content_block_delta'
                && evt.delta && evt.delta.type === 'text_delta') {
                fullText += evt.delta.text;
                answer.textContent = fullText;
              } else if (evt.type === 'error') {
                throw new Error((evt.error && evt.error.message) || 'API error');
              }
            } catch (_) { /* skip non-JSON lines */ }
          }
        }

        answer.classList.add('is-done');
        session.answer = fullText;
        followup.hidden = false;
      } catch (err) {
        if (window.console) console.warn('[pvh-ask]', err);
        showError('Er ging even iets mis aan mijn kant. Probeer het opnieuw, of stel je vraag rechtstreeks via het contactformulier.');
        response.hidden = true;
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-loading');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
