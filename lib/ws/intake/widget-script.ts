export type WidgetOptions = {
  apiOrigin: string
  slug: string
  businessName: string
  accent: string | null
}

/**
 * Widget nechává objednávkový tok na `/r`, aby stránka a vložený formulář
 * používaly stejné kroky, dostupnost, validaci i výsledek. Vlastní skript
 * pouze bezpečně vytvoří izolovaný iframe a případně tlačítko s dialogem.
 */
export function widgetScript(options: WidgetOptions): string {
  const json = JSON.stringify(options).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `(()=>{
"use strict";
const o=${json};
const script=document.currentScript;
if(!script||!script.parentNode)return;
const mode=script.dataset.mode==="inline"?"inline":"button";
const label=(script.dataset.label||"Objednat se").trim().slice(0,80)||"Objednat se";
const host=document.createElement("div");
host.setAttribute("data-zakaziq-widget",o.slug);
script.parentNode.insertBefore(host,script.nextSibling);
const root=host.attachShadow?host.attachShadow({mode:"open"}):host;
const stylesheet=document.createElement("link");
stylesheet.rel="stylesheet";
const cssUrl=new URL("/embed/widget.css",o.apiOrigin);
if(typeof o.accent==="string")cssUrl.searchParams.set("accent",o.accent);
stylesheet.href=cssUrl.href;
root.appendChild(stylesheet);
const frame=document.createElement("iframe");
frame.src=o.apiOrigin+"/r/"+encodeURIComponent(o.slug)+"?embed=1";
frame.title=o.businessName+" – objednávka";
frame.loading="lazy";
frame.referrerPolicy="no-referrer";
frame.setAttribute("sandbox","allow-forms allow-scripts allow-same-origin allow-downloads");
if(mode==="inline"){
frame.className="zq-inline";
frame.loading="eager";
root.appendChild(frame);
return;
}
const button=document.createElement("button");
button.type="button";button.className="zq-button";button.textContent=label;
button.setAttribute("aria-haspopup","dialog");
root.appendChild(button);
const overlay=document.createElement("div");overlay.id="zakaziq-order-dialog";overlay.className="zq-overlay";overlay.hidden=true;overlay.setAttribute("role","presentation");
const dialog=document.createElement("div");dialog.className="zq-dialog";dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-label",o.businessName+" – objednávka");
const close=document.createElement("button");close.type="button";close.className="zq-close";close.textContent="×";close.setAttribute("aria-label","Zavřít objednávku");
const title=document.createElement("h2");title.className="zq-title";title.textContent=o.businessName+" – objednávka";
frame.className="zq-frame";
dialog.append(title,close,frame);overlay.appendChild(dialog);root.appendChild(overlay);
let previous=null;
const focusTrap=()=>{const active=root.activeElement||document.activeElement;if(!overlay.hidden&&active!==close&&active!==frame)close.focus();};
const hide=()=>{overlay.hidden=true;document.removeEventListener("focusin",focusTrap);button.setAttribute("aria-expanded","false");if(previous&&previous.isConnected)previous.focus();};
button.setAttribute("aria-expanded","false");button.setAttribute("aria-controls",overlay.id);
button.addEventListener("click",()=>{previous=document.activeElement;overlay.hidden=false;document.addEventListener("focusin",focusTrap);button.setAttribute("aria-expanded","true");close.focus();});
close.addEventListener("click",hide);
overlay.addEventListener("click",e=>{if(e.target===overlay)hide();});
dialog.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();hide();}});
})();\n`;
}
