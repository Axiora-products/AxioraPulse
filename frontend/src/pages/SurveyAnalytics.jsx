// ─────────────────────────────────────────────────────────────────────────────
// SurveyAnalytics.jsx  —  World-class analytics dashboard · Axiora Pulse
// Tabs: Overview · Drop-off · Questions · Text Insights · Pulse Insights
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import API from '../api/axios';
import useAuthStore from '../hooks/useAuth';
import { formatDateTime } from '../lib/constants';
import AIInsightsPanel from '../components/AIInsightsPanel';
import { useAnalytics } from '../hooks/useAnalytics';
import { useLoading } from '../context/LoadingContext';

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler,
);

// ── Design tokens ─────────────────────────────────────────────────────────────
const COLS = [
  '#FF4500','#FFB800','#1E7A4A','#0047FF',
  '#D63B1F','#7C3AED','#00D4FF','#FF6B35','#84CC16','#EC4899',
];

const S = {
  tag:       { fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'var(--coral)', marginBottom:10 },
  h1:        { fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:'clamp(24px,2.8vw,36px)', letterSpacing:'-1.5px', color:'var(--espresso)', margin:0, lineHeight:1.05 },
  card:      { background:'var(--warm-white)', borderRadius:16, border:'1px solid rgba(22,15,8,0.07)', padding:'18px 22px 16px' },
  secLabel:  { fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', marginBottom:18 },
  qNum:      { fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' },
  qText:     { fontFamily:'Playfair Display,serif', fontWeight:700, fontSize:18, color:'var(--espresso)', lineHeight:1.3, letterSpacing:'-0.3px', marginBottom:4 },
  qResp:     { fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.50)', marginBottom:20 },
  statNum:   { fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:42, letterSpacing:'-3px', color:'var(--espresso)', lineHeight:1 },
  statLbl:   { fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', color:'rgba(22,15,8,0.35)', marginTop:8 },
  body:      { fontFamily:'Fraunces,serif', fontWeight:300, fontSize:14, color:'rgba(22,15,8,0.65)', lineHeight:1.65 },
  textResp:  { fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'var(--espresso)', background:'var(--cream)', borderRadius:10, padding:'10px 14px', lineHeight:1.6, borderLeft:'3px solid var(--coral)' },
  exportBtn: { display:'inline-flex', alignItems:'center', gap:8, padding:'11px 22px', borderRadius:999, border:'1px solid rgba(22,15,8,0.12)', background:'transparent', color:'rgba(22,15,8,0.55)', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer', transition:'all 0.2s' },
  backLink:  { display:'inline-flex', alignItems:'center', gap:6, fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.50)', textDecoration:'none', marginBottom:14, transition:'color 0.2s' },
};

// ── Shared chart tooltip defaults ─────────────────────────────────────────────
const tip = {
  cornerRadius:12, padding:12,
  backgroundColor:'rgba(22,15,8,0.92)',
  titleFont:{ family:'Syne', size:10 }, bodyFont:{ family:'Fraunces', size:12 },
  titleColor:'rgba(253,245,232,0.55)', bodyColor:'#FDF5E8',
};
const barOpts = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{ display:false }, tooltip:tip },
  scales:{
    x:{ grid:{ display:false }, ticks:{ font:{ family:'Syne', size:10 }, color:'rgba(22,15,8,0.4)' } },
    y:{ beginAtZero:true, ticks:{ stepSize:1, font:{ family:'Syne', size:10 }, color:'rgba(22,15,8,0.4)' }, grid:{ color:'rgba(22,15,8,0.04)' } },
  },
};
const hBarOpts = {
  indexAxis:'y', responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{ display:false }, tooltip:tip },
  scales:{
    x:{ beginAtZero:true, ticks:{ font:{ family:'Syne', size:10 }, color:'rgba(22,15,8,0.4)' }, grid:{ color:'rgba(22,15,8,0.04)' } },
    y:{ grid:{ display:false }, ticks:{ font:{ family:'Syne', size:11 }, color:'rgba(22,15,8,0.5)' } },
  },
};
const donutOpts = {
  responsive:true, maintainAspectRatio:false, cutout:'68%',
  plugins:{ legend:{ display:false }, tooltip:tip },
};
const lineOpts = {
  responsive:true, maintainAspectRatio:false,
  plugins:{
    legend:{ position:'top', labels:{ font:{ family:'Syne', size:10 }, color:'rgba(22,15,8,0.45)', boxWidth:10, boxHeight:2, padding:20 } },
    tooltip:tip,
  },
  scales:{
    x:{ grid:{ display:false }, ticks:{ font:{ family:'Syne', size:10 }, color:'rgba(22,15,8,0.4)' } },
    y:{ beginAtZero:true, ticks:{ stepSize:1, font:{ family:'Syne', size:10 }, color:'rgba(22,15,8,0.4)' }, grid:{ color:'rgba(22,15,8,0.04)' } },
  },
};

// ── Text analytics helpers ────────────────────────────────────────────────────
const POS_WORDS = new Set(['good','great','excellent','love','amazing','helpful','best','easy','fantastic','wonderful','satisfied','happy','nice','recommend','perfect','clear','fast','efficient','smooth','intuitive','simple','beautiful','awesome','brilliant','outstanding','impressive','quick','reliable','enjoy','enjoyed','pleased','delighted','appreciate','valuable','useful','effective','clean','solid','superb','thorough','friendly']);
const NEG_WORDS = new Set(['bad','poor','difficult','confusing','frustrated','awful','terrible','hate','worst','disappointing','slow','problem','issue','broken','wrong','unclear','complicated','annoying','expensive','hard','buggy','crash','error','missing','useless','waste','horrible','mediocre','underwhelming','incomplete','inconsistent','unreliable','clunky','awkward','painful','tedious','boring','irrelevant','lack','fails','failed','worse','ugly']);
const STOPS = new Set(['the','a','an','and','or','but','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','must','can','to','of','in','for','on','with','at','by','from','as','it','its','that','this','these','those','i','me','my','we','our','you','your','he','she','they','their','not','no','so','if','when','what','how','which','who','there','then','than','more','also','just','very','really','quite','too','up','out','about','into','through','after','before','get','got','make','made','use','used','like','even','much','some','here','need','want','feel','think','know','said','them','all','one','two','any','many','each','same','both','such']);

function sentimentScore(text) {
  if (!text) return 'neutral';
  const ws = text.toLowerCase().match(/\b\w+\b/g) || [];
  let p = 0, n = 0;
  ws.forEach(w => { if (POS_WORDS.has(w)) p++; if (NEG_WORDS.has(w)) n++; });
  return p > n + 0.5 ? 'positive' : n > p + 0.5 ? 'negative' : 'neutral';
}

function extractKeywords(items) {
  const freq = {};
  items.forEach(t => {
    if (!t) return;
    (t.toLowerCase().match(/\b[a-z]{3,}\b/g) || []).forEach(w => {
      if (!STOPS.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
  });
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([word,count])=>({ word, count }));
}

// ── Reusable atoms ────────────────────────────────────────────────────────────
function StatCard({ label, value, accent='#FF4500', sub, subColor, icon }) {
  return (
    <motion.div whileHover={{ y:-3, boxShadow:'0 20px 48px rgba(22,15,8,0.1)' }}
      style={{ ...S.card, height:'100%', boxSizing:'border-box', padding:'18px 18px 16px', display:'flex', flexDirection:'column', minWidth:0 }}>
      {icon && (
        <div style={{ width:36, height:36, borderRadius:10, background:`${accent}1A`, color:accent, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginBottom:12 }}>{icon}</div>
      )}
      <div style={{ ...S.statLbl, fontSize:10, letterSpacing:'0.08em', marginTop:0, marginBottom:10, lineHeight:1.3, overflowWrap:'break-word' }}>{label}</div>
      <div style={{ ...S.statNum, marginTop:'auto', fontSize:'clamp(24px,2.3vw,34px)', letterSpacing:'-2px', whiteSpace:'nowrap', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.04em', color:subColor||'rgba(22,15,8,0.45)', marginTop:6 }}>{sub}</div>}
    </motion.div>
  );
}

// Icon set for the overview stat cards (lucide-style)
const OV_ICONS = {
  file:  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  check: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  clock: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  ban:   <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  pulse: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  timer: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14.5 14.5"/><line x1="9" y1="2" x2="15" y2="2"/></svg>,
  flag:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  bulb:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>,
};

// Semicircular NPS gauge (−100 … +100)
function NpsGauge({ score = 0, label = '', color = 'var(--terracotta)', size = 210 }) {
  const cx = size / 2, cy = size * 0.60, R = size * 0.40, stroke = 13;
  const toXY = (deg) => ({ x: cx + R * Math.cos(deg * Math.PI / 180), y: cy + R * Math.sin(deg * Math.PI / 180) });
  const arc  = (from, to) => { const a = toXY(from), b = toXY(to); const large = Math.abs(to - from) > 180 ? 1 : 0; return `M ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`; };
  const f = Math.max(0, Math.min(1, (score + 100) / 200));
  const valAngle = 180 + 180 * f;
  return (
    <div style={{ position:'relative', width:size, height:size*0.66, margin:'0 auto' }}>
      <svg width={size} height={size*0.66} viewBox={`0 0 ${size} ${size*0.66}`}>
        <path d={arc(180, 360)} fill="none" stroke="var(--cream-deep)" strokeWidth={stroke} strokeLinecap="round" />
        <motion.path d={arc(180, valAngle)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: [0.16,1,0.3,1], delay: 0.2 }} />
      </svg>
      <div style={{ position:'absolute', left:'50%', top:cy-2, transform:'translate(-50%,-100%)', textAlign:'center', width:'82%' }}>
        <div style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:44, letterSpacing:'-2px', color:'var(--espresso)', lineHeight:1 }}>{score}</div>
        <div style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color, marginTop:6 }}>{label}</div>
      </div>
      <span style={{ position:'absolute', left:cx-R, top:cy+6, transform:'translateX(-50%)', fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.35)' }}>-100</span>
      <span style={{ position:'absolute', left:cx+R, top:cy+6, transform:'translateX(-50%)', fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.35)' }}>100</span>
    </div>
  );
}

// Speedometer-style completion gauge — a 270° gradient arc (red→amber→green)
// with tick marks, quartile labels and an animated pointer knob. The centre is
// kept clear so the percentage reads cleanly with no ring overlap.
function CompletionGauge({ value=0, size=210, color='var(--sage)' }) {
  const v      = Math.max(0, Math.min(100, Math.round(value)));
  const cx     = size / 2, cy = size / 2;
  const stroke = 12;
  const R      = size / 2 - 35;          // arc radius — leaves room for ticks + labels
  const START  = 135, SWEEP = 270;       // bottom-left → up → bottom-right
  const ang    = (t) => (START + SWEEP * t) * Math.PI / 180;   // t in [0,1]
  const ptAt   = (t, r=R) => ({ x: cx + r * Math.cos(ang(t)), y: cy + r * Math.sin(ang(t)) });
  const arcD   = (t0, t1, r=R) => {
    const a = ptAt(t0, r), b = ptAt(t1, r);
    const large = SWEEP * (t1 - t0) > 180 ? 1 : 0;
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  };
  const f      = v / 100;
  const knob   = ptAt(f);
  const rateWord = v >= 75 ? 'Excellent' : v >= 50 ? 'Good' : v >= 25 ? 'Fair' : 'Poor';

  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="cg-grad" gradientUnits="userSpaceOnUse" x1={cx - R} y1={cy} x2={cx + R} y2={cy}>
            <stop offset="0%"   stopColor="#FF4500" />
            <stop offset="45%"  stopColor="#FFB800" />
            <stop offset="72%"  stopColor="#A8C13A" />
            <stop offset="100%" stopColor="#1E7A4A" />
          </linearGradient>
        </defs>

        {/* faint full track */}
        <path d={arcD(0, 1)} fill="none" stroke="var(--cream-deep)" strokeWidth={stroke} strokeLinecap="round" />

        {/* tick marks every 2.5% — longer + bolder at the quartiles */}
        {Array.from({ length: 41 }).map((_, i) => {
          const t = i / 40, major = i % 10 === 0;
          const a = ang(t);
          const r1 = R + 5, r2 = R + (major ? 13 : 9);
          return (
            <line key={i}
              x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)}
              stroke={major ? 'rgba(22,15,8,0.32)' : 'rgba(22,15,8,0.13)'}
              strokeWidth={major ? 2 : 1.5} strokeLinecap="round" />
          );
        })}

        {/* quartile labels */}
        {[0, 25, 50, 75, 100].map((n) => {
          const p = ptAt(n / 100, R + 24);
          return (
            <text key={n} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
              style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, fill:'rgba(22,15,8,0.4)' }}>{n}</text>
          );
        })}

        {/* value arc — gradient fill up to the score */}
        <motion.path d={arcD(0, 1)} fill="none" stroke="url(#cg-grad)" strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: f }}
          transition={{ duration:1.1, ease:[0.16,1,0.3,1], delay:0.2 }} />

        {/* pointer knob at the value position */}
        <motion.circle cx={knob.x} cy={knob.y} r={7} fill="#fff" stroke={color} strokeWidth={3}
          initial={{ scale:0, opacity:0 }} animate={{ scale:1, opacity:1 }}
          transition={{ delay:1.1, duration:0.4, ease:[0.16,1,0.3,1] }}
          style={{ transformOrigin:`${knob.x}px ${knob.y}px`, filter:'drop-shadow(0 1px 4px rgba(22,15,8,0.25))' }} />
      </svg>

      {/* centre value — sits in the open middle, no overlap */}
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:1 }}>
          <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:46, letterSpacing:'-2px', color:'var(--espresso)', lineHeight:1 }}>{v}</span>
          <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:22, color:'var(--espresso)' }}>%</span>
        </div>
        <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color, marginTop:7 }}>{rateWord}</span>
      </div>
    </div>
  );
}

function AutoInsight({ type='info', children }) {
  const map = {
    info:     { bg:'rgba(0,71,255,0.06)',   border:'rgba(0,71,255,0.12)',  color:'#0047FF',           icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
    positive: { bg:'rgba(30,122,74,0.08)',  border:'rgba(30,122,74,0.15)', color:'var(--sage)',       icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> },
    warning:  { bg:'rgba(255,184,0,0.09)',  border:'rgba(255,184,0,0.2)',  color:'#9A6D00',           icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    alert:    { bg:'rgba(255,69,0,0.07)',   border:'rgba(255,69,0,0.14)',  color:'var(--coral)',      icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> },
  };
  const st = map[type] || map.info;
  return (
    <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }}
      style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'11px 16px', borderRadius:14, background:st.bg, border:`1px solid ${st.border}` }}>
      <div style={{ width:20, height:20, borderRadius:6, background:st.border, display:'flex', alignItems:'center', justifyContent:'center', color:st.color, flexShrink:0 }}>{st.icon}</div>
      <span style={{ fontFamily:'Fraunces,serif', fontWeight:400, fontSize:13, color:st.color, lineHeight:1.5 }}>{children}</span>
    </motion.div>
  );
}

function EmptyState({ message='No data yet.' }) {
  return (
    <div style={{ ...S.card, textAlign:'center', padding:'52px 32px' }}>
      <div style={{ fontFamily:'Playfair Display,serif', fontSize:44, color:'rgba(22,15,8,0.05)', fontWeight:900, marginBottom:12 }}>Empty</div>
      <p style={{ ...S.body, color:'rgba(22,15,8,0.50)', margin:0 }}>{message}</p>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TABS = [
  { id:'Overview',      label:'Overview'      },
  { id:'Sources',       label:'Sources'      },
  { id:'Dropoff',       label:'Drop-off'      },
  { id:'Questions',     label:'Questions'     },
  { id:'TextInsights',  label:'Text Insights' },
  { id:'Feedback',      label:'Feedback'      },
  { id:'AI',            label:'Pulse Insights', icon:<span style={{ display:'inline-flex', position:'relative', width:8, height:8 }}><span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'var(--coral)' }} /><span style={{ position:'absolute', inset:-3, borderRadius:'50%', border:'1px solid var(--coral)', opacity:0.35 }} /></span> },
];

function TabBar({ active, onChange }) {
  return (
    <div style={{ display:'flex', gap:2, borderBottom:'1px solid rgba(22,15,8,0.07)', marginBottom:40, overflowX:'auto' }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            display:'inline-flex', alignItems:'center', gap:6,
            fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
            padding:'10px 18px', border:'none', background:'transparent', cursor:'pointer', whiteSpace:'nowrap',
            color: active === t.id ? 'var(--espresso)' : 'rgba(22,15,8,0.3)',
            borderBottom: active === t.id ? '2px solid var(--coral)' : '2px solid transparent',
            marginBottom:'-1px', transition:'all 0.18s',
          }}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: SOURCES — respondent source / acquisition-channel tracking
// ─────────────────────────────────────────────────────────────────────────────
function SourcesTab({ analytics }) {
  const { sourceBreakdown, total } = analytics;

  if (!total || sourceBreakdown.length === 0) {
    return (
      <div style={{ ...S.card }}>
        <div style={S.secLabel}>Response Sources</div>
        <p style={{ ...S.body, color:'rgba(22,15,8,0.4)', margin:0 }}>
          No responses yet. Share your survey from the Share dialog — each channel (WhatsApp,
          LinkedIn, Email, QR Code, Direct Link, …) tags its link, so responses are attributed
          to their source here automatically.
        </p>
      </div>
    );
  }

  const top = sourceBreakdown[0];
  const bestCompletion = sourceBreakdown.slice().sort((a, b) => b.completionRate - a.completionRate)[0];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Summary tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:14 }}>
        <div style={{ ...S.card }}>
          <div style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:34, color:'var(--espresso)' }}>{sourceBreakdown.length}</div>
          <div style={S.statLbl}>Channels used</div>
        </div>
        <div style={{ ...S.card }}>
          <div style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:28, color:'var(--coral)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{top.label}</div>
          <div style={S.statLbl}>Top source · {top.total} ({top.share}%)</div>
        </div>
        <div style={{ ...S.card }}>
          <div style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:34, color:'#1E7A4A' }}>{bestCompletion.completionRate}%</div>
          <div style={S.statLbl}>Best completion · {bestCompletion.label}</div>
        </div>
      </div>

      {/* Per-source breakdown */}
      <div style={{ ...S.card }}>
        <div style={S.secLabel}>Responses by Source</div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {sourceBreakdown.map((s, i) => {
            const c = COLS[i % COLS.length];
            return (
              <div key={s.source}>
                <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6, flexWrap:'wrap', gap:8 }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:8, fontFamily:'Syne,sans-serif', fontSize:12, fontWeight:700, color:'var(--espresso)' }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:c }} />
                    {s.label}
                  </span>
                  <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.06em', color:'rgba(22,15,8,0.45)' }}>
                    {s.total} {s.total === 1 ? 'response' : 'responses'} · {s.share}% of total · {s.completionRate}% completed
                  </span>
                </div>
                <div style={{ height:8, borderRadius:999, background:'rgba(22,15,8,0.06)', overflow:'hidden' }}>
                  <div style={{ width:`${Math.max(s.share, 2)}%`, height:'100%', background:c, borderRadius:999, transition:'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ analytics, trendDays, setTrendDays, survey }) {
  const { total, completedCount, abandonedCount, completionRate, abandonRate, avgTimeMin, nps, responseTrend, deviceBreakdown, locationStats, milestones } = analytics;
  const inProgress = Math.max(0, total - completedCount - abandonedCount);
  const pctOf = (n) => total ? Math.round((n / total) * 100) : 0;

  // Completion Rate omitted here — it has its own donut gauge in the row below.
  const statCards = [
    { label:'Total Responses', value:total,                          accent:'#1E7A4A', icon:OV_ICONS.file,  sub:'All time' },
    { label:'Completed',       value:completedCount,                 accent:'#1E7A4A', icon:OV_ICONS.check, sub:`${completionRate}%`, subColor:'#1E7A4A' },
    { label:'In Progress',     value:inProgress,                     accent:'#FFB800', icon:OV_ICONS.clock, sub:`${pctOf(inProgress)}%`, subColor:'#9A6D00' },
    { label:'Abandoned',       value:abandonedCount,                 accent:'#D63B1F', icon:OV_ICONS.ban,   sub:`${abandonRate}%`, subColor:'#D63B1F' },
    { label:'Avg. Time',       value:avgTimeMin?`${avgTimeMin}m`:'—', accent:'#0047FF', icon:OV_ICONS.timer, sub:'to complete' },
  ];

  const hasTrend = responseTrend.some(d => d.started > 0);
  // Actual days plotted — clamped to the survey's age, so it can be < trendDays
  const trendSpan = responseTrend.length;
  const trendClamped = trendSpan < trendDays;
  const trendLabel = trendClamped ? 'Response Trend · Since Launch' : `${trendDays}-Day Response Trend`;
  const trendData = {
    labels: responseTrend.map(d=>d.date),
    datasets:[
      { label:'Completed', data:responseTrend.map(d=>d.completed), borderColor:'#FF4500', backgroundColor:'rgba(255,69,0,0.07)', fill:true, tension:0.45, pointBackgroundColor:'#FF4500', pointRadius:3, pointHoverRadius:5, borderWidth:2 },
      { label:'Started',   data:responseTrend.map(d=>d.started),   borderColor:'#0047FF', backgroundColor:'rgba(0,71,255,0.04)', fill:true, tension:0.45, pointBackgroundColor:'#0047FF', pointRadius:3, pointHoverRadius:5, borderWidth:1.5 },
    ],
  };

  // ── Response Velocity ───────────────────────────────────────────────
  // Daily pace from the trend window (responseTrend.started = responses/day).
  // The last point is today, the one before is yesterday.
  const dailyStarted   = responseTrend.map(d => d.started);
  const todayCount     = dailyStarted.length ? dailyStarted[dailyStarted.length - 1] : 0;
  const yesterdayCount = dailyStarted.length > 1 ? dailyStarted[dailyStarted.length - 2] : 0;
  const velocityDelta  = yesterdayCount > 0
    ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
    : (todayCount > 0 ? 100 : 0);
  const avgPerDay = dailyStarted.length
    ? dailyStarted.reduce((a, b) => a + b, 0) / dailyStarted.length
    : 0;
  // Project to the survey's expiry at the current average daily pace.
  const MS_DAY = 86400000;
  let daysLeft = null;
  if (survey?.expires_at) {
    const exp = new Date(survey.expires_at);
    if (!isNaN(exp)) daysLeft = Math.max(0, Math.ceil((exp - Date.now()) / MS_DAY));
  }
  const projectedTotal = daysLeft != null
    ? total + Math.round(avgPerDay * daysLeft)
    : total + Math.round(avgPerDay * 30); // no expiry → 30-day horizon

  const devEntries = Object.entries(deviceBreakdown).filter(([,v])=>v>0);
  const npsColors = { Excellent:'var(--sage)', Good:'var(--cobalt)', 'Needs work':'#9A6D00', Critical:'var(--terracotta)' };

  // Completion-rate and NPS are surfaced directly in the cards/gauges below,
  // so the banner here focuses on guidance not already shown as a metric.
  const insights = [];
  if (total > 5 && abandonRate > 30) insights.push({ type:'alert', msg:`${abandonRate}% abandon rate detected — check the Drop-off tab for the problematic question.` });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {insights.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {insights.map((ins,i) => <AutoInsight key={i} type={ins.type}>{ins.msg}</AutoInsight>)}
        </div>
      )}

      {/* Stat grid */}
      <div className="np-stats-grid" style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr))', gap:12 }}>
        {statCards.map((sc,i) => (
          <motion.div key={i} initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.05 }}>
            <StatCard {...sc} />
          </motion.div>
        ))}
      </div>

      {/* Middle row — completion rate · milestones · NPS */}
      {total > 0 && (() => {
        const rateColor = completionRate >= 75 ? '#1E7A4A'
                        : completionRate >= 50 ? '#FFB800'
                        : completionRate >= 25 ? '#FF4500'
                        : '#D63B1F';
        const msRows = [
          { label:'Reached a Quarter', count:milestones.pct25,  color:'#0047FF' },
          { label:'Reached Halfway',   count:milestones.pct50,  color:'#FFB800' },
          { label:'Almost Finished',   count:milestones.pct75,  color:'#FF4500' },
          { label:'Fully Completed',   count:milestones.pct100, color:'#1E7A4A' },
        ];
        const banner = completionRate >= 90
            ? { title:'Great job!',          sub:'Almost every respondent finishes the survey.',          color:'var(--sage)',       bg:'rgba(30,122,74,0.08)', border:'rgba(30,122,74,0.15)' }
          : completionRate >= 60
            ? { title:'Strong completion',   sub:'Most respondents make it to the end.',                  color:'var(--sage)',       bg:'rgba(30,122,74,0.07)', border:'rgba(30,122,74,0.14)' }
          : completionRate >= 30
            ? { title:'Moderate completion', sub:'Roughly half finish — consider shortening it.',         color:'#9A6D00',           bg:'rgba(255,184,0,0.09)', border:'rgba(255,184,0,0.2)'  }
            : { title:'Low completion',      sub:'Many respondents drop off — see the Drop-off tab.',     color:'var(--terracotta)', bg:'rgba(255,69,0,0.07)',  border:'rgba(255,69,0,0.14)'  };
        const npsTip = !nps ? ''
          : nps.score < 0  ? 'Focus on improving satisfaction to boost your NPS score.'
          : nps.score < 30 ? 'Decent NPS — work on converting passives into promoters.'
          : nps.score < 50 ? 'Good NPS — keep nurturing your promoters.'
          :                  'Excellent NPS — you have strong advocates.';

        return (
          <div className="np-overview-mid" style={{ display:'grid', gridTemplateColumns: nps ? '1fr 1.3fr 1fr' : '1fr 1.4fr', gap:20, alignItems:'stretch' }}>
            {/* Completion Rate */}
            <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18 }}>
              <div style={{ ...S.card, height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column' }}>
                <div style={S.secLabel}>Completion Rate</div>
                <div style={{ display:'flex', justifyContent:'center', padding:'2px 0 8px' }}>
                  <CompletionGauge value={completionRate} color={rateColor} size={200} />
                </div>
                <div style={{ marginTop:'auto', display:'flex', alignItems:'center', gap:11, padding:'11px 14px', borderRadius:14, background:banner.bg, border:`1px solid ${banner.border}` }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:banner.border, display:'flex', alignItems:'center', justifyContent:'center', color:banner.color, flexShrink:0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <div style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.04em', color:banner.color }}>{banner.title}</div>
                    <div style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.55)' }}>{banner.sub}</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Completion Milestones */}
            <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.22 }}>
              <div style={{ ...S.card, height:'100%', boxSizing:'border-box' }}>
                <div style={S.secLabel}>Completion Milestones</div>
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {msRows.map((m, i) => {
                    const pct = pctOf(m.count);
                    return (
                      <div key={m.label} style={{ display:'flex', alignItems:'center', gap:13 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:`${m.color}1A`, color:m.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{OV_ICONS.flag}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:6, gap:8 }}>
                            <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:14, color:'var(--espresso)' }}>{m.label}</span>
                            <div style={{ display:'flex', alignItems:'baseline', gap:6, flexShrink:0 }}>
                              <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:16, letterSpacing:'-0.5px', color:'var(--espresso)' }}>{m.count}</span>
                              <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.4)' }}>({pct}%)</span>
                            </div>
                          </div>
                          <div style={{ height:5, background:'var(--cream-deep)', borderRadius:999 }}>
                            <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.8, delay:i*0.07, ease:[0.16,1,0.3,1] }}
                              style={{ height:'100%', background:m.color, borderRadius:999 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* NPS Score */}
            {nps && (
              <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.26 }}>
                <div style={{ ...S.card, height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column' }}>
                  <div style={S.secLabel}>NPS Score</div>
                  <NpsGauge score={nps.score} label={nps.label} color={npsColors[nps.label] || 'var(--terracotta)'} />
                  <div style={{ marginTop:'auto', display:'flex', alignItems:'flex-start', gap:10, padding:'11px 14px', borderRadius:14, background:'rgba(255,184,0,0.09)', border:'1px solid rgba(255,184,0,0.18)' }}>
                    <span style={{ color:'#9A6D00', flexShrink:0, marginTop:1, display:'flex' }}>{OV_ICONS.bulb}</span>
                    <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.6)', lineHeight:1.45 }}>{npsTip}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        );
      })()}

      {/* Response trend + velocity — two cards sharing the row */}
      <div className="np-trend-row" style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr', gap:20, alignItems:'stretch' }}>
        {/* Response trend — floating day-range pill, zero layout impact */}
        {hasTrend ? (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.25 }}
            style={{ ...S.card, position:'relative', height:'100%', boxSizing:'border-box' }}>
            {/* Floating segmented control — overlays card, takes no vertical space */}
            <div style={{ position:'absolute', top:20, right:22, display:'flex', background:'var(--cream-deep)', borderRadius:999, padding:3, gap:2, zIndex:2 }}>
              {[7, 14, 30, 90].map(d => (
                <button key={d} onClick={() => setTrendDays(d)} style={{
                  fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700,
                  letterSpacing:'0.1em', textTransform:'uppercase',
                  padding:'5px 11px', borderRadius:999, border:'none',
                  background: trendDays===d ? 'var(--espresso)' : 'transparent',
                  color: trendDays===d ? 'var(--cream)' : 'rgba(22,15,8,0.38)',
                  cursor:'pointer', transition:'all 0.15s',
                }}>{d}D</button>
              ))}
            </div>
            <div style={S.secLabel}>{trendLabel}</div>
            <div className="np-chart-wrap" style={{ height:210 }}><Line options={lineOpts} data={trendData} /></div>
          </motion.div>
        ) : (
          <div style={{ ...S.card, position:'relative', height:'100%', boxSizing:'border-box' }}>
            {/* Still show segment control even when no data — allows switching */}
            <div style={{ position:'absolute', top:20, right:22, display:'flex', background:'var(--cream-deep)', borderRadius:999, padding:3, gap:2, zIndex:2 }}>
              {[7, 14, 30, 90].map(d => (
                <button key={d} onClick={() => setTrendDays(d)} style={{
                  fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700,
                  letterSpacing:'0.1em', textTransform:'uppercase',
                  padding:'5px 11px', borderRadius:999, border:'none',
                  background: trendDays===d ? 'var(--espresso)' : 'transparent',
                  color: trendDays===d ? 'var(--cream)' : 'rgba(22,15,8,0.38)',
                  cursor:'pointer', transition:'all 0.15s',
                }}>{d}D</button>
              ))}
            </div>
            <div style={S.secLabel}>{trendLabel}</div>
            <div style={{ textAlign:'center', padding:'24px 0' }}>
              <p style={{ ...S.body, color:'rgba(22,15,8,0.40)', margin:0 }}>
                {trendClamped ? 'No responses since this survey launched.' : `No responses in the last ${trendDays} days.`}
              </p>
            </div>
          </div>
        )}

        {/* Response velocity — pace of incoming responses */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}
          style={{ ...S.card, height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column' }}>
          <div style={S.secLabel}>Response Velocity</div>
          <div style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.45)', marginTop:-6, marginBottom:18 }}>
            How fast responses are coming in
          </div>

          {/* Today's responses + delta vs yesterday */}
          <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:44, letterSpacing:'-1.5px', lineHeight:1, color:'var(--espresso)' }}>
              {todayCount}
            </span>
            {(() => {
              const up = velocityDelta >= 0;
              const c  = velocityDelta === 0 ? 'rgba(22,15,8,0.4)' : up ? '#1E7A4A' : '#D63B1F';
              return (
                <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontFamily:'Syne,sans-serif', fontSize:12, fontWeight:700, color:c }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
                    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                  </svg>
                  {velocityDelta > 0 ? '+' : ''}{velocityDelta}%
                </span>
              );
            })()}
          </div>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.4)', marginTop:6 }}>
            responses today · vs yesterday
          </div>

          {/* Secondary stats */}
          <div style={{ marginTop:'auto', paddingTop:18, display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8 }}>
              <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.55)' }}>Avg. per day</span>
              <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:18, letterSpacing:'-0.5px', color:'var(--espresso)' }}>
                {avgPerDay.toFixed(1)}
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8 }}>
              <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.55)' }}>
                Projected total{daysLeft != null ? ` (in ${daysLeft}d)` : ''}
              </span>
              <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:18, letterSpacing:'-0.5px', color:'var(--coral)' }}>
                {projectedTotal.toLocaleString()}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:20 }} className="np-grid-responsive">
        {/* Device breakdown */}
        {devEntries.length > 0 && (
          <motion.div initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.35 }}>
            <div style={{ ...S.card, height:'100%', boxSizing:'border-box' }}>
              <div style={S.secLabel}>Device Breakdown</div>
              <div style={{ display:'flex', gap:24, alignItems:'center' }}>
                <div style={{ width:110, height:110, flexShrink:0 }}>
                  <Doughnut options={donutOpts} data={{ labels:devEntries.map(([k])=>k), datasets:[{ data:devEntries.map(([,v])=>v), backgroundColor:COLS.slice(0,devEntries.length), borderWidth:0 }] }} />
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
                  {devEntries.map(([key,val],i) => (
                    <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:COLS[i] }} />
                        <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'var(--espresso)', textTransform:'capitalize' }}>{key}</span>
                      </div>
                      <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.45)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Responses by location — top cities from respondent demographics */}
        {total > 0 && (
        <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }} style={{ ...S.card, height:'100%', boxSizing:'border-box' }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:18 }}>
            <div style={{ ...S.secLabel, marginBottom:0 }}>Responses by Location</div>
            {locationStats.located > 0 && (
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(22,15,8,0.4)' }}>
                {locationStats.located} from {locationStats.uniqueCities} {locationStats.uniqueCities===1?'city':'cities'}
              </span>
            )}
          </div>

          {locationStats.located === 0 ? (
            <p style={{ ...S.body, color:'rgba(22,15,8,0.4)', margin:0 }}>
              No location data yet — respondents share their city only when the survey's demographics step is enabled.
            </p>
          ) : (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                {locationStats.breakdown.slice(0,8).map((loc,i) => {
                  const pct = Math.round((loc.count / locationStats.located) * 100);
                  const c = COLS[i % COLS.length];
                  return (
                    <div key={loc.city} style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:130, flexShrink:0, display:'flex', alignItems:'center', gap:7, overflow:'hidden' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'var(--espresso)', textTransform:'capitalize', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={loc.city}>{loc.city}</span>
                      </div>
                      <div style={{ flex:1, height:7, background:'var(--cream-deep)', borderRadius:999 }}>
                        <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.7, delay:i*0.05, ease:[0.16,1,0.3,1] }}
                          style={{ height:'100%', background:c, borderRadius:999 }} />
                      </div>
                      <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.45)', width:62, textAlign:'right', flexShrink:0 }}>
                        {loc.count} <span style={{ color:'rgba(22,15,8,0.3)' }}>({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {(locationStats.breakdown.length > 8 || locationStats.unknown > 0) && (
                <div style={{ marginTop:14, display:'flex', gap:16, flexWrap:'wrap', fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(22,15,8,0.4)' }}>
                  {locationStats.breakdown.length > 8 && <span>+{locationStats.breakdown.length - 8} more {locationStats.breakdown.length - 8 === 1 ? 'city' : 'cities'}</span>}
                  {locationStats.unknown > 0 && <span>{locationStats.unknown} without location</span>}
                </div>
              )}
            </>
          )}
        </motion.div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: DROP-OFF FUNNEL
// ─────────────────────────────────────────────────────────────────────────────
function DropoffTab({ analytics }) {
  const { dropOffFunnel, timingHeatmap } = analytics;
  if (!dropOffFunnel.length) return <EmptyState message="No response data available yet." />;

  const maxReached = dropOffFunnel[0]?.reached || 1;
  const biggestDrop = [...dropOffFunnel].sort((a,b)=>b.dropPct-a.dropPct)[0];
  const timingData = timingHeatmap.filter(t=>t.responses>0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {/* Auto-insights */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {biggestDrop && biggestDrop.dropPct > 10 && (
          <AutoInsight type="alert">
            Largest drop-off at Q{dropOffFunnel.findIndex(s=>s.questionId===biggestDrop.questionId)+1}: &ldquo;{biggestDrop.questionText.slice(0,60)}&rdquo; — {biggestDrop.dropPct}% abandon here.
          </AutoInsight>
        )}
        {dropOffFunnel.filter(s=>s.dropPct===0).length > dropOffFunnel.length * 0.7 && (
          <AutoInsight type="positive">Flow is strong — most questions have under 5% drop-off. Survey pacing is well-calibrated.</AutoInsight>
        )}
      </div>

      {/* Funnel bars */}
      <div style={S.card}>
        <div style={S.secLabel}>Response Funnel</div>
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {dropOffFunnel.map((step, i) => {
            const w = Math.max(14, Math.round((step.reached/maxReached)*100));
            const isWorst = biggestDrop && step.questionId === biggestDrop.questionId && step.dropPct > 10;
            return (
              <div key={step.questionId}>
                <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:3 }}>
                  <div style={{ width:28, fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', flexShrink:0, textAlign:'right' }}>Q{i+1}</div>
                  <div style={{ flex:1, position:'relative', height:34, background:'var(--cream-deep)', borderRadius:8, overflow:'hidden' }}>
                    <motion.div
                      initial={{ width:0 }} animate={{ width:`${w}%` }}
                      transition={{ duration:0.7, delay:i*0.055, ease:[0.16,1,0.3,1] }}
                      style={{ height:'100%', background:isWorst?'rgba(214,59,31,0.18)':'rgba(22,15,8,0.1)', borderRadius:8, display:'flex', alignItems:'center', paddingLeft:12, border:isWorst?'1px solid rgba(214,59,31,0.25)':'none' }}>
                      <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:isWorst?'var(--terracotta)':'rgba(22,15,8,0.5)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'88%' }}>
                        {step.questionText.slice(0,60)}{step.questionText.length>60?'...':''}
                      </span>
                    </motion.div>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', width:118, flexShrink:0 }}>
                    <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:15, color:'var(--espresso)' }}>{step.reached}</span>
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:'rgba(22,15,8,0.50)', textTransform:'uppercase', letterSpacing:'0.06em' }}>reached</span>
                  </div>
                </div>
                {i < dropOffFunnel.length-1 && step.dropped > 0 && (
                  <div style={{ display:'flex', alignItems:'center', paddingLeft:42, marginBottom:3 }}>
                    <div style={{ flex:1 }} />
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:step.dropPct>20?'var(--terracotta)':'rgba(22,15,8,0.50)', letterSpacing:'0.05em', width:118, flexShrink:0 }}>
                      down {step.dropped} dropped ({step.dropPct}%)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Timing heatmap */}
      {timingData.length > 0 && (
        <div style={S.card}>
          <div style={S.secLabel}>Time per Question</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {timingHeatmap.map((t,i) => {
              const maxS = Math.max(...timingHeatmap.map(x=>x.avgSecs), 1);
              const pct = Math.round((t.avgSecs/maxS)*100);
              const hc = t.avgSecs<5?'#1E7A4A':t.avgSecs<15?'#FFB800':t.avgSecs<30?'#FF4500':'#D63B1F';
              return (
                <div key={t.questionId} style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:26, fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:'rgba(22,15,8,0.3)', flexShrink:0, textAlign:'right' }}>Q{i+1}</div>
                  <div style={{ flex:1, height:26, background:'var(--cream-deep)', borderRadius:6, overflow:'hidden' }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }}
                      transition={{ duration:0.6, delay:i*0.04, ease:[0.16,1,0.3,1] }}
                      style={{ height:'100%', background:hc, opacity:0.65, borderRadius:6 }} />
                  </div>
                  <div style={{ width:80, flexShrink:0, display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'var(--espresso)' }}>{t.avgSecs}s</span>
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:hc }}>{t.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:16, display:'flex', gap:14, flexWrap:'wrap' }}>
            {[{ l:'Fast (<5s)', c:'#1E7A4A' }, { l:'Normal (5-15s)', c:'#FFB800' }, { l:'Slow (15-30s)', c:'#FF4500' }, { l:'Very slow (>30s)', c:'#D63B1F' }].map(x => (
              <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:x.c }} />
                <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'rgba(22,15,8,0.35)' }}>{x.l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary table */}
      <div style={{ ...S.card, padding:'24px 28px' }}>
        <div style={S.secLabel}>Drop-off Summary</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(22,15,8,0.07)' }}>
                {['#','Question','Reached','Answered','Dropped','Drop Rate'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 10px', fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dropOffFunnel.map((s,i) => (
                <tr key={s.questionId} style={{ borderBottom:'1px solid rgba(22,15,8,0.04)', transition:'background 0.14s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--cream)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'9px 10px', fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:'rgba(22,15,8,0.3)' }}>Q{i+1}</td>
                  <td style={{ padding:'9px 10px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'var(--espresso)', maxWidth:260 }}>{s.questionText.slice(0,60)}{s.questionText.length>60?'...':''}</td>
                  <td style={{ padding:'9px 10px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.5)' }}>{s.reached}</td>
                  <td style={{ padding:'9px 10px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.5)' }}>{s.answered}</td>
                  <td style={{ padding:'9px 10px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:s.dropped>0?'var(--terracotta)':'rgba(22,15,8,0.3)' }}>{s.dropped}</td>
                  <td style={{ padding:'9px 10px' }}>
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', padding:'3px 8px', borderRadius:999, background:s.dropPct>25?'rgba(214,59,31,0.1)':s.dropPct>10?'rgba(255,184,0,0.1)':'rgba(30,122,74,0.08)', color:s.dropPct>25?'var(--terracotta)':s.dropPct>10?'#9A6D00':'var(--sage)' }}>{s.dropPct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────
function QuestionCard({ question:q, data:d, index:i }) {
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.04 }} style={S.card}>
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <span style={S.qNum}>Q{i+1}</span>
          <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'2px 8px', borderRadius:999, background:'rgba(22,15,8,0.05)', color:'rgba(22,15,8,0.4)' }}>
            {q.question_type.replace(/_/g,' ')}
          </span>
          {q.is_required && <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:'var(--coral)' }}>required</span>}
        </div>
        <div style={S.qText}>{q.question_text}</div>
        <div style={S.qResp}>{d?.total||0} response{d?.total!==1?'s':''}</div>
      </div>

      {!d ? (
        <div style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.45)', fontStyle:'italic' }}>No responses yet</div>

      ) : d.type === 'doughnut' ? (
        // Single choice / Dropdown / Yes-No
        <div className="np-doughnut-card" style={{ display:'flex', gap:32, alignItems:'center' }}>
          <div className="np-doughnut-wrap" style={{ width:140, height:140, flexShrink:0 }}>
            <Doughnut options={donutOpts} data={{ labels:d.labels, datasets:[{ data:d.values, backgroundColor:COLS.slice(0,d.values.length), borderWidth:0 }] }} />
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:9 }}>
            {d.labels.map((lbl,j) => {
              const pct = Math.round((d.values[j]/d.total)*100);
              return (
                <div key={j}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'var(--espresso)', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:COLS[j], flexShrink:0, display:'inline-block' }} />{lbl}
                    </span>
                    <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:11, color:'var(--espresso)' }}>{d.values[j]} <span style={{ color:'rgba(22,15,8,0.3)' }}>({pct}%)</span></span>
                  </div>
                  <div style={{ height:3, background:'var(--cream-deep)', borderRadius:999 }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.7, ease:[0.16,1,0.3,1] }}
                      style={{ height:'100%', background:COLS[j], borderRadius:999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      ) : d.type === 'bar' ? (
        // Multiple choice / Rating / Scale / Slider
        <div>
          {d.avg !== undefined && (
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:16 }}>
              <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:38, letterSpacing:'-2px', color:'var(--espresso)' }}>{d.avg}</span>
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.35)' }}>average</span>
            </div>
          )}
          {d.min !== undefined && (
            <div style={{ display:'flex', gap:20, marginBottom:16 }}>
              {[{ l:'Min', v:d.min }, { l:'Max', v:d.max }, { l:'Avg', v:d.avg }].map(s => (
                <div key={s.l}>
                  <div style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:22, letterSpacing:'-1px', color:'var(--espresso)' }}>{s.v}</div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
          <div className="np-chart-wrap" style={{ height:170 }}>
            <Bar options={barOpts} data={{ labels:d.labels, datasets:[{ data:d.values, backgroundColor:d.labels.map((_,j)=>COLS[j%COLS.length]), borderRadius:6, barThickness:26 }] }} />
          </div>
        </div>

      ) : d.type === 'ranking' ? (
        // Ranking — horizontal bar (lower avg rank = better)
        <div>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', marginBottom:16 }}>Avg rank — lower = ranked first by respondents</div>
          <div className="np-chart-wrap" style={{ height:Math.max(140, d.labels.length*38) }}>
            <Bar options={hBarOpts} data={{ labels:d.labels, datasets:[{ data:d.values, backgroundColor:d.labels.map((_,j)=>COLS[j%COLS.length]), borderRadius:6, barThickness:22 }] }} />
          </div>
        </div>

      ) : d.type === 'matrix' ? (
        // Matrix heatmap
        <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse', width:'100%' }}>
            <thead>
              <tr>
                <th style={{ padding:'6px 10px', minWidth:120 }} />
                {d.cols.map(c => (
                  <th key={c.value} style={{ padding:'6px 8px', fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.45)', textAlign:'center', minWidth:64 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map(row => {
                const rowMax = Math.max(...d.cols.map(c=>d.matrix[row.value]?.[c.value]||0), 1);
                return (
                  <tr key={row.value}>
                    <td style={{ padding:'6px 10px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'var(--espresso)', whiteSpace:'nowrap' }}>{row.label}</td>
                    {d.cols.map(col => {
                      const val = d.matrix[row.value]?.[col.value] || 0;
                      const intensity = rowMax > 0 ? val/rowMax : 0;
                      return (
                        <td key={col.value} style={{ padding:'6px 8px', textAlign:'center', background:`rgba(255,69,0,${(intensity*0.55).toFixed(2)})`, borderRadius:6 }}>
                          <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:intensity>0.45?'var(--cream)':'var(--espresso)' }}>{val}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      ) : (
        // Text responses (short_text / long_text preview)
        <div>
          <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:220, overflowY:'auto' }}>
            {(d.items ?? []).slice(0,18).map((r,j) => <div key={j} style={S.textResp}>{r}</div>)}
            {(d.items ?? []).length > 18 && (
              <div style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.50)', paddingLeft:4 }}>
                +{d.items.length-18} more — view full analysis in Text Insights tab
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function QuestionsTab({ analytics }) {
  const { questionAnalytics } = analytics;
  if (!questionAnalytics.length) return <EmptyState message="No questions found in this survey." />;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {questionAnalytics.map(({ question, data }, i) => (
        <QuestionCard key={question.id} question={question} data={data} index={i} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: TEXT INSIGHTS
// ─────────────────────────────────────────────────────────────────────────────
function TextInsightsTab({ analytics }) {
  const textQs = analytics.questionAnalytics.filter(({ question:q }) =>
    ['short_text','long_text'].includes(q.question_type)
  );
  if (!textQs.length) return <EmptyState message="No open-text questions in this survey." />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {textQs.map(({ question:q, data:d }, qi) => {
        if (!d?.items?.length) return (
          <div key={q.id} style={S.card}>
            <div style={S.qNum}>{q.question_type==='long_text'?'Long Text':'Short Text'}</div>
            <div style={S.qText}>{q.question_text}</div>
            <p style={{ ...S.body, color:'rgba(22,15,8,0.50)', marginTop:8 }}>No responses yet.</p>
          </div>
        );

        const kws  = extractKeywords(d.items);
        const maxKw = kws[0]?.count || 1;
        const sents = d.items.map(sentimentScore);
        const pos = sents.filter(s=>s==='positive').length;
        const neg = sents.filter(s=>s==='negative').length;
        const neu = sents.filter(s=>s==='neutral').length;

        return (
          <motion.div key={q.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:qi*0.06 }} style={S.card}>
            <div style={{ marginBottom:20 }}>
              <div style={{ ...S.qNum, marginBottom:4 }}>
                {q.question_type==='long_text'?'Long Text':'Short Text'} · {d.total} responses
              </div>
              <div style={S.qText}>{q.question_text}</div>
            </div>

            {/* Sentiment bar */}
            <div style={{ marginBottom:24 }}>
              <div style={S.secLabel}>Sentiment Distribution</div>
              <div style={{ display:'flex', height:28, borderRadius:8, overflow:'hidden', gap:2, marginBottom:10 }}>
                {[{ v:pos, c:'#1E7A4A', l:'Positive' }, { v:neu, c:'rgba(22,15,8,0.12)', l:'Neutral' }, { v:neg, c:'#D63B1F', l:'Negative' }]
                  .filter(s=>s.v>0).map(s => {
                    const pct = Math.round((s.v/d.total)*100);
                    return (
                      <motion.div key={s.l} title={`${s.l}: ${s.v} (${pct}%)`}
                        initial={{ scaleX:0, originX:0 }} animate={{ scaleX:1 }} transition={{ duration:0.7, ease:[0.16,1,0.3,1] }}
                        style={{ width:`${pct}%`, background:s.c, display:'flex', alignItems:'center', justifyContent:'center', minWidth:s.v>0?22:0 }}>
                        <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.85)', letterSpacing:'0.05em' }}>{pct>9?`${pct}%`:''}</span>
                      </motion.div>
                    );
                  })}
              </div>
              <div style={{ display:'flex', gap:16 }}>
                {[{ l:'Positive', v:pos, c:'var(--sage)' }, { l:'Neutral', v:neu, c:'rgba(22,15,8,0.4)' }, { l:'Negative', v:neg, c:'var(--terracotta)' }].map(s => (
                  <div key={s.l} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:s.c }} />
                    <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.5)' }}>
                      {s.l} <strong style={{ color:'var(--espresso)', fontWeight:600 }}>{s.v}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Auto-insights */}
            {neg > pos && neg > d.total*0.3 && (
              <div style={{ marginBottom:20 }}>
                <AutoInsight type="warning">{Math.round((neg/d.total)*100)}% of responses carry negative sentiment. Review keywords below for common complaints.</AutoInsight>
              </div>
            )}
            {pos > d.total*0.6 && (
              <div style={{ marginBottom:20 }}>
                <AutoInsight type="positive">{Math.round((pos/d.total)*100)}% of responses are positive — respondents are satisfied here.</AutoInsight>
              </div>
            )}

            {/* Keywords */}
            {kws.length > 0 && (
              <div style={{ marginBottom:24 }}>
                <div style={S.secLabel}>Top Keywords</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {kws.map(({ word, count }) => {
                    const pct = Math.round((count/maxKw)*100);
                    const isP = POS_WORDS.has(word);
                    const isN = NEG_WORDS.has(word);
                    const kc = isP?'#1E7A4A':isN?'#D63B1F':'var(--coral)';
                    return (
                      <div key={word} style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:90, fontFamily:'Fraunces,serif', fontWeight:400, fontSize:13, color:'var(--espresso)', flexShrink:0, display:'flex', alignItems:'center', gap:5 }}>
                          {isP && <span style={{ color:'#1E7A4A', fontSize:10 }}>+</span>}
                          {isN && <span style={{ color:'#D63B1F', fontSize:10 }}>–</span>}
                          {word}
                        </div>
                        <div style={{ flex:1, height:6, background:'var(--cream-deep)', borderRadius:999 }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.6, ease:[0.16,1,0.3,1] }}
                            style={{ height:'100%', background:kc, borderRadius:999, opacity:0.55 + pct*0.004 }} />
                        </div>
                        <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.4)', width:24, textAlign:'right', flexShrink:0 }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All responses with sentiment color */}
            <div>
              <div style={S.secLabel}>All Responses</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:320, overflowY:'auto' }}>
                {d.items.map((r,j) => {
                  const s = sentimentScore(r);
                  const bc = s==='positive'?'#1E7A4A':s==='negative'?'#D63B1F':'rgba(22,15,8,0.12)';
                  return (
                    <div key={j} style={{ ...S.textResp, borderLeftColor:bc }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                        <span style={{ flex:1 }}>{r}</span>
                        <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:bc, flexShrink:0, marginTop:2, opacity:0.75 }}>{s}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSES TABLE (always shown below tabs)
// ─────────────────────────────────────────────────────────────────────────────
function ResponsesTable({ rs, qs, ans }) {
  return (
    <div style={{ ...S.card, padding:'28px 28px 24px' }}>
      <div style={S.secLabel}>All Responses</div>
      {!rs.length ? (
        <EmptyState message="No responses yet — share your survey to get started." />
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(22,15,8,0.08)' }}>
                {['#','Status','Email','Started','Completed'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'9px 12px', fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rs.map((r,i) => (
                <tr key={r.id} style={{ borderBottom:'1px solid rgba(22,15,8,0.04)', transition:'background 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--cream)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'11px 12px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.35)' }}>{i+1}</td>
                  <td style={{ padding:'11px 12px' }}>
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', padding:'3px 10px', borderRadius:999,
                      background:r.status==='completed'?'rgba(30,122,74,0.1)':r.status==='in_progress'?'rgba(0,71,255,0.08)':'rgba(22,15,8,0.06)',
                      color:r.status==='completed'?'var(--sage)':r.status==='in_progress'?'var(--cobalt)':'rgba(22,15,8,0.4)' }}>{r.status}</span>
                  </td>
                  <td style={{ padding:'11px 12px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.5)' }}>{r.respondent_email||'—'}</td>
                  <td style={{ padding:'11px 12px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.5)' }}>{formatDateTime(r.started_at)}</td>
                  <td style={{ padding:'11px 12px', fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.5)' }}>{r.completed_at?formatDateTime(r.completed_at):'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

// ── Survey Feedback Tab ───────────────────────────────────────────────────────
function FeedbackTab({ feedback }) {
  if (!feedback.length) return <EmptyState message="No respondent feedback yet. It shows up after surveys are submitted." />;
  const avg = (feedback.reduce((a,b) => a + b.rating, 0) / feedback.length).toFixed(1);
  const dist = [1,2,3,4,5].map(n => ({ star: n, count: feedback.filter(f => f.rating === n).length }));
  const maxCount = Math.max(...dist.map(d => d.count), 1);
  const starColor = r => r >= 4 ? '#FFB800' : r === 3 ? '#FF4500' : 'var(--terracotta)';
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {/* Average + distribution */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="np-feedback-grid" style={{ ...S.card, display:'grid', gridTemplateColumns:'auto 1fr', gap:32, alignItems:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={S.statNum}>{avg}</div>
          <div style={{ display:'flex', justifyContent:'center', gap:2, marginTop:4 }}>
            {[1,2,3,4,5].map(i => (
              <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill={i <= Math.round(avg) ? '#FFB800' : 'none'} stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ))}
          </div>
          <div style={{ ...S.statLbl, marginTop:8 }}>{feedback.length} rating{feedback.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {dist.slice().reverse().map(d => (
            <div key={d.star} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:11, fontWeight:700, color:'rgba(22,15,8,0.4)', minWidth:16, textAlign:'right' }}>{d.star}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFB800" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <div style={{ flex:1, height:7, background:'var(--cream-deep)', borderRadius:999 }}>
                <motion.div initial={{ width:0 }} animate={{ width:`${(d.count/maxCount)*100}%` }} transition={{ duration:0.7, ease:[0.16,1,0.3,1] }}
                  style={{ height:'100%', borderRadius:999, background: starColor(d.star) }} />
              </div>
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, color:'rgba(22,15,8,0.35)', minWidth:20 }}>{d.count}</span>
            </div>
          ))}
        </div>
      </motion.div>
      {/* Comments */}
      {feedback.filter(f => f.comment).length > 0 && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }} style={S.card}>
          <div style={S.secLabel}>Comments</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:360, overflowY:'auto' }}>
            {feedback.filter(f => f.comment).map(f => (
              <div key={f.id} style={{ ...S.textResp, display:'flex', gap:12 }}>
                <span style={{ display:'flex', gap:1, flexShrink:0 }}>
                  {[1,2,3,4,5].map(i => (
                    <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i <= f.rating ? '#FFB800' : 'none'} stroke="#FFB800" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  ))}
                </span>
                <span>{f.comment}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function SurveyAnalytics() {
  const { id }          = useParams();
  const { profile }     = useAuthStore();
  const { stopLoading } = useLoading();
  const [sv,  setSv]    = useState(null);
  const [qs,  sQs]      = useState([]);
  const [rs,  sRs]      = useState([]);
  const [ans, sAns]     = useState([]);
  const [tab, setTab]   = useState('Overview');
  const [feedback, setFeedback] = useState([]);
  const [trendDays, setTrendDays] = useState(14);
  const [dlOpen, setDlOpen] = useState(false);   // Download dropdown
  const dlRef = useRef(null);

  // Close the Download dropdown on outside click / Escape
  useEffect(() => {
    if (!dlOpen) return;
    const onClick = (e) => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setDlOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [dlOpen]);

  useEffect(() => { if (profile?.id) load(); else stopLoading(); }, [id, profile?.id]);

  async function load() {
    try {
      const [surveyRes, questionsRes, responsesRes, feedbackRes] = await Promise.all([
        API.get(`/surveys/${id}`),
        API.get(`/surveys/${id}/questions`),
        API.get(`/surveys/${id}/responses?limit=100000`),
        API.get(`/surveys/${id}/feedback`),
      ]);

      setSv(surveyRes.data);
      sQs(questionsRes.data || []);

      const r = responsesRes.data || [];
      sRs(r);
      const allAnswers = [];
      r.forEach(resp => { if (resp.survey_answers) allAnswers.push(...resp.survey_answers); });
      sAns(allAnswers);

      setFeedback(feedbackRes.data || []);
    } catch(e) {
      console.error(e);
    }
    finally { stopLoading(); }
  }

  const analytics = useAnalytics(qs, rs, ans, trendDays, sv?.created_at);

  function csv() {
    const h = ['#','Status','Email','Started','Completed',...qs.map(q=>q.question_text)];
    const ansMap = {};
    (ans || []).forEach(a => {
      ansMap[`${a.response_id}::${a.question_id}`] = a;
    });
    const rows = rs.map((r,i) => {
      return [i+1, r.status, r.respondent_email||'', r.started_at, r.completed_at||'',
        ...qs.map(q=>{ const a=ansMap[`${r.id}::${q.id}`]; return a?.answer_value||(a?.answer_json?JSON.stringify(a.answer_json):''); })];
    });
    const c = [h,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([c],{type:'text/csv'}));
    a.download = `${sv?.title||'survey'}.csv`;
    a.click();
  }

  function exportPDF() {
    const { total, completedCount, abandonedCount, completionRate, avgTimeMin, milestones } = analytics;
    const qRows = qs.map((q,i) => {
      const d = analytics.questionAnalytics[i]?.data;
      const respCount = d?.total ?? 0;
      return `<tr><td>${i+1}</td><td>${q.question_text}</td><td>${q.question_type.replace(/_/g,' ')}</td><td>${respCount}</td></tr>`;
    }).join('');
    const milRows = [
      {pct:'25%', count: milestones.pct25},
      {pct:'50%', count: milestones.pct50},
      {pct:'75%', count: milestones.pct75},
      {pct:'100%',count: milestones.pct100},
    ].map(m => {
      const barW = total > 0 ? Math.round(m.count/total*100) : 0;
      return `<div class="milestone"><span class="pct-label">${m.pct}</span><div class="bar-bg"><div class="bar-fill" style="width:${barW}%"></div></div><span class="count-label">${m.count} respondents (${barW}%)</span></div>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><title>${sv?.title||'Survey'} — Analytics</title>
<style>body{font-family:Georgia,serif;color:#160F08;margin:40px;max-width:800px}h1{font-size:28px;letter-spacing:-1px;margin-bottom:4px}.sub{color:#888;font-size:13px;margin-bottom:32px}.section{margin-bottom:32px}h2{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#999;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.stat{background:#f7f5f0;border-radius:10px;padding:16px}.stat-num{font-size:32px;font-weight:900;letter-spacing:-2px}.stat-lbl{font-family:Arial;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#999;margin-top:4px}.milestone{display:flex;align-items:center;gap:12px;margin-bottom:10px}.pct-label{min-width:40px;font-weight:900;font-size:16px}.bar-bg{flex:1;height:6px;background:#eee;border-radius:4px}.bar-fill{height:100%;border-radius:4px;background:#FF4500}.count-label{font-size:13px;color:#555;white-space:nowrap}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:8px 12px;background:#f7f5f0;font-family:Arial;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#999}td{padding:8px 12px;border-bottom:1px solid #f0ede8}.footer{margin-top:48px;font-family:Arial;font-size:10px;color:#ccc;text-align:center}@media print{body{margin:20px}}</style>
</head><body>
<h1>${sv?.title||'Survey'}</h1>
<div class="sub">Analytics Report &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
<div class="section"><h2>Overview</h2>
<div class="stats">
<div class="stat"><div class="stat-num">${total}</div><div class="stat-lbl">Total Responses</div></div>
<div class="stat"><div class="stat-num">${completedCount}</div><div class="stat-lbl">Completed</div></div>
<div class="stat"><div class="stat-num">${completionRate}%</div><div class="stat-lbl">Completion Rate</div></div>
<div class="stat"><div class="stat-num">${abandonedCount}</div><div class="stat-lbl">Abandoned</div></div>
<div class="stat"><div class="stat-num">${avgTimeMin ? avgTimeMin+'m' : '—'}</div><div class="stat-lbl">Avg. Time</div></div>
<div class="stat"><div class="stat-num">${total-completedCount-abandonedCount}</div><div class="stat-lbl">In Progress</div></div>
</div></div>
<div class="section"><h2>Completion Milestones</h2>${milRows}</div>
<div class="section"><h2>Questions (${qs.length})</h2>
<table><thead><tr><th>#</th><th>Question</th><th>Type</th><th>Responses</th></tr></thead><tbody>${qRows}</tbody></table>
</div>
<div class="footer">Generated by Axiora Pulse</div>
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }

  function excel() {
  try {
    // ── Safe file name ──────────────────────────────────────────────────────
    const safeFileName = (sv?.title || 'survey')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim() || 'survey';

    // ── Answer lookup map (O(1) vs O(n×m)) ─────────────────────────────────
    const ansMap = {};
    (ans || []).forEach(a => {
      ansMap[`${a.response_id}::${a.question_id}`] = a;
    });
    const answerFor = (responseId, questionId) => {
      const a = ansMap[`${responseId}::${questionId}`];
      if (!a) return '';
      return a.answer_value || (a.answer_json ? JSON.stringify(a.answer_json) : '');
    };

    // ── Analytics destructure with safe fallbacks ───────────────────────────
    const {
      total        = 0,
      completedCount  = 0,
      abandonedCount  = 0,
      completionRate  = 0,
      avgTimeMin      = null,
      milestones      = { pct25: 0, pct50: 0, pct75: 0, pct100: 0 },
    } = analytics || {};
    const inProgress = Math.max(0, total - completedCount - abandonedCount);
    const safeQs       = qs       || [];
    const safeRs       = rs       || [];
    const safeFeedback = feedback || [];
    const safeQA       = analytics?.questionAnalytics || [];

    // ── Build workbook ──────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Responses
    const responseHeader = [
      '#', 'Status', 'Email', 'Started', 'Completed',
      ...safeQs.map(q => q.question_text),
    ];
    const responseRows = safeRs.map((r, i) => [
      i + 1,
      r.status || '',
      r.respondent_email || '',
      r.started_at  || '',
      r.completed_at || '',
      ...safeQs.map(q => answerFor(r.id, q.id)),
    ]);
    const responsesSheet = XLSX.utils.aoa_to_sheet([responseHeader, ...responseRows]);
    responsesSheet['!cols'] = responseHeader.map((h, i) => ({
      wch: i < 5 ? 18 : Math.min(Math.max(String(h).length + 4, 24), 55),
    }));
    XLSX.utils.book_append_sheet(wb, responsesSheet, 'Responses');

    // Sheet 2 — Overview
    const overviewSheet = XLSX.utils.aoa_to_sheet([
      ['Survey',          sv?.title  || 'Survey'],
      ['Status',          sv?.status || ''],
      ['Created',         sv?.created_at  || ''],
      ['Expires',         sv?.expires_at  || ''],
      [],
      ['Metric',          'Value'],
      ['Total Responses', total],
      ['Completed',       completedCount],
      ['In Progress',     inProgress],
      ['Abandoned',       abandonedCount],
      ['Completion Rate', `${completionRate}%`],
      ['Average Time',    avgTimeMin ? `${avgTimeMin}m` : '-'],
    ]);
    overviewSheet['!cols'] = [{ wch: 24 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, overviewSheet, 'Overview');

    // Sheet 3 — Milestones
    const pctOf = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';
    const milestonesSheet = XLSX.utils.aoa_to_sheet([
      ['Milestone', 'Respondents', 'Percentage'],
      ['25%',  milestones.pct25,  pctOf(milestones.pct25)],
      ['50%',  milestones.pct50,  pctOf(milestones.pct50)],
      ['75%',  milestones.pct75,  pctOf(milestones.pct75)],
      ['100%', milestones.pct100, pctOf(milestones.pct100)],
    ]);
    milestonesSheet['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, milestonesSheet, 'Milestones');

    // Sheet 4 — Questions
    const questionsSheet = XLSX.utils.aoa_to_sheet([
      ['#', 'Question', 'Type', 'Responses'],
      ...safeQs.map((q, i) => [
        i + 1,
        q.question_text || '',
        (q.question_type || '').replace(/_/g, ' '),
        safeQA[i]?.data?.total ?? 0,
      ]),
    ]);
    questionsSheet['!cols'] = [{ wch: 8 }, { wch: 60 }, { wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, questionsSheet, 'Questions');

    // Sheet 5 — Feedback
    const feedbackSheet = XLSX.utils.aoa_to_sheet([
      ['#', 'Rating', 'Comment'],
      ...safeFeedback.map((f, i) => [i + 1, f.rating ?? '', f.comment || '']),
    ]);
    feedbackSheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, feedbackSheet, 'Feedback');

    // ── Download — works in all browsers, sandboxed iframes, mobile ─────────
    const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob    = new Blob([wbArray], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `${safeFileName}.xlsx`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Small delay before cleanup — Safari needs the file to finish downloading
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 250);

  } catch (err) {
    console.error('[Excel export failed]', err);
    toast.error('Export failed — please try again.');
  }
}

const smallBtn = {
  ...S.exportBtn,
  padding: '7px 12px',
  fontSize: 9,
  letterSpacing: '0.08em',
  gap: 4,
  minHeight: 30,
  whiteSpace: 'nowrap',
};

  if (!sv) return (
    <div style={{ textAlign:'center', padding:'80px 0', fontFamily:'Fraunces,serif', color:'rgba(22,15,8,0.3)' }}>Survey not found</div>
  );

  return (
    <div style={{ maxWidth:940, margin:'0 auto' }}>

      {/* ── Page header ── */}
      <div className="np-page-header" style={{ marginBottom: 32 }}>
        <div>
          <Link to={`/surveys/${id}/edit`} style={{ ...S.backLink, display: 'flex', alignItems: 'center', gap: 5 }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--coral)'}
            onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.35)'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to survey
          </Link>
          <div style={S.tag}>Analytics</div>
          <h1 style={S.h1}>{sv.title}</h1>
          <div style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.35)', marginTop:8 }}>
            {sv.status.charAt(0).toUpperCase()+sv.status.slice(1)} · Created {formatDateTime(sv.created_at)}
            {sv.expires_at && ` · Expires ${formatDateTime(sv.expires_at)}`}
          </div>
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center', marginLeft: -550, paddingRight: 8 }}>
          <div style={{ width: 1, height: 24, background: 'rgba(22,15,8,0.1)', margin: '0 4px' }} />
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); import('react-hot-toast').then(m => m.default.success('Analytics link copied!')); }}   style={{ ...smallBtn, display: 'flex', alignItems: 'center' }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--coral)'; e.currentTarget.style.color='var(--coral)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor='rgba(22,15,8,0.12)'; e.currentTarget.style.color='rgba(22,15,8,0.55)'; }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            Share
          </button>
          <div ref={dlRef} style={{ position: 'relative' }}>
            <button onClick={() => setDlOpen(o => !o)} style={{ ...smallBtn, display: 'flex', alignItems: 'center' }}
              aria-haspopup="true" aria-expanded={dlOpen}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--espresso)'; e.currentTarget.style.color='var(--espresso)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='rgba(22,15,8,0.12)'; e.currentTarget.style.color='rgba(22,15,8,0.55)'; }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.15s', transform: dlOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>

            {dlOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                minWidth: 140, padding: 4, background: '#fff',
                border: '1px solid rgba(22,15,8,0.12)', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(22,15,8,0.12)',
                display: 'flex', flexDirection: 'column',
              }}>
                {[
                  { label: 'CSV',  onClick: csv },
                  { label: 'XLSX', onClick: excel },
                  { label: 'PDF',  onClick: exportPDF },
                ].map(opt => (
                  <button key={opt.label}
                    onClick={() => { setDlOpen(false); opt.onClick(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 10px',
                      background: 'transparent', border: 'none', borderRadius: 7,
                      cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'Syne,sans-serif', fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.04em', color: 'rgba(22,15,8,0.7)',
                    }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='rgba(22,15,8,0.05)'; e.currentTarget.style.color='var(--espresso)'; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(22,15,8,0.7)'; }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <TabBar active={tab} onChange={setTab} />

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
          transition={{ duration:0.2, ease:[0.16,1,0.3,1] }}>

          {tab === 'Overview'     && <OverviewTab     analytics={analytics} trendDays={trendDays} setTrendDays={setTrendDays} survey={sv} />}
          {tab === 'Sources'      && <SourcesTab      analytics={analytics} />}
          {tab === 'Dropoff'      && <DropoffTab      analytics={analytics} />}
          {tab === 'Questions'    && <QuestionsTab    analytics={analytics} />}
          {tab === 'TextInsights' && <TextInsightsTab analytics={analytics} />}
          {tab === 'Feedback'     && <FeedbackTab feedback={feedback} />}
          {tab === 'AI'           && (
            <AIInsightsPanel
              survey={sv}
              analytics={analytics}
              questionAnalytics={analytics.questionAnalytics}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Responses table only in Overview ── */}
      {tab === 'Overview' && (
        <motion.div
          initial={{ opacity:0 }}
          animate={{ opacity:1 }}
          transition={{ delay:0.3 }}
          style={{ marginTop:40 }}
        >
          <ResponsesTable rs={rs} qs={qs} ans={ans} />
        </motion.div>
      )}
    </div>
  );
}
