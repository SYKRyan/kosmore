import { batchSellRow, sellPickerTile } from "./sell-many";

export const saleFamilyKeys = ["301", "302", "303", "304", "304.v", "307"];
/** Native selection stays selected when filters unmount rows/cards. */
export function saleFamilyFixture(batch = false) {
  const rows = Object.fromEntries(
    saleFamilyKeys.map((key) => [
      key,
      batch
        ? batchSellRow(
            key.split(".")[0],
            key,
            key.endsWith(".v") ? "kc-veil" : "",
          )
        : sellPickerTile(
            key.split(".")[0],
            key,
            key.endsWith(".v") ? "kc-veil" : "",
          ),
    ]),
  );
  return `<!doctype html><html><head><style>
body{background:#100b20;color:#ece7f3;font:14px system-ui;margin:0;padding:20px}button,input{padding:8px;margin:4px}.kc-article{border:1px solid #aaa;padding:6px;border-radius:8px;background:#29374b}.kc-img{width:100%;height:130px;object-fit:cover}.kc-window{position:relative}.kc-name{font-size:13px}.pick{position:relative}.pick-hit{position:absolute;inset:0;background:transparent;border:0}.pick-hit[aria-pressed=true]{outline:3px solid gold}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:16px;list-style:none;padding:0}.mk-sell-sheet{max-width:900px}.bsell-list{list-style:none;max-width:700px;padding:0}.bsell-row{border:1px solid #999;padding:10px;margin:12px 0}.bsell-head{display:flex;align-items:center;gap:12px}.bsell-thumb{width:90px}.bsell-thumb .kc-img{height:70px}.bsell-id{flex:1}.bsell-prices{display:flex;flex-wrap:wrap}
</style></head><body data-copy-clicks="0"><h1>Sell Many</h1><button data-testid="filter">Show 301 only</button><button data-testid="show-all">Show all</button>
${batch ? '<main class="bsell"><ul class="bsell-list"></ul><button data-testid="submit-sales" onclick="document.body.dataset.submitted=\'true\'">Put cards on sale</button></main>' : '<div class="mk-sell-sheet"><ul class="card-grid mk-sell-grid" data-testid="sell-sheet-grid"></ul><button data-testid="sell-many-go">Continue</button></div>'}
<script>
const rows=${JSON.stringify(rows)}, keys=Object.keys(rows), picked=new Set();
let selected=${batch ? '(new URL(location.href).searchParams.get("s")||"").split(",").filter(k=>keys.includes(k))' : "keys"}, filtered=new URL(location.href).searchParams.has('filter');
function draw(){
 const shown=selected.filter(k=>!filtered||k==='301');
 const grid=document.querySelector('${batch ? ".bsell-list" : ".mk-sell-grid"}');
 grid.innerHTML=shown.map(k=>rows[k]).join('');
 [...grid.children].forEach((row,i)=>{
  const key=shown[i];row.dataset.key=key;
  ${batch ? "row.querySelector('.bsell-x').onclick=()=>{selected=selected.filter(k=>k!==key);draw();};" : "const button=row.querySelector('.pick-hit');button.setAttribute('aria-pressed',String(picked.has(key)));button.onclick=()=>{picked.has(key)?picked.delete(key):picked.add(key);button.setAttribute('aria-pressed',String(picked.has(key)));};"}
 });
 document.querySelector('.bsell-shown')?.remove();
 ${batch ? "if(filtered){const note=document.createElement('p');note.className='bsell-shown';note.textContent='Shown '+shown.length+' of '+selected.length;document.body.append(note);}" : ""}
}
document.querySelector('[data-testid=filter]').onclick=()=>{filtered=true;draw();};
document.querySelector('[data-testid=show-all]').onclick=()=>{filtered=false;draw();};
${batch ? "fetch('/api/market/listings/batch?subjects='+selected.join(','));" : "document.querySelector('[data-testid=sell-many-go]').onclick=()=>{location.href='/market/sell/batch?s='+[...picked].join(',');};"}
draw();
</script></body></html>`;
}
