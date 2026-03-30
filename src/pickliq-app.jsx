import React, { useState, useRef, useEffect } from "react";

// ── Supabase client ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://orifhmwlasencdgmeouu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yaWZobXdsYXNlbmNkZ21lb3V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTQwOTUsImV4cCI6MjA4ODgzMDA5NX0.Do_WRC5e2zxTXfwkZ7-oy-6WAy0_l3qJwrMl-EpXBTE";

// ── Auth token management ────────────────────────────────────────────────────
let _authToken = null; // set after login, used in all requests

// Extract user ID from JWT without a library
const getCurrentUserId = () => {
  if (!_authToken) return null;
  try {
    const payload = JSON.parse(atob(_authToken.split(".")[1]));
    return payload.sub || null;
  } catch(e) { return null; }
};

// Check if token is expired or about to expire (within 5 minutes)
const isTokenExpired = () => {
  if (!_authToken) return true;
  try {
    const payload = JSON.parse(atob(_authToken.split(".")[1]));
    const expiresAt = payload.exp * 1000; // convert to ms
    return Date.now() > expiresAt - 5 * 60 * 1000; // refresh if <5min left
  } catch(e) { return true; }
};

// Ensure token is fresh before any DB write — refreshes automatically if needed
const ensureFreshToken = async () => {
  if (!isTokenExpired()) return true;
  try {
    const refresh = localStorage.getItem("pi_refresh");
    if (!refresh) return false;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    const data = await res.json();
    if (!res.ok) return false;
    _authToken = data.access_token;
    localStorage.setItem("pi_token", data.access_token);
    localStorage.setItem("pi_refresh", data.refresh_token);
    return true;
  } catch(e) { return false; }
};

const getAuthHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${_authToken || SUPABASE_KEY}`,
});

const sb = {
  // ── Auth methods ──────────────────────────────────────────────────────────
  async signUp(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || "Sign up failed");
    if (data.access_token) _authToken = data.access_token;
    return data;
  },
  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || "Sign in failed");
    _authToken = data.access_token;
    // Persist session
    localStorage.setItem("pi_token", data.access_token);
    localStorage.setItem("pi_refresh", data.refresh_token);
    return data;
  },
  async refreshSession(refreshToken) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error("Session expired");
    _authToken = data.access_token;
    localStorage.setItem("pi_token", data.access_token);
    localStorage.setItem("pi_refresh", data.refresh_token);
    return data;
  },
  async getUser() {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${_authToken}` },
    });
    if (!res.ok) return null;
    return res.json();
  },
  signOut() {
    _authToken = null;
    localStorage.removeItem("pi_token");
    localStorage.removeItem("pi_refresh");
  },

  // ── Data methods (now auth-aware) ─────────────────────────────────────────
  async query(table, options = {}) {
    const { select = "*", filter, order, single } = options;
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
    if (filter) url += `&${filter}`;
    if (order) url += `&order=${order}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders(), Accept: single ? "application/vnd.pgrst.object+json" : "application/json" },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async insert(table, data) {
    await ensureFreshToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async update(table, data, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async upsert(table, data, conflictCol="id") {
    await ensureFreshToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCol}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async delete(table, filter) {
    await ensureFreshToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },
};


// ── Responsive hook — defined FIRST so all components can use it ──────────────
// matchMedia reads correctly on first paint in mobile Safari (unlike innerWidth)
const mq = typeof window !== "undefined" ? window.matchMedia("(max-width: 700px)") : {matches:false};
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(mq.matches);
  useEffect(() => {
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
};

const C = {
  pageBg:"#F4F7F4", cardBg:"#FFFFFF", darkBg:"#0A1628", darkCard:"#111E35", darkBorder:"#1E2D45",
  pickle:"#C5E84A", pickleD:"#A8CC2E", navy:"#0A1628", navyMid:"#162440",
  blue:"#3B6FE8", blueL:"#EEF3FD", mint:"#2DD4A0", mintL:"#E8FAF5",
  amber:"#F5A623", amberL:"#FEF6E8", rose:"#F05A7A", roseL:"#FEF0F3",
  purple:"#9B5FE8", purpleL:"#F3EEFE",
  text:"#111827", textMid:"#4B5563", textLight:"#9CA3AF", border:"#E5E9F0",
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{overflow-x:hidden;max-width:100%;width:100%;}
  #root{overflow-x:hidden;width:100%;}
  body{background:${C.pageBg};color:${C.text};font-family:'Outfit',sans-serif;}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:${C.pageBg};}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
  input,textarea,select{font-family:'Outfit',sans-serif;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .fade-up{animation:fadeUp 0.35s ease both;}
  .hover-lift{transition:transform 0.18s,box-shadow 0.18s;}
  .hover-lift:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.08)!important;}
  .btn-p{transition:all 0.15s;cursor:pointer;}
  .btn-p:hover{background:${C.pickleD}!important;transform:translateY(-1px);}
  .nav-btn{transition:all 0.15s;cursor:pointer;border:none;font-family:'Outfit',sans-serif;}
  .nav-btn:hover{color:${C.navy}!important;}
  .chip:hover{background:#E8F4D0!important;border-color:${C.pickle}!important;}
  .row:hover{background:${C.pageBg}!important;cursor:pointer;}
  textarea:focus,input:focus{outline:none;}

  /* ── Mobile responsive ── */
  @media(max-width:700px){
    .page-wrap{padding:16px!important;max-width:100%!important;}
    .r-grid{display:flex!important;flex-direction:column!important;}
    .r-grid-2{grid-template-columns:1fr!important;}
    .r-grid-3{grid-template-columns:1fr 1fr!important;}
    .r-grid-5{grid-template-columns:1fr 1fr!important;}
    .r-sidebar{grid-template-columns:1fr!important;}
    .r-sidebar > *:first-child{margin-bottom:0;}
    .r-hide{display:none!important;}
    .r-full{width:100%!important;max-width:100%!important;}
    .r-stack{flex-direction:column!important;align-items:stretch!important;}
    .r-stack > *{width:100%!important;}
    .nav-scroll{overflow-x:auto!important;-webkit-overflow-scrolling:touch;}
    .nav-scroll::-webkit-scrollbar{display:none;}
    .modal-inner{width:100%!important;max-width:100%!important;max-height:92vh!important;border-radius:16px!important;}
    .modal-wrap{align-items:center!important;padding:12px!important;}
    .page-wrap{padding:16px!important;}
    .tab-bar{overflow-x:auto!important;-webkit-overflow-scrolling:touch;width:100%!important;}
    .tab-bar::-webkit-scrollbar{display:none;}
    /* shot-table-row columns now set inline */
    .shots-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch;}
    .shots-table-wrap .shot-col-hide{display:none!important;}
    .shots-header,.shots-row{min-width:480px;}
    .kpi-strip{grid-template-columns:1fr 1fr!important;gap:10px!important;}
  }
`;

// ── SHOT DATA: wins = points won (you finished the rally); misses = points lost (you finished the rally unsuccessfully) ──
// Both tracked as raw counts (not %). winHistory/missHistory = 4-week weekly counts.
const SHOT_CATS = [
  { id:"4th",     label:"4th Shot",   color:C.blue,   icon:"🎯", shots:[
    { name:"4th Shot Backhand", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Stay low through contact, push don't flick" },
    { name:"4th Shot Forehand", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Most reliable — keep building on this" }]},
  { id:"counter", label:"Counter",    color:C.purple, icon:"⚡", shots:[
    { name:"Counter BH", attempts:0, misses:0, wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Too much arm — add body rotation" },
    { name:"Counter FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Improving — keep paddle up early" }]},
  { id:"dink",    label:"Dink",       color:C.mint,   icon:"🏓", shots:[
    { name:"Dink BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Elite rate — maintain NVZ patience" },
    { name:"Dink FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Your best shot. Use it to set up attacks" }]},
  { id:"drive",   label:"Drive",      color:C.amber,  icon:"💥", shots:[
    { name:"Drive BH", attempts:0, misses:0, wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"High error rate — only drive when opponent is out of position" },
    { name:"Drive FH", attempts:0, misses:0, wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Down-the-line drives going wide — aim 2ft inside the line" }]},
  { id:"drop",    label:"Drop",       color:C.blue,   icon:"🌊", shots:[
    { name:"Drop BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Big improvement! Land in the first 3ft past the NVZ line" },
    { name:"Drop FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"3rd shot drop becoming a real weapon" }]},
  { id:"lob",     label:"Lob",        color:C.purple, icon:"🌙", shots:[
    { name:"Lob BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Low %. Use only when opponents crowd the NVZ" },
    { name:"Lob FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Marginal improvement — be selective" }]},
  { id:"reset",   label:"Reset",      color:C.mint,   icon:"🔄", shots:[
    { name:"Reset BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Priority drill: reset BH from mid-court pressure" },
    { name:"Reset FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Soft hands developing — good progress" }]},
  { id:"scramble",label:"Scramble",   color:C.rose,   icon:"🏃", shots:[
    { name:"Scramble BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Prioritize getting ball back over winning the point" },
    { name:"Scramble FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Great recovery tool — use topspin to get depth" }]},
  { id:"serve",   label:"Serve",      color:C.amber,  icon:"🎾", shots:[
    { name:"Serve",     attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Solid. Target deep to backhand corner more" }]},
  { id:"return",  label:"Return",     color:C.mint,   icon:"↩️", shots:[
    { name:"Return BH", attempts:0, misses:0, wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Return quality dropping — get deeper, aim for feet" },
    { name:"Return FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Good rate. Depth is priority over power" }]},
  { id:"erne",    label:"Erne",       color:C.rose,   icon:"🌪️", shots:[
    { name:"Erne BH",   attempts:0,  misses:0,  wins:0,  missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Low attempts but high reward — drill the jump timing off the kitchen corner" },
    { name:"Erne FH",   attempts:0,  misses:0,  wins:0,  missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Your better side. Disguise the approach or opponent will lob" }]},
  { id:"atp",     label:"ATP",        color:C.blue,   icon:"🔄", shots:[
    { name:"ATP BH",    attempts:0,  misses:0,  wins:0,  missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"High-risk, high-reward. Only attempt when ball is clearly beyond the post" },
    { name:"ATP FH",    attempts:0,  misses:0,  wins:0,  missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Better trend — commit fully or the ball clips the net" }]},
  { id:"slam",    label:"Slam",       color:C.rose,   icon:"🔥", shots:[
    { name:"Slam BH", attempts:0,  misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Very low %. Only attempt above shoulder height" },
    { name:"Slam FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Improving — weight forward at contact" }]},
  { id:"speedup", label:"Speed Up",   color:C.blue,   icon:"⚡", shots:[
    { name:"Speed Up BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Only speed up when you'd win 70%+ — Ben Johns principle" },
    { name:"Speed Up FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Better timing — still pick spots carefully" }]},
  { id:"volley",  label:"Volley",     color:C.purple, icon:"🏐", shots:[
    { name:"Volley BH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Good trend. Compact swing — block don't swing" },
    { name:"Volley FH", attempts:0, misses:0,  wins:0, missHistory:[0,0,0,0], winHistory:[0,0,0,0], tip:"Work on volley-to-dink transitions" }]},
];

// ── SHARED GOALS STATE (module-level so Profile edits flow to all pages) ─────
// In production this lives in a database. For the prototype we use a simple
// module-level object that Profile writes to and KPICards read from.
const GOALS = {
  targets: { winRate:65, errors:5, serveNeut:70, nvzArrival:80, nvzWin:65 },
  priorityShots: [],
};

// ── CORE 5 METRICS (shown on every page in this order) ──────────────────────
// Serve Neutralization Rate = % of serves/returns where opponent cannot hit an offensive shot
// trend = change over last 4 weeks (positive = improving, negative = declining)
const CORE_KPIS = [
  { id:"winRate",   label:"Win Rate",             value:"—",   numVal: 0,   get target(){return GOALS.targets.winRate},   unit:"%", higherIsBetter:true,  trend:0,   trendLabel:"vs last 4 wks", color:C.pickle, colorL:"#F5FAE8" },
  { id:"errors",    label:"My Errors / Match",        value:"—",   numVal: 0,   get target(){return GOALS.targets.errors},    unit:"",  higherIsBetter:false, trend:0,   trendLabel:"vs last 4 wks", color:C.rose,   colorL:C.roseL },
  { id:"serveNeut", label:"My Serve Neut.",  value:"—",   numVal: 0,   get target(){return GOALS.targets.serveNeut}, unit:"%", higherIsBetter:true,  trend:0,   trendLabel:"vs last 4 wks", color:C.amber,  colorL:C.amberL },
  { id:"nvzArrival",label:"NVZ Arrival",           value:"—",   numVal: 0,   get target(){return GOALS.targets.nvzArrival},unit:"%", higherIsBetter:true,  trend:0,   trendLabel:"vs last 4 wks", color:C.mint,   colorL:C.mintL },
  { id:"nvzWin",    label:"NVZ Win Rate",          value:"—",   numVal: 0,   get target(){return GOALS.targets.nvzWin},    unit:"%", higherIsBetter:true,  trend:0,   trendLabel:"vs last 4 wks", color:C.blue,   colorL:C.blueL },
];

// Legacy ALL_KPIS kept for modal/customization compatibility
const ALL_KPIS = CORE_KPIS;

const ALL_SHOTS_LIST = [
  { id:"dink",  label:"Dink",  pct:52, color:C.mint },
  { id:"drive", label:"Drive", pct:38, color:C.blue },
  { id:"drop",  label:"Drop",  pct:24, color:C.amber },
  { id:"lob",   label:"Lob",   pct:9,  color:C.purple },
  { id:"smash", label:"Smash", pct:5,  color:C.rose },
  { id:"reset", label:"Reset", pct:18, color:C.mint },
  { id:"serve", label:"Serve", pct:0, color:C.amber },
];

const MATCHES = [];


// ── OPPONENT PROFILES (Competitive Intelligence) ─────────────────────────────
// In Phase 2 these are auto-populated from match history + video analysis.
// Strengths/weaknesses derived from shot win rates and NVZ patterns.

// ── SYNERGY SCORE FORMULA ────────────────────────────────────────────────────
// Score 0-100 built from five equal 20-point components:
//  1. Joint NVZ Arrival  (20pts): % of rallies both players reach kitchen, target 80%
//  2. NVZ Win Rate       (20pts): % of kitchen rallies the team wins, target 65%
//  3. Role Clarity       (20pts): how complementary roles are (0.0-1.0 scale)
//  4. Error Avoidance    (20pts): combined errors/match vs DUPR-band benchmark (<=10 at 4.0+)
//  5. DUPR-Adj Win Rate  (20pts): win rate adjusted for opponent rating
//
// ROLE DEFINITION LOGIC (from shot distribution):
//  "Resetter"  = dinks + resets + drops > 60% of non-serve shots
//  "Driver"    = drives + speed-ups + slams > 40% of non-serve shots
//  "Attacker"  = slams + speed-ups > 25% AND win rate on those shots > 55%
//  "Balanced"  = no single category dominates
//
// Phase 2: all inputs computed automatically from video analysis.
// Phase 1: nvzWinRate and role entered manually when logging a match.

function calcSynergy({nvzJoint, nvzWinRate, roleClarity, combinedErrors, duprAdjWinRate}) {
  const arrivalPts = Math.min(20, Math.round((nvzJoint    / 80) * 20));
  const nvzWinPts  = Math.min(20, Math.round((nvzWinRate  / 65) * 20));
  const rolePts    = Math.min(20, Math.round(roleClarity         * 20));
  const errBench   = 10;
  const errPts     = Math.min(20, Math.round(Math.max(0, (errBench - combinedErrors) / errBench + 1) * 20));
  const winPts     = Math.min(20, Math.round(duprAdjWinRate      * 20));
  return Math.min(100, arrivalPts + nvzWinPts + rolePts + errPts + winPts);
}

const PARTNERS = [];

// ── COMMUNITY PLAYER POOL (mock — in production, pulled from app users) ────────
// Compatibility score logic:
//  - Role complement: Driver pairs best with Resetter/Balanced, Attacker with Resetter
//  - NVZ coverage: suggest someone whose NVZ win rate shores up your weakness
//  - DUPR proximity: within 0.3 of your rating
//  - Errors: combined errors should trend toward ≤10/match

const COACH_SYS_BASE = `You are PICKL — an elite AI pickleball coach embedded in the PickleIntel app.

KNOWLEDGE SOURCE: Your coaching advice is grounded in the publicly documented philosophies and techniques of the world's top professional pickleball players — primarily Ben Johns (world #1, known for reset-first, NVZ patience, and tactical dinking), Anna Leigh Waters (aggressive transition game, speed-up selection), Tyson McGuffin (power baseline play, serve strategy), and others from the PPA and MLP tours. When giving advice, you may reference these pros by name and attribute specific techniques to them. Be transparent that your knowledge comes from their published coaching content, interviews, instructional videos, and documented playing philosophies — not from proprietary data.

COACHING PHILOSOPHY (drawn from elite pro principles):
PATIENCE & CONTROL (Ben Johns principle): Never force pace from a weak position. The reset is your most important shot. Ben Johns wins by making opponents hit up — replicate that.
NVZ DOMINANCE: The kitchen is where recreational games are won and lost. Arrive together, maintain pressure with precise cross-court dinks, and only speed up when the ball is above net height — a principle all top pros follow.
FUNDAMENTALS FIRST (universal pro consensus): Footwork, paddle prep, and consistent 3rd shot drops beat flashy shot-making at every rating level. Drill the boring stuff relentlessly.
TACTICAL SEQUENCING: Think in patterns — Serve → Return → Transition → NVZ is the core sequence that every pro executes deliberately. Break it only when you've earned the right to.
SHOT SELECTION (Anna Leigh Waters principle): Speed-ups are high-risk. Only attack when you'd win that exchange 70%+ of the time. Patience creates better opportunities than forcing.

RESPONSE STYLE: Be specific and direct. Reference the player's actual stats from their data. Attribute advice to specific pros when relevant (e.g. "Ben Johns talks about this — the reset is your most valuable shot"). Give concrete drill prescriptions. Keep responses focused and scannable. Never say you lack data if player stats are provided below.`;

// ── COMPONENTS ───────────────────────────────────────────────────────────────
const Logo = () => {
  const cx=11, cy=11, r=9;
  // 3 holes: top-center, bottom-left, bottom-right
  const holes=[[cx,cy-3.8],[cx-3.3,cy+2.2],[cx+3.3,cy+2.2]];
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width="22" height="22" viewBox="0 0 22 22">
        {/* Solid ball silhouette */}
        <circle cx={cx} cy={cy} r={r} fill={C.pickle}/>
        {/* Punched-out holes */}
        {holes.map(([hx,hy],i)=>(
          <circle key={i} cx={hx} cy={hy} r={1.5} fill={C.navy}/>
        ))}
      </svg>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:"0.08em",lineHeight:1}}>
        <span style={{color:"white"}}>PICKLE</span>
        <span style={{color:C.pickle}}>INTEL</span>
      </div>
    </div>
  );
};

const Badge = ({text,color,bg})=>(
  <span style={{background:bg||`${color}18`,color,border:`1px solid ${color}30`,borderRadius:20,
    padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{text}</span>
);

const Card = ({children,style={}})=>(
  <div style={{background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:16,
    padding:"20px 22px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",...style}}>{children}</div>
);

const SLabel = ({children})=>(
  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.09em",
    marginBottom:14,fontWeight:600}}>{children}</div>
);

// KPICard: label · big value · target · trend arrow
const KPICard = ({label,value,color,colorL,onClick,selected,target,unit="%",higherIsBetter=true,trend})=>{
  const trendGood = trend!=null && (higherIsBetter ? trend>0 : trend<0);
  const trendBad  = trend!=null && (higherIsBetter ? trend<0 : trend>0);
  return(
    <div className="hover-lift" onClick={onClick} style={{
      background:selected?colorL:C.cardBg,
      border:`2px solid ${selected?color:C.border}`,
      borderRadius:14,padding:"16px 18px",cursor:onClick?"pointer":"default",
      position:"relative",transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"
    }}>
      {onClick&&<div style={{position:"absolute",top:10,right:10,width:18,height:18,borderRadius:"50%",
        background:selected?color:C.border,display:"flex",alignItems:"center",
        justifyContent:"center",fontSize:10,color:"white"}}>{selected?"✓":""}</div>}
      {/* Label */}
      <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>{label}</div>
      {/* Current value */}
      <div style={{fontFamily:"'Bebas Neue'",fontSize:32,color,letterSpacing:"0.04em",lineHeight:1,marginBottom:10}}>{value}</div>
      {/* Target + trend row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {target!=null
          ? <span style={{fontSize:11,color:C.textLight}}>Target {higherIsBetter?">":"<"}{target}{unit}</span>
          : <span/>
        }
        {trend!=null&&(
          <div style={{display:"flex",alignItems:"center",gap:2,
            color:trendGood?C.mint:trendBad?C.rose:C.textLight,fontWeight:700}}>
            <span style={{fontSize:13}}>{trendGood?"▲":trendBad?"▼":"→"}</span>
            <span style={{fontFamily:"'DM Mono'",fontSize:11}}>{Math.abs(trend)}{unit}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const Gauge = ({value,color,label,size=80})=>{
  const r=size/2-7,circ=2*Math.PI*r;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${(value/100)*circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{transition:"stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)"}}/>
        <text x={size/2} y={size/2+5} textAnchor="middle" fill={C.text}
          fontSize={13} fontFamily="'DM Mono'" fontWeight="700">{value}%</text>
      </svg>
      <span style={{fontSize:10,color:C.textLight,textAlign:"center",textTransform:"uppercase",
        letterSpacing:"0.05em",maxWidth:size+10}}>{label}</span>
    </div>
  );
};

const ShotBar = ({label,pct,color})=>(
  <div style={{marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
      <span style={{fontSize:12,color:C.textMid}}>{label}</span>
      <span style={{fontSize:12,color:C.text,fontFamily:"'DM Mono'",fontWeight:600}}>{pct}%</span>
    </div>
    <div style={{height:6,background:C.border,borderRadius:3}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,
        transition:"width 0.7s cubic-bezier(.4,0,.2,1)"}}/>
    </div>
  </div>
);

// Customizer modals
const KPIModal = ({selected,onSave,onClose,title="Customize KPIs"})=>{
  const [loc,setLoc]=useState(selected);
  const tog=id=>setLoc(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.6)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:C.cardBg,borderRadius:20,padding:32,width:520,maxWidth:"92vw",
        boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:"0.06em",color:C.navy}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:C.textLight,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:10,marginBottom:20}}>
          {ALL_KPIS.map(k=>(
            <div key={k.id} onClick={()=>tog(k.id)} style={{
              background:loc.includes(k.id)?k.colorL:C.pageBg,
              border:`2px solid ${loc.includes(k.id)?k.color:C.border}`,
              borderRadius:12,padding:"12px 14px",cursor:"pointer",transition:"all 0.15s",
              display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:18,height:18,borderRadius:"50%",flexShrink:0,
                background:loc.includes(k.id)?k.color:C.border,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"white"}}>
                {loc.includes(k.id)?"✓":""}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{k.label}</div>
                <div style={{fontSize:11,color:C.textLight}}>{k.value}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn-p" onClick={()=>{onSave(loc);onClose();}} style={{
          width:"100%",background:C.pickle,border:"none",borderRadius:12,padding:"12px",
          fontFamily:"'Outfit'",fontWeight:700,fontSize:15,color:C.navy}}>Save Layout</button>
      </div>
    </div>
  );
};

const ShotModal = ({selected,onSave,onClose})=>{
  const [loc,setLoc]=useState(selected);
  const tog=id=>setLoc(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.6)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:C.cardBg,borderRadius:20,padding:32,width:420,maxWidth:"92vw",
        boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:"0.06em",color:C.navy}}>Customize Shot Chart</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:C.textLight,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {ALL_SHOTS_LIST.map(s=>(
            <div key={s.id} onClick={()=>tog(s.id)} style={{
              display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
              background:loc.includes(s.id)?`${s.color}12`:C.pageBg,
              border:`2px solid ${loc.includes(s.id)?s.color:C.border}`,
              borderRadius:10,cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{width:14,height:14,borderRadius:3,background:s.color,flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:500,color:C.text,flex:1}}>{s.label}</span>
              <div style={{width:18,height:18,borderRadius:"50%",
                background:loc.includes(s.id)?s.color:C.border,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"white"}}>
                {loc.includes(s.id)?"✓":""}
              </div>
            </div>
          ))}
        </div>
        <button className="btn-p" onClick={()=>{onSave(loc);onClose();}} style={{
          width:"100%",background:C.pickle,border:"none",borderRadius:12,padding:"12px",
          fontFamily:"'Outfit'",fontWeight:700,fontSize:15,color:C.navy}}>Save</button>
      </div>
    </div>
  );
};

// Upload modal
const UploadModal = ({onClose})=>{
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState(0);
  const go=()=>{
    setUploading(true);let p=0;
    const iv=setInterval(()=>{p+=Math.random()*14;if(p>=100){p=100;clearInterval(iv);setTimeout(()=>{setUploading(false);onClose();},600);}setProgress(Math.round(p));},200);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.7)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:C.cardBg,borderRadius:20,padding:36,width:460,
        boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:24,letterSpacing:"0.07em",color:C.navy}}>UPLOAD MATCH VIDEO</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:C.textLight,cursor:"pointer"}}>✕</button>
        </div>
        {!uploading?(
          <>
            <div onClick={go} style={{border:`2px dashed ${C.border}`,borderRadius:14,
              padding:"44px 24px",textAlign:"center",cursor:"pointer",background:C.pageBg}}>
              <div style={{fontSize:40,marginBottom:10}}>🎾</div>
              <p style={{color:C.text,fontSize:14,marginBottom:6,fontWeight:500}}>Drop your match video here</p>
              <p style={{color:C.textLight,fontSize:12}}>MP4, MOV · up to 4GB · live or recorded</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}>
              {["📱 Record Live","☁️ Import from Cloud","📡 From Playsight Court","📂 Browse Files"].map(o=>(
                <button key={o} onClick={go} style={{background:C.pageBg,border:`1px solid ${C.border}`,
                  borderRadius:10,color:C.textMid,fontSize:12,padding:"11px",cursor:"pointer",fontFamily:"'Outfit'"}}>{o}</button>
              ))}
            </div>
          </>
        ):(
          <div style={{textAlign:"center",padding:"28px 0"}}>
            <div style={{fontSize:12,color:C.blue,fontFamily:"'DM Mono'",marginBottom:14,letterSpacing:"0.08em"}}>
              {progress<35?"UPLOADING VIDEO...":progress<70?"ANALYZING FOOTAGE...":"DETECTING SHOTS & PLAYERS..."}
            </div>
            <div style={{height:6,background:C.border,borderRadius:3,margin:"0 auto 12px",maxWidth:300}}>
              <div style={{height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${C.pickle},${C.mint})`,borderRadius:3,transition:"width 0.2s"}}/>
            </div>
            <div style={{fontFamily:"'DM Mono'",fontSize:22,color:C.navy}}>{progress}%</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── TOP NAV ───────────────────────────────────────────────────────────────────
const NAV=[
  {id:"dashboard",label:"Dashboard",short:"🏠"},
  {id:"shots",label:"Shots",short:"Shots"},
  {id:"matches",label:"Matches",short:"Match"},
  {id:"coach",label:"Coach",short:"Coach"},
  {id:"profile",label:"Profile",short:"Me"},
];

const TopNav=({page,setPage,onSignOut,authUser})=>{
  const isMobile = useIsMobile();
  return(
    <div style={{background:C.navy,position:"sticky",top:0,zIndex:100,
      boxShadow:"0 2px 12px rgba(0,0,0,0.15)",width:"100%"}}>
      <div style={{width:"100%",padding:isMobile?"0 8px":"0 16px",boxSizing:"border-box",
        display:"flex",alignItems:"center",height:52,gap:0}}>

        {/* Logo — icon only on mobile to save space */}
        {isMobile ? (
          <div style={{display:"flex",alignItems:"center",flexShrink:0,marginRight:4}}>
            <svg width="26" height="26" viewBox="0 0 22 22">
              <circle cx="11" cy="11" r="9" fill={C.pickle}/>
              {[[11,7.2],[7.7,13.2],[14.3,13.2]].map(([hx,hy],i)=>(
                <circle key={i} cx={hx} cy={hy} r={1.5} fill={C.navy}/>
              ))}
            </svg>
          </div>
        ) : (
          <Logo/>
        )}

        {/* Nav — fills remaining space, all 5 tabs visible on mobile */}
        <div style={{display:"flex",alignItems:"center",
          flex:1,gap:isMobile?0:2,
          marginLeft:isMobile?2:12,
          justifyContent:isMobile?"space-between":"flex-start"}}>
          {NAV.map(n=>{
            const a=page===n.id || (n.id==="matches" && page==="matches:partners");
            return(
              <button key={n.id} className="nav-btn" onClick={()=>setPage(n.id==="matches"?"matches":n.id)} style={{
                background:a?C.pickle:"transparent",
                padding:isMobile?"6px 8px":"7px 14px",
                borderRadius:8,
                fontSize:isMobile?11:13,
                fontWeight:a?700:500,
                color:a?C.navy:"#94A3B8",
                letterSpacing:0,
                whiteSpace:"nowrap",
                flex:isMobile?"1":"unset",
                textAlign:"center",
              }}>{isMobile?n.short:n.label}</button>
            );
          })}
        </div>

        {/* Avatar + sign out */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:8}}>
          {/* User avatar with initial */}
          <div style={{width:34,height:34,borderRadius:"50%",
            background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'Bebas Neue'",fontSize:14,color:C.navy,fontWeight:700,
            title:authUser?.email,cursor:"default",flexShrink:0}}>
            {(authUser?.email||"?")[0].toUpperCase()}
          </div>
          {/* Sign out button */}
          {!isMobile&&(
            <button onClick={onSignOut} style={{
              background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:8,padding:"6px 12px",cursor:"pointer",
              fontFamily:"'Outfit'",fontWeight:600,fontSize:12,color:"#94A3B8",
              transition:"all 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color="white"}
              onMouseLeave={e=>e.currentTarget.style.color="#94A3B8"}>
              Sign Out
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
const Dashboard=({setPage})=>{
  const isMobile = useIsMobile();
  const [dbMatches, setDbMatches] = useState([]);
  const [profileData, setProfileData] = useState(null);

  useEffect(()=>{
    sb.query("matches", { order: "created_at.desc" })
      .then(rows => setDbMatches(rows||[]))
      .catch(()=>{});
    sb.query("profile", { filter: `user_id=eq.${getCurrentUserId()}`, single: true })
      .then(data => { if(data) setProfileData(data); })
      .catch(()=>{}); // New users won't have a profile yet — that's ok
    sb.query("shots", { order: "name.asc" })
      .then(rows => {
        if (rows && rows.length > 0) {
          rows.forEach(row => {
            SHOT_CATS.forEach(cat => {
              const shot = cat.shots.find(s => s.name === row.name);
              if (shot) {
                shot.attempts    = row.attempts    || 0;
                shot.wins        = row.wins        || 0;
                shot.misses      = row.misses      || 0;
                shot.winHistory  = row.win_history  || [0,0,0,0];
                shot.missHistory = row.miss_history || [0,0,0,0];
              }
            });
          });
        }
      })
      .catch(()=>{});
  },[]);

  const allMatches = dbMatches.length > 0 ? dbMatches : MATCHES;
  const totalMatches = allMatches.length;
  const wins = allMatches.filter(m=>m.result==="W").length;
  const winRate = totalMatches > 0 ? Math.round(wins/totalMatches*100) : 0;
  const avgErrors = totalMatches > 0 ? (allMatches.reduce((a,m)=>a+(parseFloat(m.errors||m.stats?.errors||0)),0)/totalMatches).toFixed(1) : "—";
  const avgNvz = totalMatches > 0 ? Math.round(allMatches.reduce((a,m)=>a+(m.nvz_arrival||m.stats?.nvzArrival||0),0)/totalMatches) : 0;
  const avgNvzWin = totalMatches > 0 ? Math.round(allMatches.reduce((a,m)=>a+(m.nvz_win||m.stats?.nvzWin||0),0)/totalMatches) : 0;
  const avgServe = totalMatches > 0 ? Math.round(allMatches.reduce((a,m)=>a+(m.serve_neut||m.stats?.serveNeut||0),0)/totalMatches) : 0;

  // Update CORE_KPIS with live data
  if (totalMatches > 0) {
    CORE_KPIS[0].value = winRate+"%"; CORE_KPIS[0].numVal = winRate;
    CORE_KPIS[1].value = avgErrors+""; CORE_KPIS[1].numVal = parseFloat(avgErrors);
    CORE_KPIS[2].value = avgServe+"%"; CORE_KPIS[2].numVal = avgServe;
    CORE_KPIS[3].value = avgNvz+"%";   CORE_KPIS[3].numVal = avgNvz;
    CORE_KPIS[4].value = avgNvzWin+"%";CORE_KPIS[4].numVal = avgNvzWin;
  }

  const playerName = profileData?.player_name || "Player";
  const firstName = playerName.split(" ")[0];
  const lastMatch = allMatches[0] || null;
  const allShots=SHOT_CATS.flatMap(c=>c.shots.map(s=>({...s,catColor:c.color,icon:c.icon})));
  const topWeapon=[...allShots].sort((a,b)=>b.wins-a.wins)[0];
  const topWeakness=[...allShots].sort((a,b)=>b.misses-a.misses)[0];
  const mostImproved=[...allShots].sort((a,b)=>(b.winHistory[3]-b.winHistory[0])-(a.winHistory[3]-a.winHistory[0]))[0];
  const kpis=CORE_KPIS;
  // Best partner = highest synergy
  // Derive partners from match history
  const partnerMap = {};
  allMatches.forEach(m=>{
    const name = m.partner||m.partner_name;
    if (!name || name==="—") return;
    if (!partnerMap[name]) partnerMap[name]={name,matches:0,wins:0,nvzSum:0,errSum:0};
    partnerMap[name].matches++;
    if (m.result==="W") partnerMap[name].wins++;
    partnerMap[name].nvzSum  += m.nvz_arrival||m.stats?.nvzArrival||0;
    partnerMap[name].errSum  += parseFloat(m.errors||m.stats?.errors||0);
  });
  const derivedPartners = Object.values(partnerMap).map(p=>({
    ...p,
    synergy: Math.round((p.wins/p.matches)*60 + Math.min(20,(p.nvzSum/p.matches)/4)),
    nvz: Math.round(p.nvzSum/p.matches)||0,
    errors: +(p.errSum/p.matches).toFixed(1)||0,
    role:"—", matchHistory:[]
  }));
  const bestPartner = derivedPartners.length>0
    ? derivedPartners.reduce((a,b)=>b.synergy>a.synergy?b:a)
    : null;

  return(
    <div className="fade-up" style={{width:"100%",boxSizing:"border-box",padding:isMobile?"14px 14px 20px":"28px 28px 32px",maxWidth:1200,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>{totalMatches===0?`Welcome to PickleIntel 👋`:`Good morning, ${firstName} 👋`}</h1>
          <p style={{color:C.textMid,fontSize:14,marginTop:3}}>{totalMatches===0?"Log your first match to get started":`${totalMatches} matches · ${wins}W ${totalMatches-wins}L`}</p>
        </div>

      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${kpis.length},1fr)`,gap:isMobile?10:14,marginBottom:16}}>
        {kpis.map(k=><KPICard key={k.id} {...k}/>)}
      </div>

      {/* 4-widget row: Shot Summary | Priority Drills | Last Match | Best Partner */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr 1fr",gap:16}}>

        {/* Shot Summary */}
        <Card style={{padding:"16px 18px"}}>
          <SectionLabelInline>Shot Summary</SectionLabelInline>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10,marginTop:6}}>
            {[
              {label:"🏆 Top Weapon",    shot:topWeapon,    metric:`${topWeapon?.wins||0} pts won`,      color:C.mint,  bg:C.mintL},
              {label:"⚠️ Weakest Shot",  shot:topWeakness,  metric:`${topWeakness?.misses||0} errors`,   color:C.rose,  bg:C.roseL},
              {label:"📈 Most Improved", shot:mostImproved, metric:(()=>{
                const h=mostImproved?.winHistory||[0,0,0,0];
                const nonZero=h.filter(v=>v>0);
                if(nonZero.length<2) return "Need 2+ sessions";
                const firstIdx=h.findIndex(v=>v>0);
                const lastIdx=h.length-1-[...h].reverse().findIndex(v=>v>0);
                const d=h[lastIdx]-h[firstIdx];
                return (d>=0?"+":"")+d+"% win rate";
              })(), color:C.blue, bg:C.blueL},
            ].map(({label,shot,metric,color,bg})=>(
              <div key={label} style={{background:bg,border:`1px solid ${color}25`,borderRadius:10,padding:"10px 12px",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{label}</div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{shot?.name||"—"}</div>
                </div>
                <div style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color,textAlign:"right"}}>{metric}</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"right"}}>
            <span onClick={()=>setPage("shots")} style={{fontSize:11,color:C.blue,cursor:"pointer",fontWeight:600}}>View all shots →</span>
          </div>
        </Card>

        {/* Priority Drills */}
        <Card style={{padding:"16px 18px"}}>
          <SectionLabelInline>🎯 Priority Drills</SectionLabelInline>
          {GOALS.priorityShots.length === 0 ? (
            <div style={{textAlign:"center",padding:"24px 8px"}}>
              <div style={{fontSize:24,marginBottom:8}}>📌</div>
              <div style={{fontSize:12,color:C.textMid,marginBottom:4,fontWeight:600}}>No drills pinned yet</div>
              <div style={{fontSize:11,color:C.textLight,lineHeight:1.5}}>Go to Shot Analytics and tap 🎯 Focus on any shot to add it here</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10,marginTop:6}}>
              {GOALS.priorityShots.map(drill=>{
                const shotData = SHOT_CATS.flatMap(c=>c.shots).find(s=>s.name===drill.name);
                const current  = shotData?.misses ?? 0;
                const gap      = current - drill.targetMisses;
                const pct      = Math.min(100, Math.round((drill.targetMisses / Math.max(current,1)) * 100));
                const statusColor = gap <= 0 ? C.mint : gap <= 3 ? C.amber : C.rose;
                return (
                  <div key={drill.name} style={{background:C.pageBg,border:`1px solid ${drill.color}25`,
                    borderRadius:10,padding:"10px 12px",borderLeft:`3px solid ${drill.color}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,lineHeight:1.3}}>{drill.name}</div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                        <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:C.rose}}>{current}</span>
                        <span style={{fontSize:10,color:C.textLight,margin:"0 3px"}}>→</span>
                        <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:drill.color}}>{drill.targetMisses}</span>
                        <div style={{fontSize:9,color:C.textLight,textAlign:"right"}}>pts lost</div>
                      </div>
                    </div>
                    <div style={{height:4,background:C.border,borderRadius:2}}>
                      <div style={{height:"100%",width:`${pct}%`,background:drill.color,
                        borderRadius:2,transition:"width 0.4s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:statusColor}}>
                        {gap<=0?"✓ At target":`${gap} pts to go`}
                      </span>
                      <span style={{fontSize:10,color:C.textLight}}>{pct}% there</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{textAlign:"right"}}>
            <span onClick={()=>setPage("shots")} style={{fontSize:11,color:C.blue,cursor:"pointer",fontWeight:600}}>Manage drills →</span>
          </div>
        </Card>

        {/* Last Match */}
        <Card style={{padding:"16px 18px"}}>
          {!lastMatch ? (
            <div style={{textAlign:"center",padding:"24px 8px"}}>
              <div style={{fontSize:24,marginBottom:8}}>🎾</div>
              <div style={{fontSize:12,color:C.textMid,fontWeight:600}}>No matches yet</div>
              <div style={{fontSize:11,color:C.textLight,marginTop:4}}>Log your first match to see stats here</div>
            </div>
          ) : (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <SectionLabelInline>Last Match · {lastMatch.date}</SectionLabelInline>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:C.navy,letterSpacing:"0.04em"}}>vs {lastMatch.opponent}</div>
              <div style={{fontSize:11,color:C.textLight,marginTop:1}}>w/ {lastMatch.partner} · {lastMatch.score}</div>
            </div>
            <Badge text={lastMatch.result==="W"?"WIN":"LOSS"} color={lastMatch.result==="W"?C.mint:C.rose}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            {[
              {label:"NVZ Arrival",v:lastMatch.nvz_arrival||lastMatch.stats?.nvzArrival||0,color:C.mint},
              {label:"NVZ Win",    v:lastMatch.nvz_win||lastMatch.stats?.nvzWin||0,    color:C.blue},
              {label:"My Serve Neut.",v:lastMatch.serve_neut||lastMatch.stats?.serveNeut||0,     color:C.amber},
              {label:"My Errors",  v:lastMatch.errors||lastMatch.stats?.errors||0,       color:C.rose},
            ].map(s=>(
              <div key={s.label} style={{background:C.pageBg,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{s.label}</div>
                <div style={{fontFamily:"'DM Mono'",fontSize:16,fontWeight:700,color:s.color}}>{s.v}%</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"right"}}>
            <span onClick={()=>setPage("matches")} style={{fontSize:11,color:C.blue,cursor:"pointer",fontWeight:600}}>View all matches →</span>
          </div>
          </>)}
        </Card>

        {/* Best Partner — auto calculated */}
        <Card style={{padding:"16px 18px"}}>
          <SectionLabelInline>Best Partner</SectionLabelInline>
          {bestPartner ? (
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:6}}>
                <div style={{width:44,height:44,borderRadius:"50%",
                  background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Bebas Neue'",fontSize:17,color:C.navy,flexShrink:0}}>
                  {bestPartner.name.split(" ").map(function(w){return w[0]}).join("")}
                </div>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.text}}>{bestPartner.name}</div>
                  <div style={{fontSize:11,color:C.textLight}}>{bestPartner.matches} matches · {bestPartner.wins}W {bestPartner.matches-bestPartner.wins}L</div>
                </div>
                <div style={{marginLeft:"auto",textAlign:"right"}}>
                  <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em"}}>Synergy</div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:32,color:C.mint,lineHeight:1}}>{bestPartner.synergy}</div>
                </div>
              </div>
              <div style={{height:5,background:C.border,borderRadius:3,marginBottom:12}}>
                <div style={{height:"100%",width:bestPartner.synergy+"%",background:`linear-gradient(90deg,${C.pickle},${C.mint})`,borderRadius:3}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                {[
                  {label:"Team NVZ",  value:bestPartner.nvz+"%",          color:C.mint},
                  {label:"Win Rate",  value:Math.round(bestPartner.wins/bestPartner.matches*100)+"%", color:C.pickle},
                  {label:"My Errors", value:bestPartner.errors,            color:C.rose},
                  {label:"Role",      value:bestPartner.role,              color:C.purple},
                ].map(function(s){ return (
                  <div key={s.label} style={{background:C.pageBg,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{s.label}</div>
                    <div style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:s.color}}>{s.value}</div>
                  </div>
                );})}
              </div>
              <div style={{textAlign:"right"}}>
                <span onClick={function(){setPage("matches:partners")}} style={{fontSize:11,color:C.blue,cursor:"pointer",fontWeight:600}}>View team analytics →</span>
              </div>
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"24px 8px"}}>
              <div style={{fontSize:24,marginBottom:8}}>👥</div>
              <div style={{fontSize:12,color:C.textMid,fontWeight:600}}>No partners yet</div>
              <div style={{fontSize:11,color:C.textLight,marginTop:4}}>Partners build from your match history</div>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
};

// inline label helper (no bottom margin)
const SectionLabelInline=({children})=>(
  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:4,fontWeight:600}}>{children}</div>
);

// ── MATCH HISTORY CONTENT ───────────────────────────────────────────────────
const MatchHistoryContent=()=>{
  const isMobile = useIsMobile();
  const [dbMatches, setDbMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("You");

  useEffect(()=>{
    sb.query("profile",{filter:`user_id=eq.${getCurrentUserId()}`,single:true})
      .then(p=>{ if(p?.player_name) setProfileName(p.player_name.split(" ")[0]); })
      .catch(()=>{});
  },[]);
  const [editMatch,   setEditMatch]   = useState(null);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState("");
  const [deleteId,    setDeleteId]    = useState(null); // id pending confirmation
  const [deleting,    setDeleting]    = useState(false);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await sb.delete("matches", `id=eq.${deleteId}`);
      setDeleteId(null);
      if (sel?.id === deleteId) setSel(null);
      loadMatches();
    } catch(e) { alert("Delete failed: " + e.message); }
    setDeleting(false);
  };

  const loadMatches = () => {
    setLoading(true);
    sb.query("matches", { order: "created_at.desc" })
      .then(rows => {
        const normalized = (rows||[]).map(m=>({
          id: m.id,
          date: m.date,
          opponent: m.opponent || "—",
          partner: m.partner || "—",
          result: m.result === "W" ? "W" : "L",
          score: m.score || "—",
          notes: m.notes || "",
          nvz_arrival: m.nvz_arrival || 0,
          nvz_win:     m.nvz_win     || 0,
          serve_neut:  m.serve_neut  || 0,
          errors:      m.errors      || 0,
          partner_role: m.partner_role || "Balanced",
          stats: {
            nvzArrival: m.nvz_arrival || 0,
            nvzWin:     m.nvz_win     || 0,
            serveNeut:  m.serve_neut  || 0,
            errors:     m.errors      || 0,
            serve:      m.serve_neut  || 0,
            ret:        m.ret         || 0,
          },
          shotSplit: [],
        }));
        setDbMatches(normalized);
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{ loadMatches(); },[]);

  const allMatches = dbMatches.length > 0 ? dbMatches : [];
  const [sel,setSel]=useState(null);
  const selMatch = sel || allMatches[0] || null;
  const [selShots,setSelShots]=useState(["dink","drive","lob","smash"]);
  const [showS,setShowS]=useState(false);
  const s=selMatch?.stats || {nvzArrival:0,nvzWin:0,serveNeut:0,errors:0,serve:0,ret:0};
  const shots=ALL_SHOTS_LIST.filter(sh=>selShots.includes(sh.id));
  const MATCH_KPIS=[
    { id:"winRate",    label:"Win Rate",            value:selMatch?.result==="W"?"WIN":"LOSS", numVal:selMatch?.result==="W"?100:0,  target:65,  unit:"%", higherIsBetter:true,  color:selMatch?.result==="W"?C.mint:C.rose, colorL:selMatch?.result==="W"?C.mintL:C.roseL, trendLabel:"this match" },
    { id:"errors",     label:"My Errors",           value:s.errors,   numVal:s.errors,   target:8,   unit:"",  higherIsBetter:false, color:C.rose,   colorL:C.roseL },
    { id:"serveNeut",  label:"My Serve Neut.",value:`${s.serveNeut}%`, numVal:s.serveNeut, target:70, unit:"%", higherIsBetter:true, color:C.amber, colorL:C.amberL },
    { id:"nvzArrival", label:"NVZ Arrival",         value:`${s.nvzArrival}%`,numVal:s.nvzArrival,target:80,  unit:"%", higherIsBetter:true,  color:C.mint,   colorL:C.mintL },
    { id:"nvzWin",     label:"NVZ Win Rate",        value:`${s.nvzWin}%`,    numVal:s.nvzWin,    target:65,  unit:"%", higherIsBetter:true,  color:C.blue,   colorL:C.blueL },
  ];

  // ── Edit Modal ──────────────────────────────────────────────────────────────
  const EditModal = ({m, onClose}) => {
    const [date, setDate]           = useState(m.date||"");
    const [opponent, setOpponent]   = useState(m.opponent==="—"?"":m.opponent);
    const [partner, setPartner]     = useState(m.partner==="—"?"":m.partner);
    const [score, setScore]         = useState(m.score==="—"?"":m.score);
    const [result, setResult]       = useState(m.result||"W");
    const [notes, setNotes]         = useState(m.notes||"");
    const [nvzArrived, setNvzArrived] = useState(m.nvz_arrival||0);
    const [nvzWon, setNvzWon]         = useState(m.nvz_win||0);
    const [serveNeut, setServeNeut]   = useState(m.serve_neut||0);
    const [errors, setErrors]         = useState(m.errors||0);
    const [role, setRole]             = useState(m.partner_role||"Balanced");
    const [saving, setSaving]         = useState(false);
    const [error, setError]           = useState("");

    const save = async () => {
      setSaving(true); setError("");
      try {
        await sb.upsert("matches", {
          id: m.id,
          date, opponent, partner, result, score, notes,
          nvz_arrival: Number(nvzArrived),
          nvz_win:     Number(nvzWon),
          serve_neut:  Number(serveNeut),
          errors:      Number(errors),
          partner_role: role,
        }, "id");
        loadMatches();
        onClose();
      } catch(e) {
        setError(e.message||"Save failed");
      }
      setSaving(false);
    };

    const CtrBtn = ({val, setVal, color}) => (
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={()=>setVal(Math.max(0,val-1))} style={{width:26,height:26,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
        <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:val>0?color:C.textLight,minWidth:20,textAlign:"center"}}>{val}</span>
        <button onClick={()=>setVal(val+1)} style={{width:26,height:26,borderRadius:6,border:`1px solid ${val>0?color:C.border}`,background:val>0?color+"18":C.pageBg,fontSize:15,color,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
      </div>
    );

    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
        onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div style={{background:C.cardBg,borderRadius:20,width:"100%",maxWidth:580,
          maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>

          {/* Header */}
          <div style={{padding:"18px 22px",borderBottom:`1px solid ${C.border}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:C.navy,letterSpacing:"0.04em"}}>Edit Match</div>
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,
              color:C.textLight,cursor:"pointer",lineHeight:1}}>×</button>
          </div>

          <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:14}}>

            {/* Row 1: Date + Score + Result */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Date</div>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                  style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,borderRadius:10,
                    padding:"9px 12px",color:C.text,fontSize:13,fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Score</div>
                <input type="text" value={score} onChange={e=>setScore(e.target.value)}
                  placeholder="11-7"
                  style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,borderRadius:10,
                    padding:"9px 12px",color:C.text,fontSize:13,fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
              </div>
            </div>

            {/* Result */}
            <div>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Result</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["W","Win 🏆"],["L","Loss"]].map(([v,lbl])=>(
                  <button key={v} onClick={()=>setResult(v)} style={{
                    padding:"9px",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer",
                    fontFamily:"'Outfit'",border:`2px solid ${result===v?(v==="W"?C.mint:C.rose):C.border}`,
                    background:result===v?(v==="W"?`${C.mint}20`:`${C.rose}20`):C.pageBg,
                    color:result===v?(v==="W"?C.mint:C.rose):C.textMid}}>{lbl}</button>
                ))}
              </div>
            </div>

            {/* Opponent + Partner */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <PlayerSearch label="Opponent(s)" value={opponent} onChange={setOpponent}
                placeholder="Search or type name…" multi={true}/>
              <PlayerSearch label="Partner" value={partner} onChange={setPartner}
                placeholder="Search or type name…"/>
            </div>

            {/* Notes */}
            <div>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Notes</div>
              <input type="text" value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Anything notable…"
                style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,borderRadius:10,
                  padding:"9px 12px",color:C.text,fontSize:13,fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
            </div>

            {/* Performance Stats */}
            <div style={{background:C.pageBg,borderRadius:12,padding:"14px"}}>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:12}}>Performance Stats</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {label:"NVZ Arrival",    val:nvzArrived, set:setNvzArrived, color:C.mint},
                  {label:"NVZ Win Rate",   val:nvzWon,     set:setNvzWon,     color:C.blue},
                  {label:"My Serve Neut.", val:serveNeut,  set:setServeNeut,  color:C.amber},
                  {label:"My Errors",      val:errors,     set:setErrors,     color:C.rose},
                ].map(({label,val,set,color})=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",background:C.cardBg,borderRadius:8,padding:"8px 12px"}}>
                    <span style={{fontSize:12,color:C.textMid}}>{label}</span>
                    <CtrBtn val={val} setVal={set} color={color}/>
                  </div>
                ))}
              </div>
            </div>

            {/* Role */}
            <div>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:6}}>Your Role</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                {["Resetter","Driver","Attacker","Balanced"].map(r=>(
                  <button key={r} onClick={()=>setRole(r)} style={{
                    padding:"7px 4px",borderRadius:8,fontWeight:600,fontSize:11,cursor:"pointer",
                    fontFamily:"'Outfit'",background:role===r?C.navy:C.pageBg,
                    border:`2px solid ${role===r?C.navy:C.border}`,
                    color:role===r?"white":C.textMid}}>{r}</button>
                ))}
              </div>
            </div>

            {error&&<div style={{background:`${C.rose}15`,border:`1px solid ${C.rose}40`,borderRadius:10,
              padding:"10px 14px",fontSize:12,color:C.rose}}>{error}</div>}

            {/* Actions */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:4}}>
              <button onClick={onClose} style={{padding:"12px",borderRadius:12,border:`1px solid ${C.border}`,
                background:C.pageBg,fontFamily:"'Outfit'",fontWeight:600,fontSize:14,
                color:C.textMid,cursor:"pointer"}}>Cancel</button>
              <button onClick={save} disabled={saving} style={{padding:"12px",borderRadius:12,border:"none",
                background:saving?C.border:C.pickle,fontFamily:"'Outfit'",fontWeight:700,fontSize:14,
                color:C.navy,cursor:saving?"not-allowed":"pointer"}}>
                {saving?"Saving…":"Save Changes"}
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  };

  if(!selMatch) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:16}}>🎾</div>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:C.navy,letterSpacing:"0.05em",marginBottom:8}}>No Matches Yet</div>
      <div style={{fontSize:14,color:C.textMid,maxWidth:380,lineHeight:1.6}}>Log your first match to see history and analytics here.</div>
    </div>
  );
  return(
    <>
      {editMatch&&<EditModal m={editMatch} onClose={()=>{ setEditMatch(null); setSel(null); }}/>}
      {showS&&<ShotModal selected={selShots} onSave={setSelShots} onClose={()=>setShowS(false)}/>}

      {/* ── Delete confirmation modal — rendered at fragment root so fixed positioning works ── */}
      {deleteId && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,
          background:"rgba(10,22,40,0.7)",backdropFilter:"blur(6px)",
          zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.cardBg,borderRadius:18,padding:"28px 32px",width:"100%",maxWidth:400,
            boxShadow:"0 20px 60px rgba(0,0,0,0.25)",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:C.navy,letterSpacing:"0.05em",marginBottom:8}}>
              Delete Match?
            </div>
            <div style={{fontSize:13,color:C.textMid,lineHeight:1.6,marginBottom:24}}>
              This will permanently delete this match and all its data. This cannot be undone.
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteId(null)} style={{
                flex:1,padding:"12px",borderRadius:12,border:`1px solid ${C.border}`,
                background:C.pageBg,fontFamily:"'Outfit'",fontWeight:600,fontSize:14,
                color:C.textMid,cursor:"pointer"}}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={{
                flex:1,padding:"12px",borderRadius:12,border:"none",
                background:deleting?C.border:C.rose,fontFamily:"'Outfit'",fontWeight:700,
                fontSize:14,color:"white",cursor:deleting?"not-allowed":"pointer"}}>
                {deleting?"Deleting…":"Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"280px 1fr",gap:20,width:"100%"}}>
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}><SLabel>Recent Matches</SLabel></div>
          {allMatches.map(m=>(
            <div key={m.id} className="row" onClick={()=>setSel(m)} style={{
              padding:"13px 18px",borderBottom:`1px solid ${C.border}`,
              background:selMatch?.id===m.id?C.pageBg:C.cardBg,
              borderLeft:`3px solid ${selMatch?.id===m.id?C.pickle:"transparent"}`,
              position:"relative"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:11,color:C.textLight}}>{m.date}</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <Badge text={m.result} color={m.result==="W"?C.mint:C.rose}/>
                  <button onClick={e=>{e.stopPropagation();setDeleteId(m.id);}} style={{
                    width:22,height:22,borderRadius:5,border:`1px solid ${C.border}`,
                    background:"transparent",color:C.textLight,cursor:"pointer",
                    fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",
                    lineHeight:1,transition:"all 0.15s",flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.rose;e.currentTarget.style.color=C.rose;e.currentTarget.style.background=`${C.rose}10`;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textLight;e.currentTarget.style.background="transparent";}}>
                    🗑
                  </button>
                </div>
              </div>
              <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:2}}>vs {m.opponent}</div>
              <div style={{fontSize:11,color:C.textLight}}>w/ {m.partner} · {m.score}</div>
            </div>
          ))}
        </Card>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* ── Match Result Card ── */}
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <SectionLabelInline>{selMatch?.date} · w/ {selMatch?.partner}</SectionLabelInline>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:C.navy,letterSpacing:"0.04em"}}>vs {selMatch?.opponent}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:13,color:C.textMid}}>{selMatch?.score}</span>
                <Badge text={selMatch?.result==="W"?"WIN":"LOSS"} color={selMatch?.result==="W"?C.mint:C.rose}/>
                <button onClick={()=>setEditMatch(selMatch)} style={{
                  display:"flex",alignItems:"center",gap:5,padding:"6px 12px",
                  borderRadius:8,border:`1px solid ${C.border}`,background:C.pageBg,
                  fontFamily:"'Outfit'",fontWeight:600,fontSize:12,color:C.textMid,
                  cursor:"pointer"}}>✏️ Edit</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:12,marginBottom:20}}>
              {MATCH_KPIS.map(k=><KPICard key={k.id} {...k}/>)}
            </div>

            {/* Shot split by partner */}
            <SLabel>Shot Distribution · You vs {selMatch?.partner}</SLabel>
            <div style={{display:"flex",gap:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:C.blue}}/>
                <span style={{fontSize:11,color:C.textMid}}>{profileName} (you)</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:C.textLight}}/>
                <span style={{fontSize:11,color:C.textMid}}>{selMatch?.partner}</span>
              </div>
            </div>
            {(selMatch?.shotSplit||[]).map(sh=>(
              <div key={sh.label} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:8,height:8,borderRadius:2,background:sh.color}}/>
                    <span style={{fontSize:13,fontWeight:600,color:C.text}}>{sh.label}</span>
                  </div>
                  <span style={{fontFamily:"'DM Mono'",fontSize:11,color:C.textLight}}>
                    {sh.totalPct}% of match shots
                  </span>
                </div>
                <div style={{display:"flex",height:20,borderRadius:6,overflow:"hidden",
                  background:C.pageBg,border:`1px solid ${C.border}`}}>
                  <div style={{width:`${sh.myPct}%`,background:C.blue,display:"flex",
                    alignItems:"center",justifyContent:"center",transition:"width 0.5s"}}>
                    {sh.myPct>=20&&<span style={{fontSize:10,fontWeight:700,color:"white",
                      fontFamily:"'DM Mono'"}}>{sh.myPct}%</span>}
                  </div>
                  <div style={{width:`${sh.partnerPct}%`,background:C.textLight,display:"flex",
                    alignItems:"center",justifyContent:"center",transition:"width 0.5s"}}>
                    {sh.partnerPct>=20&&<span style={{fontSize:10,fontWeight:700,color:"white",
                      fontFamily:"'DM Mono'"}}>{sh.partnerPct}%</span>}
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                  <span style={{fontSize:10,color:C.blue}}>You {sh.myPct}%</span>
                  <span style={{fontSize:10,color:C.textLight}}>{selMatch?.partner?.split(" ")[0]} {sh.partnerPct}%</span>
                </div>
              </div>
            ))}
          </Card>


        </div>
      </div>
    </>
  );
};

// ── PARTNER SUGGESTIONS ──────────────────────────────────────────────────────
// ── PARTNERS CONTENT ────────────────────────────────────────────────────────
const PartnersContent=()=>{
  const isMobile = useIsMobile();
  const [ap,setAp]=useState(null);
  const [selShots,setSelShots]=useState(["dink","drive","lob"]);
  const [showS,setShowS]=useState(false);
  const [dbMatches,setDbMatches]=useState([]);
  const shots=ALL_SHOTS_LIST.filter(s=>selShots.includes(s.id));

  useEffect(()=>{
    sb.query("matches",{order:"created_at.desc"})
      .then(rows=>{
        setDbMatches((rows||[]).map(m=>({
          partner:      m.partner||"",
          result:       m.result==="W"?"W":"L",
          nvz_arrival:  m.nvz_arrival||0,
          nvz_win:      m.nvz_win||0,
          serve_neut:   m.serve_neut||0,
          errors:       m.errors||0,
          partner_role: m.partner_role||"",
        })));
      }).catch(()=>{});
  },[]);

  const partnerMap={};
  dbMatches.forEach(m=>{
    // Support comma-separated partner names from chip UI
    const names=(m.partner||"").split(",").map(s=>s.trim()).filter(s=>s&&s!=="—");
    names.forEach(name=>{
      if(!partnerMap[name]) partnerMap[name]={name,matches:0,wins:0,nvzSum:0,nvzWinSum:0,serveSum:0,errSum:0,roleVotes:{}};
      partnerMap[name].matches++;
      if(m.result==="W") partnerMap[name].wins++;
      partnerMap[name].nvzSum    += m.nvz_arrival||0;
      partnerMap[name].nvzWinSum += m.nvz_win||0;
      partnerMap[name].serveSum  += m.serve_neut||0;
      partnerMap[name].errSum    += parseFloat(m.errors||0);
      if(m.partner_role) partnerMap[name].roleVotes[m.partner_role] = (partnerMap[name].roleVotes[m.partner_role]||0)+1;
    });
  });
  // Compute role from logged role votes, falling back to stat-derived heuristic
  const computeRole = (p) => {
    // If user logged a role for this partner combination, use the most common one
    const votes = p.roleVotes || {};
    const voteEntries = Object.entries(votes);
    if(voteEntries.length > 0) {
      return voteEntries.sort((a,b)=>b[1]-a[1])[0][0];
    }
    // Fallback: derive from stats
    const nvzAvg   = p.nvzSum   / p.matches;
    const serveAvg = p.serveSum / p.matches;
    const errAvg   = p.errSum   / p.matches;
    if(nvzAvg >= 75 && errAvg <= 5)  return "Resetter";
    if(serveAvg >= 70)               return "Driver";
    if(errAvg > 8)                   return "Attacker";
    return "Balanced";
  };

  const livePartners=Object.values(partnerMap).map(p=>({
    ...p,
    synergy:  Math.round((p.wins/p.matches)*60+Math.min(20,(p.nvzSum/p.matches)/4)),
    nvz:      Math.round(p.nvzSum/p.matches)||0,
    nvzWin:   Math.round(p.nvzWinSum/p.matches)||0,
    serve:    Math.round(p.serveSum/p.matches)||0,
    errors:   +(p.errSum/p.matches).toFixed(1)||0,
    role:     computeRole(p),
    matchHistory:[],
  })).sort((a,b)=>b.synergy-a.synergy);

  useEffect(()=>{ if(livePartners.length>0&&!ap) setAp(livePartners[0]); },[dbMatches]);

  const getTeamKPIs=(p)=>!p?[]:[
    { id:"winRate",    label:"Win Rate Together",    value:`${Math.round(p.wins/p.matches*100)}%`, numVal:Math.round(p.wins/p.matches*100), target:65, unit:"%", higherIsBetter:true,  color:C.pickle, colorL:"#F5FAE8" },
    { id:"errors",     label:"Team Errors / Match",  value:p.errors,  numVal:p.errors,  target:8,  unit:"",  higherIsBetter:false, color:C.rose,   colorL:C.roseL },
    { id:"serveNeut",  label:"My Serve Neut.", value:p.serve>0?`${p.serve}%`:"—", numVal:p.serve||null, target:70, unit:"%", higherIsBetter:true, color:C.amber, colorL:C.amberL },
    { id:"nvzArrival", label:"Team NVZ Arrival",     value:`${p.nvz}%`, numVal:p.nvz,   target:80, unit:"%", higherIsBetter:true,  color:C.mint,   colorL:C.mintL },
    { id:"nvzWin",     label:"Team NVZ Win Rate",    value:p.nvzWin>0?`${p.nvzWin}%`:"—", numVal:p.nvzWin||null, target:65, unit:"%", higherIsBetter:true, color:C.blue, colorL:C.blueL },
  ];
  // Safe ap reference — avoids race between livePartners populating and ap useEffect firing
  const safeAp = ap || livePartners[0] || null;

  // Empty state — no partners yet
  if(!safeAp) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:16}}>👥</div>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:C.navy,letterSpacing:"0.05em",marginBottom:8}}>No Partners Yet</div>
      <div style={{fontSize:14,color:C.textMid,maxWidth:380,lineHeight:1.6}}>
        Partner analytics build automatically from your match history. Log a match with a partner name and they'll appear here.
      </div>
    </div>
  );

  const tkpis = getTeamKPIs(safeAp);

  return(
    <div>
      {showS&&<ShotModal selected={selShots} onSave={setSelShots} onClose={()=>setShowS(false)}/>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"280px 1fr",gap:20,width:"100%"}}>
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}><SLabel>Partner Combinations</SLabel></div>
          {livePartners.map(p=>(
            <div key={p.name} className="row" onClick={()=>setAp(p)} style={{
              padding:"14px 18px",borderBottom:`1px solid ${C.border}`,
              background:safeAp&&safeAp.name===p.name?C.pageBg:C.cardBg,
              borderLeft:`3px solid ${safeAp&&safeAp.name===p.name?C.pickle:"transparent"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{width:36,height:36,borderRadius:"50%",
                  background:`linear-gradient(135deg,${C.blue},${C.mint})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Bebas Neue'",fontSize:14,color:"white",flexShrink:0}}>
                  {(p.name||"?").split(" ").filter(Boolean).map(w=>w[0]||"").join("").toUpperCase()||"?"}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{p.name}</div>
                  <div style={{fontSize:11,color:C.textLight}}>{p.matches} matches</div>
                </div>
                <div style={{marginLeft:"auto",fontFamily:"'Bebas Neue'",fontSize:24,
                  color:p.synergy>=80?C.mint:p.synergy>=70?C.amber:C.rose}}>{p.synergy}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Badge text={`${p.wins}W · ${p.matches-p.wins}L`} color={C.textLight}/>
                <Badge text={p.role} color={C.blue}/>
              </div>
            </div>
          ))}
        </Card>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:48,height:48,borderRadius:"50%",
                  background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Bebas Neue'",fontSize:18,color:C.navy}}>
                  {(safeAp?.name||"?").split(" ").filter(Boolean).map(w=>w[0]||"").join("").toUpperCase()||"?"}
                </div>
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:C.navy,letterSpacing:"0.04em"}}>w/ {safeAp?.name}</div>
                  <div style={{fontSize:12,color:C.textMid}}>{safeAp?.matches} matches · {safeAp?.wins}W · {safeAp?.matches-safeAp?.wins}L</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:C.textLight,marginBottom:2}}>Synergy Score</div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:44,color:C.mint,lineHeight:1}}>{safeAp?.synergy}</div>
              </div>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{height:8,background:C.border,borderRadius:4}}>
                <div style={{height:"100%",width:`${safeAp?.synergy||0}%`,
                  background:`linear-gradient(90deg,${C.pickle},${C.mint})`,borderRadius:4}}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:12}}>
              {tkpis.map(k=><KPICard key={k.id} {...k}/>)}
            </div>
          </Card>
          {/* ── Role + PICKL Insight row ── */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16}}>

            {/* Role Identification */}
            <Card>
              <SLabel>Role Identification</SLabel>
              {(()=>{
                const roleDescs = {
                  Resetter:  {desc:"Patient kitchen player. Gets to NVZ consistently, keeps errors low.", icon:"🔄"},
                  Driver:    {desc:"Transition player. Neutralizes opponents with serve & drive pressure.", icon:"💥"},
                  Attacker:  {desc:"Aggressive finisher. Looks for speed-ups, slams, and erné opportunities.", icon:"⚡"},
                  Balanced:  {desc:"All-around player. Adapts to situation rather than committing to one style.", icon:"⚖️"},
                };
                const yourRole = safeAp?.role || "Balanced";
                const rd = roleDescs[yourRole] || roleDescs.Balanced;
                return(<>
                  <div style={{background:C.pageBg,borderRadius:12,padding:"14px",marginBottom:10}}>
                    <div style={{fontSize:11,color:C.textLight,marginBottom:4}}>You</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:20}}>{rd.icon}</span>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:C.blue,letterSpacing:"0.04em"}}>{yourRole}</div>
                      <span style={{fontSize:9,color:C.blue,background:`${C.blue}18`,borderRadius:4,
                        padding:"2px 6px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>
                        {safeAp?.roleVotes&&Object.keys(safeAp.roleVotes).length>0?"from match logs":"from stats"}
                      </span>
                    </div>
                    <div style={{fontSize:11,color:C.textMid,lineHeight:1.5}}>{rd.desc}</div>
                  </div>
                  <div style={{background:C.pageBg,borderRadius:12,padding:"14px",opacity:0.6}}>
                    <div style={{fontSize:11,color:C.textLight,marginBottom:4}}>{safeAp?.name}</div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:C.textLight,letterSpacing:"0.04em",marginBottom:4}}>—</div>
                    <div style={{fontSize:11,color:C.textLight,lineHeight:1.5}}>
                      Partner role tracking requires multi-player accounts — coming soon.
                    </div>
                  </div>
                </>);
              })()}
            </Card>

            {/* PICKL Team Insight — dynamic based on real stats */}
            {(()=>{
              const winRate  = Math.round((safeAp?.wins||0)/(safeAp?.matches||1)*100);
              const nvz      = safeAp?.nvz||0;
              const serve    = safeAp?.serve||0;
              const errors   = safeAp?.errors||0;
              const nvzWin   = safeAp?.nvzWin||0;
              const matches  = safeAp?.matches||0;
              const name     = safeAp?.name?.split(" ")[0]||"your partner";

              // Build contextual insight from actual stats
              let insight = "";
              if(matches < 3) {
                insight = `You've played ${matches} match${matches===1?"":"es"} with ${name}. Log a few more together and PICKL will give you specific partnership coaching based on your real stats.`;
              } else {
                const lines = [];
                if(winRate >= 75) lines.push(`You and ${name} are winning ${winRate}% together — an elite partnership rate. Focus on consistency rather than changing what's working.`);
                else if(winRate >= 50) lines.push(`${winRate}% win rate with ${name} is solid but beatable. Look at which match types you lose — opponents who pressure your transition game?`);
                else lines.push(`${winRate}% win rate with ${name} suggests a tactical mismatch somewhere. Consider who covers the middle and whether your roles complement each other.`);

                if(nvz >= 80) lines.push(`Your NVZ arrival at ${nvz}% is excellent — you're getting to the kitchen and forcing opponents to dink.`);
                else if(nvz < 65) lines.push(`NVZ arrival at ${nvz}% is your biggest lever. Prioritize getting to the kitchen faster — your win rate will follow.`);

                if(errors <= 4) lines.push(`Only ${errors} unforced errors per match is elite-level discipline.`);
                else if(errors >= 8) lines.push(`${errors} errors per match is costing you points. Identify which shot type you force — likely a high-risk ball you can reset instead.`);

                if(serve >= 80) lines.push(`${serve}% serve neutralization means opponents rarely attack off your return — a huge team advantage.`);
                else if(serve < 55 && serve > 0) lines.push(`At ${serve}% serve neutralization, opponents are attacking your return too often. Work on deeper, lower returns.`);

                insight = lines.slice(0,2).join(" ");
              }

              return(
                <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,
                  borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                  <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                    <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,
                      background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🥒</div>
                    <div>
                      <div style={{fontSize:12,color:C.pickle,fontWeight:700,marginBottom:8}}>PICKL Team Insight</div>
                      <div style={{fontSize:13,color:"#CBD5E1",lineHeight:1.7}}>{insight}</div>
                    </div>
                  </div>
                  {matches >= 3 && (
                    <div style={{display:"flex",gap:12,marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                      {[
                        {label:"Win Rate", val:`${winRate}%`, color:winRate>=65?C.mint:C.rose},
                        {label:"NVZ Arrival", val:`${nvz}%`, color:nvz>=75?C.mint:C.amber},
                        {label:"My Errors", val:errors, color:errors<=5?C.mint:C.rose},
                      ].map(s=>(
                        <div key={s.label} style={{flex:1,textAlign:"center"}}>
                          <div style={{fontFamily:"'DM Mono'",fontSize:18,fontWeight:700,color:s.color}}>{s.val}</div>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
const Sparkline = ({ data, color, width=120, height=44, showDots=true }) => {
  const mn = Math.min(...data) - 4;
  const mx = Math.max(...data) + 4;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 8) + 4;
    const y = height - 6 - ((v - mn) / (mx - mn)) * (height - 14);
    return [x, y];
  });
  const polyline = pts.map(([x,y]) => `${x},${y}`).join(" ");
  const area = `M${pts[0][0]},${pts[0][1]} ${pts.map(([x,y])=>`L${x},${y}`).join(" ")} L${pts[pts.length-1][0]},${height-2} L${pts[0][0]},${height-2} Z`;
  const [hovered, setHovered] = useState(null);
  const uid = color.replace(/[^a-z0-9]/gi,"") + width;
  return (
    <div style={{ position:"relative" }}>
      <svg width={width} height={height} style={{ display:"block", overflow:"visible" }}>
        <defs>
          <linearGradient id={`sg${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#sg${uid})`}/>
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {showDots && pts.map(([x,y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="7" fill="transparent"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}/>
            {hovered === i && (
              <>
                <circle cx={x} cy={y} r="3.5" fill={color} stroke="white" strokeWidth="1.5"/>
                <rect x={Math.min(x-18, width-38)} y={y-24} width={36} height={16} rx={4} fill={C.navy}/>
                <text x={Math.min(x, width-20)} y={y-13} textAnchor="middle" fill="white" fontSize="9" fontFamily="'DM Mono'">{data[i]}%</text>
              </>
            )}
            {hovered !== i && i === data.length-1 && (
              <circle cx={x} cy={y} r="3" fill={color} stroke="white" strokeWidth="1.5"/>
            )}
          </g>
        ))}
        {!showDots && (
          <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3" fill={color} stroke="white" strokeWidth="1.5"/>
        )}
      </svg>
    </div>
  );
};

// ── SHOTS PAGE ─────────────────────────────────────────────────────────────────
const Shots = () => {
  const isMobile = useIsMobile();
  const [dbShots, setDbShots] = useState([]);

  useEffect(()=>{
    sb.query("shots", { order: "name.asc" })
      .then(rows => {
        if (rows && rows.length > 0) {
          // Merge DB data into SHOT_CATS structure
          rows.forEach(row => {
            SHOT_CATS.forEach(cat => {
              const shot = cat.shots.find(s => s.name === row.name);
              if (shot) {
                shot.attempts    = row.attempts    || 0;
                shot.wins        = row.wins        || 0;
                shot.misses      = row.misses      || 0;
                shot.posCount    = row.pos_count   || 0;
                shot.neuCount    = row.neu_count   || 0;
                shot.negCount    = row.neg_count   || 0;
                shot.winHistory  = row.win_history  || [0,0,0,0];
                shot.missHistory = row.miss_history || [0,0,0,0];
                if (row.tip) shot.tip = row.tip;
              }
            });
          });
          setDbShots(rows);
        }
      })
      .catch(()=>{});
  },[]);
  const [cat, setCat]         = useState("all");
  const [tab, setTab]         = useState("all");
  const [sortCol, setSortCol] = useState("misses");   // default: worst first
  const [sortDir, setSortDir] = useState("desc");
  const [pinVer, setPinVer]   = useState(0);

  const WEEKS = ["W1","W2","W3","W4"];

  const all = SHOT_CATS.flatMap(c => c.shots.map(s => ({
    ...s, category:c.label, catColor:c.color, icon:c.icon
  })));

  // Filter by category chip
  const catFiltered = cat === "all" ? all
    : all.filter(s => { const c=SHOT_CATS.find(x=>x.id===cat); return c&&s.category===c.label; });

  // Filter by tab (weapons / weaknesses / all)
  const tabFiltered = tab === "weapons"    ? catFiltered.filter(s=>s.wins>=15) :
                      tab === "weaknesses" ? catFiltered.filter(s=>s.misses>=7) :
                      catFiltered;

  // Sort
  const sortFns = {
    name:      (a,b) => a.name.localeCompare(b.name),
    wins:      (a,b) => a.wins   - b.wins,
    misses:    (a,b) => a.misses - b.misses,
    posCount:  (a,b) => (a.posCount||0) - (b.posCount||0),
    neuCount:  (a,b) => (a.neuCount||0) - (b.neuCount||0),
    negCount:  (a,b) => (a.negCount||0) - (b.negCount||0),
    winTrend:  (a,b) => (a.winHistory[3]-a.winHistory[0])  - (b.winHistory[3]-b.winHistory[0]),
    missTrend: (a,b) => (a.missHistory[3]-a.missHistory[0])-(b.missHistory[3]-b.missHistory[0]),
    category:  (a,b) => a.category.localeCompare(b.category),
  };
  const displayed = [...tabFiltered].sort((a,b) => {
    const v = (sortFns[sortCol]||sortFns.misses)(a,b);
    return sortDir === "asc" ? v : -v;
  });

  const handleSort = col => {
    if (col === sortCol) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({col}) => {
    if (sortCol !== col) return <span style={{color:C.border,marginLeft:3,fontSize:10}}>⇅</span>;
    return <span style={{color:C.pickle,marginLeft:3,fontSize:10}}>{sortDir==="asc"?"▲":"▼"}</span>;
  };

  const ColHeader = ({col, label, align="left"}) => (
    <div onClick={()=>handleSort(col)} style={{
      cursor:"pointer", userSelect:"none",
      display:"flex", alignItems:"center", justifyContent:align==="center"?"center":"flex-start",
      gap:2, fontSize:10, color:sortCol===col?C.navy:C.textLight,
      textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700,
      transition:"color 0.15s"
    }}>
      {label}<SortIcon col={col}/>
    </div>
  );

  const topWeapon    = [...all].sort((a,b)=>b.wins-a.wins)[0];
  const topWeakness  = [...all].sort((a,b)=>b.misses-a.misses)[0];
  const mostImproved = [...all].sort((a,b)=>(b.winHistory[3]-b.winHistory[0])-(a.winHistory[3]-a.winHistory[0]))[0];

  return (
    <div className="fade-up" style={{ maxWidth:1200, margin:"0 auto", padding:isMobile?"14px":"32px", boxSizing:"border-box", width:"100%" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:"'Bebas Neue'", fontSize:34, letterSpacing:"0.05em", color:C.navy }}>Shot Analytics</h1>
          <p style={{ color:C.textMid, fontSize:14, marginTop:3 }}>4-week win & loss trends · {all.length} shot types tracked · 📌 pin up to 3 shots that need targeted focus and drilling</p>
        </div>
      </div>

      {/* Summary trio */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        <Card style={{ borderLeft:`4px solid ${C.mint}`, cursor:"pointer" }} onClick={()=>setTab("weapons")}>
          <div style={{ fontSize:11, color:C.mint, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, marginBottom:4 }}>🏆 Top Weapon</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:18, color:C.text, marginBottom:6 }}>{topWeapon?.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"'DM Mono'", fontSize:isMobile?18:26, fontWeight:700, color:C.mint }}>{topWeapon?.wins} pts won</span>
            <div style={{ flex:1 }}><Sparkline data={topWeapon?.winHistory||[]} color={C.mint} width={90} height={36} showDots={false}/></div>
          </div>
        </Card>
        <Card style={{ borderLeft:`4px solid ${C.rose}`, cursor:"pointer" }} onClick={()=>setTab("weaknesses")}>
          <div style={{ fontSize:11, color:C.rose, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, marginBottom:4 }}>⚠️ Biggest Weakness</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:18, color:C.text, marginBottom:6 }}>{topWeakness?.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"'DM Mono'", fontSize:isMobile?18:26, fontWeight:700, color:C.rose }}>{topWeakness?.misses} pts lost</span>
            <div style={{ flex:1 }}><Sparkline data={topWeakness?.missHistory||[]} color={C.rose} width={90} height={36} showDots={false}/></div>
          </div>
        </Card>
        <Card style={{ borderLeft:`4px solid ${C.blue}` }}>
          <div style={{ fontSize:11, color:C.blue, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, marginBottom:4 }}>📈 Most Improved (4wk)</div>
          {(()=>{
            // winHistory stores win-rate % per week slot [oldest … newest]
            // Only count slots that had real data logged (non-zero)
            const h = mostImproved?.winHistory||[0,0,0,0];
            const nonZeroSlots = h.filter(v=>v>0);
            const hasMultiWeek = nonZeroSlots.length >= 2;
            // Find oldest non-zero and newest non-zero for a meaningful delta
            const firstIdx = h.findIndex(v=>v>0);
            const lastIdx  = h.length - 1 - [...h].reverse().findIndex(v=>v>0);
            const delta    = hasMultiWeek ? h[lastIdx] - h[firstIdx] : 0;
            const totalAttempts = (mostImproved?.wins||0) + (mostImproved?.misses||0);
            const winRate = totalAttempts > 0 ? Math.round((mostImproved?.wins||0)/totalAttempts*100) : 0;
            if(!hasMultiWeek) return (
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:C.text,marginBottom:4}}>{mostImproved?.name||"—"}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div>
                    <div style={{fontFamily:"'DM Mono'",fontSize:isMobile?14:18,fontWeight:700,color:C.blue}}>{winRate}% win rate</div>
                    <div style={{fontSize:10,color:C.textLight,marginTop:2,fontStyle:"italic"}}>Log across 2+ sessions to see trend</div>
                  </div>
                  <div style={{flex:1}}><Sparkline data={h} color={C.blue} width={90} height={36} showDots={false}/></div>
                </div>
              </div>
            );
            return (
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:C.text,marginBottom:4}}>{mostImproved?.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div>
                    <span style={{fontFamily:"'DM Mono'",fontSize:isMobile?18:26,fontWeight:700,color:delta>=0?C.blue:C.rose}}>
                      {delta>=0?"+":""}{delta}%
                    </span>
                    <div style={{fontSize:10,color:C.textLight,marginTop:2}}>win rate change · now {h[lastIdx]}%</div>
                  </div>
                  <div style={{flex:1}}><Sparkline data={h} color={C.blue} width={90} height={36} showDots={false}/></div>
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Controls row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        {/* Tab switcher */}
        <div style={{ display:"flex", gap:0, background:C.cardBg,
          border:`1px solid ${C.border}`, borderRadius:12, padding:4 }}>
          {[
            { id:"all",        label:"📊 All Shots",     activeColor:C.navy,  activeBg:"#E5E9F0" },
            { id:"weapons",    label:"🏆 Weapons",       activeColor:C.mint,  activeBg:C.mintL  },
            { id:"weaknesses", label:"⚠️ Weaknesses",    activeColor:C.rose,  activeBg:C.roseL  },
          ].map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:tab===t.id?t.activeBg:"transparent",
              border:`1px solid ${tab===t.id?t.activeColor+"40":"transparent"}`,
              borderRadius:9, padding:"8px 18px", fontSize:13, fontWeight:600,
              color:tab===t.id?t.activeColor:C.textMid,
              cursor:"pointer", fontFamily:"'Outfit'", transition:"all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Category chips */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {[{id:"all",label:"All",color:C.navy}, ...SHOT_CATS].map(c => {
            const active = cat===c.id;
            return (
              <button key={c.id} onClick={()=>setCat(c.id)} style={{
                background:active?c.color:C.cardBg,
                border:`1.5px solid ${active?c.color:C.border}`,
                borderRadius:20, padding:"4px 11px", fontSize:11, fontWeight:600,
                color:active?(c.id==="all"?"white":C.navy):C.textMid,
                cursor:"pointer", fontFamily:"'Outfit'", transition:"all 0.15s" }}>
                {c.id!=="all"&&<span style={{marginRight:3}}>{SHOT_CATS.find(x=>x.id===c.id)?.icon}</span>}
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shot count */}
      <div style={{ fontSize:12, color:C.textLight, marginBottom:10 }}>
        {displayed.length} shots · click any column header to sort
      </div>

      {/* ── SORTABLE TABLE ── */}
      <Card style={{ padding:0, overflow:"hidden" }}>
        {/* Header */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"36px 1fr 80px 60px 60px 60px 70px 70px",
          gap:8, padding:"10px 18px",
          borderBottom:`2px solid ${C.border}`, background:C.pageBg,
          alignItems:"center"
        }}>
          <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>🎯</div>
          <ColHeader col="name"     label="Shot / Tip" />
          <ColHeader col="category" label="Category"   />
          <ColHeader col="wins"     label="Rally Won"  align="center"/>
          <ColHeader col="misses"   label="Rally Lost" align="center"/>
          <ColHeader col="posCount" label="✓ Pos"      align="center"/>
          <ColHeader col="neuCount" label="– Neu"      align="center"/>
          <ColHeader col="negCount" label="✕ Neg"      align="center"/>
        </div>

        {/* Rows */}
        {displayed.map((shot, i) => {
          const hasTrend   = shot.winHistory.filter(v=>v>0).length >= 2;
          const winDelta   = shot.winHistory[3] - shot.winHistory[0];
          const missDelta  = shot.missHistory[3] - shot.missHistory[0];
          const isPinned   = GOALS.priorityShots.some(p=>p.name===shot.name);
          const atMax      = GOALS.priorityShots.length >= 3 && !isPinned;
          return (
            <div key={shot.name} style={{
              display:"grid",
              gridTemplateColumns:"36px 1fr 80px 60px 60px 60px 70px 70px",
              gap:8, padding:"12px 18px",
              borderBottom:`1px solid ${C.border}`,
              background:isPinned?`${C.pickle}08`:i%2===0?C.cardBg:"#FAFBFC",
              alignItems:"start", transition:"background 0.15s"
            }}>

              {/* Pin button */}
              <div style={{display:"flex",justifyContent:"center",paddingTop:2}}>
                <button onClick={()=>{
                  if(isPinned){
                    GOALS.priorityShots = GOALS.priorityShots.filter(p=>p.name!==shot.name);
                  } else if(!atMax){
                    GOALS.priorityShots = [...GOALS.priorityShots,
                      {name:shot.name, targetMisses:Math.max(1,shot.misses-2), color:shot.catColor||C.blue}];
                  }
                  setPinVer(v=>v+1);
                }} title={isPinned?"Unpin drill":atMax?"Max 3 reached":"Pin as priority drill"}
                style={{
                  width:28, height:28, borderRadius:7,
                  border:`1.5px solid ${isPinned?C.pickle:C.border}`,
                  background:isPinned?`${C.pickle}20`:"transparent",
                  color:isPinned?C.pickleD:atMax?"#D1D5DB":C.textLight,
                  cursor:atMax&&!isPinned?"not-allowed":"pointer",
                  fontSize:13, display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"all 0.15s",
                }}>📌</button>
              </div>

              {/* Shot name + tip inline */}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{shot.name}</span>
                  {isPinned&&<span style={{fontSize:9,color:C.pickleD,fontWeight:700,textTransform:"uppercase",
                    letterSpacing:"0.05em",background:`${C.pickle}20`,borderRadius:4,padding:"2px 5px"}}>Priority</span>}
                </div>
                {shot.tip&&<div style={{fontSize:11,color:C.textMid,lineHeight:1.5,marginTop:3,maxWidth:420}}>{shot.tip}</div>}
              </div>

              {/* Category */}
              <div style={{fontSize:11,color:shot.catColor,display:"flex",alignItems:"center",gap:3,paddingTop:2}}>
                <span>{shot.icon}</span>{shot.category}
              </div>

              {/* Rally Won */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,paddingTop:2}}>
                <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,
                  color:shot.wins>0?C.mint:C.textLight}}>{shot.wins||"—"}</span>
                {hasTrend && (
                  <span style={{fontSize:10,fontWeight:700,color:winDelta>=0?C.mint:C.rose}}>
                    {winDelta>=0?`▲+${winDelta}%`:`▼${winDelta}%`}
                  </span>
                )}
              </div>

              {/* Rally Lost */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,paddingTop:2}}>
                <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,
                  color:shot.misses>0?C.rose:C.textLight}}>{shot.misses||"—"}</span>
                {hasTrend && (
                  <span style={{fontSize:10,fontWeight:700,color:missDelta<=0?C.mint:C.rose}}>
                    {missDelta<=0?`▼${missDelta}%`:`▲+${missDelta}%`}
                  </span>
                )}
              </div>

              {/* Positive count */}
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",paddingTop:2}}>
                <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,
                  color:(shot.posCount||0)>0?C.mint:C.textLight}}>{shot.posCount||"—"}</span>
              </div>

              {/* Neutral count */}
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",paddingTop:2}}>
                <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,
                  color:(shot.neuCount||0)>0?C.textMid:C.textLight}}>{shot.neuCount||"—"}</span>
              </div>

              {/* Negative count */}
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",paddingTop:2}}>
                <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,
                  color:(shot.negCount||0)>0?C.rose:C.textLight}}>{shot.negCount||"—"}</span>
              </div>

            </div>
          );
        })}

        {/* Empty state */}
        {displayed.length === 0 && (
          <div style={{padding:"48px",textAlign:"center",color:C.textLight,fontSize:13}}>
            No shots match this filter
          </div>
        )}
      </Card>
    </div>
  );
};

// ── AI COACH ──────────────────────────────────────────────────────────────────
const SUGG=[
  {icon:"📊",text:"What's my biggest weakness right now?"},
  {icon:"🎯",text:"Give me a drill plan for this week"},
  {icon:"🎯",text:"What should I work on before my next match?"},
  {icon:"🏆",text:"Build me a 2-week tournament prep plan"},
  {icon:"💡",text:"What would Ben Johns say about my game?"},
  {icon:"🤝",text:"How can Sam and I improve our synergy?"},
];

const Coach=()=>{
  const isMobile = useIsMobile();
  const [msgs,setMsgs]=useState([{role:"assistant",ts:"Just now",
    content:`Hey! I'm PICKL — your personal AI pickleball coach. 🎾\n\nI have full access to your match history and shot stats. Ask me anything — what to work on, drill plans, game strategy, or opponent preparation.\n\nWhat do you want to work on?`}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [playerCtx,setPlayerCtx]=useState("");
  const [ctxReady,setCtxReady]=useState(false);
  const playerCtxRef=useRef("");  // ref so send() always reads latest value
  const btmRef=useRef(null);
  useEffect(()=>{btmRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  // Load player data once on mount to inject into every coach message
  useEffect(()=>{
    (async()=>{
      try{
        const [matches, shots, profile] = await Promise.all([
          sb.query("matches",{order:"created_at.desc"}),
          sb.query("shots"),
          sb.query("profile",{single:true}),
        ]);
        const m = Array.isArray(matches)?matches:[];
        const s = Array.isArray(shots)?shots:[];
        const totalMatches = m.length;
        if(totalMatches===0){ const v="Player has no matches logged yet."; setPlayerCtx(v); playerCtxRef.current=v; setCtxReady(true); return; }
        const wins = m.filter(x=>x.result==="W").length;
        const winPct = Math.round(wins/totalMatches*100);
        const avgNvz = Math.round(m.reduce((a,x)=>a+(x.nvz_arrival||0),0)/totalMatches);
        const avgNvzWin = Math.round(m.reduce((a,x)=>a+(x.nvz_win||0),0)/totalMatches);
        const avgServe = Math.round(m.reduce((a,x)=>a+(x.serve_neut||0),0)/totalMatches);
        const avgErrors = (m.reduce((a,x)=>a+(parseFloat(x.errors)||0),0)/totalMatches).toFixed(1);
        const recentOpponents = [...new Set(m.slice(0,5).map(x=>x.opponent).filter(Boolean))].join(", ")||"none logged";
        const partners = [...new Set(m.map(x=>x.partner).filter(Boolean))].join(", ")||"none logged";
        // Top shots by wins and misses
        const topWin = [...s].sort((a,b)=>(b.wins||0)-(a.wins||0)).slice(0,3).map(x=>`${x.name}(${x.wins}W)`).join(", ");
        const topMiss = [...s].sort((a,b)=>(b.misses||0)-(a.misses||0)).slice(0,3).map(x=>`${x.name}(${x.misses}L)`).join(", ");
        const playerName = profile?.player_name || "Player";
        const dupr = profile?.dupr ? `DUPR: ${profile.dupr}` : "DUPR: not set";
        const ctx = `
PLAYER PROFILE:
Name: ${playerName} | ${dupr}
Total Matches: ${totalMatches} | Record: ${wins}W-${totalMatches-wins}L (${winPct}% win rate)

PERFORMANCE AVERAGES (across all matches):
- NVZ Arrival: ${avgNvz}% (target >80%)
- NVZ Win Rate: ${avgNvzWin}% (target >65%)
- My Serve Neutralization: ${avgServe}% (target >70%)
- My Unforced Errors/match: ${avgErrors} (target <8)

SHOT DATA:
- Best shots (most wins): ${topWin||"no shot data yet"}
- Leaky shots (most losses): ${topMiss||"no shot data yet"}

RECENT MATCHES (last 5):
${m.slice(0,5).map(x=>"- "+(x.date||"?")+" vs "+(x.opponent||"?")+": "+x.result+" "+(x.score||"")).join("\n")}

Partners played with: ${partners}
Recent opponents: ${recentOpponents}
`.trim();
        setPlayerCtx(ctx); playerCtxRef.current=ctx; setCtxReady(true);
      }catch(e){ const v="Could not load player data."; setPlayerCtx(v); playerCtxRef.current=v; setCtxReady(true); }
    })();
  },[]);

  const send=async(text)=>{
    const msg=text||input.trim();if(!msg||loading)return;
    setInput("");
    const ts=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    setMsgs(prev=>[...prev,{role:"user",content:msg,ts},{role:"assistant",typing:true}]);
    setLoading(true);
    try{
      const hist=msgs.filter(m=>!m.typing).map(m=>({role:m.role,content:m.content}));
      // Build dynamic system prompt with real player data (use ref for latest value)
      const COACH_SYS = COACH_SYS_BASE + "\n\n" + (playerCtxRef.current||playerCtx||"No player data available.");
      const apiMsgs=[
        ...hist.slice(1), // skip the initial greeting
        {role:"user",content:msg}
      ];
      // Call our server-side proxy — keeps the API key off the client
      const res=await fetch("/api/coach",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,system:COACH_SYS,messages:apiMsgs})
      });
      if(!res.ok) throw new Error(await res.text());
      const data=await res.json();
      const reply=data.content?.map(b=>b.text||"").join("")||"Try again.";
      setMsgs(prev=>[...prev.filter(m=>!m.typing),{role:"assistant",content:reply,ts:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}]);
    }catch(e){
      console.error("Coach:",e.message);
      const noKey = !e.message || e.message.includes("401") || e.message.includes("missing");
      setMsgs(prev=>[...prev.filter(m=>!m.typing),{role:"assistant",
        content: noKey
          ? "⚠️ API key needed. In Vercel: Settings → Environment Variables → add ANTHROPIC_KEY (no VITE_ prefix) with your Anthropic API key, then redeploy."
          : "Connection issue — try again.",
        ts:""}]);
    }finally{setLoading(false);}
  };

  return(
    <div className="fade-up" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 52px)",maxWidth:860,margin:"0 auto",width:"100%",boxSizing:"border-box",padding:isMobile?"14px 14px 20px":"28px 28px 32px"}}>
      <div style={{padding:"24px 32px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.cardBg}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>AI Coach</h1>
          {/* Data status pill */}
          {(()=>{
            const pillColor = ctxReady ? C.mint : C.amber;
            const matchCount = ctxReady ? (playerCtx.split("Total Matches: ")[1]||"").split(" ")[0]||"" : "";
            const pillLabel = !ctxReady ? "Loading your stats…"
              : playerCtx.includes("no matches") ? "No match data yet"
              : ("Stats loaded · " + matchCount + " matches");
            return(
              <div style={{display:"flex",alignItems:"center",gap:6,
                background:pillColor+"18",border:"1px solid "+pillColor+"40",
                borderRadius:20,padding:"4px 12px"}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:pillColor,
                  animation:ctxReady?"none":"pulse 1.2s infinite"}}/>
                <span style={{fontSize:11,fontWeight:600,color:pillColor}}>{pillLabel}</span>
              </div>
            );
          })()}
        </div>
        <p style={{color:C.textMid,fontSize:13,marginTop:4}}>Patient · NVZ-first · drill-driven coaching</p>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"20px 32px",background:C.pageBg}}>
        {msgs.map((m,i)=>{
          const isU=m.role==="user";
          return(
            <div key={i} style={{display:"flex",gap:12,marginBottom:18,flexDirection:isU?"row-reverse":"row",animation:"fadeUp 0.3s ease both"}}>
              {!isU&&<div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,
                background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🥒</div>}
              <div style={{maxWidth:"76%",
                background:isU?`linear-gradient(135deg,${C.navy},${C.navyMid})`:C.cardBg,
                border:isU?"none":`1px solid ${C.border}`,
                borderRadius:isU?"16px 4px 16px 16px":"4px 16px 16px 16px",
                padding:"13px 16px",
                boxShadow:isU?"0 4px 20px rgba(10,22,40,0.2)":"0 1px 4px rgba(0,0,0,0.04)"}}>
                {m.typing?(
                  <div style={{display:"flex",gap:5,padding:"3px 0"}}>
                    {[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:C.pickle,
                      animation:"bounce 1.2s ease-in-out infinite",animationDelay:`${j*0.18}s`}}/>)}
                  </div>
                ):(
                  <>
                    <div style={{fontSize:14,lineHeight:1.65,color:isU?"#E4EEFF":C.text}}>
                      {m.content.split("\n").map((line,li)=>{
                        // Render **bold** markdown inline
                        const parts = line.split(/(\*\*[^*]+\*\*)/g);
                        const rendered = parts.map((p,pi)=>
                          p.startsWith("**")&&p.endsWith("**")
                            ? <strong key={pi}>{p.slice(2,-2)}</strong>
                            : p
                        );
                        return <div key={li} style={{marginBottom:line===""?"8px":"2px"}}>{rendered}</div>;
                      })}
                    </div>
                    {m.ts&&<div style={{fontSize:10,color:isU?"rgba(255,255,255,0.3)":C.textLight,marginTop:6,textAlign:"right"}}>{m.ts}</div>}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={btmRef}/>
      </div>
      {msgs.length<=2&&(
        <div style={{padding:"0 32px 12px",display:"flex",gap:8,flexWrap:"wrap",flexShrink:0,background:C.pageBg}}>
          {SUGG.map((s,i)=>(
            <button key={i} className="chip" onClick={()=>send(s.text)} style={{
              background:"#F0F8E8",border:`1px solid ${C.pickle}55`,
              borderRadius:20,padding:"7px 14px",fontSize:12,color:C.textMid,
              cursor:"pointer",fontFamily:"'Outfit'",transition:"all 0.18s",
              display:"flex",alignItems:"center",gap:5}}><span>{s.icon}</span>{s.text}</button>
          ))}
        </div>
      )}
      <div style={{padding:"12px 32px 24px",borderTop:`1px solid ${C.border}`,flexShrink:0,background:C.cardBg}}>
        <div style={{display:"flex",gap:10,alignItems:"flex-end",
          background:C.pageBg,border:`1.5px solid ${C.border}`,borderRadius:16,padding:"10px 14px"}}>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={ctxReady ? "Ask PICKL anything — stats, drills, game plans, opponent scouting..." : "Loading your stats…"}
            rows={1} style={{flex:1,background:"none",border:"none",color:C.text,fontSize:14,
              resize:"none",lineHeight:1.5,maxHeight:120,overflowY:"auto"}}/>
          <button onClick={()=>send()} disabled={!input.trim()||loading} className="btn-p" style={{
            background:input.trim()&&!loading?C.pickle:C.border,border:"none",borderRadius:10,
            width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",
            cursor:input.trim()&&!loading?"pointer":"not-allowed",fontSize:16,flexShrink:0,
            color:input.trim()&&!loading?C.navy:C.textLight}}>
            {loading?<div style={{width:16,height:16,border:`2px solid ${C.border}`,borderTop:`2px solid ${C.navy}`,borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>:"↑"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── PROFILE ────────────────────────────────────────────────────────────────────
const Profile=({setPage})=>{
  const isMobile = useIsMobile();
  const [goalVer,setGoalVer]           = useState(0);
  const [showEditModal,setShowEditModal] = useState(false);
  const [showPwModal,setShowPwModal]   = useState(false);
  const [plan]                         = useState("free");
  const [photoPreview,setPhotoPreview] = useState(null);
  const [saving, setSaving]            = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const [playerName,setPlayerName]       = useState("Your Name");
  const [location,setLocation]           = useState("");
  const [homeClub,setHomeClub]           = useState("");
  const [email,setEmail]                 = useState("");
  const [dupr,setDupr]                   = useState("");

  // Load shots for identity analysis
  const [profileShots, setProfileShots] = useState([]);
  useEffect(() => {
    const uid = getCurrentUserId();
    sb.query("shots", { filter: `user_id=eq.${uid}`, order: "name.asc" })
      .then(rows => { if (rows) setProfileShots(rows); })
      .catch(() => {});
  }, []);

  // Load profile from Supabase on mount
  useEffect(() => {
    const uid = getCurrentUserId();
    sb.query("profile", { filter: `user_id=eq.${uid}`, single: true })
      .then(data => {
        if (data) {
          if (data.player_name) setPlayerName(data.player_name);
          if (data.location)    setLocation(data.location);
          if (data.home_club)   setHomeClub(data.home_club);
          if (data.email)       setEmail(data.email);
          if (data.dupr)        setDupr(data.dupr);
          if (data.goals)       Object.assign(GOALS.targets, data.goals);
          if (data.priority_shots) GOALS.priorityShots = data.priority_shots;
        } else {
          // New user — pre-fill email from auth, prompt them to set their name
          sb.getUser().then(u=>{ if(u?.email) setEmail(u.email); });
          setPlayerName("");
          // Auto-open edit modal so new users set their name on first visit
          setShowEditModal(true);
        }
      })
      .catch(()=>{})
      .finally(()=>setProfileLoading(false));
  }, []);

  const [draft,setDraft] = useState({});
  const openEdit = () => {
    setDraft({playerName,location,homeClub,email,dupr:String(dupr||'')});
    setShowEditModal(true);
  };
  const saveEdit = async () => {
    setSaving(true);
    try {
      const profileData = {
        player_name: draft.playerName || "",
        location: draft.location || "",
        home_club: draft.homeClub || "",
        email: draft.email || "",
        dupr: parseFloat(draft.dupr) || 0,
        goals: GOALS.targets,
        priority_shots: GOALS.priorityShots,
        user_id: getCurrentUserId(),
      };
      const result = await sb.upsert("profile", profileData, "user_id");
      console.log("Profile saved:", result);
      setPlayerName(draft.playerName || "");
      setLocation(draft.location || "");
      setHomeClub(draft.homeClub || "");
      setEmail(draft.email || "");
      setDupr(parseFloat(draft.dupr) || 0);
      setShowEditModal(false);
    } catch(e) {
      console.error("Save error:", e);
      alert("Save failed — check console for details: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const handlePhotoChange = e => {
    const file = e.target.files?.[0];
    if (file) setPhotoPreview(URL.createObjectURL(file));
  };

  const ratingHistory=[0,0,0,0,0,0,0,0];
  const rMin=3.6; const rMax=4.2;
  const months=["Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
  const chartPts = ratingHistory.map((r,i)=>({
    x:(i/(ratingHistory.length-1))*280+10,
    y:80-((r-rMin)/(rMax-rMin))*70, r
  }));
  const polylineStr = chartPts.map(p=>`${p.x},${p.y}`).join(" ");
  const firstPt=chartPts[0]; const lastPt=chartPts[chartPts.length-1];
  const areaPath=`M${firstPt.x},${firstPt.y} ${chartPts.map(p=>`L${p.x},${p.y}`).join(" ")} L${lastPt.x},80 L${firstPt.x},80 Z`;

  return(
    <div className="fade-up" style={{width:"100%",boxSizing:"border-box",padding:isMobile?"14px 14px 20px":"28px 28px 32px",maxWidth:1100,margin:"0 auto"}}>

      {/* ── Edit Profile Modal ── */}
      {showEditModal&&(
        <div onClick={function(e){if(e.target===e.currentTarget)setShowEditModal(false);}}
          style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",
            background:"rgba(10,22,40,0.72)",backdropFilter:"blur(8px)",
            zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",
            padding:"16px",boxSizing:"border-box"}}>
          <div style={{background:C.cardBg,borderRadius:"20px",width:"100%",maxWidth:520,
            maxHeight:"88vh",overflowY:"auto",
            boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}}>
            <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,
              borderRadius:"20px 20px 0 0",padding:"22px 28px",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:26,color:"white",letterSpacing:"0.05em"}}>Edit Profile</div>
                <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>Changes are saved when you click Save</div>
              </div>
              <button onClick={()=>setShowEditModal(false)}
                style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,
                  width:34,height:34,fontSize:18,color:"white",cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{padding:"24px 28px"}}>
              {/* Photo upload */}
              <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:22,
                paddingBottom:20,borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:80,height:80,borderRadius:"50%",overflow:"hidden",flexShrink:0,
                  background:`linear-gradient(135deg,${C.navy},${C.blue})`,
                  border:`3px solid ${C.pickle}`,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {photoPreview
                    ? <img src={photoPreview} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <span style={{fontFamily:"'Bebas Neue'",fontSize:28,color:"white"}}>AC</span>}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6}}>Profile Photo</div>
                  <label style={{display:"inline-block",background:C.navy,color:C.pickle,
                    borderRadius:9,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit'"}}>
                    📷 Choose Photo
                    <input type="file" accept="image/*" onChange={handlePhotoChange} style={{display:"none"}}/>
                  </label>
                  <div style={{fontSize:11,color:C.textLight,marginTop:5}}>JPG, PNG or GIF · max 5MB</div>
                </div>
              </div>
              {/* Text fields */}
              {[
                {label:"Full Name", key:"playerName", type:"text",      placeholder:"e.g. Alex Chen"},
                {label:"DUPR Rating", key:"dupr",     type:"number",    placeholder:"e.g. 4.08",  step:"0.01"},
                {label:"Email",     key:"email",      type:"email",     placeholder:"your@email.com"},
                {label:"Location",  key:"location",   type:"text",      placeholder:"e.g. Seattle, WA"},
                {label:"Home Club", key:"homeClub",   type:"text",      placeholder:"e.g. Seattle Pickleball Club"},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
                    letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>{f.label}</div>
                  <input type={f.type} value={draft[f.key]||""}
                    step={f.step||undefined}
                    placeholder={f.placeholder||""}
                    onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))}
                    style={{width:"100%",background:C.pageBg,border:`1.5px solid ${C.border}`,
                      borderRadius:10,padding:"10px 14px",color:C.text,fontSize:13,
                      fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
                </div>
              ))}
              {/* Selects */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:16,marginBottom:16}}>
                {[
                ].map(f=>(
                  <div key={f.key}>
                    <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
                      letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>{f.label}</div>
                    <select value={draft[f.key]||""} onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))}
                      style={{width:"100%",background:C.pageBg,border:`1.5px solid ${C.border}`,
                        borderRadius:10,padding:"10px 14px",color:C.text,fontSize:13,
                        fontFamily:"'Outfit'",boxSizing:"border-box"}}>
                      {f.opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {/* Login & Security */}
              <div style={{paddingTop:18,borderTop:`1px solid ${C.border}`,marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>Login & Security</div>
                {[
                  {label:"Email", value:draft.email||email, note:"Edit above ↑"},
                  {label:"Password", value:"••••••••••", action:()=>{setShowEditModal(false);setShowPwModal(true);}, actionLabel:"Change →"},
                ].map(row=>(
                  <div key={row.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:C.pageBg,border:`1px solid ${C.border}`,borderRadius:10,
                    padding:"11px 14px",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{row.label}</div>
                      <div style={{fontSize:13,color:C.text,fontWeight:600}}>{row.value}</div>
                    </div>
                    {row.action
                      ? <button onClick={row.action} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"'Outfit'",fontWeight:600}}>{row.actionLabel}</button>
                      : <span style={{fontSize:11,color:C.textLight}}>{row.note}</span>}
                  </div>
                ))}
                <div style={{fontSize:11,color:C.textLight}}>Member since Jan 2026 · Last login today</div>
              </div>
              {/* Danger zone */}
              <div style={{paddingTop:14,borderTop:`1px solid ${C.border}`,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:12,color:C.textLight}}>Export your data or delete your account</div>
                <div style={{display:"flex",gap:8}}>
                  <button style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                    padding:"7px 12px",fontSize:12,color:C.textMid,cursor:"pointer",fontFamily:"'Outfit'",fontWeight:600}}>↓ Export</button>
                  <button style={{background:"none",border:`1px solid ${C.rose}50`,borderRadius:8,
                    padding:"7px 12px",fontSize:12,color:C.rose,cursor:"pointer",fontFamily:"'Outfit'",fontWeight:600}}>Delete Account</button>
                </div>
              </div>
            </div>
            <div style={{padding:"16px 28px 24px",display:"flex",gap:12,
              borderTop:`1px solid ${C.border}`}}>
              <button onClick={()=>setShowEditModal(false)} style={{flex:1,background:C.pageBg,
                border:`1px solid ${C.border}`,borderRadius:12,padding:"12px",
                fontFamily:"'Outfit'",fontWeight:600,fontSize:14,color:C.textMid,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveEdit} style={{flex:2,background:C.navy,border:"none",
                borderRadius:12,padding:"12px",fontFamily:"'Outfit'",fontWeight:700,
                fontSize:14,color:C.pickle,cursor:"pointer"}}>✓ Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password Modal ── */}
      {showPwModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.6)",backdropFilter:"blur(8px)",
          zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.cardBg,borderRadius:20,padding:32,width:"100%",maxWidth:420,
            boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <span style={{fontFamily:"'Bebas Neue'",fontSize:22,color:C.navy,letterSpacing:"0.06em"}}>Change Password</span>
              <button onClick={()=>setShowPwModal(false)} style={{background:"none",border:"none",fontSize:20,color:C.textLight,cursor:"pointer"}}>✕</button>
            </div>
            {["Current password","New password","Confirm new password"].map(lbl=>(
              <div key={lbl} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>{lbl}</div>
                <input type="password" style={{width:"100%",background:C.pageBg,border:`1.5px solid ${C.border}`,
                  borderRadius:10,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{display:"flex",gap:10,marginTop:6}}>
              <button onClick={()=>setShowPwModal(false)} style={{flex:1,background:C.pageBg,border:`1px solid ${C.border}`,
                borderRadius:10,padding:"11px",fontFamily:"'Outfit'",fontWeight:600,fontSize:13,color:C.textMid,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>setShowPwModal(false)} style={{flex:1,background:C.navy,border:"none",
                borderRadius:10,padding:"11px",fontFamily:"'Outfit'",fontWeight:700,fontSize:13,color:C.pickle,cursor:"pointer"}}>Update Password</button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:28}}>
        <div>
          <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>Profile</h1>
          <p style={{color:C.textMid,fontSize:14,marginTop:3}}>Player identity, membership & analytics targets</p>
        </div>
        <button onClick={openEdit} style={{background:C.navy,border:"none",borderRadius:12,
          padding:"10px 20px",fontFamily:"'Outfit'",fontWeight:700,fontSize:13,color:C.pickle,cursor:"pointer"}}>
          ✏️ Edit Profile
        </button>
      </div>

      {/* ── Section 1: Player Identity ── */}
      <Card style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <SLabel>Player Identity</SLabel>
          <button onClick={openEdit} style={{fontSize:11,color:C.blue,background:"none",border:"none",
            cursor:"pointer",fontFamily:"'Outfit'",fontWeight:600,marginTop:-8}}>✏️ Edit</button>
        </div>
        <div style={{display:"flex",gap:24,alignItems:"flex-start"}}>

          {/* Avatar */}
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <div style={{width:88,height:88,borderRadius:"50%",overflow:"hidden",
              background:`linear-gradient(135deg,${C.navy},${C.blue})`,
              border:`3px solid ${C.pickle}`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              {photoPreview
                ? <img src={photoPreview} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : <span style={{fontFamily:"'Bebas Neue'",fontSize:30,color:"white"}}>AC</span>}
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:"'DM Mono'",fontSize:20,fontWeight:700,color:C.blue}}>—</div>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em"}}>DUPR</div>
            </div>
          </div>

          {/* Read-only fields */}
          <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 32px"}}>
            {[
              {label:"Name",           value:playerName},
              {label:"Email",          value:email},
              {label:"Location",       value:location},
              {label:"Home Club",      value:homeClub},
            ].map(f=>(
              <div key={f.label} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",
                  letterSpacing:"0.07em",fontWeight:600,marginBottom:3}}>{f.label}</div>
                <div style={{fontSize:13,color:C.text,fontWeight:500}}>{f.value}</div>
              </div>
            ))}

          </div>
        </div>

        {/* ── Membership (inline) ── */}
        <div style={{marginTop:20,paddingTop:20,borderTop:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textLight,textTransform:"uppercase",
            letterSpacing:"0.08em",marginBottom:14}}>Membership</div>
          <div style={{display:"flex",gap:16,marginBottom:16}}>
            {[
              { id:"free", label:"Free", price:"$0", color:C.textMid, borderColor:C.border,
                features:["Manual match logging","Shot analytics","PICKL AI (10 msgs/mo)","DUPR sync"] },
              { id:"pro",  label:"Pro Individual", price:"$12.99", color:C.blue, borderColor:C.blue, badge:"Unlock Video Analysis",
                features:["Everything in Free","Automated video analysis","Unlimited PICKL AI","Priority support"] },
            ].map(tier=>{
              const isCurrent = tier.id === plan;
              return(
                <div key={tier.id} style={{
                  border:`2px solid ${isCurrent?tier.borderColor:C.border}`,
                  borderRadius:12,padding:"16px 18px",
                  background:isCurrent?`${tier.color}08`:C.pageBg,
                  position:"relative",flex:1}}>
                  {tier.badge&&!isCurrent&&(
                    <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",
                      background:C.blue,color:"white",fontSize:10,fontWeight:700,
                      padding:"2px 10px",borderRadius:20,whiteSpace:"nowrap",letterSpacing:"0.05em"}}>{tier.badge}</div>
                  )}
                  {isCurrent&&(
                    <div style={{position:"absolute",top:-10,right:12,
                      background:C.mint,color:C.navy,fontSize:10,fontWeight:700,
                      padding:"2px 10px",borderRadius:20,whiteSpace:"nowrap"}}>✓ Current Plan</div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:isCurrent?tier.color:C.navy,letterSpacing:"0.05em"}}>{tier.label}</div>
                    <div>
                      <span style={{fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:C.text}}>{tier.price}</span>
                      <span style={{fontSize:11,color:C.textLight}}>/mo</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px 16px",marginBottom:isCurrent?0:12}}>
                    {tier.features.map((f,i)=>(
                      <div key={i} style={{display:"flex",gap:5,alignItems:"center"}}>
                        <span style={{color:isCurrent?tier.color:C.blue,fontSize:11}}>✓</span>
                        <span style={{fontSize:12,color:C.textMid}}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {!isCurrent&&(
                    <button style={{width:"100%",background:C.blue,border:"none",borderRadius:8,
                      padding:"9px",fontFamily:"'Outfit'",fontWeight:700,fontSize:12,
                      color:"white",cursor:"pointer"}}>
                      Upgrade to Pro →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Connected Accounts */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:10}}>
            {[
              {name:"DUPR",        desc:"Rating sync enabled",           status:"connected"},
              {name:"Playsight",   desc:"Video analysis · Pro required",  status:"pro"},
              {name:"Apple Health",desc:"Activity tracking · Coming soon",status:"soon"},
            ].map(int=>(
              <div key={int.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                background:C.pageBg,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.text}}>{int.name}</div>
                  <div style={{fontSize:11,color:C.textLight,marginTop:1}}>{int.desc}</div>
                </div>
                <div style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap",
                  background:int.status==="connected"?`${C.mint}20`:int.status==="pro"?`${C.blue}15`:C.border,
                  color:int.status==="connected"?C.mint:int.status==="pro"?C.blue:C.textLight,
                  letterSpacing:"0.05em",textTransform:"uppercase"}}>
                  {int.status==="connected"?"● Live":int.status==="pro"?"Upgrade":"Soon"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Section 2: Stats & DUPR Progression ── */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:20,marginBottom:20}}>
        <Card>
          <SLabel>Season Stats</SLabel>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:12,marginBottom:16}}>
            <KPICard label="DUPR"      value={dupr?String(dupr):"—"} color={C.blue}   colorL={C.blueL}/>
            <KPICard label="Win Rate"  value={CORE_KPIS[0].value} color={C.mint}   colorL={C.mintL}/>
            <KPICard label="Matches"   value="—" color={C.amber}  colorL={C.amberL}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:10}}>
            {[
              {label:"Avg Errors",   value:CORE_KPIS[1].value!=="—"?CORE_KPIS[1].value+" / match":"—", color:C.rose},
              {label:"NVZ Arrival",  value:CORE_KPIS[3].value, color:C.mint},
              {label:"NVZ Win Rate", value:CORE_KPIS[4].value, color:C.blue},
              {label:"My Serve Neut.",  value:CORE_KPIS[2].value, color:C.amber},
            ].map(s=>(
              <div key={s.label} style={{background:C.pageBg,borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{s.label}</div>
                <div style={{fontFamily:"'DM Mono'",fontSize:14,fontWeight:700,color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SLabel>DUPR Progression</SLabel>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:30,color:C.blue,letterSpacing:"0.04em",marginBottom:16}}>
            — <span style={{fontSize:18,color:C.textLight}}>enter in Profile</span>
          </div>
          <svg width="100%" height="90" viewBox="0 0 300 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="duprGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity="0.2"/>
                <stop offset="100%" stopColor={C.blue} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#duprGrad)"/>
            <polyline points={polylineStr} fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {chartPts.map((p,i)=>(
              <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={C.blue} stroke="white" strokeWidth="2"/>
            ))}
          </svg>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            {months.map(mo=>(
              <span key={mo} style={{fontSize:9,color:C.textLight}}>{mo}</span>
            ))}
          </div>
        </Card>
      </div>


      {/* ── Pickleball Identity ── */}
      {(()=>{
        // ── Derive identity from shot data ──────────────────────────────────────
        const shots = profileShots;
        const get = (name) => shots.find(s => s.name === name) || {};
        const sum = (names, field) => names.reduce((a,n) => a + (get(n)[field] || 0), 0);

        // Shot volume by style category
        const kitchenAttempts  = sum(["Dink BH","Dink FH","Reset BH","Reset FH","Volley BH","Volley FH"], "attempts");
        const transitionAttempts = sum(["Drop BH","Drop FH","4th Shot Backhand","4th Shot Forehand"], "attempts");
        const driveAttempts    = sum(["Drive BH","Drive FH"], "attempts");
        const attackAttempts   = sum(["Speed Up BH","Speed Up FH","Slam BH","Slam FH","Erne BH","Erne FH","ATP BH","ATP FH"], "attempts");
        const totalAttempts    = kitchenAttempts + transitionAttempts + driveAttempts + attackAttempts;

        // Win rates by category
        const kitchenWins   = sum(["Dink BH","Dink FH","Reset BH","Reset FH","Volley BH","Volley FH"], "wins");
        const driveWins     = sum(["Drive BH","Drive FH"], "wins");
        const attackWins    = sum(["Speed Up BH","Speed Up FH","Slam BH","Slam FH","Erne BH","Erne FH","ATP BH","ATP FH"], "wins");
        const dropWins      = sum(["Drop BH","Drop FH","4th Shot Backhand","4th Shot Forehand"], "wins");

        const kitchenWR  = kitchenAttempts  > 0 ? Math.round(kitchenWins  / kitchenAttempts  * 100) : 0;
        const driveWR    = driveAttempts    > 0 ? Math.round(driveWins    / driveAttempts    * 100) : 0;
        const attackWR   = attackAttempts   > 0 ? Math.round(attackWins   / attackAttempts   * 100) : 0;
        const dropWR     = transitionAttempts > 0 ? Math.round(dropWins   / transitionAttempts* 100) : 0;

        const kitchenPct  = totalAttempts > 0 ? Math.round(kitchenAttempts  / totalAttempts * 100) : 0;
        const drivePct    = totalAttempts > 0 ? Math.round(driveAttempts    / totalAttempts * 100) : 0;
        const attackPct   = totalAttempts > 0 ? Math.round(attackAttempts   / totalAttempts * 100) : 0;
        const dropPct     = totalAttempts > 0 ? Math.round(transitionAttempts/ totalAttempts * 100) : 0;
        const nvzArrival  = CORE_KPIS[3].numVal || 0;
        const errors      = CORE_KPIS[1].numVal || 0;

        const hasData = totalAttempts > 10;

        // ── Identity assignment algorithm ──────────────────────────────────────
        // Score each style based on shot mix + performance metrics
        let scores = { Resetter: 0, Driver: 0, Attacker: 0, Balanced: 0 };
        if (hasData) {
          // Resetter: high kitchen %, high NVZ arrival, low errors, good drop WR
          scores.Resetter += kitchenPct > 40 ? 30 : kitchenPct > 25 ? 15 : 0;
          scores.Resetter += nvzArrival > 70 ? 25 : nvzArrival > 55 ? 12 : 0;
          scores.Resetter += errors < 3 ? 20 : errors < 5 ? 10 : 0;
          scores.Resetter += dropWR > 60 ? 15 : dropWR > 45 ? 7 : 0;
          scores.Resetter += dropPct > 15 ? 10 : 0;

          // Driver: high drive %, high drive WR
          scores.Driver += drivePct > 20 ? 35 : drivePct > 12 ? 18 : 0;
          scores.Driver += driveWR > 55 ? 25 : driveWR > 40 ? 12 : 0;
          scores.Driver += transitionAttempts > 0 ? 10 : 0;
          scores.Driver += errors > 8 ? -10 : 0; // penalise high errors

          // Attacker: high attack %, high attack WR
          scores.Attacker += attackPct > 15 ? 35 : attackPct > 8 ? 18 : 0;
          scores.Attacker += attackWR > 60 ? 30 : attackWR > 45 ? 15 : 0;
          scores.Attacker += kitchenWR > 65 ? 10 : 0; // good setup for attacks
          scores.Attacker += errors > 10 ? -15 : 0;

          // Balanced: no single style dominates
          const maxPct = Math.max(kitchenPct, drivePct, attackPct, dropPct);
          scores.Balanced += maxPct < 40 ? 30 : maxPct < 55 ? 15 : 0;
          scores.Balanced += kitchenPct > 15 && drivePct > 8 && attackPct > 5 ? 20 : 0;
          scores.Balanced += nvzArrival > 55 && attackWR > 40 ? 15 : 0;
        }

        const identity = hasData
          ? Object.entries(scores).reduce((a,b) => b[1] > a[1] ? b : a)[0]
          : null;

        const STYLES = {
          Resetter: {
            icon:"🔄", color:C.mint, colorL:C.mintL,
            tagline:"Patient. NVZ-first. Outlast the opponent.",
            description:"You win by controlling the kitchen, minimising errors, and forcing opponents into mistakes. Your 3rd/4th shot drops are a primary weapon — you get to the NVZ consistently and let the opponent self-destruct.",
            strengths:["Elite NVZ arrival rate","Low unforced errors","Strong reset game under pressure","Makes opponents impatient"],
            improvements:["Develop a speed-up to punish high balls","Add an occasional drive to keep opponents honest","Work on transition speed to reach NVZ even faster"],
            proPrinciple:"Ben Johns philosophy: 'Never force pace from a weak position. Reset until you have a ball above the net, then attack.'",
            strategy:"Stay patient at the kitchen. Your goal every rally is to arrive at the NVZ together and out-dink the opponent. Only speed up when the ball is above the net tape and you have a clear angle. Protect your backhand side in transition.",
          },
          Driver: {
            icon:"💥", color:C.blue, colorL:C.blueL,
            tagline:"Aggressive. Transition-focused. Apply pressure from mid-court.",
            description:"You use pace and power to disrupt opponents in transition. Your drives prevent opponents from settling into a dinking game and force weak responses you can attack.",
            strengths:["Strong transition game","Effective use of pace","Keeps opponents back","Creates offensive opportunities"],
            improvements:["Improve drop accuracy to complement driving","Reduce errors by choosing drives more selectively","Develop more NVZ patience once you arrive at the kitchen"],
            proPrinciple:"Tyson McGuffin: 'Your drive needs a purpose — either to win the point outright or force a weak pop-up you can put away.'",
            strategy:"Use your drive strategically — not on every ball, but when the opponent is off-balance or out of position. Pair every drive with a plan for the next ball. Work on the drive-drop combination to keep opponents guessing.",
          },
          Attacker: {
            icon:"⚡", color:C.rose, colorL:C.roseL,
            tagline:"Explosive. Speed-up specialist. Win at the net.",
            description:"You look to end rallies with aggressive NVZ attacks. Your speed-ups and slams are your primary finishing weapons. You play to win points, not just avoid losing them.",
            strengths:["High attack win rate","Strong speed-up recognition","Creates pressure at the NVZ","Can end rallies quickly"],
            improvements:["Be more selective — only attack balls you win 70%+","Develop more patience to set up better attack opportunities","Strengthen your reset game to recover when attacks are countered"],
            proPrinciple:"Anna Leigh Waters: 'Be selective with your attacks. The best attackers only speed up when the percentage is strongly in their favour.'",
            strategy:"Your attack game is a weapon — protect it by being selective. Build the rally through quality dinks until you create a ball above the net tape with a clear angle. When the moment comes, commit fully. Work on your reset to handle counter-attacks.",
          },
          Balanced: {
            icon:"⚖️", color:C.purple, colorL:C.purpleL,
            tagline:"Versatile. Adaptable. Hard to read.",
            description:"You have a well-rounded game without an obvious pattern opponents can exploit. You can reset, drive, or attack depending on what the match demands — making you an unpredictable and dangerous partner.",
            strengths:["No obvious weakness for opponents to target","Can adapt to any partner's style","Effective in multiple game situations","Strong all-court awareness"],
            improvements:["Identify your single strongest shot and make it elite","Develop a clear identity for high-pressure moments","Sharpen your decision-making — know when to reset vs attack"],
            proPrinciple:"Simone Jardim: 'Know your strengths deeply. Versatility is only powerful when backed by at least one shot you can rely on under pressure.'",
            strategy:"Your adaptability is your edge — use it. In close games, identify what's working and lean into it. Communicate with your partner to establish clear roles: one player covers the middle, one covers angles. Your balanced game makes you an excellent partner for specialists.",
          },
        };

        const style = identity ? STYLES[identity] : null;

        return (
          <Card style={{marginBottom:20, overflow:"hidden"}}>
            {/* Header */}
            <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,
              margin:"-1px -1px 0", padding:"20px 24px", borderRadius:"14px 14px 0 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:11,color:C.pickle,fontWeight:700,textTransform:"uppercase",
                    letterSpacing:"0.1em",marginBottom:4}}>Pickleball Identity</div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:"white",letterSpacing:"0.04em",lineHeight:1}}>
                    Your Playing Style
                  </div>
                  <div style={{fontSize:12,color:"#94A3B8",marginTop:4}}>
                    Derived from your shot data · updates automatically as you log more matches
                  </div>
                </div>
                {style && (
                  <div style={{textAlign:"center",flexShrink:0}}>
                    <div style={{fontSize:36,marginBottom:4}}>{style.icon}</div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:style.color,
                      letterSpacing:"0.06em"}}>{identity}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{padding:"20px 24px"}}>
              {!hasData ? (
                <div style={{textAlign:"center",padding:"32px 16px",background:C.pageBg,borderRadius:12,
                  border:`2px dashed ${C.border}`}}>
                  <div style={{fontSize:32,marginBottom:10}}>🎾</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.textMid,marginBottom:6}}>Not enough data yet</div>
                  <div style={{fontSize:12,color:C.textLight,lineHeight:1.6,maxWidth:320,margin:"0 auto"}}>
                    Log at least 10 shots across a few matches and your playing identity will be automatically calculated here.
                  </div>
                </div>
              ) : (
                <>
                  {/* Identity badge + tagline */}
                  <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,
                    padding:"16px 20px",background:`${style.color}10`,
                    border:`2px solid ${style.color}40`,borderRadius:14}}>
                    <div style={{fontSize:48,flexShrink:0}}>{style.icon}</div>
                    <div>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:28,color:style.color,
                        letterSpacing:"0.05em",lineHeight:1}}>{identity}</div>
                      <div style={{fontSize:14,fontWeight:600,color:C.text,marginTop:4,fontStyle:"italic"}}>
                        "{style.tagline}"
                      </div>
                      <div style={{fontSize:12,color:C.textMid,marginTop:6,lineHeight:1.6}}>
                        {style.description}
                      </div>
                    </div>
                  </div>

                  {/* Shot mix breakdown */}
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.textMid,textTransform:"uppercase",
                      letterSpacing:"0.08em",marginBottom:10}}>Your Shot Mix</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                      {[
                        {label:"Kitchen",  pct:kitchenPct,  wr:kitchenWR,  color:C.mint},
                        {label:"Drops",    pct:dropPct,     wr:dropWR,     color:C.blue},
                        {label:"Drives",   pct:drivePct,    wr:driveWR,    color:C.amber},
                        {label:"Attacks",  pct:attackPct,   wr:attackWR,   color:C.rose},
                      ].map(s=>(
                        <div key={s.label} style={{background:C.pageBg,borderRadius:10,padding:"12px 10px",textAlign:"center",
                          border:`1.5px solid ${s.pct > 0 ? s.color+"40" : C.border}`}}>
                          <div style={{fontSize:10,color:s.color,fontWeight:700,textTransform:"uppercase",
                            letterSpacing:"0.06em",marginBottom:4}}>{s.label}</div>
                          <div style={{fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:s.pct>0?s.color:C.textLight}}>
                            {s.pct}%
                          </div>
                          <div style={{fontSize:9,color:C.textLight,marginTop:2}}>of shots</div>
                          {s.wr > 0 && (
                            <div style={{marginTop:4,fontSize:10,fontWeight:700,
                              color:s.wr>=60?C.mint:s.wr>=45?C.amber:C.rose}}>
                              {s.wr}% win rate
                            </div>
                          )}
                          {/* Volume bar */}
                          <div style={{height:3,background:C.border,borderRadius:2,marginTop:6}}>
                            <div style={{height:"100%",width:`${s.pct}%`,background:s.color,borderRadius:2,transition:"width 0.5s"}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Two columns: Strengths + Improvements */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
                    <div style={{background:`${C.mint}08`,border:`1px solid ${C.mint}30`,borderRadius:12,padding:"14px 16px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.mint,textTransform:"uppercase",
                        letterSpacing:"0.08em",marginBottom:10}}>✓ Your Strengths</div>
                      {style.strengths.map((s,i)=>(
                        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
                          <span style={{color:C.mint,fontWeight:700,fontSize:12,flexShrink:0}}>✓</span>
                          <span style={{fontSize:12,color:C.textMid,lineHeight:1.5}}>{s}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{background:`${C.amber}08`,border:`1px solid ${C.amber}30`,borderRadius:12,padding:"14px 16px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.amber,textTransform:"uppercase",
                        letterSpacing:"0.08em",marginBottom:10}}>↑ Areas to Develop</div>
                      {style.improvements.map((s,i)=>(
                        <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
                          <span style={{color:C.amber,fontWeight:700,fontSize:12,flexShrink:0}}>→</span>
                          <span style={{fontSize:12,color:C.textMid,lineHeight:1.5}}>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Winning Strategy */}
                  <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,
                    borderRadius:12,padding:"16px 20px",marginBottom:16}}>
                    <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,
                        background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🥒</div>
                      <div>
                        <div style={{fontSize:12,color:C.pickle,fontWeight:700,marginBottom:4}}>
                          Your Winning Strategy
                        </div>
                        <div style={{fontSize:13,color:"#CBD5E1",lineHeight:1.7}}>{style.strategy}</div>
                      </div>
                    </div>
                    <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:12,
                      fontSize:11,color:"#64748B",fontStyle:"italic",lineHeight:1.6}}>
                      💬 Pro principle: {style.proPrinciple}
                    </div>
                  </div>

                  {/* Style selector — override if desired */}
                  <div>
                    <div style={{fontSize:11,color:C.textLight,marginBottom:8}}>
                      Not quite right? Override your style manually:
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                      {Object.entries(STYLES).map(([key,s])=>(
                        <div key={key} style={{
                          padding:"10px 8px",borderRadius:10,textAlign:"center",cursor:"default",
                          border:`2px solid ${identity===key?s.color:C.border}`,
                          background:identity===key?`${s.color}12`:C.pageBg}}>
                          <div style={{fontSize:20,marginBottom:2}}>{s.icon}</div>
                          <div style={{fontSize:11,fontWeight:700,
                            color:identity===key?s.color:C.textMid}}>{key}</div>
                          {identity===key&&(
                            <div style={{fontSize:9,color:s.color,fontWeight:600,marginTop:2}}>✓ Your style</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:8,textAlign:"center"}}>
                      Style is auto-assigned based on your shot data · log more matches for a more accurate result
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        );
      })()}

      {/* ── Core Metric Targets ── */}
      <Card style={{marginBottom:20}}>
        <SLabel>Core Metric Targets</SLabel>
        <p style={{fontSize:13,color:C.textMid,marginBottom:18,marginTop:-8}}>
          Set your personal targets. These drive the goal bars on every metric widget across the app.
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {[
            {id:"winRate",   label:"Win Rate",          current:CORE_KPIS[0].numVal||0, unit:"%", min:50, max:100, step:1,   higherIsBetter:true,  color:C.pickle,
              desc:"% of matches won",
              guidance:"3.5 players average ~50%. Elite 4.5+ players target 65–75%. Ben Johns-level: 85%+."},
            {id:"errors",    label:"My Errors / Match", current:CORE_KPIS[1].numVal||0, unit:"",  min:0,  max:20,  step:0.5, higherIsBetter:false, color:C.rose,
              desc:"YOUR personal unforced errors per match — not including your partner (lower = better)",
              guidance:"Individual benchmarks: Recreational 3.5: 8–12/match. Competitive 4.0: under 5. Elite 4.5+: under 3. Note: team benchmarks are roughly double these numbers."},
            {id:"serveNeut", label:"My Serve Neut.",    current:CORE_KPIS[2].numVal||0, unit:"%", min:30, max:100, step:1,   higherIsBetter:true,  color:C.amber,
              desc:"% of YOUR serves/returns that prevent opponent attacks",
              guidance:"Good: 60–70%. Strong: 75–85%. Elite: 90%+. Deep, low returns to the opponent's feet are key."},
            {id:"nvzArrival",label:"NVZ Arrival",       current:CORE_KPIS[3].numVal||0, unit:"%", min:30, max:100, step:1,   higherIsBetter:true,  color:C.mint,
              desc:"% of rallies both players reach the kitchen line",
              guidance:"Recreational: ~50%. Competitive 4.0 target: 70–80%. Elite: 85%+. Teams that arrive together consistently win significantly more rallies."},
            {id:"nvzWin",    label:"NVZ Win Rate",      current:CORE_KPIS[4].numVal||0, unit:"%", min:30, max:100, step:1,   higherIsBetter:true,  color:C.blue,
              desc:"% of kitchen rallies your team wins",
              guidance:"Average: ~50%. Competitive 4.0 target: 60–65%. Elite: 70%+. Patience and shot selection at the kitchen define this stat."},
          ].map((m,i,arr)=>{
            const tgt = GOALS.targets[m.id];
            const gap = m.higherIsBetter ? tgt - m.current : m.current - tgt;
            const gapColor = gap <= 0 ? C.mint : gap <= 8 ? C.amber : C.rose;

            // Auto-save targets to DB on slider change
            const handleTargetChange = async (val) => {
              GOALS.targets[m.id] = val;
              setGoalVer(v=>v+1);
              // Persist immediately
              try {
                const uid = getCurrentUserId();
                await sb.upsert("profile", { user_id: uid, goals: {...GOALS.targets} }, "user_id");
              } catch(e) { console.warn("Target save failed:", e); }
            };

            return(
              <div key={m.id} style={{
                padding:"18px 0",
                borderBottom: i < arr.length-1 ? `1px solid ${C.border}` : "none"
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{flex:1,marginRight:16}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:10,height:10,borderRadius:2,background:m.color,flexShrink:0}}/>
                      <span style={{fontSize:14,fontWeight:700,color:C.text}}>{m.label}</span>
                    </div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:2,marginLeft:18}}>{m.desc}</div>
                    {/* Pro guidance */}
                    <div style={{marginTop:6,marginLeft:18,padding:"6px 10px",background:`${m.color}0C`,
                      border:`1px solid ${m.color}25`,borderRadius:8,fontSize:11,color:C.textMid,lineHeight:1.5}}>
                      💡 {m.guidance}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                      <div>
                        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em"}}>Current</div>
                        <div style={{fontFamily:"'DM Mono'",fontSize:18,fontWeight:700,color:C.textMid}}>{m.current}{m.unit}</div>
                      </div>
                      <div style={{color:C.textLight,fontSize:14}}>→</div>
                      <div>
                        <div style={{fontSize:9,color:m.color,textTransform:"uppercase",letterSpacing:"0.05em"}}>Target</div>
                        <div style={{fontFamily:"'DM Mono'",fontSize:24,fontWeight:700,color:m.color,lineHeight:1}}>{tgt}{m.unit}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:gapColor,marginTop:3,textAlign:"right"}}>
                      {gap <= 0 ? "✓ At target" : `${m.higherIsBetter?"+":"−"}${Math.abs(gap).toFixed(1)}${m.unit} to go`}
                    </div>
                  </div>
                </div>
                <input type="range" min={m.min} max={m.max} step={m.step}
                  value={tgt}
                  onChange={e => handleTargetChange(+e.target.value)}
                  style={{width:"100%",accentColor:m.color,cursor:"pointer"}}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                  <span style={{fontSize:10,color:C.textLight}}>{m.higherIsBetter?"Conservative ":""}{m.min}{m.unit}</span>
                  <span style={{fontSize:10,color:C.textLight}}>{m.higherIsBetter?"Elite ":""}{m.max}{m.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Priority Drills ── */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <SLabel>Priority Drills</SLabel>
          <span style={{fontSize:11,color:C.textLight,marginTop:-10}}>
            📌 Pin shots from the <span style={{color:C.blue,fontWeight:600,cursor:"pointer"}} onClick={()=>{}}>Shots page</span>
          </span>
        </div>
        <p style={{fontSize:13,color:C.textMid,marginBottom:18,marginTop:-4}}>
          Up to 3 shots you're actively drilling. Set a pts-lost target to track your progress.
        </p>
        {GOALS.priorityShots.length === 0 ? (
          <div style={{textAlign:"center",padding:"32px 16px",background:C.pageBg,borderRadius:12,
            border:`2px dashed ${C.border}`}}>
            <div style={{fontSize:28,marginBottom:8}}>📌</div>
            <div style={{fontSize:13,color:C.textMid,marginBottom:4}}>No priority drills set</div>
            <div style={{fontSize:11,color:C.textLight}}>Go to the Shots page and tap "+ Set as Priority Drill" on any shot card</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {GOALS.priorityShots.map((drill,i)=>{
              // Find current misses from shot data
              const shotData = SHOT_CATS.flatMap(c=>c.shots).find(s=>s.name===drill.name);
              const currentMisses = shotData?.misses ?? 0;
              const gap = currentMisses - drill.targetMisses;
              const gapColor = gap <= 0 ? C.mint : gap <= 3 ? C.amber : C.rose;
              return(
                <div key={drill.name} style={{background:C.pageBg,border:`1px solid ${C.border}`,
                  borderRadius:12,padding:"14px 16px",borderLeft:`4px solid ${drill.color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:2}}>{drill.name}</div>
                      <div style={{fontSize:11,color:C.textLight}}>
                        {shotData?.attempts ?? 0} attempts this season
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"baseline",gap:10,flexShrink:0}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em"}}>Now</div>
                        <div style={{fontFamily:"'DM Mono'",fontSize:20,fontWeight:700,color:C.rose}}>{currentMisses}</div>
                      </div>
                      <div style={{color:C.textLight}}>→</div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:drill.color,textTransform:"uppercase",letterSpacing:"0.05em"}}>Target</div>
                        <div style={{fontFamily:"'DM Mono'",fontSize:26,fontWeight:700,color:drill.color,lineHeight:1}}>{drill.targetMisses}</div>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:gapColor,alignSelf:"flex-end",paddingBottom:2}}>
                        {gap<=0?"✓":"−"+gap+" pts"}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:11,color:C.textLight,whiteSpace:"nowrap"}}>Pts lost target:</span>
                    <input type="range" min={0} max={Math.max(currentMisses, drill.targetMisses+4)} step={1}
                      value={drill.targetMisses}
                      onChange={e=>{
                        GOALS.priorityShots[i].targetMisses = +e.target.value;
                        setGoalVer(v=>v+1);
                      }}
                      style={{flex:1,accentColor:drill.color,cursor:"pointer"}}/>
                    <span style={{fontFamily:"'DM Mono'",fontSize:14,fontWeight:700,color:drill.color,
                      minWidth:20,textAlign:"right"}}>{drill.targetMisses}</span>
                    <button onClick={()=>{
                      GOALS.priorityShots = GOALS.priorityShots.filter((_,j)=>j!==i);
                      setGoalVer(v=>v+1);
                    }} style={{background:"none",border:"none",color:C.rose,cursor:"pointer",
                      fontSize:16,padding:"0 2px"}}>×</button>
                  </div>
                  {shotData&&(
                    <div style={{marginTop:10}}>
                      <Sparkline data={shotData.missHistory} color={C.rose} width={300} height={32} showDots={false}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};



// ── LOG MATCH ─────────────────────────────────────────────────────────────────
const NumInput=({value,onChange})=>(
  <div style={{display:"flex",alignItems:"center",gap:6}}>
    <button onClick={()=>onChange(Math.max(0,value-1))} style={{
      width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,
      fontSize:16,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'Outfit'",lineHeight:1}}>−</button>
    <span style={{fontFamily:"'DM Mono'",fontSize:14,fontWeight:700,color:C.text,
      minWidth:22,textAlign:"center"}}>{value}</span>
    <button onClick={()=>onChange(value+1)} style={{
      width:28,height:28,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,
      fontSize:16,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'Outfit'",lineHeight:1}}>+</button>
  </div>
);

const SliderField=({label,value,onChange,min=0,max=100,unit="%",color=C.mint,hint=""})=>(
  <div style={{marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
      <div>
        <span style={{fontSize:13,fontWeight:600,color:C.text}}>{label}</span>
        {hint&&<span style={{fontSize:11,color:C.textLight,marginLeft:8}}>{hint}</span>}
      </div>
      <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,color}}>{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}
      style={{width:"100%",accentColor:color,cursor:"pointer"}}/>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
      <span style={{fontSize:10,color:C.textLight}}>{min}{unit}</span>
      <span style={{fontSize:10,color:C.textLight}}>{max}{unit}</span>
    </div>
  </div>
);

const SHOT_LOG_FIELDS = [
  { cat:"ATP",       shots:["ATP BH","ATP FH"] },
  { cat:"4th Shot",  shots:["4th Shot Backhand","4th Shot Forehand"] },
  { cat:"Counter",   shots:["Counter BH","Counter FH"] },
  { cat:"Dink",      shots:["Dink BH","Dink FH"] },
  { cat:"Drive",     shots:["Drive BH","Drive FH"] },
  { cat:"Drop",      shots:["Drop BH","Drop FH"] },
  { cat:"Erne",      shots:["Erne BH","Erne FH"] },
  { cat:"Lob",       shots:["Lob BH","Lob FH"] },
  { cat:"Reset",     shots:["Reset BH","Reset FH"] },
  { cat:"Return",    shots:["Return BH","Return FH"] },
  { cat:"Scramble",  shots:["Scramble BH","Scramble FH"] },
  { cat:"Serve",     shots:["Serve"] },
  { cat:"Slam",      shots:["Slam BH","Slam FH"] },
  { cat:"Speed Up",  shots:["Speed Up BH","Speed Up FH"] },
  { cat:"Volley",    shots:["Volley BH","Volley FH"] },
];

const INIT_SHOTS = Object.fromEntries(
  SHOT_LOG_FIELDS.flatMap(c=>c.shots.map(s=>[s,{wins:0,misses:0}]))
);


// ── PlayerPicker — chip-based player selector with typeahead ─────────────────
// multi=true allows multiple chips (Opponents), multi=false allows one (Partner)
function PlayerSearch({ label, value, onChange, placeholder, multi=false }) {
  // value is a comma-joined string for compatibility with existing save logic
  const toChips = (v) => v ? v.split(",").map(s=>s.trim()).filter(Boolean) : [];
  const [chips, setChips]       = useState(toChips(value));
  const [query, setQuery]       = useState("");
  const [allPlayers, setAllPlayers] = useState([]);   // full list from DB
  const [filtered, setFiltered] = useState([]);
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const ref  = useRef(null);
  const inpRef = useRef(null);

  // Reset chips when parent clears value (e.g. after save)
  useEffect(()=>{ if(value==="") setChips([]); }, [value]);

  // Load all players once on mount
  useEffect(()=>{
    (async()=>{
      try {
        const rows = await sb.query("players", { select:"name,dupr", order:"name.asc" });
        setAllPlayers(Array.isArray(rows) ? rows.map(r=>({player_name:r.name, dupr:r.dupr})) : []);
      } catch(e){}
    })();
  }, []);

  // Filter as user types — show all players when empty, filtered when typing
  useEffect(()=>{
    const q = query.trim().toLowerCase();
    const available = allPlayers.filter(r=>!chips.includes(r.player_name));
    if(!q){
      setFiltered(available.slice(0, 10)); // show up to 10 players on focus
    } else {
      setFiltered(available.filter(r=>r.player_name.toLowerCase().includes(q)).slice(0, 8));
    }
  }, [query, allPlayers, chips]);

  // Close dropdown on outside click
  useEffect(()=>{
    const h = (e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  }, []);

  const commit = (names) => {
    setChips(names);
    onChange(names.join(", "));
  };

  const addChip = (name) => {
    const next = multi ? [...chips, name] : [name];
    commit(next);
    setQuery("");
    setOpen(false);
    inpRef.current?.focus();
  };

  const removeChip = (name) => {
    commit(chips.filter(c=>c!==name));
  };

  const showNew = query.trim().length >= 2 &&
    !allPlayers.find(r=>r.player_name.toLowerCase()===query.trim().toLowerCase()) &&
    !chips.includes(query.trim());

  const createAndAdd = async () => {
    const name = query.trim();
    if(!name || saving) return;
    setSaving(true);
    try {
      // Check if player already exists in shared players table
      const existing = await sb.query("players", { select:"name", filter:`name=ilike.${encodeURIComponent(name)}` });
      if(!Array.isArray(existing) || existing.length === 0) {
        // Insert into shared players table — readable by all users
        await sb.insert("players", { name, created_by: getCurrentUserId() });
        setAllPlayers(prev=>[...prev, {player_name:name}]);
      }
      addChip(name);
    } catch(e) { addChip(name); } // still add chip even if DB save fails
    setSaving(false);
  };

  const canAdd = multi || chips.length === 0;
  const hasDropdown = open && (filtered.length > 0 || showNew) && canAdd;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
        letterSpacing:"0.07em",fontWeight:600,marginBottom:6}}>{label}</div>

      {/* Chip display area + input */}
      <div onClick={()=>{ if(canAdd) inpRef.current?.focus(); }}
        style={{minHeight:42,background:C.pageBg,
          border:`1px solid ${hasDropdown?C.pickle:C.border}`,
          borderRadius:hasDropdown?"10px 10px 0 0":"10px",
          padding:"6px 10px",display:"flex",flexWrap:"wrap",
          gap:6,alignItems:"center",cursor:"text",boxSizing:"border-box"}}>

        {/* Saved chips */}
        {chips.map(name=>(
          <div key={name} style={{display:"inline-flex",alignItems:"center",gap:5,
            background:C.navy,color:"white",
            borderRadius:20,padding:"4px 10px 4px 12px",fontSize:12,fontWeight:600,
            fontFamily:"'Outfit'",whiteSpace:"nowrap"}}>
            {name}
            <button onClick={(e)=>{e.stopPropagation();removeChip(name);}}
              style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",
                cursor:"pointer",fontSize:14,lineHeight:1,padding:"0 0 1px",
                display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        ))}

        {/* Type input — only show if can add more */}
        {canAdd && (
          <input ref={inpRef} type="text" value={query}
            placeholder={chips.length===0 ? (placeholder||"Search or type name…") : (multi?"Add another…":"")}
            onChange={e=>{ setQuery(e.target.value); setOpen(true); }}
            onFocus={()=>{ setOpen(true); }}
            onKeyDown={e=>{
              if(e.key==="Backspace" && !query && chips.length>0) removeChip(chips[chips.length-1]);
              if(e.key==="Escape") setOpen(false);
            }}
            style={{flex:1,minWidth:100,background:"transparent",border:"none",outline:"none",
              color:C.text,fontSize:13,fontFamily:"'Outfit'",padding:"2px 0"}}/>
        )}
      </div>

      {/* Dropdown */}
      {hasDropdown && (
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:600,
          background:C.cardBg,border:`1px solid ${C.pickle}`,borderTop:"none",
          borderRadius:"0 0 12px 12px",boxShadow:"0 8px 24px rgba(0,0,0,0.18)",
          maxHeight:220,overflowY:"auto"}}>

          {/* Player list header */}
          {filtered.length > 0 && (
            <div style={{padding:"6px 14px 4px",fontSize:10,color:C.textLight,
              textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,
              borderBottom:`1px solid ${C.border}`,background:C.pageBg}}>
              {query.trim() ? "Matching players" : "Your players"}
            </div>
          )}
          {/* Existing player matches */}
          {filtered.map(r=>(
            <div key={r.player_name} onClick={()=>addChip(r.player_name)}
              style={{padding:"9px 14px",cursor:"pointer",display:"flex",
                alignItems:"center",justifyContent:"space-between",
                borderBottom:`1px solid ${C.border}`}}
              onMouseEnter={e=>e.currentTarget.style.background=C.pageBg}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:`${C.pickle}22`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:700,color:C.navy,flexShrink:0}}>
                  {r.player_name[0].toUpperCase()}
                </div>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{r.player_name}</div>
              </div>
              {r.dupr&&<div style={{fontFamily:"'DM Mono'",fontSize:11,color:C.pickle,fontWeight:700}}>{r.dupr}</div>}
            </div>
          ))}

          {/* Create new player option */}
          {showNew && (
            <div onClick={createAndAdd}
              style={{padding:"9px 14px",cursor:saving?"default":"pointer",
                display:"flex",alignItems:"center",gap:10,
                opacity:saving?0.6:1}}
              onMouseEnter={e=>{ if(!saving) e.currentTarget.style.background=C.pageBg; }}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:28,height:28,borderRadius:"50%",
                background:saving?`${C.border}`:C.navy,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:15,color:"white",flexShrink:0,fontWeight:700}}>
                {saving ? "…" : "+"}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>
                  {saving ? "Saving…" : `Add "${query.trim()}" as new player`}
                </div>
                {!saving&&<div style={{fontSize:10,color:C.textLight,marginTop:1}}>Creates a profile · appears in future searches</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LogMatchContent=()=>{
  const isMobile = useIsMobile();
  const [showUp,setShowUp]           = useState(false);
  const [saved,setSaved]             = useState(false);
  const [saving,setSaving]           = useState(false);
  const [saveError,setSaveError]     = useState("");
  const [shotsOpen,setShotsOpen]     = useState(true);

  // Match basics
  const [date,setDate]               = useState(new Date().toISOString().slice(0,10));
  const [opponent,setOpponent]       = useState("");
  const [partner,setPartner]         = useState("");
  const [score,setScore]             = useState("");
  const [result,setResult]           = useState("W");
  const [notes,setNotes]             = useState("");

  // Performance stats — +/− counters, converted to % on save
  const [nvzArrived,setNvzArrived]   = useState(0);  // tapped + each arrival
  const [nvzMissed,setNvzMissed]     = useState(0);  // tapped − each miss
  const [nvzWon,setNvzWon]           = useState(0);  // kitchen rallies won
  const [nvzLost,setNvzLost]         = useState(0);  // kitchen rallies lost
  const [servNeut,setServNeut]       = useState(0);  // neutralized
  const [servFailed,setServFailed]   = useState(0);  // failed to neutralize
  const [errors,setErrors]           = useState(0);  // unforced errors
  const [partnerRole,setPartnerRole] = useState("Balanced");
  // Derived totals + percentages
  const nvzTotal   = nvzArrived + nvzMissed;
  const nvzKitchen = nvzWon + nvzLost;
  const servTotal  = servNeut + servFailed;
  const nvzArrival = nvzTotal>0   ? Math.round(nvzArrived/nvzTotal*100)   : 0;
  const nvzWin     = nvzKitchen>0 ? Math.round(nvzWon/nvzKitchen*100)     : 0;
  const serve      = servTotal>0  ? Math.round(servNeut/servTotal*100)     : 0;

  // Shot log
  const [shots,setShots]             = useState(INIT_SHOTS);
  const setShot=(name,field,val)=>setShots(prev=>({...prev,[name]:{...prev[name],[field]:val}}));
  const totalWins   = Object.values(shots).reduce((a,s)=>a+s.wins,0);
  const totalMisses = Object.values(shots).reduce((a,s)=>a+s.misses,0);
  const shotsLogged = totalWins + totalMisses > 0;

  if(saved) return(
    <div style={{maxWidth:600,margin:"40px auto",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>✅</div>
      <h2 style={{fontFamily:"'Bebas Neue'",fontSize:32,color:C.navy,letterSpacing:"0.05em",marginBottom:8}}>Match Logged!</h2>
      <p style={{color:C.textMid,fontSize:14,marginBottom:24}}>Your stats have been recorded and your charts updated.</p>
      <div style={{background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px",marginBottom:24,textAlign:"left"}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:10}}>
          {[
            {l:"Opponent",    v:opponent||"—"},
            {l:"Partner",     v:partner||"—"},
            {l:"Score",       v:score||"—"},
            {l:"Result",      v:result==="W"?"Win 🏆":"Loss"},
            {l:"NVZ Arrival", v:nvzArrival>0?nvzArrival+"%":"—"},
            {l:"NVZ Win Rate",v:nvzWin>0?nvzWin+"%":"—"},
            ...(shotsLogged?[{l:"Pts Won",v:totalWins},{l:"Pts Lost",v:totalMisses}]:[]),
          ].map(({l,v})=>(
            <div key={l} style={{background:C.pageBg,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{l}</div>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={()=>{setSaved(false);setSaveError("");setShots(INIT_SHOTS);setShotsOpen(false);setNvzArrived(0);setNvzMissed(0);setNvzWon(0);setNvzLost(0);setServNeut(0);setServFailed(0);setErrors(0);setOpponent('');setPartner('');setScore('');setNotes('');}} style={{
        background:C.pickle,border:"none",borderRadius:12,padding:"12px 28px",
        fontFamily:"'Outfit'",fontWeight:700,fontSize:15,color:C.navy,cursor:"pointer"}}>
        Log Another Match
      </button>
    </div>
  );

  return(
    <div style={{width:"100%"}}>
      {showUp&&<UploadModal onClose={()=>setShowUp(false)}/>}



      <div style={{display:"flex",flexDirection:"column",gap:16}}>

        {/* ── Section 1 + 2 combined: compact single-view card ── */}
        <Card style={{padding:0,overflow:"visible"}}>

          {/* Row 1: Date · Score · Result */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",
            gap:12,padding:"16px 18px 0"}}>
            <div>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Date</div>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,
                  borderRadius:10,padding:"9px 12px",color:C.text,fontSize:13,
                  fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Score</div>
              <input type="text" value={score} onChange={e=>setScore(e.target.value)}
                placeholder="e.g. 11-7"
                style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,
                  borderRadius:10,padding:"9px 12px",color:C.text,fontSize:13,
                  fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
            </div>
            <div style={{gridColumn:isMobile?"span 2":"auto"}}>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Result</div>
              <div style={{display:"flex",gap:8}}>
                {[["W","Win 🏆"],["L","Loss"]].map(([v,lbl])=>(
                  <button key={v} onClick={()=>setResult(v)} style={{
                    flex:1,padding:"9px 8px",borderRadius:10,fontWeight:700,fontSize:13,
                    cursor:"pointer",fontFamily:"'Outfit'",transition:"all 0.15s",
                    background:result===v?(v==="W"?C.mint:C.rose):C.pageBg,
                    border:`2px solid ${result===v?(v==="W"?C.mint:C.rose):C.border}`,
                    color:result===v?"white":C.textMid}}>{lbl}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Opponent · Partner */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",
            gap:12,padding:"12px 18px 0"}}>
            <PlayerSearch label="Opponent(s)" value={opponent} onChange={setOpponent}
              placeholder="Search or type name…" multi={true}/>
            <PlayerSearch label="Partner" value={partner} onChange={setPartner}
              placeholder="Search or type name…"/>
          </div>

          {/* Row 3: Notes (compact, 1 line) */}
          <div style={{padding:"12px 18px 16px"}}>
            <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>Notes (optional)</div>
            <input type="text" value={notes} onChange={e=>setNotes(e.target.value)}
              placeholder="Anything notable — tactics, conditions, how you felt…"
              style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,
                borderRadius:10,padding:"9px 12px",color:C.text,fontSize:13,
                fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
          </div>
        </Card>

        {/* ── Section 2: Performance Stats — 2-column layout ── */}
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr"}}>

            {/* ── LEFT COLUMN: NVZ Arrival + NVZ Win Rate ── */}
            <div style={{borderRight:isMobile?"none":`1px solid ${C.border}`,borderBottom:isMobile?`1px solid ${C.border}`:"none"}}>
              <div style={{padding:"7px 14px",background:C.pageBg,borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px"}}>
                  <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Metric</div>
                  <div style={{fontSize:9,color:C.mint,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700,textAlign:"center"}}>✓ Yes</div>
                  <div style={{fontSize:9,color:C.rose,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700,textAlign:"center"}}>✕ No</div>
                </div>
              </div>
              {[
                {label:"NVZ Arrival", hint:nvzTotal>0?nvzArrival+"%":"Kitchen arrival?", hintColor:C.mint,
                  yv:nvzArrived, yi:()=>setNvzArrived(nvzArrived+1), yd:()=>setNvzArrived(Math.max(0,nvzArrived-1)),
                  nv:nvzMissed,  ni:()=>setNvzMissed(nvzMissed+1),  nd:()=>setNvzMissed(Math.max(0,nvzMissed-1)), showHint:nvzTotal>0},
                {label:"NVZ Win Rate", hint:nvzKitchen>0?nvzWin+"%":"Won the rally?", hintColor:C.blue,
                  yv:nvzWon, yi:()=>setNvzWon(nvzWon+1), yd:()=>setNvzWon(Math.max(0,nvzWon-1)),
                  nv:nvzLost, ni:()=>setNvzLost(nvzLost+1), nd:()=>setNvzLost(Math.max(0,nvzLost-1)), showHint:nvzKitchen>0},
              ].map((row,i)=>{
                const hd=row.yv>0||row.nv>0;
                return(
                  <div key={row.label} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",alignItems:"center",
                    padding:"8px 14px",borderBottom:`1px solid ${C.border}`,
                    background:hd?`${C.pickle}08`:C.cardBg}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:hd?600:400,color:hd?C.text:C.textMid}}>{row.label}</div>
                      <div style={{fontSize:9,color:row.showHint?row.hintColor:C.textLight,fontFamily:row.showHint?"'DM Mono'":"'Outfit'",fontWeight:row.showHint?700:400}}>{row.hint}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                      <button onClick={row.yd} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                      <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:row.yv>0?C.mint:C.textLight,minWidth:18,textAlign:"center"}}>{row.yv}</span>
                      <button onClick={row.yi} style={{width:24,height:24,borderRadius:6,border:`1px solid ${row.yv>0?C.mint:C.border}`,background:row.yv>0?`${C.mint}18`:C.pageBg,fontSize:15,color:C.mint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                      <button onClick={row.nd} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                      <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:row.nv>0?C.rose:C.textLight,minWidth:18,textAlign:"center"}}>{row.nv}</span>
                      <button onClick={row.ni} style={{width:24,height:24,borderRadius:6,border:`1px solid ${row.nv>0?C.rose:C.border}`,background:row.nv>0?`${C.rose}18`:C.pageBg,fontSize:15,color:C.rose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── RIGHT COLUMN: Serve Neut + Errors + Role ── */}
            <div>
              <div style={{padding:"7px 14px",background:C.pageBg,borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px"}}>
                  <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Metric</div>
                  <div style={{fontSize:9,color:C.mint,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700,textAlign:"center"}}>✓ Yes</div>
                  <div style={{fontSize:9,color:C.rose,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700,textAlign:"center"}}>✕ No</div>
                </div>
              </div>
              {/* My Serve Neutralization (individual) */}
              {(()=>{const hd=servNeut>0||servFailed>0; return(
                <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",alignItems:"center",
                  padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:hd?`${C.pickle}08`:C.cardBg}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:hd?600:400,color:hd?C.text:C.textMid}}>My Serve Neut.</div>
                    <div style={{fontSize:9,color:servTotal>0?C.amber:C.textLight,fontFamily:servTotal>0?"'DM Mono'":"'Outfit'",fontWeight:servTotal>0?700:400}}>{servTotal>0?serve+"%":"Couldn't attack?"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    <button onClick={()=>setServNeut(Math.max(0,servNeut-1))} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:servNeut>0?C.mint:C.textLight,minWidth:18,textAlign:"center"}}>{servNeut}</span>
                    <button onClick={()=>setServNeut(servNeut+1)} style={{width:24,height:24,borderRadius:6,border:`1px solid ${servNeut>0?C.mint:C.border}`,background:servNeut>0?`${C.mint}18`:C.pageBg,fontSize:15,color:C.mint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    <button onClick={()=>setServFailed(Math.max(0,servFailed-1))} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:servFailed>0?C.rose:C.textLight,minWidth:18,textAlign:"center"}}>{servFailed}</span>
                    <button onClick={()=>setServFailed(servFailed+1)} style={{width:24,height:24,borderRadius:6,border:`1px solid ${servFailed>0?C.rose:C.border}`,background:servFailed>0?`${C.rose}18`:C.pageBg,fontSize:15,color:C.rose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                </div>
              );})()}
              {/* Errors */}
              {(()=>{const hd=errors>0; return(
                <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",alignItems:"center",
                  padding:"8px 14px",borderBottom:`1px solid ${C.border}`,background:hd?`${C.rose}08`:C.cardBg}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:hd?600:400,color:hd?C.text:C.textMid}}>Errors</div>
                    <div style={{fontSize:9,color:C.textLight}}>My unforced errors</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    <button onClick={()=>setErrors(Math.max(0,errors-1))} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:errors>0?C.rose:C.textLight,minWidth:18,textAlign:"center"}}>{errors}</span>
                    <button onClick={()=>setErrors(errors+1)} style={{width:24,height:24,borderRadius:6,border:`1px solid ${errors>0?C.rose:C.border}`,background:errors>0?`${C.rose}18`:C.pageBg,fontSize:15,color:C.rose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                  <div/>
                </div>
              );})()}
              {/* Role */}
              <div style={{padding:"8px 14px"}}>
                <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,marginBottom:6}}>Your Role</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  {["Resetter","Driver","Attacker","Balanced"].map(r=>(
                    <button key={r} onClick={()=>setPartnerRole(r)} style={{
                      padding:"6px 4px",borderRadius:8,fontWeight:600,fontSize:11,cursor:"pointer",
                      fontFamily:"'Outfit'",transition:"all 0.15s",
                      background:partnerRole===r?C.navy:C.pageBg,
                      border:`2px solid ${partnerRole===r?C.navy:C.border}`,
                      color:partnerRole===r?"white":C.textMid}}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Section 3: Shot Log — open by default, 2-column grid ── */}
        <div style={{border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",background:C.cardBg}}>

          {/* Collapsible header */}
          <button onClick={()=>setShotsOpen(o=>!o)} style={{
            width:"100%",background:"none",border:"none",cursor:"pointer",
            padding:"14px 20px",display:"flex",justifyContent:"space-between",
            alignItems:"center",fontFamily:"'Outfit'",textAlign:"left",
            borderBottom:shotsOpen?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>Shot Log</div>
              {shotsLogged&&(
                <span style={{fontSize:11,fontWeight:600,color:C.pickle,
                  background:`${C.pickle}18`,borderRadius:20,padding:"2px 8px"}}>
                  {totalWins}W · {totalMisses}L logged
                </span>
              )}
              <div style={{fontSize:11,color:C.textLight}}>Optional — tap + each time a shot wins or loses a rally</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
              {shotsLogged&&<>
                <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:C.mint}}>{totalWins}W</span>
                <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:C.rose}}>{totalMisses}L</span>
              </>}
              <div style={{fontSize:16,color:C.textLight,
                transform:shotsOpen?"rotate(180deg)":"rotate(0deg)",
                transition:"transform 0.2s"}}>▼</div>
            </div>
          </button>

          {shotsOpen&&(
            <div>
              {/* Column header bar */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",
                padding:"7px 16px",background:C.pageBg,borderBottom:`2px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>Shot</div>
                <div style={{fontSize:10,color:C.mint,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,textAlign:"center"}}>✓ Won</div>
                <div style={{fontSize:10,color:C.rose,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,textAlign:"center"}}>✕ Lost</div>
              </div>

              {/* 2-column grid of shot categories */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",
                gap:0,borderBottom:`1px solid ${C.border}`}}>
                {SHOT_LOG_FIELDS.map((cat,ci)=>(
                  <div key={cat.cat} style={{
                    borderRight:(isMobile?(ci%2===0):( ci%3!==2))?`1px solid ${C.border}`:"none",
                    borderBottom:`1px solid ${C.border}`}}>
                    {/* Category label */}
                    <div style={{padding:"5px 14px",background:C.pageBg,
                      borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:9,fontWeight:700,color:C.textLight,
                        textTransform:"uppercase",letterSpacing:"0.1em"}}>{cat.cat}</span>
                    </div>
                    {/* Shot rows within category */}
                    {cat.shots.map(sName=>{
                      const w=shots[sName]?.wins||0;
                      const m=shots[sName]?.misses||0;
                      const hasData=w>0||m>0;
                      return(
                        <div key={sName} style={{
                          display:"grid",gridTemplateColumns:"1fr 90px 90px",
                          alignItems:"center",padding:"6px 14px",
                          borderTop:`1px solid ${C.border}`,
                          background:hasData?`${C.pickle}08`:C.cardBg}}>
                          <div style={{fontSize:12,fontWeight:hasData?600:400,
                            color:hasData?C.text:C.textMid,whiteSpace:"nowrap",
                            overflow:"hidden",textOverflow:"ellipsis"}}>{sName}</div>
                          {/* Won counter */}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                            <button onClick={()=>setShot(sName,"wins",Math.max(0,w-1))}
                              style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,
                              background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>−</button>
                            <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,
                              color:w>0?C.mint:C.textLight,minWidth:18,textAlign:"center"}}>{w}</span>
                            <button onClick={()=>setShot(sName,"wins",w+1)}
                              style={{width:24,height:24,borderRadius:6,
                              border:`1px solid ${w>0?C.mint:C.border}`,
                              background:w>0?`${C.mint}18`:C.pageBg,fontSize:15,color:C.mint,cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
                          </div>
                          {/* Lost counter */}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                            <button onClick={()=>setShot(sName,"misses",Math.max(0,m-1))}
                              style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,
                              background:C.pageBg,fontSize:15,color:C.textMid,cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>−</button>
                            <span style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,
                              color:m>0?C.rose:C.textLight,minWidth:18,textAlign:"center"}}>{m}</span>
                            <button onClick={()=>setShot(sName,"misses",m+1)}
                              style={{width:24,height:24,borderRadius:6,
                              border:`1px solid ${m>0?C.rose:C.border}`,
                              background:m>0?`${C.rose}18`:C.pageBg,fontSize:15,color:C.rose,cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Save Error ── */}
        {saveError&&(
          <div style={{background:`${C.rose}15`,border:`1px solid ${C.rose}40`,borderRadius:10,
            padding:"10px 14px",fontSize:12,color:C.rose,lineHeight:1.5}}>
            <b>Save failed:</b> {saveError}
          </div>
        )}

        {/* ── Save Button ── */}
        <button onClick={async()=>{setSaveError("");
          setSaving(true);
          try {
            // 1. Save match to Supabase
            const dateFormatted = new Date(date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
            const userId = getCurrentUserId();
            await sb.insert("matches", {
              date: dateFormatted,
              opponent, partner, result, score, notes,
              nvz_arrival: nvzArrival,
              nvz_win: nvzWin,
              serve_neut: serve,
              errors: parseFloat(errors),
              partner_role: partnerRole,
              user_id: userId,
            });

            // 2. Save shot stats to Supabase (upsert each shot)
            const shotEntries = Object.entries(shots).filter(([,s])=>s.wins>0||s.misses>0);
            for (const [name, s] of shotEntries) {
              // Find category + metadata from SHOT_CATS
              const cat = SHOT_CATS.find(c=>c.shots.some(sh=>sh.name===name));
              const shotMeta = cat?.shots.find(sh=>sh.name===name);
              // Get existing shot data to append history
              let existing = null;
              try {
                const uid = getCurrentUserId();
                existing = await sb.query("shots",{filter:`name=eq.${encodeURIComponent(name)}&user_id=eq.${uid}`,single:true});
              } catch(e){}
              const prevWinH  = existing?.win_history  || [0,0,0,0];
              const prevMissH = existing?.miss_history || [0,0,0,0];
              const newWinPct  = s.wins+s.misses>0 ? Math.round(s.wins/(s.wins+s.misses)*100) : 0;
              const newMissPct = s.wins+s.misses>0 ? Math.round(s.misses/(s.wins+s.misses)*100) : 0;
              const newWinH  = [...prevWinH.slice(1),  newWinPct];
              const newMissH = [...prevMissH.slice(1), newMissPct];
              await sb.upsert("shots", {
                name,
                category: cat?.label || "",
                attempts: (existing?.attempts||0) + s.wins + s.misses,
                wins:     (existing?.wins||0)     + s.wins,
                misses:   (existing?.misses||0)   + s.misses,
                win_history:  newWinH,
                miss_history: newMissH,
                tip:   shotMeta?.tip   || "",
                color: cat?.color      || C.blue,
                icon:  cat?.icon       || "🎾",
                user_id: getCurrentUserId(),
              }, "user_id,name");
            }
            setSaved(true);
          } catch(err) {
            console.error("Save failed:", err);
            setSaveError(err.message || "Unknown error — please try again.");
          } finally {
            setSaving(false);
          }
        }} disabled={saving} style={{
          width:"100%",background:saving?C.border:C.pickle,border:"none",borderRadius:14,
          padding:"15px",fontFamily:"'Outfit'",fontWeight:700,fontSize:16,
          color:C.navy,cursor:saving?"not-allowed":"pointer",marginTop:4}}>
          {saving ? "Saving…" : "✓ Save Match"}
        </button>

      </div>
    </div>
  );
};


// ── MATCH CENTER ──────────────────────────────────────────────────────────────

// ── VIDEO LOGGER ──────────────────────────────────────────────────────────────
const SHOT_BUTTONS = [
  { cat:"Serve/Return", color:C.amber,  shots:["Serve","Return BH","Return FH"] },
  { cat:"Transition",   color:C.blue,   shots:["4th Shot BH","4th Shot FH","Drive BH","Drive FH","Drop BH","Drop FH"] },
  { cat:"Kitchen",      color:C.mint,   shots:["Dink BH","Dink FH","Reset BH","Reset FH","Volley BH","Volley FH"] },
  { cat:"Attack",       color:C.rose,   shots:["Speed Up BH","Speed Up FH","Slam BH","Slam FH","Erne BH","Erne FH","ATP BH","ATP FH"] },
  { cat:"Defense",      color:C.purple, shots:["Counter BH","Counter FH","Scramble BH","Scramble FH","Lob BH","Lob FH"] },
];

function VideoLoggerContent() {
  const isMobile = useIsMobile();

  // ── Match info ────────────────────────────────────────────────────────────────
  const [date,         setDate]         = useState(new Date().toISOString().slice(0,10));
  const [opponent,     setOpponent]     = useState("");
  const [partner,      setPartner]      = useState("");
  const [score,        setScore]        = useState("");
  const [result,       setResult]       = useState("W");
  const [notes,        setNotes]        = useState("");
  const [savedMatchId, setSavedMatchId] = useState(null);
  const [matchSaved,   setMatchSaved]   = useState(false);
  const [matchSaving,  setMatchSaving]  = useState(false);
  const [matchErr,     setMatchErr]     = useState("");

  // ── Video ─────────────────────────────────────────────────────────────────────
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl,  setVideoUrl]  = useState(null);
  const [isIframe,  setIsIframe]  = useState(false); // true when URL is a web page (iframe), false for direct video file

  const isEmbeddableUrl = (url) => {
    // Detect web page URLs that should be iframed rather than played as video
    return !url.match(/\.(mp4|mov|avi|mkv|m4v|wmv|webm|mts|m2ts)(\?.*)?$/i);
  };
  const [uploadErr, setUploadErr] = useState("");
  const videoRef = useRef(null);

  // ── Tracking toggles (persisted) ─────────────────────────────────────────────
  const loadPref = (key, def) => {
    try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); }
    catch(e) { return def; }
  };
  const [trackShots, setTrackShots] = useState(() => loadPref("pi_track_shots", false));
  const [trackRally, setTrackRally] = useState(() => loadPref("pi_track_rally", true));
  const savePref = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} };
  const toggleShots = () => { const v = !trackShots; setTrackShots(v); savePref("pi_track_shots", v); };
  const toggleRally = () => { const v = !trackRally; setTrackRally(v); savePref("pi_track_rally", v); };

  // ── In-match metrics ─────────────────────────────────────────────────────────
  const [nvzArrived,  setNvzArrived]  = useState(0); // rallies both reached NVZ
  const [nvzTotal,    setNvzTotal]    = useState(0); // total rallies for NVZ %
  const [nvzWon,      setNvzWon]      = useState(0); // NVZ rallies won
  const [nvzWonTotal, setNvzWonTotal] = useState(0); // NVZ rallies for win rate %
  const [errors,      setErrors]      = useState(0); // unforced errors

  // ── Shot Tracker data: { shotName: { pos, neu, neg } } ───────────────────────
  const [shotData, setShotData] = useState({});

  // ── Rally Ender data: { shotName: { won, lost } } ────────────────────────────
  const [rallyData, setRallyData] = useState({});

  // ── Save state ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // ── Flash feedback ────────────────────────────────────────────────────────────
  const [flashMsg,   setFlashMsg]   = useState(null);
  const [flashColor, setFlashColor] = useState(C.mint);
  const showFlash = (msg, color) => {
    setFlashMsg(msg); setFlashColor(color);
    setTimeout(() => setFlashMsg(null), 900);
  };

  const formatTs = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Upload helpers ────────────────────────────────────────────────────────────
  // Video is local-only for playback — not uploaded to Supabase storage

  const processFile = (file) => {
    if (!file) return;
    setUploadErr("");
    if (file.size > 2048 * 1024 * 1024) { setUploadErr("File must be under 2GB."); return; }
    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|m4v|wmv|webm|mts|m2ts)$/i.test(file.name);
    if (!isVideo) { setUploadErr("Please select a video file (MP4, MOV, AVI, etc.)"); return; }
    setVideoFile(file);
    setIsIframe(false);
    // Show local preview immediately — match + upload happen on Save
    setVideoUrl(URL.createObjectURL(file));
  };

  // ── Logging actions ───────────────────────────────────────────────────────────
  const logShot = (shotName, outcome) => {
    setShotData(prev => {
      const curr = prev[shotName] || { pos:0, neu:0, neg:0 };
      return { ...prev, [shotName]: { ...curr, [outcome]: curr[outcome] + 1 } };
    });
    const col = outcome === "pos" ? C.mint : outcome === "neg" ? C.rose : C.textMid;
    const lbl = { pos:"Positive", neu:"Neutral", neg:"Negative" }[outcome];
    showFlash(`${shotName} — ${lbl}`, col);
  };

  const unlogShot = (shotName, outcome) => {
    setShotData(prev => {
      const curr = prev[shotName] || { pos:0, neu:0, neg:0 };
      if (curr[outcome] <= 0) return prev;
      return { ...prev, [shotName]: { ...curr, [outcome]: curr[outcome] - 1 } };
    });
  };

  const logRally = (shotName, res) => {
    setRallyData(prev => {
      const curr = prev[shotName] || { won:0, lost:0 };
      return { ...prev, [shotName]: { ...curr, [res === "W" ? "won" : "lost"]: curr[res === "W" ? "won" : "lost"] + 1 } };
    });
    showFlash(`${res === "W" ? "✓ Won" : "✕ Lost"} — ${shotName}`, res === "W" ? C.mint : C.rose);
  };

  const unlogRally = (shotName, res) => {
    setRallyData(prev => {
      const curr = prev[shotName] || { won:0, lost:0 };
      const key = res === "W" ? "won" : "lost";
      if (curr[key] <= 0) return prev;
      return { ...prev, [shotName]: { ...curr, [key]: curr[key] - 1 } };
    });
  };

  // ── Save all ──────────────────────────────────────────────────────────────────
  const saveAll = async () => {
    if (!videoFile && !videoUrl) { alert("Please upload a video first."); return; }
    const hasShots = trackShots && Object.keys(shotData).some(k => { const d = shotData[k]; return d.pos+d.neu+d.neg > 0; });
    const hasRally = trackRally && Object.keys(rallyData).some(k => { const d = rallyData[k]; return d.won+d.lost > 0; });
    if (!hasShots && !hasRally) { alert("Nothing logged yet."); return; }
    setSaving(true);
    try {
      // Refresh token if expired before any DB writes
      const refreshed = await ensureFreshToken();
      if (!refreshed) {
        alert("Your session has expired. Please sign out and sign back in.");
        setSaving(false);
        return;
      }

      const uid = getCurrentUserId();
      if (!uid) { alert("Session expired — please sign out and sign back in."); setSaving(false); return; }

      // Step 1: Save match record now (with all current field values)
      let matchId = savedMatchId;
      if (!matchId) {
        // Parse date parts directly to avoid timezone off-by-one issues
        const dateParts = date ? date.split("-") : null;
        const dateFormatted = dateParts
          ? new Date(+dateParts[0], +dateParts[1]-1, +dateParts[2])
              .toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })
          : new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
        const rows = await sb.insert("matches", {
          date: dateFormatted, opponent, partner, result, score, notes,
          nvz_arrival:0, nvz_win:0, serve_neut:0, errors:0, partner_role:"Balanced", user_id: uid,
        });
        matchId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
        setSavedMatchId(matchId);
        setMatchSaved(true);
      }

      // Video is local-only — not uploaded to storage (saves on storage costs)
      // Fetch existing shot record
      const fetchEx = async (name) => {
        try { return await sb.query("shots", { filter: `name=eq.${encodeURIComponent(name)}&user_id=eq.${uid}`, single: true }); }
        catch(e) { return null; }
      };

      // Shot Tracker: writes pos_count / neu_count / neg_count + attempts
      if (hasShots) {
        for (const [name, d] of Object.entries(shotData)) {
          const total = d.pos + d.neu + d.neg;
          if (total === 0) continue;
          const cat = SHOT_CATS.find(c => c.shots.some(s => s.name === name));
          const ex  = await fetchEx(name);
          await sb.upsert("shots", {
            name, category: cat?.label || "",
            attempts:  (ex?.attempts  || 0) + total,
            wins:      ex?.wins   || 0,
            misses:    ex?.misses || 0,
            pos_count: (ex?.pos_count || 0) + d.pos,
            neu_count: (ex?.neu_count || 0) + d.neu,
            neg_count: (ex?.neg_count || 0) + d.neg,
            win_history:  ex?.win_history  || [0,0,0,0],
            miss_history: ex?.miss_history || [0,0,0,0],
            color: cat?.color || C.blue, icon: cat?.icon || "🎾", user_id: uid,
          }, "user_id,name");
        }
      }

      // Rally Ender: writes wins / misses only
      if (hasRally) {
        for (const [name, d] of Object.entries(rallyData)) {
          if (d.won + d.lost === 0) continue;
          const cat = SHOT_CATS.find(c => c.shots.some(s => s.name === name));
          const ex  = await fetchEx(name);
          const winAdd  = d.won;
          const missAdd = d.lost;
          await sb.upsert("shots", {
            name, category: cat?.label || "",
            attempts:  (ex?.attempts || 0) + winAdd + missAdd,
            wins:      (ex?.wins     || 0) + winAdd,
            misses:    (ex?.misses   || 0) + missAdd,
            pos_count: ex?.pos_count || 0,
            neu_count: ex?.neu_count || 0,
            neg_count: ex?.neg_count || 0,
            win_history:  [...((ex?.win_history)  || [0,0,0,0]).slice(1), winAdd  > 0 ? 100 : 0],
            miss_history: [...((ex?.miss_history) || [0,0,0,0]).slice(1), missAdd > 0 ? 100 : 0],
            color: cat?.color || C.blue, icon: cat?.icon || "🎾", user_id: uid,
          }, "user_id,name");
        }
      }
      // Also update the match record with the in-match metrics
      const serveReturnShots = ["Serve","Return BH","Return FH"];
      const srNeuPos = serveReturnShots.reduce((a,n)=>{ const d=shotData[n]||{pos:0,neu:0,neg:0}; return a+d.pos+d.neu; }, 0);
      const srTotal  = serveReturnShots.reduce((a,n)=>{ const d=shotData[n]||{pos:0,neu:0,neg:0}; return a+d.pos+d.neu+d.neg; }, 0);
      const serveNeut = srTotal > 0 ? Math.round((srNeuPos / srTotal) * 100) : 0;
      const nvzArr  = nvzTotal    > 0 ? Math.round((nvzArrived  / nvzTotal)    * 100) : 0;
      const nvzWinR = nvzWonTotal > 0 ? Math.round((nvzWon      / nvzWonTotal) * 100) : 0;
      if (matchId) {
        await sb.upsert("matches", {
          id: matchId,
          nvz_arrival: nvzArr,
          nvz_win:     nvzWinR,
          serve_neut:  serveNeut,
          errors:      errors,
        }, "id");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch(e) { alert("Save failed: " + e.message); }
    setSaving(false);
  };

  // ── Toggle switch component ───────────────────────────────────────────────────
  const Toggle = ({ label, active, onToggle, color }) => (
    <div onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderRadius: 10, border: `1.5px solid ${active ? color : C.border}`,
      background: active ? `${color}10` : C.pageBg,
      cursor: "pointer", transition: "all 0.18s", userSelect: "none", flexShrink: 0,
    }}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: active ? color : C.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: active ? 17 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: active ? C.text : C.textMid, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );

  // ── Shot Tracker grid ─────────────────────────────────────────────────────────
  // Default: light tint. After click: darker tint + colored text/border.
  const ShotTrackerGrid = () => (
    <div>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 3, marginBottom: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.rose,    textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>✕ Negative</div>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>– Neutral</div>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.mint,    textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>✓ Positive</div>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.textLight,textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", minWidth: 24 }}>#</div>
      </div>
      {SHOT_BUTTONS.map(cat => (
        <div key={cat.cat} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: cat.color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{cat.cat}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {cat.shots.map(shot => {
              const d     = shotData[shot] || { pos:0, neu:0, neg:0 };
              const total = d.pos + d.neu + d.neg;
              // colour helpers
              const negBg     = d.neg > 0 ? "#FECDCE" : "#FEF0F3";
              const negBorder = d.neg > 0 ? C.rose     : "#F9C4CA";
              const negColor  = d.neg > 0 ? C.rose     : "#E8A0A8";
              const neuBg     = d.neu > 0 ? "#D1D5DB" : "#F3F4F6";
              const neuBorder = d.neu > 0 ? "#6B7280"  : "#D1D5DB";
              const neuColor  = d.neu > 0 ? "#374151"  : "#9CA3AF";
              const posBg     = d.pos > 0 ? "#A7F3D0" : "#E8FAF5";
              const posBorder = d.pos > 0 ? C.mint     : "#A0EDD5";
              const posColor  = d.pos > 0 ? "#059669"  : "#6EE0B5";
              const UndoBtn = ({outcome, col}) => d[outcome] > 0 ? (
                <button onClick={e => { e.stopPropagation(); unlogShot(shot, outcome); }}
                  title="Undo last"
                  style={{ width:16, height:16, borderRadius:4, border:`1px solid ${col}60`,
                    background:`${col}15`, color:col, fontSize:10, fontWeight:700,
                    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                    flexShrink:0, lineHeight:1, padding:0 }}>−</button>
              ) : null;
              return (
                <div key={shot} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 3, alignItems: "center" }}>
                  {/* Negative */}
                  <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                    <button onClick={() => logShot(shot, "neg")} style={{
                      flex:1, padding: "6px 4px", borderRadius: 7, border: `1.5px solid ${negBorder}`,
                      background: negBg, color: negColor,
                      fontFamily: "'Outfit'", fontWeight: 700, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", textAlign: "center",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#FECDCE"; e.currentTarget.style.borderColor = C.rose; e.currentTarget.style.color = C.rose; }}
                      onMouseLeave={e => { e.currentTarget.style.background = negBg; e.currentTarget.style.borderColor = negBorder; e.currentTarget.style.color = negColor; }}>
                      ✕ {shot}{d.neg > 0 ? ` (${d.neg})` : ""}
                    </button>
                    <UndoBtn outcome="neg" col={C.rose}/>
                  </div>
                  {/* Neutral */}
                  <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                    <button onClick={() => logShot(shot, "neu")} style={{
                      flex:1, padding: "6px 4px", borderRadius: 7, border: `1.5px solid ${neuBorder}`,
                      background: neuBg, color: neuColor,
                      fontFamily: "'Outfit'", fontWeight: 700, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", textAlign: "center",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#D1D5DB"; e.currentTarget.style.borderColor = "#6B7280"; e.currentTarget.style.color = "#374151"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = neuBg; e.currentTarget.style.borderColor = neuBorder; e.currentTarget.style.color = neuColor; }}>
                      – {shot}{d.neu > 0 ? ` (${d.neu})` : ""}
                    </button>
                    <UndoBtn outcome="neu" col={C.textMid}/>
                  </div>
                  {/* Positive */}
                  <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                    <button onClick={() => logShot(shot, "pos")} style={{
                      flex:1, padding: "6px 4px", borderRadius: 7, border: `1.5px solid ${posBorder}`,
                      background: posBg, color: posColor,
                      fontFamily: "'Outfit'", fontWeight: 700, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", textAlign: "center",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#A7F3D0"; e.currentTarget.style.borderColor = C.mint; e.currentTarget.style.color = "#059669"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = posBg; e.currentTarget.style.borderColor = posBorder; e.currentTarget.style.color = posColor; }}>
                      ✓ {shot}{d.pos > 0 ? ` (${d.pos})` : ""}
                    </button>
                    <UndoBtn outcome="pos" col={C.mint}/>
                  </div>
                  {/* Total */}
                  <div style={{
                    fontFamily: "'DM Mono'", fontSize: 12, fontWeight: 700, textAlign: "center", minWidth: 24,
                    color: total > 0 ? C.text : C.textLight,
                  }}>{total > 0 ? total : "–"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Rally Ender grid — same visual language as Shot Tracker ───────────────────
  const RallyGrid = () => (
    <div>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 3, marginBottom: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.rose, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>✕ Lost</div>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.mint, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>✓ Won</div>
        <div style={{ fontSize: 9, fontWeight: 800, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", minWidth: 24 }}>#</div>
      </div>
      {SHOT_BUTTONS.map(cat => (
        <div key={cat.cat} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: cat.color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{cat.cat}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {cat.shots.map(shot => {
              const d     = rallyData[shot] || { won:0, lost:0 };
              const total = d.won + d.lost;
              const lostBg     = d.lost > 0 ? "#FECDCE" : "#FEF0F3";
              const lostBorder = d.lost > 0 ? C.rose     : "#F9C4CA";
              const lostColor  = d.lost > 0 ? C.rose     : "#E8A0A8";
              const wonBg      = d.won  > 0 ? "#A7F3D0" : "#E8FAF5";
              const wonBorder  = d.won  > 0 ? C.mint     : "#A0EDD5";
              const wonColor   = d.won  > 0 ? "#059669"  : "#6EE0B5";
              return (
                <div key={shot} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 3, alignItems: "center" }}>
                  {/* Lost */}
                  <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                    <button onClick={() => logRally(shot, "L")} style={{
                      flex:1, padding: "6px 4px", borderRadius: 7, border: `1.5px solid ${lostBorder}`,
                      background: lostBg, color: lostColor,
                      fontFamily: "'Outfit'", fontWeight: 700, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", textAlign: "center",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#FECDCE"; e.currentTarget.style.borderColor = C.rose; e.currentTarget.style.color = C.rose; }}
                      onMouseLeave={e => { e.currentTarget.style.background = lostBg; e.currentTarget.style.borderColor = lostBorder; e.currentTarget.style.color = lostColor; }}>
                      ✕ {shot}{d.lost > 0 ? ` (${d.lost})` : ""}
                    </button>
                    {d.lost > 0 && <button onClick={e => { e.stopPropagation(); unlogRally(shot, "L"); }}
                      title="Undo last" style={{ width:16, height:16, borderRadius:4,
                        border:`1px solid ${C.rose}60`, background:`${C.rose}15`, color:C.rose,
                        fontSize:10, fontWeight:700, cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, lineHeight:1, padding:0 }}>−</button>}
                  </div>
                  {/* Won */}
                  <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                    <button onClick={() => logRally(shot, "W")} style={{
                      flex:1, padding: "6px 4px", borderRadius: 7, border: `1.5px solid ${wonBorder}`,
                      background: wonBg, color: wonColor,
                      fontFamily: "'Outfit'", fontWeight: 700, fontSize: 10,
                      cursor: "pointer", transition: "all 0.15s", textAlign: "center",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#A7F3D0"; e.currentTarget.style.borderColor = C.mint; e.currentTarget.style.color = "#059669"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = wonBg; e.currentTarget.style.borderColor = wonBorder; e.currentTarget.style.color = wonColor; }}>
                      ✓ {shot}{d.won > 0 ? ` (${d.won})` : ""}
                    </button>
                    {d.won > 0 && <button onClick={e => { e.stopPropagation(); unlogRally(shot, "W"); }}
                      title="Undo last" style={{ width:16, height:16, borderRadius:4,
                        border:`1px solid ${C.mint}60`, background:`${C.mint}15`, color:C.mint,
                        fontSize:10, fontWeight:700, cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, lineHeight:1, padding:0 }}>−</button>}
                  </div>
                  {/* Total */}
                  <div style={{
                    fontFamily: "'DM Mono'", fontSize: 12, fontWeight: 700, textAlign: "center", minWidth: 24,
                    color: total > 0 ? C.text : C.textLight,
                  }}>{total > 0 ? total : "–"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Computed totals ───────────────────────────────────────────────────────────
  const shotTotal  = Object.values(shotData).reduce((a, d) => a + d.pos + d.neu + d.neg, 0);
  const rallyTotal = Object.values(rallyData).reduce((a, d) => a + d.won + d.lost, 0);
  const totalLogged = shotTotal + rallyTotal;
  const anyTracking = trackShots || trackRally;
  const bothActive  = trackShots && trackRally;

  // ── Layout: adaptive columns based on active toggles ─────────────────────────
  // Shot Tracker LEFT · Video CENTER · Rally Ender RIGHT
  // If only one panel active, video fills the other half.
  const gridCols = bothActive
    ? "340px 1fr 340px"       // both panels
    : trackShots
      ? "340px 1fr"           // shot tracker left, video right
      : "1fr 340px";          // video left, rally right

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>

      {/* ── Step 1: Match Info ── */}
      <Card style={{ padding: 0, overflow: "visible" }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SLabel style={{ marginBottom: 0 }}>Step 1 — Match Info</SLabel>
          {matchSaved && <span style={{ fontSize: 12, fontWeight: 600, color: C.mint }}>✓ Match saved</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "12px 18px 0" }}>
          <div>
            <div style={{ fontSize: 10, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={matchSaved}
              style={{ width: "100%", background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: "'Outfit'", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>Score</div>
            <input type="text" value={score} onChange={e => setScore(e.target.value)} placeholder="e.g. 11-7" disabled={matchSaved}
              style={{ width: "100%", background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: "'Outfit'", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>Result</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {[["W","Win"],["L","Loss"]].map(([v,lbl]) => (
                <button key={v} onClick={() => !matchSaved && setResult(v)} style={{
                  padding: "8px 4px", borderRadius: 9, fontWeight: 700, fontSize: 12,
                  cursor: matchSaved ? "default" : "pointer", fontFamily: "'Outfit'",
                  background: result === v ? (v === "W" ? `${C.mint}20` : `${C.rose}20`) : C.pageBg,
                  border: `2px solid ${result === v ? (v === "W" ? C.mint : C.rose) : C.border}`,
                  color: result === v ? (v === "W" ? C.mint : C.rose) : C.textMid,
                }}>{lbl}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 18px 0" }}>
          <PlayerSearch label="Opponent(s)" value={opponent} onChange={setOpponent} placeholder="Search or type name..." multi={true} />
          <PlayerSearch label="Partner" value={partner} onChange={setPartner} placeholder="Search or type name..." />
        </div>
        <div style={{ padding: "10px 18px 14px" }}>
          <div style={{ fontSize: 10, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>Notes (optional)</div>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything notable..." disabled={matchSaved}
            style={{ width: "100%", background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: "'Outfit'", boxSizing: "border-box" }} />
        </div>
        {matchErr && <div style={{ margin: "0 18px 12px", background: `${C.rose}15`, border: `1px solid ${C.rose}40`, borderRadius: 9, padding: "9px 13px", fontSize: 12, color: C.rose }}>{matchErr}</div>}
      </Card>

      {/* ── Step 2: Tracking Toggles ── */}
      <Card style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, marginRight: 4 }}>Track:</div>
          {/* Shot Tracker FIRST (left) */}
          <Toggle label="🎯 Shot Tracker" active={trackShots} onToggle={toggleShots} color={C.blue} />
          <Toggle label="🏁 Rally Ender"  active={trackRally} onToggle={toggleRally} color={C.mint} />
          <div style={{ fontSize: 11, color: C.textLight, marginLeft: "auto" }}>Saved automatically</div>
        </div>

        {/* Guidance row — always visible */}
        <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: 1, minWidth: 260,
            padding: "9px 13px", background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 9 }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>🎯</span>
            <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: C.blue }}>Shot Tracker</span> — log every shot you hit during the rally.
              Rate each one <span style={{ color: C.mint, fontWeight: 600 }}>positive</span>, <span style={{ color: C.textMid, fontWeight: 600 }}>neutral</span>, or <span style={{ color: C.rose, fontWeight: 600 }}>negative</span> based on shot quality.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: 1, minWidth: 260,
            padding: "9px 13px", background: `${C.mint}08`, border: `1px solid ${C.mint}20`, borderRadius: 9 }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>🏁</span>
            <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: C.mint }}>Rally Ender</span> — log only the final shot that ended the rally.
              Mark it <span style={{ color: C.mint, fontWeight: 600 }}>Won</span> or <span style={{ color: C.rose, fontWeight: 600 }}>Lost</span>.
            </div>
          </div>
        </div>

        {/* Both on warning */}
        {trackShots && trackRally && (
          <div style={{ marginTop: 8, padding: "8px 13px", background: `${C.amber}12`, border: `1px solid ${C.amber}40`, borderRadius: 9,
            fontSize: 11, color: C.amber, lineHeight: 1.6 }}>
            ⚠️ <span style={{ fontWeight: 700 }}>Both modes are on.</span> Do not log the same shot in both panels —
            use Shot Tracker for all shots during the rally, and Rally Ender only for the final shot that ends it.
            Logging the same shot twice will double-count it.
          </div>
        )}

        {!anyTracking && (
          <div style={{ marginTop: 8, padding: "9px 13px", background: `${C.amber}15`, border: `1px solid ${C.amber}40`, borderRadius: 9, fontSize: 12, color: C.amber, fontWeight: 600 }}>
            ⚠️ Turn on at least one tracking mode above.
          </div>
        )}
      </Card>

      {/* ── Step 3: Upload / Video + Side Panels ── */}
      <Card style={{ padding: "14px 16px" }}>
        <SLabel>Step 3 — Upload Video</SLabel>

        {!videoUrl ? (
          /* ── No video yet: upload UI ── */
          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textLight, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 5 }}>Paste a video URL (optional)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" id="videoUrlInput3" placeholder="Paste any video URL or PlaySight share link…"
                  style={{ flex: 1, background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 11px", color: C.text, fontSize: 13, fontFamily: "'Outfit'" }} />
                <button onClick={() => {
                  const url = document.getElementById("videoUrlInput3").value.trim();
                  if (url) { setIsIframe(isEmbeddableUrl(url)); setVideoUrl(url); }
                }} style={{ padding: "8px 16px", background: C.navy, border: "none", borderRadius: 9, color: C.pickle, fontFamily: "'Outfit'", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Load</button>
              </div>
            </div>
            <label style={{ display: "block", cursor: "pointer" }}>
              <div style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: "36px 20px", textAlign: "center", background: C.pageBg, transition: "all 0.2s" }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.pickle; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = C.border; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.border; processFile(e.dataTransfer.files[0]); }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, color: C.navy, letterSpacing: "0.04em", marginBottom: 5 }}>Drop video here or click to browse</div>
                <div style={{ fontSize: 12, color: C.textLight }}>MP4, MOV, AVI · Max 2GB</div>

                {uploadErr && <div style={{ marginTop: 10, fontSize: 12, color: C.rose }}>{uploadErr}</div>}
              </div>
              <input type="file" accept="video/*" onChange={e => processFile(e.target.files[0])} style={{ display: "none" }} />
            </label>
          </div>
        ) : (
          /* ── Video loaded: adaptive 3-column layout ── */
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 14, alignItems: "start" }}>

            {/* Column 1: Shot Tracker (only if active) */}
            {trackShots && (
              <div style={{ background: `${C.blue}06`, border: `1.5px solid ${C.blue}30`, borderRadius: 12, padding: "12px 14px", maxHeight: 580, overflowY: "auto" }}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 17, color: C.navy, letterSpacing: "0.05em", marginBottom: 8 }}>🎯 Shot Tracker</div>
                <ShotTrackerGrid />
                {shotTotal > 0 && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: C.pageBg, borderRadius: 8, fontSize: 11, display: "flex", gap: 10 }}>
                    <span style={{ color: C.mint,    fontWeight: 700 }}>{Object.values(shotData).reduce((a,d)=>a+d.pos,0)} pos</span>
                    <span style={{ color: C.textMid, fontWeight: 700 }}>{Object.values(shotData).reduce((a,d)=>a+d.neu,0)} neu</span>
                    <span style={{ color: C.rose,    fontWeight: 700 }}>{Object.values(shotData).reduce((a,d)=>a+d.neg,0)} neg</span>
                    <span style={{ color: C.textLight, marginLeft: "auto" }}>{shotTotal} total</span>
                  </div>
                )}
              </div>
            )}

            {/* Column 2: Video (always center / fills space adaptively) */}
            <div>
              {/* Flash feedback */}
              {flashMsg && (
                <div style={{
                  marginBottom: 8, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                  color: flashColor, background: `${flashColor}18`, border: `1px solid ${flashColor}50`,
                  animation: "fadeUp 0.15s ease", textAlign: "center",
                }}>
                  {flashMsg}
                </div>
              )}
              {isIframe ? (
                <iframe
                  src={videoUrl}
                  style={{ width: "100%", height: 460, borderRadius: 10, border: "none", background: "#000" }}
                  allowFullScreen
                  allow="autoplay; fullscreen"
                  title="Match Video"
                />
              ) : (
                <video ref={videoRef} src={videoUrl} controls
                  style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 460 }} />
              )}

              <button onClick={() => { setVideoUrl(null); setVideoFile(null); setIsIframe(false); setShotData({}); setRallyData({}); setNvzArrived(0); setNvzTotal(0); setNvzWon(0); setNvzWonTotal(0); setErrors(0); setSavedMatchId(null); setMatchSaved(false); }}
                style={{ marginTop: 8, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, color: C.textMid, cursor: "pointer", fontFamily: "'Outfit'" }}>
                ✕ Remove video
              </button>

              {/* ── In-match metrics ── */}
              {(() => {
                // Auto-calc serve neut from Shot Tracker data
                const srShots = ["Serve","Return BH","Return FH"];
                const srNeuPos = srShots.reduce((a,n)=>{ const d=shotData[n]||{pos:0,neu:0,neg:0}; return a+d.pos+d.neu; },0);
                const srTotal  = srShots.reduce((a,n)=>{ const d=shotData[n]||{pos:0,neu:0,neg:0}; return a+d.pos+d.neu+d.neg; },0);
                const serveNeut = srTotal > 0 ? Math.round((srNeuPos/srTotal)*100) : null;
                const nvzArr  = nvzTotal    > 0 ? Math.round((nvzArrived/nvzTotal)*100)    : null;
                const nvzWinR = nvzWonTotal > 0 ? Math.round((nvzWon/nvzWonTotal)*100)      : null;

                // Counter row: label + − count + button
                const MetricCounter = ({label, color, colorL, val, onDec, onInc, total, suffix=""}) => (
                  <div style={{flex:1, background:colorL, border:`1.5px solid ${color}30`, borderRadius:10, padding:"10px 12px"}}>
                    <div style={{fontSize:10, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6}}>{label}</div>
                    <div style={{display:"flex", alignItems:"center", gap:6}}>
                      <button onClick={onDec} style={{width:26,height:26,borderRadius:6,border:`1px solid ${color}40`,background:"white",fontSize:15,color:color,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700}}>−</button>
                      <span style={{fontFamily:"'DM Mono'",fontSize:18,fontWeight:700,color,minWidth:28,textAlign:"center"}}>{val}</span>
                      <button onClick={onInc} style={{width:26,height:26,borderRadius:6,border:`1.5px solid ${color}`,background:color,fontSize:15,color:"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700}}>+</button>
                      {total !== undefined && <span style={{fontSize:10,color,fontWeight:600,marginLeft:2}}>/ {total}</span>}
                      {suffix && <span style={{fontSize:10,color,fontWeight:600,marginLeft:2}}>{suffix}</span>}
                    </div>
                    {total !== undefined && total > 0 && (
                      <div style={{marginTop:4,fontSize:11,fontWeight:700,color}}>{Math.round(val/total*100)}%</div>
                    )}
                  </div>
                );

                return (
                  <div style={{marginTop:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.textMid,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>In-Match Metrics</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                      {/* NVZ Arrival */}
                      {(()=>{
                        const nvzMissed = nvzTotal - nvzArrived;
                        const arrBg     = nvzArrived > 0 ? "#A7F3D0" : "#E8FAF5";
                        const arrBorder = nvzArrived > 0 ? C.mint    : "#A0EDD5";
                        const arrColor  = nvzArrived > 0 ? "#059669" : "#6EE0B5";
                        const misBg     = nvzMissed  > 0 ? "#FECDCE" : "#FEF0F3";
                        const misBorder = nvzMissed  > 0 ? C.rose    : "#F9C4CA";
                        const misColor  = nvzMissed  > 0 ? C.rose    : "#E8A0A8";
                        return (
                          <div style={{background:C.mintL, border:`1.5px solid ${C.mint}30`, borderRadius:10, padding:"10px 12px"}}>
                            <div style={{fontSize:10,fontWeight:700,color:C.mint,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>NVZ Arrival</div>
                            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                              {/* Arrived row */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,alignItems:"center"}}>
                                <button onClick={()=>{ setNvzArrived(nvzArrived+1); setNvzTotal(nvzTotal+1); }}
                                  style={{padding:"6px 4px",borderRadius:7,border:`1.5px solid ${arrBorder}`,background:arrBg,color:arrColor,fontFamily:"'Outfit'",fontWeight:700,fontSize:10,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}}
                                  onMouseEnter={e=>{e.currentTarget.style.background="#A7F3D0";e.currentTarget.style.borderColor=C.mint;e.currentTarget.style.color="#059669";}}
                                  onMouseLeave={e=>{e.currentTarget.style.background=arrBg;e.currentTarget.style.borderColor=arrBorder;e.currentTarget.style.color=arrColor;}}>
                                  ✓ Arrived{nvzArrived>0?` (${nvzArrived})`:""}
                                </button>
                                <button onClick={()=>setNvzArrived(Math.max(0,nvzArrived-1))}
                                  style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.mint}40`,background:"white",fontSize:13,color:C.mint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                              </div>
                              {/* Did not arrive row */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,alignItems:"center"}}>
                                <button onClick={()=>{ setNvzTotal(nvzTotal+1); }}
                                  style={{padding:"6px 4px",borderRadius:7,border:`1.5px solid ${misBorder}`,background:misBg,color:misColor,fontFamily:"'Outfit'",fontWeight:700,fontSize:10,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}}
                                  onMouseEnter={e=>{e.currentTarget.style.background="#FECDCE";e.currentTarget.style.borderColor=C.rose;e.currentTarget.style.color=C.rose;}}
                                  onMouseLeave={e=>{e.currentTarget.style.background=misBg;e.currentTarget.style.borderColor=misBorder;e.currentTarget.style.color=misColor;}}>
                                  ✕ Not Arrived{nvzMissed>0?` (${nvzMissed})`:""}
                                </button>
                                <button onClick={()=>{ if(nvzTotal>nvzArrived) setNvzTotal(nvzTotal-1); }}
                                  style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.rose}40`,background:"white",fontSize:13,color:C.rose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                              </div>
                            </div>
                            <div style={{fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:C.mint}}>{nvzArr !== null ? nvzArr+"%" : "—"}</div>
                            {nvzTotal>0 && <div style={{fontSize:9,color:C.textLight,marginTop:2}}>{nvzArrived} of {nvzTotal} rallies</div>}
                          </div>
                        );
                      })()}

                      {/* NVZ Win Rate */}
                      {(()=>{
                        const nvzLost   = nvzWonTotal - nvzWon;
                        const wonBg     = nvzWon  > 0 ? "#A7F3D0" : "#E8FAF5";
                        const wonBorder = nvzWon  > 0 ? C.mint    : "#A0EDD5";
                        const wonColor  = nvzWon  > 0 ? "#059669" : "#6EE0B5";
                        const lostBg     = nvzLost > 0 ? "#FECDCE" : "#FEF0F3";
                        const lostBorder = nvzLost > 0 ? C.rose    : "#F9C4CA";
                        const lostColor  = nvzLost > 0 ? C.rose    : "#E8A0A8";
                        return (
                          <div style={{background:C.blueL, border:`1.5px solid ${C.blue}30`, borderRadius:10, padding:"10px 12px"}}>
                            <div style={{fontSize:10,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>NVZ Win Rate</div>
                            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                              {/* Won row */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,alignItems:"center"}}>
                                <button onClick={()=>{ setNvzWon(nvzWon+1); setNvzWonTotal(nvzWonTotal+1); }}
                                  style={{padding:"6px 4px",borderRadius:7,border:`1.5px solid ${wonBorder}`,background:wonBg,color:wonColor,fontFamily:"'Outfit'",fontWeight:700,fontSize:10,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}}
                                  onMouseEnter={e=>{e.currentTarget.style.background="#A7F3D0";e.currentTarget.style.borderColor=C.mint;e.currentTarget.style.color="#059669";}}
                                  onMouseLeave={e=>{e.currentTarget.style.background=wonBg;e.currentTarget.style.borderColor=wonBorder;e.currentTarget.style.color=wonColor;}}>
                                  ✓ Won{nvzWon>0?` (${nvzWon})`:""}
                                </button>
                                <button onClick={()=>{ setNvzWon(Math.max(0,nvzWon-1)); if(nvzWonTotal>0) setNvzWonTotal(nvzWonTotal-1); }}
                                  style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.mint}40`,background:"white",fontSize:13,color:C.mint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                              </div>
                              {/* Lost row */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:4,alignItems:"center"}}>
                                <button onClick={()=>setNvzWonTotal(nvzWonTotal+1)}
                                  style={{padding:"6px 4px",borderRadius:7,border:`1.5px solid ${lostBorder}`,background:lostBg,color:lostColor,fontFamily:"'Outfit'",fontWeight:700,fontSize:10,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}}
                                  onMouseEnter={e=>{e.currentTarget.style.background="#FECDCE";e.currentTarget.style.borderColor=C.rose;e.currentTarget.style.color=C.rose;}}
                                  onMouseLeave={e=>{e.currentTarget.style.background=lostBg;e.currentTarget.style.borderColor=lostBorder;e.currentTarget.style.color=lostColor;}}>
                                  ✕ Lost{nvzLost>0?` (${nvzLost})`:""}
                                </button>
                                <button onClick={()=>{ if(nvzWonTotal>nvzWon) setNvzWonTotal(nvzWonTotal-1); }}
                                  style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.rose}40`,background:"white",fontSize:13,color:C.rose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                              </div>
                            </div>
                            <div style={{fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:C.blue}}>{nvzWinR !== null ? nvzWinR+"%" : "—"}</div>
                            {nvzWonTotal>0 && <div style={{fontSize:9,color:C.textLight,marginTop:2}}>{nvzWon} of {nvzWonTotal} rallies</div>}
                          </div>
                        );
                      })()}

                      {/* Errors + Serve Neut (stacked) */}
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {/* Unforced Errors */}
                        <div style={{background:C.roseL, border:`1.5px solid ${C.rose}30`, borderRadius:10, padding:"10px 12px",flex:1}}>
                          <div style={{fontSize:10,fontWeight:700,color:C.rose,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Errors</div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <button onClick={()=>setErrors(Math.max(0,errors-1))} style={{width:22,height:22,borderRadius:5,border:`1px solid ${C.rose}40`,background:"white",fontSize:13,color:C.rose,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                            <span style={{fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:C.rose,minWidth:28,textAlign:"center"}}>{errors}</span>
                            <button onClick={()=>setErrors(errors+1)} style={{width:22,height:22,borderRadius:5,border:`1.5px solid ${C.rose}`,background:C.rose,fontSize:13,color:"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
                          </div>
                          <div style={{fontSize:10,color:C.textLight}}>Unforced errors</div>
                        </div>
                        {/* Serve Neut — auto from Shot Tracker */}
                        <div style={{background:C.amberL, border:`1.5px solid ${C.amber}30`, borderRadius:10, padding:"10px 12px",flex:1}}>
                          <div style={{fontSize:10,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Serve Neut.</div>
                          <div style={{fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:C.amber}}>{serveNeut !== null ? serveNeut+"%" : "—"}</div>
                          <div style={{fontSize:9,color:C.textLight,marginTop:2,lineHeight:1.4}}>Auto from Shot Tracker{srTotal>0?` (${srNeuPos}/${srTotal})`:""}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Session summary + Save */}
              {totalLogged > 0 && (
                <>
                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {trackShots && shotTotal > 0 && (
                      <div style={{ padding: "7px 12px", background: C.pageBg, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: C.textMid, fontWeight: 600 }}>🎯</span>
                        <span style={{ color: C.mint,    fontWeight: 700 }}>{Object.values(shotData).reduce((a,d)=>a+d.pos,0)}+</span>
                        <span style={{ color: C.textMid, fontWeight: 700 }}>{Object.values(shotData).reduce((a,d)=>a+d.neu,0)}–</span>
                        <span style={{ color: C.rose,    fontWeight: 700 }}>{Object.values(shotData).reduce((a,d)=>a+d.neg,0)}✕</span>
                      </div>
                    )}
                    {trackRally && rallyTotal > 0 && (
                      <div style={{ padding: "7px 12px", background: C.pageBg, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: C.textMid, fontWeight: 600 }}>🏁</span>
                        <span style={{ color: C.mint, fontWeight: 700 }}>{Object.values(rallyData).reduce((a,d)=>a+d.won,0)}W</span>
                        <span style={{ color: C.rose, fontWeight: 700 }}>{Object.values(rallyData).reduce((a,d)=>a+d.lost,0)}L</span>
                      </div>
                    )}
                  </div>
                  <button onClick={saveAll} disabled={saving || saved} style={{
                    width: "100%", marginTop: 10, background: saved ? C.mint : saving ? C.border : C.pickle,
                    border: "none", borderRadius: 12, padding: "14px", fontFamily: "'Outfit'",
                    fontWeight: 700, fontSize: 15, color: C.navy,
                    cursor: saving || saved ? "not-allowed" : "pointer", transition: "all 0.2s",
                  }}>
                    {saved ? "✓ All Data Saved!" : saving ? "Saving..." : `Save Session — ${totalLogged} logged`}
                  </button>
                </>
              )}
            </div>

            {/* Column 3: Rally Ender (only if active) */}
            {trackRally && (
              <div style={{ background: `${C.mint}06`, border: `1.5px solid ${C.mint}30`, borderRadius: 12, padding: "12px 14px", maxHeight: 580, overflowY: "auto" }}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 17, color: C.navy, letterSpacing: "0.05em", marginBottom: 8 }}>🏁 Rally Ender</div>
                <RallyGrid />
                {rallyTotal > 0 && (
                  <div style={{ marginTop: 8, padding: "6px 10px", background: C.pageBg, borderRadius: 8, fontSize: 11, display: "flex", gap: 10 }}>
                    <span style={{ color: C.mint, fontWeight: 700 }}>{Object.values(rallyData).reduce((a,d)=>a+d.won,0)} won</span>
                    <span style={{ color: C.rose, fontWeight: 700 }}>{Object.values(rallyData).reduce((a,d)=>a+d.lost,0)} lost</span>
                    <span style={{ color: C.textLight, marginLeft: "auto" }}>{rallyTotal} total</span>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </Card>
    </div>
  );
}

const MatchCenter=({defaultTab="log"})=>{
  const isMobile = useIsMobile();
  const [tab,setTab]=useState(defaultTab); // "log" | "partners" | "history"

  const TABS=[
    {id:"log",      label:"📋 Log Match"},
    {id:"video",    label:"🎬 Log from Video"},
    {id:"partners", label:"👥 Partners"},
    {id:"history",  label:"🏆 Match History"},
  ];

  return(
    <div className="fade-up" style={{width:"100%",boxSizing:"border-box"}}>

      {/* Page header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>Matches</h1>
        <p style={{color:C.textMid,fontSize:14,marginTop:3}}>Log results · track partnerships · review your match history</p>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:4,marginBottom:28,background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:14,padding:5,width:"100%",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:tab===t.id?C.navy:"transparent",
            border:"none",borderRadius:10,
            padding:"10px 22px",cursor:"pointer",
            fontFamily:"'Outfit'",fontWeight:700,fontSize:13,
            color:tab===t.id?"white":C.textMid,
            transition:"all 0.15s",whiteSpace:"nowrap"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Log Match ── */}
      {tab==="log"&&<LogMatchContent/>}

      {/* ── Tab: Video Logger ── */}
      {tab==="video"&&<VideoLoggerContent/>}

      {/* ── Tab: Partners ── */}
      {tab==="partners"&&<PartnersContent/>}

      {/* ── Tab: Match History ── */}
      {tab==="history"&&<MatchHistoryContent/>}

    </div>
  );
};

// ── HELP MODAL ────────────────────────────────────────────────────────────────
const FAQS = [
  { q:"How do I log a match?",
    a:"Go to Matches → Log Match tab. Fill in the basics (date, opponent, partner, score, result) and the performance sliders (NVZ Arrival, errors, etc.). Shot logging is optional — expand the Shot Log section at the bottom if you want to track individual shot data. Hit Save Match and all your charts update automatically." },
  { q:"How is my Win Rate calculated?",
    a:"Win Rate is the percentage of matches you've won out of all logged matches. It updates automatically each time you log a match result." },
  { q:"What is NVZ Arrival and why does it matter?",
    a:"NVZ Arrival is the percentage of rallies where both you and your partner reach the Non-Volley Zone (kitchen line). Research shows teams who arrive at the NVZ together win significantly more rallies — elite 4.0+ players target 80%+." },
  { q:"What does Serve Neutralization mean?",
    a:"Serve Neutralization measures the percentage of YOUR serves and returns where the opponent cannot attack. It's tracked individually — not as a team stat — so it reflects your personal serving and return quality." },
  { q:"How do I pin Priority Drills?",
    a:"Go to the Shot Analytics page and click the 📌 Focus button on any shot row. You can pin up to 3 shots. They'll appear on your Dashboard and Profile with target sliders to track progress." },
  { q:"What is the Synergy Score?",
    a:"Synergy Score (0–100) measures how well you and a partner perform together. It's built from 5 equally weighted components: Joint NVZ Arrival, NVZ Win Rate, Role Clarity, Error Avoidance, and DUPR-Adjusted Win Rate." },
  { q:"Who can see my stats and match data?",
    a:"Your stats are private by default — only you can see them. PickleIntel does not share individual match data, shot analytics, or performance metrics with other players, clubs, or third parties. Aggregate anonymized data may be used to improve the app." },
  { q:"How do I upgrade to Pro?",
    a:"Go to your Profile page and click 'Upgrade to Pro →' in the Membership section. Pro unlocks automated video analysis and unlimited PICKL AI coaching for $12.99/month." },
  { q:"Can I connect my DUPR account?",
    a:"Yes — DUPR integration is available on both Free and Pro plans. Go to Profile → Connected Accounts. Once connected, your rating syncs automatically after each logged match." },
  { q:"How does the PICKL AI coach work?",
    a:"PICKL is powered by Claude AI and has full context of your match history, shot stats, and goals. Free users get 10 messages per month. Pro users get unlimited access. You can ask anything — drill plans, game strategy, or help interpreting your stats." },
];

const HelpModal = ({onClose}) => {
  const isMobile = useIsMobile();
  const [tab, setTab]         = useState("faq");
  const [openFaq, setOpenFaq] = useState(null);
  const [feedback, setFeedback]     = useState("");
  const [feedType, setFeedType]     = useState("bug");
  const [feedSent, setFeedSent]     = useState(false);
  const TABS = [
    {id:"faq",      label:"❓ FAQs"},
    {id:"feedback", label:"💬 Feedback"},
    {id:"contact",  label:"✉️ Contact"},
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.75)",backdropFilter:"blur(8px)",
      zIndex:400,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?0:16}}>
      <div style={{background:C.cardBg,borderRadius:isMobile?"16px 16px 0 0":"20px",width:"100%",maxWidth:620,
        height:"80vh",display:"flex",flexDirection:"column",
        boxShadow:"0 24px 80px rgba(0,0,0,0.25)"}}>

        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,
          borderRadius:"20px 20px 0 0",padding:"20px 26px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:26,color:"white",letterSpacing:"0.05em"}}>Help & Support</div>
              <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>FAQs · Send feedback · Contact support</div>
            </div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",
              borderRadius:8,width:34,height:34,fontSize:18,color:"white",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* Tab switcher */}
          <div style={{display:"flex",gap:4,marginTop:16}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                background:tab===t.id?"rgba(255,255,255,0.15)":"transparent",
                border:`1px solid ${tab===t.id?"rgba(255,255,255,0.3)":"transparent"}`,
                borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:600,
                color:tab===t.id?"white":"#94A3B8",cursor:"pointer",
                fontFamily:"'Outfit'",transition:"all 0.15s"}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── FAQ Tab ── */}
        {tab==="faq"&&(
          <div style={{flex:1,overflowY:"auto",padding:"20px 26px"}}>
            <p style={{fontSize:13,color:C.textMid,marginBottom:18}}>
              Common questions about PickleIntel features and metrics.
            </p>
            {FAQS.map((f,i)=>(
              <div key={i} style={{borderBottom:`1px solid ${C.border}`,marginBottom:0}}>
                <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{
                  width:"100%",background:"none",border:"none",cursor:"pointer",
                  padding:"14px 0",display:"flex",justifyContent:"space-between",
                  alignItems:"center",gap:12,textAlign:"left",fontFamily:"'Outfit'"}}>
                  <span style={{fontSize:13,fontWeight:600,color:C.text,lineHeight:1.4}}>{f.q}</span>
                  <span style={{fontSize:16,color:openFaq===i?C.pickle:C.textLight,
                    flexShrink:0,transition:"transform 0.2s",
                    display:"inline-block",transform:openFaq===i?"rotate(45deg)":"rotate(0deg)"}}>+</span>
                </button>
                {openFaq===i&&(
                  <div style={{fontSize:13,color:C.textMid,lineHeight:1.65,
                    paddingBottom:14,paddingRight:24}}>{f.a}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Feedback Tab ── */}
        {tab==="feedback"&&(
          <div style={{flex:1,overflowY:"auto",padding:"24px 26px"}}>
            {feedSent ? (
              <div style={{textAlign:"center",padding:"48px 16px"}}>
                <div style={{fontSize:40,marginBottom:12}}>🎉</div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:C.navy,letterSpacing:"0.05em",marginBottom:8}}>
                  Thanks for the feedback!
                </div>
                <div style={{fontSize:13,color:C.textMid,marginBottom:24}}>
                  We read everything and use it to make PickleIntel better.
                </div>
                <button onClick={()=>{setFeedSent(false);setFeedback("");}} style={{
                  background:C.navy,border:"none",borderRadius:10,padding:"10px 24px",
                  fontFamily:"'Outfit'",fontWeight:700,fontSize:13,color:C.pickle,cursor:"pointer"}}>
                  Send more feedback
                </button>
              </div>
            ) : (
              <>
                <p style={{fontSize:13,color:C.textMid,marginBottom:20}}>
                  Tell us what's working, what's broken, or what you'd love to see next.
                </p>
                {/* Type selector */}
                <div style={{marginBottom:18}}>
                  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
                    letterSpacing:"0.07em",fontWeight:600,marginBottom:8}}>Type</div>
                  <div style={{display:"flex",gap:8}}>
                    {[
                      {id:"bug",     label:"🐛 Bug Report"},
                      {id:"feature", label:"💡 Feature Idea"},
                      {id:"general", label:"👋 General"},
                    ].map(t=>(
                      <button key={t.id} onClick={()=>setFeedType(t.id)} style={{
                        background:feedType===t.id?C.navy:C.pageBg,
                        border:`1.5px solid ${feedType===t.id?C.navy:C.border}`,
                        borderRadius:9,padding:"8px 14px",fontSize:12,fontWeight:600,
                        color:feedType===t.id?C.pickle:C.textMid,
                        cursor:"pointer",fontFamily:"'Outfit'",transition:"all 0.15s"}}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Message */}
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
                    letterSpacing:"0.07em",fontWeight:600,marginBottom:8}}>Message</div>
                  <textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                    placeholder={
                      feedType==="bug"    ? "Describe what happened and how to reproduce it..." :
                      feedType==="feature"? "What would you like to see, and why would it help?" :
                                           "Share anything on your mind..."
                    }
                    rows={6} style={{width:"100%",background:C.pageBg,
                      border:`1.5px solid ${C.border}`,borderRadius:10,
                      padding:"12px 14px",color:C.text,fontSize:13,
                      fontFamily:"'Outfit'",resize:"vertical",boxSizing:"border-box"}}/>
                </div>
                <button onClick={()=>{if(feedback.trim()) setFeedSent(true);}}
                  disabled={!feedback.trim()}
                  style={{width:"100%",background:feedback.trim()?C.navy:C.border,
                    border:"none",borderRadius:12,padding:"13px",
                    fontFamily:"'Outfit'",fontWeight:700,fontSize:14,
                    color:feedback.trim()?C.pickle:C.textLight,
                    cursor:feedback.trim()?"pointer":"not-allowed",transition:"all 0.2s"}}>
                  Send Feedback →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Contact Tab ── */}
        {tab==="contact"&&(
          <div style={{flex:1,overflowY:"auto",padding:"28px 26px",display:"flex",flexDirection:"column",gap:16}}>
            <p style={{fontSize:13,color:C.textMid,margin:0}}>
              Can't find what you need in the FAQs? Reach out and we'll get back to you within one business day.
            </p>
            {/* Email card */}
            <div style={{background:C.pageBg,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 22px",
              display:"flex",justifyContent:"space-between",alignItems:"center",gap:16}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>Email Support</div>
                <div style={{fontSize:13,color:C.blue}}>support@pickleintel.app</div>
                <div style={{fontSize:11,color:C.textLight,marginTop:4}}>Response within 1 business day</div>
              </div>
              <a href="mailto:support@pickleintel.app" style={{
                background:C.navy,border:"none",borderRadius:10,padding:"10px 18px",
                fontFamily:"'Outfit'",fontWeight:700,fontSize:13,color:C.pickle,
                cursor:"pointer",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>
                Send Email →
              </a>
            </div>
            {/* Tip: try FAQs first */}
            <div style={{background:`${C.pickle}12`,border:`1px solid ${C.pickle}30`,
              borderRadius:12,padding:"14px 16px",display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>💡</span>
              <div style={{fontSize:12,color:C.textMid,lineHeight:1.6}}>
                Before reaching out, check the <button onClick={()=>setTab("faq")} style={{
                  background:"none",border:"none",color:C.blue,fontWeight:700,fontSize:12,
                  cursor:"pointer",padding:0,fontFamily:"'Outfit'"}}>FAQs tab</button> — most common questions are answered there instantly.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── ROOT ──────────────────────────────────────────────────────────────────────

// ── Login / Signup Screen ─────────────────────────────────────────────────────
function LoginScreen({ onAuth }) {
  const [mode, setMode]       = useState("login"); // "login" | "signup" | "reset"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const submit = async () => {
    setError(""); setSuccess("");
    if (!email.trim() || (!password && mode !== "reset")) { setError("Please fill in all fields."); return; }
    if (mode === "signup" && password !== confirm) { setError("Passwords don't match."); return; }
    if (password && password.length < 6 && mode !== "reset") { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        const data = await sb.signIn(email.trim(), password);
        onAuth(data);
      } else if (mode === "signup") {
        const data = await sb.signUp(email.trim(), password);
        // Supabase may require email confirmation depending on settings
        if (data.access_token) {
          onAuth(data);
        } else {
          setSuccess("Account created! Check your email to confirm your account, then log in.");
          setMode("login");
        }
      } else if (mode === "reset") {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
          method: "POST",
          headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (res.ok) setSuccess("Password reset email sent! Check your inbox.");
        else setError("Couldn't send reset email. Check the address and try again.");
        setMode("login");
      }
    } catch(e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const inputStyle = {
    width:"100%", background:"#F4F7F4", border:`1px solid #E5E9F0`,
    borderRadius:12, padding:"13px 16px", color:"#111827", fontSize:15,
    fontFamily:"'Outfit'", boxSizing:"border-box", outline:"none",
  };

  return (
    <div style={{minHeight:"100vh", background:`linear-gradient(135deg, #0A1628 0%, #162440 60%, #0A1628 100%)`,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:20, fontFamily:"'Outfit', sans-serif"}}>

      {/* Logo */}
      <div style={{marginBottom:40, textAlign:"center"}}>
        <div style={{fontFamily:"'Bebas Neue'", fontSize:48, letterSpacing:"0.08em", lineHeight:1}}>
          <span style={{color:"white"}}>PICKLE</span>
          <span style={{color:C.pickle}}>INTEL</span>
        </div>
        <div style={{color:"#64748B", fontSize:14, marginTop:6, letterSpacing:"0.04em"}}>
          Patient · NVZ-first · data-driven
        </div>
      </div>

      {/* Card */}
      <div style={{background:"white", borderRadius:24, padding:"36px 32px", width:"100%",
        maxWidth:420, boxShadow:"0 24px 60px rgba(0,0,0,0.4)"}}>

        {/* Tab switcher */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:4,
          background:"#F4F7F4", borderRadius:12, padding:4, marginBottom:28}}>
          {[["login","Log In"],["signup","Sign Up"]].map(([m,lbl])=>(
            <button key={m} onClick={()=>{setMode(m);setError("");setSuccess("");}}
              style={{padding:"10px", borderRadius:9, border:"none", cursor:"pointer",
                fontFamily:"'Outfit'", fontWeight:700, fontSize:14, transition:"all 0.15s",
                background:mode===m?"white":"transparent",
                color:mode===m?C.navy:"#9CA3AF",
                boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.12)":"none"}}>{lbl}</button>
          ))}
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          {/* Email */}
          <div>
            <label style={{fontSize:12, fontWeight:600, color:"#6B7280",
              textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6}}>
              Email
            </label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@example.com" style={inputStyle}
              onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>

          {/* Password */}
          {mode !== "reset" && (
            <div>
              <label style={{fontSize:12, fontWeight:600, color:"#6B7280",
                textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6}}>
                Password
              </label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                placeholder={mode==="signup"?"At least 6 characters":"••••••••"} style={inputStyle}
                onKeyDown={e=>e.key==="Enter"&&submit()}/>
            </div>
          )}

          {/* Confirm password for signup */}
          {mode === "signup" && (
            <div>
              <label style={{fontSize:12, fontWeight:600, color:"#6B7280",
                textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:6}}>
                Confirm Password
              </label>
              <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                placeholder="Re-enter password" style={inputStyle}
                onKeyDown={e=>e.key==="Enter"&&submit()}/>
            </div>
          )}

          {/* Error / success */}
          {error && (
            <div style={{background:"#FEF0F3", border:"1px solid #F05A7A40", borderRadius:10,
              padding:"10px 14px", fontSize:13, color:"#F05A7A"}}>{error}</div>
          )}
          {success && (
            <div style={{background:"#E8FAF5", border:"1px solid #2DD4A040", borderRadius:10,
              padding:"10px 14px", fontSize:13, color:"#2DD4A0"}}>{success}</div>
          )}

          {/* Submit */}
          <button onClick={submit} disabled={loading} style={{
            width:"100%", background:loading?"#E5E9F0":C.pickle, border:"none", borderRadius:12,
            padding:"14px", fontFamily:"'Outfit'", fontWeight:700, fontSize:16,
            color:C.navy, cursor:loading?"not-allowed":"pointer", marginTop:4,
            transition:"all 0.15s"}}>
            {loading ? "Please wait…" : mode==="login" ? "Log In" : mode==="signup" ? "Create Account" : "Send Reset Email"}
          </button>

          {/* Forgot password */}
          {mode === "login" && (
            <button onClick={()=>{setMode("reset");setError("");setSuccess("");}}
              style={{background:"none", border:"none", color:"#9CA3AF", fontSize:13,
                cursor:"pointer", fontFamily:"'Outfit'", textAlign:"center", padding:0}}>
              Forgot your password?
            </button>
          )}

          {mode === "reset" && (
            <button onClick={()=>{setMode("login");setError("");}}
              style={{background:"none", border:"none", color:"#9CA3AF", fontSize:13,
                cursor:"pointer", fontFamily:"'Outfit'", textAlign:"center", padding:0}}>
              ← Back to log in
            </button>
          )}
        </div>
      </div>

      <div style={{color:"#334155", fontSize:12, marginTop:24, textAlign:"center", lineHeight:1.8}}>
        By signing up you agree to our Terms of Service<br/>
        Your data is private and never shared
      </div>
    </div>
  );
}

export default function App(){
  const [page,setPage]         = useState("dashboard");
  const [showHelp,setShowHelp] = useState(false);
  const [authUser, setAuthUser] = useState(null);   // null = not logged in
  const [authLoading, setAuthLoading] = useState(true); // checking stored session

  // On mount: try to restore session from localStorage
  useEffect(()=>{
    (async()=>{
      try {
        const token   = localStorage.getItem("pi_token");
        const refresh = localStorage.getItem("pi_refresh");
        if (token) {
          _authToken = token;
          // Verify token is still valid
          const user = await sb.getUser();
          if (user?.id) { setAuthUser(user); }
          else if (refresh) {
            // Try refreshing
            const data = await sb.refreshSession(refresh);
            const refreshedUser = await sb.getUser();
            if (refreshedUser?.id) setAuthUser(refreshedUser);
          }
        }
      } catch(e) {
        sb.signOut(); // clear bad tokens
      }
      setAuthLoading(false);
    })();
  },[]);

  const handleAuth = (data) => {
    // Called after successful login or signup
    sb.getUser().then(user => { if(user?.id) setAuthUser(user); });
  };

  const handleSignOut = () => {
    sb.signOut();
    setAuthUser(null);
    setPage("dashboard");
  };

  // Loading state while checking session
  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#0A1628",display:"flex",
      alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:42,letterSpacing:"0.08em"}}>
        <span style={{color:"white"}}>PICKLE</span>
        <span style={{color:C.pickle}}>INTEL</span>
      </div>
      <div style={{color:"#64748B",fontSize:14}}>Loading…</div>
    </div>
  );

  // Not logged in — show login screen
  if (!authUser) return (
    <>
      <style>{STYLES}</style>
      <LoginScreen onAuth={handleAuth}/>
    </>
  );

  // Logged in — show the full app
  return(
    <>
      <style>{STYLES}</style>
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
      <div style={{minHeight:"100vh",background:C.pageBg,display:"flex",flexDirection:"column",overflowX:"hidden",width:"100%"}}>
        <TopNav page={page} setPage={setPage} onSignOut={handleSignOut} authUser={authUser}/>
        <main style={{flex:1}}>
          {page==="dashboard"&&<Dashboard setPage={setPage}/>}
          {page==="shots"    &&<Shots/>}
          {page==="matches"  &&<MatchCenter defaultTab="log"/>}
          {page==="matches:partners"&&<MatchCenter defaultTab="partners"/>}
          {page==="coach"    &&<Coach/>}
          {page==="profile"  &&<Profile setPage={setPage}/>}
        </main>
        {/* ── Global Footer ── */}
        <footer style={{background:C.navy,borderTop:`1px solid rgba(255,255,255,0.06)`,
          padding:"14px 20px",display:"flex",flexWrap:"wrap",justifyContent:"space-between",
          alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:0,lineHeight:1}}>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:"0.06em",color:"white"}}>PICKLE</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:"0.06em",color:C.pickle}}>INTEL</span>
            <span style={{fontSize:11,color:"#475569",marginLeft:8}}>© 2026</span>
          </div>
          <button onClick={()=>setShowHelp(true)} style={{
            display:"flex",alignItems:"center",gap:8,
            background:"rgba(255,255,255,0.06)",
            border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:10,padding:"8px 16px",cursor:"pointer",
            fontFamily:"'Outfit'",transition:"all 0.15s"}}>
            <span style={{fontSize:14}}>❓</span>
            <span style={{fontSize:13,fontWeight:600,color:"white"}}>Help & Support</span>
          </button>
          <div style={{display:"flex",gap:16}}>
            {["Privacy","Terms","Contact"].map(l=>(
              <span key={l} style={{fontSize:11,color:"#475569",cursor:"pointer"}}>{l}</span>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
