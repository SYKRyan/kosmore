import { face } from "./data";
export function activityRow(
  subjectId: string,
  name: string,
  variant = "",
  sale = false,
): string {
  const link = `/market/00000000-0000-4000-8000-${subjectId.padStart(12, "0")}`;
  return sale
    ? `<li class="md-lot" data-testid="dash-lot"><a class="md-lot-link" href="${link}"><span class="md-lot-art">${face(subjectId, name, variant)}</span><span class="md-lot-body"><span class="md-lot-name"><b class="ui-line">${name}</b></span><span class="md-lot-price">18 Kosmo</span><span class="md-lot-foot">Ends in 1 hour</span></span></a></li>`
    : `<li class="mk-act mk-act-alert" data-testid="act-row"><a class="mk-act-main" href="${link}"><span class="mk-act-art" aria-hidden="true">${face(subjectId, name, variant)}</span><span class="mk-act-body"><span class="mk-act-name"><b class="ui-line">${name}</b></span><span class="mk-act-summary">Your bid: 12 Kosmo · Top bid: 18 Kosmo</span><small>Ends in 1 hour</small></span></a><button class="mk-act-cta" data-testid="rebid" onclick="document.body.dataset.bids=String(Number(document.body.dataset.bids||0)+1)">Bid again</button></li>`;
}
export function marketActivityFixture(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Market Activity fixture</title><style>
body{background:#100b20;color:#ece7f3;font:14px/1.5 system-ui;margin:0;padding:30px}h1{color:#ffe5b3;font:32px Georgia}main{max-width:750px}.md-panel{background:#231830;border:1px solid #655039;border-radius:12px;padding:18px;margin-bottom:16px}h2{font-size:18px;color:#f3dfb4;margin:0 0 15px}ul{padding:0;margin:0;list-style:none}.mk-act,.md-lot{padding:10px;border:1px solid #655039;border-radius:10px;display:flex;gap:12px}.mk-act-main,.md-lot-link{display:flex;align-items:center;gap:16px;flex:1;color:inherit;text-decoration:none}.mk-act-art{width:56px;flex:none}.md-lot-art{width:88px;flex:none}.kc-article{margin:0}.kc{border:1px solid #b3b7c8;border-radius:5px;overflow:hidden;background:#29374b}.kc-name{font-size:8px;margin:2px}.kc-img{display:block;width:100%;height:68px;object-fit:cover}.kc footer{font-size:7px}.mk-act-body,.md-lot-body{display:flex;flex-direction:column;gap:6px}.mk-act-name,.md-lot-name{color:#ffe5b3;font-size:16px}.mk-act-cta{align-self:center;background:#403051;color:#ffe5b3;border:1px solid #b99b60;border-radius:8px;padding:8px}button:focus-visible,a:focus-visible{outline:2px solid #ffe5b3}
</style></head><body data-bids="0"><h1>Market · My activity</h1><main class="md" data-testid="market-dashboard"><section class="md-panel md-turn" data-testid="dash-turn"><h2>Your turn</h2><div class="mk-group-sec" data-testid="dash-outbid"><ul class="mk-acts">${activityRow("42", "Northern Lights", "kc-veil")}</ul></div></section><section class="md-panel md-bids" data-testid="dash-bids"><h2>Your bids under way</h2><div class="mk-group-sec" data-testid="dash-bids-list"><ul class="mk-acts">${activityRow("46", "Andromeda", "kc-fa")}</ul></div></section><section class="md-panel md-sale" data-testid="dash-sale"><h2>Your cards on sale</h2><ul class="md-lots" data-testid="dash-lots">${activityRow("47", "Orion Nebula", "", true)}</ul></section></main></body></html>`;
}
