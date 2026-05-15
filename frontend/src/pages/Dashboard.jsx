import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import API from '../api/axios';
import useAuthStore from '../hooks/useAuth';
import { hasPermission, timeAgo, SURVEY_STATUS } from '../lib/constants';
import { useLoading } from '../context/LoadingContext';
import OnboardingChecklist from '../components/OnboardingChecklist';
import { checkMilestone } from '../components/MilestoneToast';
import DocumentLibraryPane from '../components/DocumentLibraryPane';

// ── Animated counter hook ─────────────────────────────────────────────────
function useCountUp(target, duration = 700) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (target === 0) { setDisplay(0); return; }
    let start = null;
    const from = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * ease));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return display;
}

function AnimatedStat({ val, label, accent }) {
  const display = useCountUp(val);
  return (
    <>
      <div style={S.statNum} className="count-up">{display}</div>
      <div style={S.statLabel}>{label}</div>
    </>
  );
}

const S = {
  page: {},
  header: {},
  tag: { fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 12 },
  h1: { fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 'clamp(34px,4vw,52px)', letterSpacing: '-2px', color: 'var(--espresso)', lineHeight: 1.05, margin: 0 },
  statsGrid: {
  display: 'grid',

  gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))',

  gap: 28,

  marginBottom: 72,

  position: 'relative',
  zIndex: 1,

  maxWidth: '100%',
}, statCard: (accent) => ({ background: 'var(--warm-white)', borderRadius: 20, padding: '36px 30px 30px', border: '1px solid rgba(22,15,8,0.07)', borderTop: `3px solid ${accent}`, cursor: 'default' }),
  statNum: { fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 48, letterSpacing: '-3px', color: 'var(--espresso)', lineHeight: 1, marginBottom: 8 },
  statLabel: { fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, position: 'relative', zIndex: 1 },
  sectionTitle: { fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)' },
  viewAll: { fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--espresso)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, opacity: 0.55, transition: 'opacity 0.2s', },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 20, position: 'relative', zIndex: 1 },
  surveyCard: { background: 'var(--warm-white)', borderRadius: 20, padding: 24, border: '1px solid rgba(22,15,8,0.07)', textDecoration: 'none', display: 'flex', flexDirection: 'column', height: '100%', transition: 'all 0.3s ease' },
  cardTitle: { fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 18, color: 'var(--espresso)', marginBottom: 8, lineHeight: 1.3, transition: 'color 0.2s' },
  cardMeta: { fontFamily: "'Fraunces', serif", fontSize: 12, color: 'rgba(22,15,8,0.35)', fontWeight: 300 },
  cardFooter: { marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(22,15,8,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  emptyState: { background: 'var(--warm-white)', borderRadius: 24, border: '1px solid rgba(22,15,8,0.07)', textAlign: 'center', padding: '80px 40px', position: 'relative', zIndex: 1 },
  emptyTitle: { fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, color: 'var(--espresso)', marginBottom: 12, letterSpacing: '-0.5px' },
  emptyBody: { fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 16, color: 'rgba(22,15,8,0.45)', marginBottom: 32, lineHeight: 1.7 },
  cta: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '14px 28px', borderRadius: 999, textDecoration: 'none', transition: 'background 0.25s ease' },
};

const STAT_ACCENTS = ['var(--coral)', 'var(--espresso)', 'var(--saffron)', 'var(--coral)'];

export default function Dashboard() {
  const { profile, tenant } = useAuthStore();
  const { stopLoading } = useLoading();
  const [stats, setStats] = useState({ surveys: 0, responses: 0, completions: 0, team: 0 });
  const [recent, setRecent] = useState([]);
  const prevResponses = useRef(null);

  const location = useLocation();
  useEffect(() => { if (profile?.id) load(); else stopLoading(); }, [profile?.id, location.key]);

  useEffect(() => {
    const h = () => { if (profile?.id) load(); };
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  }, [profile?.id]);

  async function load() {
    try {
      const [statsRes, recentRes] = await Promise.all([
        API.get('/dashboard/stats'),
        API.get('/dashboard/recent'),
      ]);
      const s = statsRes.data;
      const completions = s.total_responses > 0
        ? Math.round((s.completion_rate / 100) * s.total_responses)
        : 0;
      setStats({
        surveys: s.total_surveys || 0,
        responses: s.total_responses || 0,
        completions,
        team: s.team_members || 0,
      });
      if (prevResponses.current !== null) {
        checkMilestone(prevResponses.current, s.total_responses || 0);
      }
      prevResponses.current = s.total_responses || 0;
      setRecent(recentRes.data || []);
    } catch (e) { console.error(e); }
    finally { stopLoading(); }
  }

  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  const statItems = [
    { label: 'Total Surveys', val: stats.surveys },
    { label: 'Responses', val: stats.responses },
    { label: 'Completed', val: stats.completions },
    { label: 'Team Members', val: stats.team },
  ];

  return (
    <div className="db-layout">
      <div className="db-main">

        {/* Header */}
        <div style={S.header} className="np-page-header">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            {tenant?.name && <div style={S.tag}>{tenant.name}</div>}
            <h1 style={S.h1}>
              {greet}, <em style={{ fontStyle: 'italic', color: 'var(--coral)' }}>{firstName}</em>
            </h1>
          </motion.div>

          {/* {hasPermission(profile?.role, 'create_survey') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <Link to="/surveys/new" style={S.cta}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
                + New Survey
              </Link>
            </motion.div>
          )} */}
        </div>

        {/* Stat cards */}
        <div style={S.statsGrid} className="np-stats-grid">
          {statItems.map((item, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, boxShadow: '0 24px 60px rgba(22,15,8,0.1)' }}
              style={S.statCard(STAT_ACCENTS[i])}>
              <AnimatedStat val={item.val} label={item.label} accent={STAT_ACCENTS[i]} />
            </motion.div>
          ))}
        </div>
        {/* Onboarding */}
        <OnboardingChecklist surveyCount={stats.surveys} responseCount={stats.responses} teamCount={stats.team} />

        {/* Recent surveys */}
        <div style={S.sectionHead}>
          <div style={S.sectionTitle}>Recent Surveys</div>
          <Link to="/surveys" style={S.viewAll}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}>
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 72, color: 'rgba(22,15,8,0.06)', fontWeight: 900, marginBottom: 16, letterSpacing: -4 }}>Empty</div>
            <h3 style={S.emptyTitle}>No surveys yet</h3>
            <p style={S.emptyBody}>Your research journey starts here.<br />Create your first survey and see insights flow in.</p>
            {hasPermission(profile?.role, 'create_survey') && (
              <Link to="/surveys/new" style={S.cta}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
                Create first survey
              </Link>
            )}
          </div>
        ) : (
          <div style={S.grid}>
            {recent.map((sv, i) => {
              const isActive = sv.status === 'active';
              const isPromptDraft = !isActive && sv.question_count === 0;

              let targetPath = `/surveys/${sv.id}/edit`;
              let label = 'Edit';

              if (isActive) {
                targetPath = `/surveys/${sv.id}/analytics`;
                label = 'Analytics';
              } else if (isPromptDraft) {
                targetPath = `/surveys/new?draftId=${sv.id}`;
                label = 'Resume';
              }

              return (
                <motion.div key={sv.id}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  whileHover={{ y: -4, boxShadow: '0 24px 60px rgba(22,15,8,0.1)' }}>
                  <Link to={targetPath} style={S.surveyCard} className="survey-card-link">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: sv.theme_color || 'var(--coral)', boxShadow: `0 0 8px ${sv.theme_color || 'rgba(255,69,0,0.4)'}` }} />
                      <span className={`p-badge ${SURVEY_STATUS[sv.status]?.class || 'p-badge-draft'}`} style={{ fontFamily: "'Syne', sans-serif" }}>
                        {isPromptDraft ? 'Prompting' : (SURVEY_STATUS[sv.status]?.label || 'Draft')}
                      </span>
                    </div>
                    <div style={S.cardTitle}>{sv.title}</div>
                    <div style={S.cardMeta}>{timeAgo(sv.created_at)} · {sv.creator?.full_name || '—'}</div>
                    <div style={S.cardFooter}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)' }}>
                        {label}
                      </span>
                      <span style={{ color: 'rgba(22,15,8,0.25)', fontSize: 16 }}>→</span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <aside className="db-right-pane">
        <DocumentLibraryPane />
      </aside>

      <style>{`
        .db-layout {
          display: flex;
          min-height: calc(100vh - 100px);
          margin: -48px -48px -40px -48px;
        }
        .db-main {
          flex: 1;
          padding: 48px;
          overflow-y: auto;
        }
        .db-right-pane {
  width: 240px;

  position: sticky;
  top: 0;

  min-height: 100vh;

  flex-shrink: 0;

  background: var(--warm-white);

  border-left: 1px solid rgba(22,15,8,0.07);
}
        .survey-card-link:hover .card-title { color: var(--coral) !important; }

        @media (max-width: 1200px) {
          .db-layout { flex-direction: column; }
          .db-right-pane { width: 100%; position: static; height: auto; border-left: none; border-top: 1px solid rgba(22,15,8,0.07); }
        }
      `}</style>
    </div>
  );
}
