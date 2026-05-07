import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api/axios';

/**
 * AISurveySuggestions
 * ─────────────────────────────────────────────────────────────────
 * Lives at the bottom of the SurveyCreate / SurveyEdit question
 * builder. When triggered, calls /ai/suggestions (FastAPI)
 * and returns 3–5 suggested follow-up questions
 * the builder can add with one click.
 *
 * Props
 * ─────
 *  survey   { title, description }  — current survey meta
 *  questions  Question[]            — current question list
 *  onAdd    fn(question)            — called with { question_text, question_type, options? }
 *  tc       string                  — theme colour
 */

const SUGGESTION_TYPES = {
  short_text:      { label: 'Short text',   emoji: '✏️' },
  long_text:       { label: 'Long text',    emoji: '📝' },
  single_choice:   { label: 'Single',       emoji: '◎'  },
  multiple_choice: { label: 'Multi',        emoji: '☑️' },
  rating:          { label: 'Rating',       emoji: '⭐' },
  scale:           { label: 'Scale 1–10',   emoji: '📊' },
  yes_no:          { label: 'Yes/No',       emoji: '👍' },
  dropdown:        { label: 'Dropdown',     emoji: '⌄'  },
  number:          { label: 'Number',       emoji: '#'  },
  email:           { label: 'Email',        emoji: '@'  },
  date:            { label: 'Date',         emoji: '📅' },
  ranking:         { label: 'Ranking',      emoji: '↕️' },
  slider:          { label: 'Slider',       emoji: '↔️' },
  matrix:          { label: 'Matrix',       emoji: '⊞'  },
};

export default function AISurveySuggestions({ survey, questions = [], onAdd, tc = '#FF4500', aiContext = '' }) {
  const [state,       setState]       = useState('idle'); // idle | loading | done | error
  const [suggestions, setSuggestions] = useState([]);
  const [added,       setAdded]       = useState(new Set());
  const lastFetchKey  = useRef('');
  // FIX: ref mirrors state so fetchSuggestions() always reads the current value,
  // not a stale closure capture. Without this, the auto-trigger useEffect could
  // call fetchSuggestions() while a previous fetch was still in flight.
  const isLoading     = useRef(false);

  // Auto-suggest when question count hits meaningful milestones and survey has a title
  const fetchKey = `${survey?.title}__${questions.length}`;
  useEffect(() => {
    if (!survey?.title || questions.length < 1) return;
    if (questions.length % 3 !== 0) return;   // only trigger at 3, 6, 9 … questions
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;
    fetchSuggestions();
  }, [questions.length, survey?.title]); // eslint-disable-line

  async function fetchSuggestions() {
    if (isLoading.current) return;
    isLoading.current = true;
    setState('loading');
    setSuggestions([]);
    setAdded(new Set());

    const questionList = questions.map(q => ({
      text: q.question_text,
      type: q.question_type,
    }));

    try {
      const { data } = await API.post('/ai/suggestions', {
        surveyTitle: survey.title,
        surveyDescription: survey.description || '',
        existingQuestions: questionList,
        aiContext: aiContext,
      });

      if (data.suggestions?.length) {
        setSuggestions(data.suggestions);
        setState('done');
      } else {
        setState('idle');
      }
    } catch (e) {
      console.error('AI suggestions:', e);
      setState('error');
    } finally {
      isLoading.current = false;
    }
  }

  function handleAdd(sug) {
    const defaultOptions = sug.type === 'matrix' ? { rows: [], columns: [] } : [];
    onAdd?.({
      question_text: sug.text,
      question_type: sug.type,
      options:       sug.options || defaultOptions,
      is_required:   false,
      description:   sug.rationale || '',
    });
    setAdded(prev => new Set([...prev, sug.text]));
  }

  function dismiss() { setState('idle'); setSuggestions([]); }

  // Nothing to show
  if (state === 'idle' || state === 'error') {
    if (!survey?.title) return null;
    return (
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <button onClick={fetchSuggestions} disabled={state === 'loading'}
          style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', background:'none', border:'none', cursor:'pointer', transition:'color 0.2s', padding:'6px 0', display:'inline-flex', alignItems:'center', gap:6 }}
          onMouseEnter={e=>e.currentTarget.style.color='var(--coral)'}
          onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.3)'}>
          ✦ Suggest questions with AI {state === 'error' ? '(retry)' : ''}
        </button>
      </div>
    );
  }

  if (state === 'loading') return (
    <div style={{ marginTop:16, padding:'20px 24px', borderRadius:16, background:'rgba(255,69,0,0.04)', border:'1px dashed rgba(255,69,0,0.2)', display:'flex', alignItems:'center', gap:12 }}>
      <motion.span animate={{ rotate: 360 }} transition={{ repeat:Infinity, duration:1.2, ease:'linear' }}
        style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,69,0,0.2)', borderTopColor:'var(--coral)', borderRadius:'50%', flexShrink:0 }} />
      <span style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:13, color:'rgba(22,15,8,0.45)' }}>
        Analysing your survey and generating smart follow-up questions…
      </span>
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.35, ease:[0.16,1,0.3,1] }}
        style={{ marginTop:16, padding:'20px 20px 16px', borderRadius:20, background:'rgba(255,69,0,0.04)', border:'1px solid rgba(255,69,0,0.15)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:14 }}>✦</span>
            <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--coral)' }}>AI Suggestions</span>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={fetchSuggestions}
              style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', background:'none', border:'none', cursor:'pointer', transition:'color 0.2s', padding:0 }}
              onMouseEnter={e=>e.currentTarget.style.color='var(--coral)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.3)'}>
              Refresh ↺
            </button>
            <button onClick={dismiss}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(22,15,8,0.25)', fontSize:14, lineHeight:1, transition:'color 0.15s', padding:0 }}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(22,15,8,0.5)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.25)'}>✕</button>
          </div>
        </div>

        {/* Suggestion cards */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {suggestions.map((sug, i) => {
            const isAdded = added.has(sug.text);
            const typeInfo = SUGGESTION_TYPES[sug.type] || { label: sug.type, emoji: '?' };
            return (
              <motion.div key={i}
                initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.05 }}
                style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', borderRadius:14, background:'var(--warm-white)', border:`1px solid ${isAdded ? 'rgba(30,122,74,0.2)' : 'rgba(22,15,8,0.08)'}`, transition:'border-color 0.2s' }}>

                {/* Type badge */}
                <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:3, paddingTop:1 }}>
                  <span style={{ fontSize:14, lineHeight:1 }}>{typeInfo.emoji}</span>
                  <span style={{ fontFamily:'Syne,sans-serif', fontSize:7, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', textAlign:'center', lineHeight:1.2 }}>{typeInfo.label}</span>
                </div>

                {/* Text */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'Fraunces,serif', fontWeight:400, fontSize:14, color:'var(--espresso)', lineHeight:1.4, marginBottom: sug.rationale ? 5 : 0 }}>{sug.text}</div>
                  {sug.rationale && <div style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.4)', lineHeight:1.5 }}>{sug.rationale}</div>}
                  {/* Options preview for choice types */}
                  {!isAdded && sug.options && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:7 }}>
                      {Array.isArray(sug.options) 
                        ? sug.options.slice(0,4).map((o, j) => (
                            <span key={j} style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:600, letterSpacing:'0.06em', padding:'2px 8px', borderRadius:999, background:'rgba(22,15,8,0.06)', color:'rgba(22,15,8,0.5)' }}>{o.label}</span>
                          ))
                        : (sug.options.rows || []).slice(0,2).map((r, j) => (
                            <span key={`r-${j}`} style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:600, letterSpacing:'0.06em', padding:'2px 8px', borderRadius:999, background:'rgba(255,69,0,0.06)', color:'var(--coral)' }}>Row: {r.label}</span>
                          ))
                      }
                      {Array.isArray(sug.options) && sug.options.length > 4 && <span style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:600, color:'rgba(22,15,8,0.3)' }}>+{sug.options.length-4}</span>}
                    </div>
                  )}
                </div>

                {/* Add button */}
                <motion.button
                  whileHover={{ scale: isAdded ? 1 : 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={isAdded}
                  onClick={() => handleAdd(sug)}
                  style={{ flexShrink:0, width:32, height:32, borderRadius:999, border:'none', background: isAdded ? 'rgba(30,122,74,0.12)' : tc, color: isAdded ? 'var(--sage)' : '#fff', fontSize: isAdded ? 14 : 18, cursor: isAdded ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', boxShadow: isAdded ? 'none' : `0 3px 12px ${tc}40` }}>
                  {isAdded ? '✓' : '+'}
                </motion.button>
              </motion.div>
            );
          })}
        </div>

        {suggestions.length > 0 && (
          <p style={{ fontFamily:'Syne,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.25)', textAlign:'center', marginTop:12, marginBottom:0 }}>
            AI-generated — review before adding
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
