import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getDatabase,ref,onValue,set,update,get,query,limitToLast} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id),R=p=>ref(db,"device/"+p),fmt=(v,d=1)=>typeof v==="number"?v.toFixed(d):"–";
const TITLE={NORMAL:"Supply normal",OVERVOLTAGE:"Overvoltage",UNDERVOLTAGE:"Undervoltage",OVERLOAD:"Overload",INTERRUPTION:"Power interruption"};
const NOTE={NORMAL:"Voltage and current are within your limits.",OVERVOLTAGE:"Voltage is too high. Outlets are off.",UNDERVOLTAGE:"Voltage is too low. Outlets are off.",OVERLOAD:"Current is too high. Outlets are off.",INTERRUPTION:"No supply detected. Outlets are off."};
let lastSeen=0,chart,started=false,lim={ovp:250,uvp:200,ocp:16},dly=[3,5,10],names=["Air conditioner","Refrigerator","Water pump"];

$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginErr").textContent="";
  try{await signInWithEmailAndPassword(auth,$("email").value,$("pass").value)}catch{$("loginErr").textContent="Sign-in failed. Check your email and password."}};
$("logout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,u=>{$("login").classList.toggle("hidden",!!u);$("app").classList.toggle("hidden",!u);if(u&&!started){started=true;start()}});
document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav button").forEach(x=>x.classList.toggle("sel",x===b));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("hidden",t.id!=="tab-"+b.dataset.tab))});

$("outlets").innerHTML=[1,2,3].map(n=>`<li class="outlet" id="out${n}"><div class="oh"><button class="name" id="n${n}" aria-label="Rename outlet ${n}"></button><span class="badge" id="b${n}">Off</span></div>
 <div class="bar"><i id="p${n}"></i></div><div class="ob"><small class="muted" id="s${n}"></small><label class="switch"><input type="checkbox" id="t${n}" aria-label="Outlet ${n} on or off"><i></i></label></div></li>`).join("");
[1,2,3].forEach(n=>{$("t"+n).onchange=e=>set(R("control/outlets/o"+n),e.target.checked);
  $("n"+n).onclick=()=>{const v=prompt("Appliance name for outlet "+n,names[n-1]);if(v&&v.trim())set(R("control/names/o"+n),v.trim().slice(0,24))}});
$("modeAuto").onclick=()=>set(R("control/mode"),"auto");$("modeManual").onclick=()=>set(R("control/mode"),"manual");
$("estop").onclick=()=>update(R("control/outlets"),{o1:false,o2:false,o3:false});
$("settings").onsubmit=async e=>{e.preventDefault();
  await update(R("control"),{delays:{d1:+$("d1").value,d2:+$("d2").value,d3:+$("d3").value},thresholds:{ovp:+$("ovp").value,uvp:+$("uvp").value,ocp:+$("ocp").value}});
  $("saved").textContent="Saved";setTimeout(()=>$("saved").textContent="",2000)};

const ago=t=>{const s=Math.max(0,(Date.now()-t)/1000);return s<10?"just now":s<60?Math.round(s)+" s ago":s<3600?Math.round(s/60)+" min ago":s<86400?Math.round(s/3600)+" h ago":new Date(t).toLocaleDateString()};
function labels(){[1,2,3].forEach(n=>{$("n"+n).textContent=names[n-1];$("s"+n).textContent=`Starts ${dly[n-1]} s after supply is stable`});
  $("rlo").textContent="Cut off below "+lim.uvp+" V";$("rhi").textContent="Cut off above "+lim.ovp+" V";$("ilim").textContent="Cut off above "+lim.ocp+" A"}
function start(){
  onValue(R("status"),s=>{const x=s.val();if(!x)return;lastSeen=x.lastSeen||0;
    $("mV").textContent=fmt(x.v);$("mI").textContent=fmt(x.i,2);$("mP").textContent=fmt(x.p,0);$("mE").textContent=fmt(x.e,3);$("mF").textContent=fmt(x.f);$("mPF").textContent=fmt(x.pf,2);
    const c=x.cond||"NORMAL";$("cond").textContent=TITLE[c]||c;$("condNote").textContent=NOTE[c]||"";$("hero").classList.toggle("bad",c!=="NORMAL");$("hero").classList.remove("off");
    $("vmark").style.left=Math.min(100,Math.max(0,(x.v-lim.uvp)/(lim.ovp-lim.uvp)*100))+"%";$("ibar").style.width=Math.min(100,(x.i||0)/lim.ocp*100)+"%";
    [1,2,3].forEach(n=>{const o=x["o"+n]||{},tot=dly[n-1]+5;$("out"+n).classList.toggle("on",!!o.on);
      $("b"+n).textContent=o.on?"Energized":o.wait>0?`Starts in ${o.wait} s`:"Off";$("p"+n).style.width=(o.on?100:o.wait>0?Math.max(0,100-o.wait/tot*100):0)+"%"})});
  onValue(R("control"),s=>{const c=s.val()||{};
    [1,2,3].forEach(n=>$("t"+n).checked=!!(c.outlets&&c.outlets["o"+n]));
    $("modeAuto").classList.toggle("sel",c.mode!=="manual");$("modeManual").classList.toggle("sel",c.mode==="manual");
    const d=c.delays||{},t=c.thresholds||{},nm=c.names||{};dly=[d.d1??3,d.d2??5,d.d3??10];lim={ovp:t.ovp??250,uvp:t.uvp??200,ocp:t.ocp??16};
    names=[nm.o1||names[0],nm.o2||names[1],nm.o3||names[2]];labels();
    const f=(id,v)=>{if(document.activeElement!==$(id))$(id).value=v};f("d1",dly[0]);f("d2",dly[1]);f("d3",dly[2]);f("ovp",lim.ovp);f("uvp",lim.uvp);f("ocp",lim.ocp)});
  onValue(query(R("logs"),limitToLast(40)),s=>{const rows=[];s.forEach(c=>rows.unshift(c.val()));
    $("log").innerHTML=rows.length?rows.map(r=>`<li class="${r.fault?"f":""}"><time>${ago(r.ts)}</time><span>${r.msg}</span></li>`).join(""):'<li class="muted">No events yet.</li>'});
  onValue(query(R("history"),limitToLast(60)),s=>{const h=[];s.forEach(c=>h.push(c.val()));drawChart(h)});
  labels();setInterval(()=>{const on=Date.now()-lastSeen<15000;$("conn").className="pill "+(on?"on":"off");$("conn").textContent=on?"Online":"Offline";
    $("sub").textContent=lastSeen?"Updated "+ago(lastSeen):"Waiting for device";if(!on)$("hero").classList.add("off")},2000)}
function drawChart(h){const data={labels:h.map(r=>new Date(r.ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})),datasets:[{label:"Voltage (V)",data:h.map(r=>r.v),borderColor:"#d89a00",yAxisID:"y",pointRadius:0,tension:.3},{label:"Current (A)",data:h.map(r=>r.i),borderColor:"#2e7d5b",yAxisID:"y1",pointRadius:0,tension:.3}]};
  if(chart){chart.data=data;chart.update("none");return}
  chart=new Chart($("chart"),{type:"line",data,options:{animation:false,scales:{x:{ticks:{maxTicksLimit:5}},y:{position:"left"},y1:{position:"right",grid:{drawOnChartArea:false}}}}})}
$("csv").onclick=async()=>{const s=await get(query(R("history"),limitToLast(2000)));let o="time,voltage_V,current_A,power_W,energy_kWh\n";
  s.forEach(c=>{const r=c.val();o+=`${new Date(r.ts).toISOString()},${r.v},${r.i},${r.p},${r.e}\n`});
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([o],{type:"text/csv"}));a.download="readings.csv";a.click()};
