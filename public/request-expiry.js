(function(root){
 const lifetime=48*60*60*1000;
 function deadline(request){const explicit=Date.parse(request.expires_at);if(Number.isFinite(explicit))return explicit;const created=Date.parse(request.created_at);return Number.isFinite(created)?created+lifetime:0;}
 function effectiveStatus(request,now=Date.now()){const end=deadline(request);return request.status==='open'&&end&&end<=now?'expired':request.status;}
 function watch(callback){let timer;const run=()=>{clearTimeout(timer);callback();timer=setTimeout(run,1000);};run();document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});}
 const api={deadline,effectiveStatus,watch};if(typeof module==='object'&&module.exports)module.exports=api;else root.RequestExpiry=api;
})(typeof window!=='undefined'?window:globalThis);
