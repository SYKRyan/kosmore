import { fusionGrid } from "./fusion";

/** Native Vortex stake row and the shared CardPicker markup, checked 2026-11-08. */
export function vortexFixture() {
  const face = (id: string, name: string) =>
    `<article class="kc-article" aria-label="${name}, Common"><div class="kc"><h3 class="kc-name">${name}</h3><div class="kc-window"><img class="kc-img" src="/media/cards/${id}/x/card.webp" alt=""></div><footer>Common</footer></div></article>`;
  const tiles = (picker: boolean) =>
    fusionGrid.items
      .map(({ card }) =>
        picker
          ? `<div class="pick" data-subject="${card.subjectId}">${face(String(card.subjectId), String(card.name))}<button class="pick-hit" aria-label="Stake ${card.subjectId}" onclick="document.body.dataset.picked='${card.subjectId}';document.querySelector('dialog').close()"></button></div>`
          : `<button type="button" role="radio" aria-checked="false" data-testid="vx-stake-card" data-subject="${card.subjectId}" onclick="this.setAttribute('aria-checked','true')">${face(String(card.subjectId), String(card.name))}</button>`,
      )
      .join("");
  return `<!doctype html><html><head><title>Vortex fixture</title><style>
body{background:#0c081d;color:#f9e6b6;font:14px system-ui;margin:0;padding:24px}
.vx-row{display:flex;gap:12px;overflow:auto;padding:8px}
[data-testid="vx-stake-card"]{position:relative;flex:0 0 120px;background:transparent;color:inherit;border:0;padding:0;cursor:pointer}
.kc-article{border:2px solid #a8b1cd;border-radius:12px;background:#243147;padding:6px}
.kc-name{font:600 14px Georgia;margin:4px}.kc-window{position:relative;overflow:hidden;border-radius:6px}.kc-img{display:block;width:100%;height:130px;object-fit:cover}
.kc footer{font-size:10px;margin:8px 4px}.pick{position:relative}.pick-hit{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}
dialog{background:#110d23;color:inherit;border:1px solid #66507e;max-width:90vw}dialog::backdrop{background:#0009}
.card-grid{display:grid;grid-template-columns:repeat(2,140px);gap:12px}
</style></head><body><main><h1>Vortex</h1><div class="vx-row" data-testid="vx-row">${tiles(false)}</div>
<button data-testid="vx-more" onclick="document.querySelector('dialog').showModal()">Choose a card</button>
<div data-testid="vx-choices">${face("304", "Reward card")}</div>
<dialog><div data-testid="vx-picker"><div class="card-grid vx-pk-grid" data-testid="vx-picker-grid">${tiles(true)}</div></div></dialog>
</main></body></html>`;
}
