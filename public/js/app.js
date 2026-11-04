import {request} from './api.js';
import {initializeMap,showRestaurant,clearRestaurant} from './map.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=n=>Number(n).toLocaleString('ko-KR')+'원';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAGE_SIZE=3,BUDGET_STEP=500,BUDGET_MIN=3000,BUDGET_MAX=30000;
const state={user:null,category:'all',sort:'recommend',rows:[],page:0,favorites:[],recent:[],detailId:null,selectedKey:null,signup:false};let abort,lastFocused;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function openDialog(id){lastFocused=document.activeElement;$(id).showModal();}
function account(){ $('#loginOpen').textContent=state.user?`${state.user.name} · 로그아웃`:'로그인 / 회원가입'; }
function switchAuth(signup){state.signup=signup;$('#authTitle').textContent=signup?'밥잇 회원가입':'밥잇에 오신 것을 환영해요!';$('#nameField').hidden=!signup;$('#authName').required=signup;$('#authSubmit').textContent=signup?'회원가입':'로그인';$('#authPassword').autocomplete=signup?'new-password':'current-password';$('#switchAuth').textContent=signup?'이미 회원인가요? 로그인':'처음 오셨나요? 회원가입';$('#authError').textContent='';}
function loginPrompt(){switchAuth(false);openDialog('#authDialog');}
// 목록 한 줄 = 메뉴 한 개 (Menu 테이블 기준). 카드를 누르면 지도에서 식당 위치를 보여줍니다.
const cardKey=r=>`${r.restaurantId??r.id}-${r.menuId??0}`;
function rowHtml(r){const rid=r.restaurantId??r.id;return `<article class="restaurant-card menu-card${state.selectedKey===cardKey(r)?' selected':''}" data-focus="${rid}" data-key="${cardKey(r)}" tabindex="0" role="button" aria-label="${escape(r.menuName)} ${r.price!=null?money(r.price):''}, ${escape(r.name)}, 지도에서 위치 보기"><div class="food-image" aria-hidden="true">${escape(r.emoji)}</div><div class="restaurant-info"><h3>${escape(r.menuName)} <b class="menu-price">${r.price!=null?money(r.price):''}</b></h3><div class="menu-place">${escape(r.name)} ${r.isSample?'<span class="sample-tag">예시</span>':''}</div><div class="meta">${r.categoryName?escape(r.categoryName)+' · ':''}학교에서 ${r.distance.toLocaleString()}m${r.score!==undefined?` · 추천 점수 ${r.score}`:''}</div></div><div class="rating"><div>${r.rating===null?'평점 없음':'★ '+r.rating.toFixed(1)}</div><small>후기 ${r.reviewCount}개</small><button class="heart ${r.saved?'saved':''}" data-save="${rid}" aria-label="${escape(r.name)} ${r.saved?'찜 해제':'찜하기'}" aria-pressed="${!!r.saved}">${r.saved?'♥':'♡'}</button><div class="card-actions"><button class="review-open" data-detail="${rid}" aria-label="${escape(r.name)} 상세 정보">상세</button><button class="review-open" data-review="${rid}" aria-label="${escape(r.name)} 후기 보기">후기</button></div></div></article>`;}
// 지도에는 마커를 1개만 표시합니다. 처음에는 첫 번째 추천 식당, 카드를 누르면 그 식당으로 마커가 옮겨갑니다.
function showOnMap(row){if(!row){clearRestaurant();return false;}return showRestaurant(row);}
function selectCard(card){state.selectedKey=card.dataset.key;$$('[data-focus]').forEach(c=>c.classList.toggle('selected',c===card));const row=state.rows.find(r=>cardKey(r)===card.dataset.key);if(!showOnMap(row)){toast('지도를 불러온 뒤 위치를 확인할 수 있어요.');return;}if(window.matchMedia('(max-width:900px)').matches)$('.map-panel').scrollIntoView({behavior:'smooth',block:'center'});}

// ===== 예산 입력: 숫자만 허용, 500원 단위 증감 =====
const budgetInput=$('#budget');
const digitsOnly=v=>String(v).replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,5);
function budgetValue(){return Number(budgetInput.value)||0;}
function syncChips(){$$('[data-budget]').forEach(x=>x.classList.toggle('active',Number(x.dataset.budget)===budgetValue()));}
function setBudget(v){budgetInput.value=String(Math.min(BUDGET_MAX,Math.max(BUDGET_MIN,v)));syncChips();}
// 예산 범위: 3,000~30,000원. 500원 단위가 아니면 가까운 500원 단위로 먼저 맞춥니다. (예: 7,300원 ▲ → 7,500원, ▼ → 7,000원)
function stepBudget(dir){const v=budgetValue();setBudget(dir>0?Math.floor(v/BUDGET_STEP)*BUDGET_STEP+BUDGET_STEP:Math.ceil(v/BUDGET_STEP)*BUDGET_STEP-BUDGET_STEP);}
budgetInput.addEventListener('beforeinput',e=>{if(e.data&&/\D/.test(e.data)&&e.inputType!=='insertFromPaste')e.preventDefault();});
budgetInput.addEventListener('input',()=>{const clean=digitsOnly(budgetInput.value);if(clean!==budgetInput.value)budgetInput.value=clean;syncChips();});
budgetInput.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();stepBudget(e.key==='ArrowUp'?1:-1);}});
$$('[data-step]').forEach(b=>b.addEventListener('click',()=>{stepBudget(Number(b.dataset.step));load();}));

// ===== 맛집 찾기(추천 목록): 5개씩 한 페이지, < > 버튼이나 옆으로 밀어서 넘기기 =====
const pageCount=()=>Math.max(1,Math.ceil(state.rows.length/PAGE_SIZE));
const pageRows=(page=state.page)=>state.rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
const listEl=$('#resultList');
// 페이지마다 카드 수가 달라도 빈 공간이 생기지 않도록 목록 높이를 현재 페이지에 맞춥니다.
function fitHeight(){const page=listEl.children[state.page];listEl.style.height=page&&page.classList.contains('result-page')?page.offsetHeight+'px':'';}
function updatePager(){fitHeight();const total=pageCount();$('#pager').hidden=state.rows.length<=PAGE_SIZE;$('#pageInfo').textContent=`${state.page+1} / ${total}`;$('#prevPage').disabled=state.page<=0;$('#nextPage').disabled=state.page>=total-1;$('#resultCount').textContent=state.rows.length?`식당 ${state.rows.length}곳의 추천 메뉴 · ${state.page+1}/${total}페이지`:'식당 0곳의 추천 메뉴';}
function setPage(page,{scroll=true,smooth=true}={}){const next=Math.min(pageCount()-1,Math.max(0,page));state.page=next;if(scroll)listEl.scrollTo({left:next*listEl.clientWidth,behavior:smooth?'smooth':'auto'});updatePager();}
function renderSearch(keepPage=false){if(!keepPage)state.page=0;state.page=Math.min(state.page,pageCount()-1);
 if(!state.rows.length){listEl.innerHTML='<div class="empty-state"><b>조건에 맞는 메뉴가 없어요.</b><p>예산을 높이거나 다른 카테고리를 선택해 보세요.</p></div>';}
 else{const pages=[];for(let i=0;i<pageCount();i++)pages.push(`<div class="result-page" role="group" aria-label="${pageCount()}페이지 중 ${i+1}페이지">${pageRows(i).map(rowHtml).join('')}</div>`);listEl.innerHTML=pages.join('');}
 listEl.scrollLeft=state.page*listEl.clientWidth;updatePager();}
function showSearchError(message){$('#resultCount').textContent='식당을 불러오지 못했어요';$('#pager').hidden=true;state.rows=[];listEl.innerHTML=`<div class="empty-state"><b>${escape(message)}</b><button class="ghost-btn error-retry" data-retry>다시 시도</button></div>`;clearRestaurant();}
async function load({keep=false}={}){abort?.abort();abort=new AbortController();const current=abort;listEl.setAttribute('aria-busy','true');
 try{const budget=budgetValue();if(budget<BUDGET_MIN||budget>BUDGET_MAX){showSearchError('예산은 3,000~30,000원 사이로 입력해 주세요.');return;}
  const data=await request('/restaurants?'+new URLSearchParams({budget,category:state.category,sort:state.sort}),{signal:current.signal});if(current!==abort)return;state.rows=data.items;if(keep){renderSearch(true);if(state.selectedKey)$(`#resultList [data-key="${state.selectedKey}"]`)?.classList.add('selected');return;}state.selectedKey=state.rows[0]?cardKey(state.rows[0]):null;renderSearch();showOnMap(state.rows[0]);
 }catch(e){if(e.name==='AbortError')return;showSearchError(e.message);}finally{if(current===abort)listEl.removeAttribute('aria-busy');}}
// '다시 시도': 예산을 최소 금액(3,000원)으로 바꾸고 예산 입력칸으로 커서를 옮긴 뒤 다시 검색합니다.
function retrySearch(){setBudget(BUDGET_MIN);budgetInput.focus();budgetInput.select();load();}
$('#prevPage').addEventListener('click',()=>setPage(state.page-1));$('#nextPage').addEventListener('click',()=>setPage(state.page+1));
// 손가락으로 옆으로 밀어서 넘긴 경우에도 현재 페이지와 지도를 맞춰 줍니다.
listEl.addEventListener('scroll',()=>{clearTimeout(listEl.timer);listEl.timer=setTimeout(()=>{if(!state.rows.length)return;const page=Math.round(listEl.scrollLeft/listEl.clientWidth);if(page!==state.page)setPage(page,{scroll:false});},120);});
listEl.addEventListener('keydown',e=>{if(e.target.closest?.('input,textarea,select'))return;if(e.key==='ArrowRight'&&state.page<pageCount()-1){e.preventDefault();setPage(state.page+1);}if(e.key==='ArrowLeft'&&state.page>0){e.preventDefault();setPage(state.page-1);}});
window.addEventListener('resize',()=>{listEl.scrollLeft=state.page*listEl.clientWidth;fitHeight();});

// ===== 찜한 맛집 / 최근 본 식당: 같은 페이지 아래쪽 섹션 =====
const myLists={favorites:{list:'#favoritesList',count:'#favoritesCount',empty:'아직 찜한 식당이 없어요.'},recent:{list:'#recentList',count:'#recentCount',empty:'아직 확인한 식당이 없어요.'}};
async function loadMine(which=['favorites','recent']){for(const key of which){const cfg=myLists[key];const el=$(cfg.list);if(!state.user){state[key]=[];$(cfg.count).textContent='내 식당 목록';el.innerHTML='<div class="empty-state"><b>로그인하면 내 식당 목록을 볼 수 있어요.</b><p>찜한 맛집과 최근 본 식당을 계정에 저장합니다.</p><button class="primary-btn" data-login>로그인 / 회원가입</button></div>';continue;}
 el.setAttribute('aria-busy','true');try{const data=await request('/me/'+key);state[key]=data.items;$(cfg.count).textContent=`${data.items.length}개의 식당`;el.innerHTML=data.items.length?data.items.map(rowHtml).join(''):`<div class="empty-state"><b>${cfg.empty}</b><p>맛집 찾기에서 관심 있는 식당을 확인해 보세요.</p></div>`;}catch(e){$(cfg.count).textContent='목록을 불러오지 못했어요';el.innerHTML=`<div class="empty-state"><b>${escape(e.message)}</b><button class="ghost-btn error-retry" data-retry>다시 시도</button></div>`;}finally{el.removeAttribute('aria-busy');}}}
const loadAll=()=>Promise.all([load(),loadMine()]);
const reviewItems=reviews=>reviews.length?reviews.map(v=>`<article class="review-item"><div class="review-item-top"><div><b>${escape(v.name)}</b><span aria-label="${v.rating}점">${'★'.repeat(v.rating)}${'☆'.repeat(5-v.rating)}</span></div><small>${new Date(v.createdAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div><p>${escape(v.comment)}</p></article>`).join(''):'<div class="review-empty">첫 번째 후기를 남겨보세요.</div>';
// 상세 창: 식당 정보와 메뉴만 보여줍니다.
async function showDetail(id){state.detailId=id;$('#detailBody').innerHTML='<p class="loading">식당 정보를 불러오고 있어요.</p>';openDialog('#detailDialog');
 try{const data=await request('/restaurants/'+id);if(state.detailId!==id)return;const r=data.restaurant;$('#detailBody').innerHTML=`<div class="detail-head"><span class="eyebrow">${escape(r.categoryName)}${r.isSample?' · 예시 식당':''}</span><h2 id="detailTitle">${escape(r.name)}</h2><p class="detail-meta">${escape(r.address)} · 학교에서 직선거리 ${r.distance}m</p></div><table class="menu-table"><caption>메뉴와 가격</caption><tbody>${r.menus.map(m=>`<tr><td>${escape(m.name)}</td><td>${money(m.price)}</td></tr>`).join('')}</tbody></table><div class="detail-summary">${r.rating===null?'아직 평점이 없어요':'★ '+r.rating.toFixed(1)} · 후기 ${r.reviewCount}개</div>`;}catch(e){$('#detailBody').textContent=e.message;}}
// 후기 창: 별점 요약, 후기 목록, 후기 작성 폼만 보여줍니다.
async function showReviews(id,open=true){state.reviewId=id;$('#reviewError').textContent='';if(open){$('#reviewForm').reset();$('#reviewBody').innerHTML='<p class="loading">후기를 불러오고 있어요.</p>';openDialog('#reviewDialog');}
 try{const data=await request('/restaurants/'+id);if(state.reviewId!==id)return;const r=data.restaurant;$('#reviewBody').innerHTML=`<div class="detail-head"><span class="eyebrow">후기</span><h2 id="reviewTitle">${escape(r.name)}</h2></div><div class="detail-summary">${r.rating===null?'아직 평점이 없어요':'★ '+r.rating.toFixed(1)} · 후기 ${r.reviewCount}개</div><div class="review-list">${reviewItems(data.reviews)}</div>`;$('#reviewHint').textContent=state.user?'계정당 식당별 후기 한 개를 저장하며 다시 작성하면 수정됩니다.':'후기를 남기려면 먼저 로그인해 주세요.';const own=data.reviews.find(v=>v.userId===state.user?.id);if(open&&own){$('#rating').value=own.rating;$('#comment').value=own.comment;}}catch(e){$('#reviewBody').textContent=e.message;}}
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));$$('dialog').forEach(d=>{d.addEventListener('close',()=>{lastFocused?.focus();if((d.id==='detailDialog'||d.id==='reviewDialog')&&state.user)loadMine(['recent']);});d.addEventListener('click',e=>{const rect=d.getBoundingClientRect();if(e.target===d&&(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom))d.close();});});
$('#loginOpen').addEventListener('click',async()=>{if(!state.user)return loginPrompt();try{await request('/auth/logout',{method:'POST',body:{}});state.user=null;account();await loadAll();toast('로그아웃했어요.');}catch(e){toast(e.message);}});
$('#switchAuth').addEventListener('click',()=>switchAuth(!state.signup));$('#authForm').addEventListener('submit',async e=>{e.preventDefault();$('#authSubmit').disabled=true;$('#authError').textContent='';try{const data=await request('/auth/'+(state.signup?'signup':'login'),{method:'POST',body:{email:$('#authEmail').value,password:$('#authPassword').value,name:$('#authName').value}});state.user=data.user;account();$('#authDialog').close();$('#authForm').reset();await loadAll();toast('반가워요, '+state.user.name+'님!');}catch(err){$('#authError').textContent=err.message;}finally{$('#authSubmit').disabled=false;}});

// 상단 메뉴: 페이지 전환 없이 해당 섹션으로 부드럽게 스크롤합니다.
$$('[data-nav]').forEach(a=>a.addEventListener('click',e=>{const target=document.getElementById(a.dataset.nav);if(!target)return;e.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'','#'+a.dataset.nav);$('#mainNav').classList.remove('open');$('#menuToggle').setAttribute('aria-expanded','false');}));
$('#menuToggle').addEventListener('click',()=>{const opened=$('#mainNav').classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(opened));});
// 스크롤 위치에 맞춰 현재 보고 있는 섹션의 메뉴를 강조합니다.
if('IntersectionObserver' in window){const navTargets=['recommend','favorites','recent'].map(id=>document.getElementById(id)).filter(Boolean);const visible=new Map();const io=new IntersectionObserver(entries=>{entries.forEach(en=>visible.set(en.target.id,en.isIntersecting?en.intersectionRatio:0));const best=[...visible].sort((a,b)=>b[1]-a[1])[0];if(!best||best[1]===0)return;$$('[data-nav]').forEach(a=>{if(a.dataset.nav===best[0])a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});},{rootMargin:'-90px 0px -40% 0px',threshold:[0,.1,.25,.5,.75,1]});navTargets.forEach(t=>io.observe(t));}

$('#searchForm').addEventListener('submit',e=>{e.preventDefault();load();});$$('[data-budget]').forEach(b=>b.addEventListener('click',()=>{setBudget(Number(b.dataset.budget));load();}));$$('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;$$('[data-category]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});load();}));$$('[data-sort]').forEach(b=>b.addEventListener('click',()=>{state.sort=b.dataset.sort;$$('[data-sort]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});load();}));

// 카드 클릭: 추천 목록은 지도에서 위치 보기, 찜/최근 목록은 상세 정보 열기
function activateCard(card){if(card.closest('[data-list]')?.dataset.list==='search')selectCard(card);else showDetail(Number(card.dataset.focus));}
const rowsOf=list=>list==='search'?state.rows:state[list];
$$('[data-list]').forEach(listEl=>{
 listEl.addEventListener('keydown',e=>{const card=e.target.closest?.('[data-focus]');if(card&&e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();activateCard(card);}});
 listEl.addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn){const card=e.target.closest('[data-focus]');if(card)activateCard(card);return;}if(btn.hasAttribute('data-login'))return loginPrompt();if(btn.hasAttribute('data-retry'))return listEl.dataset.list==='search'?retrySearch():loadMine([listEl.dataset.list]);if(btn.dataset.detail)return showDetail(Number(btn.dataset.detail));if(btn.dataset.review)return showReviews(Number(btn.dataset.review));if(btn.dataset.save){if(!state.user)return loginPrompt();btn.disabled=true;try{const id=Number(btn.dataset.save);const row=rowsOf(listEl.dataset.list).find(r=>(r.restaurantId??r.id)===id);await request('/restaurants/'+id+'/favorite',{method:'PUT',body:{saved:!row.saved}});toast(row.saved?'찜 목록에서 삭제했어요.':'찜한 맛집에 저장했어요.');await refreshSaved();}catch(err){toast(err.message);btn.disabled=false;}}});
});
// 찜 상태가 바뀌면 추천 목록은 '더 보기'로 펼친 상태를 유지한 채 하트만 갱신하고, 내 목록은 다시 불러옵니다.
async function refreshSaved(){await loadMine();const ids=new Set(state.favorites.map(r=>r.restaurantId??r.id));state.rows=state.rows.map(r=>({...r,saved:ids.has(r.restaurantId)}));const key=state.selectedKey;renderSearch(true);if(key)$(`#resultList [data-key="${key}"]`)?.classList.add('selected');}
$('#reviewForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.user){$('#reviewDialog').close();loginPrompt();return;}const button=e.submitter;button.disabled=true;try{await request('/restaurants/'+state.reviewId+'/reviews',{method:'POST',body:{rating:Number($('#rating').value),comment:$('#comment').value}});await showReviews(state.reviewId,false);await Promise.all([load({keep:true}),loadMine()]);toast('후기를 저장했어요.');}catch(err){$('#reviewError').textContent=err.message;}finally{button.disabled=false;}});
try{state.user=(await request('/auth/me')).user;account();}catch(e){toast(e.message);}await loadAll();await initializeMap(id=>showDetail(id));showOnMap(state.rows.find(r=>cardKey(r)===state.selectedKey)||state.rows[0]);
