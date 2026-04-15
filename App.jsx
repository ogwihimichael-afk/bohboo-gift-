import { useState, useEffect, useRef, useCallback } from "react";

// ─── THEME ───────────────────────────────────────────────────
const C = {
  navy:"#07090F", navyL:"#0D1221", navyM:"#131929", navyB:"#1A2235",
  gold:"#D4A843", goldL:"#E8C068", goldD:"#9A7530", white:"#F0EDE8",
  dim:"#7A7670",  dim2:"#A8A49E",  purple:"#6B4FA0", purpL:"#9B79D0",
  green:"#27AE60", red:"#E74C3C",  blue:"#2980B9",   teal:"#16A085",
};

const RPC         = "https://api.devnet.solana.com";
const EXP         = "https://explorer.solana.com";
const LAM         = 1_000_000_000;
const MINTS = {
  BOHBOO: "4xMXegyso9etbWGyCN9Y73hGBzmVireCBYwnEsivpump",
  USDC:   "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Devnet USDC
  USDT:   "EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS", // Devnet USDT
};

const uid  = () => Math.random().toString(36).slice(2,8);
const trim = k  => `${k.slice(0,4)}…${k.slice(-4)}`;
const fakeSig = () => [...Array(88)].map(()=>"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789"[Math.floor(Math.random()*58)]).join("");

// ─── TOKEN CONFIG ─────────────────────────────────────────────
const TOKENS = [
  { id:"SOL",    label:"SOL",    symbol:"◎", color:C.gold,   desc:"Native Solana",       emoji:"◎" },
  { id:"BOHBOO", label:"BOHBOO", symbol:"🟣", color:C.purpL,  desc:"pump.fun token",      emoji:"🟣" },
  { id:"USDC",   label:"USDC",   symbol:"$",  color:C.blue,   desc:"USD Coin (Devnet)",   emoji:"💵" },
  { id:"USDT",   label:"USDT",   symbol:"$",  color:C.teal,   desc:"Tether USD (Devnet)", emoji:"💴" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{box-shadow:0 0 20px #D4A84320}50%{box-shadow:0 0 40px #D4A84350}}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:#D4A84340;border-radius:4px}
input[type=date]{color-scheme:dark}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
`;

// ─── PHANTOM HOOK ─────────────────────────────────────────────
function usePhantom() {
  const [wallet,   setWallet]   = useState(null);
  const [wStatus,  setWStatus]  = useState("idle");
  const [wError,   setWError]   = useState("");
  const [txStatus, setTxStatus] = useState(null);
  const [lastTx,   setLastTx]   = useState(null);

  const ph = () => (typeof window!=="undefined" && window.solana?.isPhantom) ? window.solana : null;

  const fetchBal = useCallback(async (pk) => {
    try {
      const r = await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[pk,{commitment:"confirmed"}]})});
      const d = await r.json();
      return ((d.result?.value||0)/LAM).toFixed(4);
    } catch { return "0.0000"; }
  },[]);

  const fetchTokenBal = useCallback(async (pk, mint) => {
    try {
      const r = await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getTokenAccountsByOwner",
          params:[pk,{mint},{encoding:"jsonParsed"}]})});
      const d = await r.json();
      const accs = d.result?.value||[];
      if (!accs.length) return "0";
      return accs[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString||"0";
    } catch { return "0"; }
  },[]);

  const fetchAllBalances = useCallback(async (pk) => {
    const [sol, bohboo, usdc, usdt] = await Promise.all([
      fetchBal(pk),
      fetchTokenBal(pk, MINTS.BOHBOO),
      fetchTokenBal(pk, MINTS.USDC),
      fetchTokenBal(pk, MINTS.USDT),
    ]);
    return { sol, bohboo, usdc, usdt };
  },[fetchBal, fetchTokenBal]);

  const connect = useCallback(async () => {
    const p = ph();
    if (!p) { setWError("Phantom not found. Install at phantom.app"); setWStatus("error"); return; }
    try {
      setWStatus("connecting"); setWError("");
      const res = await p.connect();
      const pk  = res.publicKey.toString();
      const bals = await fetchAllBalances(pk);
      const w = { publicKey:pk, short:trim(pk), ...bals };
      setWallet(w); setWStatus("connected");
      try { sessionStorage.setItem("gw", JSON.stringify(w)); } catch {}
    } catch(e) { setWError(e.message||"Rejected"); setWStatus("error"); }
  },[fetchAllBalances]);

  const disconnect = useCallback(async () => {
    try { await ph()?.disconnect(); } catch {}
    setWallet(null); setWStatus("idle"); setWError("");
    try { sessionStorage.removeItem("gw"); } catch {}
  },[]);

  const refreshBal = useCallback(async () => {
    if (!wallet) return;
    const bals = await fetchAllBalances(wallet.publicKey);
    const w = { ...wallet, ...bals };
    setWallet(w);
    try { sessionStorage.setItem("gw", JSON.stringify(w)); } catch {}
  },[wallet, fetchAllBalances]);

  // ── MOCK SEND — no real transaction, just simulate ──────────
  const mockSend = useCallback(async (tokenId, amount, to) => {
    setTxStatus("pending");
    // Simulate network delay
    await new Promise(r => setTimeout(r, 1800));
    const sig = fakeSig();
    setLastTx(sig);
    setTxStatus("confirmed");
    // Balance stays unchanged — this is Devnet mock mode
    return sig;
  },[]);

  // Restore session
  useEffect(()=>{
    try {
      const s = sessionStorage.getItem("gw");
      if (s) {
        const w = JSON.parse(s); setWallet(w); setWStatus("connected");
        fetchAllBalances(w.publicKey).then(bals => {
          const u = {...w,...bals};
          setWallet(u);
          try{sessionStorage.setItem("gw",JSON.stringify(u));}catch{}
        });
      }
    } catch {}
  },[fetchAllBalances]);

  // Account change
  useEffect(()=>{
    const p=ph(); if(!p) return;
    const h=pk=>{
      if(!pk){disconnect();return;}
      const k=pk.toString();
      fetchAllBalances(k).then(bals=>{
        const w={publicKey:k,short:trim(k),...bals};
        setWallet(w);try{sessionStorage.setItem("gw",JSON.stringify(w));}catch{}
      });
    };
    p.on("accountChanged",h);
    return()=>p.off?.("accountChanged",h);
  },[disconnect,fetchAllBalances]);

  return { wallet, wStatus, wError, txStatus, lastTx, connect, disconnect, refreshBal, mockSend };
}

// ─── SEED DATA ────────────────────────────────────────────────
const OCCASIONS = [
  {id:"birthday",   label:"Birthday",        emoji:"🎂",color:C.gold},
  {id:"graduation", label:"Graduation",      emoji:"🎓",color:C.purple},
  {id:"congrats",   label:"Congratulations", emoji:"🏆",color:C.green},
  {id:"justbecause",label:"Just Because",    emoji:"💛",color:C.goldL},
  {id:"anniversary",label:"Anniversary",     emoji:"💍",color:C.red},
  {id:"christmas",  label:"Christmas",       emoji:"🎄",color:C.green},
  {id:"newborn",    label:"New Born",        emoji:"👶",color:C.purpL},
  {id:"thankyou",   label:"Thank You",       emoji:"🙏",color:C.goldD},
];

const FEED0 = [
  {id:"f1",occasion:"Birthday",      emoji:"🎂",message:"You've carried this team for years. Today is yours. Happy birthday, legend.",from:"8xKm…3a1",to:"9bNp…7c2",amount:"2 SOL",   token:"SOL",  reaction:"🥹",time:"2m ago"},
  {id:"f2",occasion:"Graduation",    emoji:"🎓",message:"First in the family to get that degree. We always knew you would.",         from:"4cZq…8d3",to:"2aWr…5e7",amount:"5 SOL",   token:"SOL",  reaction:"❤️",time:"14m ago"},
  {id:"f3",occasion:"Just Because",  emoji:"💛",message:"No reason. Just wanted you to know I see how hard you work.",               from:"1fYt…2b9",to:"8cUs…4a1",amount:"500 BOHBOO",token:"BOHBOO",reaction:"😭",time:"1h ago"},
  {id:"f4",occasion:"Congratulations",emoji:"🏆",message:"You built that from nothing. This is just the beginning.",                 from:"6dVs…7f4",to:"3eXp…1c6",amount:"50 USDC", token:"USDC", reaction:"🔥",time:"2h ago"},
  {id:"f5",occasion:"Thank You",     emoji:"🙏",message:"You didn't have to help but you did. This one's from the heart.",           from:"5bOq…3d2",to:"9aLm…6f8",amount:"25 USDT", token:"USDT", reaction:"🫶",time:"3h ago"},
];

const MEM0 = [
  {id:"m1",type:"received",occasion:"Birthday",    emoji:"🎂",message:"Happy birthday legend. Keep winning.",     from:"4cZq…8d3",amount:"2 SOL",    token:"SOL",  reaction:"🥹",date:"Apr 3, 2026"},
  {id:"m2",type:"sent",    occasion:"Graduation",  emoji:"🎓",message:"So proud of you. This is just the start.",to:"9bNp…7c2",  amount:"5 SOL",    token:"SOL",  date:"Mar 22, 2026"},
  {id:"m3",type:"received",occasion:"Just Because",emoji:"💛",message:"You're appreciated more than you know.",  from:"2aWr…5e7",amount:"500 BOHBOO",token:"BOHBOO",reaction:"❤️",date:"Feb 14, 2026"},
  {id:"m4",type:"sent",    occasion:"Thank You",   emoji:"🙏",message:"You showed up. This is for you.",         to:"5bOq…3d2",  amount:"50 USDC",  token:"USDC",  date:"Feb 1, 2026"},
];

const LIVE_MSGS = [
  {emoji:"🎂",occasion:"Birthday",      message:"Happy birthday king. This one's on us.",          reaction:"🥳"},
  {emoji:"💛",occasion:"Just Because",  message:"You didn't ask. That's exactly why.",              reaction:"🫶"},
  {emoji:"🎓",occasion:"Graduation",    message:"Four years of sacrifice. You made it look easy.", reaction:"😭"},
  {emoji:"🏆",occasion:"Congratulations",message:"The idea everyone doubted just shipped.",         reaction:"🔥"},
  {emoji:"🙏",occasion:"Thank You",     message:"You showed up when nobody else did.",              reaction:"❤️"},
];

// ─── ATOMS ────────────────────────────────────────────────────
const Orb = ({s}) => <div style={{position:"absolute",borderRadius:"50%",filter:"blur(90px)",opacity:.08,pointerEvents:"none",...s}}/>;

const Pill = ({children, c=C.gold, sm}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:sm?"2px 8px":"3px 10px",borderRadius:20,
    background:`${c}18`,border:`1px solid ${c}35`,color:c,fontSize:sm?9:11,fontWeight:700,letterSpacing:.3,whiteSpace:"nowrap"}}>
    {children}
  </span>
);

const Field = ({label, ta, ...p}) => {
  const base={width:"100%",padding:"12px 14px",borderRadius:12,background:C.navyM,border:`1px solid ${C.gold}28`,
    color:C.white,fontSize:13,outline:"none",fontFamily:ta?"'Playfair Display',serif":"'DM Sans',sans-serif",
    lineHeight:ta?1.65:undefined,resize:ta?"none":undefined,boxSizing:"border-box"};
  return (
    <div>
      {label&&<div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>{label}</div>}
      {ta?<textarea style={base} onFocus={e=>e.target.style.borderColor=`${C.gold}70`} onBlur={e=>e.target.style.borderColor=`${C.gold}28`} {...p}/>
         :<input    style={base} onFocus={e=>e.target.style.borderColor=`${C.gold}70`} onBlur={e=>e.target.style.borderColor=`${C.gold}28`} {...p}/>}
    </div>
  );
};

const Btn = ({children,ghost,full,disabled,onClick,style:s}) => {
  const bg    = ghost?"none":`linear-gradient(135deg,${C.gold},${C.goldD})`;
  const brd   = ghost?`1px solid ${C.gold}40`:"none";
  const col   = ghost?C.gold:C.navy;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",
        transition:"all .2s",fontFamily:"'DM Sans',sans-serif",background:bg,border:brd,color:col,
        width:full?"100%":undefined,opacity:disabled?.6:1,...s}}
      onMouseEnter={e=>{if(!disabled){e.currentTarget.style.opacity=".85";e.currentTarget.style.transform="translateY(-1px)";}}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="translateY(0)";}}>
      {children}
    </button>
  );
};

const Toggle = ({val,set}) => (
  <div onClick={()=>set(!val)} style={{width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",
    transition:"background .25s",flexShrink:0,background:val?C.gold:C.navyM,border:`1px solid ${C.gold}30`}}>
    <div style={{position:"absolute",top:3,left:val?22:3,width:18,height:18,borderRadius:"50%",
      background:val?C.navy:C.dim,transition:"left .25s"}}/>
  </div>
);

// ─── TOKEN COLOR HELPER ───────────────────────────────────────
const tokenColor = id => ({ SOL:C.gold, BOHBOO:C.purpL, USDC:C.blue, USDT:C.teal }[id]||C.gold);
const tokenEmoji = id => ({ SOL:"◎",   BOHBOO:"🟣",    USDC:"💵",   USDT:"💴"  }[id]||"💎");

// ─── TOKEN SELECTOR ───────────────────────────────────────────
function TokenSelector({ value, onChange, wallet }) {
  return (
    <div>
      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Select Token to Gift</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {TOKENS.map(t => {
          const bal = wallet ? (t.id==="SOL"?wallet.sol:t.id==="BOHBOO"?wallet.bohboo:t.id==="USDC"?wallet.usdc:wallet.usdt) : null;
          const sel = value===t.id;
          return (
            <button key={t.id} onClick={()=>onChange(t.id)}
              style={{padding:"12px 10px",borderRadius:12,cursor:"pointer",transition:"all .2s",textAlign:"center",
                background:sel?`${t.color}15`:C.navyM,
                border:`2px solid ${sel?t.color:C.gold+"18"}`,
                display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:22}}>{t.emoji}</span>
              <span style={{fontSize:12,fontWeight:700,color:sel?t.color:C.white}}>{t.label}</span>
              <span style={{fontSize:9,color:C.dim2}}>{t.desc}</span>
              {bal!==null && <span style={{fontSize:10,color:sel?t.color:C.dim2,marginTop:2,fontWeight:600}}>{bal} avail.</span>}
            </button>
          );
        })}
      </div>
      <div style={{marginTop:10,padding:"10px 12px",borderRadius:10,background:`${C.navyB}`,border:`1px solid ${C.gold}12`,fontSize:10,color:C.dim2,lineHeight:1.6}}>
        🧪 <strong style={{color:C.goldD}}>Devnet Mode</strong> — Transactions are simulated. Your real wallet balances are displayed but nothing is deducted.
      </div>
    </div>
  );
}

// ─── WALLET BUTTON ────────────────────────────────────────────
function WalletBtn({ wallet, wStatus, wError, connect, disconnect, refreshBal }) {
  const [open, setOpen] = useState(false);

  if (wStatus==="connecting") return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:10,background:C.navyM,border:`1px solid ${C.gold}25`}}>
      <div style={{width:13,height:13,borderRadius:"50%",border:`2px solid ${C.dim}`,borderTopColor:C.gold,animation:"spin .7s linear infinite"}}/>
      <span style={{fontSize:11,color:C.dim2,fontWeight:600}}>Connecting…</span>
    </div>
  );

  if (wStatus==="connected"&&wallet) return (
    <div style={{position:"relative"}}>
      <div onClick={()=>setOpen(!open)}
        style={{display:"flex",alignItems:"center",gap:7,padding:"7px 11px",borderRadius:10,cursor:"pointer",
          background:`${C.green}10`,border:`1px solid ${C.green}30`,transition:"background .2s"}}
        onMouseEnter={e=>e.currentTarget.style.background=`${C.green}18`}
        onMouseLeave={e=>e.currentTarget.style.background=`${C.green}10`}>
        <div style={{width:7,height:7,borderRadius:"50%",background:C.green,boxShadow:`0 0 5px ${C.green}`}}/>
        <div>
          <div style={{fontSize:11,color:C.green,fontWeight:700,lineHeight:1}}>{wallet.short}</div>
          <div style={{fontSize:9,color:C.dim2,marginTop:1}}>Devnet</div>
        </div>
        <span style={{fontSize:9,color:C.dim}}>▾</span>
      </div>
      {open && (
        <div style={{position:"absolute",right:0,top:46,width:260,background:C.navyL,border:`1px solid ${C.gold}25`,borderRadius:14,padding:14,zIndex:400,boxShadow:`0 16px 48px #00000090`,animation:"fadeIn .2s ease"}}>
          <div style={{fontSize:9,color:C.dim2,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Connected · Devnet</div>
          <div style={{fontSize:10,color:C.white,wordBreak:"break-all",lineHeight:1.5,marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${C.gold}10`}}>
            {wallet.publicKey}
          </div>
          {/* All balances */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {[{l:"SOL",c:C.gold,v:wallet.sol},{l:"BOHBOO",c:C.purpL,v:wallet.bohboo},{l:"USDC",c:C.blue,v:wallet.usdc},{l:"USDT",c:C.teal,v:wallet.usdt}].map(({l,c,v})=>(
              <div key={l} style={{padding:"8px",borderRadius:8,background:`${c}10`,border:`1px solid ${c}20`,textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:800,color:c}}>{v||"0"}</div>
                <div style={{fontSize:8,color:C.dim2,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>{refreshBal();setOpen(false);}} style={{width:"100%",padding:"9px",borderRadius:8,background:"none",border:"none",color:C.dim2,fontSize:12,cursor:"pointer",textAlign:"left",marginBottom:2}}
            onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>🔄 Refresh Balances</button>
          <a href={`${EXP}/address/${wallet.publicKey}?cluster=devnet`} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}
            style={{display:"block",padding:"9px",borderRadius:8,color:C.dim2,fontSize:12,textDecoration:"none",marginBottom:2}}
            onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>🔗 Explorer</a>
          <button onClick={()=>{disconnect();setOpen(false);}} style={{width:"100%",padding:"9px",borderRadius:8,background:"none",border:"none",color:C.red,fontSize:12,cursor:"pointer",textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background=`${C.red}10`}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>⏏ Disconnect</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{position:"relative"}}>
      <Btn onClick={connect} style={{padding:"8px 14px",fontSize:12}}>👻 Connect Phantom</Btn>
      {wStatus==="error"&&wError&&(
        <div style={{position:"absolute",right:0,top:46,width:200,padding:"10px 12px",borderRadius:10,
          background:`${C.red}15`,border:`1px solid ${C.red}35`,color:C.red,fontSize:11,zIndex:300,lineHeight:1.6}}>
          {wError.includes("phantom")?<span>Not detected. <a href="https://phantom.app" target="_blank" rel="noreferrer" style={{color:C.gold}}>Install ↗</a></span>:wError}
        </div>
      )}
    </div>
  );
}

// ─── VOICE RECORDER ───────────────────────────────────────────
function VoiceRecorder({ onRecorded }) {
  const [state,setState]=useState("idle");
  const [secs,setSecs]=useState(0);
  const [bars,setBars]=useState(Array(14).fill(4));
  const T=useRef(),B=useRef(),M=useRef(),Ch=useRef([]),A=useRef();

  const start=async()=>{
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      M.current=new MediaRecorder(s);Ch.current=[];
      M.current.ondataavailable=e=>Ch.current.push(e.data);
      M.current.onstop=()=>{const b=new Blob(Ch.current,{type:"audio/webm"});A.current=new Audio(URL.createObjectURL(b));A.current.onended=()=>setState("recorded");s.getTracks().forEach(t=>t.stop());setState("recorded");onRecorded&&onRecorded(b);};
      M.current.start();
    }catch{setTimeout(()=>stop(true),3000);}
    setState("recording");setSecs(0);
    T.current=setInterval(()=>setSecs(s=>s+1),1000);
    B.current=setInterval(()=>setBars(Array(14).fill(0).map(()=>Math.random()*22+4)),80);
  };
  const stop=(sim=false)=>{clearInterval(T.current);clearInterval(B.current);if(!sim&&M.current?.state!=="inactive")M.current.stop();else{setState("recorded");onRecorded&&onRecorded("sim");}};
  const del=()=>{A.current?.pause();A.current=null;setState("idle");setSecs(0);setBars(Array(14).fill(4));onRecorded&&onRecorded(null);};
  useEffect(()=>()=>{clearInterval(T.current);clearInterval(B.current);},[]);

  return(
    <div style={{background:C.navyM,borderRadius:14,border:`1px solid ${C.gold}25`,padding:"14px 16px"}}>
      {state==="idle"&&<div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={start} style={{width:42,height:42,borderRadius:"50%",background:`${C.gold}20`,border:`1px solid ${C.gold}50`,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🎙</button>
        <div><div style={{color:C.white,fontSize:13,fontWeight:600}}>Add Voice Message</div><div style={{color:C.dim2,fontSize:11,marginTop:2}}>Optional · Tap to record · Max 60s</div></div>
      </div>}
      {state==="recording"&&<div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>stop()} style={{width:42,height:42,borderRadius:"50%",background:C.red,border:"none",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>⏹</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><div style={{width:7,height:7,borderRadius:"50%",background:C.red,animation:"pulse 1s infinite"}}/><span style={{color:C.red,fontSize:12,fontWeight:700}}>Recording {secs}s</span></div>
          <div style={{display:"flex",alignItems:"center",gap:2,height:26}}>{bars.map((h,i)=><div key={i} style={{width:3,height:h,background:C.gold,borderRadius:2,transition:"height .08s"}}/>)}</div>
        </div>
      </div>}
      {(state==="recorded"||state==="playing")&&<div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>{if(A.current){setState("playing");A.current.play();}}} disabled={state==="playing"} style={{width:42,height:42,borderRadius:"50%",background:`${C.green}20`,border:`1px solid ${C.green}50`,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:state==="playing"?.6:1}}>{state==="playing"?"⏸":"▶"}</button>
        <div style={{flex:1}}>
          <div style={{color:C.white,fontSize:13,fontWeight:600}}>Voice message ({secs}s)</div>
          <div style={{height:5,background:C.navyB,borderRadius:3,marginTop:7,overflow:"hidden"}}><div style={{height:"100%",width:state==="playing"?"60%":"100%",background:`linear-gradient(90deg,${C.gold},${C.goldD})`,borderRadius:3,transition:"width 2s"}}/></div>
        </div>
        <button onClick={del} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:17,padding:3}}>🗑</button>
      </div>}
    </div>
  );
}

// ─── CARDS ────────────────────────────────────────────────────
function FeedCard({ item }) {
  const [liked,setLiked]=useState(false);
  const tc=tokenColor(item.token);
  return(
    <div style={{background:C.navyL,borderRadius:16,border:`1px solid ${tc}15`,padding:"18px",transition:"all .2s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=`${tc}35`;e.currentTarget.style.transform="translateY(-2px)"}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=`${tc}15`;e.currentTarget.style.transform="translateY(0)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <Pill c={C.gold}>{item.emoji} {item.occasion}</Pill>
          {item.token&&item.token!=="SOL"&&<Pill c={tc} sm>{tokenEmoji(item.token)} {item.token}</Pill>}
        </div>
        <span style={{color:C.dim,fontSize:10}}>{item.time}</span>
      </div>
      <p style={{color:C.white,fontSize:13,lineHeight:1.7,fontFamily:"'Playfair Display',serif",fontStyle:"italic",margin:"0 0 12px 0"}}>"{item.message}"</p>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{color:C.dim,fontSize:10}}>{item.from} → {item.to}</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {item.amount&&<Pill c={tc}>{tokenEmoji(item.token)} {item.amount}</Pill>}
          {item.reaction&&<span style={{fontSize:17,background:C.navyM,padding:"3px 9px",borderRadius:20,border:`1px solid ${C.gold}15`}}>{item.reaction}</span>}
          <button onClick={()=>setLiked(!liked)} style={{background:"none",border:"none",fontSize:15,cursor:"pointer",opacity:liked?1:.35,transition:"opacity .2s"}}>{liked?"❤️":"🤍"}</button>
        </div>
      </div>
    </div>
  );
}

function MemCard({ item }) {
  const col=item.type==="received"?C.gold:C.purple;
  const tc=tokenColor(item.token);
  return(
    <div style={{background:C.navyL,borderRadius:14,border:`1px solid ${col}18`,padding:"14px",display:"flex",gap:12}}>
      <div style={{width:42,height:42,borderRadius:11,flexShrink:0,background:`${col}12`,border:`1px solid ${col}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{item.emoji}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
          <Pill c={col} sm>{item.type==="received"?"↓ Received":"↑ Sent"}</Pill>
          {item.token&&<Pill c={tc} sm>{tokenEmoji(item.token)} {item.token}</Pill>}
          <span style={{color:C.dim,fontSize:10}}>{item.date}</span>
        </div>
        <p style={{color:C.white,fontSize:12,fontFamily:"'Playfair Display',serif",fontStyle:"italic",margin:"0 0 7px",lineHeight:1.5}}>"{item.message}"</p>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {item.amount&&<Pill c={tc} sm>{tokenEmoji(item.token)} {item.amount}</Pill>}
          {item.reaction&&<span style={{fontSize:16}}>{item.reaction}</span>}
        </div>
      </div>
    </div>
  );
}

function NotifPanel({ notifs, onClose, onRead }) {
  return(
    <div style={{position:"absolute",right:0,top:50,width:Math.min(290,window.innerWidth-32),background:C.navyL,border:`1px solid ${C.gold}25`,borderRadius:16,padding:16,zIndex:300,boxShadow:`0 24px 60px #00000090`,animation:"fadeIn .2s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:700,color:C.gold}}>Notifications</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:17}}>✕</button>
      </div>
      {notifs.length===0&&<div style={{color:C.dim,fontSize:12,textAlign:"center",padding:"14px 0"}}>All caught up ✓</div>}
      {notifs.map(n=>(
        <div key={n.id} onClick={()=>onRead(n.id)} style={{display:"flex",gap:9,padding:"9px 6px",borderRadius:9,marginBottom:3,cursor:"pointer",background:n.read?"none":`${C.gold}08`}}>
          <span style={{fontSize:18,flexShrink:0}}>{n.emoji}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:C.white,lineHeight:1.5}}>{n.msg}</div><div style={{fontSize:9,color:C.dim,marginTop:2}}>{n.time}</div></div>
          {!n.read&&<div style={{width:6,height:6,borderRadius:"50%",background:C.gold,flexShrink:0,marginTop:4}}/>}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════
export default function App() {
  const [auth,setAuth]=useState("landing");
  const [user,setUser]=useState(null);
  const {wallet,wStatus,wError,txStatus,lastTx,connect,disconnect,refreshBal,mockSend}=usePhantom();

  const [tab,setTab]=useState("home");
  const [showN,setShowN]=useState(false);
  const [notifs,setNotifs]=useState([
    {id:"n1",emoji:"✅",msg:"Your gift to 9bNp…7c2 was claimed",time:"5m ago",read:false},
    {id:"n2",emoji:"💬",msg:"4cZq…8d3 reacted 🥹 to your gift",time:"1h ago",read:false},
    {id:"n3",emoji:"🟣",msg:"500 BOHBOO gift received from 8xKm…3a1",time:"2h ago",read:false},
    {id:"n4",emoji:"💵",msg:"50 USDC gift claimed by 2aWr…5e7",time:"3h ago",read:true},
    {id:"n5",emoji:"⏰",msg:"Time-locked gift released",time:"1d ago",read:true},
  ]);
  const [feed,setFeed]=useState(FEED0);
  const [mems,setMems]=useState(MEM0);
  const [stats,setStats]=useState({gifts:12847,sol:48290,wallets:9312,bohboo:2480000,usdc:85000,usdt:42000});

  // Send flow
  const [step,setStep]=useState(1);
  const [occ,setOcc]=useState(null);
  const [token,setToken]=useState("SOL");
  const [gift,setGift]=useState({to:"",amount:"",msg:"",vis:"private",lock:false,lockDate:"",contrib:[],voice:null});
  const [cIn,setCIn]=useState("");
  const [done,setDone]=useState(false);
  const [gLink]=useState(`giftfi.bohboo.io/claim/${uid()}`);
  const [copied,setCopied]=useState(false);
  const [sending,setSending]=useState(false);
  const [sErr,setSErr]=useState("");

  // Receive demo
  const [rxStep,setRxStep]=useState("open");
  const [rxRx,setRxRx]=useState("");

  // Stats ticker
  useEffect(()=>{
    const t=setInterval(()=>setStats(s=>({...s,
      gifts:s.gifts+Math.floor(Math.random()*3),
      sol:parseFloat((s.sol+Math.random()*.5).toFixed(1)),
      wallets:s.wallets+(Math.random()>.85?1:0),
      bohboo:s.bohboo+Math.floor(Math.random()*800),
      usdc:s.usdc+Math.floor(Math.random()*100),
      usdt:s.usdt+Math.floor(Math.random()*50),
    })),3000);
    return()=>clearInterval(t);
  },[]);

  // Feed ticker
  useEffect(()=>{
    const t=setInterval(()=>{
      const m=LIVE_MSGS[Math.floor(Math.random()*LIVE_MSGS.length)];
      const tk=TOKENS[Math.floor(Math.random()*TOKENS.length)].id;
      const amts={SOL:`${(Math.random()*9+.5).toFixed(1)} SOL`,BOHBOO:`${Math.floor(Math.random()*2000+100)} BOHBOO`,USDC:`${Math.floor(Math.random()*200+10)} USDC`,USDT:`${Math.floor(Math.random()*100+5)} USDT`};
      setFeed(f=>[{...m,id:`f${uid()}`,from:`${uid()}…`,to:`${uid()}…`,amount:Math.random()>.4?amts[tk]:null,token:tk,time:"just now"},...f.slice(0,19)]);
    },10000);
    return()=>clearInterval(t);
  },[]);

  const unread=notifs.filter(n=>!n.read).length;
  const markRead=id=>setNotifs(n=>n.map(x=>x.id===id?{...x,read:true}:x));

  const doSend=async()=>{
    setSErr("");
    setSending(true);
    try {
      const sig=await mockSend(token,gift.amount,gift.to);
      finish(sig);
    } catch(e) {
      setSErr(e.message||"Something went wrong");
      setSending(false); return;
    }
    setSending(false);
  };

  const finish=(sig)=>{
    setDone(true);
    const amtStr=gift.amount?`${gift.amount} ${token}`:null;
    setMems(p=>[{id:`m${uid()}`,type:"sent",occasion:occ?.label||"Gift",emoji:occ?.emoji||"🎁",
      message:gift.msg||"Sending love ✦",to:gift.to||`${uid()}…`,amount:amtStr,token,date:"Today"},...p]);
    if(gift.vis==="public") setFeed(f=>[{id:`f${uid()}`,occasion:occ?.label||"Gift",emoji:occ?.emoji||"🎁",
      message:gift.msg||"Sending love ✦",from:wallet?.short||"You",to:gift.to||`${uid()}…`,
      amount:amtStr,token,reaction:null,time:"just now"},...f]);
    setNotifs(n=>[{id:`n${uid()}`,emoji:tokenEmoji(token),msg:`${token} gift sent! Awaiting claim.`,time:"just now",read:false},...n]);
  };

  const reset=()=>{setStep(1);setOcc(null);setDone(false);setSErr("");setToken("SOL");setGift({to:"",amount:"",msg:"",vis:"private",lock:false,lockDate:"",contrib:[],voice:null});};

  const Toast=()=>{
    if(!txStatus)return null;
    const map={
      pending:{bg:`${C.gold}15`,br:`${C.gold}40`,col:C.gold,icon:"⏳",txt:"Processing…"},
      confirmed:{bg:`${C.green}15`,br:`${C.green}40`,col:C.green,icon:"✅",txt:"Gift sent! (Devnet mock)"},
      failed:{bg:`${C.red}15`,br:`${C.red}40`,col:C.red,icon:"❌",txt:"Failed"},
    };
    const cfg=map[txStatus];if(!cfg)return null;
    return(
      <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",padding:"11px 18px",borderRadius:14,background:cfg.bg,border:`1px solid ${cfg.br}`,color:cfg.col,fontSize:12,fontWeight:700,zIndex:500,display:"flex",alignItems:"center",gap:8,animation:"fadeIn .3s ease",boxShadow:`0 8px 32px #00000060`,whiteSpace:"nowrap",maxWidth:"90vw"}}>
        <span>{cfg.icon}</span><span>{cfg.txt}</span>
        {txStatus==="confirmed"&&lastTx&&<a href={`${EXP}/tx/${lastTx}?cluster=devnet`} target="_blank" rel="noreferrer" style={{color:C.goldL,fontSize:10,marginLeft:3}}>Sim ↗</a>}
      </div>
    );
  };

  // ── LANDING ───────────────────────────────────────────────
  if(!user&&auth==="landing") return(
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",padding:"24px 20px"}}>
      <style>{CSS}</style>
      <Orb s={{width:"80vw",height:"80vw",maxWidth:600,maxHeight:600,background:C.gold,top:-200,right:-200}}/>
      <Orb s={{width:"70vw",height:"70vw",maxWidth:500,maxHeight:500,background:C.purple,bottom:-150,left:-150}}/>
      <div style={{textAlign:"center",animation:"fadeUp .7s ease",maxWidth:500,position:"relative",zIndex:1,width:"100%"}}>
        <div style={{width:72,height:72,borderRadius:20,background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 20px",animation:"float 4s ease infinite",boxShadow:`0 20px 60px ${C.gold}40`}}>✦</div>
        <div style={{display:"inline-block",padding:"4px 14px",borderRadius:20,background:`${C.gold}15`,border:`1px solid ${C.gold}35`,fontSize:9,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:16,fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>Built on Solana · Powered by Love</div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(36px,8vw,64px)",fontWeight:800,lineHeight:1.1,marginBottom:14,background:`linear-gradient(135deg,${C.white} 50%,${C.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>BOHBOO<br/>GIFTFi</h1>
        <p style={{fontSize:"clamp(13px,3vw,15px)",color:C.dim2,lineHeight:1.8,marginBottom:24,fontFamily:"'DM Sans',sans-serif",padding:"0 8px"}}>
          Decentralized social gifting on Solana.<br/>Send SOL, BOHBOO, USDC or USDT with soul.
        </p>
        {/* Token badges */}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:28,flexWrap:"wrap"}}>
          {[{l:"◎ SOL",c:C.gold},{l:"🟣 BOHBOO",c:C.purpL},{l:"💵 USDC",c:C.blue},{l:"💴 USDT",c:C.teal}].map(({l,c})=>(
            <div key={l} style={{padding:"5px 12px",borderRadius:20,background:`${c}15`,border:`1px solid ${c}35`,fontSize:11,color:c,fontWeight:700}}>{l}</div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:36}}>
          <Btn onClick={()=>setAuth("signup")} style={{padding:"13px 30px",fontSize:13}}>✦ Get Started</Btn>
          <Btn ghost onClick={()=>setAuth("login")} style={{padding:"13px 30px",fontSize:13}}>Sign In</Btn>
        </div>
        <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
          {[["12,847+","Gifts"],["48K+","SOL"],["2.4M+","BOHBOO"],["9,312+","Wallets"]].map(([v,l])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:"clamp(16px,4vw,20px)",fontWeight:800,color:C.gold,fontFamily:"'Playfair Display',serif"}}>{v}</div>
              <div style={{fontSize:9,color:C.dim,letterSpacing:1,textTransform:"uppercase",marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if(!user) return <AuthForm isS={auth==="signup"} onSwitch={()=>setAuth(auth==="signup"?"login":"signup")} onSubmit={d=>setUser(d)} onBack={()=>setAuth("landing")}/>;

  // ── MAIN SHELL ────────────────────────────────────────────
  const TABS=[{id:"home",icon:"◈",label:"Home"},{id:"send",icon:"✦",label:"Send"},{id:"feed",icon:"◉",label:"Feed"},{id:"memories",icon:"◇",label:"Memories"},{id:"receive",icon:"🎁",label:"Demo"}];

  return(
    <div style={{minHeight:"100vh",background:C.navy,color:C.white,fontFamily:"'DM Sans',sans-serif",position:"relative",overflow:"hidden"}}>
      <style>{CSS}</style>
      <Orb s={{width:"60vw",height:"60vw",maxWidth:500,maxHeight:500,background:C.gold,top:-180,right:-150}}/>
      <Orb s={{width:"50vw",height:"50vw",maxWidth:400,maxHeight:400,background:C.purple,bottom:80,left:-120}}/>
      <Toast/>

      {/* HEADER */}
      <header style={{position:"sticky",top:0,zIndex:200,background:`${C.navy}EC`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.gold}15`,padding:"0 16px"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58,gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",flexShrink:0}} onClick={()=>setTab("home")}>
            <div style={{width:30,height:30,borderRadius:8,background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:C.navy}}>✦</div>
            <div style={{display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:"clamp(12px,3vw,15px)",fontWeight:800,letterSpacing:.6,fontFamily:"'Playfair Display',serif",color:C.gold,lineHeight:1.1}}>BOHBOO GIFTFi</div>
              <div style={{fontSize:8,color:C.dim,letterSpacing:1.5,textTransform:"uppercase"}}>Devnet</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowN(!showN)} style={{width:34,height:34,borderRadius:9,background:C.navyL,border:`1px solid ${C.gold}22`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🔔</button>
              {unread>0&&<div style={{position:"absolute",top:-3,right:-3,width:15,height:15,borderRadius:"50%",background:C.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"#fff",border:`2px solid ${C.navy}`}}>{unread}</div>}
              {showN&&<NotifPanel notifs={notifs} onClose={()=>setShowN(false)} onRead={markRead}/>}
            </div>
            <WalletBtn wallet={wallet} wStatus={wStatus} wError={wError} connect={connect} disconnect={disconnect} refreshBal={refreshBal}/>
            <button onClick={()=>setUser(null)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:10,fontWeight:600,padding:"5px 8px",borderRadius:7,display:"none"}}
              className="signout-btn">Out</button>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{background:`${C.navyL}90`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.gold}08`,padding:"0 16px",position:"sticky",top:58,zIndex:199,overflowX:"auto"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",gap:1,minWidth:"max-content"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);reset();setRxStep("open");}}
              style={{padding:"12px 14px",background:"none",border:"none",borderBottom:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent",color:tab===t.id?C.gold:C.dim,fontSize:11,fontWeight:tab===t.id?700:500,cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",borderRadius:"6px 6px 0 0",letterSpacing:.3}}>
              <span style={{marginRight:4}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{maxWidth:900,margin:"0 auto",padding:"20px 16px 110px",overflowX:"hidden"}}>

        {/* ── HOME ── */}
        {tab==="home"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            {wStatus!=="connected"&&(
              <div style={{background:`${C.gold}08`,border:`1px solid ${C.gold}22`,borderRadius:14,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:3}}>Connect Phantom</div>
                  <div style={{fontSize:11,color:C.dim2}}>Gift SOL, BOHBOO, USDC or USDT on Devnet</div>
                </div>
                <WalletBtn wallet={wallet} wStatus={wStatus} wError={wError} connect={connect} disconnect={disconnect} refreshBal={refreshBal}/>
              </div>
            )}

            {/* Devnet mock banner */}
            <div style={{background:`${C.blue}10`,border:`1px solid ${C.blue}30`,borderRadius:12,padding:"12px 14px",marginBottom:20,display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0}}>🧪</span>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:C.blue,marginBottom:3}}>Devnet Testing Mode Active</div>
                <div style={{fontSize:11,color:C.dim2,lineHeight:1.5}}>All transactions are simulated. Your real wallet balances show but nothing is deducted. Safe to test freely.</div>
              </div>
            </div>

            {/* BOHBOO + stablecoin promo */}
            <div style={{background:`linear-gradient(135deg,${C.purple}15,${C.navy})`,border:`1px solid ${C.purpL}25`,borderRadius:14,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:4}}>
                {["🟣","💵","💴"].map((e,i)=><span key={i} style={{fontSize:24}}>{e}</span>)}
              </div>
              <div style={{flex:1,minWidth:160}}>
                <div style={{fontSize:12,fontWeight:700,color:C.purpL,marginBottom:3}}>BOHBOO · USDC · USDT Gifting</div>
                <div style={{fontSize:11,color:C.dim2}}>Gift any token. Every gift feels personal.</div>
              </div>
              <Btn onClick={()=>{setTab("send");setToken("BOHBOO");}} style={{padding:"8px 14px",fontSize:11,whiteSpace:"nowrap"}}>Gift Tokens ↗</Btn>
            </div>

            <div style={{textAlign:"center",padding:"20px 0 24px"}}>
              <div style={{display:"inline-block",padding:"3px 14px",borderRadius:20,background:`${C.gold}12`,border:`1px solid ${C.gold}28`,fontSize:9,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:14,fontWeight:700}}>Welcome back, {user.name} ✦</div>
              <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(24px,5vw,44px)",fontWeight:800,lineHeight:1.15,marginBottom:12,background:`linear-gradient(135deg,${C.white} 40%,${C.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Gift Value.<br/>Send Meaning.</h1>
              <p style={{fontSize:13,color:C.dim2,maxWidth:420,margin:"0 auto 22px",lineHeight:1.75,padding:"0 8px"}}>SOL, BOHBOO, USDC, USDT — every gift comes with a message, a voice note, and a memory.</p>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                <Btn onClick={()=>setTab("send")} style={{padding:"12px 24px",fontSize:13}}>✦ Send a Gift</Btn>
                <Btn ghost onClick={()=>setTab("feed")} style={{padding:"12px 24px",fontSize:13}}>Gift Feed</Btn>
              </div>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:28}}>
              {[
                {v:stats.gifts.toLocaleString(),l:"GIFTS"},
                {v:stats.sol.toLocaleString(undefined,{maximumFractionDigits:0}),l:"SOL"},
                {v:`${(stats.bohboo/1000000).toFixed(1)}M`,l:"BOHBOO"},
                {v:`$${(stats.usdc+stats.usdt).toLocaleString()}`,l:"STABLE"},
              ].map(({v,l})=>(
                <div key={l} style={{padding:"14px 10px",borderRadius:12,background:C.navyL,border:`1px solid ${C.gold}15`,textAlign:"center"}}>
                  <div style={{fontSize:"clamp(16px,3vw,20px)",fontWeight:800,color:C.gold,fontFamily:"'Playfair Display',serif"}}>{v}</div>
                  <div style={{fontSize:8,color:C.dim,letterSpacing:1,textTransform:"uppercase",marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>

            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,marginBottom:14}}>What Makes GIFTFi Different</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:28}}>
              {[
                {icon:"🟣💵💴",title:"4 Tokens",desc:"SOL, BOHBOO, USDC, USDT — choose how you give."},
                {icon:"🎙",title:"Voice Messages",desc:"Attach a voice note. Let them hear your heart."},
                {icon:"🤝",title:"Group Gifting",desc:"Multiple people, one gift, one moment."},
                {icon:"⏰",title:"Time Lock",desc:"The gift waits on-chain until the right time."},
                {icon:"🌐",title:"Public Feed",desc:"A living wall of generosity on Solana."},
                {icon:"◇",title:"On-Chain Memory",desc:"Every gift lives forever on-chain."},
              ].map((f,i)=>(
                <div key={i} style={{background:C.navyL,borderRadius:12,border:`1px solid ${C.gold}10`,padding:"16px",transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.gold}30`;e.currentTarget.style.transform="translateY(-2px)"}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=`${C.gold}10`;e.currentTarget.style.transform="translateY(0)"}}>
                  <div style={{fontSize:22,marginBottom:8}}>{f.icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:C.white,marginBottom:5}}>{f.title}</div>
                  <div style={{fontSize:11,color:C.dim2,lineHeight:1.55}}>{f.desc}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18}}>Live Feed</h2>
              <button onClick={()=>setTab("feed")} style={{background:"none",border:"none",color:C.gold,fontSize:11,cursor:"pointer",fontWeight:700}}>All →</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {feed.slice(0,3).map(item=><FeedCard key={item.id} item={item}/>)}
            </div>
          </div>
        )}

        {/* ── SEND ── */}
        {tab==="send"&&(
          <div style={{animation:"fadeIn .3s ease",maxWidth:520,margin:"0 auto"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:5}}>Send a Gift</h2>
            <p style={{color:C.dim2,fontSize:12,marginBottom:14}}>Make someone feel seen. On Solana, forever.</p>

            {/* Wallet + devnet bar */}
            <div style={{background:`${C.navyM}`,border:`1px solid ${wStatus==="connected"?C.green:C.gold}22`,borderRadius:11,padding:"11px 14px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              {wStatus==="connected"&&wallet?(
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>✅ {wallet.short}</span>
                  <span style={{fontSize:10,color:C.dim2}}>◎{wallet.sol}</span>
                  <span style={{fontSize:10,color:C.purpL}}>🟣{wallet.bohboo||"0"}</span>
                  <span style={{fontSize:10,color:C.blue}}>💵{wallet.usdc||"0"}</span>
                  <span style={{fontSize:10,color:C.teal}}>💴{wallet.usdt||"0"}</span>
                </div>
              ):(
                <div style={{fontSize:11,color:C.dim2}}>⚠️ Connect wallet to test gifting</div>
              )}
              {wStatus!=="connected"&&<WalletBtn wallet={wallet} wStatus={wStatus} wError={wError} connect={connect} disconnect={disconnect} refreshBal={refreshBal}/>}
            </div>

            {!done?(
              <>
                {/* Progress */}
                <div style={{display:"flex",gap:5,marginBottom:24}}>
                  {["Occasion","Token + Amount","Extras","Review"].map((s,i)=>(
                    <div key={i} style={{flex:1,textAlign:"center"}}>
                      <div style={{height:3,borderRadius:3,marginBottom:5,transition:"background .3s",background:step>i?C.gold:`${C.gold}20`}}/>
                      <div style={{fontSize:8,letterSpacing:.4,color:step>i?C.gold:C.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s}</div>
                    </div>
                  ))}
                </div>

                {/* Step 1 */}
                {step===1&&(
                  <div style={{animation:"fadeIn .25s ease"}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:12}}>Choose an Occasion</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {OCCASIONS.map(o=>(
                        <button key={o.id} onClick={()=>setOcc(o)}
                          style={{padding:"12px 14px",borderRadius:11,cursor:"pointer",textAlign:"left",background:occ?.id===o.id?`${o.color}15`:C.navyL,border:`1px solid ${occ?.id===o.id?o.color:C.gold+"18"}`,display:"flex",alignItems:"center",gap:9,transition:"all .15s"}}>
                          <span style={{fontSize:20}}>{o.emoji}</span>
                          <span style={{fontSize:12,fontWeight:600,color:occ?.id===o.id?o.color:C.white}}>{o.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2 */}
                {step===2&&(
                  <div style={{animation:"fadeIn .25s ease",display:"flex",flexDirection:"column",gap:14}}>
                    <Field label="Recipient Wallet Address" value={gift.to} placeholder="Solana wallet address…" onChange={e=>setGift({...gift,to:e.target.value})}/>
                    <TokenSelector value={token} onChange={setToken} wallet={wStatus==="connected"?wallet:null}/>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Amount ({token})</div>
                      <div style={{position:"relative"}}>
                        <input value={gift.amount} type="number" placeholder="0.00" onChange={e=>setGift({...gift,amount:e.target.value})}
                          style={{width:"100%",padding:"12px 52px 12px 14px",borderRadius:12,background:C.navyM,border:`2px solid ${tokenColor(token)}40`,color:C.white,fontSize:20,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                        <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:13,fontWeight:700,color:tokenColor(token)}}>{tokenEmoji(token)}</div>
                      </div>
                    </div>
                    <Field label="Personal Message" ta value={gift.msg} rows={3} placeholder="Write something from the heart…" onChange={e=>setGift({...gift,msg:e.target.value})}/>
                  </div>
                )}

                {/* Step 3 */}
                {step===3&&(
                  <div style={{animation:"fadeIn .25s ease",display:"flex",flexDirection:"column",gap:18}}>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Voice Message</div>
                      <VoiceRecorder onRecorded={v=>setGift({...gift,voice:v})}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Visibility</div>
                      <div style={{display:"flex",gap:8}}>
                        {["private","public"].map(vis=>(
                          <button key={vis} onClick={()=>setGift({...gift,vis})}
                            style={{flex:1,padding:"11px",borderRadius:11,cursor:"pointer",transition:"all .15s",background:gift.vis===vis?`${C.gold}15`:C.navyM,border:`1px solid ${gift.vis===vis?C.gold:C.gold+"18"}`,color:gift.vis===vis?C.gold:C.dim2,fontSize:12,fontWeight:700}}>
                            {vis==="private"?"🔒 Private":"🌐 Public"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Time Lock</div>
                        <Toggle val={gift.lock} set={v=>setGift({...gift,lock:v})}/>
                      </div>
                      {gift.lock&&<Field type="date" value={gift.lockDate} onChange={e=>setGift({...gift,lockDate:e.target.value})}/>}
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Group Contributors</div>
                      <div style={{display:"flex",gap:7}}>
                        <input value={cIn} onChange={e=>setCIn(e.target.value)} placeholder="Add wallet address…"
                          style={{flex:1,padding:"10px 12px",borderRadius:9,background:C.navyM,border:`1px solid ${C.gold}18`,color:C.white,fontSize:12,outline:"none"}}/>
                        <button onClick={()=>{if(cIn){setGift({...gift,contrib:[...gift.contrib,cIn]});setCIn("");}}}
                          style={{padding:"10px 14px",borderRadius:9,background:`${C.gold}18`,border:`1px solid ${C.gold}40`,color:C.gold,fontWeight:700,cursor:"pointer",fontSize:12}}>+</button>
                      </div>
                      {gift.contrib.map((c,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",borderRadius:7,background:C.navyM,border:`1px solid ${C.gold}10`,marginTop:6}}>
                          <span style={{fontSize:11,color:C.white}}>🤝 {c.slice(0,22)}{c.length>22?"…":""}</span>
                          <button onClick={()=>setGift({...gift,contrib:gift.contrib.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:13}}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4 */}
                {step===4&&(
                  <div style={{animation:"fadeIn .25s ease"}}>
                    <div style={{background:C.navyL,borderRadius:18,border:`1px solid ${tokenColor(token)}25`,padding:"20px",marginBottom:16}}>
                      <div style={{textAlign:"center",marginBottom:16}}>
                        <div style={{fontSize:40,marginBottom:6}}>{occ?.emoji||"🎁"}</div>
                        <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                          <Pill>{occ?.label||"Gift"}</Pill>
                          <Pill c={tokenColor(token)}>{tokenEmoji(token)} {token}</Pill>
                        </div>
                      </div>
                      {[
                        {l:"To",           v:gift.to||"(no address)"},
                        {l:"Amount",       v:gift.amount?`${gift.amount} ${token}`:"—"},
                        {l:"Voice Note",   v:gift.voice?"✅ Attached":"None"},
                        {l:"Visibility",   v:gift.vis==="public"?"🌐 Public":"🔒 Private"},
                        {l:"Time Lock",    v:gift.lock?gift.lockDate||"Date not set":"None"},
                        {l:"Contributors", v:gift.contrib.length>0?`${gift.contrib.length} added`:"None"},
                        {l:"Mode",         v:"🧪 Devnet Mock"},
                      ].map((r,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.gold}08`,fontSize:12}}>
                          <span style={{color:C.dim2}}>{r.l}</span>
                          <span style={{color:C.white,fontWeight:600,textAlign:"right",maxWidth:"60%",wordBreak:"break-all"}}>{r.v}</span>
                        </div>
                      ))}
                      {gift.msg&&(
                        <div style={{marginTop:14,padding:"12px",background:C.navyM,borderRadius:10}}>
                          <div style={{fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Message</div>
                          <p style={{fontSize:12,fontFamily:"'Playfair Display',serif",fontStyle:"italic",color:C.white,lineHeight:1.65}}>"{gift.msg}"</p>
                        </div>
                      )}
                    </div>
                    {sErr&&<div style={{padding:"10px 14px",borderRadius:9,background:`${C.red}12`,border:`1px solid ${C.red}35`,color:C.red,fontSize:11,marginBottom:12,lineHeight:1.5}}>❌ {sErr}</div>}
                  </div>
                )}

                <div style={{display:"flex",gap:8,marginTop:22}}>
                  {step>1&&<Btn ghost onClick={()=>setStep(step-1)} style={{flex:1,padding:"12px"}}>← Back</Btn>}
                  <Btn onClick={()=>step<4?setStep(step+1):doSend()} disabled={sending} style={{flex:2,padding:"12px"}}>
                    {sending?"Sending…":step===4?"✦ Send Gift →":"Continue →"}
                  </Btn>
                </div>
              </>
            ):(
              <div style={{animation:"fadeIn .4s ease",textAlign:"center"}}>
                <div style={{width:72,height:72,borderRadius:"50%",margin:"0 auto 18px",background:`${tokenColor(token)}15`,border:`2px solid ${tokenColor(token)}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,animation:"float 3s ease infinite"}}>
                  {tokenEmoji(token)}
                </div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:6}}>Gift Sent!</h3>
                <p style={{color:C.dim2,fontSize:12,marginBottom:20,lineHeight:1.7}}>{token} gift simulated on Devnet.<br/>Share the link with your recipient.</p>
                <div style={{background:C.navyM,borderRadius:11,padding:"12px 14px",border:`1px solid ${C.gold}22`,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{flex:1,fontSize:11,color:C.dim2,wordBreak:"break-all"}}>{gLink}</span>
                  <button onClick={()=>{navigator.clipboard?.writeText(gLink);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
                    style={{padding:"6px 12px",borderRadius:7,background:`${C.gold}18`,border:`1px solid ${C.gold}40`,color:copied?C.green:C.gold,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"color .2s"}}>
                    {copied?"✓":"Copy"}
                  </button>
                </div>
                <p style={{fontSize:10,color:C.dim2,marginBottom:20}}>🔔 You'll be notified the moment they claim it.</p>
                <Btn onClick={reset} full>Send Another</Btn>
              </div>
            )}
          </div>
        )}

        {/* ── FEED ── */}
        {tab==="feed"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:8}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:3}}>Gift Feed</h2>
                <p style={{color:C.dim2,fontSize:12}}>SOL, BOHBOO, USDC & USDT — live on Solana.</p>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:C.green,animation:"pulse 2s infinite"}}/>
                <span style={{fontSize:10,color:C.green,fontWeight:600}}>Live</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {feed.map(item=><FeedCard key={item.id} item={item}/>)}
            </div>
          </div>
        )}

        {/* ── MEMORIES ── */}
        {tab==="memories"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:3}}>Memory Wall</h2>
            <p style={{color:C.dim2,fontSize:12,marginBottom:20}}>Your gifting history — on-chain, forever.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginBottom:20}}>
              {[
                {v:mems.filter(m=>m.type==="sent").length,     l:"Sent",    c:C.gold},
                {v:mems.filter(m=>m.type==="received").length, l:"Received",c:C.purpL},
                {v:mems.filter(m=>m.token==="BOHBOO").length,  l:"BOHBOO",  c:C.purple},
                {v:mems.filter(m=>["USDC","USDT"].includes(m.token)).length,l:"Stable",c:C.blue},
              ].map(({v,l,c})=>(
                <div key={l} style={{padding:"12px 8px",borderRadius:12,background:`${c}0D`,border:`1px solid ${c}25`,textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"'Playfair Display',serif"}}>{v}</div>
                  <div style={{fontSize:9,color:C.dim,letterSpacing:.8,textTransform:"uppercase",marginTop:3}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {mems.map(m=><MemCard key={m.id} item={m}/>)}
            </div>
          </div>
        )}

        {/* ── RECEIVE DEMO ── */}
        {tab==="receive"&&(
          <div style={{animation:"fadeIn .3s ease",maxWidth:460,margin:"0 auto"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:3}}>Receiver Experience</h2>
            <p style={{color:C.dim2,fontSize:12,marginBottom:20}}>What your recipient sees when they open a gift link.</p>

            {rxStep==="open"&&(
              <div style={{background:C.navyL,borderRadius:20,border:`1px solid ${C.gold}28`,padding:"28px 22px",textAlign:"center",animation:"glow 3s ease infinite"}}>
                <div style={{fontSize:60,marginBottom:12,animation:"float 3s ease infinite"}}>🎂</div>
                <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:16}}>
                  <Pill>Birthday</Pill><Pill c={C.purpL}>🟣 BOHBOO</Pill>
                </div>
                <div style={{marginTop:4,marginBottom:6,fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase"}}>From</div>
                <div style={{fontSize:12,color:C.white,marginBottom:20,fontWeight:600}}>4cZq…8d3</div>
                <div style={{background:C.navyM,borderRadius:12,padding:"14px",marginBottom:16,border:`1px solid ${C.purpL}18`,textAlign:"left"}}>
                  <div style={{fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Group Gift From</div>
                  {["4cZq…8d3","9fKm…3a1","2aWr…5e7"].map((a,i)=><div key={i} style={{fontSize:11,color:C.white,padding:"4px 0",display:"flex",gap:7}}><span>🤝</span>{a}</div>)}
                </div>
                <div style={{background:C.navyM,borderRadius:12,padding:"14px",marginBottom:16,border:`1px solid ${C.gold}12`,textAlign:"left"}}>
                  <div style={{fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Messages</div>
                  {[{from:"4cZq…8d3",msg:"You've carried this team for years. Today is yours. Happy birthday, legend."},{from:"9fKm…3a1",msg:"Watching you win from day one. Many more to come."}].map((m,i)=>(
                    <div key={i} style={{marginBottom:i===0?12:0}}>
                      <div style={{fontSize:9,color:C.gold,marginBottom:3}}>{m.from}</div>
                      <p style={{fontSize:12,fontFamily:"'Playfair Display',serif",fontStyle:"italic",color:C.white,lineHeight:1.6}}>"{m.msg}"</p>
                    </div>
                  ))}
                </div>
                <div style={{background:C.navyM,borderRadius:12,padding:"12px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:10,border:`1px solid ${C.gold}12`}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:`${C.gold}18`,border:`1px solid ${C.gold}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,cursor:"pointer",flexShrink:0}}>▶</div>
                  <div style={{textAlign:"left"}}><div style={{fontSize:11,color:C.white,fontWeight:600}}>Voice message · 0:24</div><div style={{fontSize:9,color:C.dim2,marginTop:1}}>From 4cZq…8d3</div></div>
                  <div style={{marginLeft:"auto",display:"flex",gap:2}}>{[7,13,5,17,9,13,7,4,11].map((h,i)=><div key={i} style={{width:2,height:h,background:`${C.gold}60`,borderRadius:2}}/>)}</div>
                </div>
                <Btn onClick={()=>setRxStep("reveal")} full style={{fontSize:14,padding:"14px"}}>🎁 Unwrap Gift</Btn>
              </div>
            )}

            {rxStep==="reveal"&&(
              <div style={{animation:"fadeIn .4s ease",textAlign:"center"}}>
                <div style={{background:C.navyL,borderRadius:20,border:`1px solid ${C.purpL}35`,padding:"36px 22px",boxShadow:`0 0 60px ${C.purple}25`}}>
                  <div style={{fontSize:52,marginBottom:12}}>🟣</div>
                  <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:34,color:C.purpL,marginBottom:5}}>1,000 BOHBOO</h3>
                  <p style={{color:C.dim2,fontSize:12,marginBottom:8}}>A birthday gift from your people.</p>
                  <div style={{fontSize:9,color:C.dim,wordBreak:"break-all",marginBottom:24,padding:"7px 12px",background:`${C.purple}10`,borderRadius:8,lineHeight:1.6}}>{MINTS.BOHBOO}</div>
                  <Btn onClick={()=>setRxStep("react")} full style={{fontSize:13,padding:"13px"}}>Connect & Claim</Btn>
                </div>
              </div>
            )}

            {rxStep==="react"&&(
              <div style={{animation:"fadeIn .4s ease"}}>
                <div style={{background:C.navyL,borderRadius:16,border:`1px solid ${C.green}22`,padding:"18px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:`${C.green}15`,border:`1px solid ${C.green}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>✅</div>
                  <div><div style={{fontSize:12,fontWeight:700,color:C.white,marginBottom:2}}>Gift claimed! 🎉</div><div style={{fontSize:11,color:C.dim2}}>1,000 BOHBOO sent to your wallet.</div></div>
                </div>
                <div style={{background:C.navyL,borderRadius:16,border:`1px solid ${C.gold}18`,padding:"20px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.white,marginBottom:14}}>Send a reaction back 💬</div>
                  <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                    {["🥹","❤️","😭","🔥","🫶","🙏","😍","✨"].map(e=>(
                      <button key={e} onClick={()=>setRxRx(rxRx===e?"":e)}
                        style={{width:42,height:42,borderRadius:11,fontSize:20,cursor:"pointer",background:rxRx===e?`${C.gold}20`:C.navyM,border:`1px solid ${rxRx===e?C.gold:C.gold+"18"}`,transition:"all .15s"}}>
                        {e}
                      </button>
                    ))}
                  </div>
                  <Field ta placeholder="Say something back… (optional)" rows={2} style={{marginBottom:12}}/>
                  <Btn onClick={()=>setRxStep("done")} full>Send Reaction</Btn>
                </div>
              </div>
            )}

            {rxStep==="done"&&(
              <div style={{animation:"fadeIn .4s ease",textAlign:"center",padding:"36px 16px"}}>
                <div style={{fontSize:58,marginBottom:14}}>{rxRx||"🥹"}</div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,marginBottom:7}}>Reaction Sent</h3>
                <p style={{color:C.dim2,fontSize:12,marginBottom:24,lineHeight:1.7}}>The sender has been notified. The moment is complete. It lives on-chain now.</p>
                <Btn ghost onClick={()=>{setRxStep("open");setRxRx("");}}>← Demo Again</Btn>
              </div>
            )}
          </div>
        )}
      </main>

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:`${C.navyL}F5`,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.gold}12`,padding:"7px 8px 12px",display:"flex",justifyContent:"space-around"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);reset();setRxStep("open");}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",color:tab===t.id?C.gold:C.dim,padding:"4px 8px",transition:"color .2s",minWidth:0}}>
            <span style={{fontSize:15}}>{t.icon}</span>
            <span style={{fontSize:8,letterSpacing:.4,fontWeight:tab===t.id?700:400,textTransform:"uppercase",whiteSpace:"nowrap"}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AUTH FORM ────────────────────────────────────────────────
function AuthForm({ isS, onSwitch, onSubmit, onBack }) {
  const [form,setForm]=useState({name:"",email:"",password:"",confirm:""});
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const handle=()=>{
    setErr("");
    if(isS){
      if(!form.name.trim())return setErr("Please enter your name.");
      if(!form.email.includes("@"))return setErr("Enter a valid email.");
      if(form.password.length<6)return setErr("Password must be at least 6 characters.");
      if(form.password!==form.confirm)return setErr("Passwords don't match.");
    }else{
      if(!form.email||!form.password)return setErr("Please fill in all fields.");
    }
    setLoading(true);
    setTimeout(()=>{setLoading(false);onSubmit({name:form.name||form.email.split("@")[0],email:form.email});},1200);
  };

  return(
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",position:"relative",overflow:"hidden"}}>
      <style>{CSS}</style>
      <Orb s={{width:"70vw",height:"70vw",maxWidth:500,maxHeight:500,background:C.gold,top:-180,right:-150}}/>
      <Orb s={{width:"60vw",height:"60vw",maxWidth:400,maxHeight:400,background:C.purple,bottom:-100,left:-100}}/>
      <div style={{width:"100%",maxWidth:380,animation:"fadeUp .4s ease",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:48,height:48,borderRadius:14,background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 12px",boxShadow:`0 12px 40px ${C.gold}35`}}>✦</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,color:C.gold}}>BOHBOO GIFTFi</div>
          <div style={{fontSize:12,color:C.dim2,marginTop:5}}>{isS?"Create your account":"Welcome back"}</div>
        </div>
        <div style={{background:C.navyL,borderRadius:20,border:`1px solid ${C.gold}18`,padding:"24px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {isS&&<Field label="Full Name" value={form.name} placeholder="Your name" onChange={e=>setForm({...form,name:e.target.value})}/>}
            <Field label="Email" type="email" value={form.email} placeholder="you@example.com" onChange={e=>setForm({...form,email:e.target.value})}/>
            <Field label="Password" type="password" value={form.password} placeholder="••••••••" onChange={e=>setForm({...form,password:e.target.value})}/>
            {isS&&<Field label="Confirm Password" type="password" value={form.confirm} placeholder="••••••••" onChange={e=>setForm({...form,confirm:e.target.value})}/>}
          </div>
          {err&&<div style={{marginTop:12,padding:"9px 12px",borderRadius:9,background:`${C.red}12`,border:`1px solid ${C.red}35`,color:C.red,fontSize:11,lineHeight:1.5}}>{err}</div>}
          <button onClick={handle} disabled={loading}
            style={{width:"100%",marginTop:18,padding:"13px",borderRadius:11,background:loading?C.navyM:`linear-gradient(135deg,${C.gold},${C.goldD})`,border:"none",color:loading?C.dim:C.navy,fontSize:13,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {loading?(<><div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${C.dim}`,borderTopColor:C.gold,animation:"spin .7s linear infinite"}}/>{isS?"Creating…":"Signing in…"}</>):(isS?"✦ Create Account":"Sign In")}
          </button>
          <div style={{textAlign:"center",marginTop:16,fontSize:11,color:C.dim2}}>
            {isS?"Already have an account? ":"Don't have an account? "}
            <button onClick={onSwitch} style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontWeight:700,fontSize:11}}>{isS?"Sign In":"Sign Up"}</button>
          </div>
        </div>
        <button onClick={onBack} style={{display:"block",margin:"16px auto 0",background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:11}}>← Back</button>
      </div>
    </div>
  );
}
