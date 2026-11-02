import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getDatabase,ref,onValue,set,update,get,query,limitToLast} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id), R=p=>ref(db,"device/"+p);
const NOTE={NORMAL:"Supply is within limits.",OVERVOLTAGE:"Voltage above limit. Outlets are off.",UNDERVOLTAGE:"Voltage below limit. Outlets are off.",OVERLOAD:"Current above limit. Outlets are off.",INTERRUPTION:"No supply detected. Outlets are off."};
let lastSeen=0,chart,started=false;

// ---------- auth ----------
$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginErr").textContent="";
  try{await signInWithEmailAndPassword(auth,$("email").value,$("pass").value)}
  catch{$("loginErr").textContent="Sign-in failed. Check your email and password."}};
$("logout").onclick=()=>signOut(auth);
onAuthStateChanged(auth,u=>{$("login").classList.toggle("hidden",!!u);$("app").classList.toggle("hidden",!u);if(u&&!started){started=true;start()}});

// ---------- outlets UI ----------
$("outlets").innerHTML=[1,2,3].map(n=>`<div class="outlet" id="out${n}"><h3>Outlet ${n}</h3>
 <span class="badge" id="b${n}">Off</span>
 <label class="switch"><input type="checkbox" id="t${n}" aria-label="Outlet ${n} enabled"><i></i></label></div>`).join("");
[1,2,3].forEach(n=>$("t"+n).onchange=e=>set(R("control/outlets/o"+n),e.target.checked));
$("modeAuto").onclick=()=>set(R("control/mode"),"auto");
$("modeManual").onclick=()=>set(R("control/mode"),"manual");
$("estop").onclick=()=>update(R("control/outlets"),{o1:false,o2:false,o3:false});
$("settings").onsubmit=async e=>{e.preventDefault();
  await update(R("control"),{delays:{d1:+$("d1").value,d2:+$("d2").value,d3:+$("d3").value},
    thresholds:{ovp:+$("ovp").value,uvp:+$("uvp").value,ocp:+$("ocp").value}});
  $("saved").textContent="Saved";setTimeout(()=>$("saved").textContent="",2000)};

const fmt=(v,d=1)=>typeof v==="number"?v.toFixed(d):"–";
function start(){
  onValue(R("status"),s=>{const x=s.val();if(!x)return;lastSeen=x.lastSeen||0;
    $("mV").textContent=fmt(x.v);$("mI").textContent=fmt(x.i,2);$("mP").textContent=fmt(x.p,0);
    $("mE").textContent=fmt(x.e,3);$("mF").textContent=fmt(x.f);$("mPF").textContent=fmt(x.pf,2);
    const c=x.cond||"—";$("cond").textContent=c[0]+c.slice(1).toLowerCase();$("condNote").textContent=NOTE[c]||"";
    $("stateBar").classList.toggle("bad",c!=="NORMAL");
    [1,2,3].forEach(n=>{const o=x["o"+n]||{};$("out"+n).classList.toggle("on",!!o.on);
      $("b"+n).className="badge "+(o.on?"on":o.wait>0?"wait":"");
      $("b"+n).textContent=o.on?"On":o.wait>0?`Starts in ${o.wait} s`:"Off"})});
  onValue(R("control"),s=>{const c=s.val()||{};
    [1,2,3].forEach(n=>$("t"+n).checked=!!(c.outlets&&c.outlets["o"+n]));
    $("modeAuto").classList.toggle("sel",c.mode!=="manual");$("modeManual").classList.toggle("sel",c.mode==="manual");
    const set_=(id,v)=>{if(document.activeElement!==$(id)&&v!==undefined)$(id).value=v};
    const d=c.delays||{},t=c.thresholds||{};set_("d1",d.d1);set_("d2",d.d2);set_("d3",d.d3);set_("ovp",t.ovp);set_("uvp",t.uvp);set_("ocp",t.ocp)});
  onValue(query(R("logs"),limitToLast(30)),s=>{const rows=[];s.forEach(c=>rows.unshift(c.val()));
    $("log").innerHTML=rows.length?rows.map(r=>`<li class="${r.fault?"f":""}"><time>${new Date(r.ts).toLocaleString()}</time>${r.msg}</li>`).join(""):'<li class="muted">No events yet.</li>'});
  onValue(query(R("history"),limitToLast(60)),s=>{const h=[];s.forEach(c=>h.push(c.val()));drawChart(h)});
  setInterval(()=>{const on=Date.now()-lastSeen<15000;$("conn").className="pill "+(on?"on":"off");$("conn").textContent=on?"Device online":"Device offline"},2000);
}
function drawChart(h){const labels=h.map(r=>new Date(r.ts).toLocaleTimeString());
  const data={labels,datasets:[{label:"Voltage (V)",data:h.map(r=>r.v),borderColor:"#e0a100",yAxisID:"y",pointRadius:0},
    {label:"Current (A)",data:h.map(r=>r.i),borderColor:"#2e7d5b",yAxisID:"y1",pointRadius:0}]};
  if(chart){chart.data=data;chart.update("none");return}
  chart=new Chart($("chart"),{type:"line",data,options:{animation:false,scales:{y:{position:"left"},y1:{position:"right",grid:{drawOnChartArea:false}}}}})}
$("csv").onclick=async()=>{const s=await get(query(R("history"),limitToLast(2000)));
  let out="time,voltage_V,current_A,power_W,energy_kWh\n";s.forEach(c=>{const r=c.val();out+=`${new Date(r.ts).toISOString()},${r.v},${r.i},${r.p},${r.e}\n`});
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download="readings.csv";a.click()};
