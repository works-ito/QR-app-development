"use strict";
const $=id=>document.getElementById(id);
function show(id){for(const panel of ["inPanel","outPanel","listPanel"])$(panel).classList.toggle("hidden",panel!==id)}
$("goIn").addEventListener("click",()=>show("inPanel"));
$("goOut").addEventListener("click",()=>show("outPanel"));
$("goList").addEventListener("click",()=>show("listPanel"));
$("customer").addEventListener("change",()=>$("otherCustomerBox").classList.toggle("hidden",$("customer").value!=="__other"));
$("kind").addEventListener("change",()=>{const other=$("kind").value==="other";$("unitBox").classList.toggle("hidden",!other);$("unitCaption").textContent=other?"（下の単位を指定）":"台"});
$("backEdit").addEventListener("click",()=>{$("inForm").classList.remove("hidden");$("confirm").classList.add("hidden")});
$("photos").addEventListener("change",()=>{
  const files=Array.from($("photos").files||[]),p=$("preview");p.replaceChildren();
  if(files.length>6){alert("写真は最大6枚です");$("photos").value="";return}
  files.forEach(file=>{if(!file.type.startsWith("image/"))return;const img=document.createElement("img");img.className="preview";img.alt="入庫写真";const u=URL.createObjectURL(file);img.src=u;img.onload=()=>URL.revokeObjectURL(u);p.append(img)});
});
$("inForm").addEventListener("submit",e=>{
  e.preventDefault();const customer=$("customer").value==="__other"?$("otherCustomer").value.trim():$("customer").value;
  if(!customer){alert("顧客名を入力してください");return}
  const q=Number($("qty").value);if(!Number.isSafeInteger(q)||q<1){alert("数量は1以上の整数にしてください");return}
  const photos=$("photos").files;if(!photos.length||photos.length>6){alert("写真を1〜6枚添付してください");return}
  const lines=[["顧客",customer],["現場",$("site").value.trim()||"未確認"],["品名",$("item").value.trim()],["保管形態",$("kind").value==="mesh"?"メッシュパレット":"その他"],["数量",q+($("kind").value==="mesh"?"台":$("unit").value)],["写真",photos.length+"枚"],["備考",$("note").value.trim()||"なし"]];
  $("confirmation").replaceChildren();lines.forEach(([k,v])=>{const p=document.createElement("p");const strong=document.createElement("strong");strong.textContent=k+"：";p.append(strong,document.createTextNode(v));$("confirmation").append(p)});
  $("inForm").classList.add("hidden");$("confirm").classList.remove("hidden");
});
