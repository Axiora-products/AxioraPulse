import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import AISurveySuggestions from '../components/AISurveySuggestions';
import useAuthStore from '../hooks/useAuth';
import { QUESTION_TYPES, isExpired } from '../lib/constants';
import { Reorder, useDragControls, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';

const newQ = () => ({ _id: Math.random().toString(36).slice(2), question_text: '', question_type: 'short_text', options: [], is_required: false, description: '' });
const hasO = t => ['single_choice', 'multiple_choice', 'dropdown', 'ranking'].includes(t);
const isMx = t => t === 'matrix';
const estTime = qs => `~${Math.max(1, Math.ceil(qs.length * 0.4))} min`;

const fi = e => { e.target.style.borderColor = 'var(--coral)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,69,0,0.08)'; };
const fo = e => { e.target.style.borderColor = 'rgba(22,15,8,0.1)'; e.target.style.boxShadow = 'none'; };
const INP = { width: '100%', boxSizing: 'border-box', padding: '13px 17px', background: 'var(--warm-white)', border: '1.5px solid rgba(22,15,8,0.1)', borderRadius: 14, fontFamily: "'Fraunces', serif", fontSize: 16, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', resize: 'vertical' };
const LBL = { fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', display: 'block', marginBottom: 10 };

const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`;


// ── Module-level QCardCreate — prevents remount on parent re-render ────────────
function QCardCreate({ q, i, tc, qs, sQ, delQ, moveQ, addOpt, sOpt, delOpt }) {
  const dragControls = useDragControls();
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef(null);

  useEffect(() => {
    if (!typeOpen) return;
    const h = e => { if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [typeOpen]);

  const currentType = QUESTION_TYPES.find(t => t.value === q.question_type);

  return (
    <Reorder.Item value={q} dragControls={dragControls} dragListener={false} style={{ listStyle: 'none' }}>
      <div className="q-card" style={{ background: 'var(--warm-white)', borderRadius: 24, border: '1.5px solid rgba(22,15,8,0.07)', overflow: 'visible', position: 'relative', transition: 'border-color 0.25s,box-shadow 0.25s', zIndex: typeOpen ? 100 : 1 }}>
        <div className="q-accent" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg,${tc},${tc}40)`, opacity: 0.4, transition: 'opacity 0.25s', borderTopLeftRadius: 24, borderBottomLeftRadius: 24 }} />
        <div className="q-ghost-num" style={{ position: 'absolute', right: 18, bottom: -16, fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 110, color: 'rgba(22,15,8,0.04)', lineHeight: 1, letterSpacing: '-6px', userSelect: 'none', pointerEvents: 'none' }}>
          {String(i + 1).padStart(2, '0')}
        </div>
        <div style={{ padding: '24px 28px 22px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="drag-handle" onPointerDown={e => { e.preventDefault(); dragControls.start(e); }} title="Drag to reorder"
                style={{ cursor: 'grab', padding: '4px 6px', borderRadius: 8, color: 'rgba(22,15,8,0.2)', display: 'flex', alignItems: 'center', transition: 'all 0.15s', touchAction: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--cream-deep)'; e.currentTarget.style.color = 'rgba(22,15,8,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(22,15,8,0.2)'; }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg>
              </div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.2em', color: 'rgba(22,15,8,0.22)' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ width: 1, height: 11, background: 'rgba(22,15,8,0.1)', display: 'block' }} />
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: tc, background: `${tc}12`, padding: '4px 10px', borderRadius: 999 }}>
                {currentType?.label || 'Question'}
              </span>
              {q.is_required && <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--terracotta)', background: 'rgba(214,59,31,0.08)', padding: '4px 10px', borderRadius: 999 }}>Required</span>}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {[[-1, '\u2191'], [1, '\u2193']].map(([d, sym]) => (
                <button key={d} onClick={() => moveQ(q._id, d)} disabled={(d === -1 && i === 0) || (d === 1 && i === qs.length - 1)} className="np-icon-btn"
                  style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.25)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: (d === -1 && i === 0) || (d === 1 && i === qs.length - 1) ? 0.18 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--cream-deep)'; e.currentTarget.style.color = 'var(--espresso)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(22,15,8,0.25)'; }}>
                  {sym}
                </button>
              ))}
              <button onClick={() => delQ(q._id)} className="np-icon-btn" style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.2)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(214,59,31,0.08)'; e.currentTarget.style.color = 'var(--terracotta)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(22,15,8,0.2)'; }}>{String.fromCharCode(0x2715)}</button>
            </div>
          </div>

          <input value={q.question_text} onChange={e => sQ(q._id, 'question_text', e.target.value)} placeholder="Type your question here\u2026"
            style={{ ...INP, fontSize: 17, padding: '14px 18px', background: 'rgba(253,245,232,0.55)', border: '1.5px solid rgba(22,15,8,0.07)', marginBottom: 10, borderRadius: 16 }} onFocus={fi} onBlur={fo} />

          <input value={q.description || ''} onChange={e => sQ(q._id, 'description', e.target.value)} placeholder="Description or helper text (optional)"
            style={{ ...INP, fontSize: 13, color: 'rgba(22,15,8,0.45)', padding: '10px 16px', background: 'transparent', border: '1.5px solid rgba(22,15,8,0.06)', marginBottom: 16, borderRadius: 13 }} onFocus={fi} onBlur={fo} />

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }} ref={typeRef}>
              <button onClick={() => setTypeOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--cream-deep)', border: '1.5px solid rgba(22,15,8,0.1)', borderRadius: 13, cursor: 'pointer', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--espresso)', transition: 'border-color 0.2s', textAlign: 'left' }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: `${tc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, color: tc }}>{currentType?.icon}</span>
                <span style={{ flex: 1 }}>{currentType?.label}</span>
                <svg width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ flexShrink: 0, opacity: 0.4, transition: 'transform 0.2s', transform: typeOpen ? 'rotate(180deg)' : 'none' }}><path d="M0 0l4.5 6L9 0z" fill="currentColor" /></svg>
              </button>
              {typeOpen && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 100, background: 'var(--espresso)', borderRadius: 16, padding: 6, boxShadow: '0 24px 60px rgba(22,15,8,0.3)', maxHeight: 280, overflowY: 'auto' }}>
                  {QUESTION_TYPES.map(t => (
                    <button key={t.value}
                      onClick={() => { sQ(q._id, 'question_type', t.value); setTypeOpen(false); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 10, transition: 'background 0.12s', color: t.value === q.question_type ? 'var(--coral)' : 'rgba(253,245,232,0.75)', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(253,245,232,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: t.value === q.question_type ? 'rgba(255,69,0,0.18)' : 'rgba(253,245,232,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, color: t.value === q.question_type ? 'var(--coral)' : 'rgba(253,245,232,0.5)' }}>{t.icon}</span>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.label}</span>
                      {t.value === q.question_type && <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
              <div onClick={() => sQ(q._id, 'is_required', !q.is_required)}
                style={{ width: 38, height: 22, borderRadius: 999, background: q.is_required ? tc : 'rgba(22,15,8,0.12)', position: 'relative', transition: 'background 0.25s', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff', top: 3, left: q.is_required ? 19 : 3, transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(22,15,8,0.2)' }} />
              </div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', whiteSpace: 'nowrap' }}>Required</span>
            </label>
          </div>

          {hasO(q.question_type) && (
            <div style={{ marginTop: 16, paddingLeft: 14, borderLeft: `2px solid ${tc}25` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(q.options || []).map((o, j) => (
                  <div key={j} className="opt-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 14px', borderRadius: 12, border: '1.5px solid rgba(22,15,8,0.07)', background: 'rgba(253,245,232,0.5)', transition: 'all 0.15s' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${tc}55`, flexShrink: 0, background: `${tc}15` }} />
                    <input value={o.label} onChange={e => sOpt(q._id, j, e.target.value)} placeholder={`Option ${j + 1}`} className="opt-input" />
                    <button onClick={() => delOpt(q._id, j)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.18)', fontSize: 12, padding: 4, transition: 'color 0.15s', lineHeight: 1 }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--terracotta)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.18)'}>{String.fromCharCode(0x2715)}</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addOpt(q._id)} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tc, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', transition: 'opacity 0.15s' }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: `${tc}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>+</span>
                Add option
              </button>
            </div>
          )}

          {isMx(q.question_type) && (() => {
            const mxData = q.options && !Array.isArray(q.options) ? q.options : { rows: [], columns: [] };
            const setMx = next => sQ(q._id, 'options', next);
            const addRow = () => setMx({ ...mxData, rows: [...(mxData.rows || []), { label: `Row ${(mxData.rows || []).length + 1}`, value: `row_${(mxData.rows || []).length + 1}` }] });
            const addCol = () => setMx({ ...mxData, columns: [...(mxData.columns || []), { label: `Col ${(mxData.columns || []).length + 1}`, value: `col_${(mxData.columns || []).length + 1}` }] });
            const updRow = (ri, v) => { const r = [...(mxData.rows || [])]; r[ri] = { label: v, value: v.toLowerCase().replace(/\s+/g, '_') }; setMx({ ...mxData, rows: r }); };
            const updCol = (ci, v) => { const cs = [...(mxData.columns || [])]; cs[ci] = { label: v, value: v.toLowerCase().replace(/\s+/g, '_') }; setMx({ ...mxData, columns: cs }); };
            const delRow = ri => setMx({ ...mxData, rows: (mxData.rows || []).filter((_, j) => j !== ri) });
            const delCol = ci => setMx({ ...mxData, columns: (mxData.columns || []).filter((_, j) => j !== ci) });
            return (
              <div className="mx-grid" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {[['Rows', mxData.rows || [], addRow, updRow, delRow], ['Columns', mxData.columns || [], addCol, updCol, delCol]].map(([lbl, items, add, upd, del]) => (
                  <div key={lbl}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>{lbl}</div>
                    {items.map((r, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                        <input value={r.label} onChange={e => upd(idx, e.target.value)} placeholder={`${lbl.slice(0, -1)} ${idx + 1}`} style={{ ...INP, flex: 1, padding: '9px 13px', fontSize: 13, borderRadius: 12 }} onFocus={fi} onBlur={fo} />
                        <button onClick={() => del(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.2)', fontSize: 12, padding: '0 4px' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--terracotta)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.2)'}>{String.fromCharCode(0x2715)}</button>
                      </div>
                    ))}
                    <button onClick={add} style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: tc, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add {lbl.slice(0, -1).toLowerCase()}</button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </Reorder.Item>
  );
}

export default function SurveyCreate() {
  const { profile } = useAuthStore();
  const { stopLoading } = useLoading();
  const nav = useNavigate();
  useEffect(() => { stopLoading(); }, [stopLoading]);

  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('details');
  const [f, sf] = useState({ 
    title: '', 
    description: '', 
    welcome_message: '', 
    thank_you_message: 'Thank you for completing this survey!', 
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16), 
    theme_color: '#FF4500', 
    allow_anonymous: true, 
    require_email: false, 
    show_progress_bar: true,
    ai_context: ''
  });
  const [qs, sQs] = useState([newQ()]);
  const [dirty, setDirty] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingGen, setPendingGen] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tmplTab, setTmplTab] = useState('gallery');
  const [catFilter, setCatFilter] = useState('All');
  const [showCreateTmpl, setShowCreateTmpl] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [tmplCat, setTmplCat] = useState('');
  const [tmplDesc, setTmplDesc] = useState('');
  const [tmplNewCat, setTmplNewCat] = useState('');
  const [tmplQs, setTmplQs] = useState([{ _id: 'tq0', question_text: '', question_type: 'short_text', is_required: false }]);
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('np-custom-templates') || '[]'); } catch { return []; }
  });

  const persistCustom = list => { setCustomTemplates(list); localStorage.setItem('np-custom-templates', JSON.stringify(list)); };

  function saveAsTemplate() {
    if (!tmplName.trim()) return toast.error('Template name required');
    const cat = tmplNewCat.trim() || tmplCat || 'Custom';
    const newT = { id: Math.random().toString(36).slice(2), name: tmplName.trim(), category: cat, desc: tmplDesc.trim() || 'Custom template', time: `${Math.max(1, Math.ceil(qs.length * 0.5))} min`, createdAt: new Date().toISOString(), qs: tmplQs.filter(q => q.question_text.trim()).map(q => ({ question_text: q.question_text, question_type: q.question_type, is_required: q.is_required, description: '' })) };
    persistCustom([newT, ...customTemplates]);
    toast.success(`Template "${newT.name}" saved!`);
    setShowCreateTmpl(false); setTmplName(''); setTmplDesc(''); setTmplCat(''); setTmplNewCat('');
    setTmplQs([{ _id: 'tq0', question_text: '', question_type: 'short_text', is_required: false }]);
    setTmplTab('mine');
  }

  function deleteCustomTemplate(id) { persistCustom(customTemplates.filter(t => t.id !== id)); toast.success('Template deleted'); }
  function loadTemplate(t) {
    sf(p => ({ ...p, title: t.name }));
    sQs(t.qs.map(q => ({ ...q, _id: Math.random().toString(36).slice(2), options: q.options || [], description: q.description || '' })));
    setDirty(true); setShowTemplates(false); setTab('questions');
    toast.success(`"${t.name}" loaded!`);
  }

  const GALLERY_TEMPLATES = [
    { name:'NPS Survey', category:'Customer', desc:'Measure customer loyalty with the Net Promoter Score methodology.', time:'2 min', qs:[{question_text:'How likely are you to recommend us?',question_type:'scale',is_required:true,description:'0 = Not at all · 10 = Extremely likely'},{question_text:'What is the main reason for your score?',question_type:'long_text',is_required:false},{question_text:'What could we do to improve?',question_type:'long_text',is_required:false}]},
    { name:'Product Feedback', category:'Product', desc:'Gather actionable feedback on your product features and UX.', time:'3 min', qs:[{question_text:'How satisfied are you with the product overall?',question_type:'rating',is_required:true},{question_text:'Which features do you use most often?',question_type:'multiple_choice',is_required:false,options:[{label:'Dashboard',value:'dashboard'},{label:'Analytics',value:'analytics'},{label:'Sharing',value:'sharing'}]},{question_text:'What feature would you most like to see added?',question_type:'long_text',is_required:false}]},
    { name:'Employee Pulse', category:'HR', desc:'Quick check-in on team morale, workload, and engagement.', time:'4 min', qs:[{question_text:'How satisfied are you with your work environment?',question_type:'rating',is_required:true},{question_text:'How manageable is your current workload?',question_type:'scale',is_required:true,description:'1 = Overwhelmed · 10 = Very manageable'},{question_text:'Do you feel your contributions are recognised?',question_type:'yes_no',is_required:true}]},
    { name:'Event Feedback', category:'Events', desc:'Capture attendee experience immediately after your event.', time:'2 min', qs:[{question_text:'How would you rate the event overall?',question_type:'rating',is_required:true},{question_text:'What was the highlight of the event?',question_type:'long_text',is_required:false},{question_text:'Would you attend again?',question_type:'yes_no',is_required:true}]},
    { name:'Market Research', category:'Research', desc:"Understand your target market's attitudes and behaviours.", time:'5 min', qs:[{question_text:'How familiar are you with our brand?',question_type:'scale',is_required:true},{question_text:'What factors most influence your purchase decisions?',question_type:'multiple_choice',is_required:true,options:[{label:'Price',value:'price'},{label:'Quality',value:'quality'},{label:'Reviews',value:'reviews'},{label:'Brand reputation',value:'brand'}]},{question_text:'How do you typically discover new products like ours?',question_type:'single_choice',is_required:false,options:[{label:'Social media',value:'social'},{label:'Word of mouth',value:'wom'},{label:'Search engine',value:'search'},{label:'Advertisement',value:'ad'}]}]},
    { name:'Exit Interview', category:'HR', desc:'Understand why team members are leaving and how to improve retention.', time:'6 min', qs:[{question_text:'What was your primary reason for leaving?',question_type:'single_choice',is_required:true,options:[{label:'Career growth',value:'growth'},{label:'Compensation',value:'comp'},{label:'Culture fit',value:'culture'},{label:'Personal reasons',value:'personal'}]},{question_text:'What did you value most about working here?',question_type:'long_text',is_required:false},{question_text:'Would you recommend us as an employer?',question_type:'yes_no',is_required:true}]},
  ];

  const allCats = ['All', ...Array.from(new Set(GALLERY_TEMPLATES.map(t => t.category)))];
  const filteredGallery = catFilter === 'All' ? GALLERY_TEMPLATES : GALLERY_TEMPLATES.filter(t => t.category === catFilter);

  useEffect(() => {
    const h = e => { if (!dirty) return; e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const s = (k, v) => { sf(p => ({ ...p, [k]: v })); setDirty(true); };
  const sQ = (id, k, v) => sQs(a => a.map(q => q._id === id ? { ...q, [k]: v } : q));
  const addQ = () => { sQs(a => [...a, newQ()]); };
  const delQ = id => { if (qs.length <= 1) return toast.error('Need at least 1 question'); sQs(a => a.filter(q => q._id !== id)); };
  const moveQ = (id, d) => sQs(a => { const i = a.findIndex(q => q._id === id); if ((d===-1&&i===0)||(d===1&&i===a.length-1)) return a; const b=[...a]; [b[i],b[i+d]]=[b[i+d],b[i]]; return b; });
  const addOpt = id => sQs(a => a.map(q => q._id===id ? { ...q, options:[...(q.options||[]),{label:'',value:''}] } : q));
  const sOpt = (id, i, v) => sQs(a => a.map(q => { if (q._id!==id) return q; const o=[...(q.options||[])]; o[i]={label:v,value:v.toLowerCase().replace(/\s+/g,'_')}; return {...q,options:o}; }));
  const delOpt = (id, i) => sQs(a => a.map(q => q._id!==id ? q : { ...q, options:q.options.filter((_,j)=>j!==i) }));

  const applyAIGeneration = (data) => {
    sf(p => ({
      ...p,
      title: data.title || '',
      description: data.description || '',
      welcome_message: data.welcome_message || ''
    }));
    
    if (data.questions && data.questions.length > 0) {
      sQs(data.questions.map((q, i) => ({
        ...newQ(),
        _id: Math.random().toString(36).slice(2) + i,
        question_text: q.text,
        question_type: q.type,
        options: q.options || (isMx(q.type) ? { rows: [], columns: [] } : [])
      })));
    }
    setDirty(true);
    setPendingGen(null);
    setShowConfirm(false);
    toast.success('Survey generated successfully!');
  };

  const handleAIGenerate = async () => {
    if (!f.ai_context.trim()) return toast.error('Please describe your survey first');
    setAiGenerating(true);
    try {
      const { data } = await API.post('/ai/generate', { aiContext: f.ai_context });
      if (f.title || qs.length > 1 || (qs.length === 1 && qs[0].question_text)) {
        setPendingGen(data);
        setShowConfirm(true);
      } else {
        applyAIGeneration(data);
      }
    } catch (e) {
      toast.error('Failed to generate survey');
      console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  async function save(status = 'draft') {
    if (!f.title.trim()) return toast.error('Title is required');
    if (qs.some(q => !q.question_text.trim())) return toast.error('All questions need text');
    if (qs.some(q => hasO(q.question_type) && (!q.options||q.options.length<2))) return toast.error('Choice questions need ≥2 options');
    if (status === 'active' && qs.length < 2) return toast.error('At least 2 questions are required to publish');
    if (status === 'active' && f.expires_at && isExpired(f.expires_at)) return toast.error('Expiry date cannot be in the past');
    if (!profile?.tenant_id) return toast.error('Session error — please sign in again');
    setBusy(true);
    try {
      const payload = {
        title: f.title,
        description: f.description || null,
        welcome_message: f.welcome_message || null,
        thank_you_message: f.thank_you_message || null,
        expires_at: f.expires_at || null,
        allow_anonymous: f.allow_anonymous,
        require_email: f.require_email,
        show_progress_bar: f.show_progress_bar,
        theme_color: f.theme_color,
        status,
        questions: qs.map((q, i) => ({
          question_text: q.question_text,
          question_type: q.question_type,
          options: hasO(q.question_type) ? q.options : isMx(q.question_type) ? (q.options || { rows: [], columns: [] }) : null,
          is_required: q.is_required,
          description: q.description || null,
          sort_order: i
        }))
      };
      
      const { data: sv } = await API.post('/surveys/', payload);
      
      setDirty(false);
      toast.success(status === 'active' ? 'Survey published!' : 'Draft saved');
      nav(`/surveys/${sv.id}/edit`);
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : e.message || 'Failed to save');
    }
    finally { setBusy(false); }
  }

  const tc = f.theme_color || '#FF4500';
  const reqCount = qs.filter(q => q.is_required).length;
  const healthChecks = [
    f.title.trim(), 
    f.description.trim(), 
    f.welcome_message.trim(), 
    qs.length >= 2, 
    qs.length > 0 && reqCount <= 5, // Only counts if there are questions
    qs.some(q => q.question_type !== 'short_text'), 
    f.expires_at
  ];
  // Filter out checks that shouldn't contribute to 0% state
  const activeChecks = healthChecks.filter((_, i) => {
    // reqCount <= 5 is true by default, but shouldn't count if title is empty (fresh state)
    if (i === 4 && !f.title.trim() && qs.length <= 1) return false;
    return true;
  });
  const health = Math.round((activeChecks.filter(Boolean).length / activeChecks.length) * 100);
  const healthColor = health >= 70 ? 'var(--sage)' : health >= 40 ? 'var(--saffron)' : 'var(--terracotta)';
  const TABS = [{ id: 'details', n: '01', label: 'Details' }, { id: 'questions', n: '02', label: 'Questions', count: qs.length }, { id: 'settings', n: '03', label: 'Settings' }];

  // Circular health arc
  const ARC_R = 28, ARC_CX = 34, ARC_CY = 34;
  const ARC_CIRC = 2 * Math.PI * ARC_R;
  const arcOffset = ARC_CIRC - (health / 100) * ARC_CIRC;

  return (
    <div>
      <style>{`
        @keyframes qCardIn { from { opacity:0; transform:translateY(16px) scale(0.985); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes pulseRing { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.6} 50%{transform:translate(-50%,-50%) scale(1.8);opacity:0} }
        .q-card { animation: qCardIn 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .q-card:hover { border-color: rgba(22,15,8,0.14) !important; box-shadow: 0 12px 48px rgba(22,15,8,0.08) !important; }
        .q-card:hover .q-accent { opacity: 1 !important; }
        .q-card:hover .q-ghost-num { opacity: 0.055 !important; }
        .np-sel { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='rgba(22,15,8,0.35)' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px !important; }
        .opt-input { background:none; border:none; outline:none; font-family:'Fraunces',serif; font-size:14px; color:var(--espresso); padding:7px 0; flex:1; }
        .opt-row:hover { background:rgba(255,255,255,0.9) !important; border-color:rgba(22,15,8,0.16) !important; }
        .sc-tab-btn { position:relative; }
        .sc-tab-btn::after { content:''; position:absolute; bottom:-1px; left:0; right:0; height:2px; border-radius:1px; background:var(--coral); transform:scaleX(0); transition:transform 0.3s cubic-bezier(0.16,1,0.3,1); transform-origin:left; }
        .sc-tab-btn.active::after { transform:scaleX(1); }
        @media (max-width: 1040px) { .sc-grid { grid-template-columns: 1fr !important; } .sc-sidebar { display:none !important; } }
        @media (max-width: 768px) {
          .sc-sidebar { display: flex !important; }
          .q-card > div { padding: 14px 14px 14px 18px !important; }
          .drag-handle { display: none !important; }
          .opt-input { font-size: 16px !important; }
          .mx-grid { grid-template-columns: 1fr !important; }
          .sc-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── OVERWRITE CONFIRMATION MODAL ── */}
      {showConfirm && (
        <div style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(22,15,8,0.6)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
          <div style={{ background:'var(--warm-white)',borderRadius:24,padding:32,width:'100%',maxWidth:480,boxShadow:'0 32px 80px rgba(22,15,8,0.2)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(214,59,31,0.1)', color: 'var(--terracotta)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>⚠️</div>
            <h3 style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:24,margin:'0 0 12px 0',color:'var(--espresso)' }}>Overwrite existing survey?</h3>
            <p style={{ fontFamily:"'Fraunces',serif",fontSize:15,color:'rgba(22,15,8,0.5)',lineHeight:1.6,margin:'0 0 24px 0' }}>
              This will replace your current survey title, description, welcome message, and all questions with the newly AI-generated ones. This action cannot be undone.
            </p>
            <div style={{ display:'flex',gap:12,justifyContent:'flex-end' }}>
              <button onClick={() => { setShowConfirm(false); setPendingGen(null); }} style={{ padding:'12px 24px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.1)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.5)',cursor:'pointer' }}>Cancel</button>
              <button onClick={() => applyAIGeneration(pendingGen)} style={{ padding:'12px 24px',borderRadius:999,border:'none',background:'var(--terracotta)',color:'#fff',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer' }}>Replace Everything</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATE GALLERY MODAL ── */}
      {showTemplates && (
        <div style={{ position:'fixed',inset:0,zIndex:9000,background:'rgba(22,15,8,0.72)',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowTemplates(false); }}>
          <div style={{ background:'var(--warm-white)',borderRadius:32,width:'100%',maxWidth:940,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 64px 160px rgba(22,15,8,0.45)',overflow:'hidden' }}>
            <div style={{ flexShrink:0, borderBottom:'1px solid rgba(22,15,8,0.07)', position:'relative', overflow:'hidden' }}>
              {/* Decorative blob */}
              <div style={{ position:'absolute',top:-60,right:-60,width:240,height:240,borderRadius:'50%',background:`radial-gradient(circle,${tc}20,transparent 70%)`,pointerEvents:'none' }}/>
              <div style={{ padding:'36px 40px 0',display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,position:'relative',zIndex:1 }}>
                <div>
                  <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10 }}>
                    <div style={{ width:24,height:1.5,background:'var(--coral)',borderRadius:1 }}/>
                    <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.22em',textTransform:'uppercase',color:'var(--coral)' }}>Research Frameworks</span>
                  </div>
                  <h2 style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:32,letterSpacing:'-1.5px',margin:0,color:'var(--espresso)',lineHeight:1 }}>Template Gallery</h2>
                  <p style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:'rgba(22,15,8,0.4)',marginTop:10,marginBottom:0,lineHeight:1.6 }}>Validated survey frameworks. Load and customise in seconds.</p>
                </div>
                <button onClick={() => setShowTemplates(false)} style={{ width:40,height:40,borderRadius:14,border:'1.5px solid rgba(22,15,8,0.1)',background:'var(--cream)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(22,15,8,0.4)',fontSize:15,transition:'all 0.15s',flexShrink:0 }}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--cream-deep)';e.currentTarget.style.color='var(--espresso)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--cream)';e.currentTarget.style.color='rgba(22,15,8,0.4)';}}>✕</button>
              </div>
              <div style={{ display:'flex',gap:0,padding:'0 40px',position:'relative',zIndex:1 }}>
                {[['gallery','Gallery'],['mine',`My Templates${customTemplates.length?` (${customTemplates.length})`:''}`]].map(([id,lbl]) => (
                  <button key={id} onClick={() => setTmplTab(id)}
                    style={{ fontFamily:"'Syne',sans-serif",fontSize:10,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',padding:'12px 20px',border:'none',background:'none',cursor:'pointer',color:tmplTab===id?'var(--espresso)':'rgba(22,15,8,0.35)',borderBottom:tmplTab===id?'2px solid var(--coral)':'2px solid transparent',transition:'all 0.2s',marginBottom:'-1px' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex:1,overflowY:'auto',padding:'32px 40px 48px' }}>
              {tmplTab === 'gallery' && (
                <>
                  <div style={{ display:'flex',gap:7,marginBottom:28,flexWrap:'wrap' }}>
                    {allCats.map(cat => (
                      <button key={cat} onClick={() => setCatFilter(cat)}
                        style={{ padding:'6px 18px',borderRadius:999,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',border:'1.5px solid',borderColor:catFilter===cat?tc:'rgba(22,15,8,0.1)',background:catFilter===cat?`${tc}12`:'transparent',color:catFilter===cat?tc:'rgba(22,15,8,0.4)',cursor:'pointer',transition:'all 0.2s' }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:16 }}>
                    {filteredGallery.map((t, ti) => (
                      <div key={ti} style={{ background:'var(--cream)',borderRadius:22,overflow:'hidden',border:'1.5px solid rgba(22,15,8,0.07)',cursor:'pointer',transition:'all 0.3s',display:'flex',flexDirection:'column',position:'relative' }}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.boxShadow=`0 16px 48px ${tc}18`;e.currentTarget.style.transform='translateY(-4px)';}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.07)';e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}>
                        <div style={{ height:4,background:`linear-gradient(90deg,${tc},${tc}60)` }} />
                        <div style={{ padding:'22px 22px 14px',flex:1 }}>
                          <div style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:tc,marginBottom:10 }}>{t.category}</div>
                          <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,color:'var(--espresso)',marginBottom:8,lineHeight:1.2,letterSpacing:'-0.4px' }}>{t.name}</div>
                          <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:13,color:'rgba(22,15,8,0.45)',lineHeight:1.65,marginBottom:12 }}>{t.desc}</div>
                          <div style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.28)' }}>{t.qs.length} questions · {t.time}</div>
                        </div>
                        <div style={{ padding:'8px 18px 18px' }}>
                          <button onClick={() => loadTemplate(t)} style={{ width:'100%',padding:'10px 0',borderRadius:999,border:`1.5px solid ${tc}50`,background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:tc,cursor:'pointer',transition:'all 0.25s' }}
                            onMouseEnter={e=>{e.currentTarget.style.background=tc;e.currentTarget.style.color='#fff';e.currentTarget.style.boxShadow=`0 4px 20px ${tc}45`;}}
                            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=tc;e.currentTarget.style.boxShadow='none';}}>
                            Use this template →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tmplTab === 'mine' && (
                <>
                  {!showCreateTmpl ? (
                    <button onClick={() => setShowCreateTmpl(true)} style={{ display:'flex',alignItems:'center',gap:10,padding:'16px 22px',borderRadius:18,border:'1.5px dashed rgba(22,15,8,0.16)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.4)',cursor:'pointer',transition:'all 0.2s',marginBottom:24 }}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.color=tc;e.currentTarget.style.background=`${tc}05`;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.16)';e.currentTarget.style.color='rgba(22,15,8,0.4)';e.currentTarget.style.background='transparent';}}>
                      <span style={{ width:24,height:24,borderRadius:8,border:'1.5px solid currentColor',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0 }}>+</span>
                      Save current survey as template
                    </button>
                  ) : (
                    <div style={{ background:'var(--cream)',borderRadius:22,padding:28,border:'1.5px solid rgba(22,15,8,0.1)',marginBottom:24 }}>
                      <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:22,letterSpacing:'-0.5px',color:'var(--espresso)',marginBottom:22 }}>Create Template</div>
                      <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
                        <div><label style={LBL}>Template Name *</label><input value={tmplName} onChange={e=>setTmplName(e.target.value)} placeholder="e.g. Quarterly Customer Pulse" style={INP} onFocus={fi} onBlur={fo}/></div>
                        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
                          <div><label style={LBL}>Category</label><input value={tmplNewCat||tmplCat} onChange={e=>{setTmplNewCat(e.target.value);setTmplCat('');}} placeholder="e.g. Customer" style={INP} onFocus={fi} onBlur={fo}/></div>
                          <div><label style={LBL}>Description</label><input value={tmplDesc} onChange={e=>setTmplDesc(e.target.value)} placeholder="What is this template for?" style={INP} onFocus={fi} onBlur={fo}/></div>
                        </div>
                        <div style={{ display:'flex',gap:10,justifyContent:'flex-end',paddingTop:8 }}>
                          <button onClick={()=>setShowCreateTmpl(false)} style={{ padding:'10px 22px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.1)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.45)',cursor:'pointer',transition:'all 0.2s' }}>Cancel</button>
                          <button onClick={saveAsTemplate} style={{ padding:'10px 26px',borderRadius:999,border:'none',background:'var(--espresso)',color:'var(--cream)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer',transition:'background 0.2s' }}
                            onMouseEnter={e=>e.currentTarget.style.background=tc} onMouseLeave={e=>e.currentTarget.style.background='var(--espresso)'}>Save template</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {customTemplates.length === 0 ? (
                    <div style={{ textAlign:'center',padding:'64px 0' }}>
                      <div style={{ width:56,height:56,borderRadius:16,border:'1.5px dashed rgba(22,15,8,0.12)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px',color:'rgba(22,15,8,0.18)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                      <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,color:'rgba(22,15,8,0.32)',marginBottom:8 }}>No custom templates yet</div>
                      <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:'rgba(22,15,8,0.28)' }}>Save your survey as a reusable template above.</div>
                    </div>
                  ) : (
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))',gap:14 }}>
                      {customTemplates.map(t => (
                        <div key={t.id} style={{ background:'var(--cream)',borderRadius:18,overflow:'hidden',border:'1.5px solid rgba(22,15,8,0.07)',transition:'all 0.25s',display:'flex',flexDirection:'column' }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.boxShadow=`0 8px 32px ${tc}14`;e.currentTarget.style.transform='translateY(-2px)';}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.07)';e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none';}}>
                          <div style={{ height:3,background:`linear-gradient(90deg,${tc},${tc}55)` }} />
                          <div style={{ padding:'18px 18px 12px',flex:1 }}>
                            <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:4 }}>
                              <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:15,color:'var(--espresso)',flex:1,lineHeight:1.3 }}>{t.name}</div>
                              <button onClick={e=>{e.stopPropagation();deleteCustomTemplate(t.id);}} style={{ flexShrink:0,background:'none',border:'none',cursor:'pointer',color:'rgba(22,15,8,0.2)',fontSize:13,padding:'1px 3px',lineHeight:1,borderRadius:5,transition:'color 0.15s' }}
                                onMouseEnter={e=>e.currentTarget.style.color='var(--terracotta)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.2)'}>✕</button>
                            </div>
                            {t.desc && <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:12,color:'rgba(22,15,8,0.42)',lineHeight:1.5 }}>{t.desc}</div>}
                          </div>
                          <div style={{ padding:'0 14px 14px' }}>
                            <button onClick={() => loadTemplate(t)} style={{ width:'100%',padding:'8px 0',borderRadius:999,border:`1.5px solid ${tc}40`,background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:8,letterSpacing:'0.12em',textTransform:'uppercase',color:tc,cursor:'pointer',transition:'all 0.2s' }}
                              onMouseEnter={e=>{e.currentTarget.style.background=tc;e.currentTarget.style.color='#fff';}}
                              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=tc;}}>Use template →</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PAGE HEADER ── */}
      <div style={{ position:'relative',marginBottom:56,paddingBottom:48,overflow:'hidden' }}>
        {/* Atmospheric grain */}
        <div style={{ position:'absolute',inset:0,backgroundImage:GRAIN,backgroundSize:'250px',opacity:0.025,pointerEvents:'none' }}/>
        {/* Coral gradient bloom */}
        <div style={{ position:'absolute',right:-120,top:-120,width:360,height:360,borderRadius:'50%',background:`radial-gradient(circle,${tc}22,transparent 70%)`,pointerEvents:'none' }}/>
        {/* Bottom separator */}
        <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'1px',background:'linear-gradient(90deg,transparent,rgba(22,15,8,0.08) 30%,rgba(22,15,8,0.08) 70%,transparent)' }}/>

        <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:20 }}>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:14 }}>
              <div style={{ width:28,height:1.5,background:'var(--coral)',borderRadius:1 }}/>
              <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.22em',textTransform:'uppercase',color:'var(--coral)' }}>Research Studio</span>
            </div>
            <h1 style={{ fontFamily:"'Playfair Display', serif",fontWeight:900,fontSize:'clamp(38px,4.5vw,60px)',letterSpacing:'-2.5px',color:'var(--espresso)',margin:0,lineHeight:0.95 }}>
              New <em style={{ fontStyle:'italic',color:tc }}>Survey</em>
            </h1>
            {dirty && (
              <div style={{ display:'flex',alignItems:'center',gap:7,marginTop:14 }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:'var(--saffron)',boxShadow:'0 0 10px rgba(255,184,0,0.6)' }}/>
                <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',color:'#A07000' }}>Unsaved changes</span>
              </div>
            )}
          </div>
          <div style={{ display:'flex',gap:8,flexShrink:0 }}>
            <button onClick={() => setShowTemplates(true)} style={{ display:'flex',alignItems:'center',gap:8,padding:'11px 20px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.12)',background:'rgba(255,255,255,0.6)',backdropFilter:'blur(8px)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.5)',cursor:'pointer',transition:'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.25)';e.currentTarget.style.color='var(--espresso)';e.currentTarget.style.background='rgba(255,255,255,0.9)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.12)';e.currentTarget.style.color='rgba(22,15,8,0.5)';e.currentTarget.style.background='rgba(255,255,255,0.6)';}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              Templates
            </button>
            <button onClick={() => save('draft')} disabled={busy} style={{ padding:'11px 22px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.12)',background:'rgba(255,255,255,0.6)',backdropFilter:'blur(8px)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.5)',cursor:'pointer',transition:'all 0.2s',opacity:busy?0.45:1 }}
              onMouseEnter={e=>{if(!busy){e.currentTarget.style.borderColor='rgba(22,15,8,0.25)';e.currentTarget.style.color='var(--espresso)';e.currentTarget.style.background='rgba(255,255,255,0.9)';}}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.12)';e.currentTarget.style.color='rgba(22,15,8,0.5)';e.currentTarget.style.background='rgba(255,255,255,0.6)';}}>
              Save draft
            </button>
            <button onClick={() => save('active')} disabled={busy} style={{ display:'flex',alignItems:'center',gap:8,padding:'11px 24px',borderRadius:999,border:'none',background:'var(--espresso)',color:'var(--cream)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer',transition:'all 0.25s',opacity:busy?0.45:1,boxShadow:'0 6px 24px rgba(22,15,8,0.25)' }}
              onMouseEnter={e=>{if(!busy){e.currentTarget.style.background=tc;e.currentTarget.style.boxShadow=`0 10px 36px ${tc}50`;}}}
              onMouseLeave={e=>{e.currentTarget.style.background='var(--espresso)';e.currentTarget.style.boxShadow='0 6px 24px rgba(22,15,8,0.25)';}}>
              {busy ? 'Publishing…' : <><span>Publish</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>}
            </button>
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN WORKSPACE ── */}
      <div className="sc-grid" style={{ display:'grid',gridTemplateColumns:'1fr 300px',gap:40,alignItems:'start' }}>

        {/* LEFT — Editor */}
        <div>
          {/* ── EDITORIAL TAB NAVIGATION ── */}
          <div style={{ display:'flex',gap:0,marginBottom:40,borderBottom:'1px solid rgba(22,15,8,0.07)',position:'relative' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`sc-tab-btn${tab === t.id ? ' active' : ''}`}
                style={{ display:'flex',alignItems:'center',gap:9,padding:'14px 28px 14px 0',border:'none',background:'none',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.14em',textTransform:'uppercase',color:tab===t.id?'var(--espresso)':'rgba(22,15,8,0.32)',transition:'color 0.2s',marginRight:4 }}>
                <span style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:11,letterSpacing:'0.05em',color:tab===t.id?tc:'rgba(22,15,8,0.2)',transition:'color 0.2s' }}>{t.n}</span>
                <span style={{ width:1,height:10,background:'rgba(22,15,8,0.1)',display:'block' }}/>
                {t.label}
                {t.count !== undefined && (
                  <span style={{ minWidth:18,height:18,borderRadius:999,background:tab===t.id?`${tc}15`:'rgba(22,15,8,0.07)',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px',fontSize:9,fontFamily:"'Syne',sans-serif",fontWeight:700,color:tab===t.id?tc:'rgba(22,15,8,0.35)' }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── DETAILS TAB ── */}
          {tab === 'details' && (
            <div style={{ display:'flex',flexDirection:'column',gap:28 }}>
              {/* AI Context Box */}
              <div style={{ background: 'rgba(255,69,0,0.03)', padding: 24, borderRadius: 20, border: `1.5px solid ${tc}30` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 16 }}>✨</span>
                  <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 18, color: 'var(--espresso)' }}>AI Survey Generator</h3>
                </div>
                <label style={LBL}>Describe your survey</label>
                <textarea 
                  value={f.ai_context} 
                  onChange={e => s('ai_context', e.target.value)} 
                  placeholder="e.g. I need a customer satisfaction survey for my new coffee shop. Ask about coffee quality, ambiance, and service." 
                  rows={3} 
                  style={{...INP, borderRadius: 16, marginBottom: 16, background: 'var(--warm-white)'}} 
                  onFocus={fi} 
                  onBlur={fo}
                />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button 
                    onClick={handleAIGenerate} 
                    disabled={aiGenerating || !f.ai_context.trim()}
                    style={{
                      padding: '12px 24px', borderRadius: 999, border: 'none', background: tc, color: '#fff', 
                      fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', 
                      cursor: (aiGenerating || !f.ai_context.trim()) ? 'not-allowed' : 'pointer', 
                      opacity: (aiGenerating || !f.ai_context.trim()) ? 0.6 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                      boxShadow: (aiGenerating || !f.ai_context.trim()) ? 'none' : `0 4px 14px ${tc}40`
                    }}
                  >
                    {aiGenerating ? (
                      <>
                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                        Generating...
                      </>
                    ) : (
                      <>Generate Title, Description & Questions</>
                    )}
                  </button>
                  {f.ai_context.trim() && (
                    <button
                      onClick={() => s('ai_context', '')}
                      disabled={aiGenerating}
                      style={{
                        padding: '11px 20px', borderRadius: 999, border: `1.5px solid rgba(22,15,8,0.1)`, background: 'transparent',
                        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: 'rgba(22,15,8,0.5)', cursor: aiGenerating ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: aiGenerating ? 0.6 : 1
                      }}
                      onMouseEnter={e => { if (!aiGenerating) { e.currentTarget.style.color = 'var(--terracotta)'; e.currentTarget.style.borderColor = 'rgba(214,59,31,0.3)'; e.currentTarget.style.background = 'rgba(214,59,31,0.05)'; } }}
                      onMouseLeave={e => { if (!aiGenerating) { e.currentTarget.style.color = 'rgba(22,15,8,0.5)'; e.currentTarget.style.borderColor = 'rgba(22,15,8,0.1)'; e.currentTarget.style.background = 'transparent'; } }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={LBL}>Survey Title *</label>
                <input value={f.title} onChange={e=>s('title',e.target.value)} placeholder="e.g. Q3 Customer Satisfaction Study"
                  style={{...INP,fontSize:20,fontWeight:500,padding:'18px 22px',letterSpacing:'-0.4px',borderRadius:18,background:'var(--warm-white)'}} onFocus={fi} onBlur={fo}/>
              </div>
              <div className="sc-2col" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:22 }}>
                <div><label style={LBL}>Description</label><textarea value={f.description} onChange={e=>s('description',e.target.value)} placeholder="What's this research about?" rows={4} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/></div>
                <div><label style={LBL}>Welcome Message</label><textarea value={f.welcome_message} onChange={e=>s('welcome_message',e.target.value)} placeholder="Shown on the landing screen before Q1" rows={4} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/></div>
              </div>
              <div><label style={LBL}>Thank You Message</label><textarea value={f.thank_you_message} onChange={e=>s('thank_you_message',e.target.value)} placeholder="Shown after submission" rows={2} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/></div>
              <div className="sc-2col" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:22 }}>
                <div><label style={LBL}>Expires</label><input type="datetime-local" value={f.expires_at} onChange={e=>s('expires_at',e.target.value)} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/></div>
                <div>
                  <label style={LBL}>Theme Colour</label>
                  <div style={{ display:'flex',gap:12,alignItems:'center' }}>
                    <input type="color" value={f.theme_color} onChange={e=>s('theme_color',e.target.value)}
                      style={{ width:52,height:52,borderRadius:14,border:'1.5px solid rgba(22,15,8,0.1)',cursor:'pointer',padding:4,background:'var(--warm-white)',flexShrink:0 }}/>
                    <input value={f.theme_color} onChange={e=>s('theme_color',e.target.value)} style={{...INP,flex:1,letterSpacing:'0.05em',borderRadius:16}} onFocus={fi} onBlur={fo}/>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── QUESTIONS TAB ── */}
          {tab === 'questions' && (
            <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
              <Reorder.Group axis="y" values={qs} onReorder={sQs} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {qs.map((q, i) => (
                  <QCardCreate key={q._id} q={q} i={i} tc={tc} qs={qs}
                    sQ={sQ} delQ={delQ} moveQ={moveQ}
                    addOpt={addOpt} sOpt={sOpt} delOpt={delOpt} />
                ))}
              </Reorder.Group>

              {/* Add Question */}
              <button onClick={addQ}
                style={{ width:'100%',padding:'22px 0',border:'2px dashed rgba(22,15,8,0.1)',borderRadius:24,background:'transparent',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'rgba(22,15,8,0.28)',transition:'all 0.3s',display:'flex',alignItems:'center',justifyContent:'center',gap:12 }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.color=tc;e.currentTarget.style.background=`${tc}05`;e.currentTarget.style.boxShadow=`0 4px 24px ${tc}10`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.1)';e.currentTarget.style.color='rgba(22,15,8,0.28)';e.currentTarget.style.background='transparent';e.currentTarget.style.boxShadow='none';}}>
                <span style={{ position:'relative',width:26,height:26,borderRadius:9,border:'1.5px solid currentColor',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16 }}>
                  +
                </span>
                Add Question
              </button>

              <AISurveySuggestions survey={f} questions={qs} tc={tc} aiContext={f.ai_context}
                onAdd={q => sQs(a => [...a, { ...newQ(), ...q, _id:'new_'+Math.random().toString(36).slice(2) }])} />
            </div>
          )}

          {/* ── SETTINGS TAB ── */}
          {tab === 'settings' && (
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {[
                { k:'allow_anonymous',l:'Anonymous responses',d:"Respondents don't need to identify themselves",ico:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
                { k:'require_email',l:'Require email address',d:'Collect respondent emails before they begin',ico:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>},
                { k:'show_progress_bar',l:'Show progress bar',d:'Display a completion indicator to respondents',ico:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>},
              ].map(x => (
                <div key={x.k}
                  style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'22px 26px',background:'var(--warm-white)',borderRadius:22,border:'1.5px solid rgba(22,15,8,0.07)',cursor:'pointer',transition:'all 0.25s',position:'relative',overflow:'hidden' }}
                  onClick={()=>s(x.k,!f[x.k])}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.14)';e.currentTarget.style.background='#fff';e.currentTarget.style.boxShadow='0 6px 28px rgba(22,15,8,0.06)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.07)';e.currentTarget.style.background='var(--warm-white)';e.currentTarget.style.boxShadow='none';}}>
                  <div style={{ position:'absolute',left:0,top:0,bottom:0,width:3,background:f[x.k]?`linear-gradient(180deg,${tc},${tc}50)`:'transparent',transition:'background 0.3s' }}/>
                  <div style={{ display:'flex',alignItems:'center',gap:18,paddingLeft:8 }}>
                    <div style={{ width:44,height:44,borderRadius:14,background:f[x.k]?`${tc}12`:'rgba(22,15,8,0.05)',display:'flex',alignItems:'center',justifyContent:'center',color:f[x.k]?tc:'rgba(22,15,8,0.32)',transition:'all 0.25s',flexShrink:0 }}>{x.ico}</div>
                    <div>
                      <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:17,color:'var(--espresso)',marginBottom:4 }}>{x.l}</div>
                      <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:13,color:'rgba(22,15,8,0.42)' }}>{x.d}</div>
                    </div>
                  </div>
                  <div style={{ width:46,height:26,borderRadius:999,background:f[x.k]?tc:'rgba(22,15,8,0.12)',position:'relative',transition:'background 0.25s',flexShrink:0 }}>
                    <div style={{ position:'absolute',width:20,height:20,borderRadius:'50%',background:'#fff',top:3,left:f[x.k]?23:3,transition:'left 0.25s',boxShadow:'0 1px 6px rgba(22,15,8,0.2)' }}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>{/* end left */}

        {/* RIGHT — Sticky Sidebar */}
        <div className="sc-sidebar" style={{ position:'sticky',top:88,display:'flex',flexDirection:'column',gap:16 }}>

          {/* Dark Preview Card */}
          <div style={{ background:'var(--espresso)',borderRadius:24,overflow:'hidden',boxShadow:'0 16px 56px rgba(22,15,8,0.25)',position:'relative' }}>
            <div style={{ position:'absolute',top:-40,right:-40,width:160,height:160,borderRadius:'50%',background:`radial-gradient(circle,${tc}30,transparent 70%)`,pointerEvents:'none' }}/>
            <div style={{ height:4,background:`linear-gradient(90deg,${tc},${tc}55)` }}/>
            <div style={{ padding:'20px 22px 24px',position:'relative',zIndex:1 }}>
              <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:16 }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:tc,boxShadow:`0 0 10px ${tc}` }}/>
                <span style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(255,251,244,0.4)' }}>Live preview</span>
              </div>
              {f.title
                ? <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,letterSpacing:'-0.5px',color:'var(--cream)',lineHeight:1.15,marginBottom:f.description?8:0 }}>{f.title}</div>
                : <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:18,letterSpacing:'-0.5px',color:'rgba(255,251,244,0.2)',lineHeight:1.15 }}>Survey title…</div>
              }
              {f.description && <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:12,color:'rgba(255,251,244,0.45)',lineHeight:1.6 }}>{f.description}</div>}
              <div style={{ display:'flex',gap:0,marginTop:18,paddingTop:16,borderTop:'1px solid rgba(255,251,244,0.08)' }}>
                {[[`${qs.length}`,'questions'],[`${reqCount}`,'required'],[estTime(qs),'est. time']].map(([val,lbl]) => (
                  <div key={lbl} style={{ flex:1,textAlign:'center',borderRight:lbl!=='est. time'?'1px solid rgba(255,251,244,0.08)':'none' }}>
                    <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:20,letterSpacing:'-1px',color:tc,lineHeight:1 }}>{val}</div>
                    <div style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(255,251,244,0.3)',marginTop:5 }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Health Score with circular arc */}
          <div style={{ background:'var(--warm-white)',borderRadius:22,border:'1.5px solid rgba(22,15,8,0.08)',padding:'20px 22px' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(22,15,8,0.3)' }}>Survey health</span>
              <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                <span style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:22,letterSpacing:'-1px',color:healthColor }}>{health}</span>
                <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,color:healthColor,marginTop:2 }}>%</span>
              </div>
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:16 }}>
              <svg width="68" height="68" viewBox="0 0 68 68" style={{ flexShrink:0 }}>
                <circle cx="34" cy="34" r={ARC_R} fill="none" stroke="rgba(22,15,8,0.07)" strokeWidth="4"/>
                <circle cx="34" cy="34" r={ARC_R} fill="none" stroke={healthColor} strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={ARC_CIRC}
                  strokeDashoffset={arcOffset}
                  transform="rotate(-90 34 34)"
                  style={{ transition:'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1),stroke 0.4s' }}/>
              </svg>
              <div style={{ display:'flex',flexDirection:'column',gap:6,flex:1 }}>
                {[
                  [f.title.trim(),'Add a title'],
                  [f.description.trim(),'Add a description'],
                  [f.welcome_message.trim(),'Welcome message'],
                  [qs.length >= 2,'At least 2 questions'],
                  [f.expires_at,'Set expiry date'],
                ].map(([done,tip]) => (
                  <div key={tip} style={{ display:'flex',alignItems:'center',gap:7 }}>
                    <div style={{ width:14,height:14,borderRadius:'50%',flexShrink:0,background:done?'var(--sage)':'rgba(22,15,8,0.08)',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.25s' }}>
                      {done && <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>}
                    </div>
                    <span style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:12,color:done?'rgba(22,15,8,0.32)':'rgba(22,15,8,0.5)',textDecoration:done?'line-through':'none',transition:'all 0.25s' }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Publish CTA */}
          <button onClick={()=>save('active')} disabled={busy}
            style={{ width:'100%',padding:'16px 0',borderRadius:18,border:'none',background:'var(--espresso)',color:'var(--cream)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',cursor:busy?'not-allowed':'pointer',transition:'all 0.28s',boxShadow:'0 6px 28px rgba(22,15,8,0.2)',opacity:busy?0.5:1,display:'flex',alignItems:'center',justifyContent:'center',gap:10 }}
            onMouseEnter={e=>{if(!busy){e.currentTarget.style.background=tc;e.currentTarget.style.boxShadow=`0 10px 40px ${tc}45`;}}}
            onMouseLeave={e=>{e.currentTarget.style.background='var(--espresso)';e.currentTarget.style.boxShadow='0 6px 28px rgba(22,15,8,0.2)';}}>
            {busy?'Publishing…':<>Publish Survey <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>}
          </button>
        </div>
      </div>
    </div>
  );
}
