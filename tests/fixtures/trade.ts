export function tradeFixture() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>New trade</title><style>
  body{background:#110c1b;color:#ece3f6;font:15px/1.5 system-ui;margin:0;padding:30px}.screen{max-width:780px;margin:auto}.sx-flow-head{display:flex;gap:18px;align-items:center}.sx-flow-with{font-size:18px;margin-left:18px;color:#cab8df}.sx-steps{display:flex;justify-content:space-between;list-style:none;padding:0;margin:26px 0}.sx-step-dot{display:block;border:1px solid #7a638e;border-radius:50%;width:30px;text-align:center}.sx-step-label{font-size:12px}.sx-step-title{font-size:22px}.note{color:#b9abc9}button,input{font:inherit;background:#2a1e3a;color:#eee4f8;border:1px solid #756086;border-radius:8px;padding:10px}input{width:100%;box-sizing:border-box}#cards{display:flex;gap:15px;margin-top:28px}#cards button{min-height:140px;flex:1}.sx-flow-title{font-size:27px}.avatar-fallback{display:inline-grid;place-items:center;width:24px;height:24px;margin-right:8px;border-radius:50%;background:#2c2452;font:10px system-ui}
  </style></head><body><main id="main"><div class="screen screen-narrow sx-new-trade"></div></main><script>
  let friend=new URLSearchParams(location.search).get('friend')??'',step=friend?2:1;const screen=document.querySelector('.screen');
  function render(){screen.innerHTML='<header class="sx-flow-head"><button aria-label="Back" id="back">←</button><h1 class="sx-flow-title">New trade'+(friend?'<span class="sx-flow-with"><span aria-hidden="true" class="avatar-fallback">'+friend.slice(0,2).toUpperCase()+'</span>'+friend+'</span>':'')+'</h1></header><ol class="sx-steps" aria-label="Steps">'+['Friend','Their card','Your card','Send'].map((s,i)=>'<li '+(i+1===step?'aria-current="step"':'')+'><span class="sx-step-dot">'+(i+1)+'</span><span class="sx-step-label">'+s+'</span></li>').join('')+'</ol>'+(step===1?'<h2 class="sx-step-title">Which friend do you want to trade with?</h2><button id="batu">Trade with batu</button> <button id="other">Trade with Other</button>':step===2?'<h2 class="sx-step-title">Which card of '+friend+\"'s do you want?</h2><p class=\\\"note\\\">Only the cards \"+friend+' can trade are shown.</p><div data-testid="trade-theirs-filters"><input type="search" placeholder="Name, keyword or family"></div><div id="cards"><button id="pick">Choose Northern Lights</button><button>Choose Voyager 1</button></div>':step===3?'<h2 class="sx-step-title">What do you offer in return?</h2><div class="sx-lockline"><span data-testid="trade-mine-rule">For Northern Lights, choose one of your cards of the same rarity.</span></div><div data-testid="trade-mine-filters"><input placeholder="Search your cards"></div><button id="review">Next</button><p class="note">Your doubles come first. Cards on the market or already offered in another trade are not shown.</p>':'<h2 class="sx-step-title">Your offer to '+friend+'</h2><button id="send">Propose the trade</button>');
  document.querySelector('#back').onclick=()=>{step=Math.max(1,step-1);if(step===1)friend='';render()};
  for(const name of ['batu','other']){const b=document.getElementById(name);if(b)b.onclick=()=>{friend=name==='batu'?'batu':'Other';step=2;render()}};
  const pick=document.getElementById('pick');if(pick)pick.onclick=()=>{step=3;render()};const review=document.getElementById('review');if(review)review.onclick=()=>{step=4;render()};
  const input=document.querySelector('input');if(input)input.oninput=()=>{document.querySelector('#cards')?.setAttribute('data-filtered',input.value)};
  }
  const nativeRender=render;
  render=()=>{
    nativeRender();
    if(step!==3)return;
    const grid=document.createElement('ul');grid.className='sx-picks';grid.dataset.testid='trade-options';
    grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:0;list-style:none';
    for(const id of ['304','305','307']){
      const tile=document.createElement('li');tile.className='sx-pick';
      tile.innerHTML='<button type="button" class="sx-pick-hit" aria-label="Offer card '+id+'" aria-pressed="false" style="width:100%;text-align:left"><article class="kc-article"><div class="kc"><h3 class="kc-name">Card '+id+'</h3><div class="kc-window" style="position:relative;min-height:130px;background:linear-gradient(135deg,#354c6a,#231536);border-radius:6px;overflow:hidden"><img class="kc-img" src="/media/cards/'+id+'/x/card.webp" style="width:100%;height:130px;object-fit:cover"></div><footer>Common</footer></div></article></button>';
      tile.querySelector('button').onclick=e=>{grid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===e.currentTarget)))};
      grid.append(tile);
    }
    document.getElementById('review').before(grid);
  };
  render();</script></body></html>`;
}
