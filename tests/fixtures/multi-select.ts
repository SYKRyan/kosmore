import { face } from "./data";
import { sellManyFixture, sellPickerTile } from "./sell-many";

export function multiSelectFixture(): string {
  const cards = [
    ["42", "Northern Lights", "kc-veil"],
    ["46", "Andromeda", "kc-fa"],
  ];
  const initial = cards
    .map(
      ([id, name, variant]) =>
        `<li><a class="kc-link" href="/card/${id}"><div class="kc-wrap kc-wrap-solo">${face(id, name, variant)}</div></a></li>`,
    )
    .join("");
  const selected = cards
    .map(([id, name, variant], index) =>
      sellPickerTile(id, name, variant).replace(
        'aria-pressed="false"',
        `aria-pressed="${index === 0}"`,
      ),
    )
    .join("");
  const style = sellManyFixture().match(/<style>([\s\S]*?)<\/style>/)![1];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Multi-select fixture</title><style>${style}.kc-link{display:block;color:inherit;text-decoration:none}</style></head><body><h1>Collection</h1><ul class="card-grid">${initial}</ul><script>
let timer;
const grid = document.querySelector('.card-grid');
grid.addEventListener('pointerdown', event => {
  if (!event.target.closest('a.kc-link')) return;
  timer = setTimeout(() => { grid.innerHTML = ${JSON.stringify(selected)}; }, 450);
});
for (const event of ['pointerup', 'pointercancel']) document.addEventListener(event, () => clearTimeout(timer));
grid.addEventListener('click', event => event.preventDefault());
</script></body></html>`;
}
