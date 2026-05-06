import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api/axios';
import toast from 'react-hot-toast';

import RankingInput  from '../components/questions/RankingInput';
import SliderInput   from '../components/questions/SliderInput';
import MatrixInput   from '../components/questions/MatrixInput';
import SmartNudge    from '../components/SmartNudge';
import EstimatedTime from '../components/EstimatedTime';

import { useConditionalLogic } from '../hooks/useConditionalLogic';
import { useResponseTracking } from '../hooks/useResponseTracking';
import { useExitDetection }    from '../hooks/useExitDetection';

/**
 * EmbedView
 * ─────────────────────────────────────────────────────────────────
 * Stripped-down survey experience for /embed/:slug.
 * Designed to run inside an <iframe> on any third-party site.
 *
 * Differences from SurveyRespond:
 *  • No Axiora branding (iframe hosts often have their own)
 *  • No welcome-screen mesh blobs (too heavy in small iframes)
 *  • Minimal padding — fits compact embeds
 *  • Posts a "nx:completed" postMessage to the parent when done
 *  • Theme colour driven entirely by the survey's theme_color
 *  • FatigueShorter omitted (UX is already minimal)
 */

function getToken(slug) {
  const k = `nx_embed_${slug}`;
  let t = localStorage.getItem(k);
  if (!t) { t = 'e_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, t); }
  return t;
}

const slide = {
  enter:  dir => ({ y: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit:   dir => ({ y: dir > 0 ? -40 : 40, opacity: 0 }),
};

export default function EmbedView() {
  const { slug } = useParams();

  const [sv,         setSv]    = useState(null);
  const [qs,         setQs]    = useState([]);
  const [ans,        setAns]   = useState({});
  const [step,       setStep]  = useState(-1);
  const [dir,        setDir]   = useState(1);
  const [loading,    setL]     = useState(true);
  const [submitting, sSub]     = useState(false);
  const [done,       setDone]  = useState(false);
  const [err,        setErr]   = useState(null);
  const [email,      setEmail] = useState('');
  const [saved,      setSaved] = useState(false);

  const token = useRef(null);
  const timer = useRef(null);
  const cnt   = useRef(0);
  const rId   = useRef(null);

  const tracker = useResponseTracking(rId);
  useExitDetection(rId, tracker.onAbandon, done);

  const { visibleQuestions, nextVisible, prevVisible, progressAt } =
    useConditionalLogic(qs, ans);

  useEffect(() => { init(); return () => clearTimeout(timer.current); }, [slug]);

  async function init() {
    try {
      // 1. Load survey metadata by slug
      const { data: s } = await API.get(`/surveys/s/${slug}`);
      if (!s || s.status !== 'active') { setErr('Survey unavailable'); return; }
      if (s.expires_at && new Date(s.expires_at) < new Date()) { setErr('Survey has expired'); return; }
      setSv(s);
      token.current = getToken(slug);
      
      // 2. Load questions
      const { data: q } = await API.get(`/surveys/${s.id}/questions`);
      setQs(q || []);
      
      // 3. Try to resume session
      const { data: ex } = await API.get(`/responses/session/${token.current}`);
      if (ex) {
        rId.current = ex.id;
        const r = {}; 
        (ex.survey_answers||[]).forEach(a => { 
          r[a.question_id] = a.answer_json ?? a.answer_value ?? ''; 
        }); 
        setAns(r);
        const first = (q||[]).findIndex(x => !r[x.id]); 
        setStep(first >= 0 ? first : 0); 
        setSaved(true);
      } else { 
        setStep(s.welcome_message ? -1 : 0); 
      }
    } catch(e) { 
      console.error(e); 
      setErr(e.response?.data?.detail || 'Failed to load survey'); 
    }
    finally { setL(false); }
  }

  async function ensureR() {
    if (rId.current) return rId.current;
    try {
      const { data } = await API.post('/responses/', { 
        survey_id: sv.id, 
        session_token: token.current, 
        respondent_email: email || null 
      });
      if (data) rId.current = data.id;
      return rId.current;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  const autoSave = useCallback(async (a, id) => {
    if (!id) return;
    try {
      const answers = Object.entries(a).map(([qId, v]) => {
        const isObj = v !== null && typeof v === 'object';
        return {
          question_id: qId,
          answer_value: isObj ? null : String(v),
          answer_json: isObj ? v : null
        };
      });
      
      if (answers.length > 0) {
        await API.post(`/responses/${id}/answers`, answers);
      }
      setSaved(true);
    } catch(e) { console.error(e); }
  }, []);

  const setAn = async (qId, val) => {
    const next = { ...ans, [qId]: val }; setAns(next); tracker.onEdit(qId);
    const id = await ensureR(); cnt.current++;
    if (cnt.current >= 2) { cnt.current = 0; autoSave(next, id); tracker.flush(); }
    else { clearTimeout(timer.current); timer.current = setTimeout(() => { autoSave(next, id); tracker.flush(); cnt.current = 0; }, 5000); }
  };

  async function submit() {
    for (const q of visibleQuestions) {
      if (q.is_required && !ans[q.id]) { goTo(qs.indexOf(q)); return toast.error(`Please answer: "${q.question_text}"`); }
    }
    sSub(true);
    try {
      const id = await ensureR();
      if (!id) throw new Error('Could not initialize response');
      
      await tracker.onSubmit(ans, qs);
      await autoSave(ans, id);
      
      await API.post(`/responses/${id}/submit`, { 
        metadata: { completed_at: new Date().toISOString() } 
      });
      
      setDone(true);
      localStorage.removeItem(`nx_embed_${slug}`);
      window.parent?.postMessage({ type: 'nx:completed', slug, surveyTitle: sv?.title }, '*');
    } catch(e) { 
      console.error(e);
      toast.error('Submission failed — please try again.'); 
    }
    finally { sSub(false); }
  }

  function goTo(n) { setDir(n > step ? 1 : -1); setStep(n); }
  function goNext() {
    const q = qs[step]; if (q?.is_required && !ans[q.id]) return toast.error('This question is required');
    if (q) tracker.onLeave(q.id);
    const next = nextVisible(step);
    if (next !== null) { setDir(1); setStep(next); tracker.onEnter(qs[next]?.id); }
    else { setDir(1); setStep(qs.length); }
  }
  function goBack() {
    if (step >= 0 && qs[step]) tracker.onLeave(qs[step].id); tracker.onBack();
    const prev = prevVisible(step); setDir(-1);
    if (prev !== null) { setStep(prev); tracker.onEnter(qs[prev]?.id); }
    else if (sv?.welcome_message) setStep(-1); else setStep(0);
  }

  useEffect(() => { if (step >= 0 && qs[step]) tracker.onEnter(qs[step].id); }, []); // eslint-disable-line

  const tc           = sv?.theme_color || '#FF4500';
  const q            = qs[step];
  const onWelcome    = step === -1;
  const total        = qs.length;
  const pct          = step >= 0 ? progressAt(step) : 0;
  const visiblePos   = step >= 0 ? visibleQuestions.findIndex(vq => vq.id === q?.id) + 1 : 0;
  const visibleTotal = visibleQuestions.length;
  const isLastQ      = step >= 0 && nextVisible(step) === null;
  const [sessionStartMs] = useState(() => Date.now());
  const avgSecsPerQ = useMemo(() => {
    const answered = Object.keys(ans).length;
    if (answered < 2) return 0;
    return (Date.now() - sessionStartMs) / 1000 / answered;
  }, [ans, sessionStartMs]);
  const remainingQuestions = useMemo(() => visibleQuestions.filter(vq => !ans[vq.id]), [visibleQuestions, ans]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <motion.div animate={{ scaleX:[0.3,1,0.3] }} transition={{ repeat:Infinity, duration:1.6, ease:'easeInOut' }}
        style={{ width:32, height:2, borderRadius:2, background:tc || '#FF4500', transformOrigin:'center' }} />
    </div>
  );

  // ── Error ─────────────────────────────────────────────────────────────────
  if (err) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'#fff' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>⚠️</div>
        <p style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:15, color:'rgba(22,15,8,0.5)' }}>{err}</p>
      </div>
    </div>
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: `${tc}08`, padding:24 }}>
      <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.5, ease:[0.16,1,0.3,1] }}
        style={{ textAlign:'center', maxWidth:360 }}>
        <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:0.15, type:'spring', stiffness:180 }}
          style={{ width:64, height:64, borderRadius:'50%', background:`${tc}20`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 13l4 4L19 7" initial={{ pathLength:0 }} animate={{ pathLength:1 }} transition={{ delay:0.4, duration:0.5 }} />
          </svg>
        </motion.div>
        <h2 style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:28, letterSpacing:'-1px', color:'var(--espresso)', marginBottom:10 }}>Thank you.</h2>
        <p style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:15, color:'rgba(22,15,8,0.45)', lineHeight:1.7 }}>
          {sv?.thank_you_message || 'Your response has been recorded.'}
        </p>
      </motion.div>
    </div>
  );

  // ── Main embed layout (compact) ───────────────────────────────────────────
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', background: onWelcome ? 'var(--espresso,#160F08)' : '#fff', fontFamily:'Fraunces,serif' }}>

      {/* Thin top bar: progress + time estimate */}
      <div style={{ flexShrink:0, zIndex:10 }}>
        {step >= 0 && (
          <>
            {/* Progress bar */}
            <div style={{ height:3, background:'rgba(22,15,8,0.07)' }}>
              <motion.div animate={{ width:`${pct}%` }} transition={{ duration:0.4, ease:[0.16,1,0.3,1] }}
                style={{ height:'100%', background:tc }} />
            </div>
            {/* Step + time row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 20px' }}>
              <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.12em', textTransform:'uppercase', color:tc }}>{visiblePos}/{visibleTotal}</span>
              <EstimatedTime remainingQuestions={remainingQuestions} avgSecsPerQ={avgSecsPerQ} tc={tc} />
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>

          {/* Welcome */}
          {step === -1 && (
            <motion.div key="welcome" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ duration:0.4, ease:[0.16,1,0.3,1] }}
              style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:28, background:'var(--espresso,#160F08)' }}>
              <div style={{ textAlign:'center', maxWidth:440 }}>
                <motion.h1 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
                  style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:'clamp(22px,4vw,36px)', letterSpacing:'-1px', color:'#FDF5E8', lineHeight:1.1, marginBottom:14 }}>
                  {sv.title}
                </motion.h1>
                {sv.description && <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }} style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:15, color:'rgba(253,245,232,0.45)', lineHeight:1.65, marginBottom:10 }}>{sv.description}</motion.p>}
                {sv.welcome_message && <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.25 }} style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(253,245,232,0.3)', lineHeight:1.65, marginBottom:24 }}>{sv.welcome_message}</motion.p>}
                {sv.require_email && (
                  <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }} style={{ maxWidth:280, margin:'0 auto 20px' }}>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Your email"
                      style={{ width:'100%', boxSizing:'border-box', padding:'12px 16px', background:'rgba(253,245,232,0.1)', border:'1px solid rgba(253,245,232,0.15)', borderRadius:12, fontFamily:'Fraunces,serif', fontSize:14, color:'#FDF5E8', outline:'none', textAlign:'center', transition:'border-color 0.2s' }}
                      onFocus={e=>e.target.style.borderColor=tc} onBlur={e=>e.target.style.borderColor='rgba(253,245,232,0.15)'} />
                  </motion.div>
                )}
                <motion.button initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.35 }}
                  whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                  onClick={() => {
                    if (sv.require_email && !email) return toast.error('Please enter your email');
                    setDir(1);
                    const idx = qs.findIndex(q => visibleQuestions.some(vq=>vq.id===q.id));
                    const n = idx >= 0 ? idx : 0;
                    setStep(n); tracker.onEnter(qs[n]?.id);
                  }}
                  style={{ padding:'12px 32px', borderRadius:999, border:'none', background:tc, color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', cursor:'pointer', boxShadow:`0 6px 24px ${tc}40` }}>
                  Begin →
                </motion.button>
                <p style={{ fontFamily:'Syne,sans-serif', fontSize:8, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(253,245,232,0.18)', marginTop:18 }}>
                  {visibleTotal} question{visibleTotal!==1?'s':''} · ~{Math.max(1, Math.ceil(visibleTotal*0.5))} min
                </p>
              </div>
            </motion.div>
          )}

          {/* Question */}
          {step >= 0 && step < total && q && (
            <motion.div key={q.id} custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ duration:0.4, ease:[0.16,1,0.3,1] }}
              style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px 24px', overflowY:'auto' }}>
              <div style={{ width:'100%', maxWidth:560 }}>
                <div style={{ marginBottom:14 }}>
                  {q.is_required
                    ? <span style={{ fontFamily:'Syne,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(214,59,31,0.7)' }}>Required</span>
                    : <span style={{ fontFamily:'Syne,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.2)' }}>Optional</span>}
                </div>
                <motion.h2 initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1, duration:0.35 }}
                  style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:'clamp(18px,2.8vw,28px)', letterSpacing:'-0.5px', color:'var(--espresso,#160F08)', lineHeight:1.2, marginBottom: q.description ? 8 : 0 }}>
                  {q.question_text}
                </motion.h2>
                {q.description && <p style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:14, color:'rgba(22,15,8,0.4)', marginBottom:0, lineHeight:1.55 }}>{q.description}</p>}
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18, duration:0.35 }} style={{ marginTop:24 }}>
                  <QInput q={q} val={ans[q.id]??''} set={v=>setAn(q.id,v)} tc={tc} compact />
                </motion.div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:28 }}>
                  <button onClick={goBack} disabled={step<=0 && !sv?.welcome_message}
                    style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', background:'none', border:'none', cursor:'pointer', opacity:(step<=0&&!sv?.welcome_message)?0.15:1, padding:0, transition:'color 0.2s' }}
                    onMouseEnter={e=>e.currentTarget.style.color='var(--espresso,#160F08)'}
                    onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.3)'}>
                    ← Back
                  </button>
                  {!isLastQ ? (
                    <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }} onClick={goNext}
                      style={{ padding:'11px 26px', borderRadius:999, border:'none', background:'var(--espresso,#160F08)', color:'#FDF5E8', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', cursor:'pointer', transition:'background 0.2s' }}
                      onMouseEnter={e=>e.currentTarget.style.background=tc}
                      onMouseLeave={e=>e.currentTarget.style.background='var(--espresso,#160F08)'}>
                      Continue →
                    </motion.button>
                  ) : (
                    <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }} onClick={submit} disabled={submitting}
                      style={{ padding:'11px 26px', borderRadius:999, border:'none', background:tc, color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', cursor:'pointer', opacity:submitting?0.6:1, boxShadow:`0 4px 16px ${tc}40` }}>
                      {submitting ? '…' : 'Submit ✓'}
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SmartNudge works in embeds too */}
        {step >= 0 && !onWelcome && <SmartNudge visiblePos={visiblePos} visibleTotal={visibleTotal} tc={tc} />}
      </div>

      <style>{`
        * { box-sizing:border-box; }
        .q-text-input{width:100%;background:transparent;border:none;border-bottom:2px solid rgba(22,15,8,0.12);font-family:'Fraunces',serif;font-size:clamp(16px,2vw,22px);font-weight:300;color:#160F08;outline:none;padding:6px 0 12px;transition:border-color 0.2s;}
        .q-text-input:focus{border-bottom-color:var(--focus-color,#FF4500);}
        .q-text-input::placeholder{color:rgba(22,15,8,0.18);}
        .q-textarea{min-height:90px;resize:none;line-height:1.55;}
        .q-choice{width:100%;display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;border:1.5px solid rgba(22,15,8,0.1);background:#fff;cursor:pointer;text-align:left;transition:all 0.2s;}
        .q-choice:hover{border-color:rgba(22,15,8,0.2);transform:translateX(3px);}
        .q-choice.active{border-color:var(--act-color,#FF4500);background:var(--act-bg,rgba(255,69,0,0.05));}
        .q-radio,.q-checkbox{width:18px;height:18px;flex-shrink:0;border:2px solid rgba(22,15,8,0.18);display:flex;align-items:center;justify-content:center;transition:all 0.2s;}
        .q-radio{border-radius:50%;}.q-checkbox{border-radius:5px;}
        .q-radio.active,.q-checkbox.active{border-color:var(--act-color,#FF4500);background:var(--act-color,#FF4500);}
        .q-label{font-family:'Fraunces',serif;font-weight:300;font-size:15px;color:#160F08;flex:1;line-height:1.35;}
        .scale-btn{flex:1;height:44px;border-radius:10px;border:1.5px solid rgba(22,15,8,0.1);background:#fff;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:rgba(22,15,8,0.45);cursor:pointer;transition:all 0.2s;}
        .scale-btn:hover{border-color:rgba(22,15,8,0.25);transform:translateY(-2px);}
        .scale-btn.active{border-color:var(--act-color,#FF4500);background:var(--act-color,#FF4500);color:#fff;transform:translateY(-2px);}
        .star-btn{background:none;border:none;cursor:pointer;font-size:34px;padding:3px;transition:all 0.2s;filter:grayscale(1);opacity:0.2;line-height:1;}
        .star-btn.lit{filter:none;opacity:1;}
        .star-btn:hover{transform:scale(1.15) translateY(-3px);filter:none;opacity:1;}
        .yn-btn{flex:1;padding:20px 0;border-radius:14px;border:2px solid rgba(22,15,8,0.1);background:#fff;cursor:pointer;transition:all 0.2s;text-align:center;font-family:'Playfair Display',serif;font-weight:700;font-size:16px;color:#160F08;}
        .yn-btn:hover{border-color:rgba(22,15,8,0.2);transform:translateY(-3px);}
        .yn-btn.active{border-color:transparent;color:#fff;}
        .yn-emoji{font-size:28px;display:block;margin-bottom:8px;}
      `}</style>
    </div>
  );
}

// ── Compact QInput (same logic, slightly smaller sizes for iframe) ──────────
function QInput({ q, val, set, tc }) {
  const cssVars = { '--focus-color':tc, '--act-color':tc, '--act-bg':tc+'10' };
  switch (q.question_type) {
    case 'short_text':  return <input type="text"  value={val} onChange={e=>set(e.target.value)} className="q-text-input" placeholder="Your answer…" autoFocus style={cssVars}/>;
    case 'long_text':   return <textarea value={val} onChange={e=>set(e.target.value)} className="q-text-input q-textarea" placeholder="Your answer…" autoFocus style={cssVars}/>;
    case 'email':       return <input type="email" value={val} onChange={e=>set(e.target.value)} className="q-text-input" placeholder="name@example.com" autoFocus style={cssVars}/>;
    case 'number':      return <input type="number" value={val} onChange={e=>set(e.target.value)} className="q-text-input" placeholder="0" autoFocus style={{ ...cssVars, fontSize:40, width:120, textAlign:'center' }}/>;
    case 'date':        return <input type="date" value={val} onChange={e=>set(e.target.value)} className="q-text-input" style={{ ...cssVars, fontSize:18 }}/>;
    case 'yes_no': return (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:380 }}>
        {[{l:'Yes',e:'👍',v:'yes'},{l:'No',e:'👎',v:'no'}].map(o=>(
          <motion.button key={o.v} whileTap={{ scale:0.97 }} onClick={()=>set(o.v)}
            className={`yn-btn${val===o.v?' active':''}`} style={val===o.v?{backgroundColor:tc,borderColor:tc}:{}}>
            <span className="yn-emoji">{o.e}</span>{o.l}
          </motion.button>
        ))}
      </div>
    );
    case 'single_choice': return (
      <div style={{ display:'flex', flexDirection:'column', gap:8, maxWidth:520 }}>
        {(q.options||[]).map((o,i)=>{
          const active=val===o.value;
          return (
            <motion.button key={i} whileTap={{ scale:0.99 }} onClick={()=>set(o.value)}
              className={`q-choice${active?' active':''}`}
              style={active?{'--act-color':tc,'--act-bg':tc+'10',borderColor:tc,background:tc+'08'}:{}}>
              <div className={`q-radio${active?' active':''}`} style={active?{'--act-color':tc}:{}}>
                {active&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
              </div>
              <span className="q-label">{o.label}</span>
            </motion.button>
          );
        })}
      </div>
    );
    case 'multiple_choice': {
      const sel=Array.isArray(val)?val:[];
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:8, maxWidth:520 }}>
          {(q.options||[]).map((o,i)=>{
            const active=sel.includes(o.value);
            return (
              <motion.button key={i} whileTap={{ scale:0.99 }}
                onClick={()=>set(active?sel.filter(v=>v!==o.value):[...sel,o.value])}
                className={`q-choice${active?' active':''}`} style={active?{borderColor:tc,background:tc+'08'}:{}}>
                <div className={`q-checkbox${active?' active':''}`} style={active?{'--act-color':tc}:{}}>
                  {active&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
                </div>
                <span className="q-label">{o.label}</span>
              </motion.button>
            );
          })}
        </div>
      );
    }
    case 'dropdown': return (
      <select value={val} onChange={e=>set(e.target.value)}
        style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:18, color:'#160F08', background:'#fff', border:'1.5px solid rgba(22,15,8,0.12)', borderRadius:12, padding:'12px 16px', outline:'none', cursor:'pointer', width:'100%', maxWidth:380, transition:'border-color 0.2s' }}
        onFocus={e=>e.target.style.borderColor=tc} onBlur={e=>e.target.style.borderColor='rgba(22,15,8,0.12)'}>
        <option value="">Choose…</option>
        {(q.options||[]).map((o,i)=><option key={i} value={o.value}>{o.label}</option>)}
      </select>
    );
    case 'rating': { const r=parseInt(val)||0; return (
      <div style={{ display:'flex', gap:6 }}>{[1,2,3,4,5].map(s=>(
        <motion.button key={s} whileHover={{ scale:1.18, y:-6 }} whileTap={{ scale:0.9 }}
          onClick={()=>set(s)} className={`star-btn${s<=r?' lit':''}`}>⭐</motion.button>
      ))}</div>
    );}
    case 'scale': { const v=parseInt(val)||0; return (
      <div style={{ maxWidth:520 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontFamily:'Syne,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' }}>
          <span>Not at all</span><span>Extremely</span>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n=>(
            <motion.button key={n} whileHover={{ y:-3 }} whileTap={{ scale:0.92 }}
              onClick={()=>set(n)} className={`scale-btn${n===v?' active':''}`}
              style={n===v?{'--act-color':tc,borderColor:tc,background:tc,color:'#fff'}:{}}>{n}</motion.button>
          ))}
        </div>
      </div>
    );}
    case 'ranking': return <RankingInput q={q} val={val||[]} set={set} tc={tc}/>;
    case 'slider':  return <SliderInput  q={q} val={val}     set={set} tc={tc}/>;
    case 'matrix':  return <MatrixInput  q={q} val={val||{}} set={set} tc={tc}/>;
    default: return <input type="text" value={val} onChange={e=>set(e.target.value)} className="q-text-input" placeholder="Your answer…" style={cssVars}/>;
  }
}
