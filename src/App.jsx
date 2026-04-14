import { useState, useEffect, useRef, useCallback } from "react";

// ─── THEME ───────────────────────────────────────────────────
const C = {
  navy:"#07090F", navyL:"#0D1221", navyM:"#131929", navyB:"#1A2235",
  gold:"#D4A843", goldL:"#E8C068", goldD:"#9A7530", white:"#F0EDE8",
  dim:"#7A7670",  dim2:"#A8A49E",  purple:"#6B4FA0", purpL:"#9B79D0",
  green:"#27AE60", red:"#E74C3C",
};

const RPC            = "https://api.devnet.solana.com";
const EXP            = "https://explorer.solana.com";
const LAM            = 1_000_000_000;
const BOHBOO_MINT    = "4xMXegyso9etbWGyCN9Y73hGBzmVireCBYwnEsivpump";
const TOKEN_PROGRAM  = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_PROGRAM  = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS";
const uid            = () => Math.random().toString(36).slice(2, 8);
const trim           = k  => `${k.slice(0,4)}…${k.slice(-4)}`;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{box-shadow:0 0 20px #D4A84330}50%{box-shadow:0 0 50px #D4A84360}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:#D4A84340;border-radius:4px}
input[type=date]{color-scheme:dark}
`;

// ─── PHANTOM HOOK ────────────────────────────────────────────
function usePhantom() {
  const [wallet,   setWallet]   = useState(null);
  const [wStatus,  setWStatus]  = useState("idle");
  const [wError,   setWError]   = useState("");
  const [txStatus, setTxStatus] = useState(null);
  const [lastTx,   setLastTx]   = useState(null);

  const ph = () => (typeof window !== "undefined" && window.solana?.isPhantom) ? window.solana : null;

  const fetchBal = useCallback(async (pk) => {
    try {
      const r = await fetch(RPC, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[pk,{commitment:"confirmed"}]}),
      });
      const d = await r.json();
      return (d.result?.value || 0) / LAM;
    } catch { return 0; }
  }, []);

  // Fetch BOHBOO token balance
  const fetchBohbooBal = useCallback(async (pk) => {
    try {
      const r = await fetch(RPC, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          jsonrpc:"2.0", id:1,
          method:"getTokenAccountsByOwner",
          params:[pk, {mint: BOHBOO_MINT}, {encoding:"jsonParsed"}],
        }),
      });
      const d = await r.json();
      const accounts = d.result?.value || [];
      if (accounts.length === 0) return "0";
      const amount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString || "0";
      return amount;
    } catch { return "0"; }
  }, []);

  const connect = useCallback(async () => {
    const p = ph();
    if (!p) { setWError("Phantom not found. Install at phantom.app"); setWStatus("error"); return; }
    try {
      setWStatus("connecting"); setWError("");
      const res = await p.connect();
      const pk  = res.publicKey.toString();
      const [sol, bohboo] = await Promise.all([fetchBal(pk), fetchBohbooBal(pk)]);
      const w = { publicKey:pk, short:trim(pk), balance:sol.toFixed(4), bohbooBalance:bohboo };
      setWallet(w); setWStatus("connected");
      try { sessionStorage.setItem("gw", JSON.stringify(w)); } catch {}
    } catch(e) { setWError(e.message || "Rejected"); setWStatus("error"); }
  }, [fetchBal, fetchBohbooBal]);

  const disconnect = useCallback(async () => {
    try { await ph()?.disconnect(); } catch {}
    setWallet(null); setWStatus("idle"); setWError("");
    try { sessionStorage.removeItem("gw"); } catch {}
  }, []);

  const refreshBal = useCallback(async () => {
    if (!wallet) return;
    const [sol, bohboo] = await Promise.all([fetchBal(wallet.publicKey), fetchBohbooBal(wallet.publicKey)]);
    const w = { ...wallet, balance: sol.toFixed(4), bohbooBalance: bohboo };
    setWallet(w);
    try { sessionStorage.setItem("gw", JSON.stringify(w)); } catch {}
  }, [wallet, fetchBal, fetchBohbooBal]);

  // Send SOL
  const sendSOL = useCallback(async (to, sol) => {
    const p = ph();
    if (!p || !wallet) throw new Error("Wallet not connected");
    setTxStatus("pending");
    try {
      const lam = Math.round(sol * LAM);
      const r   = await fetch(RPC, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getLatestBlockhash",params:[{commitment:"confirmed"}]}),
      });
      const d  = await r.json();
      const bh = d.result?.value?.blockhash;
      if (!bh) throw new Error("Blockhash unavailable");
      const buf = new Uint8Array(12);
      buf[0] = 2;
      new DataView(buf.buffer).setBigUint64(4, BigInt(lam), true);
      const tx = {
        feePayer: wallet.publicKey, recentBlockhash: bh,
        instructions: [{
          programId:"11111111111111111111111111111111",
          keys:[{pubkey:wallet.publicKey,isSigner:true,isWritable:true},{pubkey:to,isSigner:false,isWritable:true}],
          data: buf,
        }],
      };
      const { signature } = await p.signAndSendTransaction(tx);
      setLastTx(signature); setTxStatus("confirmed");
      await refreshBal();
      return signature;
    } catch(e) { setTxStatus("failed"); throw e; }
  }, [wallet, refreshBal]);

  // Send BOHBOO tokens via SPL Token transfer
  const sendBohboo = useCallback(async (to, amount) => {
    const p = ph();
    if (!p || !wallet) throw new Error("Wallet not connected");
    setTxStatus("pending");
    try {
      // Get/derive associated token accounts
      const fromATA = await getATA(wallet.publicKey, BOHBOO_MINT);
      const toATA   = await getATA(to, BOHBOO_MINT);

      const r   = await fetch(RPC, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getLatestBlockhash",params:[{commitment:"confirmed"}]}),
      });
      const d  = await r.json();
      const bh = d.result?.value?.blockhash;
      if (!bh) throw new Error("Blockhash unavailable");

      // Check if receiver ATA exists
      const ataInfo = await fetch(RPC, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getAccountInfo",params:[toATA,{encoding:"base64"}]}),
      });
      const ataData = await ataInfo.json();
      const ataExists = ataData.result?.value !== null;

      // Token amount (assume 6 decimals for pump tokens)
      const tokenAmount = BigInt(Math.round(amount * 1_000_000));

      const instructions = [];

      // Create ATA for receiver if it doesn't exist
      if (!ataExists) {
        instructions.push({
          programId: ASSOC_PROGRAM,
          keys: [
            {pubkey: wallet.publicKey, isSigner:true,  isWritable:true},
            {pubkey: toATA,            isSigner:false, isWritable:true},
            {pubkey: to,               isSigner:false, isWritable:false},
            {pubkey: BOHBOO_MINT,      isSigner:false, isWritable:false},
            {pubkey: "11111111111111111111111111111111", isSigner:false, isWritable:false},
            {pubkey: TOKEN_PROGRAM,    isSigner:false, isWritable:false},
          ],
          data: new Uint8Array(0),
        });
      }

      // SPL Token transfer instruction
      const transferData = new Uint8Array(9);
      transferData[0] = 3; // Transfer instruction
      new DataView(transferData.buffer).setBigUint64(1, tokenAmount, true);

      instructions.push({
        programId: TOKEN_PROGRAM,
        keys: [
          {pubkey: fromATA,          isSigner:false, isWritable:true},
          {pubkey: toATA,            isSigner:false, isWritable:true},
          {pubkey: wallet.publicKey, isSigner:true,  isWritable:false},
        ],
        data: transferData,
      });

      const tx = { feePayer: wallet.publicKey, recentBlockhash: bh, instructions };
      const { signature } = await p.signAndSendTransaction(tx);
      setLastTx(signature); setTxStatus("confirmed");
      await refreshBal();
      return signature;
    } catch(e) { setTxStatus("failed"); throw e; }
  }, [wallet, refreshBal]);

  // Derive Associated Token Account address
  const getATA = async (owner, mint) => {
    // Use RPC to derive ATA — in real app use @solana/spl-token findAssociatedTokenAddress
    try {
      const r = await fetch(RPC, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          jsonrpc:"2.0", id:1,
          method:"getTokenAccountsByOwner",
          params:[owner, {mint}, {encoding:"jsonParsed"}],
        }),
      });
      const d = await r.json();
      const accounts = d.result?.value || [];
      if (accounts.length > 0) return accounts[0].pubkey;
      // If no ATA found return a placeholder — real app uses @solana/spl-token
      return `${owner.slice(0,8)}_ata_${mint.slice(0,8)}`;
    } catch { return `${owner.slice(0,8)}_ata`; }
  };

  // Restore session
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("gw");
      if (s) {
        const w = JSON.parse(s); setWallet(w); setWStatus("connected");
        Promise.all([fetchBal(w.publicKey), fetchBohbooBal(w.publicKey)]).then(([sol, bohboo]) => {
          const u = { ...w, balance: sol.toFixed(4), bohbooBalance: bohboo };
          setWallet(u); try { sessionStorage.setItem("gw", JSON.stringify(u)); } catch {}
        });
      }
    } catch {}
  }, [fetchBal, fetchBohbooBal]);

  // Account change listener
  useEffect(() => {
    const p = ph(); if (!p) return;
    const h = pk => {
      if (!pk) { disconnect(); return; }
      const k = pk.toString();
      Promise.all([fetchBal(k), fetchBohbooBal(k)]).then(([sol, bohboo]) => {
        const w = { publicKey:k, short:trim(k), balance:sol.toFixed(4), bohbooBalance:bohboo };
        setWallet(w); try { sessionStorage.setItem("gw", JSON.stringify(w)); } catch {}
      });
    };
    p.on("accountChanged", h);
    return () => p.off?.("accountChanged", h);
  }, [disconnect, fetchBal, fetchBohbooBal]);

  return { wallet, wStatus, wError, txStatus, lastTx, connect, disconnect, refreshBal, sendSOL, sendBohboo };
}

// ─── DATA ────────────────────────────────────────────────────
const OCCASIONS = [
  {id:"birthday",   label:"Birthday",        emoji:"🎂", color:C.gold},
  {id:"graduation", label:"Graduation",      emoji:"🎓", color:C.purple},
  {id:"congrats",   label:"Congratulations", emoji:"🏆", color:C.green},
  {id:"justbecause",label:"Just Because",    emoji:"💛", color:C.goldL},
  {id:"anniversary",label:"Anniversary",     emoji:"💍", color:C.red},
  {id:"christmas",  label:"Christmas",       emoji:"🎄", color:C.green},
  {id:"newborn",    label:"New Born",        emoji:"👶", color:C.purpL},
  {id:"thankyou",   label:"Thank You",       emoji:"🙏", color:C.goldD},
];

const FEED0 = [
  {id:"f1",occasion:"Birthday",      emoji:"🎂",message:"You've carried this team for years. Today is yours. Happy birthday, legend.",from:"8xKm…3a1",to:"9bNp…7c2",amount:null,      token:"SOL",  reaction:"🥹",time:"2m ago"},
  {id:"f2",occasion:"Graduation",    emoji:"🎓",message:"First in the family to get that degree. We always knew you would.",         from:"4cZq…8d3",to:"2aWr…5e7",amount:"5 SOL",  token:"SOL",  reaction:"❤️",time:"14m ago"},
  {id:"f3",occasion:"Just Because",  emoji:"💛",message:"No reason. Just wanted you to know I see how hard you work.",               from:"1fYt…2b9",to:"8cUs…4a1",amount:"500 BOHBOO",token:"BOHBOO",reaction:"😭",time:"1h ago"},
  {id:"f4",occasion:"Congratulations",emoji:"🏆",message:"You built that from nothing. This is just the beginning.",                 from:"6dVs…7f4",to:"3eXp…1c6",amount:"10 SOL",  token:"SOL",  reaction:"🔥",time:"3h ago"},
  {id:"f5",occasion:"Thank You",     emoji:"🙏",message:"You didn't have to help but you did. This one's from the heart.",           from:"5bOq…3d2",to:"9aLm…6f8",amount:"1000 BOHBOO",token:"BOHBOO",reaction:"🫶",time:"5h ago"},
];

const MEM0 = [
  {id:"m1",type:"received",occasion:"Birthday",    emoji:"🎂",message:"Happy birthday legend. Keep winning.",     from:"4cZq…8d3",amount:"2 SOL",      token:"SOL",  reaction:"🥹",date:"Apr 3, 2026"},
  {id:"m2",type:"sent",    occasion:"Graduation",  emoji:"🎓",message:"So proud of you. This is just the start.",to:"9bNp…7c2",  amount:"5 SOL",      token:"SOL",  date:"Mar 22, 2026"},
  {id:"m3",type:"received",occasion:"Just Because",emoji:"💛",message:"You're appreciated more than you know.",  from:"2aWr…5e7",amount:"500 BOHBOO",  token:"BOHBOO",reaction:"❤️",date:"Feb 14, 2026"},
];

const LIVE_MSGS = [
  {emoji:"🎂",occasion:"Birthday",      message:"Happy birthday king. This one's on us.",          reaction:"🥳"},
  {emoji:"💛",occasion:"Just Because",  message:"You didn't ask. That's exactly why.",              reaction:"🫶"},
  {emoji:"🎓",occasion:"Graduation",    message:"Four years of sacrifice. You made it look easy.", reaction:"😭"},
  {emoji:"🏆",occasion:"Congratulations",message:"The idea everyone doubted just shipped.",         reaction:"🔥"},
  {emoji:"🙏",occasion:"Thank You",     message:"You showed up when nobody else did.",              reaction:"❤️"},
];

// ─── ATOMS ───────────────────────────────────────────────────
const Orb   = ({s}) => <div style={{position:"absolute",borderRadius:"50%",filter:"blur(90px)",opacity:.1,pointerEvents:"none",...s}}/>;
const Pill  = ({children, c=C.gold}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,background:`${c}18`,border:`1px solid ${c}35`,color:c,fontSize:11,fontWeight:700,letterSpacing:.4}}>
    {children}
  </span>
);

const Field = ({label, ta, ...p}) => {
  const base = {width:"100%",padding:"13px 16px",borderRadius:12,background:C.navyM,border:`1px solid ${C.gold}28`,color:C.white,fontSize:13,outline:"none",fontFamily:ta?"'Playfair Display',serif":"'DM Sans',sans-serif",lineHeight:ta?1.65:undefined,resize:ta?"none":undefined,boxSizing:"border-box"};
  return (
    <div>
      {label && <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>{label}</div>}
      {ta ? <textarea style={base} onFocus={e=>e.target.style.borderColor=`${C.gold}70`} onBlur={e=>e.target.style.borderColor=`${C.gold}28`} {...p}/>
          : <input    style={base} onFocus={e=>e.target.style.borderColor=`${C.gold}70`} onBlur={e=>e.target.style.borderColor=`${C.gold}28`} {...p}/>}
    </div>
  );
};

const Btn = ({children, ghost, full, danger, disabled, onClick, style:s}) => {
  const bg     = ghost?"none":danger?`${C.red}18`:`linear-gradient(135deg,${C.gold},${C.goldD})`;
  const border = ghost?`1px solid ${C.gold}40`:danger?`1px solid ${C.red}40`:"none";
  const color  = ghost?C.gold:danger?C.red:C.navy;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{padding:"13px 24px",borderRadius:12,fontSize:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",transition:"all .2s",fontFamily:"'DM Sans',sans-serif",background:bg,border,color,width:full?"100%":undefined,opacity:disabled?.6:1,...s}}
      onMouseEnter={e=>{if(!disabled){e.currentTarget.style.opacity=".85";e.currentTarget.style.transform="translateY(-1px)";}}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="translateY(0)";}}>
      {children}
    </button>
  );
};

const Toggle = ({val, set}) => (
  <div onClick={()=>set(!val)} style={{width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0,background:val?C.gold:C.navyM,border:`1px solid ${C.gold}30`}}>
    <div style={{position:"absolute",top:3,left:val?22:3,width:18,height:18,borderRadius:"50%",background:val?C.navy:C.dim,transition:"left .25s"}}/>
  </div>
);

// ─── TOKEN SELECTOR ──────────────────────────────────────────
function TokenSelector({ value, onChange, wallet }) {
  return (
    <div>
      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Gift Token</div>
      <div style={{display:"flex",gap:10}}>
        {/* SOL Option */}
        <button onClick={()=>onChange("SOL")} style={{flex:1,padding:"14px 12px",borderRadius:14,cursor:"pointer",transition:"all .2s",
          background:value==="SOL"?`${C.gold}15`:C.navyM,
          border:`2px solid ${value==="SOL"?C.gold:C.gold+"20"}`,
          display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <div style={{fontSize:24}}>◎</div>
          <div style={{fontSize:13,fontWeight:700,color:value==="SOL"?C.gold:C.white}}>SOL</div>
          {wallet && <div style={{fontSize:10,color:C.dim2}}>{wallet.balance} available</div>}
        </button>

        {/* BOHBOO Option */}
        <button onClick={()=>onChange("BOHBOO")} style={{flex:1,padding:"14px 12px",borderRadius:14,cursor:"pointer",transition:"all .2s",
          background:value==="BOHBOO"?`${C.purple}15`:C.navyM,
          border:`2px solid ${value==="BOHBOO"?C.purpL:C.gold+"20"}`,
          display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <div style={{fontSize:24}}>🟣</div>
          <div style={{fontSize:13,fontWeight:700,color:value==="BOHBOO"?C.purpL:C.white}}>BOHBOO</div>
          {wallet && <div style={{fontSize:10,color:C.dim2}}>{wallet.bohbooBalance || "0"} available</div>}
          <div style={{fontSize:9,color:C.dim,background:`${C.purple}20`,padding:"2px 8px",borderRadius:10,marginTop:2}}>pump.fun token</div>
        </button>
      </div>

      {/* BOHBOO mint info */}
      {value === "BOHBOO" && (
        <div style={{marginTop:10,padding:"10px 14px",borderRadius:10,background:`${C.purple}10`,border:`1px solid ${C.purple}30`}}>
          <div style={{fontSize:9,color:C.dim2,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Token Mint</div>
          <div style={{fontSize:10,color:C.purpL,wordBreak:"break-all",lineHeight:1.5}}>{BOHBOO_MINT}</div>
          <a href={`${EXP}/address/${BOHBOO_MINT}?cluster=devnet`} target="_blank" rel="noreferrer"
            style={{display:"inline-block",marginTop:6,fontSize:10,color:C.gold,textDecoration:"none"}}>
            View on Explorer ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ─── WALLET BUTTON ───────────────────────────────────────────
function WalletBtn({ wallet, wStatus, wError, connect, disconnect, refreshBal }) {
  const [open, setOpen] = useState(false);

  if (wStatus === "connecting") return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:10,background:C.navyM,border:`1px solid ${C.gold}25`}}>
      <div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${C.dim}`,borderTopColor:C.gold,animation:"spin .7s linear infinite"}}/>
      <span style={{fontSize:11,color:C.dim2,fontWeight:600}}>Connecting…</span>
    </div>
  );

  if (wStatus === "connected" && wallet) return (
    <div style={{position:"relative"}}>
      <div onClick={()=>setOpen(!open)}
        style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:10,cursor:"pointer",background:`${C.green}10`,border:`1px solid ${C.green}30`,transition:"background .2s"}}
        onMouseEnter={e=>e.currentTarget.style.background=`${C.green}18`}
        onMouseLeave={e=>e.currentTarget.style.background=`${C.green}10`}>
        <div style={{width:7,height:7,borderRadius:"50%",background:C.green,boxShadow:`0 0 6px ${C.green}`}}/>
        <div>
          <div style={{fontSize:11,color:C.green,fontWeight:700,lineHeight:1}}>{wallet.short}</div>
          <div style={{fontSize:9,color:C.dim2,marginTop:2}}>{wallet.balance} SOL · Devnet</div>
        </div>
        <span style={{fontSize:10,color:C.dim}}>▾</span>
      </div>
      {open && (
        <div style={{position:"absolute",right:0,top:46,width:260,background:C.navyL,border:`1px solid ${C.gold}25`,borderRadius:14,padding:14,zIndex:400,boxShadow:`0 16px 48px #00000090`,animation:"fadeIn .2s ease"}}>
          <div style={{padding:"8px 10px 12px",borderBottom:`1px solid ${C.gold}10`}}>
            <div style={{fontSize:9,color:C.dim2,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Wallet · Devnet</div>
            <div style={{fontSize:10,color:C.white,wordBreak:"break-all",lineHeight:1.5,marginBottom:8}}>{wallet.publicKey}</div>
            {/* Balances */}
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1,padding:"8px",borderRadius:8,background:`${C.gold}10`,border:`1px solid ${C.gold}20`,textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:800,color:C.gold}}>◎ {wallet.balance}</div>
                <div style={{fontSize:9,color:C.dim2,marginTop:2}}>SOL</div>
              </div>
              <div style={{flex:1,padding:"8px",borderRadius:8,background:`${C.purple}10`,border:`1px solid ${C.purple}20`,textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:800,color:C.purpL}}>🟣 {wallet.bohbooBalance||"0"}</div>
                <div style={{fontSize:9,color:C.dim2,marginTop:2}}>BOHBOO</div>
              </div>
            </div>
          </div>
          <button onClick={()=>{refreshBal();setOpen(false);}} style={{width:"100%",padding:"10px",borderRadius:8,background:"none",border:"none",color:C.dim2,fontSize:12,cursor:"pointer",textAlign:"left",marginTop:4}}
            onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>🔄 Refresh Balances</button>
          <a href={`${EXP}/address/${wallet.publicKey}?cluster=devnet`} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}
            style={{display:"block",padding:"10px",borderRadius:8,color:C.dim2,fontSize:12,textDecoration:"none"}}
            onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}10`}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>🔗 View on Explorer</a>
          <button onClick={()=>{disconnect();setOpen(false);}} style={{width:"100%",padding:"10px",borderRadius:8,background:"none",border:"none",color:C.red,fontSize:12,cursor:"pointer",textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background=`${C.red}10`}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>⏏ Disconnect</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{position:"relative"}}>
      <Btn onClick={connect} style={{padding:"8px 16px",fontSize:12}}>👻 Connect Phantom</Btn>
      {wStatus==="error" && wError && (
        <div style={{position:"absolute",right:0,top:46,width:210,padding:"10px 14px",borderRadius:10,background:`${C.red}15`,border:`1px solid ${C.red}35`,color:C.red,fontSize:11,zIndex:300,lineHeight:1.6}}>
          {wError.includes("phantom") ? <span>Phantom not detected. <a href="https://phantom.app" target="_blank" rel="noreferrer" style={{color:C.gold}}>Install ↗</a></span> : wError}
        </div>
      )}
    </div>
  );
}

// ─── VOICE RECORDER ──────────────────────────────────────────
function VoiceRecorder({ onRecorded }) {
  const [state, setState] = useState("idle");
  const [secs,  setSecs]  = useState(0);
  const [bars,  setBars]  = useState(Array(16).fill(4));
  const T=useRef(), B=useRef(), M=useRef(), Ch=useRef([]), A=useRef();

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      M.current=new MediaRecorder(stream); Ch.current=[];
      M.current.ondataavailable = e=>Ch.current.push(e.data);
      M.current.onstop = () => {
        const blob=new Blob(Ch.current,{type:"audio/webm"});
        A.current=new Audio(URL.createObjectURL(blob));
        A.current.onended=()=>setState("recorded");
        stream.getTracks().forEach(t=>t.stop());
        setState("recorded"); onRecorded&&onRecorded(blob);
      };
      M.current.start();
    } catch { setTimeout(()=>stop(true),3000); }
    setState("recording"); setSecs(0);
    T.current=setInterval(()=>setSecs(s=>s+1),1000);
    B.current=setInterval(()=>setBars(Array(16).fill(0).map(()=>Math.random()*24+4)),80);
  };

  const stop = (sim=false) => {
    clearInterval(T.current); clearInterval(B.current);
    if(!sim&&M.current?.state!=="inactive") M.current.stop();
    else { setState("recorded"); onRecorded&&onRecorded("sim"); }
  };

  const del = () => {
    A.current?.pause(); A.current=null;
    setState("idle"); setSecs(0); setBars(Array(16).fill(4));
    onRecorded&&onRecorded(null);
  };

  useEffect(()=>()=>{clearInterval(T.current);clearInterval(B.current);},[]);

  return (
    <div style={{background:C.navyM,borderRadius:14,border:`1px solid ${C.gold}25`,padding:"16px 18px"}}>
      {state==="idle" && (
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <button onClick={start} style={{width:44,height:44,borderRadius:"50%",background:`${C.gold}20`,border:`1px solid ${C.gold}50`,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🎙</button>
          <div><div style={{color:C.white,fontSize:13,fontWeight:600}}>Add a Voice Message</div><div style={{color:C.dim2,fontSize:11,marginTop:2}}>Optional · Tap mic · Max 60s</div></div>
        </div>
      )}
      {state==="recording" && (
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <button onClick={()=>stop()} style={{width:44,height:44,borderRadius:"50%",background:C.red,border:"none",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>⏹</button>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:C.red,animation:"pulse 1s infinite"}}/>
              <span style={{color:C.red,fontSize:12,fontWeight:700}}>Recording {secs}s</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:2,height:28}}>
              {bars.map((h,i)=><div key={i} style={{width:3,height:h,background:C.gold,borderRadius:2,transition:"height .08s"}}/>)}
            </div>
          </div>
        </div>
      )}
      {(state==="recorded"||state==="playing") && (
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <button onClick={()=>{if(A.current){setState("playing");A.current.play();}}} disabled={state==="playing"}
            style={{width:44,height:44,borderRadius:"50%",background:`${C.green}20`,border:`1px solid ${C.green}50`,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:state==="playing"?.6:1}}>
            {state==="playing"?"⏸":"▶"}
          </button>
          <div style={{flex:1}}>
            <div style={{color:C.white,fontSize:13,fontWeight:600}}>Voice message ({secs}s)</div>
            <div style={{height:6,background:C.navyB,borderRadius:3,marginTop:8,overflow:"hidden"}}>
              <div style={{height:"100%",width:state==="playing"?"60%":"100%",background:`linear-gradient(90deg,${C.gold},${C.goldD})`,borderRadius:3,transition:"width 2s"}}/>
            </div>
          </div>
          <button onClick={del} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:18,padding:4}}>🗑</button>
        </div>
      )}
    </div>
  );
}

// ─── CARDS ───────────────────────────────────────────────────
function FeedCard({ item }) {
  const [liked, setLiked] = useState(false);
  const isBohboo = item.token === "BOHBOO";
  return (
    <div style={{background:C.navyL,borderRadius:18,border:`1px solid ${isBohboo?C.purple:C.gold}18`,padding:"20px",transition:"all .2s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=`${isBohboo?C.purple:C.gold}40`;e.currentTarget.style.transform="translateY(-2px)"}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=`${isBohboo?C.purple:C.gold}18`;e.currentTarget.style.transform="translateY(0)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <Pill c={isBohboo?C.purpL:C.gold}>{item.emoji} {item.occasion}</Pill>
        <span style={{color:C.dim,fontSize:11}}>{item.time}</span>
      </div>
      <p style={{color:C.white,fontSize:14,lineHeight:1.7,fontFamily:"'Playfair Display',serif",fontStyle:"italic",margin:"0 0 14px 0"}}>"{item.message}"</p>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{color:C.dim,fontSize:11}}>{item.from} → {item.to}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {item.amount && <Pill c={isBohboo?C.purpL:C.green}>{isBohboo?"🟣":"💎"} {item.amount}</Pill>}
          {item.reaction && <span style={{fontSize:18,background:C.navyM,padding:"4px 10px",borderRadius:20,border:`1px solid ${C.gold}20`}}>{item.reaction}</span>}
          <button onClick={()=>setLiked(!liked)} style={{background:"none",border:"none",fontSize:16,cursor:"pointer",opacity:liked?1:.4,transition:"opacity .2s"}}>{liked?"❤️":"🤍"}</button>
        </div>
      </div>
    </div>
  );
}

function MemCard({ item }) {
  const col = item.type==="received" ? C.gold : C.purple;
  const isBohboo = item.token === "BOHBOO";
  return (
    <div style={{background:C.navyL,borderRadius:14,border:`1px solid ${col}22`,padding:"16px",display:"flex",gap:14}}>
      <div style={{width:46,height:46,borderRadius:12,flexShrink:0,background:`${col}12`,border:`1px solid ${col}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{item.emoji}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
          <Pill c={col}>{item.type==="received"?"↓ Received":"↑ Sent"}</Pill>
          {item.token && <Pill c={isBohboo?C.purpL:C.goldD}>{isBohboo?"🟣 BOHBOO":"◎ SOL"}</Pill>}
          <span style={{color:C.dim,fontSize:11}}>{item.date}</span>
        </div>
        <p style={{color:C.white,fontSize:13,fontFamily:"'Playfair Display',serif",fontStyle:"italic",margin:"0 0 8px",lineHeight:1.5}}>"{item.message}"</p>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {item.amount && <Pill c={isBohboo?C.purpL:C.green}>{isBohboo?"🟣":"💎"} {item.amount}</Pill>}
          {item.reaction && <span style={{fontSize:18}}>{item.reaction}</span>}
        </div>
      </div>
    </div>
  );
}

function NotifPanel({ notifs, onClose, onRead }) {
  return (
    <div style={{position:"absolute",right:0,top:52,width:300,background:C.navyL,border:`1px solid ${C.gold}25`,borderRadius:18,padding:20,zIndex:300,boxShadow:`0 24px 60px #00000080`,animation:"fadeIn .2s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:13,fontWeight:700,color:C.gold}}>Notifications</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      {notifs.length===0 && <div style={{color:C.dim,fontSize:12,textAlign:"center",padding:"16px 0"}}>All caught up ✓</div>}
      {notifs.map(n => (
        <div key={n.id} onClick={()=>onRead(n.id)} style={{display:"flex",gap:10,padding:"10px 8px",borderRadius:10,marginBottom:4,cursor:"pointer",background:n.read?"none":`${C.gold}08`}}>
          <span style={{fontSize:20,flexShrink:0}}>{n.emoji}</span>
          <div style={{flex:1}}><div style={{fontSize:12,color:C.white,lineHeight:1.5}}>{n.msg}</div><div style={{fontSize:10,color:C.dim,marginTop:3}}>{n.time}</div></div>
          {!n.read && <div style={{width:6,height:6,borderRadius:"50%",background:C.gold,flexShrink:0,marginTop:5}}/>}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════
export default function App() {
  const [auth, setAuth] = useState("landing");
  const [user, setUser] = useState(null);
  const { wallet, wStatus, wError, txStatus, lastTx, connect, disconnect, refreshBal, sendSOL, sendBohboo } = usePhantom();

  const [tab,     setTab]     = useState("home");
  const [showN,   setShowN]   = useState(false);
  const [notifs,  setNotifs]  = useState([
    {id:"n1",emoji:"✅",  msg:"Your gift to 9bNp…7c2 was claimed",        time:"5m ago", read:false},
    {id:"n2",emoji:"💬",  msg:"4cZq…8d3 reacted 🥹 to your gift",          time:"1h ago", read:false},
    {id:"n3",emoji:"🟣",  msg:"You received 500 BOHBOO from 8xKm…3a1",     time:"2h ago", read:false},
    {id:"n4",emoji:"🤝",  msg:"8xKm…3a1 added 0.5 SOL to your group gift", time:"3h ago", read:true},
    {id:"n5",emoji:"⏰",  msg:"Time-locked gift released",                  time:"1d ago", read:true},
  ]);
  const [feed,    setFeed]    = useState(FEED0);
  const [mems,    setMems]    = useState(MEM0);
  const [stats,   setStats]   = useState({gifts:12847, sol:48290, wallets:9312, bohboo:2480000});

  // Send flow
  const [step,    setStep]    = useState(1);
  const [occ,     setOcc]     = useState(null);
  const [token,   setToken]   = useState("SOL");
  const [gift,    setGift]    = useState({to:"",amount:"",msg:"",vis:"private",lock:false,lockDate:"",contrib:[],voice:null});
  const [cIn,     setCIn]     = useState("");
  const [done,    setDone]    = useState(false);
  const [gLink]               = useState(`giftfi.bohboo.io/claim/${uid()}`);
  const [copied,  setCopied]  = useState(false);
  const [sending, setSending] = useState(false);
  const [sErr,    setSErr]    = useState("");

  // Receive demo
  const [rxStep,  setRxStep]  = useState("open");
  const [rxRx,    setRxRx]    = useState("");

  // Live stats
  useEffect(() => {
    const t = setInterval(() => setStats(s => ({
      ...s,
      gifts:   s.gifts   + Math.floor(Math.random()*3),
      sol:     parseFloat((s.sol + Math.random()*.5).toFixed(1)),
      wallets: s.wallets + (Math.random()>.85?1:0),
      bohboo:  s.bohboo  + Math.floor(Math.random()*1000),
    })), 3000);
    return () => clearInterval(t);
  }, []);

  // Live feed
  useEffect(() => {
    const t = setInterval(() => {
      const m       = LIVE_MSGS[Math.floor(Math.random()*LIVE_MSGS.length)];
      const isBohb  = Math.random() > .5;
      const amount  = isBohb
        ? `${Math.floor(Math.random()*5000+100)} BOHBOO`
        : `${(Math.random()*9+1).toFixed(1)} SOL`;
      setFeed(f => [{
        ...m, id:`f${uid()}`, from:`${uid()}…`, to:`${uid()}…`,
        amount: Math.random()>.4 ? amount : null,
        token: isBohb ? "BOHBOO" : "SOL",
        time:"just now",
      }, ...f.slice(0,19)]);
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const unread   = notifs.filter(n => !n.read).length;
  const markRead = id => setNotifs(n => n.map(x => x.id===id ? {...x,read:true} : x));

  const doSend = async () => {
    setSErr("");
    if (wStatus==="connected" && wallet && gift.to && gift.amount) {
      setSending(true);
      try {
        if (token === "SOL") {
          await sendSOL(gift.to, parseFloat(gift.amount));
        } else {
          await sendBohboo(gift.to, parseFloat(gift.amount));
        }
        finish();
      } catch(e) {
        setSErr(e.message || "Transaction failed. Check your balance.");
        setSending(false); return;
      }
      setSending(false);
    } else finish();
  };

  const finish = () => {
    setDone(true);
    const amtStr = gift.amount ? `${gift.amount} ${token}` : null;
    setMems(p => [{
      id:`m${uid()}`, type:"sent", occasion:occ?.label||"Gift", emoji:occ?.emoji||"🎁",
      message:gift.msg||"Sending love ✦", to:gift.to||`${uid()}…`,
      amount:amtStr, token, date:"Today",
    }, ...p]);
    if (gift.vis==="public") setFeed(f => [{
      id:`f${uid()}`, occasion:occ?.label||"Gift", emoji:occ?.emoji||"🎁",
      message:gift.msg||"Sending love ✦", from:wallet?.short||"You",
      to:gift.to||`${uid()}…`, amount:amtStr, token, reaction:null, time:"just now",
    }, ...f]);
    setNotifs(n => [{id:`n${uid()}`,emoji:"✅",msg:`${token} gift sent! Awaiting claim.`,time:"just now",read:false}, ...n]);
  };

  const reset = () => {
    setStep(1); setOcc(null); setDone(false); setSErr(""); setToken("SOL");
    setGift({to:"",amount:"",msg:"",vis:"private",lock:false,lockDate:"",contrib:[],voice:null});
  };

  const Toast = () => {
    if (!txStatus) return null;
    const map = {
      pending:   {bg:`${C.gold}15`,  br:`${C.gold}40`,  col:C.gold,  icon:"⏳",txt:"Transaction pending…"},
      confirmed: {bg:`${C.green}15`, br:`${C.green}40`, col:C.green, icon:"✅",txt:"Confirmed on Devnet!"},
      failed:    {bg:`${C.red}15`,   br:`${C.red}40`,   col:C.red,   icon:"❌",txt:"Transaction failed"},
    };
    const cfg = map[txStatus]; if (!cfg) return null;
    return (
      <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",padding:"12px 20px",borderRadius:14,background:cfg.bg,border:`1px solid ${cfg.br}`,color:cfg.col,fontSize:12,fontWeight:700,zIndex:500,display:"flex",alignItems:"center",gap:8,animation:"fadeIn .3s ease",boxShadow:`0 8px 32px #00000060`,whiteSpace:"nowrap"}}>
        <span>{cfg.icon}</span><span>{cfg.txt}</span>
        {txStatus==="confirmed"&&lastTx&&<a href={`${EXP}/tx/${lastTx}?cluster=devnet`} target="_blank" rel="noreferrer" style={{color:C.goldL,fontSize:11,marginLeft:4}}>View ↗</a>}
      </div>
    );
  };

  // ── LANDING ──────────────────────────────────────────────
  if (!user && auth==="landing") return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",padding:24}}>
      <style>{CSS}</style>
      <Orb s={{width:600,height:600,background:C.gold,top:-200,right:-200}}/>
      <Orb s={{width:500,height:500,background:C.purple,bottom:-150,left:-150}}/>
      <Orb s={{width:300,height:300,background:C.goldD,top:"40%",left:"35%"}}/>
      <div style={{textAlign:"center",animation:"fadeUp .7s ease",maxWidth:520,position:"relative",zIndex:1}}>
        <div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 24px",animation:"float 4s ease infinite",boxShadow:`0 20px 60px ${C.gold}40`}}>✦</div>
        <div style={{display:"inline-block",padding:"4px 16px",borderRadius:20,background:`${C.gold}15`,border:`1px solid ${C.gold}35`,fontSize:10,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:20,fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>Built on Solana · Powered by Love</div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(40px,8vw,68px)",fontWeight:800,lineHeight:1.1,marginBottom:16,background:`linear-gradient(135deg,${C.white} 50%,${C.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>BOHBOO<br/>GIFTFi</h1>
        <p style={{fontSize:15,color:C.dim2,lineHeight:1.8,marginBottom:36,fontFamily:"'DM Sans',sans-serif"}}>The first decentralized social gifting protocol on Solana.<br/>Send SOL or BOHBOO tokens with soul — voice notes, group gifts, on-chain memories.</p>

        {/* Token badges */}
        <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:32}}>
          <div style={{padding:"6px 14px",borderRadius:20,background:`${C.gold}15`,border:`1px solid ${C.gold}35`,fontSize:11,color:C.gold,fontWeight:700}}>◎ SOL</div>
          <div style={{padding:"6px 14px",borderRadius:20,background:`${C.purple}15`,border:`1px solid ${C.purpL}35`,fontSize:11,color:C.purpL,fontWeight:700}}>🟣 BOHBOO Token</div>
        </div>

        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginBottom:48}}>
          <Btn onClick={()=>setAuth("signup")} style={{padding:"14px 36px",fontSize:14}}>✦ Get Started</Btn>
          <Btn ghost onClick={()=>setAuth("login")} style={{padding:"14px 36px",fontSize:14}}>Sign In</Btn>
        </div>
        <div style={{display:"flex",gap:24,justifyContent:"center",flexWrap:"wrap"}}>
          {[["12,847+","Gifts Sent"],["48,290+","SOL Gifted"],["2.4M+","BOHBOO Gifted"],["9,312+","Wallets"]].map(([v,l]) => (
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:C.gold,fontFamily:"'Playfair Display',serif"}}>{v}</div>
              <div style={{fontSize:10,color:C.dim,letterSpacing:1,textTransform:"uppercase",marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!user) return (
    <AuthForm isS={auth==="signup"} onSwitch={()=>setAuth(auth==="signup"?"login":"signup")} onSubmit={d=>setUser(d)} onBack={()=>setAuth("landing")}/>
  );

  const TABS = [
    {id:"home",    icon:"◈",label:"Home"},
    {id:"send",    icon:"✦",label:"Send"},
    {id:"feed",    icon:"◉",label:"Feed"},
    {id:"memories",icon:"◇",label:"Memories"},
    {id:"receive", icon:"🎁",label:"Receive Demo"},
  ];

  return (
    <div style={{minHeight:"100vh",background:C.navy,color:C.white,fontFamily:"'DM Sans',sans-serif",position:"relative",overflow:"hidden"}}>
      <style>{CSS}</style>
      <Orb s={{width:500,height:500,background:C.gold,top:-180,right:-150}}/>
      <Orb s={{width:400,height:400,background:C.purple,bottom:80,left:-120}}/>
      <Toast/>

      {/* HEADER */}
      <header style={{position:"sticky",top:0,zIndex:200,background:`${C.navy}E8`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.gold}18`,padding:"0 20px"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:62}}>
          <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setTab("home")}>
            <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:C.navy}}>✦</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,letterSpacing:.8,fontFamily:"'Playfair Display',serif",color:C.gold}}>BOHBOO GIFTFi</div>
              <div style={{fontSize:9,color:C.dim,letterSpacing:2,textTransform:"uppercase"}}>Decentralized Gifting Protocol</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowN(!showN)} style={{width:36,height:36,borderRadius:10,background:C.navyL,border:`1px solid ${C.gold}25`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>🔔</button>
              {unread>0 && <div style={{position:"absolute",top:-4,right:-4,width:17,height:17,borderRadius:"50%",background:C.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",border:`2px solid ${C.navy}`}}>{unread}</div>}
              {showN && <NotifPanel notifs={notifs} onClose={()=>setShowN(false)} onRead={markRead}/>}
            </div>
            <WalletBtn wallet={wallet} wStatus={wStatus} wError={wError} connect={connect} disconnect={disconnect} refreshBal={refreshBal}/>
            <button onClick={()=>setUser(null)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:8}}
              onMouseEnter={e=>e.currentTarget.style.color=C.red}
              onMouseLeave={e=>e.currentTarget.style.color=C.dim}>Sign out</button>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{background:`${C.navyL}90`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.gold}10`,padding:"0 20px",position:"sticky",top:62,zIndex:199}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",gap:2,overflowX:"auto",scrollbarWidth:"none"}}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>{setTab(t.id);reset();setRxStep("open");}}
              style={{padding:"13px 14px",background:"none",border:"none",borderBottom:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent",color:tab===t.id?C.gold:C.dim,fontSize:11,fontWeight:tab===t.id?700:500,cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",borderRadius:"8px 8px 0 0",letterSpacing:.4}}>
              <span style={{marginRight:5}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{maxWidth:900,margin:"0 auto",padding:"28px 20px 120px"}}>

        {/* ── HOME ── */}
        {tab==="home" && (
          <div style={{animation:"fadeIn .35s ease"}}>
            {wStatus!=="connected" && (
              <div style={{background:`${C.gold}08`,border:`1px solid ${C.gold}25`,borderRadius:16,padding:"16px 20px",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:4}}>Connect your Phantom wallet</div>
                  <div style={{fontSize:12,color:C.dim2}}>Send SOL or BOHBOO tokens as gifts on Devnet</div>
                </div>
                <WalletBtn wallet={wallet} wStatus={wStatus} wError={wError} connect={connect} disconnect={disconnect} refreshBal={refreshBal}/>
              </div>
            )}

            {/* BOHBOO token banner */}
            <div style={{background:`linear-gradient(135deg,${C.purple}18,${C.navy})`,border:`1px solid ${C.purpL}30`,borderRadius:16,padding:"16px 20px",marginBottom:24,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <div style={{fontSize:32}}>🟣</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.purpL,marginBottom:4}}>BOHBOO Token Gifting is Live</div>
                <div style={{fontSize:12,color:C.dim2}}>Send BOHBOO tokens as gifts. Make every transaction feel personal.</div>
                <div style={{fontSize:10,color:C.dim,marginTop:4,wordBreak:"break-all"}}>{BOHBOO_MINT}</div>
              </div>
              <Btn onClick={()=>{ setTab("send"); setToken("BOHBOO"); }} style={{padding:"8px 18px",fontSize:12}}>Gift BOHBOO ↗</Btn>
            </div>

            <div style={{textAlign:"center",padding:"28px 20px 24px"}}>
              <div style={{display:"inline-block",padding:"4px 16px",borderRadius:20,background:`${C.gold}12`,border:`1px solid ${C.gold}30`,fontSize:10,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:18,fontWeight:700}}>Welcome back, {user.name} ✦</div>
              <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(28px,5vw,48px)",fontWeight:800,lineHeight:1.15,marginBottom:14,background:`linear-gradient(135deg,${C.white} 40%,${C.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Gift Value.<br/>Send Meaning.</h1>
              <p style={{fontSize:14,color:C.dim2,maxWidth:460,margin:"0 auto 28px",lineHeight:1.75}}>Send SOL or BOHBOO tokens with soul. Messages, voice notes, group gifts, on-chain memories.</p>
              <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
                <Btn onClick={()=>setTab("send")} style={{padding:"13px 28px",fontSize:13}}>✦ Send a Gift</Btn>
                <Btn ghost onClick={()=>setTab("feed")} style={{padding:"13px 28px",fontSize:13}}>View Gift Feed</Btn>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:36}}>
              {[
                {v:stats.gifts.toLocaleString(),l:"GIFTS SENT"},
                {v:stats.sol.toLocaleString(undefined,{maximumFractionDigits:1}),l:"SOL GIFTED"},
                {v:`${(stats.bohboo/1000000).toFixed(1)}M`,l:"BOHBOO GIFTED"},
                {v:stats.wallets.toLocaleString(),l:"WALLETS"},
              ].map(({v,l}) => (
                <div key={l} style={{padding:"18px 14px",borderRadius:14,background:C.navyL,border:`1px solid ${C.gold}18`,textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:C.gold,fontFamily:"'Playfair Display',serif"}}>{v}</div>
                  <div style={{fontSize:9,color:C.dim,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>

            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,marginBottom:16}}>What Makes GIFTFi Different</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:36}}>
              {[
                {icon:"🟣",title:"BOHBOO Token Gifts",desc:"Gift BOHBOO tokens alongside SOL. More ways to show love."},
                {icon:"🎙",title:"Voice Messages",    desc:"Let them hear your heart, not just read words."},
                {icon:"🤝",title:"Group Gifting",     desc:"Pool SOL or BOHBOO from multiple contributors."},
                {icon:"⏰",title:"Time-Locked Gifts", desc:"The gift waits on-chain until the right moment."},
                {icon:"🌐",title:"Public Gift Feed",  desc:"A living wall of generosity on Solana."},
                {icon:"◇", title:"On-Chain Memories", desc:"A permanent history of giving and being loved."},
              ].map((f,i) => (
                <div key={i} style={{background:C.navyL,borderRadius:14,border:`1px solid ${i===0?C.purpL:C.gold}12`,padding:"18px",transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=`${i===0?C.purpL:C.gold}35`;e.currentTarget.style.transform="translateY(-2px)"}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=`${i===0?C.purpL:C.gold}12`;e.currentTarget.style.transform="translateY(0)"}}>
                  <div style={{fontSize:26,marginBottom:10}}>{f.icon}</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:6}}>{f.title}</div>
                  <div style={{fontSize:12,color:C.dim2,lineHeight:1.6}}>{f.desc}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20}}>Live on the Feed</h2>
              <button onClick={()=>setTab("feed")} style={{background:"none",border:"none",color:C.gold,fontSize:12,cursor:"pointer",fontWeight:700}}>View all →</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {feed.slice(0,3).map(item => <FeedCard key={item.id} item={item}/>)}
            </div>
          </div>
        )}

        {/* ── SEND ── */}
        {tab==="send" && (
          <div style={{animation:"fadeIn .35s ease",maxWidth:560,margin:"0 auto"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,marginBottom:6}}>Send a Gift</h2>
            <p style={{color:C.dim2,fontSize:13,marginBottom:16}}>Make someone feel seen. On Solana, forever.</p>

            {/* Wallet bar */}
            <div style={{background:wStatus==="connected"?`${C.green}08`:`${C.gold}08`,border:`1px solid ${wStatus==="connected"?C.green:C.gold}25`,borderRadius:12,padding:"12px 16px",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              {wStatus==="connected" && wallet ? (
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:C.green}}>✅ {wallet.short}</span>
                  <span style={{fontSize:12,color:C.dim2}}>◎ {wallet.balance} SOL</span>
                  <span style={{fontSize:12,color:C.purpL}}>🟣 {wallet.bohbooBalance||"0"} BOHBOO</span>
                </div>
              ) : (
                <div style={{fontSize:12,color:C.dim2}}>⚠️ Connect Phantom to send real gifts</div>
              )}
              {wStatus!=="connected" && <WalletBtn wallet={wallet} wStatus={wStatus} wError={wError} connect={connect} disconnect={disconnect} refreshBal={refreshBal}/>}
            </div>

            {!done ? (
              <>
                {/* Progress */}
                <div style={{display:"flex",gap:6,marginBottom:28}}>
                  {["Occasion","Token & Amount","Extras","Review"].map((s,i) => (
                    <div key={i} style={{flex:1,textAlign:"center"}}>
                      <div style={{height:3,borderRadius:3,marginBottom:6,transition:"background .3s",background:step>i?C.gold:`${C.gold}22`}}/>
                      <div style={{fontSize:9,letterSpacing:.5,color:step>i?C.gold:C.dim}}>{s}</div>
                    </div>
                  ))}
                </div>

                {/* Step 1 — Occasion */}
                {step===1 && (
                  <div style={{animation:"fadeIn .25s ease"}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:14}}>Choose an Occasion</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {OCCASIONS.map(o => (
                        <button key={o.id} onClick={()=>setOcc(o)}
                          style={{padding:"14px 16px",borderRadius:12,cursor:"pointer",textAlign:"left",background:occ?.id===o.id?`${o.color}15`:C.navyL,border:`1px solid ${occ?.id===o.id?o.color:C.gold+"20"}`,display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}>
                          <span style={{fontSize:22}}>{o.emoji}</span>
                          <span style={{fontSize:12,fontWeight:600,color:occ?.id===o.id?o.color:C.white}}>{o.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2 — Token & Amount */}
                {step===2 && (
                  <div style={{animation:"fadeIn .25s ease",display:"flex",flexDirection:"column",gap:16}}>
                    <Field label="Recipient Wallet Address" value={gift.to} placeholder="Solana wallet address…" onChange={e=>setGift({...gift,to:e.target.value})}/>

                    {/* Token selector */}
                    <TokenSelector value={token} onChange={setToken} wallet={wStatus==="connected"?wallet:null}/>

                    {/* Amount */}
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Amount ({token})</div>
                      <div style={{position:"relative"}}>
                        <input value={gift.amount} type="number" placeholder="0.00" onChange={e=>setGift({...gift,amount:e.target.value})}
                          style={{width:"100%",padding:"13px 60px 13px 16px",borderRadius:12,background:C.navyM,border:`1px solid ${token==="BOHBOO"?C.purpL:C.gold}40`,color:C.white,fontSize:20,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                        <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:12,fontWeight:700,color:token==="BOHBOO"?C.purpL:C.gold}}>
                          {token==="BOHBOO"?"🟣":"◎"}
                        </div>
                      </div>
                      {/* Balance check */}
                      {wStatus==="connected" && wallet && gift.amount && (
                        <div style={{fontSize:11,marginTop:6}}>
                          {token==="SOL" ? (
                            parseFloat(gift.amount)>parseFloat(wallet.balance)
                              ? <span style={{color:C.red}}>⚠️ Insufficient — you have {wallet.balance} SOL</span>
                              : <span style={{color:C.green}}>✓ Balance sufficient ({wallet.balance} SOL)</span>
                          ) : (
                            parseFloat(gift.amount)>parseFloat(wallet.bohbooBalance||0)
                              ? <span style={{color:C.red}}>⚠️ Insufficient — you have {wallet.bohbooBalance||"0"} BOHBOO</span>
                              : <span style={{color:C.green}}>✓ Balance sufficient ({wallet.bohbooBalance||"0"} BOHBOO)</span>
                          )}
                        </div>
                      )}
                    </div>

                    <Field label="Personal Message" ta value={gift.msg} rows={4} placeholder="Write something from the heart…" onChange={e=>setGift({...gift,msg:e.target.value})}/>
                  </div>
                )}

                {/* Step 3 — Extras */}
                {step===3 && (
                  <div style={{animation:"fadeIn .25s ease",display:"flex",flexDirection:"column",gap:20}}>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Voice Message</div>
                      <VoiceRecorder onRecorded={v=>setGift({...gift,voice:v})}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Visibility</div>
                      <div style={{display:"flex",gap:10}}>
                        {["private","public"].map(vis => (
                          <button key={vis} onClick={()=>setGift({...gift,vis})}
                            style={{flex:1,padding:"12px",borderRadius:12,cursor:"pointer",transition:"all .15s",background:gift.vis===vis?`${C.gold}15`:C.navyM,border:`1px solid ${gift.vis===vis?C.gold:C.gold+"20"}`,color:gift.vis===vis?C.gold:C.dim2,fontSize:12,fontWeight:700}}>
                            {vis==="private"?"🔒 Private":"🌐 Public Feed"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Time Lock</div>
                        <Toggle val={gift.lock} set={v=>setGift({...gift,lock:v})}/>
                      </div>
                      {gift.lock && <Field type="date" value={gift.lockDate} onChange={e=>setGift({...gift,lockDate:e.target.value})}/>}
                    </div>
                    <div>
                      <div style={{fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Group Contributors</div>
                      <div style={{display:"flex",gap:8}}>
                        <input value={cIn} onChange={e=>setCIn(e.target.value)} placeholder="Add wallet address…"
                          style={{flex:1,padding:"11px 14px",borderRadius:10,background:C.navyM,border:`1px solid ${C.gold}20`,color:C.white,fontSize:12,outline:"none"}}/>
                        <button onClick={()=>{if(cIn){setGift({...gift,contrib:[...gift.contrib,cIn]});setCIn("");}}}
                          style={{padding:"11px 16px",borderRadius:10,background:`${C.gold}18`,border:`1px solid ${C.gold}40`,color:C.gold,fontWeight:700,cursor:"pointer",fontSize:13}}>+ Add</button>
                      </div>
                      {gift.contrib.map((c,i) => (
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:8,background:C.navyM,border:`1px solid ${C.gold}12`,marginTop:8}}>
                          <span style={{fontSize:12,color:C.white}}>🤝 {c.slice(0,24)}{c.length>24?"…":""}</span>
                          <button onClick={()=>setGift({...gift,contrib:gift.contrib.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14}}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4 — Review */}
                {step===4 && (
                  <div style={{animation:"fadeIn .25s ease"}}>
                    <div style={{background:C.navyL,borderRadius:20,border:`1px solid ${token==="BOHBOO"?C.purpL:C.gold}25`,padding:"24px",marginBottom:20}}>
                      <div style={{textAlign:"center",marginBottom:20}}>
                        <div style={{fontSize:44,marginBottom:8}}>{occ?.emoji||"🎁"}</div>
                        <Pill>{occ?.label||"Gift"}</Pill>
                        {" "}
                        <Pill c={token==="BOHBOO"?C.purpL:C.goldD}>{token==="BOHBOO"?"🟣 BOHBOO":"◎ SOL"}</Pill>
                      </div>
                      {[
                        {l:"To",           v:gift.to||"(no address)"},
                        {l:"Amount",       v:gift.amount?`${gift.amount} ${token}`:"—"},
                        {l:"Token",        v:token==="BOHBOO"?"BOHBOO (pump.fun)":"SOL (native)"},
                        {l:"Voice Note",   v:gift.voice?"✅ Attached":"None"},
                        {l:"Visibility",   v:gift.vis==="public"?"🌐 Public":"🔒 Private"},
                        {l:"Time Lock",    v:gift.lock?gift.lockDate||"Date not set":"None"},
                        {l:"Contributors", v:gift.contrib.length>0?`${gift.contrib.length} added`:"None"},
                        {l:"Network",      v:"Solana Devnet"},
                        {l:"Wallet",       v:wStatus==="connected"?wallet.short:"Not connected"},
                      ].map((r,i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.gold}10`,fontSize:13}}>
                          <span style={{color:C.dim2}}>{r.l}</span>
                          <span style={{color:C.white,fontWeight:600}}>{r.v}</span>
                        </div>
                      ))}
                      {gift.msg && (
                        <div style={{marginTop:16,padding:"14px",background:C.navyM,borderRadius:12}}>
                          <div style={{fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Message</div>
                          <p style={{fontSize:13,fontFamily:"'Playfair Display',serif",fontStyle:"italic",color:C.white,lineHeight:1.65}}>"{gift.msg}"</p>
                        </div>
                      )}
                    </div>
                    {sErr && <div style={{padding:"12px 16px",borderRadius:10,background:`${C.red}12`,border:`1px solid ${C.red}35`,color:C.red,fontSize:12,marginBottom:14,lineHeight:1.5}}>❌ {sErr}</div>}
                  </div>
                )}

                <div style={{display:"flex",gap:10,marginTop:26}}>
                  {step>1 && <Btn ghost onClick={()=>setStep(step-1)} style={{flex:1}}>← Back</Btn>}
                  <Btn onClick={()=>step<4?setStep(step+1):doSend()} disabled={sending} style={{flex:2}}>
                    {sending?"Sending…":step===4?"✦ Send Gift →":"Continue →"}
                  </Btn>
                </div>
              </>
            ) : (
              <div style={{animation:"fadeIn .4s ease",textAlign:"center"}}>
                <div style={{width:80,height:80,borderRadius:"50%",margin:"0 auto 20px",background:token==="BOHBOO"?`${C.purple}20`:`${C.gold}15`,border:`2px solid ${token==="BOHBOO"?C.purpL:C.gold}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,animation:"float 3s ease infinite"}}>
                  {token==="BOHBOO"?"🟣":"🎁"}
                </div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:24,marginBottom:8}}>Gift Sent!</h3>
                <p style={{color:C.dim2,fontSize:13,marginBottom:26,lineHeight:1.7}}>
                  {token==="BOHBOO" ? "BOHBOO tokens" : "SOL"} sent on Solana Devnet.<br/>Share the link with your recipient.
                </p>
                {lastTx && (
                  <a href={`${EXP}/tx/${lastTx}?cluster=devnet`} target="_blank" rel="noreferrer" style={{display:"block",marginBottom:16,color:C.gold,fontSize:12,textDecoration:"none"}}>
                    🔗 View transaction on Solana Explorer ↗
                  </a>
                )}
                <div style={{background:C.navyM,borderRadius:12,padding:"14px 16px",border:`1px solid ${C.gold}25`,marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{flex:1,fontSize:12,color:C.dim2,wordBreak:"break-all"}}>{gLink}</span>
                  <button onClick={()=>{navigator.clipboard?.writeText(gLink);setCopied(true);setTimeout(()=>setCopied(false),2000);}}
                    style={{padding:"7px 14px",borderRadius:8,background:`${C.gold}18`,border:`1px solid ${C.gold}40`,color:copied?C.green:C.gold,fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"color .2s"}}>
                    {copied?"✓ Copied":"Copy"}
                  </button>
                </div>
                <p style={{fontSize:11,color:C.dim2,marginBottom:24}}>🔔 You'll be notified the moment they claim it.</p>
                <Btn onClick={reset} full>Send Another Gift</Btn>
              </div>
            )}
          </div>
        )}

        {/* ── FEED ── */}
        {tab==="feed" && (
          <div style={{animation:"fadeIn .35s ease"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:12}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,marginBottom:4}}>Gift Feed</h2>
                <p style={{color:C.dim2,fontSize:13}}>SOL and BOHBOO gifts — live on Solana.</p>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:C.green,animation:"pulse 2s infinite"}}/>
                <span style={{fontSize:11,color:C.green,fontWeight:600}}>Live</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {feed.map(item => <FeedCard key={item.id} item={item}/>)}
            </div>
          </div>
        )}

        {/* ── MEMORIES ── */}
        {tab==="memories" && (
          <div style={{animation:"fadeIn .35s ease"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,marginBottom:4}}>Memory Wall</h2>
            <p style={{color:C.dim2,fontSize:13,marginBottom:24}}>Your history of giving and being loved — on-chain, forever.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:24}}>
              {[
                {v:mems.filter(m=>m.type==="sent").length,                l:"Gifts Sent",    c:C.gold},
                {v:mems.filter(m=>m.type==="received").length,            l:"Received",      c:C.purpL},
                {v:mems.filter(m=>m.token==="BOHBOO").length,             l:"BOHBOO Gifts",  c:C.purple},
                {v:mems.filter(m=>m.token!=="BOHBOO"&&m.amount).length,   l:"SOL Gifts",     c:C.green},
              ].map(({v,l,c}) => (
                <div key={l} style={{padding:"14px",borderRadius:14,background:`${c}0E`,border:`1px solid ${c}28`,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"'Playfair Display',serif"}}>{v}</div>
                  <div style={{fontSize:9,color:C.dim,letterSpacing:.8,textTransform:"uppercase",marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {mems.map(m => <MemCard key={m.id} item={m}/>)}
            </div>
          </div>
        )}

        {/* ── RECEIVE DEMO ── */}
        {tab==="receive" && (
          <div style={{animation:"fadeIn .35s ease",maxWidth:480,margin:"0 auto"}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,marginBottom:4}}>Receiver Experience</h2>
            <p style={{color:C.dim2,fontSize:13,marginBottom:24}}>What your recipient sees when they open a gift link.</p>

            {rxStep==="open" && (
              <div style={{background:C.navyL,borderRadius:24,border:`1px solid ${C.gold}30`,padding:"36px 28px",textAlign:"center",animation:"glow 3s ease infinite"}}>
                <div style={{fontSize:68,marginBottom:16,animation:"float 3s ease infinite"}}>🎂</div>
                <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16}}>
                  <Pill>Birthday</Pill>
                  <Pill c={C.purpL}>🟣 BOHBOO Gift</Pill>
                </div>
                <div style={{marginTop:4,marginBottom:8,fontSize:10,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase"}}>From</div>
                <div style={{fontSize:13,color:C.white,marginBottom:24,fontWeight:600}}>4cZq…8d3</div>
                <div style={{background:C.navyM,borderRadius:14,padding:"16px",marginBottom:20,border:`1px solid ${C.purpL}20`,textAlign:"left"}}>
                  <div style={{fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Group Gift From</div>
                  {["4cZq…8d3","9fKm…3a1","2aWr…5e7"].map((a,i) => <div key={i} style={{fontSize:12,color:C.white,padding:"5px 0",display:"flex",gap:8}}><span>🤝</span>{a}</div>)}
                </div>
                <div style={{background:C.navyM,borderRadius:14,padding:"18px",marginBottom:20,border:`1px solid ${C.gold}15`,textAlign:"left"}}>
                  <div style={{fontSize:9,color:C.dim2,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12}}>Their Messages</div>
                  {[
                    {from:"4cZq…8d3",msg:"You've carried this team for years. Today is yours. Happy birthday, legend."},
                    {from:"9fKm…3a1",msg:"Watching you win from day one. Many more to come."},
                  ].map((m,i) => (
                    <div key={i} style={{marginBottom:i===0?14:0}}>
                      <div style={{fontSize:9,color:C.gold,marginBottom:4}}>{m.from}</div>
                      <p style={{fontSize:13,fontFamily:"'Playfair Display',serif",fontStyle:"italic",color:C.white,lineHeight:1.65}}>"{m.msg}"</p>
                    </div>
                  ))}
                </div>
                <div style={{background:C.navyM,borderRadius:14,padding:"14px 16px",marginBottom:24,display:"flex",alignItems:"center",gap:12,border:`1px solid ${C.gold}15`}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:`${C.gold}18`,border:`1px solid ${C.gold}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,cursor:"pointer",flexShrink:0}}>▶</div>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:12,color:C.white,fontWeight:600}}>Voice message · 0:24</div>
                    <div style={{fontSize:10,color:C.dim2,marginTop:2}}>From 4cZq…8d3</div>
                  </div>
                  <div style={{marginLeft:"auto",display:"flex",gap:2}}>
                    {[8,14,6,18,10,14,8,5,12].map((h,i) => <div key={i} style={{width:3,height:h,background:`${C.gold}60`,borderRadius:2}}/>)}
                  </div>
                </div>
                <Btn onClick={()=>setRxStep("reveal")} full style={{fontSize:15,padding:"16px"}}>🎁 Unwrap Gift</Btn>
              </div>
            )}

            {rxStep==="reveal" && (
              <div style={{animation:"fadeIn .4s ease",textAlign:"center"}}>
                <div style={{background:C.navyL,borderRadius:24,border:`1px solid ${C.purpL}35`,padding:"40px 28px",boxShadow:`0 0 80px ${C.purple}30`}}>
                  <div style={{fontSize:60,marginBottom:16}}>🟣</div>
                  <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:38,color:C.purpL,marginBottom:6}}>1,000 BOHBOO</h3>
                  <p style={{color:C.dim2,fontSize:13,marginBottom:8}}>A birthday gift from your people.</p>
                  <div style={{fontSize:10,color:C.dim,wordBreak:"break-all",marginBottom:28,padding:"8px 14px",background:`${C.purple}10`,borderRadius:8}}>
                    {BOHBOO_MINT}
                  </div>
                  <Btn onClick={()=>setRxStep("react")} full style={{fontSize:14,padding:"15px"}}>Connect Wallet & Claim</Btn>
                </div>
              </div>
            )}

            {rxStep==="react" && (
              <div style={{animation:"fadeIn .4s ease"}}>
                <div style={{background:C.navyL,borderRadius:20,border:`1px solid ${C.green}25`,padding:"20px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:42,height:42,borderRadius:"50%",background:`${C.green}15`,border:`1px solid ${C.green}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>✅</div>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:3}}>Gift claimed! 🎉</div>
                    <div style={{fontSize:12,color:C.dim2}}>1,000 BOHBOO tokens sent to your wallet.</div>
                  </div>
                </div>
                <div style={{background:C.navyL,borderRadius:20,border:`1px solid ${C.gold}20`,padding:"24px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.white,marginBottom:16}}>Send a reaction back 💬</div>
                  <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                    {["🥹","❤️","😭","🔥","🫶","🙏","😍","✨"].map(e => (
                      <button key={e} onClick={()=>setRxRx(rxRx===e?"":e)}
                        style={{width:44,height:44,borderRadius:12,fontSize:22,cursor:"pointer",background:rxRx===e?`${C.gold}20`:C.navyM,border:`1px solid ${rxRx===e?C.gold:C.gold+"20"}`,transition:"all .15s"}}>
                        {e}
                      </button>
                    ))}
                  </div>
                  <Field ta placeholder="Say something back… (optional)" rows={2} style={{marginBottom:14}}/>
                  <Btn onClick={()=>setRxStep("done")} full>Send Reaction</Btn>
                </div>
              </div>
            )}

            {rxStep==="done" && (
              <div style={{animation:"fadeIn .4s ease",textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:64,marginBottom:16}}>{rxRx||"🥹"}</div>
                <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:24,marginBottom:8}}>Reaction Sent</h3>
                <p style={{color:C.dim2,fontSize:13,marginBottom:28,lineHeight:1.7}}>The sender has been notified. The moment is complete. It lives on-chain now.</p>
                <Btn ghost onClick={()=>{setRxStep("open");setRxRx("");}}>← Demo Again</Btn>
              </div>
            )}
          </div>
        )}
      </main>

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:`${C.navyL}F0`,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.gold}15`,padding:"8px 10px 14px",display:"flex",justifyContent:"space-around"}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>{setTab(t.id);reset();setRxStep("open");}}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",color:tab===t.id?C.gold:C.dim,padding:"5px 10px",transition:"color .2s"}}>
            <span style={{fontSize:16}}>{t.icon}</span>
            <span style={{fontSize:8,letterSpacing:.5,fontWeight:tab===t.id?700:400,textTransform:"uppercase"}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AUTH FORM ───────────────────────────────────────────────
function AuthForm({ isS, onSwitch, onSubmit, onBack }) {
  const [form,    setForm]    = useState({name:"",email:"",password:"",confirm:""});
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const handle = () => {
    setErr("");
    if (isS) {
      if (!form.name.trim())              return setErr("Please enter your name.");
      if (!form.email.includes("@"))      return setErr("Enter a valid email.");
      if (form.password.length < 6)       return setErr("Password must be at least 6 characters.");
      if (form.password !== form.confirm) return setErr("Passwords don't match.");
    } else {
      if (!form.email || !form.password)  return setErr("Please fill in all fields.");
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSubmit({ name: form.name || form.email.split("@")[0], email: form.email });
    }, 1200);
  };

  return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative",overflow:"hidden"}}>
      <style>{CSS}</style>
      <Orb s={{width:500,height:500,background:C.gold,top:-180,right:-150}}/>
      <Orb s={{width:400,height:400,background:C.purple,bottom:-100,left:-100}}/>
      <div style={{width:"100%",maxWidth:400,animation:"fadeUp .4s ease",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${C.gold},${C.goldD})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px",boxShadow:`0 12px 40px ${C.gold}35`}}>✦</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:800,color:C.gold}}>BOHBOO GIFTFi</div>
          <div style={{fontSize:13,color:C.dim2,marginTop:6}}>{isS?"Create your account":"Welcome back"}</div>
        </div>
        <div style={{background:C.navyL,borderRadius:24,border:`1px solid ${C.gold}20`,padding:"28px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {isS && <Field label="Full Name" value={form.name} placeholder="Your name" onChange={e=>setForm({...form,name:e.target.value})}/>}
            <Field label="Email" type="email" value={form.email} placeholder="you@example.com" onChange={e=>setForm({...form,email:e.target.value})}/>
            <Field label="Password" type="password" value={form.password} placeholder="••••••••" onChange={e=>setForm({...form,password:e.target.value})}/>
            {isS && <Field label="Confirm Password" type="password" value={form.confirm} placeholder="••••••••" onChange={e=>setForm({...form,confirm:e.target.value})}/>}
          </div>
          {err && <div style={{marginTop:14,padding:"10px 14px",borderRadius:10,background:`${C.red}12`,border:`1px solid ${C.red}35`,color:C.red,fontSize:12,lineHeight:1.5}}>{err}</div>}
          <button onClick={handle} disabled={loading}
            style={{width:"100%",marginTop:20,padding:"14px",borderRadius:12,background:loading?C.navyM:`linear-gradient(135deg,${C.gold},${C.goldD})`,border:"none",color:loading?C.dim:C.navy,fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {loading
              ? <><div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${C.dim}`,borderTopColor:C.gold,animation:"spin .7s linear infinite"}}/>{isS?"Creating account…":"Signing in…"}</>
              : (isS?"✦ Create Account":"Sign In")}
          </button>
          <div style={{textAlign:"center",marginTop:20,fontSize:12,color:C.dim2}}>
            {isS?"Already have an account? ":"Don't have an account? "}
            <button onClick={onSwitch} style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontWeight:700,fontSize:12}}>{isS?"Sign In":"Sign Up"}</button>
          </div>
        </div>
        <button onClick={onBack} style={{display:"block",margin:"20px auto 0",background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:12}}>← Back to home</button>
      </div>
    </div>
  );
}
