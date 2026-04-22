/*
  FILE: js/api.js
  !! IMPORTANT: Change API_BASE before uploading to GitHub !!

  LOCAL XAMPP testing:
    const API_BASE = 'http://localhost/linkubuntu-api';

  INFINITYFREE live:
    const API_BASE = 'https://YOUR-SITE.infinityfreeapp.com/linkubuntu-api';
    Replace YOUR-SITE with your actual InfinityFree subdomain.
*/

const API_BASE = 'https://linkubuntu.ct.ws/linkubuntu-api'; // CHANGE THIS

async function api(method, path, body=null){
    const opts={method,headers:{'Content-Type':'application/json'}};
    if(body) opts.body=JSON.stringify(body);
    try{
        const r=await fetch(API_BASE+path,opts);
        return await r.json();
    }catch(e){
        console.error('API error',e);
        return {success:false,error:e.message};
    }
}
async function apiForm(path,fd){
    try{const r=await fetch(API_BASE+path,{method:'POST',body:fd});return await r.json();}
    catch(e){return {success:false,error:e.message};}
}

// CITIZENS
const getCitizen       = id    => api('GET',   `/citizen.php?id=${id}`);
const getAllCitizens   = ()    => api('GET',   '/citizen.php?all=1');
const addCitizen       = d     => api('POST',  '/citizen.php',d);
const updateCitizen    = (id,d)=> api('PUT',   `/citizen.php?id=${id}`,d);
const deleteCitizenById= id    => api('DELETE',`/citizen.php?id=${id}`);
const updateMedical    = (id,d)=> api('POST',  `/medical.php?id=${id}`,d);
async function uploadCitizenPhoto(id,file){
    const fd=new FormData(); fd.append('photo',file); fd.append('id_number',id);
    return apiForm('/upload_photo.php',fd);
}

// CONTACTS
const getContacts     = cid    => api('GET',   `/contacts.php?citizen_id=${cid}`);
const addContactAPI   = (cid,d)=> api('POST',  '/contacts.php',{...d,citizen_id:cid});
const removeContactAPI= id     => api('DELETE',`/contacts.php?id=${id}`);

// OTP
const sendOTPAPI    = phone      => api('POST','/otp.php?action=send',  {phone});
const verifyOTPAPI  = (phone,code)=> api('POST','/otp.php?action=verify',{phone,code});

// WEBAUTHN
async function enrolFingerprint(citizenId){
    const opts=await api('POST','/webauthn.php?action=register_challenge',{citizen_id:citizenId});
    if(!opts.success) throw new Error(opts.error);
    const cred=await navigator.credentials.create({publicKey:{
        challenge:b64url(opts.challenge), rp:opts.rp,
        user:{id:b64url(opts.user.id),name:opts.user.name,displayName:opts.user.displayName},
        pubKeyCredParams:opts.pubKeyCredParams,
        authenticatorSelection:opts.authenticatorSelection,
        timeout:opts.timeout
    }});
    return api('POST','/webauthn.php?action=register_complete',{
        citizen_id:citizenId,
        credential_id:buf2b64(cred.rawId),
        public_key:{id:cred.id,rawId:buf2b64(cred.rawId),
            response:{clientDataJSON:buf2b64(cred.response.clientDataJSON),attestationObject:buf2b64(cred.response.attestationObject)},
            type:cred.type},
        device_info:navigator.userAgent.substring(0,200)
    });
}

async function authenticateFingerprint(){
    const opts=await api('POST','/webauthn.php?action=auth_challenge',{});
    if(!opts.success) throw new Error(opts.error);
    const assertion=await navigator.credentials.get({publicKey:{
        challenge:b64url(opts.challenge), rpId:opts.rpId,
        allowCredentials:opts.allowCredentials.map(c=>({type:'public-key',id:b64url(c.id)})),
        userVerification:opts.userVerification, timeout:opts.timeout
    }});
    return api('POST','/webauthn.php?action=auth_complete',{
        session_id:opts.session_id,
        credential_id:buf2b64(assertion.rawId)
    });
}

// RESPONDERS
const getAllResponders = ()  => api('GET',   '/responders.php');
const addResponder    = d    => api('POST',  '/responders.php',d);
const deleteResponder = id   => api('DELETE',`/responders.php?id=${encodeURIComponent(id)}`);

// SMS
const sendSMSAPI     = (ph,msg)    => api('POST','/sms.php?action=send', {phone:ph,message:msg});
const sendBulkSMSAPI = (contacts,msg)=> api('POST','/sms.php?action=bulk',{contacts,message:msg});

// SCAN LOG
const saveScanLog = d => api('POST','/scan_log.php',d);
const getScanLogs = () => api('GET', '/scan_log.php');

// ADMIN
const verifyAdminPin = pin => api('POST','/admin.php',{pin});

// BASE64URL HELPERS
function b64url(str){
    const b64=str.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice(0,(4-str.length%4)%4);
    const bin=atob(b64); const buf=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i);
    return buf.buffer;
}
function buf2b64(buf){
    const bytes=new Uint8Array(buf); let bin='';
    for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// TOAST
function showToast(msg,type='info'){
    let t=document.getElementById('toast');
    if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);}
    const c={info:'#212121',success:'#1B5E20',error:'#B71C1C',warning:'#E65100'};
    t.style.background=c[type]||c.info;
    t.textContent=msg; t.classList.add('show');
    clearTimeout(t._to); t._to=setTimeout(()=>t.classList.remove('show'),3500);
}

// EXPOSE GLOBALLY
Object.assign(window,{
    getCitizen,getAllCitizens,addCitizen,updateCitizen,deleteCitizenById,uploadCitizenPhoto,updateMedical,
    getContacts,addContactAPI,removeContactAPI,
    sendOTPAPI,verifyOTPAPI,
    enrolFingerprint,authenticateFingerprint,
    getAllResponders,addResponder,deleteResponder,
    sendSMSAPI,sendBulkSMSAPI,
    saveScanLog,getScanLogs,
    verifyAdminPin,showToast,b64url,buf2b64
});
