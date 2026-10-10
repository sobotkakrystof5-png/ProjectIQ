// Widget pro cizí weby /embed/[slug].js (S11, plán „Jeden řádek pro cizí weby“).
//
// Čistý JavaScript bez frameworku, vykreslí se do shadow DOM (styly webu ho
// nerozbijí a on nerozbije web). Načte služby, kolonky a volné časy z GET
// /api/public/v1/schema a pošle poptávku na POST /api/public/v1/requests —
// obojí s veřejným klíčem; API ho přijme jen z povolené domény (Origin).
//
// Bezpečnost: texty z nastavení byznysu (názvy služeb, kolonek) i z API se do
// stránky dávají jen přes textContent, nikdy jako HTML. innerHTML jen pro
// náš statický styl. Hodnoty se do skriptu vkládají přes JSON s escapováním.
//
// Použití: <script src="https://zakaziq.cz/embed/<slug>.js" async></script>
//   data-mode="inline"  — formulář přímo na místě skriptu (jinak tlačítko)
//   data-label="…"      — text tlačítka

export type WidgetOptions = { apiOrigin: string; publicKey: string; businessName: string; accent: string | null }

/** JSON bezpečný uvnitř <script> i JS řetězce (U+2028/2029, </script>). */
function js(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029')
}

const STYLE = `
:host{all:initial;--n950:#0c1a36;--n700:ACCENT;--n800:ACCENT_DARK;--n100:#dce7f7;--n50:#eef2fb;--quiet:#4a5878;--danger:#b3261e;--ground:#f4f6fb;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--n950)}
*{box-sizing:border-box;font:inherit;color:inherit}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border:0;border-radius:999px;background:var(--n700);color:#fff;font-weight:600;font-size:15px;cursor:pointer}
.btn:hover{background:var(--n800)}.btn[disabled]{opacity:.55;cursor:default}
.ghost{background:transparent;color:var(--n700);padding:0 8px}.ghost:hover{background:var(--n50)}
.overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(12,26,54,.45);display:flex;align-items:flex-end;justify-content:center}
@media(min-width:640px){.overlay{align-items:center}}
.panel{background:#fff;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:24px 20px 28px;box-shadow:0 20px 60px rgba(12,26,54,.25)}
@media(min-width:640px){.panel{border-radius:24px}}
.inline{background:#fff;border:1px solid var(--n100);border-radius:24px;padding:24px 20px;max-width:520px}
.head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.15}
form{display:flex;flex-direction:column;gap:14px;margin:0}
label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:500}
.opt{font-weight:400;color:var(--quiet)}
input,select,textarea{width:100%;min-height:44px;padding:9px 13px;border:1px solid var(--n100);border-radius:12px;background:#fff;font-size:15px}
textarea{min-height:84px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:2px solid var(--n700);outline-offset:1px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.note{font-size:13px;color:var(--quiet);margin:0}
.err{background:rgba(179,38,30,.1);color:var(--danger);border-radius:14px;padding:10px 14px;font-size:14px;margin:0}
.ok{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.check{width:44px;height:44px;border-radius:999px;background:var(--n700);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.foot{font-size:12px;color:var(--quiet);margin-top:4px}
`

/** Zdroják widgetu pro jeden byznys. */
export function widgetScript(opts: WidgetOptions): string {
  const accent = opts.accent ?? '#23478b'
  const style = STYLE.replace('ACCENT_DARK', `color-mix(in srgb,${accent} 82%,#000)`).replace('ACCENT', accent)
  return `/* ZakazIQ widget — ${new Date().toISOString().slice(0, 10)} */
(function(){
"use strict";
var API=${js(opts.apiOrigin)},KEY=${js(opts.publicKey)},NAME=${js(opts.businessName)},CSS=${js(style)};
var me=document.currentScript;if(!me||!me.parentNode)return;
var mode=me.getAttribute("data-mode")==="inline"?"inline":"button";
var label=me.getAttribute("data-label")||"Objednat se";
var host=document.createElement("div");me.parentNode.insertBefore(host,me.nextSibling);
var root=host.attachShadow({mode:"open"});
var st=document.createElement("style");st.textContent=CSS;root.appendChild(st);
function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==="text")e.textContent=attrs[k];else if(k==="on")for(var ev in attrs.on)e.addEventListener(ev,attrs.on[ev]);else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c)e.appendChild(c)});return e}
function field(lbl,input,optional){var t=el("span",{text:lbl});if(optional)t.appendChild(el("span",{"class":"opt",text:" (nepovinné)"}));return el("label",null,[t,input])}
function url(path,q){return API+path+"?key="+encodeURIComponent(KEY)+(q||"")}
var schema=null,box=null,overlay=null;
function loadSchema(serviceId){return fetch(url("/api/public/v1/schema",serviceId?"&serviceId="+encodeURIComponent(serviceId):""),{credentials:"omit"}).then(function(r){return r.json()}).then(function(j){if(!j||!j.success)throw new Error(j&&j.error||"x");return j})}
function errorBox(text){return el("p",{"class":"err",role:"alert",text:text})}
function render(target){
  target.textContent="";
  var head=el("div",{"class":"head"},[el("h2",{text:NAME})]);
  if(mode==="button")head.appendChild(el("button",{type:"button","class":"btn ghost","aria-label":"Zavřít",text:"\\u2715",on:{click:close}}));
  target.appendChild(head);
  if(!schema){target.appendChild(el("p",{"class":"note",text:"Načítáme…"}));return}
  var form=el("form",{novalidate:""});
  var svc=null,day=null,time=null,fdate=null,ftime=null;
  if(schema.services.length){
    svc=el("select",{name:"serviceId"});svc.appendChild(el("option",{value:"",text:"Nevím, poradíte mi"}));
    schema.services.forEach(function(s){var o=el("option",{value:s.id,text:s.name});if(s.id===schema._service)o.selected=true;svc.appendChild(o)});
    svc.addEventListener("change",function(){if(schema.booking.mode!=="slots")return;loadSchema(svc.value).then(function(j){j._service=svc.value;schema=j;render(target)})});
    form.appendChild(field("Služba",svc));
  }
  var b=schema.booking;
  if(b.mode==="slots"){
    if(b.slots.length){
      day=el("select",{name:"day"});time=el("select",{name:"time"});
      day.appendChild(el("option",{value:"",text:"Vyberte den"}));
      b.slots.forEach(function(d,i){day.appendChild(el("option",{value:String(i),text:d.label}))});
      day.addEventListener("change",function(){time.textContent="";var d=b.slots[Number(day.value)];time.appendChild(el("option",{value:"",text:"Vyberte čas"}));if(d)d.times.forEach(function(t){time.appendChild(el("option",{value:t.start,text:t.time}))})});
      time.appendChild(el("option",{value:"",text:"Vyberte čas"}));
      form.appendChild(el("div",{"class":"row"},[field("Den",day,true),field("Čas",time,true)]));
    }else form.appendChild(el("p",{"class":"note",text:"Volný termín teď není. Napište nám a domluvíme ho."}));
  }else if(b.mode==="free"){
    fdate=el("input",{type:"date",name:"date"});ftime=el("select",{name:"time"});
    ftime.appendChild(el("option",{value:"",text:"Vyberte"}));
    for(var m=7*60;m<=20*60;m+=30){var hh=Math.floor(m/60),mm=m%60,v=(hh<10?"0":"")+hh+":"+(mm?"30":"00");ftime.appendChild(el("option",{value:v,text:hh+":"+(mm?"30":"00")}))}
    form.appendChild(el("div",{"class":"row"},[field("Den",fdate,true),field("Čas",ftime,true)]));
    form.appendChild(el("p",{"class":"note",text:"Navrhněte čas, potvrdíme vám ho."}));
  }
  var name=el("input",{name:"name",autocomplete:"name",maxlength:"120",required:""});
  var phone=el("input",{name:"phone",type:"tel",autocomplete:"tel",maxlength:"40"});
  var email=el("input",{name:"email",type:"email",autocomplete:"email",maxlength:"200"});
  form.appendChild(field("Jméno a příjmení",name));
  form.appendChild(field("Telefon",phone));
  form.appendChild(field("E-mail",email));
  form.appendChild(el("p",{"class":"note",text:"Stačí telefon nebo e-mail."}));
  var custom=[];
  schema.fields.forEach(function(f){
    var input;
    if(f.type==="choice"||f.type==="select"){input=el("select");input.appendChild(el("option",{value:"",text:"Vyberte"}));(f.options||[]).forEach(function(o){input.appendChild(el("option",{value:o,text:o}))})}
    else input=el("input",{type:f.type==="date"?"date":"text",inputmode:f.type==="number"?"decimal":"text",maxlength:"1000"});
    custom.push([f.key,input]);form.appendChild(field(f.label,input,!f.required));
  });
  var msg=el("textarea",{name:"message",maxlength:"2000",rows:"3"});
  form.appendChild(field("Zpráva",msg,true));
  var hp=el("input",{name:"website",tabindex:"-1",autocomplete:"off"});
  form.appendChild(el("div",{"class":"hp","aria-hidden":"true"},[hp]));
  var err=el("div");form.appendChild(err);
  var send=el("button",{type:"submit","class":"btn",text:"Odeslat poptávku"});form.appendChild(send);
  form.appendChild(el("p",{"class":"foot",text:"Údaje uvidí jen "+NAME+" a použije je jen k odpovědi na vaši poptávku."}));
  form.addEventListener("submit",function(e){
    e.preventDefault();err.textContent="";
    var fields={};custom.forEach(function(c){if(c[1].value)fields[c[0]]=c[1].value});
    var body={name:name.value,phone:phone.value||null,email:email.value||null,message:msg.value||null,fields:fields,website:hp.value};
    if(svc&&svc.value)body.serviceId=svc.value;
    if(time&&time.value)body.start=time.value;
    if(fdate&&fdate.value&&ftime&&ftime.value){body.date=fdate.value;body.time=ftime.value}
    send.disabled=true;send.textContent="Odesíláme…";
    fetch(url("/api/public/v1/requests"),{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return{success:false,error:"Poptávku se nepodařilo odeslat. Zkuste to prosím znovu."}})})
      .then(function(j){if(j&&j.success){done(target)}else{err.appendChild(errorBox(j&&j.error||"Poptávku se nepodařilo odeslat."));send.disabled=false;send.textContent="Odeslat poptávku"}})
      .catch(function(){err.appendChild(errorBox("Spojení se nepovedlo. Zkuste to prosím znovu."));send.disabled=false;send.textContent="Odeslat poptávku"});
  });
  target.appendChild(form);
  setTimeout(function(){(svc||name).focus()},0);
}
function done(target){
  target.textContent="";
  target.appendChild(el("div",{"class":"ok"},[el("span",{"class":"check","aria-hidden":"true",text:"\\u2713"}),el("h2",{text:"Poptávka je odeslaná"}),el("p",{"class":"note",text:"Brzy se vám ozveme."}),mode==="button"?el("button",{type:"button","class":"btn",text:"Zavřít",on:{click:close}}):null]));
}
function ensureSchema(target){if(schema){render(target);return}render(target);loadSchema().then(function(j){j._service="";schema=j;render(target)}).catch(function(){target.textContent="";target.appendChild(errorBox("Formulář se teď nepodařilo načíst. Zkuste to prosím později."))})}
function onKey(e){if(e.key==="Escape")close()}
function close(){if(overlay){overlay.remove();overlay=null;document.removeEventListener("keydown",onKey);if(openBtn)openBtn.focus()}}
var openBtn=null;
if(mode==="inline"){box=el("div",{"class":"inline"});root.appendChild(box);ensureSchema(box)}
else{
  openBtn=el("button",{type:"button","class":"btn",text:label,on:{click:function(){
    box=el("div",{"class":"panel",role:"dialog","aria-modal":"true","aria-label":NAME});
    overlay=el("div",{"class":"overlay",on:{click:function(e){if(e.target===overlay)close()}}},[box]);
    root.appendChild(overlay);document.addEventListener("keydown",onKey);ensureSchema(box);
  }}});
  root.appendChild(openBtn);
}
})();
`
}
