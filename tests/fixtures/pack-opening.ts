import { face } from "./data";

export function packOpeningFixture(revealHints = true) {
  const card = (id: string, link = false) =>
    `<li>${face(id)}${link ? '<a href="/card/42?copy=fixture" onclick="count(\'card\'); return false">See card</a>' : ""}
      <button class="ko-grid-open" onclick="openViewer()" aria-label="See card up close"></button></li>`;
  const summary = `
    <div class="ko-scene ko-summary-scene">
      <div class="ko-summary">
        <h1>Nice pull</h1>
        <div class="ko-drop ko-drop-rogue" role="dialog" aria-modal="true">
          <button class="ko-drop-btn" onclick="dismissFound(this)">Continue</button>
        </div>
        <ul class="ko-bonus" aria-label="Found packs">
          <li class="ko-bonus-rogue">Rogue Pack</li>
          <li class="ko-bonus-mega">Mega Pack</li>
        </ul>
        <ul class="ko-grid">${card("42", true)}${card("42")}</ul>
        <div class="ko-grid-more" aria-hidden="true"></div>
        <div class="op-actions op-actions-stack">
          <button class="btn-gold btn-lg" onclick="nextPack(this)">Open the next pack</button>
          <div class="op-actions-pair">
            <button class="op-share" disabled onclick="count('wrong')">Unavailable Share</button>
            <button class="op-share" onclick="count('share')">Share</button>
            <a href="/home" onclick="count('home'); return false">Home</a>
          </div>
        </div>
        <input aria-label="Test typing">
      </div>
      <dialog><button autofocus>Close-up card</button></dialog>
    </div>`;
  const reveal = `
    <main class="ko-scene" data-hints="${revealHints ? "on" : "off"}">
      <button class="ko-skip ko-talents" onclick="count('wrong')">Talents</button>
      <button class="ko-skip ko-later" onclick="count('later')">Later</button>
      <button class="ko-skip" hidden onclick="count('wrong')">Hidden Skip</button>
      <button class="ko-skip" onclick="skipOpening()">Skip</button>
      <div class="ko-pack-ready"><div class="ko-pack" role="button" tabindex="0">Open Pack</div></div>
    </main>`;
  return `<!doctype html><html><head><style>
    body { margin: 24px; font: 16px system-ui }
    .ko-grid { padding: 0; list-style: none }
    .ko-grid > li { position: relative; margin-bottom: 24px; min-height: 550px }
    .ko-grid-open { position: absolute; inset: 0; border: 0; background: transparent }
    .kc-img { width: 180px; height: 250px; object-fit: cover }
    .ko-grid-more { height: 8px }
    .ko-card, .ko-pack { width: 250px }
  </style></head><body>${reveal}
    <script>
      function count(key) {
        document.body.dataset[key] = String(Number(document.body.dataset[key] || 0) + 1);
      }
      function skipOpening() {
        count('skip');
        const mode = new URLSearchParams(location.search).get('autoSkipCase');
        if (mode === 'normal') finish();
        if (mode === 'protected') {
          if (document.body.dataset.skip === '1')
            document.querySelector('main').insertAdjacentHTML('beforeend', '<p class="ko-skip-note" data-testid="skip-note">This pack deserves a closer look.</p>');
          else finish();
        }
      }
      function dismissFound(button) {
        count('dismiss');
        if (document.body.dataset.dismiss === '1') button.parentElement.className = 'ko-drop ko-drop-mega';
        else button.parentElement.remove();
      }
      function openViewer() {
        count('opens');
        document.querySelector('dialog').showModal();
      }
      function nextPack(button) {
        count('next');
        const url = new URL(location.href);
        const next = url.searchParams.get('nextOpening');
        if (next) {
          url.searchParams.set('id', next);
          url.searchParams.set('autoSkipCase', url.searchParams.get('nextSkipCase') || 'normal');
          url.searchParams.delete('nextOpening');
          url.searchParams.delete('recap');
          history.replaceState(null, '', url);
          document.querySelector('.ko-summary-scene').outerHTML = '<div class="ko-scene" aria-busy="true"></div>';
          setTimeout(() => {
            document.querySelector('.ko-scene').outerHTML = ${JSON.stringify(reveal)};
            if (url.searchParams.get('nextRevealHints') === 'off')
              document.querySelector('main').dataset.hints = 'off';
          }, 50);
          return;
        }
        history.replaceState(null, '', location.href + '&next=1');
        button.outerHTML = '<a class="btn-gold btn-lg" href="/packs">Back to Packs</a>';
        document.querySelector('.op-actions-stack > a').addEventListener('click', (event) => {
          event.preventDefault();
          count('back');
        });
      }
      function finish() {
        document.querySelector('main').outerHTML = ${JSON.stringify(summary)};
        const sentinel = document.querySelector('.ko-grid-more');
        const observer = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          document.querySelector('.ko-grid').insertAdjacentHTML('beforeend', ${JSON.stringify(card("43"))});
          sentinel.remove();
        });
        observer.observe(sentinel);
      }
      window.addEventListener('keydown', (event) => {
        const ready = document.querySelector('.ko-pack-ready');
        const table = document.querySelector('.ko-table');
        if (event.key !== 'ArrowRight' || (!ready && !table)) return;
        event.preventDefault();
        count('advances');
        if (ready) ready.outerHTML = '<div class="ko-table">Reveal card</div>';
        else if (!table.querySelector('.ko-card')) {
          table.innerHTML = ${JSON.stringify(`<div class="ko-card ko-beat-idle" role="button" tabindex="-1"><div class="ko-face-front">${face("42")}</div></div><ol class="ko-tray"><li class="on"></li></ol>`)};
          setTimeout(() => table.querySelector('.ko-card').className = 'ko-card ko-beat-shown', 50);
        } else finish();
      });
    </script>
  </body></html>`;
}
