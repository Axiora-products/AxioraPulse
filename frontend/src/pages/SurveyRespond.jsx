import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import API from '../api/axios';
import { useLoading } from '../context/LoadingContext';
import { useConditionalLogic } from '../hooks/useConditionalLogic';
import { useResponseTracking } from '../hooks/useResponseTracking';
import { useExitDetection } from '../hooks/useExitDetection';

// ─── Session token ───────────────────────────────────────────────────────────
function getToken(slug) {
  const k = `nx_${slug}`;
  let t = localStorage.getItem(k);
  if (!t) { t = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, t); }
  return t;
}

// ─── Safe JSON parse for question options ────────────────────────────────────
function parseOpts(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return raw;
}

function optionList(raw) {
  const parsed = parseOpts(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// ─── Inline SVG icons — no emojis, no icon libraries ─────────────────────────
const Icons = {
  Arrow: ({ d = 'M5 12h14M12 5l7 7-7 7', ...p }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d} /></svg>,
  Check: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 13l4 4L19 7" /></svg>,
  Grip: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="9" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="7" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="17" r="1" fill="currentColor" /><circle cx="15" cy="17" r="1" fill="currentColor" /></svg>,
  Clock: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Star: ({ filled, ...p }) => <svg width="36" height="36" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  Chevron: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" {...p}><path d="M6 9l6 6 6-6" /></svg>,
  X: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

// ─── Slide variants ───────────────────────────────────────────────────────────
const variants = {
  enter: d => ({ y: d > 0 ? 80 : -80, opacity: 0, filter: 'blur(8px)', scale: 0.96 }),
  show: () => ({ y: 0, opacity: 1, filter: 'blur(0px)', scale: 1 }),
  exit: d => ({ y: d > 0 ? -80 : 80, opacity: 0, filter: 'blur(8px)', scale: 0.96 }),
};
const spring = { duration: 0.55, ease: [0.16, 1, 0.3, 1] };

// ─────────────────────────────────────────────────────────────────────────────
export default function SurveyRespond() {
  const { slug } = useParams();
  const [sv, setSv] = useState(null);
  const [qs, setQs] = useState([]);
  const [ans, setAns] = useState({});
  const [step, setStep] = useState(-1);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fbDone, setFbDone] = useState(false);
  const [fbStep, setFbStep] = useState(0);   // 0=rating, 1=comment, 2=email(if required), 3=nps, 4=done
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState('');
  const [fbNps, setFbNps] = useState(-1);
  const [fbFeature, setFbFeature] = useState('');
  const [fbBusy, setFbBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(null);
  const [orgName, setOrgName] = useState('');

  const { stopLoading } = useLoading();
  const token = useRef(null);
  const timer = useRef(null);
  const rId = useRef(null);
  const insertPending = useRef(null);   // guards against concurrent ensureR() calls

  const tracker = useResponseTracking(rId);
  useExitDetection(rId, tracker.onAbandon, done);
  const { visibleQuestions, nextVisible, prevVisible, progressAt } = useConditionalLogic(qs, ans);


  // For demographic questions shown at end (if enabled in survey settings)
  const [showDemographics, setShowDemographics] = useState(false);

  const [demographics, setDemographics] = useState({
    age_range: "",
    gender: "",
    city: "",
    occupation: ""
  });



  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [slug]);

  async function load() {
    try {
      // Single request returns survey + questions + tenant_name
      const res = await API.get(`/surveys/slug/${slug}`);
      const s = res.data;
      if (!s) { setErr('Survey not found'); return; }
      if (s.status !== 'active') { setErr('This survey is not currently accepting responses.'); setSv(s); return; }
      if (s.expires_at && new Date(s.expires_at) < new Date()) { setErr('This survey has expired.'); setSv(s); return; }
      setSv(s);
      token.current = getToken(slug);
      if (s.tenant_name) setOrgName(s.tenant_name);
      const q = (s.questions || []).slice().sort((a, b) => a.sort_order - b.sort_order);
      setQs(q);
      // Resume previous in-progress session
      const sessionRes = await API.get(`/responses/session/${token.current}`);
      const ex = sessionRes.data;
      if (ex) {
        rId.current = ex.id;
        const r = {};
        (ex.survey_answers || []).forEach(a => { r[a.question_id] = a.answer_json ?? a.answer_value ?? ''; });
        setAns(r);
        const first = q.findIndex(x => !r[x.id]);
        setStep(first >= 0 ? first : 0);
        setSaved(ex.last_saved_at);
      } else {
        setStep(-1);
      }
    } catch (e) { console.error(e); setErr('Failed to load survey'); }
    finally { stopLoading(); }
  }

  // ── Ensure response row exists ───────────────────────────────────────────
  // Race-safe: a pending promise ref means concurrent calls (e.g. rapid typing
  // triggering multiple debounced auto-saves) all await the same insert instead
  // of each firing their own — which caused the duplicate session_token 409.
  // Additionally handles the 23505 duplicate-key case defensively by fetching
  // the existing row, so even a true race between two tabs never hard-crashes.
  async function ensureR() {
    if (rId.current) return rId.current;
    if (insertPending.current) return insertPending.current;

    insertPending.current = (async () => {
      // POST /responses/ handles dedup via session_token server-side
      const res = await API.post('/responses/', {
        survey_id: sv.id,
        session_token: token.current,
        respondent_email: email || null,
        status: 'in_progress',
      });
      rId.current = res.data.id;
      return res.data.id;
    })();

    try {
      return await insertPending.current;
    } finally {
      insertPending.current = null;
    }
  }

  // ── Auto-save (via Netlify function) ─────────────────────────────────────
  const autoSave = useCallback(async (a, id) => {
    if (!id) return;
    try {
      const answers = Object.entries(a).map(([qId, v]) => {
        const isObj = v !== null && typeof v === 'object';
        return {
          question_id: qId,
          answer_value: isObj ? null : String(v),
          answer_json: isObj ? v : null,
        };
      });
      await API.post(`/responses/${id}/answers`, answers);
      setSaved(new Date().toISOString());
    } catch (e) { console.warn('Auto-save silently failed:', e.message); }
  }, []);

  // ── Answer setter ─────────────────────────────────────────────────────────
  const setAn = async (qId, val) => {
    const next = { ...ans, [qId]: val };
    setAns(next);
    tracker.onEdit(qId);
    const id = await ensureR();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { autoSave(next, id); tracker.flush(); }, 3000);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    for (const q of visibleQuestions) {
      if (q.is_required && !ans[q.id]) { goTo(qs.indexOf(q)); return toast.error(`Please answer: "${q.question_text}"`); }
    }
    setBusy(true);
    try {
      const id = await ensureR();
      const quality = await tracker.onSubmit(ans, qs);
      await autoSave(ans, id);
      // Update email if collected at end
      if (sv?.require_email && email) {
        await API.patch(`/responses/${id}`, { respondent_email: email });
      }
      await API.post(`/responses/${id}/submit`, { metadata: { quality_score: quality } });
      setShowDemographics(true);
      localStorage.removeItem(`nx_${slug}`);
    } catch (e) { toast.error('Submission failed — your answers are saved. Try again.'); }
    finally { setBusy(false); }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function goTo(n) { setDir(n > step ? 1 : -1); setStep(n); }
  function goNext() {
    const q = qs[step];
    if (q?.is_required && !ans[q.id]) return toast.error('This question is required');
    if (q) tracker.onLeave(q.id);
    const next = nextVisible(step);
    if (next !== null) { setDir(1); setStep(next); tracker.onEnter(qs[next]?.id); }
    else { setDir(1); setStep(qs.length); }
  }
  function goBack() {
    if (step === qs.length) { setDir(-1); const last = prevVisible(qs.length - 1) ?? qs.length - 1; setStep(last); return; }
    if (step >= 0 && qs[step]) tracker.onLeave(qs[step].id);
    tracker.onBack();
    setDir(-1);
    const prev = prevVisible(step);
    if (prev !== null) { setStep(prev); tracker.onEnter(qs[prev]?.id); }
    else if (sv?.welcome_message) setStep(-1);
    else setStep(0);
  }

  // Enter key shortcut
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
      if (step === qs.length && sv?.require_email) { if (email) submit(); return; }
      if (step >= 0 && step < qs.length) { nextVisible(step) === null ? (sv?.require_email ? setStep(qs.length) : submit()) : goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, qs, ans, email, sv]);

  useEffect(() => { if (step >= 0 && qs[step]) tracker.onEnter(qs[step].id); }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const tc = sv?.theme_color || '#FF4500';
  const q = qs[step];
  const onWelcome = step === -1;
  const pct = step >= 0 ? progressAt(step) : 0;
  const visPos = step >= 0 ? visibleQuestions.findIndex(vq => vq.id === q?.id) + 1 : 0;
  const visTotal = visibleQuestions.length;
  const isLast = step >= 0 && step < qs.length && nextVisible(step) === null;
  const canBack = step > 0 || (step === 0 && sv?.welcome_message) || step === qs.length;
  const remaining = useMemo(() => visibleQuestions.filter(vq => !ans[vq.id]), [visibleQuestions, ans]);

  // ── Error state ───────────────────────────────────────────────────────────
  if (err) return (
    <div style={{ height: '100vh', background: '#100B05', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: '1.5px solid rgba(255,69,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px' }}>
          <Icons.X style={{ color: '#FF4500', width: 20, height: 20 }} />
        </div>
        <h1 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 30, letterSpacing: '-1px', color: '#EDE8DF', marginBottom: 12, lineHeight: 1 }}>Unavailable</h1>
        <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 16, color: 'rgba(237,232,223,0.4)', lineHeight: 1.75 }}>{err}</p>
      </motion.div>
    </div>
  );

  if (!sv) return null;

  // ── Thank you ─────────────────────────────────────────────────────────────
  async function submitFeedback() {
    setFbBusy(true);
    try {
      await API.post(`/surveys/${sv.id}/feedback`, {
        rating: fbRating,
        comment: fbComment.trim() || null,
        responded_at: new Date().toISOString(),
      });
    } catch (e) { console.warn('Feedback error:', e.message); }
    finally { setFbBusy(false); setFbDone(true); }
  }

  if (showDemographics) return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0E0501",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        overflow: "hidden",
        position: "relative"
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          background:
            "radial-gradient(circle, rgba(255,69,0,0.18), transparent 70%)",
          filter: "blur(90px)",
          top: "45%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          pointerEvents: "none"
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          width: "100%",
          maxWidth: 680,
          position: "relative",
          zIndex: 2
        }}
      >
        {/* HEADER */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 12
          }}
        >
          <p
            style={{
              fontFamily: "Syne,sans-serif",
              fontSize: 10,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "rgba(237,232,223,0.28)",
              marginBottom: 16
            }}
          >
            Demographics
          </p>

          <h1
            style={{
              fontFamily: "Playfair Display,serif",
              marginTop: -20,
              fontWeight: 900,
              fontSize: "clamp(42px,5vw,64px)",
              lineHeight: 0.92,
              letterSpacing: "-3px",
              color: "#F4EDE5",
              marginBottom: 14
            }}
          >
            <span style={{ color: "#FF5A00" }}>H</span>
            elp us understand
            <br />
            our audience better.
          </h1>

          <p
            style={{
              fontFamily: "Fraunces,serif",
              fontWeight: 300,
              fontSize: 15,
              color: "#FF5A00",
              lineHeight: 1.5,
              maxWidth: 520,
              margin: "0 auto"
            }}
          >
            These details are optional and used for aggregate analytics.
          </p>
        </div>

        {/* AGE */}
        <div style={{ marginTop: 30 }}>
          <p
            style={{
              fontFamily: "Syne,sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(237,232,223,0.45)",
              marginBottom: 14
            }}
          >
            Age Range
          </p>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap"
            }}
          >
            {["<18", "18-24", "25-34", "35-44", "45-54", "55+"].map(
              (age) => {
                const active = demographics.age_range === age;

                return (
                  <button
                    key={age}
                    onClick={() =>
                      setDemographics({
                        ...demographics,
                        age_range: age
                      })
                    }
                    style={{
                      padding: "13px 22px",
                      borderRadius: 16,
                      border: active
                        ? "1px solid #FF5A00"
                        : "1px solid rgba(237,232,223,0.08)",
                      background: active ? "#FF5A00" : "transparent",
                      color: active
                        ? "#fff"
                        : "rgba(237,232,223,0.55)",
                      fontFamily: "Syne,sans-serif",
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: "pointer",
                      transition: "all 0.25s ease",
                      boxShadow: active
                        ? "0 12px 35px rgba(255,90,0,0.35)"
                        : "none"
                    }}
                  >
                    {age}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* GENDER */}
        <div style={{ marginTop: 24 }}>
          <p
            style={{
              fontFamily: "Syne,sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(237,232,223,0.45)",
              marginBottom: 14
            }}
          >
            Gender
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            {["Male", "Female", "Non-binary", "Other"].map((g) => {
              const active = demographics.gender === g;

              return (
                <button
                  key={g}
                  onClick={() =>
                    setDemographics({
                      ...demographics,
                      gender: g
                    })
                  }
                  style={{
                    padding: "13px 22px",
                    borderRadius: 16,
                    border: active
                      ? "1px solid #FF5A00"
                      : "1px solid rgba(237,232,223,0.08)",
                    background: active ? "#FF5A00" : "transparent",
                    color: active
                      ? "#fff"
                      : "rgba(237,232,223,0.55)",
                    fontFamily: "Syne,sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                    boxShadow: active
                      ? "0 12px 35px rgba(255,90,0,0.35)"
                      : "none"
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* INPUTS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            marginTop: 24
          }}
        >
          {/* CITY */}
          <div>
            <p
              style={{
                fontFamily: "Syne,sans-serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(237,232,223,0.45)",
                marginBottom: 12
              }}
            >
              City
            </p>

            <input
              type="text"
              placeholder="Hyderabad"
              value={demographics.city}
              onChange={(e) =>
                setDemographics({
                  ...demographics,
                  city: e.target.value
                })
              }
              style={{
                width: "100%",
                height: 58,
                borderRadius: 18,
                border: "1px solid rgba(237,232,223,0.08)",
                background: "#F5EFE7",
                padding: "0 20px",
                fontFamily: "Fraunces,serif",
                fontSize: 22,
                color: "#160F08",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>

          {/* OCCUPATION */}
          <div>
            <p
              style={{
                fontFamily: "Syne,sans-serif",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(237,232,223,0.45)",
                marginBottom: 12
              }}
            >
              Occupation
            </p>

            <input
              type="text"
              placeholder="IT Employee"
              value={demographics.occupation}
              onChange={(e) =>
                setDemographics({
                  ...demographics,
                  occupation: e.target.value
                })
              }
              style={{
                width: "100%",
                height: 58,
                borderRadius: 18,
                border: "2px solid #FF5A00",
                background: "#F5EFE7",
                padding: "0 20px",
                fontFamily: "Fraunces,serif",
                fontSize: 22,
                color: "#160F08",
                outline: "none",
                boxSizing: "border-box",
                boxShadow: "0 0 0 4px rgba(255,90,0,0.12)"
              }}
            />
          </div>
        </div>

        {/* BUTTONS */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginTop: 36
          }}
        >
          <button
            onClick={async () => {
              try {
                await API.patch(`/responses/${rId.current}`, {
                  age_range: demographics.age_range,
                  gender: demographics.gender,
                  city: demographics.city,
                  occupation: demographics.occupation
                });
              } catch (e) {
                console.log(e);
              }

              setShowDemographics(false);
              setDone(true);
            }}
            style={{
              padding: "18px 20px",
              borderRadius: 999,
              border: "none",
              background: "#FF5A00",
              color: "#fff",
              fontFamily: "Syne,sans-serif",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "0 18px 45px rgba(255,90,0,0.38)"
            }}
          >
            Save & Continue
          </button>

          <button
            onClick={() => {
              setShowDemographics(false);
              setDone(true);
            }}
            style={{
              padding: "18px 28px",
              borderRadius: 999,
              border: "1px solid rgba(237,232,223,0.08)",
              background: "transparent",
              color: "rgba(237,232,223,0.28)",
              fontFamily: "Syne,sans-serif",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer"
            }}
          >
            Skip
          </button>
        </div>
      </motion.div>
    </div>
  );

  if (done) return (
    <div style={{ height: '100vh', background: '#100B05', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${tc}18, transparent 65%)`, filter: 'blur(80px)' }} />
      </div>

      <AnimatePresence mode="wait">

        {/* ── Multi-step feedback ── */}
        {!fbDone ? (
          <motion.div key={`fb-${fbStep}`}
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 440, width: '100%' }}>

            {/* Step dots */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
              {[0, 1, 2].map(n => (
                <div key={n} style={{ width: fbStep === n ? 20 : 6, height: 6, borderRadius: 99, background: fbStep === n ? tc : 'rgba(237,232,223,0.2)', transition: 'all 0.3s' }} />
              ))}
            </div>

            {fbStep === 0 && (<>
              <p style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,232,223,0.25)', marginBottom: 20 }}>Experience</p>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(24px,4vw,36px)', letterSpacing: '-1.5px', color: '#EDE8DF', marginBottom: 32, lineHeight: 1.1 }}>
                How smooth was the survey experience?
              </h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 36 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setFbRating(n)}
                    style={{ background: 'none', border: 'none', fontSize: 36, cursor: 'pointer', transition: 'transform 0.2s, filter 0.2s', transform: fbRating >= n ? 'scale(1.2)' : 'scale(1)', filter: fbRating >= n ? 'brightness(1)' : 'brightness(0.25)', color: fbRating >= n ? '#FFB800' : '#EDE8DF' }}>
                    ★
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => fbRating > 0 && setFbStep(1)} disabled={fbRating === 0}
                  style={{ padding: '13px 32px', borderRadius: 999, border: 'none', background: fbRating === 0 ? 'rgba(237,232,223,0.08)' : tc, color: fbRating === 0 ? 'rgba(237,232,223,0.3)' : '#fff', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: fbRating === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.25s' }}>
                  Next →
                </button>
                <button onClick={() => setFbDone(true)}
                  style={{ padding: '13px 20px', borderRadius: 999, border: '1px solid rgba(237,232,223,0.12)', background: 'transparent', color: 'rgba(237,232,223,0.3)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Skip all
                </button>
              </div>
            </>)}

            {fbStep === 1 && (<>
              <p style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,232,223,0.25)', marginBottom: 20 }}>Thoughts</p>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(22px,3.5vw,32px)', letterSpacing: '-1px', color: '#EDE8DF', marginBottom: 24, lineHeight: 1.15 }}>
                Anything we should improve?
              </h2>
              <textarea value={fbComment} onChange={e => setFbComment(e.target.value)}
                placeholder="Question wording, length, clarity… anything helps."
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 18px', background: '#FDF5E8', border: '1px solid rgba(237,232,223,0.12)', borderRadius: 16, fontFamily: 'Fraunces,serif', fontWeight: 400, fontSize: 15, color: '#160F08', outline: 'none', resize: 'none', transition: 'all 0.2s', marginBottom: 20 }}
                onFocus={e => { e.target.style.borderColor = tc; e.target.style.boxShadow = `0 0 0 4px ${tc}20`; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(237,232,223,0.12)'; e.target.style.boxShadow = 'none'; }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => setFbStep(2)}
                  style={{ padding: '13px 32px', borderRadius: 999, border: 'none', background: tc, color: '#fff', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Next →
                </button>
                <button onClick={() => { setFbStep(0); }}
                  style={{ padding: '13px 20px', borderRadius: 999, border: '1px solid rgba(237,232,223,0.12)', background: 'transparent', color: 'rgba(237,232,223,0.3)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  ← Back
                </button>
              </div>
            </>)}

            {fbStep === 2 && (<>
              <p style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,232,223,0.25)', marginBottom: 20 }}>Recommend</p>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(22px,3.5vw,32px)', letterSpacing: '-1px', color: '#EDE8DF', marginBottom: 12, lineHeight: 1.15 }}>
                How likely are you to recommend Axiora?
              </h2>
              <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 13, color: 'rgba(237,232,223,0.3)', marginBottom: 24 }}>0 = Not at all likely · 10 = Extremely likely</p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button key={n} onClick={() => setFbNps(n)}
                    style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${fbNps === n ? tc : 'rgba(237,232,223,0.15)'}`, background: fbNps === n ? tc : 'transparent', color: fbNps === n ? '#fff' : 'rgba(237,232,223,0.5)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s' }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={submitFeedback} disabled={fbBusy}
                  style={{ padding: '13px 32px', borderRadius: 999, border: 'none', background: tc, color: '#fff', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: fbBusy ? 'not-allowed' : 'pointer', transition: 'all 0.25s' }}>
                  {fbBusy ? 'Sending…' : 'Submit feedback'}
                </button>
                <button onClick={() => setFbStep(1)}
                  style={{ padding: '13px 20px', borderRadius: 999, border: '1px solid rgba(237,232,223,0.12)', background: 'transparent', color: 'rgba(237,232,223,0.3)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  ← Back
                </button>
              </div>
            </>)}

          </motion.div>

        ) : (

          /* ── Thank-you screen ── */
          <motion.div key="thankyou"
            initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{ textAlign: 'center', maxWidth: 460, position: 'relative', zIndex: 1 }}>
            <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 180, damping: 16 }}
              style={{ width: 88, height: 88, borderRadius: '50%', border: `1.5px solid ${tc}50`, background: `${tc}0D`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 44px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M5 13l4 4L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.55, duration: 0.5 }} />
              </svg>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(40px,6vw,64px)', letterSpacing: '-3px', color: '#EDE8DF', marginBottom: 20, lineHeight: 0.95 }}>
              Thank you.
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
              style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 17, color: 'rgba(237,232,223,0.38)', lineHeight: 1.8, maxWidth: 320, margin: '0 auto' }}>
              {sv.thank_you_message || 'Your response has been recorded. We appreciate you taking the time.'}
            </motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
              style={{ marginTop: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,232,223,0.12)' }}>Axiora</span>
              <span style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 13, letterSpacing: '-0.3px', color: 'rgba(237,232,223,0.18)' }}>Pulse</span>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF4500', opacity: 0.4, boxShadow: '0 0 6px rgba(255,69,0,0.5)' }} />
              {orgName && <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,232,223,0.12)' }}>· {orgName}</span>}
            </motion.div>
          </motion.div>

        )}

      </AnimatePresence>
    </div>
  );

  // ─── Main layout ───────────────────────────────────────────────────────────
  const dark = onWelcome;
  const bg = dark ? '#100B05' : '#F7F5F0';
  const fg = dark ? '#EDE8DF' : '#160F08';
  const sub = dark ? 'rgba(237,232,223,0.35)' : 'rgba(22,15,8,0.38)';
  const line = dark ? 'rgba(237,232,223,0.07)' : 'rgba(22,15,8,0.07)';

  return (
    <div className="np-respond-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: bg, transition: 'background 0.5s' }}>

      {/* ── Progress line ── */}
      {step >= 0 && sv?.show_progress_bar !== false && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 100, background: 'rgba(22,15,8,0.06)' }}>
          <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%', background: `linear-gradient(90deg,${tc},${tc}cc)`, boxShadow: `0 0 8px ${tc}60` }} />
        </div>
      )}

      {/* ── Header ── */}
      <header className="np-respond-header" style={{ flexShrink: 0, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'relative', zIndex: 20 }}>
        {/* Axiora Pulse logo with coral dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
            <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: dark ? 'rgba(237,232,223,0.35)' : 'rgba(22,15,8,0.35)', marginRight: 6, position: 'relative', top: 2 }}>
              Axiora
            </span>
            <span style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 19, letterSpacing: '-0.5px', color: dark ? 'rgba(237,232,223,0.7)' : 'rgba(22,15,8,0.55)', lineHeight: 1 }}>
              Pulse
            </span>
            {/* Coral dot with sonar rings */}
            <div style={{ position: 'relative', width: 7, height: 7, background: '#FF4500', borderRadius: '50%', boxShadow: '0 0 8px rgba(255,69,0,0.55)', alignSelf: 'flex-start', marginTop: 4, marginLeft: 5, flexShrink: 0 }}>
              <style>{`
                @keyframes sonarR { 0% { transform:translate(-50%,-50%) scale(1); opacity:.65; } 60% { opacity:.3; } 100% { transform:translate(-50%,-50%) scale(3.8); opacity:0; } }
                .np-sonar { position:absolute; border-radius:50%; border:1.5px solid #FF4500; top:50%; left:50%; width:7px; height:7px; transform:translate(-50%,-50%) scale(0); opacity:0; animation: sonarR 3s ease-out infinite; }
                .np-sonar:nth-child(1){animation-delay:0s}.np-sonar:nth-child(2){animation-delay:.9s}.np-sonar:nth-child(3){animation-delay:1.8s}
              `}</style>
              <div className="np-sonar" /><div className="np-sonar" /><div className="np-sonar" />
            </div>
          </div>
          {orgName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 1, height: 14, background: dark ? 'rgba(237,232,223,0.15)' : 'rgba(22,15,8,0.12)' }} />
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: dark ? 'rgba(237,232,223,0.4)' : 'rgba(22,15,8,0.4)' }}>
                {orgName}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Estimated time */}
          {!onWelcome && remaining.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: sub }}>
              <Icons.Clock style={{ color: 'currentColor' }} />
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                ~{Math.max(1, Math.ceil(remaining.length * 0.4))} min
              </span>
            </div>
          )}
          {saved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: tc }} />
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: sub }}>Saved</span>
            </div>
          )}
          {step >= 0 && (
            <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: tc, fontVariantNumeric: 'tabular-nums' }}>
              {String(visPos).padStart(2, '0')}
              <span style={{ color: sub, fontWeight: 400 }}> / {String(visTotal).padStart(2, '0')}</span>
            </span>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>

          {/* WELCOME */}
          {step === -1 && (
            <motion.div className="np-welcome-stage" key="welcome" custom={dir} variants={variants} initial="enter" animate="show" exit="exit" transition={spring}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 40px' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                {/* Grain texture */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '250px', opacity: 0.04 }} />
                {/* Gradient blobs */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.5 }}
                  style={{ position: 'absolute', top: '-20%', right: '-10%', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle,${tc}22,transparent 65%)`, filter: 'blur(80px)' }} />
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 1.2 }}
                  style={{ position: 'absolute', bottom: '-15%', left: '-8%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(188,150,80,0.14),transparent 70%)', filter: 'blur(70px)' }} />
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 2 }}
                  style={{ position: 'absolute', top: '30%', left: '25%', width: 350, height: 350, borderRadius: '50%', background: `radial-gradient(circle,${tc}10,transparent 70%)`, filter: 'blur(60px)' }} />
                {/* Ghost watermark */}
                <div style={{ position: 'absolute', bottom: '-20px', left: '-10px', fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 'clamp(120px,22vw,280px)', color: 'transparent', WebkitTextStroke: '1px rgba(255,69,0,0.04)', letterSpacing: '-8px', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>Pulse</div>
              </div>
              <div style={{ textAlign: 'center', maxWidth: 560, position: 'relative', zIndex: 1 }}>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, border: `1px solid ${tc}2E`, background: `${tc}0D`, marginBottom: 32 }}>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: tc }}>
                    {visTotal} question{visTotal !== 1 ? 's' : ''}
                  </span>
                </motion.div>
                <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(32px,5.5vw,62px)', letterSpacing: '-2.5px', color: '#EDE8DF', lineHeight: 1.02, marginBottom: 20 }}>
                  {sv.title}
                </motion.h1>
                {sv.description && (
                  <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                    style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 18, color: 'rgba(237,232,223,0.42)', lineHeight: 1.75, marginBottom: 8 }}>
                    {sv.description}
                  </motion.p>
                )}
                {sv.welcome_message && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                    style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 15, color: 'rgba(237,232,223,0.28)', lineHeight: 1.7, marginBottom: 0 }}>
                    {sv.welcome_message}
                  </motion.p>
                )}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }} style={{ marginTop: 36 }}>
                  <motion.button whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setDir(1);
                      const first = qs.findIndex(q => visibleQuestions.some(vq => vq.id === q.id));
                      const idx = first >= 0 ? first : 0;
                      setStep(idx); tracker.onEnter(qs[idx]?.id);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '15px 44px', borderRadius: 999, border: 'none', background: tc, color: '#fff', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: `0 8px 40px ${tc}40` }}>
                    Begin
                    <Icons.Arrow style={{ color: 'currentColor' }} />
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* QUESTION */}
          {step >= 0 && step < qs.length && q && (
            <motion.div className="np-question-stage" key={q.id} custom={dir} variants={variants} initial="enter" animate="show" exit="exit" transition={spring}
              style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              <div className="np-question-wrap" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 40px' }}>
                <div className="np-question-panel" style={{ width: '100%', maxWidth: 680, position: 'relative' }}>
                  {/* Ghost question number */}
                  <div aria-hidden style={{ position: 'absolute', right: -8, top: -16, fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 'clamp(80px,13vw,130px)', color: 'rgba(22,15,8,0.032)', lineHeight: 1, letterSpacing: '-5px', userSelect: 'none', pointerEvents: 'none', zIndex: 0 }}>
                    {String(visPos).padStart(2, '0')}
                  </div>

                  {/* Meta row */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                    <div style={{ width: 32, height: 1.5, background: `linear-gradient(90deg,${tc},${tc}00)`, borderRadius: 1 }} />
                    <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', color: sub }}>
                      {String(visPos).padStart(2, '0')} of {String(visTotal).padStart(2, '0')}
                    </span>
                    {q.is_required
                      ? <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: tc, background: `${tc}10`, padding: '3px 8px', borderRadius: 4 }}>Required</span>
                      : <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.2)', background: 'rgba(22,15,8,0.05)', padding: '3px 8px', borderRadius: 4 }}>Optional</span>
                    }
                  </motion.div>

                  {/* Question text */}
                  <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(26px,4vw,46px)', letterSpacing: '-1.5px', color: fg, lineHeight: 1.1, marginBottom: q.description ? 14 : 0 }}>
                    {q.question_text}
                  </motion.h2>
                  {q.description && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                      style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 16, color: sub, lineHeight: 1.65, marginTop: 0 }}>
                      {q.description}
                    </motion.p>
                  )}

                  {/* Input */}
                  <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    style={{ marginTop: 36 }}>
                    <QInput q={q} val={ans[q.id] ?? ''} set={v => setAn(q.id, v)} tc={tc} fg={fg} sub={sub} />
                  </motion.div>

                  {/* Nav */}
                  <motion.div className="np-question-nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
                    style={{ marginTop: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button onClick={goBack} disabled={!canBack}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: sub, background: 'none', border: 'none', cursor: canBack ? 'pointer' : 'default', opacity: canBack ? 1 : 0, padding: '8px 0', transition: 'color 0.2s' }}
                      onMouseEnter={e => { if (canBack) e.currentTarget.style.color = fg; }}
                      onMouseLeave={e => e.currentTarget.style.color = sub}>
                      <Icons.Arrow d="M19 12H5M12 19l-7-7 7-7" style={{ color: 'currentColor' }} />
                      Back
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
                      {!isLast ? (
                        <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} onClick={goNext}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 36px', borderRadius: 999, border: 'none', background: fg, color: dark ? '#100B05' : '#F7F5F0', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.25s, box-shadow 0.25s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.color = '#fff'; e.currentTarget.style.boxShadow = `0 8px 32px ${tc}40`; }}
                          onMouseLeave={e => { e.currentTarget.style.background = fg; e.currentTarget.style.color = dark ? '#100B05' : '#F7F5F0'; e.currentTarget.style.boxShadow = 'none'; }}>
                          Continue
                          <Icons.Arrow style={{ color: 'currentColor' }} />
                        </motion.button>
                      ) : sv?.require_email ? (
                        <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                          onClick={() => { if (q?.is_required && !ans[q.id]) return toast.error('This question is required'); setDir(1); setStep(qs.length); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 36px', borderRadius: 999, border: 'none', background: fg, color: dark ? '#100B05' : '#F7F5F0', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.25s, box-shadow 0.25s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.color = '#fff'; e.currentTarget.style.boxShadow = `0 8px 32px ${tc}40`; }}
                          onMouseLeave={e => { e.currentTarget.style.background = fg; e.currentTarget.style.color = dark ? '#100B05' : '#F7F5F0'; e.currentTarget.style.boxShadow = 'none'; }}>
                          Almost done
                          <Icons.Arrow style={{ color: 'currentColor' }} />
                        </motion.button>
                      ) : (
                        <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} onClick={submit} disabled={busy}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 36px', borderRadius: 999, border: 'none', background: tc, color: '#fff', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.65 : 1, boxShadow: `0 8px 32px ${tc}45` }}>
                          {busy ? 'Submitting…' : <><span>Submit</span><Icons.Check style={{ color: 'currentColor' }} /></>}
                        </motion.button>
                      )}
                      <span className="np-enter-hint" style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.16)' }}>
                        or press Enter ↵
                      </span>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* EMAIL COLLECTION (if required, shown after last question) */}
          {step === qs.length && sv?.require_email && (
            <motion.div key="email-gate" custom={dir} variants={variants} initial="enter" animate="show" exit="exit" transition={spring}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 40px' }}>
              <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, border: `1px solid ${tc}2E`, background: `${tc}0D`, marginBottom: 28 }}>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: tc }}>
                    Almost there
                  </span>
                </motion.div>
                <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(28px,5vw,50px)', letterSpacing: '-2px', color: fg, lineHeight: 1.05, marginBottom: 16 }}>
                  Where should we send your results?
                </motion.h2>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}
                  style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 16, color: sub, lineHeight: 1.65, marginBottom: 36 }}>
                  Your responses are safe. We only use your email to share follow-up insights.
                </motion.p>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && email) submit(); }}
                    placeholder="you@company.com"
                    autoFocus
                    style={{ width: '100%', boxSizing: 'border-box', padding: '18px 24px', background: 'rgba(22,15,8,0.04)', border: `1.5px solid rgba(22,15,8,0.12)`, borderRadius: 18, fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 300, color: fg, outline: 'none', textAlign: 'center', transition: 'border-color 0.2s, box-shadow 0.2s', marginBottom: 20 }}
                    onFocus={e => { e.target.style.borderColor = tc; e.target.style.boxShadow = `0 0 0 4px ${tc}14`; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(22,15,8,0.12)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
                    <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                      onClick={submit} disabled={busy || !email}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 44px', borderRadius: 999, border: 'none', background: email ? tc : 'rgba(22,15,8,0.1)', color: email ? '#fff' : sub, fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: (busy || !email) ? 'not-allowed' : 'pointer', opacity: busy ? 0.65 : 1, transition: 'all 0.25s', boxShadow: email ? `0 8px 32px ${tc}40` : 'none' }}>
                      {busy ? 'Submitting…' : <><span>Submit</span><Icons.Check style={{ color: 'currentColor' }} /></>}
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Global scoped CSS */}
      <style>{`
        .qt { width:100%; box-sizing:border-box; background:transparent; border:none; border-bottom:2px solid rgba(22,15,8,0.09); font-family:'Fraunces',serif; font-size:clamp(20px,3vw,30px); font-weight:300; color:#160F08; outline:none; padding:6px 0 16px; transition:border-color 0.25s; resize:none; }
        .qt:focus { border-bottom-color:var(--qt-tc); }
        .qt::placeholder { color:rgba(22,15,8,0.12); }
        .qc { width:100%; display:flex; align-items:center; gap:16px; padding:17px 22px; border-radius:18px; border:1.5px solid rgba(22,15,8,0.07); background:rgba(253,245,232,0.5); cursor:pointer; text-align:left; transition:border-color 0.25s, background 0.25s, transform 0.25s, box-shadow 0.25s; backdrop-filter:blur(6px); }
        .qc:hover { border-color:rgba(22,15,8,0.18); background:rgba(255,255,255,0.95); transform:translateX(6px); box-shadow:0 4px 20px rgba(22,15,8,0.06); }
        .qc.on { border-color:var(--qt-tc); background:rgba(255,255,255,0.95); box-shadow:0 4px 20px rgba(22,15,8,0.08); }
        .qdot { width:22px; height:22px; flex-shrink:0; border:2px solid rgba(22,15,8,0.14); display:flex; align-items:center; justify-content:center; transition:all 0.25s; }
        .qdot.r { border-radius:50%; } .qdot.s { border-radius:7px; }
        .qdot.on { border-color:var(--qt-tc); background:var(--qt-tc); }
        .qlbl { font-family:'Fraunces',serif; font-weight:300; font-size:16px; color:#160F08; flex:1; line-height:1.4; }
        .qkey { font-family:'Syne',sans-serif; font-size:9px; font-weight:700; letter-spacing:0.12em; color:rgba(22,15,8,0.2); padding:3px 8px; border:1px solid rgba(22,15,8,0.09); border-radius:6px; transition:all 0.2s; }
        .qc:hover .qkey { border-color:rgba(22,15,8,0.2); color:rgba(22,15,8,0.35); }
        .qc.on .qkey { border-color:var(--qt-tc); color:var(--qt-tc); }
        .qsc { flex:1; height:54px; border-radius:14px; border:1.5px solid rgba(22,15,8,0.08); background:rgba(253,245,232,0.5); font-family:'Syne',sans-serif; font-weight:700; font-size:14px; color:rgba(22,15,8,0.38); cursor:pointer; transition:all 0.25s; }
        .qsc:hover { border-color:rgba(22,15,8,0.2); transform:translateY(-4px); color:#160F08; background:white; box-shadow:0 6px 20px rgba(22,15,8,0.08); }
        .qsc.on { color:white; transform:translateY(-4px); box-shadow:0 8px 28px rgba(22,15,8,0.15); }
        .qc, .qsc, .qdot, button { -webkit-tap-highlight-color:transparent; }
        @media (max-width: 640px) {
          .np-respond-shell { height:100dvh !important; }
          .np-respond-header { height:52px !important; padding:0 16px !important; }
          .np-respond-header > div:last-child { gap:12px !important; }
          .np-respond-header > div:last-child > div:first-child { display:none !important; }
          .np-welcome-stage { padding:24px 18px !important; align-items:flex-start !important; padding-top:12vh !important; }
          .np-question-wrap { align-items:flex-start !important; padding:24px 18px 18px !important; }
          .np-question-panel { max-width:100% !important; }
          .np-question-panel h2 { font-size:clamp(25px,8vw,34px) !important; line-height:1.12 !important; letter-spacing:-0.8px !important; }
          .np-question-panel p { font-size:15px !important; line-height:1.55 !important; }
          .np-question-nav { margin-top:34px !important; align-items:stretch !important; gap:14px !important; }
          .np-question-nav > div { width:100% !important; }
          .np-question-nav button { min-height:48px !important; justify-content:center !important; }
          .np-enter-hint, .np-respond-footer { display:none !important; }
          .qt { font-size:22px !important; padding-bottom:14px !important; }
          .qc { min-height:56px !important; padding:14px 16px !important; border-radius:16px !important; gap:12px !important; }
          .qc:hover { transform:none !important; box-shadow:none !important; }
          .qlbl { font-size:15px !important; }
          .qkey { display:none !important; }
          .qsc { min-width:38px !important; height:48px !important; border-radius:12px !important; }
        }
        @media (hover:none) {
          .qc:hover, .qsc:hover { transform:none !important; box-shadow:none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .np-respond-shell *, .np-respond-shell *::before, .np-respond-shell *::after {
            animation-duration:0.001ms !important;
            animation-iteration-count:1 !important;
            transition-duration:0.001ms !important;
            scroll-behavior:auto !important;
          }
        }
      `}</style>

      {/* ── Footer ── */}
      <footer className="np-respond-footer" style={{ flexShrink: 0, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px', borderTop: `1px solid ${line}` }}>
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: dark ? 'rgba(237,232,223,0.15)' : 'rgba(22,15,8,0.2)' }}>
          © {new Date().getFullYear()} Axiora Pulse · All rights reserved
        </span>
      </footer>
    </div>
  );
}

// ─── QInput ───────────────────────────────────────────────────────────────────
function QInput({ q, val, set, tc, fg, sub }) {
  const css = { '--qt-tc': tc };

  switch (q.question_type) {

    case 'short_text':
      return <input type="text" value={val} onChange={e => set(e.target.value)} className="qt" placeholder="Your answer…" autoFocus style={css} />;

    case 'long_text':
      return <textarea value={val} onChange={e => set(e.target.value)} className="qt" placeholder="Your answer…" autoFocus rows={4} style={{ ...css, lineHeight: 1.65 }} />;

    case 'email':
      return <input type="email" value={val} onChange={e => set(e.target.value)} className="qt" placeholder="name@company.com" autoFocus style={css} />;

    case 'number':
      return <input type="number" value={val} onChange={e => set(e.target.value)} className="qt" placeholder="0" autoFocus
        style={{ ...css, fontSize: 'clamp(48px,8vw,80px)', fontWeight: 400, letterSpacing: '-3px', padding: '0 0 12px', textAlign: 'left', width: 220 }} />;

    case 'date':
      return <input type="date" value={val} onChange={e => set(e.target.value)} className="qt" style={{ ...css, fontSize: 24 }} />;

    case 'yes_no':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 440 }}>
          {[{ l: 'Yes', v: 'yes' }, { l: 'No', v: 'no' }].map(o => (
            <motion.button key={o.v} whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }} onClick={() => set(o.v)}
              style={{ padding: '32px 0', borderRadius: 20, border: `1.5px solid ${val === o.v ? tc : 'rgba(22,15,8,0.08)'}`, background: val === o.v ? tc : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px', color: val === o.v ? '#fff' : '#160F08', transition: 'all 0.25s', backdropFilter: 'blur(6px)', boxShadow: val === o.v ? `0 12px 36px ${tc}35` : 'none' }}>
              {o.l}
            </motion.button>
          ))}
        </div>
      );

    case 'single_choice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 580 }}>
          {(parseOpts(q.options) || []).map((o, i) => {
            const on = val === o.value;
            return (
              <motion.button key={i} whileTap={{ scale: 0.99 }} onClick={() => set(o.value)}
                className={`qc${on ? ' on' : ''}`} style={css}>
                <div className={`qdot r${on ? ' on' : ''}`}>
                  {on && <Icons.Check style={{ color: 'white' }} />}
                </div>
                <span className="qlbl">{o.label}</span>
                <span className="qkey">{String.fromCharCode(65 + i)}</span>
              </motion.button>
            );
          })}
        </div>
      );

    case 'multiple_choice': {
      const sel = Array.isArray(val) ? val : [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 580 }}>
          {(parseOpts(q.options) || []).map((o, i) => {
            const on = sel.includes(o.value);
            return (
              <motion.button key={i} whileTap={{ scale: 0.99 }}
                onClick={() => set(on ? sel.filter(v => v !== o.value) : [...sel, o.value])}
                className={`qc${on ? ' on' : ''}`} style={css}>
                <div className={`qdot s${on ? ' on' : ''}`}>
                  {on && <Icons.Check style={{ color: 'white' }} />}
                </div>
                <span className="qlbl">{o.label}</span>
              </motion.button>
            );
          })}
        </div>
      );
    }

    case 'dropdown':
      return (
        <div style={{ position: 'relative', maxWidth: 460 }}>
          <select value={val} onChange={e => set(e.target.value)}
            style={{ width: '100%', padding: '16px 44px 16px 20px', appearance: 'none', WebkitAppearance: 'none', background: 'rgba(255,255,255,0.75)', border: '1.5px solid rgba(22,15,8,0.09)', borderRadius: 16, fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 19, color: val ? '#160F08' : 'rgba(22,15,8,0.28)', outline: 'none', cursor: 'pointer', backdropFilter: 'blur(6px)', transition: 'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor = tc} onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.09)'}>
            <option value="">Select an option…</option>
            {(parseOpts(q.options) || []).map((o, i) => <option key={i} value={o.value}>{o.label}</option>)}
          </select>
          <Icons.Chevron style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(22,15,8,0.3)' }} />
        </div>
      );

    case 'emoji_reaction': {
      const opts = optionList(q.options);
      const choices = opts.length ? opts : [
        { label: '😞', value: 'negative' },
        { label: '😐', value: 'neutral' },
        { label: '🙂', value: 'positive' },
        { label: '😍', value: 'delighted' },
      ];
      return <EmojiReactionInput opts={choices} val={val} set={set} tc={tc} />;
    }

    case 'swipe_choice': {
      const opts = optionList(q.options);
      return <SwipeChoiceInput opts={opts} val={val} set={set} tc={tc} sub={sub} />;
    }

    case 'visual_choice': {
      const opts = optionList(q.options);
      return <VisualChoiceInput opts={opts} val={val} set={set} tc={tc} sub={sub} />;
    }

    case 'rating': {
      const r = parseInt(val) || 0;
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map(s => (
            <motion.button key={s} whileHover={{ scale: 1.2, y: -6 }} whileTap={{ scale: 0.85 }}
              onClick={() => set(s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1, color: s <= r ? tc : 'rgba(22,15,8,0.14)', transition: 'color 0.2s' }}>
              <Icons.Star filled={s <= r} style={{ color: 'currentColor', width: 38, height: 38 }} />
            </motion.button>
          ))}
        </div>
      );
    }

    case 'scale': {
      const v = parseInt(val) || 0;
      return (
        <div style={{ maxWidth: 580 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: sub }}>
            <span>Not at all</span><span>Extremely</span>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <motion.button key={n} whileHover={{ y: -4 }} whileTap={{ scale: 0.9 }} onClick={() => set(n)}
                className={`qsc${n === v ? ' on' : ''}`}
                style={n === v ? { borderColor: tc, background: tc, boxShadow: `0 6px 24px ${tc}40`, color: 'white' } : {}}>
                {n}
              </motion.button>
            ))}
          </div>
        </div>
      );
    }

    case 'ranking': {
      const opts = (() => {
        const raw = parseOpts(q.options);
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        return [];
      })();
      if (!opts.length) return <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, color: sub, padding: '16px 0' }}>No options for this question.</div>;
      return <RankInput opts={opts} val={val} set={set} tc={tc} />;
    }

    case 'slider': {
      const rules = q.validation_rules || {};
      const min = Number(rules.min ?? 0), max = Number(rules.max ?? 100), step = Number(rules.step ?? 1);
      return <SliderInput val={val} set={set} tc={tc} min={min} max={max} step={step}
        minLabel={rules.min_label || String(min)} maxLabel={rules.max_label || String(max)} />;
    }

    case 'matrix': {
      // Supabase returns JSONB as a plain JS object already; parseOpts handles string fallback
      const opts = parseOpts(q.options);
      const rows = (opts && Array.isArray(opts.rows)) ? opts.rows : [];
      const cols = (opts && Array.isArray(opts.columns)) ? opts.columns : [];
      if (!rows.length || !cols.length) return (
        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, color: sub, padding: '16px 0', lineHeight: 1.6 }}>
          This matrix question has no rows or columns yet.<br />
          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Open the survey editor and add rows &amp; columns to this question, then save.
          </span>
        </div>
      );
      return <MatrixInput rows={rows} cols={cols} val={val || {}} set={set} tc={tc} sub={sub} />;
    }

    default:
      return <input type="text" value={val} onChange={e => set(e.target.value)} className="qt" placeholder="Your answer…" style={css} />;
  }
}

// ─── RankInput ────────────────────────────────────────────────────────────────
function RankInput({ opts, val, set, tc }) {
  const init = () => {
    if (Array.isArray(val) && val.length === opts.length && val.every(v => opts.some(o => o.value === v))) return val;
    return opts.map(o => o.value);
  };
  const [items, setItems] = useState(init);
  const getLabel = v => opts.find(o => o.value === v)?.label ?? v;

  function reorder(next) { setItems(next); set(next); }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 999, border: `1px solid rgba(22,15,8,0.09)`, background: 'rgba(22,15,8,0.03)', marginBottom: 20 }}>
        <Icons.Grip style={{ color: 'rgba(22,15,8,0.3)' }} />
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Drag to rank · 1 = top</span>
      </div>
      <Reorder.Group axis="y" values={items} onReorder={reorder}
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((v, i) => (
          <Reorder.Item key={v} value={v} whileDrag={{ scale: 1.03, rotate: 1, zIndex: 50 }} style={{ cursor: 'grab', listStyle: 'none' }}>
            <motion.div layout style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: i === 0 ? `${tc}08` : 'rgba(255,255,255,0.65)', border: `1.5px solid ${i === 0 ? tc + '28' : 'rgba(22,15,8,0.08)'}`, borderRadius: 16, userSelect: 'none', backdropFilter: 'blur(4px)', transition: 'border-color 0.25s, background 0.25s' }}>
              <motion.div layout animate={{ background: i === 0 ? tc : 'rgba(22,15,8,0.06)' }} transition={{ duration: 0.3 }}
                style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: i === 0 ? `0 4px 14px ${tc}40` : 'none', transition: 'box-shadow 0.3s' }}>
                <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, color: i === 0 ? '#fff' : 'rgba(22,15,8,0.35)', transition: 'color 0.3s' }}>{i + 1}</span>
              </motion.div>
              <span style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 16, color: '#160F08', flex: 1, lineHeight: 1.4 }}>{getLabel(v)}</span>
              <Icons.Grip style={{ color: 'rgba(22,15,8,0.18)', flexShrink: 0 }} />
            </motion.div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {items.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: `${tc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.Check style={{ color: tc, width: 8, height: 8 }} />
          </div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)' }}>
            Top: <span style={{ color: tc }}>{getLabel(items[0])}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── SliderInput — fully custom pointer drag ──────────────────────────────────
function EmojiReactionInput({ opts, val, set, tc }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 560 }}>
      {opts.map((o, i) => {
        const on = val === o.value;
        return (
          <motion.button key={o.value || i} whileHover={{ y: -5, scale: 1.04 }} whileTap={{ scale: 0.92 }} onClick={() => set(o.value)}
            aria-pressed={on}
            style={{ minWidth: 84, minHeight: 84, borderRadius: 22, border: `1.5px solid ${on ? tc : 'rgba(22,15,8,0.08)'}`, background: on ? `${tc}12` : 'rgba(255,255,255,0.68)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: on ? `0 12px 30px ${tc}25` : 'none', transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s' }}>
            <span style={{ fontSize: 34, lineHeight: 1 }}>{o.label}</span>
            {o.description && <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: on ? tc : 'rgba(22,15,8,0.35)' }}>{o.description}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

function SwipeChoiceInput({ opts, val, set, tc, sub }) {
  if (!opts.length) return <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, color: sub, padding: '16px 0' }}>No swipe options for this question.</div>;
  const current = opts.find(o => o.value === val) || opts[0];
  const idx = Math.max(0, opts.findIndex(o => o.value === current.value));
  const choose = delta => {
    const next = opts[Math.max(0, Math.min(opts.length - 1, idx + delta))];
    if (next) set(next.value);
  };
  return (
    <div style={{ maxWidth: 420 }}>
      <motion.div key={current.value} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.35}
        onDragEnd={(_, info) => { if (info.offset.x > 70) choose(-1); if (info.offset.x < -70) choose(1); }}
        whileTap={{ cursor: 'grabbing' }}
        style={{ minHeight: 190, borderRadius: 26, border: `1.5px solid ${tc}35`, background: `linear-gradient(135deg, rgba(255,255,255,0.92), ${tc}10)`, boxShadow: `0 18px 50px ${tc}18`, cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', touchAction: 'pan-y' }}>
        <div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 28, color: '#160F08', lineHeight: 1.15, marginBottom: 10 }}>{current.label}</div>
          {current.description && <div style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.46)', lineHeight: 1.5 }}>{current.description}</div>}
        </div>
      </motion.div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <button onClick={() => choose(-1)} disabled={idx === 0} style={{ border: 'none', background: 'transparent', color: idx === 0 ? 'rgba(22,15,8,0.18)' : tc, fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: idx === 0 ? 'default' : 'pointer' }}>← Previous</button>
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: sub }}>Swipe or tap</span>
        <button onClick={() => choose(1)} disabled={idx === opts.length - 1} style={{ border: 'none', background: 'transparent', color: idx === opts.length - 1 ? 'rgba(22,15,8,0.18)' : tc, fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: idx === opts.length - 1 ? 'default' : 'pointer' }}>Next →</button>
      </div>
    </div>
  );
}

function VisualChoiceInput({ opts, val, set, tc, sub }) {
  if (!opts.length) return <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, color: sub, padding: '16px 0' }}>No visual options for this question.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, maxWidth: 620 }}>
      {opts.map((o, i) => {
        const on = val === o.value;
        return (
          <motion.button key={o.value || i} whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }} onClick={() => set(o.value)}
            style={{ border: `1.5px solid ${on ? tc : 'rgba(22,15,8,0.08)'}`, background: on ? `${tc}10` : 'rgba(255,255,255,0.7)', borderRadius: 20, padding: 8, cursor: 'pointer', textAlign: 'left', boxShadow: on ? `0 12px 34px ${tc}24` : 'none', overflow: 'hidden' }}>
            {o.image_url ? <img src={o.image_url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 14, display: 'block', marginBottom: 10 }} /> : <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 14, background: `${tc}14`, marginBottom: 10 }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 4px' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${on ? tc : 'rgba(22,15,8,0.18)'}`, background: on ? tc : 'transparent', flexShrink: 0 }} />
              <span style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: '#160F08', lineHeight: 1.25 }}>{o.label}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function SliderInput({ val, set, tc, min, max, step, minLabel, maxLabel }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);

  const has = val !== '' && val != null;
  const cur = has ? Number(val) : null;
  const pct = cur != null ? ((cur - min) / (max - min)) * 100 : 0;

  function snap(raw) { return Math.max(min, Math.min(max, Math.round(raw / step) * step)); }
  function fromX(clientX) { const r = trackRef.current.getBoundingClientRect(); return snap(min + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (max - min)); }

  function onDown(e) { e.preventDefault(); dragging.current = true; setDrag(true); trackRef.current.setPointerCapture(e.pointerId); set(fromX(e.clientX)); }
  function onMove(e) { if (!dragging.current) return; set(fromX(e.clientX)); }
  function onUp() { dragging.current = false; setDrag(false); }
  function onKey(e) { const d = e.shiftKey ? step * 10 : step; if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(snap((cur ?? Math.round((min + max) / 2)) + d)); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(snap((cur ?? Math.round((min + max) / 2)) - d)); } }

  return (
    <div style={{ maxWidth: 520, userSelect: 'none' }}>
      {/* Value */}
      <div style={{ marginBottom: 44, textAlign: 'left' }}>
        <AnimatePresence mode="wait">
          {cur != null ? (
            <motion.div key="v" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <span style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(56px,9vw,88px)', letterSpacing: '-4px', color: tc, lineHeight: 1 }}>{cur}</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.25)', marginLeft: 12 }}>selected</span>
            </motion.div>
          ) : (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 'clamp(56px,9vw,88px)', letterSpacing: '-4px', color: 'rgba(22,15,8,0.07)', lineHeight: 1 }}>–</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.2)', marginLeft: 12 }}>drag to select</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Track */}
      <div ref={trackRef} tabIndex={0} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={cur ?? min}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
        onKeyDown={onKey} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ position: 'relative', height: 52, cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', outline: 'none' }}>
        {/* Track BG */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 3, transform: 'translateY(-50%)', background: 'rgba(22,15,8,0.08)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${cur != null ? pct : 0}%`, background: `linear-gradient(90deg,${tc}80,${tc})`, borderRadius: 999, transition: drag ? 'none' : 'width 0.08s' }} />
        </div>
        {/* Thumb */}
        <motion.div animate={{ scale: drag ? 1.4 : hover ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 600, damping: 28 }}
          style={{ position: 'absolute', top: '50%', left: `${cur != null ? pct : 50}%`, transform: 'translate(-50%,-50%)', width: 24, height: 24, borderRadius: '50%', background: cur != null ? tc : 'rgba(22,15,8,0.2)', border: '3px solid white', boxShadow: drag ? `0 4px 20px ${tc}55, 0 0 0 6px ${tc}15` : '0 2px 10px rgba(22,15,8,0.18)', pointerEvents: 'none', transition: drag ? 'left 0s,background 0.2s,box-shadow 0.2s' : 'left 0.04s,background 0.2s,box-shadow 0.2s' }} />
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.28)' }}>{minLabel}</span>
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.28)' }}>{maxLabel}</span>
      </div>
    </div>
  );
}

// ─── MatrixInput ──────────────────────────────────────────────────────────────
function MatrixInput({ rows, cols, val, set, tc, sub }) {
  const answered = Object.keys(val).length;
  const pct = rows.length ? Math.round((answered / rows.length) * 100) : 0;

  function toggle(rv, cv) {
    const next = { ...val };
    if (next[rv] === cv) delete next[rv]; else next[rv] = cv;
    set(next);
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 2, borderRadius: 999, background: 'rgba(22,15,8,0.07)', overflow: 'hidden' }}>
          <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%', background: tc, borderRadius: 999 }} />
        </div>
        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: sub, flexShrink: 0 }}>{answered}/{rows.length}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0', minWidth: cols.length > 3 ? 480 : 'auto' }}>
          <thead>
            <tr>
              <th style={{ width: '36%', paddingBottom: 14 }} />
              {cols.map((c, ci) => (
                <th key={c.value ?? ci} style={{ paddingBottom: 14, paddingLeft: 8, paddingRight: 8, textAlign: 'center', fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', whiteSpace: 'nowrap' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const sel = val[row.value];
              const done = sel !== undefined;
              return (
                <motion.tr key={row.value ?? ri} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: ri * 0.04 }}>
                  <td style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 15, color: done ? '#160F08' : 'rgba(22,15,8,0.5)', paddingRight: 20, paddingTop: 5, paddingBottom: 5, verticalAlign: 'middle', transition: 'color 0.2s', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ color: tc, lineHeight: 1, flexShrink: 0 }}><Icons.Check style={{ color: tc, width: 10, height: 10 }} /></motion.span>}
                      {row.label}
                    </span>
                  </td>
                  {cols.map((col, ci) => {
                    const on = sel === col.value;
                    return (
                      <td key={col.value ?? ci} style={{ textAlign: 'center', padding: '5px 8px', verticalAlign: 'middle' }}>
                        <motion.button whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }} onClick={() => toggle(row.value, col.value)}
                          aria-label={`${row.label}: ${col.label}`} aria-pressed={on}
                          style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${on ? tc : 'rgba(22,15,8,0.12)'}`, background: on ? tc : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', transition: 'border-color 0.2s, background 0.2s', boxShadow: on ? `0 4px 14px ${tc}35` : 'none' }}>
                          {on && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}><Icons.Check style={{ color: 'white', width: 10, height: 10 }} /></motion.div>}
                        </motion.button>
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {answered === rows.length && rows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, color: tc }}>
          <Icons.Check style={{ color: tc }} />
          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>All rows answered</span>
        </motion.div>
      )}
    </div>
  );
}
