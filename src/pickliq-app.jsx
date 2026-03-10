import { useState, useRef, useEffect } from "react";

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
`;

// ── SHOT DATA: wins = points won (you finished the rally); misses = points lost (you finished the rally unsuccessfully) ──
// Both tracked as raw counts (not %). winHistory/missHistory = 4-week weekly counts.
const SHOT_CATS = [
  { id:"4th",     label:"4th Shot",   color:C.blue,   icon:"🎯", shots:[
    { name:"4th Shot Backhand", attempts:28, misses:8,  wins:20, missHistory:[33, 32, 30, 29], winHistory:[67, 68, 70, 71], tip:"Stay low through contact, push don't flick" },
    { name:"4th Shot Forehand", attempts:34, misses:7,  wins:27, missHistory:[26, 25, 23, 22], winHistory:[75, 76, 77, 78], tip:"Most reliable — keep building on this" }]},
  { id:"counter", label:"Counter",    color:C.purple, icon:"⚡", shots:[
    { name:"Counter BH", attempts:18, misses:10, wins:8, missHistory:[54, 55, 56, 56], winHistory:[46, 45, 44, 44], tip:"Too much arm — add body rotation" },
    { name:"Counter FH", attempts:22, misses:9,  wins:13, missHistory:[48, 46, 43, 41], winHistory:[52, 54, 57, 59], tip:"Improving — keep paddle up early" }]},
  { id:"dink",    label:"Dink",       color:C.mint,   icon:"🏓", shots:[
    { name:"Dink BH", attempts:48, misses:8,  wins:40, missHistory:[21, 20, 18, 17], winHistory:[79, 80, 82, 83], tip:"Elite rate — maintain NVZ patience" },
    { name:"Dink FH", attempts:52, misses:7,  wins:45, missHistory:[16, 15, 14, 13], winHistory:[84, 85, 86, 87], tip:"Your best shot. Use it to set up attacks" }]},
  { id:"drive",   label:"Drive",      color:C.amber,  icon:"💥", shots:[
    { name:"Drive BH", attempts:22, misses:10, wins:12, missHistory:[44, 45, 45, 46], winHistory:[56, 55, 55, 54], tip:"High error rate — only drive when opponent is out of position" },
    { name:"Drive FH", attempts:31, misses:12, wins:19, missHistory:[37, 38, 38, 38], winHistory:[63, 62, 62, 62], tip:"Down-the-line drives going wide — aim 2ft inside the line" }]},
  { id:"drop",    label:"Drop",       color:C.blue,   icon:"🌊", shots:[
    { name:"Drop BH", attempts:24, misses:9,  wins:15, missHistory:[44, 42, 39, 37], winHistory:[56, 58, 61, 63], tip:"Big improvement! Land in the first 3ft past the NVZ line" },
    { name:"Drop FH", attempts:31, misses:8,  wins:23, missHistory:[32, 30, 28, 26], winHistory:[68, 70, 72, 74], tip:"3rd shot drop becoming a real weapon" }]},
  { id:"lob",     label:"Lob",        color:C.purple, icon:"🌙", shots:[
    { name:"Lob BH", attempts:12, misses:7,  wins:5, missHistory:[54, 56, 57, 58], winHistory:[46, 44, 43, 42], tip:"Low %. Use only when opponents crowd the NVZ" },
    { name:"Lob FH", attempts:14, misses:7,  wins:7, missHistory:[48, 49, 50, 50], winHistory:[52, 51, 50, 50], tip:"Marginal improvement — be selective" }]},
  { id:"reset",   label:"Reset",      color:C.mint,   icon:"🔄", shots:[
    { name:"Reset BH", attempts:19, misses:8,  wins:11, missHistory:[46, 45, 43, 42], winHistory:[54, 55, 57, 58], tip:"Priority drill: reset BH from mid-court pressure" },
    { name:"Reset FH", attempts:16, misses:5,  wins:11, missHistory:[37, 35, 33, 31], winHistory:[63, 65, 67, 69], tip:"Soft hands developing — good progress" }]},
  { id:"scramble",label:"Scramble",   color:C.rose,   icon:"🏃", shots:[
    { name:"Scramble BH", attempts:11, misses:7,  wins:4, missHistory:[63, 64, 64, 64], winHistory:[37, 36, 36, 36], tip:"Prioritize getting ball back over winning the point" }]},
  { id:"serve",   label:"Serve",      color:C.amber,  icon:"🎾", shots:[
    { name:"Serve",     attempts:42, misses:5,  wins:37, missHistory:[13, 13, 12, 12], winHistory:[87, 87, 88, 88], tip:"Solid. Target deep to backhand corner more" }]},
  { id:"return",  label:"Return",     color:C.mint,   icon:"↩️", shots:[
    { name:"Return BH", attempts:38, misses:10, wins:28, missHistory:[24, 24, 25, 26], winHistory:[76, 76, 75, 74], tip:"Return quality dropping — get deeper, aim for feet" },
    { name:"Return FH", attempts:44, misses:8,  wins:36, missHistory:[20, 20, 19, 19], winHistory:[80, 80, 81, 81], tip:"Good rate. Depth is priority over power" }]},
  { id:"erne",    label:"Erne",       color:C.rose,   icon:"🌪️", shots:[
    { name:"Erne BH",   attempts:6,  misses:4,  wins:2,  missHistory:[67, 67, 68, 67], winHistory:[33, 33, 32, 33], tip:"Low attempts but high reward — drill the jump timing off the kitchen corner" },
    { name:"Erne FH",   attempts:9,  misses:4,  wins:5,  missHistory:[46, 45, 44, 44], winHistory:[54, 55, 56, 56], tip:"Your better side. Disguise the approach or opponent will lob" }]},
  { id:"atp",     label:"ATP",        color:C.blue,   icon:"🔄", shots:[
    { name:"ATP BH",    attempts:4,  misses:3,  wins:1,  missHistory:[75, 75, 75, 75], winHistory:[25, 25, 25, 25], tip:"High-risk, high-reward. Only attempt when ball is clearly beyond the post" },
    { name:"ATP FH",    attempts:5,  misses:2,  wins:3,  missHistory:[50, 50, 40, 40], winHistory:[50, 50, 60, 60], tip:"Better trend — commit fully or the ball clips the net" }]},
  { id:"slam",    label:"Slam",       color:C.rose,   icon:"🔥", shots:[
    { name:"Slam BH", attempts:8,  misses:5,  wins:3, missHistory:[60, 61, 62, 62], winHistory:[40, 39, 38, 38], tip:"Very low %. Only attempt above shoulder height" },
    { name:"Slam FH", attempts:13, misses:6,  wins:7, missHistory:[50, 49, 47, 46], winHistory:[50, 51, 53, 54], tip:"Improving — weight forward at contact" }]},
  { id:"speedup", label:"Speed Up",   color:C.blue,   icon:"⚡", shots:[
    { name:"Speed Up BH", attempts:14, misses:8,  wins:6, missHistory:[54, 55, 56, 57], winHistory:[46, 45, 44, 43], tip:"Only speed up when you'd win 70%+ — Ben Johns principle" },
    { name:"Speed Up FH", attempts:18, misses:8,  wins:10, missHistory:[46, 45, 45, 44], winHistory:[54, 55, 55, 56], tip:"Better timing — still pick spots carefully" }]},
  { id:"volley",  label:"Volley",     color:C.purple, icon:"🏐", shots:[
    { name:"Volley BH", attempts:26, misses:9,  wins:17, missHistory:[40, 38, 37, 35], winHistory:[60, 62, 63, 65], tip:"Good trend. Compact swing — block don't swing" },
    { name:"Volley FH", attempts:29, misses:8,  wins:21, missHistory:[31, 30, 29, 28], winHistory:[69, 70, 71, 72], tip:"Work on volley-to-dink transitions" }]},
];

// ── SHARED GOALS STATE (module-level so Profile edits flow to all pages) ─────
// In production this lives in a database. For the prototype we use a simple
// module-level object that Profile writes to and KPICards read from.
const GOALS = {
  targets: { winRate:65, errors:8, serveNeut:70, nvzArrival:80, nvzWin:65 },
  priorityShots: [
    { name:"Drive BH",   targetMisses:6,  color:C.blue   },
    { name:"Counter BH", targetMisses:5,  color:C.rose   },
    { name:"Lob BH",     targetMisses:4,  color:C.purple },
  ],
};

// ── CORE 5 METRICS (shown on every page in this order) ──────────────────────
// Serve Neutralization Rate = % of serves/returns where opponent cannot hit an offensive shot
// trend = change over last 4 weeks (positive = improving, negative = declining)
const CORE_KPIS = [
  { id:"winRate",   label:"Win Rate",             value:"64%", numVal:64,  get target(){return GOALS.targets.winRate},   unit:"%", higherIsBetter:true,  trend:+3,  trendLabel:"vs last 4 wks", color:C.pickle, colorL:"#F5FAE8" },
  { id:"errors",    label:"Errors / Match",        value:"10.3",numVal:10.3,get target(){return GOALS.targets.errors},    unit:"",  higherIsBetter:false, trend:-1.2,trendLabel:"vs last 4 wks", color:C.rose,   colorL:C.roseL },
  { id:"serveNeut", label:"Serve Neutralization",  value:"57%", numVal:57,  get target(){return GOALS.targets.serveNeut}, unit:"%", higherIsBetter:true,  trend:+2,  trendLabel:"vs last 4 wks", color:C.amber,  colorL:C.amberL },
  { id:"nvzArrival",label:"NVZ Arrival",           value:"68%", numVal:68,  get target(){return GOALS.targets.nvzArrival},unit:"%", higherIsBetter:true,  trend:+4,  trendLabel:"vs last 4 wks", color:C.mint,   colorL:C.mintL },
  { id:"nvzWin",    label:"NVZ Win Rate",          value:"55%", numVal:55,  get target(){return GOALS.targets.nvzWin},    unit:"%", higherIsBetter:true,  trend:+1,  trendLabel:"vs last 4 wks", color:C.blue,   colorL:C.blueL },
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
  { id:"serve", label:"Serve", pct:42, color:C.amber },
];

const MATCHES = [
  { id:1,date:"Mar 3", opponent:"Jake & Maria", partner:"Sam R.",   result:"W",score:"11-7, 11-9",      duration:"42m",stats:{nvzArrival:74,nvzWin:61,serveNeut:60,errors:8, dink:52,drive:38,lob:6,smash:4,rally:6.2},shotSplit:[{label:"Dink",myPct:44,partnerPct:56,totalPct:52,color:C.mint},{label:"Drive",myPct:68,partnerPct:32,totalPct:38,color:C.blue},{label:"Lob",myPct:55,partnerPct:45,totalPct:6,color:C.purple},{label:"Slam",myPct:70,partnerPct:30,totalPct:4,color:C.rose}]},
  { id:2,date:"Feb 28",opponent:"Chris & Dana", partner:"Sam R.",   result:"L",score:"9-11, 11-8, 8-11",duration:"68m",stats:{nvzArrival:58,nvzWin:44,serveNeut:47,errors:14,dink:40,drive:44,lob:9,smash:7,rally:8.1},shotSplit:[{label:"Dink",myPct:40,partnerPct:60,totalPct:40,color:C.mint},{label:"Drive",myPct:72,partnerPct:28,totalPct:44,color:C.blue},{label:"Lob",myPct:50,partnerPct:50,totalPct:9,color:C.purple},{label:"Slam",myPct:65,partnerPct:35,totalPct:7,color:C.rose}]},
  { id:3,date:"Feb 22",opponent:"Alex & Jordan",partner:"Sam R.",   result:"W",score:"11-4, 11-6",      duration:"31m",stats:{nvzArrival:81,nvzWin:68,serveNeut:72,errors:5, dink:61,drive:29,lob:5,smash:5,rally:5.4},shotSplit:[{label:"Dink",myPct:38,partnerPct:62,totalPct:61,color:C.mint},{label:"Drive",myPct:66,partnerPct:34,totalPct:29,color:C.blue},{label:"Lob",myPct:60,partnerPct:40,totalPct:5,color:C.purple},{label:"Slam",myPct:72,partnerPct:28,totalPct:5,color:C.rose}]},
  { id:4,date:"Feb 15",opponent:"Pat & Quinn",  partner:"Taylor M.",result:"W",score:"11-8, 9-11, 11-6",duration:"55m",stats:{nvzArrival:70,nvzWin:58,serveNeut:62,errors:9, dink:55,drive:33,lob:7,smash:5,rally:7.1},shotSplit:[{label:"Dink",myPct:52,partnerPct:48,totalPct:55,color:C.mint},{label:"Drive",myPct:56,partnerPct:44,totalPct:33,color:C.blue},{label:"Lob",myPct:58,partnerPct:42,totalPct:7,color:C.purple},{label:"Slam",myPct:62,partnerPct:38,totalPct:5,color:C.rose}]},
];


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

const PARTNERS = [
  { name:"Sam R.",   matches:8, wins:6, role:"Resetter", nvz:72, nvzWin:68, errors:8.5,
    synergy:calcSynergy({nvzJoint:72, nvzWinRate:68, roleClarity:0.9, combinedErrors:8.5,  duprAdjWinRate:0.75}),
    matchHistory:[
      { date:"Mar 1",  opponent:"Chris & Dana",  result:"W", score:"11-7, 11-5"       },
      { date:"Feb 22", opponent:"Jake & Maria",   result:"W", score:"11-8, 9-11, 11-6" },
      { date:"Feb 15", opponent:"Pat & Quinn",    result:"W", score:"11-4, 11-6"       },
      { date:"Feb 8",  opponent:"Alex & Jordan",  result:"L", score:"8-11, 7-11"       },
      { date:"Jan 30", opponent:"Chris & Dana",   result:"W", score:"11-9, 11-7"       },
      { date:"Jan 22", opponent:"Jake & Maria",   result:"W", score:"11-6, 11-8"       },
      { date:"Jan 14", opponent:"Pat & Quinn",    result:"L", score:"9-11, 11-8, 8-11" },
      { date:"Jan 5",  opponent:"Alex & Jordan",  result:"W", score:"11-7, 11-9"       },
    ],
    // shotSplit: { shotType, totalPct (% of all team shots), myPct (Alex's share), partnerPct (Sam's share) }
    // Sam resets/dinks heavily; Alex drives — clear role split
    shotSplit:[
      { id:"dink",   label:"Dink",      totalPct:38, myPct:42, partnerPct:58, color:C.mint   },
      { id:"drive",  label:"Drive",     totalPct:24, myPct:71, partnerPct:29, color:C.blue   },
      { id:"drop",   label:"3rd Drop",  totalPct:16, myPct:38, partnerPct:62, color:C.amber  },
      { id:"reset",  label:"Reset",     totalPct:12, myPct:28, partnerPct:72, color:C.purple },
      { id:"serve",  label:"Serve",     totalPct:6,  myPct:50, partnerPct:50, color:C.pickle },
      { id:"smash",  label:"Slam",      totalPct:4,  myPct:75, partnerPct:25, color:C.rose   },
    ]},
  { name:"Taylor M.",matches:4, wins:2, role:"Driver",   nvz:61, nvzWin:48, errors:11.2,
    synergy:calcSynergy({nvzJoint:61, nvzWinRate:48, roleClarity:0.4, combinedErrors:11.2, duprAdjWinRate:0.5}),
    matchHistory:[
      { date:"Feb 28", opponent:"Pat & Quinn",   result:"W", score:"11-8, 11-9"  },
      { date:"Feb 10", opponent:"Jake & Maria",  result:"L", score:"7-11, 5-11"  },
      { date:"Jan 25", opponent:"Chris & Dana",  result:"L", score:"9-11, 8-11"  },
      { date:"Jan 12", opponent:"Alex & Jordan", result:"W", score:"11-9, 11-7"  },
    ],
    // Both drive — less role clarity, both attacking
    shotSplit:[
      { id:"dink",   label:"Dink",      totalPct:22, myPct:52, partnerPct:48, color:C.mint   },
      { id:"drive",  label:"Drive",     totalPct:38, myPct:54, partnerPct:46, color:C.blue   },
      { id:"drop",   label:"3rd Drop",  totalPct:14, myPct:48, partnerPct:52, color:C.amber  },
      { id:"reset",  label:"Reset",     totalPct:8,  myPct:55, partnerPct:45, color:C.purple },
      { id:"serve",  label:"Serve",     totalPct:10, myPct:50, partnerPct:50, color:C.pickle },
      { id:"smash",  label:"Slam",      totalPct:8,  myPct:58, partnerPct:42, color:C.rose   },
    ]},
  { name:"Jordan K.",matches:2, wins:1, role:"Balanced", nvz:68, nvzWin:59, errors:9.8,
    synergy:calcSynergy({nvzJoint:68, nvzWinRate:59, roleClarity:0.7, combinedErrors:9.8,  duprAdjWinRate:0.5}),
    matchHistory:[
      { date:"Mar 5",  opponent:"Chris & Dana",  result:"W", score:"11-6, 11-8"  },
      { date:"Feb 18", opponent:"Jake & Maria",  result:"L", score:"10-11, 9-11" },
    ],
    // Balanced — relatively even split with slight Alex drive tendency
    shotSplit:[
      { id:"dink",   label:"Dink",      totalPct:32, myPct:46, partnerPct:54, color:C.mint   },
      { id:"drive",  label:"Drive",     totalPct:28, myPct:62, partnerPct:38, color:C.blue   },
      { id:"drop",   label:"3rd Drop",  totalPct:18, myPct:44, partnerPct:56, color:C.amber  },
      { id:"reset",  label:"Reset",     totalPct:10, myPct:40, partnerPct:60, color:C.purple },
      { id:"serve",  label:"Serve",     totalPct:7,  myPct:50, partnerPct:50, color:C.pickle },
      { id:"smash",  label:"Slam",      totalPct:5,  myPct:68, partnerPct:32, color:C.rose   },
    ]},
];

// ── COMMUNITY PLAYER POOL (mock — in production, pulled from app users) ────────
// Compatibility score logic:
//  - Role complement: Driver pairs best with Resetter/Balanced, Attacker with Resetter
//  - NVZ coverage: suggest someone whose NVZ win rate shores up your weakness
//  - DUPR proximity: within 0.3 of your rating
//  - Errors: combined errors should trend toward ≤10/match

const COACH_SYS = `You are PICKL — an elite AI pickleball coach embedded in the PickleIQ app. Your coaching philosophy:
PATIENCE & CONTROL: Prioritize high-percentage shots. Earn the right to attack — never force pace from a weak position. Reset when in doubt.
NVZ DOMINANCE: The kitchen is where points are won. Push players to arrive at the NVZ together, maintain pressure with precise dinking, and only speed up when the ball is above net height.
FUNDAMENTALS FIRST: Drill the boring stuff relentlessly. Footwork, paddle prep, and consistent 3rd shot drops beat flashy shot-making at every level.
TACTICAL SEQUENCING: Think in patterns, not individual shots. Serve → return → transition → NVZ is the core sequence. Break it deliberately, not by accident.
Player: Alex Chen | DUPR 4.08 | Goals: NVZ 78%, errors <8/match
Stats: Win 64%, Errors 10.3/match, Serve Neut 57% (target 70%), NVZ Arrival 68% (target 80%), NVZ Win 55% (target 65%)
Be specific, direct, reference the player's actual stats, and give concrete drill prescriptions. Keep responses to 4-5 focused points.`;

// ── COMPONENTS ───────────────────────────────────────────────────────────────
const Logo = () => {
  // Q geometry — ring center (cx,cy), radius, stroke width
  const cx=12, cy=13, R=8, sw=2;
  // Inner edge of ring = R - sw/2 = 9. Holes sit at radius ~5 from center (well inside)
  const holes = [[cx,cy],[cx-3.2,cy-3.2],[cx+3.2,cy-3.2],[cx-3.2,cy+3.2],[cx+3.2,cy+3.2]];
  return(
    <div style={{display:"flex",alignItems:"center",gap:0,lineHeight:1}}>
      <span style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:"0.06em",color:"white",fontStretch:"condensed"}}>PICKLE</span>
      {/* I — slightly narrower by tightening letter-spacing */}
      <span style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:"0em",color:C.pickle}}>I</span>
      {/* Q — extra canvas so tail isn't clipped */}
      <svg width="22" height="26" viewBox="0 0 24 28" style={{display:"block",marginTop:1}}>
        {/* Q ring — thin stroke so holes are clearly separate */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.pickle} strokeWidth={sw}/>
        {/* Navy halo behind each hole — creates visual gap from ring */}
        {holes.map(([x,y],i)=>(
          <circle key={`h${i}`} cx={x} cy={y} r="2" fill={C.navy}/>
        ))}
        {/* Lime holes */}
        {holes.map(([x,y],i)=>(
          <circle key={`d${i}`} cx={x} cy={y} r="1.2" fill={C.pickle}/>
        ))}
        {/* Q tail */}
        <line x1={cx+5.5} y1={cy+5.5} x2={cx+9} y2={cy+11} stroke={C.pickle} strokeWidth="2" strokeLinecap="round"/>
      </svg>
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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
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
  {id:"dashboard",label:"Dashboard"},{id:"shots",label:"Shots"},
  {id:"matches",label:"Matches"},
  {id:"coach",label:"Coach"},
  {id:"profile",label:"Profile"},
];

const TopNav=({page,setPage})=>(
  <div style={{background:C.navy,position:"sticky",top:0,zIndex:100,
    boxShadow:"0 2px 12px rgba(0,0,0,0.15)"}}>
    <div style={{maxWidth:1200,margin:"0 auto",padding:"0 32px",
      display:"flex",alignItems:"center",height:62,gap:0}}>
      <Logo/>
      <div style={{display:"flex",alignItems:"center",marginLeft:36,gap:2,flex:1}}>
        {NAV.map(n=>{
          const a=page===n.id;
          return(
            <button key={n.id} className="nav-btn" onClick={()=>setPage(n.id)} style={{
              background:a?C.pickle:"transparent",padding:"7px 15px",borderRadius:8,
              fontSize:13,fontWeight:a?700:500,color:a?C.navy:"#94A3B8",letterSpacing:"0.01em"
            }}>{n.label}</button>
          );
        })}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{background:C.navyMid,borderRadius:10,padding:"6px 14px",
          display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.07em"}}>DUPR</span>
          <span style={{fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,color:C.pickle}}>4.08</span>
          <span style={{fontSize:11,color:C.mint}}>▲ +0.12</span>
        </div>
        <div style={{width:36,height:36,borderRadius:"50%",
          background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontFamily:"'Bebas Neue'",fontSize:15,color:C.navy,fontWeight:700}}>AC</div>
      </div>
    </div>
  </div>
);

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
const Dashboard=({setPage})=>{
  // Dashboard always shows all 5 core metrics — no customization needed
  const m=MATCHES[0];
  const allShots=SHOT_CATS.flatMap(c=>c.shots.map(s=>({...s,catColor:c.color,icon:c.icon})));
  const topWeapon=[...allShots].sort((a,b)=>b.wins-a.wins)[0];
  const topWeakness=[...allShots].sort((a,b)=>b.misses-a.misses)[0];
  const mostImproved=[...allShots].sort((a,b)=>(b.winHistory[3]-b.winHistory[0])-(a.winHistory[3]-a.winHistory[0]))[0];
  const kpis=CORE_KPIS;
  // Best partner = highest synergy
  const bestPartner=PARTNERS.reduce((a,b)=>b.synergy>a.synergy?b:a);

  return(
    <div className="fade-up" style={{maxWidth:1140,margin:"0 auto",padding:"32px"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
        <div>
          <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>Good morning, Alex 👋</h1>
          <p style={{color:C.textMid,fontSize:14,marginTop:3}}>3-match win streak · Last played Mar 3</p>
        </div>

      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${kpis.length},1fr)`,gap:14,marginBottom:16}}>
        {kpis.map(k=><KPICard key={k.id} {...k}/>)}
      </div>

      {/* 4-widget row: Shot Summary | Priority Drills | Last Match | Best Partner */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16}}>

        {/* Shot Summary */}
        <Card style={{padding:"16px 18px"}}>
          <SectionLabelInline>Shot Summary</SectionLabelInline>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10,marginTop:6}}>
            {[
              {label:"🏆 Top Weapon",    shot:topWeapon,    metric:`${topWeapon?.wins||0} pts won`,      color:C.mint,  bg:C.mintL},
              {label:"⚠️ Weakest Shot",  shot:topWeakness,  metric:`${topWeakness?.misses||0} errors`,   color:C.rose,  bg:C.roseL},
              {label:"📈 Most Improved", shot:mostImproved, metric:`+${mostImproved?mostImproved.winHistory[3]-mostImproved.winHistory[0]:0} this month`, color:C.blue, bg:C.blueL},
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <SectionLabelInline>Last Match · {m.date}</SectionLabelInline>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:C.navy,letterSpacing:"0.04em"}}>vs {m.opponent}</div>
              <div style={{fontSize:11,color:C.textLight,marginTop:1}}>w/ {m.partner} · {m.score}</div>
            </div>
            <Badge text="WIN" color={C.mint}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[
              {label:"NVZ Arrival",v:m.stats.nvzArrival,color:C.mint},
              {label:"NVZ Win",    v:m.stats.nvzWin,    color:C.blue},
              {label:"Serve Eff.", v:m.stats.serve,     color:C.amber},
              {label:"Return Eff.",v:m.stats.ret,       color:C.purple},
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
        </Card>

        {/* Best Partner — auto calculated */}
        <Card style={{padding:"16px 18px"}}>
          <SectionLabelInline>Best Partner</SectionLabelInline>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:6}}>
            <div style={{width:44,height:44,borderRadius:"50%",
              background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'Bebas Neue'",fontSize:17,color:C.navy,flexShrink:0}}>
              {bestPartner.name.split(" ").map(w=>w[0]).join("")}
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
            <div style={{height:"100%",width:`${bestPartner.synergy}%`,background:`linear-gradient(90deg,${C.pickle},${C.mint})`,borderRadius:3}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[
              {label:"Team NVZ",  value:`${bestPartner.nvz}%`,    color:C.mint},
              {label:"Win Rate",  value:`${Math.round(bestPartner.wins/bestPartner.matches*100)}%`, color:C.pickle},
              {label:"Errors",    value:bestPartner.errors,        color:C.rose},
              {label:"Role",      value:bestPartner.role,          color:C.purple},
            ].map(s=>(
              <div key={s.label} style={{background:C.pageBg,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{s.label}</div>
                <div style={{fontFamily:"'DM Mono'",fontSize:13,fontWeight:700,color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"right"}}>
            <span onClick={()=>setPage("team")} style={{fontSize:11,color:C.blue,cursor:"pointer",fontWeight:600}}>View team analytics →</span>
          </div>
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
  const [sel,setSel]=useState(MATCHES[0]);
  const [selShots,setSelShots]=useState(["dink","drive","lob","smash"]);
  const [showS,setShowS]=useState(false);
  const s=sel.stats;
  const shots=ALL_SHOTS_LIST.filter(sh=>selShots.includes(sh.id));
  const MATCH_KPIS=[
    { id:"winRate",    label:"Win Rate",            value:sel.result==="W"?"WIN":"LOSS", numVal:sel.result==="W"?100:0,  target:65,  unit:"%", higherIsBetter:true,  color:sel.result==="W"?C.mint:C.rose, colorL:sel.result==="W"?C.mintL:C.roseL, trendLabel:"this match" },
    { id:"errors",     label:"Errors",              value:s.errors,   numVal:s.errors,   target:8,   unit:"",  higherIsBetter:false, color:C.rose,   colorL:C.roseL },
    { id:"serveNeut",  label:"Serve Neutralization",value:`${s.serveNeut}%`, numVal:s.serveNeut, target:70, unit:"%", higherIsBetter:true, color:C.amber, colorL:C.amberL },
    { id:"nvzArrival", label:"NVZ Arrival",         value:`${s.nvzArrival}%`,numVal:s.nvzArrival,target:80,  unit:"%", higherIsBetter:true,  color:C.mint,   colorL:C.mintL },
    { id:"nvzWin",     label:"NVZ Win Rate",        value:`${s.nvzWin}%`,    numVal:s.nvzWin,    target:65,  unit:"%", higherIsBetter:true,  color:C.blue,   colorL:C.blueL },
  ];
  return(
    <div>
      {showS&&<ShotModal selected={selShots} onSave={setSelShots} onClose={()=>setShowS(false)}/>}
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20}}>
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}><SLabel>Recent Matches</SLabel></div>
          {MATCHES.map(m=>(
            <div key={m.id} className="row" onClick={()=>setSel(m)} style={{
              padding:"13px 18px",borderBottom:`1px solid ${C.border}`,
              background:sel.id===m.id?C.pageBg:C.cardBg,
              borderLeft:`3px solid ${sel.id===m.id?C.pickle:"transparent"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:11,color:C.textLight}}>{m.date}</span>
                <Badge text={m.result} color={m.result==="W"?C.mint:C.rose}/>
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
                <SectionLabelInline>{sel.date} · w/ {sel.partner}</SectionLabelInline>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:C.navy,letterSpacing:"0.04em"}}>vs {sel.opponent}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:13,color:C.textMid}}>{sel.score}</span>
                <Badge text={sel.result==="W"?"WIN":"LOSS"} color={sel.result==="W"?C.mint:C.rose}/>

              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
              {MATCH_KPIS.map(k=><KPICard key={k.id} {...k}/>)}
            </div>

            {/* Shot split by partner */}
            <SLabel>Shot Distribution · You vs {sel.partner}</SLabel>
            <div style={{display:"flex",gap:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:C.blue}}/>
                <span style={{fontSize:11,color:C.textMid}}>Alex (you)</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:C.textLight}}/>
                <span style={{fontSize:11,color:C.textMid}}>{sel.partner}</span>
              </div>
            </div>
            {(sel.shotSplit||[]).map(sh=>(
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
                  <span style={{fontSize:10,color:C.textLight}}>{sel.partner.split(" ")[0]} {sh.partnerPct}%</span>
                </div>
              </div>
            ))}
          </Card>


        </div>
      </div>
    </div>
  );
};

// ── PARTNER SUGGESTIONS ──────────────────────────────────────────────────────
// ── PARTNERS CONTENT ────────────────────────────────────────────────────────
const PartnersContent=()=>{
  const [ap,setAp]=useState(PARTNERS[0]);
  const [selShots,setSelShots]=useState(["dink","drive","lob"]);
  const [showS,setShowS]=useState(false);
  const shots=ALL_SHOTS_LIST.filter(s=>selShots.includes(s.id));
  const getTeamKPIs=(p)=>[
    { id:"winRate",    label:"Win Rate Together",    value:`${Math.round(p.wins/p.matches*100)}%`, numVal:Math.round(p.wins/p.matches*100), target:65, unit:"%", higherIsBetter:true,  color:C.pickle, colorL:"#F5FAE8" },
    { id:"errors",     label:"Team Errors / Match",  value:p.errors,  numVal:p.errors,  target:8,  unit:"",  higherIsBetter:false, color:C.rose,   colorL:C.roseL },
    { id:"serveNeut",  label:"Serve Neutralization", value:"Phase 2",  numVal:null,      target:70, unit:"%", higherIsBetter:true,  color:C.amber,  colorL:C.amberL, trendLabel:"Auto-tracked in Phase 2" },
    { id:"nvzArrival", label:"Team NVZ Arrival",     value:`${p.nvz}%`, numVal:p.nvz,   target:80, unit:"%", higherIsBetter:true,  color:C.mint,   colorL:C.mintL },
    { id:"nvzWin",     label:"Team NVZ Win Rate",    value:`${p.nvzWin}%`, numVal:p.nvzWin, target:65, unit:"%", higherIsBetter:true, color:C.blue, colorL:C.blueL },
  ];
  const tkpis=getTeamKPIs(ap);



  return(
    <div>
      {showS&&<ShotModal selected={selShots} onSave={setSelShots} onClose={()=>setShowS(false)}/>}
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:20}}>
        <Card style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}><SLabel>Partner Combinations</SLabel></div>
          {PARTNERS.map(p=>(
            <div key={p.name} className="row" onClick={()=>setAp(p)} style={{
              padding:"14px 18px",borderBottom:`1px solid ${C.border}`,
              background:ap.name===p.name?C.pageBg:C.cardBg,
              borderLeft:`3px solid ${ap.name===p.name?C.pickle:"transparent"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{width:36,height:36,borderRadius:"50%",
                  background:`linear-gradient(135deg,${C.blue},${C.mint})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Bebas Neue'",fontSize:14,color:"white",flexShrink:0}}>
                  {p.name.split(" ").map(w=>w[0]).join("")}
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
                  {ap.name.split(" ").map(w=>w[0]).join("")}
                </div>
                <div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:C.navy,letterSpacing:"0.04em"}}>w/ {ap.name}</div>
                  <div style={{fontSize:12,color:C.textMid}}>{ap.matches} matches · {ap.wins}W · {ap.matches-ap.wins}L</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:C.textLight,marginBottom:2}}>Synergy Score</div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:44,color:C.mint,lineHeight:1}}>{ap.synergy}</div>
              </div>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{height:8,background:C.border,borderRadius:4}}>
                <div style={{height:"100%",width:`${ap.synergy}%`,
                  background:`linear-gradient(90deg,${C.pickle},${C.mint})`,borderRadius:4}}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              {tkpis.map(k=><KPICard key={k.id} {...k}/>)}
            </div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Card>
              <SLabel>Role Identification</SLabel>
              {[{name:"Alex Chen (You)",role:"Driver",pct:72,color:C.blue},{name:ap.name,role:ap.role,pct:68,color:C.mint}].map(r=>(
                <div key={r.name} style={{background:C.pageBg,borderRadius:12,padding:"14px",marginBottom:10}}>
                  <div style={{fontSize:11,color:C.textLight,marginBottom:3}}>{r.name}</div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:r.color,letterSpacing:"0.04em",marginBottom:8}}>{r.role}</div>
                  <div style={{height:5,background:C.border,borderRadius:3}}>
                    <div style={{height:"100%",width:`${r.pct}%`,background:r.color,borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </Card>
            <Card style={{padding:"18px 20px"}}>
              <SLabel>Team Shot Split</SLabel>
              {/* Legend */}
              <div style={{display:"flex",gap:16,marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:12,height:12,borderRadius:3,background:C.blue}}/>
                  <span style={{fontSize:12,color:C.textMid}}>Alex (you)</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:12,height:12,borderRadius:3,background:C.textLight}}/>
                  <span style={{fontSize:12,color:C.textMid}}>{ap.name}</span>
                </div>
              </div>
              {/* Chart rows */}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {(ap.shotSplit||[]).map(sh=>{
                  const myW  = Math.round(sh.totalPct * sh.myPct / 100);
                  const prtW = Math.round(sh.totalPct * sh.partnerPct / 100);
                  return(
                    <div key={sh.id}>
                      {/* Row header */}
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"baseline",marginBottom:5}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <div style={{width:8,height:8,borderRadius:2,background:sh.color,flexShrink:0}}/>
                          <span style={{fontSize:13,fontWeight:600,color:C.text}}>{sh.label}</span>
                        </div>
                        <span style={{fontFamily:"'DM Mono'",fontSize:12,color:C.textLight}}>
                          {sh.totalPct}% of all shots
                        </span>
                      </div>
                      {/* Stacked bar: you | partner */}
                      <div style={{display:"flex",height:22,borderRadius:6,overflow:"hidden",
                        background:C.pageBg,border:`1px solid ${C.border}`}}>
                        {/* Alex segment */}
                        <div style={{width:`${sh.myPct}%`,background:C.blue,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          transition:"width 0.5s ease"}}>
                          {sh.myPct>=18&&(
                            <span style={{fontSize:10,fontWeight:700,color:"white",
                              fontFamily:"'DM Mono'"}}>{sh.myPct}%</span>
                          )}
                        </div>
                        {/* Partner segment */}
                        <div style={{width:`${sh.partnerPct}%`,background:C.textLight,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          transition:"width 0.5s ease"}}>
                          {sh.partnerPct>=18&&(
                            <span style={{fontSize:10,fontWeight:700,color:"white",
                              fontFamily:"'DM Mono'"}}>{sh.partnerPct}%</span>
                          )}
                        </div>
                      </div>
                      {/* Sub labels */}
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                        <span style={{fontSize:10,color:C.blue}}>
                          You: {myW}% of team shots
                        </span>
                        <span style={{fontSize:10,color:C.textLight}}>
                          {ap.name.split(" ")[0]}: {prtW}% of team shots
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
          <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:16,padding:"18px 20px"}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,
                background:`linear-gradient(135deg,${C.pickle},${C.mint})`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🥒</div>
              <div>
                <div style={{fontSize:12,color:C.pickle,fontWeight:700,marginBottom:6}}>PICKL Team Insight</div>
                <div style={{fontSize:13,color:"#CBD5E1",lineHeight:1.6}}>
                  {ap.name==="Sam R."?"Your strongest partnership. Sam's reset game complements your attacking style — you arrive at NVZ together 72% of the time. Work on poach communication to push synergy above 90.":ap.name==="Taylor M."?"Two drivers on the same team creates NVZ confusion. Designate roles: one attacks, one resets. This alone could boost team win rate 15-20%.":"Solid foundation. Work on stacking formations — you're leaving points on the table by not exploiting wide angles."}
                </div>
              </div>
            </div>
          </div>

          {/* ── Head-to-Head Match History ── */}
          <Card style={{marginTop:20}}>
            <SLabel>Match History Together</SLabel>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{display:"flex",gap:16}}>
                <div>
                  <div style={{fontFamily:"'DM Mono'",fontSize:26,fontWeight:700,color:C.text}}>
                    {ap.wins}<span style={{fontSize:16,color:C.textLight}}>/{ap.matches}</span>
                  </div>
                  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em"}}>Wins Together</div>
                </div>
                <div style={{width:1,background:C.border}}/>
                <div>
                  <div style={{fontFamily:"'DM Mono'",fontSize:26,fontWeight:700,
                    color:Math.round(ap.wins/ap.matches*100)>=50?C.mint:C.rose}}>
                    {Math.round(ap.wins/ap.matches*100)}%
                  </div>
                  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em"}}>Win Rate</div>
                </div>
              </div>
            </div>
            {/* Match rows */}
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {(ap.matchHistory||[]).map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,
                  padding:"9px 0",borderBottom:i<ap.matchHistory.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{width:28,height:28,borderRadius:8,flexShrink:0,
                    background:m.result==="W"?`${C.mint}20`:`${C.rose}20`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:12,fontWeight:800,
                      color:m.result==="W"?C.mint:C.rose}}>{m.result}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      vs {m.opponent}
                    </div>
                    <div style={{fontSize:11,color:C.textLight}}>{m.date}</div>
                  </div>
                  <div style={{fontFamily:"'DM Mono'",fontSize:12,color:C.textMid,
                    flexShrink:0,textAlign:"right"}}>{m.score}</div>
                </div>
              ))}
            </div>
          </Card>

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
    name:   (a,b) => a.name.localeCompare(b.name),
    wins:   (a,b) => a.wins   - b.wins,
    misses: (a,b) => a.misses - b.misses,
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
    <div className="fade-up" style={{ maxWidth:1200, margin:"0 auto", padding:"32px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:"'Bebas Neue'", fontSize:34, letterSpacing:"0.05em", color:C.navy }}>Shot Analytics</h1>
          <p style={{ color:C.textMid, fontSize:14, marginTop:3 }}>4-week win & loss trends · {all.length} shot types tracked · 📌 pin up to 3 shots that need targeted focus and drilling</p>
        </div>
      </div>

      {/* Summary trio */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }}>
        <Card style={{ borderLeft:`4px solid ${C.mint}`, cursor:"pointer" }} onClick={()=>setTab("weapons")}>
          <div style={{ fontSize:11, color:C.mint, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, marginBottom:4 }}>🏆 Top Weapon</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:18, color:C.text, marginBottom:6 }}>{topWeapon?.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"'DM Mono'", fontSize:26, fontWeight:700, color:C.mint }}>{topWeapon?.wins} pts won</span>
            <div style={{ flex:1 }}><Sparkline data={topWeapon?.winHistory||[]} color={C.mint} width={90} height={36} showDots={false}/></div>
          </div>
        </Card>
        <Card style={{ borderLeft:`4px solid ${C.rose}`, cursor:"pointer" }} onClick={()=>setTab("weaknesses")}>
          <div style={{ fontSize:11, color:C.rose, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, marginBottom:4 }}>⚠️ Biggest Weakness</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:18, color:C.text, marginBottom:6 }}>{topWeakness?.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"'DM Mono'", fontSize:26, fontWeight:700, color:C.rose }}>{topWeakness?.misses} pts lost</span>
            <div style={{ flex:1 }}><Sparkline data={topWeakness?.missHistory||[]} color={C.rose} width={90} height={36} showDots={false}/></div>
          </div>
        </Card>
        <Card style={{ borderLeft:`4px solid ${C.blue}` }}>
          <div style={{ fontSize:11, color:C.blue, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700, marginBottom:4 }}>📈 Most Improved (4wk)</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:18, color:C.text, marginBottom:6 }}>{mostImproved?.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontFamily:"'DM Mono'", fontSize:26, fontWeight:700, color:C.blue }}>+{mostImproved?.winHistory[3]-mostImproved?.winHistory[0]} pts</span>
            <div style={{ flex:1 }}><Sparkline data={mostImproved?.winHistory||[]} color={C.blue} width={90} height={36} showDots={false}/></div>
          </div>
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
          gridTemplateColumns:"40px 1.8fr 0.9fr 90px 100px 90px 100px 1.6fr",
          gap:10, padding:"11px 18px",
          borderBottom:`2px solid ${C.border}`, background:C.pageBg
        }}>
          <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>🎯 Focus</div>
          <ColHeader col="name"      label="Shot"       />
          <ColHeader col="category"  label="Category"   />
          <ColHeader col="wins"      label="Pts Won"  align="center"/>
          <ColHeader col="winTrend"  label="Win Trend" align="center"/>
          <ColHeader col="misses"    label="Pts Lost"  align="center"/>
          <ColHeader col="missTrend" label="Loss Trend" align="center"/>
          <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>PICKL Tip</div>
        </div>

        {/* Rows */}
        {displayed.map((shot, i) => {
          const winDelta  = shot.winHistory[3]  - shot.winHistory[0];
          const missDelta = shot.missHistory[3] - shot.missHistory[0];
          const isPinned  = GOALS.priorityShots.some(p=>p.name===shot.name);
          const atMax     = GOALS.priorityShots.length >= 3 && !isPinned;
          return (
            <div key={shot.name} style={{
              display:"grid",
              gridTemplateColumns:"40px 1.8fr 0.9fr 90px 100px 90px 100px 1.6fr",
              gap:10, padding:"11px 18px",
              borderBottom:`1px solid ${C.border}`,
              background:isPinned?`${C.pickle}08`:i%2===0?C.cardBg:"#FAFBFC",
              alignItems:"center", transition:"background 0.15s"
            }}>

              {/* Pin button */}
              <div style={{display:"flex",justifyContent:"center"}}>
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
                  border:`1.5px solid ${isPinned?C.pickle:atMax?C.border:C.border}`,
                  background:isPinned?`${C.pickle}20`:"transparent",
                  color:isPinned?C.pickleD:atMax?"#D1D5DB":C.textLight,
                  cursor:atMax&&!isPinned?"not-allowed":"pointer",
                  fontSize:13, display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"all 0.15s",
                }}>📌</button>
              </div>

              {/* Shot name */}
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{shot.name}</div>
                {isPinned&&<div style={{fontSize:9,color:C.pickleD,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:1}}>Priority Drill</div>}
              </div>

              {/* Category */}
              <div style={{ fontSize:11, color:shot.catColor, display:"flex", alignItems:"center", gap:3 }}>
                <span>{shot.icon}</span>{shot.category}
              </div>

              {/* Pts Won */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <span style={{ fontFamily:"'DM Mono'", fontSize:15, fontWeight:700,
                  color:shot.wins>=15?C.mint:shot.wins>=8?C.amber:C.rose }}>{shot.wins}</span>
                <span style={{ fontSize:10, fontWeight:700, color:winDelta>=0?C.mint:C.rose }}>
                  {winDelta>=0?`▲+${winDelta}`:`▼${winDelta}`}
                </span>
              </div>

              {/* Win trend sparkline */}
              <div style={{display:"flex",justifyContent:"center"}}>
                <Sparkline data={shot.winHistory} color={C.mint} width={88} height={32} showDots={false}/>
              </div>

              {/* Pts Lost */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <span style={{ fontFamily:"'DM Mono'", fontSize:15, fontWeight:700,
                  color:shot.misses>=10?C.rose:shot.misses>=6?C.amber:C.mint }}>{shot.misses}</span>
                <span style={{ fontSize:10, fontWeight:700, color:missDelta<=0?C.mint:C.rose }}>
                  {missDelta<=0?`▼${missDelta}`:`▲+${missDelta}`}
                </span>
              </div>

              {/* Loss trend sparkline */}
              <div style={{display:"flex",justifyContent:"center"}}>
                <Sparkline data={shot.missHistory} color={C.rose} width={88} height={32} showDots={false}/>
              </div>

              {/* PICKL tip */}
              <div style={{ fontSize:11, color:C.textMid, lineHeight:1.5 }}>{shot.tip}</div>
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
  const [msgs,setMsgs]=useState([{role:"assistant",ts:"Just now",
    content:`Hey Alex 👋 I'm PICKL — your personal AI pickleball coach.\n\nI've reviewed your last 14 matches. Two things stand out immediately:\n\n→ NVZ arrival at 68% — you're losing the kitchen battle too often. Elite 4.0+ players run 80%+.\n\n→ 10.3 unforced errors per match is your biggest leak. Most are mid-court drives when you should be dropping.\n\nBoth are very fixable. What do you want to work on today?`}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const btmRef=useRef(null);
  useEffect(()=>{btmRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const send=async(text)=>{
    const msg=text||input.trim();if(!msg||loading)return;
    setInput("");
    const ts=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    setMsgs(prev=>[...prev,{role:"user",content:msg,ts},{role:"assistant",typing:true}]);
    setLoading(true);
    try{
      const hist=msgs.filter(m=>!m.typing).map(m=>({role:m.role,content:m.content}));
      const apiMsgs=[
        {role:"user",content:`Context: Alex Chen, DUPR 4.08. Goals: NVZ 78%, errors <8/match. Stats: NVZ 68%, pts lost 10.3/match, win rate 64%, shot split dink 52% drive 38%. Question: ${hist.length===0?msg:""}`},
        ...(hist.length===0?[]:[
          {role:"assistant",content:"Context noted. Ready to coach."},
          ...hist.slice(1),
          {role:"user",content:msg}
        ])
      ];
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:COACH_SYS,messages:apiMsgs})
      });
      const data=await res.json();
      const reply=data.content?.map(b=>b.text||"").join("")||"Try again.";
      setMsgs(prev=>[...prev.filter(m=>!m.typing),{role:"assistant",content:reply,ts:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}]);
    }catch{
      setMsgs(prev=>[...prev.filter(m=>!m.typing),{role:"assistant",content:"Connection issue — try again.",ts:""}]);
    }finally{setLoading(false);}
  };

  return(
    <div className="fade-up" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 62px)",maxWidth:860,margin:"0 auto",width:"100%"}}>
      <div style={{padding:"24px 32px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.cardBg}}>
        <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>AI Coach</h1>
        <p style={{color:C.textMid,fontSize:13,marginTop:2}}>Grounded in Ben Johns · Anna Leigh Waters · Simone Jardim · PPR/IPTPA</p>
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
                    <div style={{fontSize:14,lineHeight:1.65,color:isU?"#E4EEFF":C.text,whiteSpace:"pre-wrap"}}>{m.content}</div>
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
            placeholder="Ask PICKL anything — stats, drills, game plans, opponent scouting..."
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
  const [goalVer,setGoalVer]           = useState(0);
  const [showEditModal,setShowEditModal] = useState(false);
  const [showPwModal,setShowPwModal]   = useState(false);
  const [plan]                         = useState("free");
  const [photoPreview,setPhotoPreview] = useState(null);

  const [playerName,setPlayerName]       = useState("Alex Chen");
  const [location,setLocation]           = useState("Seattle, WA");
  const [homeClub,setHomeClub]           = useState("Seattle Pickleball Club");
  const [email,setEmail]                 = useState("alex.chen@email.com");

  const [draft,setDraft] = useState({});
  const openEdit = () => {
    setDraft({playerName,location,homeClub,email});
    setShowEditModal(true);
  };
  const saveEdit = () => {
    setPlayerName(draft.playerName); setLocation(draft.location);
    setHomeClub(draft.homeClub);
    setEmail(draft.email);
    setShowEditModal(false);
  };
  const handlePhotoChange = e => {
    const file = e.target.files?.[0];
    if (file) setPhotoPreview(URL.createObjectURL(file));
  };

  const ratingHistory=[3.72,3.80,3.85,3.88,3.92,3.97,4.00,4.08];
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
    <div className="fade-up" style={{maxWidth:1100,margin:"0 auto",padding:"32px"}}>

      {/* ── Edit Profile Modal ── */}
      {showEditModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.72)",backdropFilter:"blur(8px)",
          zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.cardBg,borderRadius:20,width:"100%",maxWidth:640,
            maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.25)"}}>
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
                {label:"Full Name", key:"playerName", type:"text"},
                {label:"Email",     key:"email",      type:"email"},
                {label:"Location",  key:"location",   type:"text"},
                {label:"Home Club", key:"homeClub",   type:"text"},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
                    letterSpacing:"0.07em",fontWeight:600,marginBottom:5}}>{f.label}</div>
                  <input type={f.type} value={draft[f.key]||""}
                    onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))}
                    style={{width:"100%",background:C.pageBg,border:`1.5px solid ${C.border}`,
                      borderRadius:10,padding:"10px 14px",color:C.text,fontSize:13,
                      fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
                </div>
              ))}
              {/* Selects */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
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
              <div style={{fontFamily:"'DM Mono'",fontSize:20,fontWeight:700,color:C.blue}}>4.08</div>
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
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <Card>
          <SLabel>Season Stats</SLabel>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
            <KPICard label="DUPR"      value="4.08" color={C.blue}   colorL={C.blueL}/>
            <KPICard label="Win Rate"  value="64%"  color={C.mint}   colorL={C.mintL}/>
            <KPICard label="Matches"   value="14"   color={C.amber}  colorL={C.amberL}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {label:"Avg Errors",   value:"10.3 / match", color:C.rose},
              {label:"NVZ Arrival",  value:"68%",          color:C.mint},
              {label:"NVZ Win Rate", value:"55%",          color:C.blue},
              {label:"Serve Neut.",  value:"57%",          color:C.amber},
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
            4.08 <span style={{fontSize:18,color:C.mint}}>▲ +0.36</span>
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


      {/* ── Core Metric Targets ── */}
      <Card style={{marginBottom:20}}>
        <SLabel>Core Metric Targets</SLabel>
        <p style={{fontSize:13,color:C.textMid,marginBottom:18,marginTop:-8}}>
          Set your personal targets. These drive the goal bars on every metric widget across the app.
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {[
            {id:"winRate",   label:"Win Rate",            current:64,  unit:"%",  min:50, max:100, higherIsBetter:true,  color:C.pickle, desc:"% of matches won"},
            {id:"errors",    label:"Errors / Match",       current:10.3,unit:"",   min:2,  max:20,  higherIsBetter:false, color:C.rose,   desc:"Combined unforced per match (lower = better)"},
            {id:"serveNeut", label:"Serve Neutralization", current:57,  unit:"%",  min:30, max:100, higherIsBetter:true,  color:C.amber,  desc:"% of serves preventing offensive returns"},
            {id:"nvzArrival",label:"NVZ Arrival",          current:68,  unit:"%",  min:30, max:100, higherIsBetter:true,  color:C.mint,   desc:"% of rallies both players reach the kitchen"},
            {id:"nvzWin",    label:"NVZ Win Rate",         current:55,  unit:"%",  min:30, max:100, higherIsBetter:true,  color:C.blue,   desc:"% of kitchen rallies your team wins"},
          ].map((m,i,arr)=>{
            const tgt = GOALS.targets[m.id];
            const gap = m.higherIsBetter ? tgt - m.current : m.current - tgt;
            const gapColor = gap <= 0 ? C.mint : gap <= 8 ? C.amber : C.rose;
            return(
              <div key={m.id} style={{
                padding:"18px 0",
                borderBottom: i < arr.length-1 ? `1px solid ${C.border}` : "none"
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:10,height:10,borderRadius:2,background:m.color,flexShrink:0}}/>
                      <span style={{fontSize:14,fontWeight:700,color:C.text}}>{m.label}</span>
                    </div>
                    <div style={{fontSize:11,color:C.textLight,marginTop:2,marginLeft:18}}>{m.desc}</div>
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
                <input type="range" min={m.min} max={m.max} step={m.id==="errors"?0.5:1}
                  value={tgt}
                  onChange={e=>{GOALS.targets[m.id]=+e.target.value; setGoalVer(v=>v+1);}}
                  style={{width:"100%",accentColor:m.color,cursor:"pointer"}}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                  <span style={{fontSize:10,color:C.textLight}}>{m.higherIsBetter?"Conservative":""}{m.min}{m.unit}</span>
                  <span style={{fontSize:10,color:C.textLight}}>{m.higherIsBetter?"Elite":""}{m.max}{m.unit}</span>
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
  { cat:"4th Shot",  shots:["4th Shot Backhand","4th Shot Forehand"] },
  { cat:"Counter",   shots:["Counter BH","Counter FH"] },
  { cat:"Dink",      shots:["Dink BH","Dink FH"] },
  { cat:"Drive",     shots:["Drive BH","Drive FH"] },
  { cat:"Drop",      shots:["Drop BH","Drop FH"] },
  { cat:"Erne",      shots:["Erne BH","Erne FH"] },
  { cat:"ATP",       shots:["ATP BH","ATP FH"] },
  { cat:"Lob",       shots:["Lob BH","Lob FH"] },
  { cat:"Reset",     shots:["Reset BH","Reset FH"] },
  { cat:"Scramble",  shots:["Scramble BH"] },
  { cat:"Serve",     shots:["Serve"] },
  { cat:"Return",    shots:["Return BH","Return FH"] },
  { cat:"Slam",      shots:["Slam BH","Slam FH"] },
  { cat:"Speed Up",  shots:["Speed Up BH","Speed Up FH"] },
  { cat:"Volley",    shots:["Volley BH","Volley FH"] },
];

const INIT_SHOTS = Object.fromEntries(
  SHOT_LOG_FIELDS.flatMap(c=>c.shots.map(s=>[s,{wins:0,misses:0}]))
);

const LogMatchContent=()=>{
  const [showUp,setShowUp]           = useState(false);
  const [saved,setSaved]             = useState(false);
  const [shotsOpen,setShotsOpen]     = useState(false);

  // Match basics
  const [date,setDate]               = useState(new Date().toISOString().slice(0,10));
  const [opponent,setOpponent]       = useState("");
  const [partner,setPartner]         = useState("");
  const [score,setScore]             = useState("");
  const [result,setResult]           = useState("W");
  const [notes,setNotes]             = useState("");

  // Performance stats
  const [nvzArrival,setNvzArrival]   = useState(70);
  const [nvzWin,setNvzWin]           = useState(55);
  const [serve,setServe]             = useState(60);
  const [errors,setErrors]           = useState(9);
  const [jointNvz,setJointNvz]       = useState(65);
  const [partnerRole,setPartnerRole] = useState("Balanced");

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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {l:"Opponent",    v:opponent||"—"},
            {l:"Partner",     v:partner||"—"},
            {l:"Score",       v:score||"—"},
            {l:"Result",      v:result==="W"?"Win 🏆":"Loss"},
            {l:"NVZ Arrival", v:`${nvzArrival}%`},
            {l:"NVZ Win Rate",v:`${nvzWin}%`},
            ...(shotsLogged?[{l:"Pts Won",v:totalWins},{l:"Pts Lost",v:totalMisses}]:[]),
          ].map(({l,v})=>(
            <div key={l} style={{background:C.pageBg,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{l}</div>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={()=>{setSaved(false);setShots(INIT_SHOTS);setShotsOpen(false);}} style={{
        background:C.pickle,border:"none",borderRadius:12,padding:"12px 28px",
        fontFamily:"'Outfit'",fontWeight:700,fontSize:15,color:C.navy,cursor:"pointer"}}>
        Log Another Match
      </button>
    </div>
  );

  return(
    <div style={{maxWidth:760}}>
      {showUp&&<UploadModal onClose={()=>setShowUp(false)}/>}

      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <button onClick={()=>setShowUp(true)} style={{
          background:C.navy,border:"none",borderRadius:12,padding:"10px 20px",
          fontFamily:"'Outfit'",fontWeight:700,fontSize:14,color:C.pickle,
          cursor:"pointer",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          🎾 Upload Video Instead
        </button>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:16}}>

        {/* ── Section 1: Match Basics ── */}
        <Card>
          <SLabel>Match Info</SLabel>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            {[
              {label:"Date",        value:date,     onChange:setDate,     type:"date", span:1},
              {label:"Score",       value:score,    onChange:setScore,    type:"text", span:1, placeholder:"e.g. 11-7, 9-11, 11-8"},
              {label:"Opponent(s)", value:opponent, onChange:setOpponent, type:"text", span:1, placeholder:"e.g. Jake & Maria"},
              {label:"Partner",     value:partner,  onChange:setPartner,  type:"text", span:1, placeholder:"e.g. Sam R."},
            ].map(f=>(
              <div key={f.label} style={{gridColumn:`span ${f.span}`}}>
                <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
                  letterSpacing:"0.07em",fontWeight:600,marginBottom:6}}>{f.label}</div>
                <input type={f.type} value={f.value} onChange={e=>f.onChange(e.target.value)}
                  placeholder={f.placeholder||""}
                  style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,
                    borderRadius:10,padding:"10px 14px",color:C.text,fontSize:13,
                    fontFamily:"'Outfit'",boxSizing:"border-box"}}/>
              </div>
            ))}
          </div>

          {/* Win / Loss toggle */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
              letterSpacing:"0.07em",fontWeight:600,marginBottom:8}}>Result</div>
            <div style={{display:"flex",gap:10}}>
              {[["W","Win 🏆"],["L","Loss"]].map(([v,lbl])=>(
                <button key={v} onClick={()=>setResult(v)} style={{
                  flex:1,padding:"12px",borderRadius:12,fontWeight:700,fontSize:14,
                  cursor:"pointer",fontFamily:"'Outfit'",transition:"all 0.15s",
                  background:result===v?(v==="W"?C.mint:C.rose):C.pageBg,
                  border:`2px solid ${result===v?(v==="W"?C.mint:C.rose):C.border}`,
                  color:result===v?"white":C.textMid}}>{lbl}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",
              letterSpacing:"0.07em",fontWeight:600,marginBottom:6}}>Match Notes (optional)</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
              placeholder="Anything notable — tactics that worked, conditions, how you felt..."
              style={{width:"100%",background:C.pageBg,border:`1px solid ${C.border}`,
                borderRadius:10,padding:"10px 14px",color:C.text,fontSize:13,
                fontFamily:"'Outfit'",resize:"vertical",boxSizing:"border-box"}}/>
          </div>
        </Card>

        {/* ── Section 2: Performance Stats ── */}
        <Card>
          <SLabel>Performance Stats</SLabel>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 32px"}}>
            <div>
              <SliderField label="NVZ Arrival" value={nvzArrival} onChange={setNvzArrival}
                color={C.mint} hint="% of rallies you reached the kitchen"/>
              <SliderField label="NVZ Win Rate" value={nvzWin} onChange={setNvzWin}
                color={C.blue} hint="% of kitchen rallies you won"/>
              <SliderField label="Serve Neutralization" value={serve} onChange={setServe}
                color={C.amber} hint="% of serves / returns opponent couldn't attack"/>
            </div>
            <div>
              <SliderField label="Unforced Errors" value={errors} onChange={setErrors}
                min={0} max={30} unit="" color={C.rose} hint="total this match"/>
              <SliderField label="Joint NVZ Arrival" value={jointNvz} onChange={setJointNvz}
                color={C.mint} hint="% of rallies both players reached the kitchen"/>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:8}}>Your Role This Match</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {["Resetter","Driver","Attacker","Balanced"].map(r=>(
                    <button key={r} onClick={()=>setPartnerRole(r)} style={{
                      padding:"9px",borderRadius:10,fontWeight:600,fontSize:13,cursor:"pointer",
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

        {/* ── Section 3: Shot Log (optional, collapsible) ── */}
        <div style={{border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",
          background:C.cardBg}}>
          {/* Toggle header */}
          <button onClick={()=>setShotsOpen(o=>!o)} style={{
            width:"100%",background:"none",border:"none",cursor:"pointer",
            padding:"18px 22px",display:"flex",justifyContent:"space-between",
            alignItems:"center",fontFamily:"'Outfit'",textAlign:"left"}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>
                Shot Log
                {shotsLogged&&(
                  <span style={{marginLeft:10,fontSize:11,fontWeight:600,
                    color:C.pickle,background:`${C.pickle}18`,
                    borderRadius:20,padding:"2px 8px"}}>
                    {totalWins}W · {totalMisses}L logged
                  </span>
                )}
              </div>
              <div style={{fontSize:12,color:C.textLight,marginTop:2}}>
                Optional — log shots by category to update your analytics
              </div>
            </div>
            <div style={{fontSize:18,color:C.textLight,
              transform:shotsOpen?"rotate(180deg)":"rotate(0deg)",
              transition:"transform 0.2s",flexShrink:0}}>▼</div>
          </button>

          {shotsOpen&&(
            <div style={{borderTop:`1px solid ${C.border}`}}>
              {/* Instructions + running totals */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"12px 22px",background:C.pageBg,borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.textMid,maxWidth:480}}>
                  Log the shot that <b>finished the rally</b>. Won the point? tap <span style={{color:C.mint,fontWeight:700}}>+</span> Pts Won. Lost it? tap <span style={{color:C.rose,fontWeight:700}}>+</span> Pts Lost.
                </div>
                <div style={{display:"flex",gap:18,flexShrink:0}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontFamily:"'DM Mono'",fontSize:20,fontWeight:700,color:C.mint,lineHeight:1}}>{totalWins}</div>
                    <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:2}}>Pts Won</div>
                  </div>
                  <div style={{width:1,background:C.border}}/>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontFamily:"'DM Mono'",fontSize:20,fontWeight:700,color:C.rose,lineHeight:1}}>{totalMisses}</div>
                    <div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:2}}>Pts Lost</div>
                  </div>
                </div>
              </div>

              {/* Column headers */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 130px 130px",
                padding:"9px 22px",background:C.pageBg,borderBottom:`2px solid ${C.border}`}}>
                <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>Shot</div>
                <div style={{fontSize:11,color:C.mint,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,textAlign:"center"}}>✓ Pts Won</div>
                <div style={{fontSize:11,color:C.rose,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,textAlign:"center"}}>✕ Pts Lost</div>
              </div>

              {/* Shot rows */}
              {SHOT_LOG_FIELDS.map((cat,ci)=>(
                <div key={cat.cat}>
                  <div style={{padding:"7px 22px",background:C.pageBg,
                    borderTop:ci>0?`1px solid ${C.border}`:"none"}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.textLight,
                      textTransform:"uppercase",letterSpacing:"0.1em"}}>{cat.cat}</span>
                  </div>
                  {cat.shots.map(sName=>{
                    const w=shots[sName]?.wins||0;
                    const m=shots[sName]?.misses||0;
                    const hasData=w>0||m>0;
                    return(
                      <div key={sName} style={{
                        display:"grid",gridTemplateColumns:"1fr 130px 130px",
                        alignItems:"center",padding:"9px 22px",
                        borderTop:`1px solid ${C.border}`,
                        background:hasData?`${C.pickle}08`:C.cardBg}}>
                        <div style={{fontSize:13,fontWeight:hasData?600:400,
                          color:hasData?C.text:C.textMid}}>{sName}</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                          <button onClick={()=>setShot(sName,"wins",Math.max(0,w-1))}
                            style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,
                            background:C.pageBg,fontSize:17,color:C.textMid,cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                          <span style={{fontFamily:"'DM Mono'",fontSize:14,fontWeight:700,
                            color:w>0?C.mint:C.textLight,minWidth:22,textAlign:"center"}}>{w}</span>
                          <button onClick={()=>setShot(sName,"wins",w+1)}
                            style={{width:28,height:28,borderRadius:7,
                            border:`1px solid ${w>0?C.mint:C.border}`,
                            background:w>0?`${C.mint}18`:C.pageBg,fontSize:17,color:C.mint,cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                          <button onClick={()=>setShot(sName,"misses",Math.max(0,m-1))}
                            style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,
                            background:C.pageBg,fontSize:17,color:C.textMid,cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                          <span style={{fontFamily:"'DM Mono'",fontSize:14,fontWeight:700,
                            color:m>0?C.rose:C.textLight,minWidth:22,textAlign:"center"}}>{m}</span>
                          <button onClick={()=>setShot(sName,"misses",m+1)}
                            style={{width:28,height:28,borderRadius:7,
                            border:`1px solid ${m>0?C.rose:C.border}`,
                            background:m>0?`${C.rose}18`:C.pageBg,fontSize:17,color:C.rose,cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Save Button ── */}
        <button onClick={()=>setSaved(true)} style={{
          width:"100%",background:C.pickle,border:"none",borderRadius:14,
          padding:"15px",fontFamily:"'Outfit'",fontWeight:700,fontSize:16,
          color:C.navy,cursor:"pointer",marginTop:4}}>
          ✓ Save Match
        </button>

      </div>
    </div>
  );
};


// ── MATCH CENTER ──────────────────────────────────────────────────────────────
const MatchCenter=()=>{
  const [tab,setTab]=useState("log"); // "log" | "partners" | "history"

  const TABS=[
    {id:"log",      label:"📋 Log Match"},
    {id:"partners", label:"👥 Partners"},
    {id:"history",  label:"🏆 Match History"},
  ];

  return(
    <div className="fade-up" style={{maxWidth:1100,margin:"0 auto",padding:"32px"}}>

      {/* Page header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontFamily:"'Bebas Neue'",fontSize:34,letterSpacing:"0.05em",color:C.navy}}>Matches</h1>
        <p style={{color:C.textMid,fontSize:14,marginTop:3}}>Log results · track partnerships · review your match history</p>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:4,marginBottom:28,background:C.cardBg,
        border:`1px solid ${C.border}`,borderRadius:14,padding:5,width:"fit-content"}}>
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
    a:"Serve Neutralization measures the percentage of serves and return exchanges where your opponent cannot hit an offensive shot. A high rate means your serve or return is forcing weak responses." },
  { q:"How do I pin Priority Drills?",
    a:"Go to the Shot Analytics page and click the 📌 Focus button on any shot row. You can pin up to 3 shots. They'll appear on your Dashboard and Profile with target sliders to track progress." },
  { q:"What is the Synergy Score?",
    a:"Synergy Score (0–100) measures how well you and a partner perform together. It's built from 5 equally weighted components: Joint NVZ Arrival, NVZ Win Rate, Role Clarity, Error Avoidance, and DUPR-Adjusted Win Rate." },
  { q:"Who can see my stats and match data?",
    a:"Your stats are private by default — only you can see them. PickleIQ does not share individual match data, shot analytics, or performance metrics with other players, clubs, or third parties. Aggregate anonymized data may be used to improve the app." },
  { q:"How do I upgrade to Pro?",
    a:"Go to your Profile page and click 'Upgrade to Pro →' in the Membership section. Pro unlocks automated video analysis and unlimited PICKL AI coaching for $12.99/month." },
  { q:"Can I connect my DUPR account?",
    a:"Yes — DUPR integration is available on both Free and Pro plans. Go to Profile → Connected Accounts. Once connected, your rating syncs automatically after each logged match." },
  { q:"How does the PICKL AI coach work?",
    a:"PICKL is powered by Claude AI and has full context of your match history, shot stats, and goals. Free users get 10 messages per month. Pro users get unlimited access. You can ask anything — drill plans, game strategy, or help interpreting your stats." },
];

const HelpModal = ({onClose}) => {
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
    <div style={{position:"fixed",inset:0,background:"rgba(10,22,40,0.72)",backdropFilter:"blur(8px)",
      zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.cardBg,borderRadius:20,width:"100%",maxWidth:620,
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
              Common questions about PickleIQ features and metrics.
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
                  We read everything and use it to make PickleIQ better.
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
                <div style={{fontSize:13,color:C.blue}}>support@pickliq.app</div>
                <div style={{fontSize:11,color:C.textLight,marginTop:4}}>Response within 1 business day</div>
              </div>
              <a href="mailto:support@pickliq.app" style={{
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
export default function App(){
  const [page,setPage]       = useState("dashboard");
  const [showHelp,setShowHelp] = useState(false);
  return(
    <>
      <style>{STYLES}</style>
      {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
      <div style={{minHeight:"100vh",background:C.pageBg,display:"flex",flexDirection:"column"}}>
        <TopNav page={page} setPage={setPage}/>
        <main style={{flex:1}}>
          {page==="dashboard"&&<Dashboard setPage={setPage}/>}
          {page==="shots"    &&<Shots/>}
          {page==="matches"  &&<MatchCenter/>}
          {page==="coach"    &&<Coach/>}
          {page==="profile"  &&<Profile setPage={setPage}/>}
        </main>
        {/* ── Global Footer ── */}
        <footer style={{background:C.navy,borderTop:`1px solid rgba(255,255,255,0.06)`,
          padding:"14px 32px",display:"flex",justifyContent:"space-between",
          alignItems:"center",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:0,lineHeight:1}}>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:"0.06em",color:"white"}}>PICKLE</span>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:"0em",color:C.pickle}}>I</span>
            <svg width="16" height="19" viewBox="0 0 24 28" style={{display:"block",marginTop:1}}>
              <circle cx="12" cy="13" r="8" fill="none" stroke={C.pickle} strokeWidth="2"/>
              {[[12,13],[8.8,9.8],[15.2,9.8],[8.8,16.2],[15.2,16.2]].map(([x,y],i)=>(
                <circle key={`h${i}`} cx={x} cy={y} r="2" fill={C.navy}/>
              ))}
              {[[12,13],[8.8,9.8],[15.2,9.8],[8.8,16.2],[15.2,16.2]].map(([x,y],i)=>(
                <circle key={`d${i}`} cx={x} cy={y} r="1.2" fill={C.pickle}/>
              ))}
              <line x1="17.5" y1="18.5" x2="21" y2="24" stroke={C.pickle} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{fontSize:11,color:"#475569",marginLeft:8}}>© 2026</span>
          </div>
          <button onClick={()=>setShowHelp(true)} style={{
            display:"flex",alignItems:"center",gap:8,
            background:"rgba(255,255,255,0.06)",
            border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:10,padding:"8px 18px",cursor:"pointer",
            fontFamily:"'Outfit'",transition:"all 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(197,232,74,0.12)";e.currentTarget.style.borderColor=C.pickle+"55";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.borderColor="rgba(255,255,255,0.12)";}}>
            <span style={{fontSize:14}}>❓</span>
            <span style={{fontSize:13,fontWeight:600,color:"white"}}>Help & Support</span>
          </button>
          <div style={{display:"flex",gap:20}}>
            {["Privacy Policy","Terms of Use","Contact"].map(l=>(
              <span key={l} style={{fontSize:11,color:"#475569",cursor:"pointer",
                transition:"color 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.color="#94A3B8"}
                onMouseLeave={e=>e.currentTarget.style.color="#475569"}>{l}</span>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
