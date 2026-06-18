import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../api/axios';

/**
 * AIInsightsPanel — Advanced Analytics Dashboard
 * ─────────────────────────────────────────────────────────────────
 * Calls /ai/surveys/:id/insights and renders a comprehensive,
 * research-grade AI analysis with rich visualisations.
 *
 * Props
 * ─────
 *  survey            { title, id }
 *  analytics         — object from useAnalytics()
 *  questionAnalytics — array from analytics.questionAnalytics
 */

// ── Design tokens ────────────────────────────────────────────────────────────

const FONTS = {
  display: 'Playfair Display,serif',
  heading: 'Syne,sans-serif',
  body:    'Fraunces,serif',
};

const S = {
  label:   { fontFamily:FONTS.heading, fontSize:10, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' },
  h3:      { fontFamily:FONTS.display, fontWeight:900, fontSize:17, letterSpacing:'-0.3px', color:'var(--espresso)', lineHeight:1.25 },
  body:    { fontFamily:FONTS.body, fontWeight:300, fontSize:14, color:'rgba(22,15,8,0.65)', lineHeight:1.65 },
  card:    { background:'var(--warm-white)', borderRadius:20, border:'1px solid rgba(22,15,8,0.07)', padding:'24px 24px 20px' },
  section: { marginBottom:0 },
};

const TYPE_ICONS = {
  positive: { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>, bg: 'rgba(30,122,74,0.08)',  border: 'rgba(30,122,74,0.15)',  color: 'var(--sage)'       },
  warning:  { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, bg: 'rgba(255,184,0,0.08)',   border: 'rgba(255,184,0,0.2)',   color: '#A07000'            },
  info:     { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, bg: 'rgba(0,71,255,0.06)',    border: 'rgba(0,71,255,0.12)',   color: 'rgba(0,71,255,0.8)' },
  action:   { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>, bg: 'rgba(255,69,0,0.07)',    border: 'rgba(255,69,0,0.15)',   color: 'var(--coral)'       },
};

const PRIORITY_STYLES = {
  high:   { bg: 'rgba(214,59,31,0.1)',  color: 'var(--terracotta)' },
  medium: { bg: 'rgba(255,184,0,0.12)', color: '#A07000'            },
  low:    { bg: 'rgba(22,15,8,0.07)',   color: 'rgba(22,15,8,0.45)' },
};

const SENTIMENT_COLORS = {
  positive: '#1E7A4A',
  neutral:  'rgba(22,15,8,0.25)',
  negative: '#D63B1F',
  mixed:    '#A07000',
};

const URGENCY_COLORS = {
  critical: '#D63B1F',
  high:     '#FF4500',
  medium:   '#FFB800',
  low:      'rgba(22,15,8,0.25)',
};


// ── Score banding ────────────────────────────────────────────────────────────
// Dynamic colour intelligence — Red → Orange → Yellow → Green as the score climbs.
//   0–39   Low       red
//   40–59  Moderate  orange
//   60–79  Good      yellow
//   80–100 Strong    green

const BAND_RED    = '#FF4500';   // low      — brand coral
const BAND_ORANGE = '#FF8A00';   // moderate
const BAND_YELLOW = '#F5B700';   // good
const BAND_GREEN  = '#1E9E5A';   // strong

// Darkened, readable variants for label text on the cream / liquid surface.
const TEXT_RED    = '#FF4500';
const TEXT_ORANGE = '#C2410C';
const TEXT_YELLOW = '#9A6D00';
const TEXT_GREEN  = '#1E7A4A';

// Colour for any point on the 0-100 scale (used by the legend marker).
function gaugeColor(v) {
  return v >= 80 ? BAND_GREEN
       : v >= 60 ? BAND_YELLOW
       : v >= 40 ? BAND_ORANGE
       :           BAND_RED;
}

function gaugeBand(s) {
  if (s >= 80) return { name: 'Strong',   color: BAND_GREEN,  textColor: TEXT_GREEN,  context: 'Strong Market Demand',    desc: 'Respondents show strong, consistent intent and engagement.' };
  if (s >= 60) return { name: 'Good',     color: BAND_YELLOW, textColor: TEXT_YELLOW, context: 'Good Market Potential',   desc: 'Solid interest with good purchase potential.' };
  if (s >= 40) return { name: 'Moderate', color: BAND_ORANGE, textColor: TEXT_ORANGE, context: 'Moderate Engagement',     desc: 'Mixed interest — clear room to strengthen engagement.' };
  return            { name: 'Low',      color: BAND_RED,    textColor: TEXT_RED,    context: 'Low Market Interest',     desc: 'Weak engagement — responses signal hesitation or friction.' };
}

const GAUGE_LEGEND = [
  { range: '0 – 39',   name: 'Low',      color: BAND_RED    },
  { range: '40 – 59',  name: 'Moderate', color: BAND_ORANGE },
  { range: '60 – 79',  name: 'Good',     color: BAND_YELLOW },
  { range: '80 – 100', name: 'Strong',   color: BAND_GREEN  },
];

// hex → rgba with alpha
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ── Liquid Intelligence Gauge ─────────────────────────────────────────────────
// A fluid-filled circular gauge: liquid rises to the score %, with continuous
// wave motion, floating bubbles, a pulsing glow ring, and dynamic colour that
// tracks the score band. The number counts up from 0 on load and the liquid
// level animates smoothly whenever the score changes — waves never stop.

// Build the points of one sine wave across `width`.
function wavePoints(width, amp, waveLen) {
  const steps = Math.ceil(width / 6);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = amp * Math.sin((x / waveLen) * Math.PI * 2);
    pts.push([x, y]);
  }
  return pts;
}
// Closed path filling everything below the wave crest.
function waveFill(pts, width, depth) {
  let d = `M ${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (const [x, y] of pts) d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  return d + ` L ${width} ${depth} L 0 ${depth} Z`;
}
// Open path of just the crest line (used for a surface highlight).
function waveLine(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (const [x, y] of pts) d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  return d;
}

const EASE = [0.16, 1, 0.3, 1];

function LiquidGauge({ score = 0, size = 248 }) {
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const band   = gaugeBand(target);
  const color  = band.color;

  // ── Geometry ────────────────────────────────────────────────────────────
  const cx = size / 2, cy = size / 2;
  const ringR = size / 2 - 11;       // glowing progress ring radius
  const R     = ringR - 9;           // liquid container radius (sits inside ring)
  const top = cy - R, fullH = 2 * R, bottom = cy + R;
  const amp = 7, waveLen = R * 2, width = R * 4, depth = fullH + amp + 16;

  const fill   = target / 100;
  const levelY = top + (1 - fill) * fullH;   // y of the water surface
  const emptyY = bottom;                       // surface when empty (mount start)

  const pts = wavePoints(width, amp, waveLen);
  const fillD = waveFill(pts, width, depth);
  const lineD = waveLine(pts);

  // ── Progress ring (drawn from the top, clockwise) ────────────────────────
  const C   = 2 * Math.PI * ringR;
  const ang = (-90 + 360 * fill) * Math.PI / 180;
  const knob = { x: cx + ringR * Math.cos(ang), y: cy + ringR * Math.sin(ang) };

  // ── Count-up number (from current value → target) ───────────────────────
  const [display, setDisplay] = useState(0);
  const dispRef = useRef(0);
  useEffect(() => {
    const from = dispRef.current, to = target, dur = 1500, t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      dispRef.current = v; setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // ── Floating bubbles ─────────────────────────────────────────────────────
  const travelTop = Math.min(bottom - 10, levelY + 14);
  const bubbles = [
    { x: cx - 34, r: 3.2, dur: 4.2, delay: 0   },
    { x: cx + 28, r: 2.4, dur: 5.0, delay: 0.8 },
    { x: cx + 6,  r: 4.0, dur: 5.8, delay: 1.6 },
    { x: cx - 14, r: 2.0, dur: 3.8, delay: 2.4 },
    { x: cx + 40, r: 2.8, dur: 4.6, delay: 1.1 },
    { x: cx - 46, r: 2.2, dur: 5.4, delay: 3.0 },
  ];

  return (
    <motion.div
      whileHover="hover"
      initial="rest"
      animate="rest"
      variants={{ rest: { y: 0 }, hover: { y: -5 } }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'relative', display: 'block' }}>
        <defs>
          <clipPath id="liq-clip"><circle cx={cx} cy={cy} r={R} /></clipPath>
          <radialGradient id="liq-bg" cx="50%" cy="38%" r="78%">
            <stop offset="0%"   stopColor="#FFFDF8" />
            <stop offset="100%" stopColor={rgba(color, 0.1)} />
          </radialGradient>
          <linearGradient id="liq-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={rgba(color, 0.95)} />
            <stop offset="100%" stopColor={rgba(color, 0.7)} />
          </linearGradient>
          <linearGradient id="liq-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={rgba(color, 0.55)} />
            <stop offset="100%" stopColor={rgba(color, 0.35)} />
          </linearGradient>
        </defs>

        {/* light glass container */}
        <circle cx={cx} cy={cy} r={R} fill="url(#liq-bg)" />

        {/* liquid (clipped to the circle) */}
        <g clipPath="url(#liq-clip)">
          <motion.g
            initial={{ y: emptyY }}
            animate={{ y: levelY }}
            transition={{ duration: 1.6, ease: EASE }}
          >
            {/* back wave — slower, drifts left */}
            <motion.g
              animate={{ x: [0, -waveLen] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
            >
              <path d={fillD} fill="url(#liq-back)" />
            </motion.g>

            {/* front wave — faster, drifts right */}
            <motion.g
              animate={{ x: [-waveLen, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            >
              <path d={fillD} fill="url(#liq-front)" />
              <path d={lineD} fill="none" stroke={rgba('#ffffff', 0.4)} strokeWidth={1.5} />
            </motion.g>
          </motion.g>

          {/* bubbles rising through the liquid */}
          {bubbles.map((b, i) => (
            <motion.circle
              key={i} cx={b.x} r={b.r} fill={rgba('#ffffff', 0.4)}
              initial={{ cy: bottom - 6, opacity: 0 }}
              animate={{ cy: [bottom - 6, travelTop], opacity: [0, 0.65, 0] }}
              transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: 'easeIn' }}
            />
          ))}

          {/* subtle inner shading for glass depth */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={rgba('#160F08', 0.06)} strokeWidth={5} style={{ filter: 'blur(3px)' }} />
        </g>

        {/* vessel edge + glass highlight */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={rgba(color, 0.3)} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={R - 1.5} fill="none" stroke={rgba('#ffffff', 0.55)} strokeWidth={1} />

        {/* soft pulsing glow — locked to the ring radius so it never drifts */}
        <motion.circle
          cx={cx} cy={cy} r={ringR} fill="none" stroke={color} strokeWidth={3}
          style={{ filter: 'blur(4px)' }}
          variants={{ rest: { opacity: [0.18, 0.4, 0.18] }, hover: { opacity: 0.6 } }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* progress ring — faint track */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={rgba(color, 0.16)} strokeWidth={3} />

        {/* progress ring — glowing value arc.
            Rotation lives on a static <g> (not the motion.circle) — framer-motion
            overrides a transform attribute set directly on an animated element. */}
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <motion.circle
            cx={cx} cy={cy} r={ringR} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - fill) }}
            transition={{ duration: 1.6, ease: EASE, delay: 0.2 }}
            style={{ filter: `drop-shadow(0 0 6px ${rgba(color, 0.6)})` }}
          />
        </g>

        {/* knob at the end of the arc — white with coloured ring so it reads on cream */}
        <motion.circle
          cx={knob.x} cy={knob.y} r={6.5} fill="#fff" stroke={color} strokeWidth={2.5}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.4, ease: EASE }}
          style={{ transformOrigin: `${knob.x}px ${knob.y}px`, filter: 'drop-shadow(0 1px 4px rgba(22,15,8,0.28))' }}
        />
      </svg>

      {/* centre content */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontFamily: FONTS.display, fontWeight: 900, fontSize: 56, letterSpacing: '-1px', color: 'var(--espresso)', lineHeight: 1, textShadow: '0 1px 2px rgba(255,251,244,0.5)' }}>{display}</span>
          <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 13, color: 'rgba(22,15,8,0.4)', letterSpacing: '0.02em' }}>/ 100</span>
        </div>
        <motion.div
          key={band.context}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }}
          style={{ marginTop: 12 }}
        >
          <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', color: band.textColor, marginBottom: 4 }}>{band.context}</div>
          <div style={{ fontFamily: FONTS.body, fontWeight: 300, fontSize: 11, color: 'rgba(22,15,8,0.55)', lineHeight: 1.45, maxWidth: 150, margin: '0 auto' }}>{band.desc}</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Score legend + meaning ────────────────────────────────────────────────────

function ScoreLegend({ score }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div>
      {/* gradient track with marker */}
      <div style={{ position: 'relative', height: 8, borderRadius: 999, marginBottom: 16, background: 'linear-gradient(90deg, #FF4500 0%, #FFB800 45%, #A8C13A 72%, #1E7A4A 100%)' }}>
        <motion.div
          initial={{ left: '0%', opacity: 0 }} animate={{ left: `${s}%`, opacity: 1 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `3px solid ${gaugeColor(s)}`, boxShadow: '0 2px 6px rgba(22,15,8,0.2)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 12px' }}>
        {GAUGE_LEGEND.map(b => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.heading, fontSize: 11, fontWeight: 700, color: 'var(--espresso)', lineHeight: 1.2 }}>{b.range}</div>
              <div style={{ fontFamily: FONTS.body, fontWeight: 300, fontSize: 11, color: 'rgba(22,15,8,0.5)', lineHeight: 1.2 }}>{b.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sentiment Bar ────────────────────────────────────────────────────────────

function SentimentBar({ breakdown }) {
  if (!breakdown) return null;
  const { positive, neutral, negative } = breakdown;
  const segments = [
    { pct: positive, color: SENTIMENT_COLORS.positive, label: 'Positive' },
    { pct: neutral,  color: SENTIMENT_COLORS.neutral,  label: 'Neutral'  },
    { pct: negative, color: SENTIMENT_COLORS.negative, label: 'Negative' },
  ].filter(s => s.pct > 0);

  return (
    <div>
      <div style={{ display:'flex', height:28, borderRadius:10, overflow:'hidden', gap:2, marginBottom:12 }}>
        {segments.map((s, i) => (
          <motion.div key={s.label}
            initial={{ scaleX:0, originX:0 }}
            animate={{ scaleX:1 }}
            transition={{ duration:0.8, delay:0.3 + i*0.1, ease:[0.16,1,0.3,1] }}
            style={{ width:`${s.pct}%`, background:s.color, display:'flex', alignItems:'center', justifyContent:'center', minWidth: s.pct > 8 ? 32 : 0 }}
          >
            {s.pct > 12 && <span style={{ fontFamily:FONTS.heading, fontSize:10, fontWeight:700, color:'#fff', letterSpacing:'0.05em' }}>{s.pct}%</span>}
          </motion.div>
        ))}
      </div>
      <div style={{ display:'flex', gap:20 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }} />
            <span style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.5)' }}>
              {s.label} <strong style={{ color:'var(--espresso)', fontWeight:600 }}>{s.pct}%</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ label, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.45, delay, ease:[0.16,1,0.3,1] }}
    >
      {label && <div style={{ ...S.label, marginBottom:14 }}>{label}</div>}
      {children}
    </motion.div>
  );
}

// ── Structured PDF report builder ─────────────────────────────────────────────
// Lays the AI result out as real, selectable text with proper headings, wrapping
// and page breaks — instead of screenshotting the DOM (which mangled pagination).

function buildInsightsReport(doc, r, survey) {
  if (!r) throw new Error('No insights to export');

  const M = 48;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const CW = W - M * 2;
  const INK = '#15100A', BODY = '#6E6354', SUB = '#6E6354', FAINT = '#A99C87', LINE = '#E8DEC9', CORAL = '#FF4500';
  let y = M;

  // jsPDF's standard fonts choke on some Unicode punctuation — normalise to ASCII.
  const ascii = (s) => String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '-');

  const sentColor = (s) => ({ positive: '#1E9E5A', negative: '#D63B1F', neutral: '#8A8071', mixed: '#C2410C' }[s] || '#8A8071');
  const urgColor  = (u) => ({ critical: '#D63B1F', high: '#FF4500', medium: '#C2410C', low: '#8A8071' }[u] || '#C2410C');

  function footer() {
    const p = doc.internal.getCurrentPageInfo().pageNumber;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#B8AE9C');
    doc.text('Axiora Pulse · Pulse Insights', M, H - 22);
    doc.text(`Page ${p}`, W - M, H - 22, { align: 'right' });
  }
  function pageBreak(needed) {
    if (y + needed > H - M - 24) { footer(); doc.addPage(); y = M; }
  }
  const gap = (h) => { y += h; };

  function para(text, o = {}) {
    if (text == null || text === '') return;
    const size = o.size || 10.5;
    const lh = o.lh || size * 1.45;
    const indent = o.indent || 0;
    const pad = o.prefix ? 18 : 0;
    doc.setFontSize(size);
    doc.setTextColor(o.color || BODY);
    doc.setFont('helvetica', o.bold ? 'bold' : (o.italic ? 'italic' : 'normal'));
    const lines = doc.splitTextToSize(ascii(text), CW - indent - pad);
    lines.forEach((line, i) => {
      pageBreak(lh);
      if (i === 0 && o.prefix) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(o.prefixColor || CORAL); doc.setFontSize(size);
        doc.text(o.prefix, M + indent, y);
        doc.setFont('helvetica', o.bold ? 'bold' : (o.italic ? 'italic' : 'normal')); doc.setTextColor(o.color || BODY);
      }
      doc.text(line, M + indent + pad, y);
      y += lh;
    });
  }

  function sectionLabel(text) {
    pageBreak(56);
    gap(16);
    // coral accent bar + spaced label
    doc.setFillColor(CORAL); doc.rect(M, y - 8, 3.5, 11, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(CORAL);
    doc.text(text.toUpperCase(), M + 11, y, { charSpace: 1.8 });
    gap(9);
    doc.setDrawColor(LINE); doc.setLineWidth(1);
    doc.line(M, y, M + CW, y);
    gap(17);
  }

  // ── Title ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(INK);
  doc.text('AI Deep Analysis', M, y + 8); gap(28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(SUB);
  doc.text(ascii(survey?.title || 'Survey insights'), M, y); gap(16);
  doc.setFontSize(9); doc.setTextColor(FAINT);
  doc.text(`Generated ${new Date().toLocaleString()}`, M, y); gap(12);
  doc.setDrawColor(LINE); doc.setLineWidth(1.2); doc.line(M, y, M + CW, y);

  // ── Score + scale ──
  if (r.overallScore != null) {
    const s = Math.round(r.overallScore);
    const band = gaugeBand(s);
    pageBreak(90);
    gap(18);
    const topY = y;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(40); doc.setTextColor(band.color);
    doc.text(String(s), M, topY + 24);
    const numW = doc.getTextWidth(String(s));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(FAINT);
    doc.text('/100', M + numW + 6, topY + 24);

    const tx = M + numW + 54;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(INK);
    doc.text(ascii(band.context), tx, topY + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(SUB);
    const dl = doc.splitTextToSize(ascii(band.desc), M + CW - tx);
    let dy = topY + 22;
    dl.forEach(l => { doc.text(l, tx, dy); dy += 13; });
    y = Math.max(topY + 34, dy) + 14;

    // colour scale
    const segs = ['#FF4500', '#FF8A00', '#F5B700', '#1E9E5A'];
    const labels = [['0-39', 'Low'], ['40-59', 'Moderate'], ['60-79', 'Good'], ['80-100', 'Strong']];
    const segW = CW / 4, barH = 6;
    segs.forEach((c, i) => { doc.setFillColor(c); doc.rect(M + i * segW, y, segW, barH, 'F'); });
    const mx = M + Math.max(0, Math.min(1, s / 100)) * CW;
    doc.setDrawColor(gaugeColor(s)); doc.setLineWidth(2); doc.setFillColor('#FFFFFF');
    doc.circle(mx, y + barH / 2, 4.5, 'FD');
    gap(barH + 13);
    labels.forEach((lb, i) => {
      const lx = M + i * segW;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(segs[i]);
      doc.text(lb[0], lx, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(SUB);
      doc.text(lb[1], lx + doc.getTextWidth(lb[0]) + 6, y);
    });
    gap(8);
  }

  // ── Executive Summary ──
  if (r.executiveSummaryBullets?.length || r.executiveSummary) {
    sectionLabel('Executive Summary');
    if (r.executiveSummaryBullets?.length) {
      r.executiveSummaryBullets.forEach((b, i) => { para(b, { prefix: `${i + 1}.`, size: 10.5, color: '#3A3328', lh: 16 }); gap(7); });
    } else para(r.executiveSummary);
  }

  // ── Sentiment ──
  if (r.sentimentBreakdown) {
    sectionLabel('Sentiment Analysis');
    const { positive = 0, neutral = 0, negative = 0, overall } = r.sentimentBreakdown;
    const total = Math.max(1, positive + neutral + negative);
    pageBreak(46);
    const barH = 14; let bx = M;
    [['#1E9E5A', positive], ['#C9C0B2', neutral], ['#D63B1F', negative]].forEach(([c, v]) => {
      const w = CW * (v / total); doc.setFillColor(c); doc.rect(bx, y, w, barH, 'F'); bx += w;
    });
    gap(barH + 14);
    para(`Positive ${positive}%     Neutral ${neutral}%     Negative ${negative}%`, { size: 9.5, color: SUB });
    if (overall) para(`Overall sentiment: ${String(overall).toUpperCase()}`, { size: 9.5, bold: true, color: sentColor(overall) });
  }

  // ── NPS ──
  if (r.npsAnalysis) { sectionLabel('NPS Interpretation'); para(r.npsAnalysis); }

  // ── Key Themes ──
  if (r.keyThemes?.length) {
    sectionLabel('Key Themes');
    r.keyThemes.forEach(t => {
      pageBreak(38);
      const tag = t.sentiment ? String(t.sentiment).toUpperCase() : '';
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(INK);
      const tagW = tag ? doc.getTextWidth(tag) + 10 : 0;
      const titleLines = doc.splitTextToSize(ascii(t.theme || ''), CW - tagW);
      doc.text(titleLines, M, y);
      if (tag) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(sentColor(t.sentiment)); doc.text(tag, M + CW, y, { align: 'right', charSpace: 0.5 }); }
      y += titleLines.length * 16;
      gap(2);
      if (t.frequency) para(t.frequency, { size: 8.5, color: FAINT });
      (t.quotes || []).slice(0, 3).forEach(q => para(`"${q}"`, { size: 9.5, italic: true, color: FAINT, indent: 10 }));
      gap(9);
    });
  }

  // ── Key Findings ──
  if (r.insights?.length) {
    sectionLabel('Key Findings');
    r.insights.forEach(ins => {
      pageBreak(34);
      para(ins.title, { bold: true, size: 12, color: INK });
      gap(2);
      if (ins.detail) para(ins.detail, { size: 10, color: BODY });
      if (ins.metric) para(String(ins.metric).toUpperCase(), { size: 8, bold: true, color: CORAL });
      gap(8);
    });
  }

  // ── Respondent Segments ──
  if (r.respondentSegments?.length) {
    sectionLabel('Respondent Segments');
    r.respondentSegments.forEach(seg => {
      pageBreak(34);
      para(`${seg.segment}${seg.size ? '   ' + seg.size : ''}`, { bold: true, size: 12, color: INK });
      gap(2);
      if (seg.characteristics) para(seg.characteristics, { size: 10, color: BODY });
      if (seg.keyDifference) para(`Key difference: ${seg.keyDifference}`, { size: 9.5, italic: true, color: FAINT, indent: 10 });
      gap(8);
    });
  }

  // ── Urgency ──
  if (r.urgencyMatrix?.length) {
    sectionLabel('What Needs Your Attention');
    r.urgencyMatrix.forEach(it => {
      pageBreak(32);
      const head = `${it.urgency ? '[' + String(it.urgency).toUpperCase() + '] ' : ''}${it.issue || ''}`;
      para(head, { bold: true, size: 11.5, color: urgColor(it.urgency) });
      gap(1);
      if (it.evidence) para(it.evidence, { size: 10, color: BODY });
      gap(7);
    });
  }

  // ── Strengths / Improvements ──
  if (r.topStrengths?.length) {
    sectionLabel('Top Strengths');
    r.topStrengths.forEach(s => para(s, { prefix: '+', prefixColor: '#1E9E5A', size: 10 }));
  }
  if (r.improvementAreas?.length) {
    sectionLabel('Areas to Improve');
    r.improvementAreas.forEach(a => para(a, { prefix: '!', prefixColor: '#C2410C', size: 10 }));
  }

  // ── Recommended Actions ──
  if (r.recommendedActions?.length) {
    sectionLabel('Recommended Actions');
    r.recommendedActions.forEach((a, i) => {
      para(a.action, { prefix: `${i + 1}.`, bold: true, size: 11.5, color: INK });
      if (a.impact) para(a.impact, { size: 9.5, color: BODY, indent: 18 });
      gap(8);
    });
  }

  footer();
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AIInsightsPanel({ survey, analytics, questionAnalytics }) {
  const [state,  setState] = useState('checking');  // checking | idle | loading | done | error
  const [result, setResult] = useState(null);
  const [meta,   setMeta] = useState(null);          // { newResponses, needsRefresh, threshold, generatedAt }
  const [errMsg, setErrMsg] = useState('');

  // Export (PDF)
  const [exporting, setExporting] = useState(false);   // false | 'pdf'

  // On mount, load any previously-generated insights instead of always prompting.
  // The AI is only re-run when the user asks, or after enough new responses arrive.
  useEffect(() => {
    if (!survey?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await API.get(`/ai/surveys/${survey.id}/insights/status`);
        if (cancelled) return;
        if (data?.insights) {
          setResult(data.insights);
          setMeta(data);
          setState('done');
        } else {
          setState('idle');
        }
      } catch {
        if (!cancelled) setState('idle');   // fall back to the manual generate prompt
      }
    })();
    return () => { cancelled = true; };
  }, [survey?.id]);

  async function generate() {
    if (state === 'loading') return;
    setState('loading');
    setResult(null);

    try {
      const { data } = await API.get(`/ai/surveys/${survey.id}/insights`);
      setResult(data.insights ?? data);
      setMeta(data.insights ? data : null);
      setState('done');
    } catch (e) {
      console.error('AI insights:', e);
      setErrMsg(e.response?.data?.detail || 'Could not connect to AI — ensure your API key is set on the server.');
      setState('error');
    }
  }

  // ── Export helpers ──────────────────────────────────────────────────────────
  function exportFileBase() {
    const slug = (survey?.title || 'survey')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return `${slug || 'survey'}-ai-insights`;
  }

  // async function exportPDF() {
  //   if (exporting) return;
  //   setExporting('pdf');
  //   const id = toast.loading('Building PDF report…');
  //   try {
  //     const { jsPDF } = await import('jspdf');
  //     const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  //     buildInsightsReport(doc, result, survey);
  //     doc.save(`${exportFileBase()}.pdf`);
  //     toast.success('PDF report downloaded', { id });
  //   } catch (e) {
  //     console.error('PDF export:', e);
  //     toast.error('Could not export PDF', { id });
  //   } finally {
  //     setExporting(false);
  //   }
  // }

  // ─── Checking for an existing analysis (initial mount) ────────────────────
  if (state === 'checking') return (
    <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:'48px 32px' }}>
      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        style={{ display:'inline-block', width:16, height:16, border:'2px solid rgba(22,15,8,0.15)', borderTopColor:'var(--coral)', borderRadius:'50%' }} />
      <span style={{ fontFamily:FONTS.heading, fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.4)' }}>Loading Pulse Insights…</span>
    </div>
  );

  // ─── Idle / Loading / Error state ─────────────────────────────────────────
  if (state !== 'done') return (
    <div style={{ ...S.card, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'36px 32px', gap:16 }}>
      <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,69,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </div>
      <div>
        <div style={{ fontFamily:FONTS.display, fontWeight:900, fontSize:20, letterSpacing:'-0.5px', color:'var(--espresso)', marginBottom:8 }}>Pulse Insights</div>
        <p style={{ ...S.body, margin:0, maxWidth:380, color:'rgba(22,15,8,0.45)' }}>
          {state === 'error'
            ? errMsg
            : 'Generate a comprehensive research-grade analysis — health score, sentiment analysis, thematic clusters, cross-question patterns, audience segments, urgency mapping, and prioritised actions.'}
        </p>
      </div>
      {analytics.total === 0 && (
        <p style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', margin:0 }}>
          Collect at least 1 response first
        </p>
      )}
      <motion.button
        whileHover={{ scale: analytics.total > 0 ? 1.02 : 1, y: analytics.total > 0 ? -2 : 0 }}
        whileTap={{ scale: 0.97 }}
        disabled={state === 'loading' || analytics.total === 0}
        onClick={generate}
        style={{ padding:'12px 28px', borderRadius:999, border:'none', background: analytics.total === 0 ? 'rgba(22,15,8,0.08)' : 'var(--espresso)', color: analytics.total === 0 ? 'rgba(22,15,8,0.3)' : 'var(--cream)', fontFamily:FONTS.heading, fontWeight:700, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', cursor: analytics.total === 0 ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:8, transition:'all 0.2s' }}>
        {state === 'loading' ? (
          <>
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(253,245,232,0.3)', borderTopColor:'var(--cream)', borderRadius:'50%' }} />
            Analysing…
          </>
        ) : state === 'error' ? '↺ Retry' : '✦ Generate Deep Analysis'}
      </motion.button>
    </div>
  );

  // ─── Results Dashboard ────────────────────────────────────────────────────
  const r = result;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y:  0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ display:'flex', flexDirection:'column', gap:22 }}>

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,69,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <span style={{ fontFamily:FONTS.display, fontWeight:900, fontSize:18, letterSpacing:'-0.5px', color:'var(--espresso)' }}>Pulse Analysis</span>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <button
              onClick={exportPDF}
              disabled={!!exporting}
              style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 15px', borderRadius:999, border:'1px solid rgba(22,15,8,0.12)', background:'var(--warm-white)', color:'var(--espresso)', fontFamily:FONTS.heading, fontWeight:700, fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', cursor: exporting ? 'default' : 'pointer', transition:'all 0.2s', opacity: exporting ? 0.7 : 1 }}
              onMouseEnter={e => { if (!exporting) e.currentTarget.style.borderColor = 'var(--coral)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.12)'; }}>
              {exporting ? (
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  style={{ display:'inline-block', width:11, height:11, border:'2px solid rgba(22,15,8,0.2)', borderTopColor:'var(--coral)', borderRadius:'50%' }} />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              )}
              {exporting ? 'Saving PDF…' : 'Export PDF'}
            </button>

            <button onClick={() => setState('idle')}
              style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', background:'none', border:'none', cursor:'pointer', transition:'color 0.2s', padding:0 }}
              onMouseEnter={e=>e.currentTarget.style.color='var(--coral)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.3)'}>
              Regenerate ↺
            </button>
          </div>
        </div>

        {/* ─── New-responses nudge — only once enough have arrived ─────────── */}
        {meta?.needsRefresh && (
          <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, flexWrap:'wrap', padding:'12px 16px', borderRadius:14, background:'rgba(255,184,0,0.09)', border:'1px solid rgba(255,184,0,0.22)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:11 }}>
              <span style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,184,0,0.18)', color:'#9A6D00', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </span>
              <span style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.7)', lineHeight:1.45 }}>
                <strong style={{ fontFamily:FONTS.heading, fontWeight:700 }}>{meta.newResponses} new responses</strong> since this analysis — refresh to bring your insights up to date.
              </span>
            </div>
            <button onClick={generate}
              style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:999, border:'none', background:'var(--espresso)', color:'var(--cream)', fontFamily:FONTS.heading, fontWeight:700, fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', cursor:'pointer', flexShrink:0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Regenerate
            </button>
          </motion.div>
        )}

        {/* ─── Score Gauge + Executive Summary (side by side) ─────────────── */}
        <Section delay={0.03}>
          <div className="np-ai-score-grid"
            style={{ display:'grid', gridTemplateColumns: r.overallScore != null ? 'minmax(290px, 340px) 1fr' : '1fr', gap:14, alignItems:'stretch' }}>

            {/* Left — gauge + scale + meaning */}
            {r.overallScore != null && (
              <div style={{ ...S.card, paddingTop:24, display:'flex', flexDirection:'column' }}>
                <LiquidGauge score={r.overallScore} />
                <div style={{ height:1, background:'rgba(22,15,8,0.07)', margin:'22px 0 18px' }} />
                <ScoreLegend score={r.overallScore} />
                <div style={{ height:1, background:'rgba(22,15,8,0.07)', margin:'18px 0' }} />
                <div style={{ display:'flex', gap:13, alignItems:'flex-start' }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,69,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--coral)' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  </div>
                  <div>
                    <div style={{ ...S.h3, fontSize:14, marginBottom:4 }}>What does this score mean?</div>
                    <p style={{ ...S.body, fontSize:12, margin:0 }}>
                      Calculated by AI from your survey responses — sentiment, purchase intent,
                      recommendations and overall respondent engagement across every answer.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Right — executive summary */}
            <div style={{ ...S.card }}>
              <div style={{ ...S.label, marginBottom:12 }}>Executive Summary</div>
              {r.executiveSummaryBullets?.length > 0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {r.executiveSummaryBullets.map((bullet, i) => {
                    const [finding, action] = bullet.includes(' — ') ? bullet.split(/ — (.+)/) : [bullet, null];
                    return (
                      <motion.div key={i}
                        initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                        <div style={{ width:20, height:20, borderRadius:6, background:'rgba(255,69,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                          <span style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:9, color:'var(--coral)' }}>{i + 1}</span>
                        </div>
                        <div style={{ flex:1 }}>
                          <span style={{ ...S.body, fontSize:14, fontWeight:400, color:'var(--espresso)' }}>{finding}</span>
                          {action && (
                            <span style={{ ...S.body, fontSize:14, fontWeight:300, color:'rgba(22,15,8,0.5)' }}>{' — '}{action}</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : r.executiveSummary ? (
                <p style={{ ...S.body, margin:0, fontSize:15 }}>{r.executiveSummary}</p>
              ) : null}
            </div>
          </div>
        </Section>


        {/* ─── Sentiment + NPS row ────────────────────────────────────────── */}
        {(r.sentimentBreakdown || r.npsAnalysis) && (
          <Section delay={0.1}>
            <div style={{ display:'grid', gridTemplateColumns: r.sentimentBreakdown && r.npsAnalysis ? '1fr 1fr' : '1fr', gap:16 }}>
              {r.sentimentBreakdown && (
                <div style={{ ...S.card }}>
                  <div style={{ ...S.label, marginBottom:12 }}>Sentiment Analysis</div>
                  <SentimentBar breakdown={r.sentimentBreakdown} />
                  <div style={{ marginTop:10, fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color: SENTIMENT_COLORS[r.sentimentBreakdown.overall] || 'rgba(22,15,8,0.3)' }}>
                    Overall: {r.sentimentBreakdown.overall}
                  </div>
                </div>
              )}
              {r.npsAnalysis && (
                <div style={{ ...S.card, background:'rgba(22,15,8,0.02)' }}>
                  <div style={{ ...S.label, marginBottom:8 }}>NPS Interpretation</div>
                  <p style={{ ...S.body, margin:0 }}>{r.npsAnalysis}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ─── Key Themes ─────────────────────────────────────────────────── */}
        {r.keyThemes?.length > 0 && (
          <Section label="Key Themes" delay={0.15}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
              {r.keyThemes.map((t, i) => {
                const sc = SENTIMENT_COLORS[t.sentiment] || SENTIMENT_COLORS.neutral;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay: 0.15 + i*0.06 }}
                    style={{ ...S.card, padding:'18px 20px', borderLeft:`3px solid ${sc}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:13, color:'var(--espresso)', letterSpacing:'0.02em' }}>{t.theme}</div>
                      <span style={{ fontFamily:FONTS.heading, fontSize:8, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'2px 8px', borderRadius:999, background:`${sc}18`, color:sc, flexShrink:0 }}>{t.sentiment}</span>
                    </div>
                    <div style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.35)', marginBottom:8 }}>{t.frequency}</div>
                    {t.quotes?.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {t.quotes.slice(0, 2).map((q, qi) => (
                          <div key={qi} style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:12, fontStyle:'italic', color:'rgba(22,15,8,0.5)', padding:'6px 10px', borderRadius:8, background:'rgba(22,15,8,0.03)', borderLeft:'2px solid rgba(22,15,8,0.08)' }}>
                            "{q}"
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── Key Findings (insights) ────────────────────────────────────── */}
        {r.insights?.length > 0 && (
          <Section label="Key Findings" delay={0.2}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {r.insights.map((ins, i) => {
                const st = TYPE_ICONS[ins.type] || TYPE_ICONS.info;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.2 + i * 0.05 }}
                    style={{ display:'flex', gap:14, padding:'16px 18px', borderRadius:16, background:st.bg, border:`1px solid ${st.border}` }}>
                    <div style={{ width:26, height:26, borderRadius:8, background:st.border, display:'flex', alignItems:'center', justifyContent:'center', color:st.color, flexShrink:0 }}>{st.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:12, letterSpacing:'0.02em', color:'var(--espresso)', marginBottom:5 }}>{ins.title}</div>
                      <p style={{ ...S.body, margin:0, fontSize:13 }}>{ins.detail}</p>
                      {ins.metric && <span style={{ display:'inline-block', marginTop:6, fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:st.color }}>{ins.metric}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── Respondent Segments ─────────────────────────────────────────── */}
        {r.respondentSegments?.length > 0 && (
          <Section label="Respondent Segments" delay={0.3}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12 }}>
              {r.respondentSegments.map((seg, i) => {
                const sc = SENTIMENT_COLORS[seg.sentiment] || SENTIMENT_COLORS.neutral;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: 0.3 + i*0.06 }}
                    style={{ ...S.card, padding:'18px 20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:13, color:'var(--espresso)' }}>{seg.segment}</div>
                      <span style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.08em', color:sc }}>{seg.size}</span>
                    </div>
                    <p style={{ ...S.body, margin:'0 0 8px', fontSize:13 }}>{seg.characteristics}</p>
                    <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(22,15,8,0.03)', border:'1px solid rgba(22,15,8,0.05)' }}>
                      <div style={{ fontFamily:FONTS.heading, fontSize:8, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', marginBottom:3 }}>Key Difference</div>
                      <p style={{ ...S.body, margin:0, fontSize:12 }}>{seg.keyDifference}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── Urgency Matrix ─────────────────────────────────────────────── */}
        {r.urgencyMatrix?.length > 0 && (
          <Section label="What Needs Your Attention" delay={0.35}>
            <div style={{ ...S.card }}>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {r.urgencyMatrix.map((item, i) => {
                  const uc = URGENCY_COLORS[item.urgency] || URGENCY_COLORS.medium;
                  const impactLevel = item.impact === 'high' ? 100 : item.impact === 'medium' ? 60 : 30;
                  return (
                    <motion.div key={i}
                      initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.35 + i*0.05 }}
                      style={{ display:'flex', gap:14, alignItems:'center', padding:'12px 16px', borderRadius:14, background:'rgba(22,15,8,0.02)', border:'1px solid rgba(22,15,8,0.04)' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0, width:56 }}>
                        <span style={{ fontFamily:FONTS.heading, fontSize:8, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'3px 8px', borderRadius:999, background:`${uc}18`, color:uc }}>{item.urgency}</span>
                        <div style={{ width:40, height:4, borderRadius:999, background:'rgba(22,15,8,0.06)', overflow:'hidden' }}>
                          <motion.div
                            initial={{ width:0 }}
                            animate={{ width:`${impactLevel}%` }}
                            transition={{ duration:0.6, delay:0.4 + i*0.05 }}
                            style={{ height:'100%', background:uc, borderRadius:999 }}
                          />
                        </div>
                        <span style={{ fontFamily:FONTS.heading, fontSize:7, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.25)' }}>{item.impact} impact</span>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:12, color:'var(--espresso)', marginBottom:3 }}>{item.issue}</div>
                        <p style={{ ...S.body, margin:0, fontSize:12, color:'rgba(22,15,8,0.5)' }}>{item.evidence}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </Section>
        )}

        {/* ─── Strengths + Improvement Areas ──────────────────────────────── */}
        {(r.topStrengths?.length > 0 || r.improvementAreas?.length > 0) && (
          <Section delay={0.4}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {r.topStrengths?.length > 0 && (
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:14 }}>Top Strengths</div>
                  {r.topStrengths.map((s, i) => (
                    <motion.div key={i}
                      initial={{ opacity:0, x:-4 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.4 + i*0.04 }}
                      style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i < r.topStrengths.length-1 ? 10 : 0 }}>
                      <span style={{ color:'var(--sage)', fontWeight:700, flexShrink:0, marginTop:1 }}>✓</span>
                      <span style={{ ...S.body, fontSize:13 }}>{s}</span>
                    </motion.div>
                  ))}
                </div>
              )}
              {r.improvementAreas?.length > 0 && (
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:14 }}>Areas to Improve</div>
                  {r.improvementAreas.map((a, i) => (
                    <motion.div key={i}
                      initial={{ opacity:0, x:4 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.4 + i*0.04 }}
                      style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i < r.improvementAreas.length-1 ? 10 : 0 }}>
                      <span style={{ color:'var(--saffron)', fontWeight:700, flexShrink:0, marginTop:1 }}>△</span>
                      <span style={{ ...S.body, fontSize:13 }}>{a}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ─── Recommended Actions ────────────────────────────────────────── */}
        {r.recommendedActions?.length > 0 && (
          <Section label="Recommended Actions" delay={0.5}>
            <div style={S.card}>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {r.recommendedActions.map((a, i) => {
                  const ps = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.low;
                  return (
                    <motion.div key={i}
                      initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.5 + i*0.05 }}
                      style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flexShrink:0, minWidth:22 }}>
                        <span style={{ fontFamily:FONTS.display, fontWeight:900, fontSize:16, color:'rgba(22,15,8,0.15)', lineHeight:1 }}>{i+1}</span>
                        <span style={{ fontFamily:FONTS.heading, fontSize:7, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'2px 7px', borderRadius:999, background:ps.bg, color:ps.color }}>{a.priority}</span>
                      </div>
                      <div>
                        <div style={{ fontFamily:FONTS.body, fontWeight:400, fontSize:14, color:'var(--espresso)', marginBottom:3 }}>{a.action}</div>
                        <div style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.4)' }}>{a.impact}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </Section>
        )}


      </motion.div>
    </AnimatePresence>
  );
}
