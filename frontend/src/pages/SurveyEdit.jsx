import React, { useState, useEffect } from 'react';
import ShareModal from '../components/ShareModal';
import AISurveySuggestions from '../components/AISurveySuggestions';
import { useParams, useNavigate, Link } from 'react-router-dom';
import API from '../api/axios';
import useAuthStore from '../hooks/useAuth';
import { QUESTION_TYPES, hasPermission, SURVEY_STATUS, formatDate, isExpired } from '../lib/constants';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';
import { Reorder, useDragControls } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';
import HelpTip from '../components/HelpTip';

const hasO = t => ['single_choice','multiple_choice','dropdown','ranking'].includes(t);
const isMx = t => t === 'matrix';

function parseOpts(raw, forMatrix=false) {
  if (!raw) return forMatrix ? { rows: [], columns: [] } : [];
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return forMatrix ? { rows: [], columns: [] } : []; }
  }
  if (forMatrix) return (raw && !Array.isArray(raw) && typeof raw === 'object') ? raw : { rows: [], columns: [] };
  return Array.isArray(raw) ? raw : [];
}

const fi = e => { e.target.style.borderColor = 'var(--coral)'; e.target.style.boxShadow = '0 0 0 3px rgba(255,69,0,0.08)'; };
const fo = e => { e.target.style.borderColor = 'rgba(22,15,8,0.1)'; e.target.style.boxShadow = 'none'; };
const INP = { width: '100%', boxSizing: 'border-box', padding: '13px 17px', background: 'var(--warm-white)', border: '1.5px solid rgba(22,15,8,0.1)', borderRadius: 14, fontFamily: "'Fraunces', serif", fontSize: 16, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', resize: 'vertical' };
const LBL = { fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', display: 'block', marginBottom: 10 };
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`;

function getPreviewSection(step, qsLen) {
  if (step < 0) return 'Details';
  if (step >= qsLen) return 'Post Survey';
  return 'Questions';
}

const STATUS_COLORS = { draft: { bg: 'rgba(22,15,8,0.07)', text: 'rgba(22,15,8,0.45)', dot: 'rgba(22,15,8,0.3)' }, active: { bg: 'rgba(30,122,74,0.1)', text: 'var(--sage)', dot: 'var(--sage)' }, paused: { bg: 'rgba(255,184,0,0.12)', text: '#A07000', dot: 'var(--saffron)' }, closed: { bg: 'rgba(214,59,31,0.08)', text: 'var(--terracotta)', dot: 'var(--terracotta)' } };

export default function SurveyEdit() {
  const { id } = useParams(); const { profile } = useAuthStore(); const nav = useNavigate();
  const { stopLoading } = useLoading();
  const [busy, setBusy] = useState(false);
  const [sv, setSv] = useState(null);
  const [qs, sQs] = useState([]);
  const [tab, setTab] = useState('details');
  const [pubShareOpen, setPubShareOpen] = useState(false);
  const [shares, setShares] = useState([]);
  const [users, setUsers] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [extendOpen, setExtendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => { if (profile?.id) load(); else stopLoading(); }, [id, profile?.id]);

  async function load() {
    try {
      const [{ data: s }, { data: q }, { data: sh }, { data: u }] = await Promise.all([
        API.get(`/surveys/${id}`),
        API.get(`/surveys/${id}/questions`),
        API.get(`/surveys/${id}/shares`),
        API.get('/users/'),
      ]);
      setSv({ ...s, expires_at: s.expires_at ? new Date(s.expires_at).toISOString().slice(0,16) : '' });
      setIsEditing(s.status === 'draft');
      sQs((q||[]).map(x => {
        const opts = isMx(x.question_type) ? parseOpts(x.options, true) : hasO(x.question_type) ? parseOpts(x.options) : x.options;
        return { ...x, _id: x.id, options: opts };
      }));
      setShares(sh||[]);
      setUsers(u||[]);
    } catch(e) {
      console.error(e);
      toast.error('Failed to load survey');
      nav('/surveys');
    }
    finally { stopLoading(); }
  }

  const s = (k,v) => { setSv(p => ({...p,[k]:v})); setDirty(true); };
  const sQ = (tid,k,v) => sQs(a => a.map(q => q._id===tid ? {...q,[k]:v} : q));
  const addQ = () => sQs(a => [...a, { _id:'new_'+Math.random().toString(36).slice(2), question_text:'', question_type:'short_text', options:[], is_required:false, description:'' }]);
  const delQ = tid => {
    if (qs.length <= 1) return toast.error('Need at least 1 question');
    // We don't delete individually on backend anymore, we batch update on Save.
    sQs(a => a.filter(q => q._id !== tid));
    setDirty(true);
  };
  const moveQ = (tid,d) => sQs(a => { const i=a.findIndex(q=>q._id===tid); if((d===-1&&i===0)||(d===1&&i===a.length-1)) return a; const b=[...a]; [b[i],b[i+d]]=[b[i+d],b[i]]; return b; });
  const addOpt = tid => sQs(a => a.map(q => q._id===tid ? {...q,options:[...(q.options||[]),{label:'',value:''}]} : q));
  const sOpt = (tid,i,v) => sQs(a => a.map(q => { if(q._id!==tid) return q; const o=[...(q.options||[])]; o[i]={label:v,value:v.toLowerCase().replace(/\s+/g,'_')}; return {...q,options:o}; }));
  const delOpt = (tid,i) => sQs(a => a.map(q => q._id!==tid ? q : {...q,options:q.options.filter((_,j)=>j!==i)}));

  async function save() {
    if (!sv.title.trim()) return toast.error('Title required');
    if (sv.status === 'active' && sv.expires_at && isExpired(sv.expires_at)) {
      return toast.error('Expiry date cannot be in the past for active surveys');
    }
    setBusy(true);
    try {
      const meta = { title:sv.title,description:sv.description||null,welcome_message:sv.welcome_message||null,thank_you_message:sv.thank_you_message||null,expires_at:sv.expires_at||null,allow_anonymous:sv.allow_anonymous,require_email:sv.require_email,show_progress_bar:sv.show_progress_bar,theme_color:sv.theme_color };
      await API.patch(`/surveys/${id}`, meta);
      
      const qPayload = qs.map((q, i) => ({
        id: q._id.startsWith('new_') ? null : q._id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: hasO(q.question_type) ? q.options : isMx(q.question_type) ? (q.options || { rows: [], columns: [] }) : null,
        is_required: q.is_required,
        description: q.description || null,
        sort_order: i
      }));
      await API.put(`/surveys/${id}/questions`, qPayload);

      setDirty(false);
      toast.success('Saved');
      await load();
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Failed to save');
    }
    finally { setBusy(false); }
  }

  async function chg(st) {
    if (st==='active' && isExpired(sv.expires_at)) { setExtendOpen(true); return; }
    if (st==='active' && qs.length < 2) return toast.error('At least 2 questions are required to publish');
    try {
      await API.patch(`/surveys/${id}`, { status: st });
      toast.success('Updated');
      load();
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Failed to update status');
    }
  }

  async function doExtend(days) {
    const x=new Date(); x.setDate(x.getDate()+parseInt(days||7));
    try {
      await API.patch(`/surveys/${id}`, { status: 'active', expires_at: x.toISOString() });
      toast.success('Reactivated');
      load();
    } catch (e) {
      console.error(e);
      toast.error('Failed to reactivate');
    }
  }

  async function doDelete() {
    try {
      await API.delete(`/surveys/${id}`);
      toast.success('Survey deleted'); nav('/surveys');
    } catch(e) { 
      console.error(e); 
      toast.error(e.response?.data?.detail || 'Delete failed'); 
    }
  }

  async function share(uid) {
    if (!uid) return;
    try {
      await API.post(`/surveys/${id}/shares`, { shared_with: uid, permission: 'viewer' });
      toast.success('Access granted');
      load();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.detail || 'Share failed');
    }
  }

  async function revoke(shareId) {
    try {
      await API.delete(`/surveys/${id}/shares/${shareId}`);
      toast.success('Access revoked');
      load();
    } catch (e) {
      console.error(e);
      toast.error('Failed to revoke access');
    }
  }

  function copyLink() { const appOrigin = import.meta.env.VITE_FRONTEND_URL || window.location.origin; navigator.clipboard.writeText(`${appOrigin}/s/${sv.slug}`); toast.success('Copied!'); }

  function openPreview() { setPreviewStep(-1); setPreviewOpen(true); }

  if (!sv) return (
    <div style={{ textAlign:'center',padding:'100px 0' }}>
      <div style={{ width:48,height:48,borderRadius:16,background:'var(--cream-deep)',margin:'0 auto 20px',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(22,15,8,0.25)" strokeWidth="1.5" strokeLinecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div style={{ fontFamily:"'Fraunces',serif",color:'rgba(22,15,8,0.35)',fontSize:15 }}>Survey not found</div>
    </div>
  );

  function calcHealth() {
    let score=100;
    if (!sv.welcome_message) score-=5; if (!sv.expires_at) score-=5;
    if (qs.length>15) score-=20; if (qs.filter(q=>q.is_required).length>3) score-=10;
    if (qs.every(q=>q.question_type==='short_text')) score-=15;
    return Math.max(0, Math.min(100, score));
  }
  const health = calcHealth();
  const healthColor = health>=80 ? 'var(--sage)' : health>=50 ? 'var(--saffron)' : 'var(--terracotta)';
  const tc = sv.theme_color || '#FF4500';
  const statusStyle = STATUS_COLORS[sv.status] || STATUS_COLORS.draft;
  const TABS = [{ id:'details', n:'01', label:'Details' }, { id:'questions', n:'02', label:'Questions', count:qs.length }, { id:'settings', n:'03', label:'Settings' }];
  const curSection = getPreviewSection(previewStep, qs.length);

  // Health arc
  const ARC_R=28, ARC_CIRC=2*Math.PI*ARC_R, arcOffset=ARC_CIRC-(health/100)*ARC_CIRC;


  // ── Drag-enabled question card wrapper (needs useDragControls hook) ─────────
  function QCardEdit({ q, i }) {
    const dragControls = useDragControls();
    const [typeOpen, setTypeOpen] = React.useState(false);
    const typeRef = React.useRef(null);
    React.useEffect(() => {
      if (!typeOpen) return;
      const h = e => { if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [typeOpen]);
    const currentType = QUESTION_TYPES.find(t => t.value === q.question_type);
    return (
      <Reorder.Item value={q} dragControls={dragControls} dragListener={false} style={{ listStyle:'none' }}>
        <div className="q-card" style={{ background:'var(--warm-white)',borderRadius:24,border:'1.5px solid rgba(22,15,8,0.07)',overflow:'visible',position:'relative',transition:'border-color 0.25s,box-shadow 0.25s',animationDelay:`${i*0.05}s`, zIndex: typeOpen ? 100 : 1 }}>
          <div className="q-accent" style={{ position:'absolute',left:0,top:0,bottom:0,width:3,background:`linear-gradient(180deg,${tc},${tc}40)`,opacity:0.4,transition:'opacity 0.25s', borderTopLeftRadius:24, borderBottomLeftRadius:24 }}/>
          <div className="q-ghost-num" style={{ position:'absolute',right:18,bottom:-16,fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:110,color:'rgba(22,15,8,0.04)',lineHeight:1,letterSpacing:'-6px',userSelect:'none',pointerEvents:'none' }}>
            {String(i+1).padStart(2,'0')}
          </div>
          <div style={{ padding:'24px 28px 22px 32px' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                {/* Drag handle */}
                <div
                  className="drag-handle"
                  onPointerDown={e => { e.preventDefault(); dragControls.start(e); }}
                  title="Drag to reorder"
                  style={{ cursor:'grab',padding:'4px 6px',borderRadius:8,color:'rgba(22,15,8,0.2)',display:'flex',alignItems:'center',transition:'all 0.15s',touchAction:'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--cream-deep)'; e.currentTarget.style.color='rgba(22,15,8,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='rgba(22,15,8,0.2)'; }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg>
                </div>
                <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.2em',color:'rgba(22,15,8,0.22)' }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ width:1,height:11,background:'rgba(22,15,8,0.1)',display:'block' }}/>
                <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:8,letterSpacing:'0.14em',textTransform:'uppercase',color:tc,background:`${tc}12`,padding:'4px 10px',borderRadius:999 }}>
                  {currentType?.label || 'Question'}
                </span>
                {q.is_required && <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:8,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--terracotta)',background:'rgba(214,59,31,0.08)',padding:'4px 10px',borderRadius:999 }}>Required</span>}
              </div>
              <div style={{ display:'flex',gap:2 }}>
                {[[-1,'↑'],[1,'↓']].map(([d,sym]) => (
                  <button key={d} onClick={()=>moveQ(q._id,d)} disabled={(d===-1&&i===0)||(d===1&&i===qs.length-1)} className="np-icon-btn"
                    style={{ width:30,height:30,borderRadius:9,border:'none',background:'none',cursor:'pointer',color:'rgba(22,15,8,0.25)',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s',opacity:(d===-1&&i===0)||(d===1&&i===qs.length-1)?0.18:1 }}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--cream-deep)';e.currentTarget.style.color='var(--espresso)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='rgba(22,15,8,0.25)';}}>
                    {sym}
                  </button>
                ))}
                <button onClick={()=>delQ(q._id)} className="np-icon-btn" style={{ width:30,height:30,borderRadius:9,border:'none',background:'none',cursor:'pointer',color:'rgba(22,15,8,0.2)',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(214,59,31,0.08)';e.currentTarget.style.color='var(--terracotta)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='rgba(22,15,8,0.2)';}}>✕</button>
              </div>
            </div>

            {/* Question text */}
            <input value={q.question_text} onChange={e=>sQ(q._id,'question_text',e.target.value)} placeholder="Type your question here…"
              style={{...INP,fontSize:17,padding:'14px 18px',background:'rgba(253,245,232,0.55)',border:'1.5px solid rgba(22,15,8,0.07)',marginBottom:10,borderRadius:16}} onFocus={fi} onBlur={fo}/>

            {/* Helper text */}
            <input value={q.description||''} onChange={e=>sQ(q._id,'description',e.target.value)} placeholder="Description or helper text (optional)"
              style={{...INP,fontSize:13,color:'rgba(22,15,8,0.45)',padding:'10px 16px',background:'transparent',border:'1.5px solid rgba(22,15,8,0.06)',marginBottom:16,borderRadius:13}} onFocus={fi} onBlur={fo}/>

            {/* Type selector with icons + required toggle */}
            <div style={{ display:'flex',gap:12,alignItems:'center' }}>
              <div style={{ flex:1,position:'relative' }} ref={typeRef}>
                <button onClick={() => setTypeOpen(o => !o)}
                  style={{ width:'100%',display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:'var(--cream-deep)',border:'1.5px solid rgba(22,15,8,0.1)',borderRadius:13,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--espresso)',transition:'border-color 0.2s',textAlign:'left' }}
                  onFocus={fi} onBlur={fo}>
                  <span style={{ width:26,height:26,borderRadius:8,background:`${tc}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0,color:tc }}>{currentType?.icon}</span>
                  <span style={{ flex:1 }}>{currentType?.label}</span>
                  <svg width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ flexShrink:0,opacity:0.4,transition:'transform 0.2s',transform:typeOpen?'rotate(180deg)':'none' }}><path d="M0 0l4.5 6L9 0z" fill="currentColor"/></svg>
                </button>
                {typeOpen && (
                  <div style={{ position:'absolute',left:0,right:0,top:'calc(100% + 6px)',zIndex:100,background:'var(--espresso)',borderRadius:16,padding:6,boxShadow:'0 24px 60px rgba(22,15,8,0.3)',maxHeight:280,overflowY:'auto' }}>
                    {QUESTION_TYPES.map(t => (
                      <button key={t.value}
                        onClick={() => { sQ(q._id,'question_type',t.value); setTypeOpen(false); }}
                        style={{ width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'none',border:'none',cursor:'pointer',borderRadius:10,transition:'background 0.12s',color:t.value===q.question_type?'var(--coral)':'rgba(253,245,232,0.75)',textAlign:'left' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(253,245,232,0.08)'}
                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <span style={{ width:28,height:28,borderRadius:8,background:t.value===q.question_type?'rgba(255,69,0,0.18)':'rgba(253,245,232,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0,color:t.value===q.question_type?'var(--coral)':'rgba(253,245,232,0.5)' }}>{t.icon}</span>
                        <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase' }}>{t.label}</span>
                        {t.value===q.question_type && <svg style={{ marginLeft:'auto',flexShrink:0 }} width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',flexShrink:0,userSelect:'none' }}>
                <div onClick={()=>sQ(q._id,'is_required',!q.is_required)}
                  style={{ width:38,height:22,borderRadius:999,background:q.is_required?tc:'rgba(22,15,8,0.12)',position:'relative',transition:'background 0.25s',cursor:'pointer' }}>
                  <div style={{ position:'absolute',width:16,height:16,borderRadius:'50%',background:'#fff',top:3,left:q.is_required?19:3,transition:'left 0.25s',boxShadow:'0 1px 4px rgba(22,15,8,0.2)' }}/>
                </div>
                <span style={{ fontFamily:"'Syne',sans-serif",fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.38)',whiteSpace:'nowrap' }}>Required</span>
              </label>
            </div>

            {/* Options for choice types */}
            {hasO(q.question_type) && (
              <div style={{ marginTop:16,paddingLeft:14,borderLeft:`2px solid ${tc}25` }}>
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {(q.options||[]).map((o,j) => (
                    <div key={j} className="opt-row" style={{ display:'flex',alignItems:'center',gap:8,padding:'4px 12px 4px 14px',borderRadius:12,border:'1.5px solid rgba(22,15,8,0.07)',background:'rgba(253,245,232,0.5)',transition:'all 0.15s' }}>
                      <div style={{ width:10,height:10,borderRadius:'50%',border:`2px solid ${tc}55`,flexShrink:0,background:`${tc}15` }}/>
                      <input value={o.label} onChange={e=>sOpt(q._id,j,e.target.value)} placeholder={`Option ${j+1}`} className="opt-input"/>
                      <button onClick={()=>delOpt(q._id,j)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(22,15,8,0.18)',fontSize:12,padding:4,transition:'color 0.15s',lineHeight:1 }}
                        onMouseEnter={e=>e.currentTarget.style.color='var(--terracotta)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.18)'}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={()=>addOpt(q._id)} style={{ marginTop:10,display:'inline-flex',alignItems:'center',gap:7,fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:tc,background:'none',border:'none',cursor:'pointer',padding:'4px 0',transition:'opacity 0.15s' }}>
                  <span style={{ width:18,height:18,borderRadius:6,background:`${tc}14`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700 }}>+</span>
                  Add option
                </button>
              </div>
            )}

            {/* Matrix editor */}
            {isMx(q.question_type) && (() => {
              const mx = q.options && !Array.isArray(q.options) ? q.options : { rows:[], columns:[] };
              const setMx = next => sQ(q._id,'options',next);
              const addRow = () => setMx({...mx,rows:[...(mx.rows||[]),{label:`Row ${(mx.rows||[]).length+1}`,value:`row_${(mx.rows||[]).length+1}`}]});
              const addCol = () => setMx({...mx,columns:[...(mx.columns||[]),{label:`Col ${(mx.columns||[]).length+1}`,value:`col_${(mx.columns||[]).length+1}`}]});
              const updRow = (ri,v) => { const r=[...(mx.rows||[])];r[ri]={label:v,value:v.toLowerCase().replace(/\s+/g,'_')};setMx({...mx,rows:r}); };
              const updCol = (ci,v) => { const cs=[...(mx.columns||[])];cs[ci]={label:v,value:v.toLowerCase().replace(/\s+/g,'_')};setMx({...mx,columns:cs}); };
              const delRow = ri => setMx({...mx,rows:(mx.rows||[]).filter((_,j)=>j!==ri)});
              const delCol = ci => setMx({...mx,columns:(mx.columns||[]).filter((_,j)=>j!==ci)});
              return (
                <div className="mx-grid" style={{ marginTop:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:18 }}>
                  {[['Rows',mx.rows||[],addRow,updRow,delRow],['Columns',mx.columns||[],addCol,updCol,delCol]].map(([lbl,items,add,upd,del]) => (
                    <div key={lbl}>
                      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',color:'rgba(22,15,8,0.38)',marginBottom:10 }}>{lbl}</div>
                      {items.map((r,idx) => (
                        <div key={idx} style={{ display:'flex',gap:7,marginBottom:7 }}>
                          <input value={r.label} onChange={e=>upd(idx,e.target.value)} placeholder={`${lbl.slice(0,-1)} ${idx+1}`} style={{...INP,flex:1,padding:'9px 13px',fontSize:13,borderRadius:12}} onFocus={fi} onBlur={fo}/>
                          <button onClick={()=>del(idx)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(22,15,8,0.2)',fontSize:12,padding:'0 4px' }} onMouseEnter={e=>e.currentTarget.style.color='var(--terracotta)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.2)'}>✕</button>
                        </div>
                      ))}
                      <button onClick={add} style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:tc,background:'none',border:'none',cursor:'pointer',padding:'4px 0' }}>+ Add {lbl.slice(0,-1).toLowerCase()}</button>
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

  return (
    <div>
      <style>{`
        @keyframes qCardIn { from { opacity:0; transform:translateY(16px) scale(0.985); } to { opacity:1; transform:translateY(0) scale(1); } }
        .q-card { animation: qCardIn 0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .q-card:hover { border-color: rgba(22,15,8,0.14) !important; box-shadow: 0 12px 48px rgba(22,15,8,0.08) !important; }
        .q-card:hover .q-accent { opacity: 1 !important; }
        .q-card:hover .q-ghost-num { opacity: 0.055 !important; }
        .np-sel { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='rgba(22,15,8,0.35)' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px !important; }
        .opt-input { background:none; border:none; outline:none; font-family:'Fraunces',serif; font-size:14px; color:var(--espresso); padding:7px 0; flex:1; }
        .opt-row:hover { background:rgba(255,255,255,0.9) !important; border-color:rgba(22,15,8,0.16) !important; }
        .se-tab-btn { position:relative; }
        .se-tab-btn::after { content:''; position:absolute; bottom:-1px; left:0; right:0; height:2px; border-radius:1px; background:var(--coral); transform:scaleX(0); transition:transform 0.3s cubic-bezier(0.16,1,0.3,1); transform-origin:left; }
        .se-tab-btn.active::after { transform:scaleX(1); }
        @media (max-width: 1040px) { .se-sidebar { position: static !important; } }
        @media (max-width: 768px) {
          .se-grid { grid-template-columns: 1fr !important; }
          .se-sidebar { display: none !important; }
          .q-card > div { padding: 14px 14px 14px 18px !important; }
          .drag-handle { display: none !important; }
          .opt-input { font-size: 16px !important; }
          .mx-grid { grid-template-columns: 1fr !important; }
          .se-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── PREVIEW MODAL ── */}
      {previewOpen && (
        <div style={{ position:'fixed',inset:0,zIndex:8000,background:'rgba(22,15,8,0.78)',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}
          onClick={e=>{if(e.target===e.currentTarget)setPreviewOpen(false);}}>
          <div style={{ background:'var(--cream)',borderRadius:28,width:'100%',maxWidth:520,maxHeight:'88vh',overflow:'auto',boxShadow:'0 64px 160px rgba(22,15,8,0.5)',position:'relative' }}>
            <div style={{ position:'sticky',top:0,background:'rgba(253,245,232,0.97)',backdropFilter:'blur(12px)',padding:'16px 22px 14px',borderBottom:'1px solid rgba(22,15,8,0.07)',zIndex:1 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                  <div style={{ width:7,height:7,borderRadius:'50%',background:'var(--coral)',boxShadow:'0 0 8px rgba(255,69,0,0.6)' }}/>
                  <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--coral)' }}>Preview Mode</span>
                </div>
                <button onClick={()=>setPreviewOpen(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(22,15,8,0.35)',fontSize:16,lineHeight:1,width:30,height:30,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(22,15,8,0.06)';e.currentTarget.style.color='var(--espresso)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='rgba(22,15,8,0.35)';}}>✕</button>
              </div>
              <div style={{ display:'flex',gap:3,background:'var(--cream-deep)',borderRadius:12,padding:3 }}>
                {['Details','Questions','Post Survey'].map(sec => {
                  const active = curSection === sec;
                  return (
                    <button key={sec}
                      onClick={() => { if(sec==='Details')setPreviewStep(-1); if(sec==='Questions')setPreviewStep(Math.max(0,Math.min(previewStep,qs.length-1))); if(sec==='Post Survey')setPreviewStep(qs.length); }}
                      style={{ flex:1,padding:'8px 4px',borderRadius:9,border:'none',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',transition:'all 0.2s',background:active?'var(--espresso)':'transparent',color:active?'var(--cream)':'rgba(22,15,8,0.35)',boxShadow:active?'0 2px 10px rgba(22,15,8,0.15)':'none' }}>
                      {sec}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ padding:36 }}>
              {curSection==='Details' && (
                <div style={{ textAlign:'center',paddingBottom:24 }}>
                  <div style={{ display:'inline-flex',alignItems:'center',gap:6,marginBottom:18,padding:'5px 16px',borderRadius:999,background:'rgba(255,69,0,0.07)',fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--coral)' }}>
                    <span style={{ width:5,height:5,borderRadius:'50%',background:'var(--coral)',display:'inline-block' }}/> Preview Mode
                  </div>
                  <h2 style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,letterSpacing:'-1px',color:'var(--espresso)',marginBottom:12,lineHeight:1.1 }}>{sv.title}</h2>
                  {sv.description && <p style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:15,color:'rgba(22,15,8,0.45)',lineHeight:1.7,marginBottom:16 }}>{sv.description}</p>}
                  {sv.welcome_message
                    ? <p style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:15,color:'rgba(22,15,8,0.6)',lineHeight:1.7,marginBottom:24,padding:'16px 20px',background:'var(--warm-white)',borderRadius:16,textAlign:'left',border:'1px solid rgba(22,15,8,0.07)' }}>{sv.welcome_message}</p>
                    : <div style={{ height:60,background:'rgba(22,15,8,0.03)',borderRadius:16,marginBottom:24,display:'flex',alignItems:'center',justifyContent:'center' }}><span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.2)' }}>No welcome message</span></div>}
                  <button onClick={()=>setPreviewStep(0)} style={{ display:'inline-flex',alignItems:'center',gap:10,padding:'14px 32px',borderRadius:999,background:`${tc}`,color:'#fff',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',border:'none',cursor:'pointer',boxShadow:`0 8px 28px ${tc}40` }}>
                    Begin Survey <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              )}

              {curSection==='Questions' && qs.length > 0 && (() => {
                const qi = Math.max(0, Math.min(previewStep, qs.length-1));
                const q = qs[qi];
                return (
                  <div>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28 }}>
                      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(22,15,8,0.3)' }}>Question {qi+1} of {qs.length}</div>
                      {sv.show_progress_bar && (
                        <div style={{ width:100,height:3,borderRadius:999,background:'rgba(22,15,8,0.07)',overflow:'hidden' }}>
                          <div style={{ height:'100%',width:`${((qi+1)/qs.length)*100}%`,background:tc,borderRadius:999,transition:'width 0.4s' }}/>
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:22,color:'var(--espresso)',marginBottom:8,lineHeight:1.3,letterSpacing:'-0.3px' }}>{q.question_text || <em style={{opacity:0.3}}>No question text</em>}</div>
                    {q.description && <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:'rgba(22,15,8,0.5)',marginBottom:20,lineHeight:1.6 }}>{q.description}</div>}
                    {hasO(q.question_type) && parseOpts(q.options).length>0 && (
                      <div style={{ display:'flex',flexDirection:'column',gap:10,marginTop:20 }}>
                        {parseOpts(q.options).map((o,j) => (
                          <div key={j} style={{ display:'flex',alignItems:'center',gap:12,padding:'14px 18px',borderRadius:14,border:`1.5px solid rgba(22,15,8,0.09)`,background:'var(--warm-white)',cursor:'pointer',transition:'all 0.2s' }}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.background=`${tc}08`;}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.09)';e.currentTarget.style.background='var(--warm-white)';}}>
                            <div style={{ width:16,height:16,borderRadius:q.question_type==='multiple_choice'?5:'50%',border:`2px solid rgba(22,15,8,0.2)`,flexShrink:0 }}/>
                            <span style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:15,color:'var(--espresso)' }}>{o.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display:'flex',justifyContent:'space-between',marginTop:28,paddingTop:20,borderTop:'1px solid rgba(22,15,8,0.06)' }}>
                      <button onClick={()=>setPreviewStep(p=>Math.max(-1,p-1))} disabled={qi===0}
                        style={{ padding:'11px 24px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.12)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.45)',cursor:qi===0?'not-allowed':'pointer',opacity:qi===0?0.3:1,transition:'all 0.2s' }}>
                        Back
                      </button>
                      <button onClick={()=>setPreviewStep(p=>Math.min(qs.length,p+1))}
                        style={{ padding:'11px 28px',borderRadius:999,border:'none',background:tc,color:'#fff',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer',boxShadow:`0 4px 18px ${tc}40`,transition:'all 0.2s' }}>
                        {qi===qs.length-1?'Finish':'Continue'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {curSection==='Post Survey' && (
                <div style={{ textAlign:'center',padding:'24px 0' }}>
                  <div style={{ width:56,height:56,borderRadius:18,background:`${tc}15`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <h3 style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:26,letterSpacing:'-1px',color:'var(--espresso)',marginBottom:12 }}>All done!</h3>
                  <p style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:15,color:'rgba(22,15,8,0.5)',lineHeight:1.7 }}>{sv.thank_you_message || 'Thank you for completing this survey!'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      <ConfirmModal open={extendOpen} title="Reactivate Survey" body="This survey has expired. Choose how many days to extend it." confirmLabel="Reactivate" onConfirm={days=>{ doExtend(days); setExtendOpen(false); }} onClose={()=>setExtendOpen(false)} prompt={{ label: 'Extend by (days)', defaultValue: '7', type: 'number', min: 1, max: 365 }} />
      <ConfirmModal open={deleteOpen} title="Delete Survey" body="This action cannot be undone. All responses will be permanently deleted." confirmLabel="Delete" danger onConfirm={()=>{ doDelete(); setDeleteOpen(false); }} onClose={()=>setDeleteOpen(false)} />
      <ShareModal survey={{ slug: sv.slug, title: sv.title }} isOpen={pubShareOpen} onClose={()=>setPubShareOpen(false)} />

      {/* ── PAGE HEADER ── */}
      <div style={{ position:'relative',marginBottom:48,paddingBottom:44,overflow:'hidden' }}>
        <div style={{ position:'absolute',inset:0,backgroundImage:GRAIN,backgroundSize:'250px',opacity:0.025,pointerEvents:'none' }}/>
        <div style={{ position:'absolute',right:-120,top:-120,width:360,height:360,borderRadius:'50%',background:`radial-gradient(circle,${tc}20,transparent 70%)`,pointerEvents:'none' }}/>
        <div style={{ position:'absolute',bottom:0,left:0,right:0,height:'1px',background:'linear-gradient(90deg,transparent,rgba(22,15,8,0.08) 30%,rgba(22,15,8,0.08) 70%,transparent)' }}/>

        <div style={{ position:'relative',zIndex:1 }}>
          {/* Breadcrumb */}
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16 }}>
            <Link to="/surveys" style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(22,15,8,0.35)',textDecoration:'none',transition:'color 0.2s' }}
              onMouseEnter={e=>e.currentTarget.style.color='var(--espresso)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.35)'}>
              Surveys
            </Link>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(22,15,8,0.2)" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(22,15,8,0.35)' }}>Edit</span>
          </div>

          <div className="np-page-header" style={{ marginBottom: 32 }}>
            <div>
              <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:14 }}>
                <div style={{ width:28,height:1.5,background:'var(--coral)',borderRadius:1 }}/>
                <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.22em',textTransform:'uppercase',color:'var(--coral)' }}>Research Studio</span>
                {/* Status badge */}
                <div style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 12px',borderRadius:999,background:statusStyle.bg }}>
                  <div style={{ width:5,height:5,borderRadius:'50%',background:statusStyle.dot }}/>
                  <span style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',color:statusStyle.text }}>{sv.status}</span>
                </div>
                {dirty && (
                  <div style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 12px',borderRadius:999,background:'rgba(255,184,0,0.12)' }}>
                    <div style={{ width:5,height:5,borderRadius:'50%',background:'var(--saffron)',boxShadow:'0 0 8px rgba(255,184,0,0.5)' }}/>
                    <span style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',color:'#A07000' }}>Unsaved</span>
                  </div>
                )}
              </div>
              <h1 style={{ fontFamily:"'Playfair Display', serif",fontWeight:900,fontSize:'clamp(34px,4vw,56px)',letterSpacing:'-2.5px',color:'var(--espresso)',margin:0,lineHeight:0.95,maxWidth:600 }}>
                {sv.title || <em style={{opacity:0.3}}>Untitled Survey</em>}
              </h1>
            </div>

            <div style={{ display:'flex',gap:8,flexShrink:0,flexWrap:'wrap' }}>
              <button onClick={openPreview} style={{ display:'flex',alignItems:'center',gap:8,padding:'11px 20px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.12)',background:'rgba(255,255,255,0.6)',backdropFilter:'blur(8px)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.5)',cursor:'pointer',transition:'all 0.2s' }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.25)';e.currentTarget.style.color='var(--espresso)';e.currentTarget.style.background='rgba(255,255,255,0.9)';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.12)';e.currentTarget.style.color='rgba(22,15,8,0.5)';e.currentTarget.style.background='rgba(255,255,255,0.6)';}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
                Preview
              </button>
              <button onClick={copyLink} style={{ display:'flex',alignItems:'center',gap:8,padding:'11px 20px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.12)',background:'rgba(255,255,255,0.6)',backdropFilter:'blur(8px)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.5)',cursor:'pointer',transition:'all 0.2s' }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.25)';e.currentTarget.style.color='var(--espresso)';e.currentTarget.style.background='rgba(255,255,255,0.9)';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.12)';e.currentTarget.style.color='rgba(22,15,8,0.5)';e.currentTarget.style.background='rgba(255,255,255,0.6)';}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Copy link
              </button>
              {isEditing && (
                <button onClick={save} disabled={busy} style={{ display:'flex',alignItems:'center',gap:8,padding:'11px 24px',borderRadius:999,border:'none',background:'var(--espresso)',color:'var(--cream)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',cursor:'pointer',transition:'all 0.25s',opacity:busy?0.45:1,boxShadow:'0 6px 24px rgba(22,15,8,0.25)' }}
                  onMouseEnter={e=>{if(!busy){e.currentTarget.style.background=tc;e.currentTarget.style.boxShadow=`0 10px 36px ${tc}50`;}}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--espresso)';e.currentTarget.style.boxShadow='0 6px 24px rgba(22,15,8,0.25)';}}>
                  {busy ? 'Saving…' : <><span>Save Changes</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── STATUS CONTROL BAR ── */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',background:'var(--warm-white)',borderRadius:18,border:'1.5px solid rgba(22,15,8,0.07)',marginBottom:32,flexWrap:'wrap',gap:12 }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(22,15,8,0.35)' }}>Status</span>
          <div style={{ display:'flex',gap:6 }}>
            {['draft','active','paused','closed'].map(st => {
              const sc = STATUS_COLORS[st];
              return (
                <button key={st} onClick={()=>chg(st)}
                  style={{ padding:'5px 14px',borderRadius:999,border:`1.5px solid ${sv.status===st?sc.text:'rgba(22,15,8,0.1)'}`,background:sv.status===st?sc.bg:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:sv.status===st?sc.text:'rgba(22,15,8,0.35)',cursor:'pointer',transition:'all 0.2s' }}
                  onMouseEnter={e=>{ if(sv.status!==st){e.currentTarget.style.borderColor=sc.text;e.currentTarget.style.color=sc.text;} }}
                  onMouseLeave={e=>{ if(sv.status!==st){e.currentTarget.style.borderColor='rgba(22,15,8,0.1)';e.currentTarget.style.color='rgba(22,15,8,0.35)';} }}>
                  {st}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          {sv.expires_at && (
            <span style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:13,color:'rgba(22,15,8,0.4)' }}>
              Expires {formatDate(sv.expires_at)}
            </span>
          )}
          <button onClick={()=>setPubShareOpen(true)} style={{ display:'flex',alignItems:'center',gap:7,padding:'7px 16px',borderRadius:999,border:'1.5px solid rgba(22,15,8,0.1)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.45)',cursor:'pointer',transition:'all 0.2s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.color=tc;e.currentTarget.style.background=`${tc}06`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.1)';e.currentTarget.style.color='rgba(22,15,8,0.45)';e.currentTarget.style.background='transparent';}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          {sv.status === 'draft' && hasPermission(profile?.role, 'delete_survey') && (
            <button onClick={()=>setDeleteOpen(true)} style={{ padding:'7px 16px',borderRadius:999,border:'1.5px solid rgba(214,59,31,0.15)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(214,59,31,0.5)',cursor:'pointer',transition:'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--terracotta)';e.currentTarget.style.color='var(--terracotta)';e.currentTarget.style.background='rgba(214,59,31,0.05)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(214,59,31,0.15)';e.currentTarget.style.color='rgba(214,59,31,0.5)';e.currentTarget.style.background='transparent';}}>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ── TWO-COLUMN WORKSPACE ── */}
      <div className="se-grid np-grid-responsive" style={{ display:'grid',gridTemplateColumns:'1fr 300px',gap:40,alignItems:'start' }}>

        {/* LEFT — Editor */}
        <div>
          {/* ── EDITORIAL TAB NAVIGATION ── */}
          <div style={{ display:'flex',gap:0,marginBottom:40,borderBottom:'1px solid rgba(22,15,8,0.07)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`se-tab-btn${tab === t.id ? ' active' : ''}`}
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
              <div>
                <label style={LBL}>Survey Title {isEditing ? '*' : ''}</label>
                {isEditing
                  ? <input value={sv.title} onChange={e=>s('title',e.target.value)} style={{...INP,fontSize:20,fontWeight:500,padding:'18px 22px',letterSpacing:'-0.4px',borderRadius:18}} onFocus={fi} onBlur={fo}/>
                  : <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:20,color:'var(--espresso)',padding:'16px 22px',background:'var(--cream-deep)',borderRadius:16,letterSpacing:'-0.4px' }}>{sv.title}</div>}
              </div>
              <div className="se-2col" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:22 }}>
                <div><label style={LBL}>Description</label>{isEditing?<textarea value={sv.description||''} onChange={e=>s('description',e.target.value)} placeholder="What's this research about?" rows={4} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/>:<div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:sv.description?'var(--espresso)':'rgba(22,15,8,0.3)',padding:'12px 18px',background:'var(--cream-deep)',borderRadius:16,minHeight:48,lineHeight:1.6 }}>{sv.description||'—'}</div>}</div>
                <div><label style={LBL}>Welcome Message</label>{isEditing?<textarea value={sv.welcome_message||''} onChange={e=>s('welcome_message',e.target.value)} placeholder="Shown before Q1" rows={4} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/>:<div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:sv.welcome_message?'var(--espresso)':'rgba(22,15,8,0.3)',padding:'12px 18px',background:'var(--cream-deep)',borderRadius:16,minHeight:48,lineHeight:1.6 }}>{sv.welcome_message||'—'}</div>}</div>
              </div>
              <div><label style={LBL}>Thank You Message</label>{isEditing?<textarea value={sv.thank_you_message||''} onChange={e=>s('thank_you_message',e.target.value)} placeholder="Shown after submission" rows={2} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/>:<div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:'var(--espresso)',padding:'12px 18px',background:'var(--cream-deep)',borderRadius:16,lineHeight:1.6 }}>{sv.thank_you_message||'—'}</div>}</div>
              <div className="se-2col" style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:22 }}>
                <div><label style={LBL}>Expires</label>{isEditing?<input type="datetime-local" value={sv.expires_at||''} onChange={e=>s('expires_at',e.target.value)} style={{...INP,borderRadius:16}} onFocus={fi} onBlur={fo}/>:<div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:sv.expires_at?'var(--espresso)':'rgba(22,15,8,0.3)',padding:'12px 18px',background:'var(--cream-deep)',borderRadius:16,minHeight:48 }}>{sv.expires_at?formatDate(sv.expires_at):'No expiry set'}</div>}</div>
                <div>
                  <label style={LBL}>Theme Colour</label>
                  {isEditing ? (
                    <div style={{ display:'flex',gap:12,alignItems:'center' }}>
                      <input type="color" value={sv.theme_color||'#FF4500'} onChange={e=>s('theme_color',e.target.value)} style={{ width:52,height:52,borderRadius:14,border:'1.5px solid rgba(22,15,8,0.1)',cursor:'pointer',padding:4,background:'var(--warm-white)',flexShrink:0 }}/>
                      <input value={sv.theme_color||''} onChange={e=>s('theme_color',e.target.value)} style={{...INP,flex:1,letterSpacing:'0.05em',borderRadius:16}} onFocus={fi} onBlur={fo}/>
                    </div>
                  ) : (
                    <div style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 18px',background:'var(--cream-deep)',borderRadius:16 }}>
                      <div style={{ width:28,height:28,borderRadius:9,background:sv.theme_color||'#FF4500',flexShrink:0,boxShadow:`0 2px 8px ${tc}40` }}/>
                      <span style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:14,color:'var(--espresso)',letterSpacing:'0.05em' }}>{sv.theme_color||'#FF4500'}</span>
                    </div>
                  )}
                </div>
              </div>
              {!isEditing && (
                <button onClick={()=>setIsEditing(true)}
                  style={{ alignSelf:'flex-start',display:'flex',alignItems:'center',gap:8,padding:'11px 24px',borderRadius:999,border:`1.5px solid ${tc}`,background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:tc,cursor:'pointer',transition:'all 0.25s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background=tc;e.currentTarget.style.color='#fff';e.currentTarget.style.boxShadow=`0 6px 24px ${tc}40`;}}
                  onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=tc;e.currentTarget.style.boxShadow='none';}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit Survey
                </button>
              )}
            </div>
          )}

          {/* ── QUESTIONS TAB ── */}
          {tab === 'questions' && (
            <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
              {isEditing ? (
                <Reorder.Group axis="y" values={qs} onReorder={sQs} style={{ listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:16 }}>
                  {qs.map((q, i) => (
                    <QCardEdit key={q._id} q={q} i={i} />
                  ))}
                </Reorder.Group>
              ) : (
                /* VIEW-ONLY question list */
                <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                  {qs.map((q,i) => (
                    <div key={q._id} style={{ background:'var(--warm-white)',borderRadius:22,padding:'22px 26px 20px 30px',border:'1.5px solid rgba(22,15,8,0.07)',position:'relative',overflow:'hidden' }}>
                      <div style={{ position:'absolute',left:0,top:0,bottom:0,width:3,background:`linear-gradient(180deg,${tc},${tc}55)`,opacity:0.35 }}/>
                      <div style={{ position:'absolute',right:16,bottom:-14,fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:96,color:'rgba(22,15,8,0.03)',lineHeight:1,letterSpacing:'-5px',userSelect:'none',pointerEvents:'none' }}>{String(i+1).padStart(2,'0')}</div>
                      <div style={{ paddingLeft:4,position:'relative',zIndex:1 }}>
                        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}>
                          <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,letterSpacing:'0.2em',color:'rgba(22,15,8,0.2)' }}>{String(i+1).padStart(2,'0')}</span>
                          <span style={{ width:1,height:10,background:'rgba(22,15,8,0.1)',display:'block' }}/>
                          <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:8,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(22,15,8,0.35)',background:'var(--cream-deep)',padding:'4px 10px',borderRadius:999 }}>{QUESTION_TYPES.find(t=>t.value===q.question_type)?.label||'Question'}</span>
                          {q.is_required && <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:8,letterSpacing:'0.12em',textTransform:'uppercase',color:tc }}>Required</span>}
                        </div>
                        <p style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,color:'var(--espresso)',marginBottom:q.description?8:0,lineHeight:1.35,letterSpacing:'-0.2px' }}>{q.question_text||<em style={{opacity:0.3}}>No question text</em>}</p>
                        {q.description && <p style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:13,color:'rgba(22,15,8,0.5)',marginBottom:10,lineHeight:1.55 }}>{q.description}</p>}
                        {hasO(q.question_type) && parseOpts(q.options).length>0 && (
                          <div style={{ display:'flex',flexWrap:'wrap',gap:7,marginTop:10 }}>
                            {parseOpts(q.options).map((o,j) => (
                              <span key={j} style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:12,color:'rgba(22,15,8,0.6)',background:'var(--cream-deep)',padding:'5px 14px',borderRadius:999,border:'1px solid rgba(22,15,8,0.07)' }}>{o.label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isEditing && (
                <>
                  <button onClick={addQ}
                    style={{ width:'100%',padding:'22px 0',border:'2px dashed rgba(22,15,8,0.1)',borderRadius:24,background:'transparent',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'rgba(22,15,8,0.28)',transition:'all 0.3s',display:'flex',alignItems:'center',justifyContent:'center',gap:12 }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=tc;e.currentTarget.style.color=tc;e.currentTarget.style.background=`${tc}05`;e.currentTarget.style.boxShadow=`0 4px 24px ${tc}10`;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.1)';e.currentTarget.style.color='rgba(22,15,8,0.28)';e.currentTarget.style.background='transparent';e.currentTarget.style.boxShadow='none';}}>
                    <span style={{ width:26,height:26,borderRadius:9,border:'1.5px solid currentColor',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16 }}>+</span>
                    Add Question
                  </button>
                  <AISurveySuggestions survey={sv} questions={qs} tc={tc}
                    onAdd={q=>sQs(a=>[...a,{_id:'new_'+Math.random().toString(36).slice(2),question_text:q.question_text,question_type:q.question_type,options:q.options||[],is_required:false,description:q.description||''}])}/>
                </>
              )}
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
                  style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'22px 26px',background:'var(--warm-white)',borderRadius:22,border:'1.5px solid rgba(22,15,8,0.07)',cursor:isEditing?'pointer':'default',transition:'all 0.25s',position:'relative',overflow:'hidden' }}
                  onClick={()=>{if(isEditing)s(x.k,!sv[x.k]);}}
                  onMouseEnter={e=>{if(isEditing){e.currentTarget.style.borderColor='rgba(22,15,8,0.14)';e.currentTarget.style.background='#fff';e.currentTarget.style.boxShadow='0 6px 28px rgba(22,15,8,0.06)';}}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.07)';e.currentTarget.style.background='var(--warm-white)';e.currentTarget.style.boxShadow='none';}}>
                  <div style={{ position:'absolute',left:0,top:0,bottom:0,width:3,background:sv[x.k]?`linear-gradient(180deg,${tc},${tc}50)`:'transparent',transition:'background 0.3s' }}/>
                  <div style={{ display:'flex',alignItems:'center',gap:18,paddingLeft:8 }}>
                    <div style={{ width:44,height:44,borderRadius:14,background:sv[x.k]?`${tc}12`:'rgba(22,15,8,0.05)',display:'flex',alignItems:'center',justifyContent:'center',color:sv[x.k]?tc:'rgba(22,15,8,0.32)',transition:'all 0.25s',flexShrink:0 }}>{x.ico}</div>
                    <div>
                      <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:17,color:'var(--espresso)',marginBottom:4 }}>{x.l}</div>
                      <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:13,color:'rgba(22,15,8,0.42)' }}>{x.d}</div>
                    </div>
                  </div>
                  <div style={{ width:46,height:26,borderRadius:999,background:sv[x.k]?tc:'rgba(22,15,8,0.12)',position:'relative',transition:'background 0.25s',flexShrink:0,opacity:isEditing?1:0.65 }}>
                    <div style={{ position:'absolute',width:20,height:20,borderRadius:'50%',background:'#fff',top:3,left:sv[x.k]?23:3,transition:'left 0.25s',boxShadow:'0 1px 6px rgba(22,15,8,0.2)' }}/>
                  </div>
                </div>
              ))}
              {!isEditing && <p style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.25)',textAlign:'center',paddingTop:4 }}>Read-only — click "Edit Survey" to make changes.</p>}

              {/* ── INTERNAL TEAM SHARING ── */}
              <div style={{ marginTop:24,padding:'24px 26px',background:'var(--warm-white)',borderRadius:22,border:'1.5px solid rgba(22,15,8,0.07)' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
                  <div style={{ width:32,height:32,borderRadius:10,background:'rgba(22,15,8,0.05)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--espresso)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                    <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:17,color:'var(--espresso)' }}>Collaborators</div>
                    <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:12,color:'rgba(22,15,8,0.4)' }}>Share this survey with your team</div>
                  </div>
                </div>

                {/* Add collaborator */}
                {isEditing && (
                  <div style={{ display:'flex',gap:10,marginBottom:24,paddingBottom:24,borderBottom:'1px solid rgba(22,15,8,0.05)' }}>
                    <select 
                      id="team-member-select"
                      onChange={e => { if(e.target.value) share(e.target.value); e.target.value = ''; }}
                      style={{ ...INP, flex:1, borderRadius:12, padding:'10px 14px', fontSize:14 }}
                      onFocus={fi} onBlur={fo}
                    >
                      <option value="">Select a team member…</option>
                      {users
                        .filter(u => u.id !== profile.id && !shares.some(s => s.shared_with === u.id))
                        .map(u => (
                          <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                        ))
                      }
                    </select>
                    {users.filter(u => u.id !== profile.id && !shares.some(s => s.shared_with === u.id)).length === 0 && (
                      <div style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.05em',color:'rgba(22,15,8,0.25)',alignSelf:'center' }}>No other members to invite</div>
                    )}
                  </div>
                )}

                {/* Collaborator list */}
                <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                  {shares.length === 0 ? (
                    <div style={{ textAlign:'center',padding:'12px 0',fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:13,color:'rgba(22,15,8,0.3)' }}>No collaborators added yet.</div>
                  ) : (
                    shares.map(sh => (
                      <div key={sh.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--cream-deep)',borderRadius:14 }}>
                        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                          <div style={{ width:28,height:28,borderRadius:'50%',background:'var(--espresso)',color:'var(--cream)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:12 }}>
                            {sh.user?.full_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:'var(--espresso)' }}>{sh.user?.full_name || 'Unnamed'}</div>
                            <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:10,color:'rgba(22,15,8,0.4)' }}>{sh.user?.email}</div>
                          </div>
                        </div>
                        {isEditing && (
                          <button onClick={() => revoke(sh.id)} 
                            style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(214,59,31,0.4)',fontSize:10,fontFamily:"'Syne',sans-serif",fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',padding:4,transition:'color 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--terracotta)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(214,59,31,0.4)'}>
                            Revoke
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              {!isEditing && <p style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(22,15,8,0.25)',textAlign:'center',paddingTop:4 }}>Read-only — click "Edit Survey" to make changes.</p>}
            </div>
          )}
        </div>{/* end left */}

        {/* RIGHT — Sticky Sidebar */}
        <div className="se-sidebar" style={{ position:'sticky',top:88,display:'flex',flexDirection:'column',gap:16 }}>

          {/* Dark Survey Card */}
          <div style={{ background:'var(--espresso)',borderRadius:24,overflow:'hidden',boxShadow:'0 16px 56px rgba(22,15,8,0.25)',position:'relative' }}>
            <div style={{ position:'absolute',top:-40,right:-40,width:160,height:160,borderRadius:'50%',background:`radial-gradient(circle,${tc}30,transparent 70%)`,pointerEvents:'none' }}/>
            <div style={{ height:4,background:`linear-gradient(90deg,${tc},${tc}55)` }}/>
            <div style={{ padding:'20px 22px 24px',position:'relative',zIndex:1 }}>
              <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:14 }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:tc,boxShadow:`0 0 10px ${tc}` }}/>
                <span style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(255,251,244,0.4)' }}>Survey overview</span>
              </div>
              <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:17,letterSpacing:'-0.5px',color:'var(--cream)',lineHeight:1.15,marginBottom:sv.description?8:0 }}>{sv.title}</div>
              {sv.description && <div style={{ fontFamily:"'Fraunces',serif",fontWeight:300,fontSize:12,color:'rgba(255,251,244,0.45)',lineHeight:1.6 }}>{sv.description}</div>}
              <div style={{ display:'flex',gap:0,marginTop:18,paddingTop:16,borderTop:'1px solid rgba(255,251,244,0.08)' }}>
                {[[`${qs.length}`,'questions'],[`${qs.filter(q=>q.is_required).length}`,'required']].map(([v,l]) => (
                  <div key={l} style={{ flex:1,textAlign:'center',borderRight:l!=='required'?'1px solid rgba(255,251,244,0.08)':'none' }}>
                    <div style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:22,letterSpacing:'-1px',color:tc,lineHeight:1 }}>{v}</div>
                    <div style={{ fontFamily:"'Syne',sans-serif",fontSize:8,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(255,251,244,0.3)',marginTop:5 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Health Score */}
          {isEditing && (
            <div style={{ background:'var(--warm-white)',borderRadius:22,border:'1.5px solid rgba(22,15,8,0.08)',padding:'20px 22px' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
                <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                  <span style={{ fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(22,15,8,0.3)' }}>Survey health</span>
                  <HelpTip text="Improve by adding a welcome message, setting an expiry, using varied question types, and keeping surveys under 15 questions." position="bottom"/>
                </div>
                <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                  <span style={{ fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:22,letterSpacing:'-1px',color:healthColor }}>{health}</span>
                  <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:9,color:healthColor,marginTop:2 }}>%</span>
                </div>
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:14 }}>
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
                    [sv.welcome_message,'Welcome message'],
                    [sv.expires_at,'Expiry date set'],
                    [qs.length<=15,'Under 15 questions'],
                    [qs.filter(q=>q.is_required).length<=3,'≤3 required questions'],
                    [!qs.every(q=>q.question_type==='short_text'),'Varied question types'],
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
          )}

          {/* Actions */}
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            <button onClick={openPreview} style={{ width:'100%',padding:'13px 0',borderRadius:16,border:'1.5px solid rgba(22,15,8,0.1)',background:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'rgba(22,15,8,0.45)',cursor:'pointer',transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:9 }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.25)';e.currentTarget.style.color='var(--espresso)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(22,15,8,0.1)';e.currentTarget.style.color='rgba(22,15,8,0.45)';}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
              Preview Survey
            </button>
            {isEditing && (
              <button onClick={save} disabled={busy}
                style={{ width:'100%',padding:'14px 0',borderRadius:16,border:'none',background:'var(--espresso)',color:'var(--cream)',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',cursor:busy?'not-allowed':'pointer',transition:'all 0.28s',boxShadow:'0 6px 28px rgba(22,15,8,0.2)',opacity:busy?0.5:1,display:'flex',alignItems:'center',justifyContent:'center',gap:9 }}
                onMouseEnter={e=>{if(!busy){e.currentTarget.style.background=tc;e.currentTarget.style.boxShadow=`0 10px 40px ${tc}45`;}}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--espresso)';e.currentTarget.style.boxShadow='0 6px 28px rgba(22,15,8,0.2)';}}>
                {busy?'Saving…':<>Save Changes <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>}
              </button>
            )}
          </div>
        </div>{/* end sidebar */}
      </div>
    </div>
  );
}
