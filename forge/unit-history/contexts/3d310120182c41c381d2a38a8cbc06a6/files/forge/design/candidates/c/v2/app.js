'use strict';
// Design-only simulation. The catalog is copied from the local model/list evidence.
// No authentication, microphone capture, AI calls, storage, uploads or network requests.
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const catalog = {
  observedAt:'2026-09-13T13:46:09.259Z',
  source:'Local Codex app-server model/list; no provider generation; not deployed settings or entitlement proof',
  models:[
    {id:'gpt-6-astra',name:'GPT-6-Astra',efforts:['low','medium','high','xhigh','max','ultra'],defaultEffort:'medium'},
    {id:'gpt-5.6-sol',name:'GPT-5.6-Sol',efforts:['low','medium','high','xhigh','max','ultra'],defaultEffort:'low'},
    {id:'gpt-5.6-terra',name:'GPT-5.6-Terra',efforts:['low','medium','high','xhigh','max','ultra'],defaultEffort:'medium'},
    {id:'gpt-5.6-luna',name:'GPT-5.6-Luna',efforts:['low','medium','high','xhigh','max'],defaultEffort:'medium'},
    {id:'gpt-5.5',name:'GPT-5.5',efforts:['low','medium','high','xhigh'],defaultEffort:'medium'},
    {id:'gpt-5.3-codex-spark',name:'GPT-5.3-Codex-Spark',efforts:['low','medium','high','xhigh'],defaultEffort:'high'}
  ]
};
const effortLabels={low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Maximum',ultra:'Ultra'};
const stateLabels=[
  'Sign in','Processing consent','Sign-in denied','Session expired','New discussion','Draft','Attachment error','Clarification','Active discussion','Complete discussion','Stopped discussion','Offline','Provider authorization','Usage limit','Research error','System error','Long discussion','Conversations','Empty history','History unavailable','Settings saved','Settings edited','Unsupported reasoning','Catalog unavailable','Session control','Voice permission','Recording','Transcribing','Transcript review','Microphone denied','Microphone unavailable','Recording interrupted','Transcription failed','Sources','Source detail','Source unavailable','Outcome','Provisional outcome','Delete confirmation','Deleted','Export ready','Export failed','Mobile menu closed','Mobile menu open'
];
const sources=[
 {id:1,publisher:'W3C · Accessibility',title:'Make the mobile flow easy to tap',url:'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html',claim:'WCAG 2.2 defines a minimum target size criterion and its exceptions. The proposed design uses larger, 44px primary touch controls.',limit:'This supports the interaction design. It does not establish member demand for an app.'},
 {id:2,publisher:'MDN Web Docs · Platform capability',title:'The web can support offline experiences',url:'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API',claim:'Service workers can support offline experiences. That capability still needs an implementation and tests for the actual task and browser.',limit:'This does not prove that the proposed member flow works offline. No service worker is implemented in this prototype.'}
];
const fixtureEN=[
 {role:'You',kind:'owner',time:'10:40',body:'Do we need a mobile app for our member community, or can a better website do the job? We have a small team and most members visit on their phones.'},
 {role:'Head Consultant',kind:'head',time:'10:40',body:'The first question is where members get stuck. Product, look at the reading journey. Operations, what could this team support? Critic, test the recommendation against what we still don’t know.'},
 {role:'Product Consultant',kind:'product',time:'10:41',to:'Operations Consultant',body:'I’d start with the website. Members need to get from signing in to reading something useful without friction. Bigger touch controls and a clearer reading flow are worth testing first.',sources:[1]},
 {role:'Operations Consultant',kind:'operations',time:'10:42',to:'Product Consultant',body:'Agreed on testing the journey. A separate app would add another release and support process. With this small team, I’d want evidence of a member need before taking that on.'},
 {role:'Critic',kind:'critic',time:'10:43',to:'Product Consultant',quote:'I’d start with the website.',body:'That recommendation is incomplete if members need to read without a connection. Are we ruling out an app before we know where the website might fail them?'},
 {role:'Product Consultant',kind:'product',time:'10:44',to:'Critic',body:'Fair challenge. The web can support offline experiences, but that doesn’t prove this one will work well. I’m changing the proposal: test one mobile reading journey and ask members when connectivity actually stops them. Keep the native-app decision open.',sources:[2]},
 {role:'Critic',kind:'critic',time:'10:45',to:'Product Consultant',body:'That addresses my objection. I support a limited test, with a clear condition: if an essential offline task still fails, revisit the platform choice. We have a recommendation to test, not proof that a native app is unnecessary.'},
 {role:'Head Consultant',kind:'head',time:'10:46',body:'Start with one improved mobile web journey. Test it with members before funding another product. The unresolved question is how much offline reading matters.',outcome:true}
];
const fixtureUK=[
 {role:'You',kind:'owner',time:'10:40',body:'Нашій спільноті потрібен мобільний застосунок чи достатньо поліпшити сайт? У нас невелика команда, а більшість учасників заходить із телефона.'},
 {role:'Head Consultant',kind:'head',time:'10:40',body:'Спочатку з’ясуймо, де учасникам незручно. Product Consultant, подивіться на шлях до читання. Operations Consultant, що здатна підтримувати команда? Critic, перевірте рекомендацію з огляду на те, чого ми ще не знаємо.'},
 {role:'Product Consultant',kind:'product',time:'10:41',to:'Operations Consultant',body:'Я почав би із сайту. Учасник має легко перейти від входу до корисного матеріалу. Насамперед варто перевірити більші зони натискання та зрозуміліший шлях до читання.',sources:[1]},
 {role:'Operations Consultant',kind:'operations',time:'10:42',to:'Product Consultant',body:'Підтримую перевірку цього шляху. Окремий застосунок додасть ще один процес випуску оновлень і підтримки. Для такої невеликої команди спочатку потрібні докази конкретної потреби учасників.'},
 {role:'Critic',kind:'critic',time:'10:43',to:'Product Consultant',quote:'Я почав би із сайту.',body:'Ця рекомендація неповна, якщо учасникам потрібно читати без інтернету. Чи не відкидаємо ми застосунок, ще не з’ясувавши, де сайт може їх підвести?'},
 {role:'Product Consultant',kind:'product',time:'10:44',to:'Critic',body:'Слушне зауваження. Вебтехнології підтримують роботу без мережі, але це не доводить, що наш сценарій працюватиме добре. Змінюю пропозицію: перевірмо один мобільний шлях до читання та запитаймо учасників, коли відсутність зв’язку справді їм заважає. Рішення щодо окремого застосунку залишимо відкритим.',sources:[2]},
 {role:'Critic',kind:'critic',time:'10:45',to:'Product Consultant',body:'Це знімає моє заперечення. Підтримую обмежену перевірку за чіткої умови: якщо важливе завдання без мережі й далі не вдається виконати, повертаємося до вибору платформи. Ми маємо рекомендацію для перевірки, а не доказ непотрібності застосунку.'},
 {role:'Head Consultant',kind:'head',time:'10:46',body:'Почніть з одного поліпшеного мобільного шляху на сайті. Перевірте його з учасниками, перш ніж фінансувати ще один продукт. Відкрите питання — наскільки важливе читання без інтернету.',outcome:true}
];
let state='ST-10',page='discussion',view='discussion',locale='en',draft='',attachments=[],deleted=false,shown=8,extraMessages=[],longContent=false,empty=false,playing=false;
let playTimer=null,voiceTimer=null,transcribeTimer=null,toastTimer=null,voiceStage=null,voiceSeconds=0,modalReturn=null,consented=false,revoked=false;
let saved={headModel:'gpt-6-astra',headReasoning:'xhigh',criticProvider:'codex',criticModel:'gpt-6-astra',criticReasoning:'ultra',speed:'Balanced'};
let edited={...saved};
const fixture=()=>locale==='uk'?fixtureUK:fixtureEN;
const isUK=()=>locale==='uk';
const label=(en,uk)=>isUK()?uk:en;
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function route(name){history.replaceState(null,'','#'+name);}
function updateState(id){state=id;$('#preview-state').value=id;}
function preserveDraft(){draft=$('#message').value;}
function setDraft(value){draft=value;$('#message').value=value;$('#draft-status').textContent=value?label('Draft in this tab · Not sent','Чернетка в цій вкладці · Не надіслано'):label('Sample only · Nothing is sent','Лише приклад · Нічого не надсилається');}
function pausePlayback(){clearTimeout(playTimer);playTimer=null;playing=false;}
function clearVoice(){clearInterval(voiceTimer);clearTimeout(transcribeTimer);voiceTimer=null;transcribeTimer=null;voiceStage=null;}
function closeDialog(){clearVoice();if($('#dialog').open)$('#dialog').close();}
function showDialog(title,body,{voice=false,focus=null}={}){
  if(!$('#dialog').open)modalReturn=document.activeElement;
  if(!voice)clearVoice();
  $('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;
  if(!$('#dialog').open)$('#dialog').showModal();
  if(focus&&$(focus))$(focus).focus();else $('#dialog-close').focus();
}
function openMenu(){preserveDraft();$('#mobile-menu').showModal();$('#menu-button').setAttribute('aria-expanded','true');$('#mobile-menu [data-page="'+(page==='new'?'discussion':page)+'"]')?.focus();}
function closeMenu(){if($('#mobile-menu').open)$('#mobile-menu').close();$('#menu-button').setAttribute('aria-expanded','false');$('#menu-button').focus();}
function navCurrent(){all('[data-page]').forEach(button=>{if(button.dataset.page===page||(page==='new'&&button.dataset.page==='discussion'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
function messageMarkup(message){const mark=message.kind==='owner'?'Y':message.role[0];return `<article class="message ${message.kind==='owner'?'owner-message':''} ${message.kind==='critic'?'critic-message':''}" aria-label="${esc(message.role)}${message.to?' to '+esc(message.to):''}"><div class="speaker"><span class="speaker-mark" aria-hidden="true">${mark}</span><strong>${esc(message.role)}</strong><time>${esc(message.time)}</time></div><div class="message-body">${message.to?`<span class="recipient">${label('To','До')} ${esc(message.to)}</span>`:''}${message.quote?`<blockquote>${esc(message.quote)}</blockquote>`:''}<p>${esc(message.body)}</p>${(message.sources||[]).map(id=>`<button class="citation" data-source="${id}">${id===1?'W3C':'MDN'} <span>${label('Source','Джерело')} ${id} ↗</span></button>`).join('')}${message.outcome?`<div class="inline-outcome"><button data-action="outcome">${label('Open the three-step plan','Відкрити план із трьох кроків')} <span aria-hidden="true">↗</span></button></div>`:''}${message.long?`<div class="long-note"><p>${label('What we still need to learn from members:','Що ще потрібно дізнатися від учасників:')}</p><ul><li>${label('Where does signing in interrupt the reading journey? Observe the task before asking for a preferred platform.','На якому кроці вхід перериває читання? Спочатку поспостерігаймо за завданням, а потім запитуймо про бажану платформу.')}</li><li>${label('What do members expect to have available without a connection? Distinguish a convenience from a task they cannot complete another way.','Що учасники очікують мати без доступу до мережі? Відокреммо зручність від завдання, яке інакше неможливо виконати.')}</li><li>${label('Which support burden can the team sustain? Include releases, browser compatibility, content updates and recovery from failed downloads in the test.','Який обсяг підтримки витримає команда? Врахуймо оновлення, сумісність браузерів, зміну вмісту та відновлення після невдалого завантаження.')}</li></ul><p>${label('Keep the original proposal open to revision. Better touch controls can make a reading flow easier; they cannot establish the business case for a native app. The member test needs both a clear task and an observation of whether the task succeeds.','Залишмо початкову пропозицію відкритою до перегляду. Зручніші зони натискання можуть поліпшити читання, але не доводять бізнесової доцільності окремого застосунку. Потрібні чітке завдання та спостереження, чи вдається його виконати.')}</p></div>`:''}</div></article>`;}
function renderThread(){
  const messages=empty?[]:fixture().slice(0,shown).map((m,index)=>({...m,long:longContent&&index===5}));
  $('#thread').innerHTML=[...messages,...extraMessages].map(messageMarkup).join('');
  $('#message-count').textContent=messages.length+extraMessages.length;
  $('#empty-discussion').hidden=!empty||extraMessages.length>0;
  $('#empty-discussion').innerHTML=`<div class="empty-block"><p class="eyebrow">${label('New conversation','Нова розмова')}</p><h2>${label('What are you working through?','Яке питання розглянемо?')}</h2><p>${label('Describe the situation and the decision you need to make. Type, attach a file, or use voice input.','Опишіть ситуацію та рішення, яке потрібно ухвалити. Напишіть, додайте файл або скористайтеся голосовим введенням.')}</p></div>`;
}
function sourceMarkup(source,detail=false){return `<article class="source-card"><p class="eyebrow">${source.id.toString().padStart(2,'0')} / ${esc(source.publisher)}</p><h3>${esc(source.title)}</h3><p>${esc(source.claim)}</p><p class="source-limit"><strong>Limit:</strong> ${esc(source.limit)}</p><p class="source-limit">Sample reference · No live research run.<br>Retrieval time and publication date: unavailable in this fixture.</p>${!detail?`<button data-source="${source.id}">Source detail</button>`:''}<a href="${source.url}" target="_blank" rel="noopener noreferrer">Open original <span aria-hidden="true">↗</span></a></article>`;}
function renderSources(unavailable=false){$('#panel-sources').innerHTML=`${unavailable?'<div class="notice error"><strong>Source unavailable</strong><p>The offline-reading claim has not been checked. The discussion and known reference remain here.</p><button data-action="retry-sources">Retry source check</button></div>':''}<div class="source-list">${sources.map(s=>sourceMarkup(s)).join('')}</div>`;}
function renderOutcome(provisional=false){$('#panel-outcome').innerHTML=`<div class="outcome-card"><p class="eyebrow">${label(provisional?'Provisional · Evidence missing':'The recommendation',''+(provisional?'Попередньо · Бракує доказів':'Рекомендація'))}</p><h2>${label('Test the mobile journey.<br>Keep the app decision open.','Перевірте мобільний шлях.<br>Залиште вибір платформи відкритим.')}</h2><p>${label(provisional?'The team cannot settle the platform choice until essential offline needs have been checked. Use the following test to resolve that uncertainty.':'Start with one improved mobile web journey. It is a bounded way to learn what members need before adding another product to support.',provisional?'Команда не може визначитися з платформою, доки не перевірить важливі потреби роботи без мережі. Ця перевірка допоможе зняти невизначеність.':'Почніть з одного поліпшеного мобільного шляху на сайті. Це обмежена перевірка потреб учасників перед запуском ще одного продукту.')}</p><ol class="action-list"><li><div><strong>${label('Improve one complete reading journey','Поліпшіть один повний шлях до читання')}</strong><p>${label('Product owner · This week · Sign in, find a useful article, and finish reading on a phone.','Власник продукту · Цього тижня · Увійти, знайти корисну статтю та прочитати її з телефона.')}</p></div></li><li><div><strong>${label('Observe members using it','Поспостерігайте за учасниками')}</strong><p>${label('Product owner · After the prototype is ready · Record where members get stuck and when connectivity prevents the task.','Власник продукту · Після підготовки прототипу · Зафіксувати труднощі та випадки, коли відсутність зв’язку заважає завданню.')}</p></div></li><li><div><strong>${label('Revisit the platform choice','Поверніться до вибору платформи')}</strong><p>${label('Owner and Operations · After the test · Compare task completion and support needs. Reconsider an app if an essential offline task still fails.','Власник і Operations Consultant · Після перевірки · Порівняти успішність завдань та обсяг підтримки. Переглянути рішення, якщо важливе завдання без мережі досі не вдається виконати.')}</p></div></li></ol><p class="risk-note"><strong>${label('Main uncertainty:','Головна невизначеність:')}</strong> ${label('How much offline reading matters. Platform capability is not proof that the member journey works.','Наскільки важливе читання без мережі. Можливості платформи не доводять, що шлях учасника працює.')}</p><button class="primary" data-action="discussion">${label('Continue the discussion','Продовжити обговорення')} <span aria-hidden="true">↗</span></button></div>`;}
function showView(name,focus=false){view=name;all('[data-view]').forEach(button=>{const active=button.dataset.view===name;button.setAttribute('aria-selected',active);button.tabIndex=active?0:-1;});['discussion','outcome','sources'].forEach(id=>$('#panel-'+id).hidden=id!==name);route(name);if(focus)$('#tab-'+name).focus();}
function renderTopic(){
  $('#topic-title').innerHTML=empty?label('New<br> <span>conversation.</span>','Нова<br> <span>розмова.</span>'):label('A better<br> mobile<br> <span>experience.</span>','Зручніший<br> мобільний<br> <span>досвід.</span>');
  $('#topic-kicker').textContent=label(empty?'New conversation':'Product decision',empty?'Нова розмова':'Продуктове рішення');
  $('#topic-description').innerHTML=empty?label('Start with the situation.<br> We’ll work through the decision.','Почніть із ситуації.<br> Розглянемо рішення разом.'):label('A native app or a better website?<br> One decision. Four perspectives.','Мобільний застосунок чи кращий сайт?<br> Одне рішення. Чотири погляди.');
  $('#record-status').textContent=empty?label('Draft · Not sent','Чернетка · Не надіслано'):label('Complete · One assumption to test','Завершено · Одне припущення для перевірки');
  $('#message-label').textContent=label(empty?'Describe your situation':'Add your perspective',empty?'Опишіть ситуацію':'Додайте свій погляд');
  $('#message').placeholder=label('Add context, ask a question, challenge a claim…','Додайте контекст, поставте запитання, перевірте твердження…');
}
function showWorkspace(){page='discussion';$('#workspace').hidden=false;$('#page-surface').hidden=true;$('#notice').hidden=true;renderTopic();renderThread();renderSources();renderOutcome();showView('discussion');setDraft(draft);navCurrent();}
function notice(title,body,action,button){$('#notice').innerHTML=`<strong>${esc(title)}</strong><p>${esc(body)}</p>${action?`<button data-action="${action}">${esc(button)}</button>`:''}`;$('#notice').hidden=false;}
function runUI(status){$('#run-controls').hidden=false;$('#run-status').textContent=status;$('#stop-button').hidden=!playing;$('#continue-button').hidden=playing;}
function startReplay(resume=false){pausePlayback();empty=false;deleted=false;extraMessages=[];if(!resume)shown=1;showWorkspace();playing=true;updateState('ST-09');runUI('Playing the fictional discussion');$('#record-status').textContent='Active · Sample playback';const next=()=>{shown++;renderThread();if(shown<8)playTimer=setTimeout(next,1500);else{pausePlayback();$('#run-controls').hidden=true;$('#record-status').textContent=label('Complete · One assumption to test','Завершено · Одне припущення для перевірки');updateState('ST-10');}};if(shown<8)playTimer=setTimeout(next,1500);else{pausePlayback();$('#run-controls').hidden=true;}};
function stopReplay(){pausePlayback();updateState('ST-11');runUI('Stopped · Confirmed example messages kept');$('#record-status').textContent='Stopped · Continue when ready';}
function showPage(title,description,body){$('#workspace').hidden=true;$('#page-surface').hidden=false;$('#page-surface').innerHTML=`<div class="page-layout"><header class="page-intro"><p class="eyebrow">Personal AI Consulting Group</p><h1>${esc(title)}</h1><p>${esc(description)}</p>${page==='settings'?'<div class="saved-info"><strong>Active example · Unchanged</strong>Head & specialists: Astra · Extra high (xhigh)<br>Critic: Codex · Astra · Ultra (ultra)<br>Conversation pace: Balanced</div>':''}</header><div class="page-main">${body}</div></div>`;navCurrent();route(page);}
function renderHistory(mode='populated'){page='history';showPage('Conversations','Return to the full discussion, its sources and the decision.',mode==='unavailable'?'<div class="empty-block"><h2>History unavailable</h2><p>Your example record is preserved. This preview simulates a failed history request.</p><button class="primary" data-action="retry-history">Try again</button></div>':(deleted||mode==='empty')?'<div class="empty-block"><h2>No conversations yet.</h2><p>Start with a question or explore the fictional discussion.</p><button class="primary" data-page="new">New conversation</button> <button data-action="restore-example">Load example</button></div>':`<article class="history-card"><p class="eyebrow">Today · Fictional example</p><button class="history-open" data-action="open-record"><h2>A better mobile experience.</h2><p>Native app or a better website? One assumption remains to test.</p></button><p>8 contributions · 4 AI roles · 2 reference links</p><div class="history-controls"><button data-action="export">Export example</button><button class="danger" data-action="delete">Delete conversation</button></div></article>`);}
function options(values,current,labelMap={}){return values.map(value=>`<option value="${esc(value)}"${value===current?' selected':''}>${esc(labelMap[value]||value)}</option>`).join('');}
function modelOptions(current){return catalog.models.map(model=>`<option value="${model.id}"${model.id===current?' selected':''}>${model.name}</option>`).join('');}
function reasoningOptions(model,current){const efforts=catalog.models.find(item=>item.id===model)?.efforts||[];return `<option value=""${!efforts.includes(current)?' selected':''}>Choose reasoning strength</option>`+options(efforts,current,effortLabels);}
function renderSettings(mode='saved'){
  page='settings';edited={...saved};
  if(mode==='edited')edited.speed=saved.speed==='Balanced'?'Thorough':'Balanced';
  if(mode==='invalid'){edited.criticModel='gpt-5.5';edited.criticReasoning='';}
  if(mode==='unavailable')edited.criticProvider='claude';
  showPage('Settings','Choose how the next conversation works. Active work keeps the settings it started with.',`<form id="settings-form"><fieldset class="settings-block"><legend>Head & specialists</legend><p class="section-note">Codex · One selection for the consulting team</p><div class="fields"><label class="field" for="settings-head-model">Model<select id="settings-head-model">${modelOptions(edited.headModel)}</select></label><label class="field" for="settings-head-reasoning">Reasoning strength<select id="settings-head-reasoning" aria-describedby="head-error">${reasoningOptions(edited.headModel,edited.headReasoning)}</select><span id="head-error" class="field-error" hidden></span></label></div></fieldset><fieldset class="settings-block"><legend>Critic</legend><p class="section-note">An independent perspective on the recommendation</p><div class="fields"><label class="field field-wide" for="settings-critic-provider">Provider<select id="settings-critic-provider">${options(['codex','claude'],edited.criticProvider,{codex:'Codex',claude:'Claude'})}</select></label><label class="field" for="settings-critic-model">Model<select id="settings-critic-model">${modelOptions(edited.criticModel)}</select></label><label class="field" for="settings-critic-reasoning">Reasoning strength<select id="settings-critic-reasoning" aria-describedby="critic-error">${reasoningOptions(edited.criticModel,edited.criticReasoning)}</select><span id="critic-error" class="field-error" hidden></span></label><div id="catalog-notice" class="notice field-wide" hidden></div></div></fieldset><fieldset class="settings-block"><legend>Conversation pace</legend><p class="section-note">How much parallel specialist work to allow</p><label class="field" for="settings-speed">Pace<select id="settings-speed">${options(['Fast','Balanced','Thorough'],edited.speed)}</select></label><p class="field-help">Fast: up to 2 specialists · Balanced: 3 · Thorough: 5</p></fieldset><section class="settings-block"><h3>Usage & account</h3><p class="section-note">Usage and reset time are unavailable in this preview.</p><p class="section-note">Example catalog: local Codex model list observed 13 September 2026. This does not verify deployed settings or model access.</p><div class="account-row"><p>Manage your signed-in devices.</p><button type="button" data-action="sessions">Manage sessions</button></div><div class="account-row"><p>Sign out clears the local unsent draft.</p><button type="button" data-action="signout">Sign out</button></div></section><p id="settings-feedback" class="field-help" role="status">${mode==='edited'?'Unsaved changes.':mode==='invalid'?'Ultra is not supported by GPT-5.5. Choose a supported strength.':'Saved settings shown. Changes apply to the next sample only.'}</p><div class="settings-actions"><button id="settings-cancel" type="button">Cancel</button><button id="settings-save" class="primary" type="submit">Save settings <span aria-hidden="true">↗</span></button></div></form>`);
  updateCriticProvider();validateSettings();
}
function updateCriticProvider(){
  const unavailable=edited.criticProvider==='claude';
  const model=$('#settings-critic-model'),reasoning=$('#settings-critic-reasoning');
  model.disabled=unavailable;reasoning.disabled=unavailable;
  model.innerHTML=unavailable?'<option value="">Claude catalog unavailable</option>':modelOptions(edited.criticModel);
  reasoning.innerHTML=unavailable?'<option value="">Reasoning catalog unavailable</option>':reasoningOptions(edited.criticModel,edited.criticReasoning);
  $('#catalog-notice').hidden=!unavailable;
  $('#catalog-notice').innerHTML='<strong>Claude catalog unavailable</strong><p>The inactive saved Claude model and supported reasoning are unknown. Your saved Codex selection is preserved.</p><button type="button" data-action="return-codex">Use Codex</button>';
}
function validateSettings(){
  if(!$('#settings-form'))return false;
  const headValid=catalog.models.find(m=>m.id===edited.headModel)?.efforts.includes(edited.headReasoning);
  const criticValid=edited.criticProvider==='codex'&&catalog.models.find(m=>m.id===edited.criticModel)?.efforts.includes(edited.criticReasoning);
  $('#head-error').hidden=!!headValid;$('#head-error').textContent='Choose a supported reasoning strength. No replacement was selected.';
  $('#critic-error').hidden=!!criticValid||edited.criticProvider==='claude';$('#critic-error').textContent='Choose a supported reasoning strength. No replacement was selected.';
  $('#settings-head-reasoning').setAttribute('aria-invalid',String(!headValid));$('#settings-critic-reasoning').setAttribute('aria-invalid',String(!criticValid));
  $('#settings-save').disabled=!(headValid&&criticValid);
  return headValid&&criticValid;
}
function showLogin(mode='signed-out'){
  page='login';$('#workspace').hidden=true;$('#page-surface').hidden=false;navCurrent();route('login');
  const error=mode==='denied'?'<div class="notice error"><strong>Sign-in was not completed.</strong><p>No account access was granted. Try again when you’re ready.</p></div>':mode==='expired'?'<div class="notice"><strong>Your app session expired.</strong><p>Sign in again to return to your conversation. Your unsent draft remains in this tab.</p></div>':'';
  $('#page-surface').innerHTML=`<div class="login-layout"><div class="login-identity"><div><p class="eyebrow">Personal AI Consulting Group</p><h1>Your next<br>decision.</h1><p>A focused discussion with consultants and Critic, informed by evidence.</p></div><div class="geometry" aria-hidden="true"><span></span><span></span></div></div><div class="login-form"><h2>${mode==='consent'?'Before you begin.':'Sign in.'}</h2>${mode==='consent'?'<p>Your selected AI providers process the content you choose to share. Conversations are private and retained until you delete them.</p><p>Keep passwords and sensitive records out of the discussion. Public-web research uses minimized queries.</p><label class="consent-label"><input type="checkbox" id="processing-consent"><span>I agree to this processing for my conversations.</span></label><button class="primary" id="consent-continue" data-action="consent" disabled>Open workspace <span aria-hidden="true">↗</span></button><button data-action="consent-cancel">Cancel</button><p class="voice-disclosure">Design preview only. This is simulated consent; nothing is transmitted.</p>':`${error}<p>Continue with the Google account used for this private workspace.</p><button class="google-button" data-action="signin"><span class="google-mark" aria-hidden="true">G</span> Continue with Google</button><p class="voice-disclosure">Design preview · Google sign-in is simulated. No account is accessed.</p>`}</div></div>`;
}
function voiceDialog(stage){
  clearInterval(voiceTimer);clearTimeout(transcribeTimer);voiceTimer=null;transcribeTimer=null;voiceStage=stage;
  const disclosure='<p class="voice-disclosure">Sample voice flow · No microphone access, audio capture or transcription service. Existing typed text is preserved.</p>';
  const cancel='<button data-action="voice-cancel">Cancel</button>';
  const errors={denied:['Microphone permission denied.','You can try the sample again or keep typing. Your draft is still here.'],missing:['No microphone available.','Try another microphone in the live product. You can continue typing now.'],interrupted:['Recording interrupted.','The sample recording has stopped. Your typed draft has not changed.'],failed:['Transcription failed.','No transcript was added. Retry the sample or keep typing.']};
  if(errors[stage]){const [title,body]=errors[stage];showDialog(title,`<p>${body}</p><div class="dialog-actions"><button data-action="voice-type">Type instead</button><button class="primary" data-action="voice-retry">Retry</button></div>${disclosure}`,{voice:true});return;}
  if(stage==='permission'){showDialog('Voice input.',`<p>Start recording, then review and edit the transcript before sending.</p><div class="voice-panel"><p class="recording-label">Microphone permission · Simulation</p><p>No browser permission will be requested.</p></div><div class="dialog-actions">${cancel}<button class="primary" data-action="voice-start">Start recording</button></div>${disclosure}`,{voice:true});return;}
  if(stage==='recording'){
    voiceSeconds=0;
    showDialog('Recording.',`<div class="voice-panel"><p class="recording-label">Recording · Sample</p><div id="voice-timer" class="voice-timer" role="timer" aria-label="Recording duration">00:00</div><div class="waveform" aria-hidden="true">${'<span></span>'.repeat(24)}</div><p>Stop when you’re ready to review.</p></div><div class="dialog-actions">${cancel}<button class="primary" data-action="voice-stop">Stop recording</button></div>${disclosure}`,{voice:true});
    voiceTimer=setInterval(()=>{voiceSeconds++;if($('#voice-timer'))$('#voice-timer').textContent='00:'+String(voiceSeconds).padStart(2,'0');if(voiceSeconds>=30)voiceDialog('transcribing');},1000);return;
  }
  if(stage==='transcribing'){
    showDialog('Transcribing.',`<div class="voice-panel"><p class="recording-label" role="status">Preparing the sample transcript…</p><p>The recording has stopped.</p></div><div class="dialog-actions">${cancel}</div>${disclosure}`,{voice:true});
    transcribeTimer=setTimeout(()=>{updateState('ST-29');voiceDialog('transcript');},1200);return;
  }
  showDialog('Review your words.',`<p>The sample transcript is editable. Using it adds text to your draft; it does not send a message.</p><label class="transcript-label" for="voice-transcript">Transcript</label><textarea id="voice-transcript" rows="5">${esc(label('How should we test offline reading with members before deciding whether we need a native app?','Як нам перевірити читання без інтернету з учасниками, перш ніж вирішувати, чи потрібен окремий застосунок?'))}</textarea><div class="dialog-actions">${cancel}<button class="primary" data-action="voice-use">Use transcript</button></div>${disclosure}`,{voice:true,focus:'#voice-transcript'});
}
function sessionsDialog(){showDialog('Your sessions.',`<p>Example sessions only. Account access is not checked in this preview.</p><div class="session-row"><div>This browser<small>Current sample session</small></div><span class="session-badge">Current</span></div>${revoked?'<p>No other example sessions remain.</p>':'<div class="session-row"><div>Phone browser<small>Another example session</small></div><span class="session-badge">Example</span></div>'}<div class="dialog-actions"><button data-action="close">Done</button>${!revoked?'<button class="primary" data-action="sessions-confirm">Sign out other sessions</button>':''}</div>`);}
function deleteDialog(){showDialog('Delete this conversation?',`<p><strong>A better mobile experience</strong></p><p>This removes the fictional record and its sample attachments from this preview. No server data exists here.</p><div class="dialog-actions"><button data-action="close">Keep conversation</button><button class="primary" data-action="confirm-delete">Delete conversation</button></div>`);}
function exportExample(){
  if(deleted){toast('The example was deleted. There is no current record to export.');return;}
  const text='# Design preview — fictional example\n\nNo live consultation or current research is represented.\n\n'+fixture().map(message=>`## ${message.role}${message.to?' → '+message.to:''} · ${message.time}\n\n${message.quote?'> '+message.quote+'\n\n':''}${message.body}`).join('\n\n')+'\n\n## Sources\n\n'+sources.map(source=>`- ${source.title}: ${source.url}\n  Claim: ${source.claim}\n  Limit: ${source.limit}`).join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='prism-fictional-consultation.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Fictional example exported. Your unsent draft was excluded.');
}
function renderAttachments(){$('#attachments').innerHTML=attachments.map((file,index)=>`<button type="button" data-remove-attachment="${index}" aria-label="Remove ${esc(file.name)}">${esc(file.name)} <span aria-hidden="true">×</span></button>`).join('');}
function statePreview(id){
  preserveDraft();pausePlayback();closeDialog();if($('#mobile-menu').open)closeMenu();$('#run-controls').hidden=true;longContent=false;extraMessages=[];empty=false;shown=8;deleted=false;updateState(id);
  const number=Number(id.slice(3));
  if(number<=4){showLogin(['signed-out','consent','denied','expired'][number-1]);return;}
  if(number>=18&&number<=20){renderHistory(['populated','empty','unavailable'][number-18]);return;}
  if(number>=21&&number<=25){renderSettings(['saved','edited','invalid','unavailable','saved'][number-21]);if(number===25)sessionsDialog();return;}
  showWorkspace();
  if(number>=26&&number<=33){voiceDialog(['permission','recording','transcribing','transcript','denied','missing','interrupted','failed'][number-26]);route('voice');return;}
  if(number===5||number===6){empty=true;renderTopic();renderThread();if(number===6&&!draft)setDraft(label('We need to understand what members struggle with on their phones.','Нам потрібно зрозуміти, з чим учасникам незручно працювати з телефона.'));}
  if(number===7)notice('This file cannot be attached.','example.exe is not a supported image or PDF. Your draft and accepted filenames are kept.','attach','Choose another file');
  if(number===8){shown=1;renderThread();$('#thread').insertAdjacentHTML('beforeend',messageMarkup({role:'Head Consultant',kind:'head',time:'10:41',body:label('What is the one thing members most need to do on their phones? If we don’t know yet, we can start by observing the path from sign-in to reading.','Яке одне завдання учасникам найважливіше виконувати з телефона? Якщо ми ще не знаємо, почнімо зі спостереження за шляхом від входу до читання.')}));$('#message-count').textContent='2';$('#record-status').textContent=label('One question before we proceed','Одне запитання перед початком');}
  if(number===9){startReplay();return;}
  if(number===10){deleted=false;}
  if(number===11){shown=4;renderThread();stopReplay();}
  const errors={12:['You’re offline.','Your conversation and typed draft are preserved. Reconnect, then continue.','recover','Try again'],13:['ChatGPT authorization expired.','This concerns the selected provider. Your app session, discussion and draft are preserved.','provider-auth','Reconnect ChatGPT'],14:['ChatGPT usage limit reached.','Reset time is unavailable. Your current conversation and draft are preserved.','quota-check','Check again'],15:['The source could not be checked.','Offline-reading requirements remain unverified. Treat the platform recommendation as provisional.','retry-research','Retry research'],16:['The discussion could not continue.','The saved example and your draft remain intact. Retry from this point.','recover','Try again']};
  if(errors[number]){notice(...errors[number]);$('#record-status').textContent=number===15?'Provisional · Source unverified':'Paused · Conversation preserved';}
  if(number===17){longContent=true;renderThread();}
  if(number>=34&&number<=36){renderSources(number===36);showView('sources');if(number===35)showDialog('Source detail.',sourceMarkup(sources[1],true));}
  if(number===37||number===38){renderOutcome(number===38);showView('outcome');}
  if(number===39)deleteDialog();
  if(number===40){deleted=true;empty=true;renderHistory('empty');}
  if(number===41)showDialog('Export the example.',`<p>A better mobile experience</p><p>The complete fictional discussion and references will be exported. Your unsent draft and private data are excluded.</p><div class="dialog-actions"><button data-action="close">Cancel</button><button class="primary" data-action="export">Export example</button></div>`);
  if(number===42)showDialog('Export failed.',`<p>The example record is still here. No partial export is represented as complete.</p><div class="dialog-actions"><button data-action="close">Back to discussion</button><button class="primary" data-action="retry-export">Try again</button></div>`);
  if(number===44){openMenu();route('menu');}
}
function navigate(destination){
  preserveDraft();if(playing)stopReplay();closeDialog();if($('#mobile-menu').open)closeMenu();
  if(destination==='settings'){updateState('ST-21');renderSettings();}
  else if(destination==='history'){updateState(deleted?'ST-19':'ST-18');renderHistory();}
  else if(destination==='new'){pausePlayback();empty=true;shown=0;extraMessages=[];$('#run-controls').hidden=true;updateState('ST-05');showWorkspace();page='new';navCurrent();route('new');$('#message').focus();}
  else{showWorkspace();updateState(empty?'ST-05':'ST-10');}
  window.scrollTo({top:0,behavior:'instant'});
}
const actions={
  signin(){showLogin(consented?'signed-out':'consent');updateState('ST-02');if(consented)navigate('new');},
  consent(){if(!$('#processing-consent')?.checked)return;consented=true;navigate('new');},
  'consent-cancel'(){updateState('ST-01');showLogin();},
  signout(){preserveDraft();pausePlayback();clearVoice();draft='';attachments=[];setDraft('');renderAttachments();closeDialog();updateState('ST-01');showLogin();toast('Signed out of the preview. The local draft was cleared.');},
  attach(){$('#attachment-input').click();},
  replay(){preserveDraft();startReplay();},
  stop:stopReplay,
  continue(){startReplay(true);},
  discussion(){showView('discussion');},
  outcome(){renderOutcome();showView('outcome');},
  'record-options'(){showDialog('Conversation actions.',`<p>A better mobile experience · Fictional example</p><div class="dialog-menu"><button data-action="export">Export example</button><button class="danger" data-action="delete">Delete conversation</button><button data-action="close">Back to discussion</button></div>`);},
  close:closeDialog,
  'close-menu':closeMenu,
  delete:deleteDialog,
  'confirm-delete'(){pausePlayback();deleted=true;empty=true;extraMessages=[];attachments=[];draft='';setDraft('');renderAttachments();closeDialog();$('#run-controls').hidden=true;updateState('ST-40');renderHistory('empty');toast('The fictional conversation was deleted from this preview.');},
  export:exportExample,
  'retry-export'(){closeDialog();exportExample();},
  'open-record'(){empty=false;shown=8;extraMessages=[];navigate('discussion');},
  'restore-example'(){deleted=false;empty=false;shown=8;extraMessages=[];navigate('discussion');},
  'retry-history'(){updateState(deleted?'ST-19':'ST-18');renderHistory();toast('Example history restored. No service was contacted.');},
  recover(){preserveDraft();showWorkspace();updateState('ST-10');toast('Preview recovery complete. Your draft and example are preserved.');},
  'quota-check'(){toast('Usage is still unavailable in this preview. No provider was contacted.');},
  'retry-research'(){showWorkspace();updateState('ST-10');toast('Sample recovery only. No fresh research is claimed.');},
  'retry-sources'(){renderSources();showView('sources');updateState('ST-34');toast('Known sample references restored. No fresh retrieval occurred.');},
  'provider-auth'(){showDialog('Reconnect ChatGPT.',`<p>The live app would reopen the selected provider’s authorization and return to the preserved discussion.</p><p>This preview does not access or change any provider account.</p><div class="dialog-actions"><button data-action="close">Cancel</button><button class="primary" data-action="provider-return">Preview successful return</button></div>`);},
  'provider-return'(){closeDialog();actions.recover();},
  'return-codex'(){edited.criticProvider='codex';$('#settings-critic-provider').value='codex';updateCriticProvider();validateSettings();$('#settings-feedback').textContent='Codex selected. Review and save for the next sample.';},
  sessions:sessionsDialog,
  'sessions-confirm'(){showDialog('Sign out other sessions?',`<p>This keeps the current browser signed in and revokes the other example session. Reverify your identity before continuing.</p><div class="dialog-actions"><button data-action="sessions">Keep sessions</button><button class="primary" data-action="sessions-reverify">Reverify with Google</button></div>`);},
  'sessions-reverify'(){showDialog('Verify your identity.',`<p>Google reauthentication is simulated here. No Google account is accessed.</p><div class="dialog-actions"><button data-action="sessions">Cancel</button><button class="primary" data-action="sessions-revoked">Simulate verification & sign out</button></div>`);},
  'sessions-revoked'(){revoked=true;sessionsDialog();toast('The other example session was signed out after simulated verification.');},
  'voice-start'(){updateState('ST-27');voiceDialog('recording');},
  'voice-stop'(){updateState('ST-28');voiceDialog('transcribing');},
  'voice-retry'(){updateState('ST-26');voiceDialog('permission');},
  'voice-cancel'(){modalReturn=$('#message');closeDialog();$('#message').focus();toast('Voice sample cancelled. Your typed draft is unchanged.');},
  'voice-type'(){modalReturn=$('#message');closeDialog();showView('discussion');$('#message').focus();},
  'voice-use'(){const transcript=$('#voice-transcript').value.trim();if(!transcript){$('#voice-transcript').focus();toast('Add some transcript text or cancel.');return;}const original=draft.trimEnd();setDraft(original+(original?'\n\n':'')+transcript);modalReturn=$('#message');closeDialog();showView('discussion');$('#message').focus();toast('Transcript added to your draft. Review it before Send.');}
};
document.addEventListener('click',event=>{
  const destination=event.target.closest('[data-page]');if(destination){navigate(destination.dataset.page);return;}
  const action=event.target.closest('[data-action]');if(action){actions[action.dataset.action]?.();return;}
  const source=event.target.closest('[data-source]');if(source){const item=sources.find(s=>s.id===Number(source.dataset.source));showDialog('Source detail.',sourceMarkup(item,true));return;}
  const remove=event.target.closest('[data-remove-attachment]');if(remove){attachments.splice(Number(remove.dataset.removeAttachment),1);renderAttachments();}
});
document.addEventListener('change',event=>{
  const id=event.target.id;
  if(id==='processing-consent')$('#consent-continue').disabled=!event.target.checked;
  const fields={'settings-head-model':'headModel','settings-head-reasoning':'headReasoning','settings-critic-provider':'criticProvider','settings-critic-model':'criticModel','settings-critic-reasoning':'criticReasoning','settings-speed':'speed'};
  if(!fields[id])return;
  edited[fields[id]]=event.target.value;
  if(id==='settings-head-model'){const model=catalog.models.find(m=>m.id===edited.headModel);if(!model.efforts.includes(edited.headReasoning))edited.headReasoning='';$('#settings-head-reasoning').innerHTML=reasoningOptions(edited.headModel,edited.headReasoning);}
  if(id==='settings-critic-model'){const model=catalog.models.find(m=>m.id===edited.criticModel);if(!model.efforts.includes(edited.criticReasoning))edited.criticReasoning='';$('#settings-critic-reasoning').innerHTML=reasoningOptions(edited.criticModel,edited.criticReasoning);}
  if(id==='settings-critic-provider')updateCriticProvider();
  validateSettings();$('#settings-feedback').textContent='Unsaved changes. Active example settings stay unchanged.';
});
document.addEventListener('submit',event=>{
  if(event.target.id==='settings-form'){event.preventDefault();if(!validateSettings())return;saved={...edited};$('#settings-feedback').textContent='Saved for the next sample. The active example is unchanged.';updateState('ST-21');toast('Settings saved in page memory for the next sample only.');}
});
document.addEventListener('click',event=>{if(event.target.closest('#settings-cancel')){renderSettings();updateState('ST-21');$('#settings-cancel').focus();toast('Changes cancelled. The saved settings are restored.');}});
$('#preview-state').innerHTML=stateLabels.map((text,index)=>`<option value="ST-${String(index+1).padStart(2,'0')}">ST-${String(index+1).padStart(2,'0')} · ${esc(text)}</option>`).join('');
$('#preview-state').addEventListener('change',event=>statePreview(event.target.value));
$('#preview-locale').addEventListener('change',event=>{preserveDraft();locale=event.target.value;$('#thread').lang=locale;statePreview(state);});
$('#menu-button').addEventListener('click',openMenu);
$('#dialog-close').addEventListener('click',closeDialog);
$('#dialog').addEventListener('cancel',clearVoice);
$('#dialog').addEventListener('close',()=>{clearVoice();if(modalReturn?.isConnected&&!$('#dialog').contains(modalReturn))modalReturn.focus();});
$('#mobile-menu').addEventListener('close',()=>{$('#menu-button').setAttribute('aria-expanded','false');if(getComputedStyle($('#menu-button')).display!=='none')$('#menu-button').focus();});
$('#voice-button').addEventListener('click',()=>{preserveDraft();updateState('ST-26');voiceDialog('permission');});
$('#message').addEventListener('input',()=>{preserveDraft();$('#draft-status').textContent=label('Draft in this tab · Not sent','Чернетка в цій вкладці · Не надіслано');});
$('#composer').addEventListener('submit',event=>{event.preventDefault();preserveDraft();if(!draft.trim()&&!attachments.length){toast('Write a message or add a supported filename first.');$('#message').focus();return;}$('#draft-status').textContent=label('Sample submission only · Draft kept · No AI call','Лише пробне надсилання · Чернетку збережено · Без виклику ШІ');toast(label('Sample Send acknowledged. Your draft is kept; no message was sent to an AI service.','Пробне надсилання підтверджено. Чернетка збережена; нічого не надіслано до ШІ.'));});
$('#attachment-input').addEventListener('change',event=>{let invalid=false;for(const file of event.target.files){if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>20*1024*1024){invalid=true;continue;}attachments.push({name:file.name});}renderAttachments();event.target.value='';if(invalid)notice('This file cannot be attached.','Choose a PNG, JPEG, WebP or PDF up to 20 MB. Accepted filenames and your draft are preserved.','attach','Choose another file');toast(invalid?'Unsupported file excluded. Accepted filenames stay in this tab.':'Filenames added. No file content was read or uploaded.');});
all('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
$('.view-tabs').addEventListener('keydown',event=>{const views=['discussion','outcome','sources'];let index=views.indexOf(view);if(event.key==='ArrowRight')index=(index+1)%3;else if(event.key==='ArrowLeft')index=(index+2)%3;else if(event.key==='Home')index=0;else if(event.key==='End')index=2;else return;event.preventDefault();showView(views[index],true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&voiceStage==='recording'){clearVoice();updateState('ST-32');voiceDialog('interrupted');}});
window.addEventListener('pagehide',()=>{pausePlayback();clearVoice();clearTimeout(toastTimer);});
statePreview('ST-10');
