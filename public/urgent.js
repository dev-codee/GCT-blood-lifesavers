const $=id=>document.getElementById(id);
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let requests=[];
const donorKey=localStorage.getItem('donor_access')||'';
const time=value=>value?new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
const link=r=>location.origin+'/urgent#request-'+r.id;
async function load(){
 $('refresh').disabled=true;$('requests').setAttribute('aria-busy','true');$('board-message').textContent='';
 try{const response=await fetch('/api/community',{headers:donorKey?{Authorization:'Bearer '+donorKey}:{},cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load requests.');requests=data.requests;render();}
 catch(error){$('board-message').textContent=error.message+' Use Refresh to try again.';$('requests').innerHTML='<div class="empty">Requests could not be updated.</div>';}
 finally{$('refresh').disabled=false;$('requests').setAttribute('aria-busy','false');}
}
function render(){
 const active=r=>RequestExpiry.effectiveStatus(r)==='open';
 const status=r=>RequestExpiry.effectiveStatus(r);
 $('open-count').textContent=requests.filter(active).length;
 const urgency={Critical:0,Urgent:1,Scheduled:2};
 const filtered=requests.filter(r=>(!$('blood').value||r.blood_group===$('blood').value)&&r.city.toLowerCase().includes($('city').value.trim().toLowerCase())&&($('status').value==='all'||status(r)===$('status').value)).sort((a,b)=>(urgency[a.urgency_level]??1)-(urgency[b.urgency_level]??1)||Date.parse(b.created_at)-Date.parse(a.created_at));
 $('result-count').textContent=`${filtered.length} request${filtered.length===1?'':'s'} shown · Critical requests first`;
 $('requests').innerHTML=filtered.map(r=>{
 const phone=String(r.contact_phone||'').replace(/[^+\d]/g,'');
 const s=status(r),isOpen=active(r);
 const responded=r.my_response&&!['withdrawn','declined'].includes(r.my_response.status);
 return `<article class="card" id="request-${escapeText(r.id)}"><div class="card-top"><div class="blood">${escapeText(r.blood_group)}</div><div><span class="badge ${isOpen?'':'closed'}">${escapeText(isOpen?r.urgency_level:s)}</span><p class="details">${escapeText(r.units)} unit(s) requested</p></div></div><h3>${escapeText(r.hospital_name)}</h3><p class="details">${escapeText(r.city)} · Patient: ${escapeText(r.patient_name)}</p><p class="details">${escapeText(r.notes||'Call the attendant to arrange a visit.')}</p><div class="progress"><span><b>${r.responded||0}</b> responses</span><span><b>${r.confirmed||0}</b> confirmed</span><span><b>${r.completed||0}</b> completed</span></div><p class="muted">Posted ${escapeText(time(r.created_at))}<br>${r.expires_at?'Expires '+escapeText(time(r.expires_at)):'Contact the attendant for the current deadline.'}${isOpen?`<br><span data-deadline="${RequestExpiry.deadline(r)}"></span>`:''}</p><small class="muted">Progress records donor responses, not blood units collected.</small>${r.my_response?`<p class="details">Your response: ${escapeText(r.my_response.status)}</p>`:''}<div class="actions">${isOpen?`<a class="button" href="tel:${escapeText(phone)}">Call ${escapeText(r.contact_name||'attendant')}</a>${donorKey?`<button data-action="respond" data-id="${escapeText(r.id)}" data-status="${responded?'withdrawn':'volunteered'}" ${['completed','declined'].includes(r.my_response?.status)?'disabled':''}>${responded?'Withdraw response':'I can help'}</button>`:'<a class="button secondary" href="/community.html">Sign in to volunteer</a>'}`:'<span class="muted">This request is closed.</span>'}<button data-action="share" data-id="${escapeText(r.id)}">Share link</button></div></article>`;
 }).join('')||'<div class="empty"><h3>No requests found</h3><p>Try another city, blood group or status.</p><button id="clear">Clear filters</button></div>';
}
$('refresh').onclick=load;
for(const id of ['blood','city','status'])$(id).addEventListener(id==='city'?'input':'change',render);
$('requests').onclick=async event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.id==='clear'){$('blood').value='';$('city').value='';$('status').value='open';return render();}
 const r=requests.find(r=>r.id===button.dataset.id);if(!r)return;
 button.disabled=true;
 try{
 if(button.dataset.action==='share'){
 const url=link(r);if(navigator.share)await navigator.share({title:'Blood request · UET-lifesavers',text:`${r.blood_group} blood requested at ${r.hospital_name}, ${r.city}. Check current status:`,url});else{await navigator.clipboard.writeText(url);$('board-message').textContent='Request link copied.';}
 }else{
 const response=await fetch('/api/community',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+donorKey},body:JSON.stringify({action:'respond',id:r.id,status:button.dataset.status})});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save response');await load();$('board-message').textContent='Response updated. Contact the attendant to coordinate.';
 }
 }catch(error){if(error.name!=='AbortError')$('board-message').textContent=error.message;}finally{button.disabled=false;}
};
$('request-form').onsubmit=async event=>{
 event.preventDefault();const form=event.target,button=form.querySelector('button[type=submit]');button.disabled=true;$('form-message').textContent='Publishing…';
 try{const response=await fetch('/api/emergency-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Could not publish request');form.reset();$('blood').value='';$('city').value='';$('status').value='open';await load();$('form-message').textContent='Request published. Share its link from the request card. Contact a coordinator when the need is met.';location.hash='request-'+data.requestId;document.getElementById('request-'+data.requestId)?.scrollIntoView();}
 catch(error){$('form-message').textContent=error.message;}finally{button.disabled=false;}
};
load().then(()=>{if(location.hash.startsWith('#request-')){$('status').value='all';render();document.getElementById(location.hash.slice(1))?.scrollIntoView();}});

let expirySnapshot='';
RequestExpiry.watch(()=>{const next=requests.map(r=>RequestExpiry.effectiveStatus(r)).join(',');if(next!==expirySnapshot){expirySnapshot=next;render();}document.querySelectorAll('[data-deadline]').forEach(el=>{const minutes=Math.max(0,Math.ceil((Number(el.dataset.deadline)-Date.now())/60000));el.textContent=minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m remaining`:`${minutes}m remaining`;});});
