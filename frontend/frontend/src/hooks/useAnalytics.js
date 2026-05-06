import { useMemo } from 'react';

/**
 * useAnalytics
 * ─────────────────────────────────────────────────────────────────
 * Pure computation — no side effects, no fetching.
 * Pass in raw DB rows; get back every metric the dashboard needs.
 *
 * Inputs
 * ──────
 *  qs   — survey_questions rows (ordered by sort_order)
 *  rs   — survey_responses rows
 *  ans  — survey_answers rows (all answers for every response)
 *
 * Returns
 * ───────
 *  completionRate      number 0-100
 *  abandonRate         number 0-100
 *  avgTimeMin          string | null  e.g. "2.4"
 *  nps                 { score, label, breakdown: { promoters, passives, detractors, total } } | null
 *  dropOffFunnel       [{ questionId, questionText, reached, dropped, dropPct }]
 *  timingHeatmap       [{ questionId, questionText, avgSecs, label }]
 *  qualityBreakdown    { high, medium, low, unscored }  (counts)
 *  responseTrend       [{ date 'MMM D', completed, started }]  last 14 days
 *  deviceBreakdown     { desktop, mobile, tablet, unknown }  (counts)
 *  questionAnalytics   [{ question, data }]  — per-question answer stats
 */
export function useAnalytics(qs, rs, ans, trendDays = 14) {
  return useMemo(() => {
    if (!rs || !qs) return emptyResult();

    // ── Restrict all metrics to the selected time window ────────────────
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - trendDays);
    const rsW  = rs.filter(r => !r.started_at || new Date(r.started_at) >= cutoff);
    const wIds = new Set(rsW.map(r => r.id));
    const ansW = ans.filter(a => wIds.has(a.response_id));

    const total     = rsW.length;
    const completed = rsW.filter(r => r.status === 'completed');
    const abandoned = rsW.filter(r => r.status === 'abandoned');

    // ── Core rates ──────────────────────────────────────────────────────
    const completionRate = total ? Math.round((completed.length / total) * 100) : 0;
    const abandonRate    = total ? Math.round((abandoned.length / total) * 100) : 0;

    // ── Completion milestones (25 / 50 / 75 / 100 %) ────────────────────────
    // For each respondent, figure out what % of questions they answered,
    // then bucket them into milestone bands.
    const milestones = { pct25: 0, pct50: 0, pct75: 0, pct100: 0 };
    if (total > 0 && qs.length > 0) {
      rsW.forEach(r => {
        const answered = new Set(ansW.filter(a => a.response_id === r.id).map(a => a.question_id));
        const pct = answered.size / qs.length;
        if (pct >= 0.25) milestones.pct25++;
        if (pct >= 0.50) milestones.pct50++;
        if (pct >= 0.75) milestones.pct75++;
        if (r.status === 'completed' || pct >= 1) milestones.pct100++;
      });
    }

    // ── Average completion time ──────────────────────────────────────────
    const times = completed
      .filter(r => r.completed_at && r.started_at)
      .map(r => (new Date(r.completed_at) - new Date(r.started_at)) / 60000);
    const avgTimeMin = times.length
      ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)
      : null;

    // ── NPS (first scale/rating question with 1-10 range as proxy) ──────
    const npsQ = qs.find(q => q.question_type === 'scale');
    let nps = null;
    if (npsQ) {
      const scores = ansW
        .filter(a => a.question_id === npsQ.id && a.answer_value)
        .map(a => parseInt(a.answer_value))
        .filter(n => n >= 1 && n <= 10);

      if (scores.length) {
        const promoters   = scores.filter(s => s >= 9).length;
        const detractors  = scores.filter(s => s <= 6).length;
        const passives    = scores.length - promoters - detractors;
        const score       = Math.round(((promoters - detractors) / scores.length) * 100);
        const label       = score >= 50 ? 'Excellent' : score >= 20 ? 'Good' : score >= 0 ? 'Needs work' : 'Critical';
        nps = { score, label, breakdown: { promoters, passives, detractors, total: scores.length } };
      }
    }

    // ── Drop-off funnel ─────────────────────────────────────────────────
    // For each question: count how many responses have an answer at or beyond it
    const dropOffFunnel = qs.map((q, i) => {
      // "reached" = answered this question OR any question after it
      const qIdsFromHere = qs.slice(i).map(x => x.id);
      const responseIdsReached = new Set(
        ansW
          .filter(a => qIdsFromHere.includes(a.question_id))
          .map(a => a.response_id)
      );
      // "answered this specific question"
      const answeredThis = new Set(
        ansW.filter(a => a.question_id === q.id).map(a => a.response_id)
      );

      // reached = answered any Q at this index or later
      const reached = responseIdsReached.size;

      // dropped = reached this Q but didn't answer it (or didn't go further)
      const prevReached = i === 0 ? total : (() => {
        const prevIds = qs.slice(i - 1).map(x => x.id);
        return new Set(ansW.filter(a => prevIds.includes(a.question_id)).map(a => a.response_id)).size;
      })();

      const dropped   = Math.max(0, prevReached - reached);
      const dropPct   = prevReached > 0 ? Math.round((dropped / prevReached) * 100) : 0;

      return {
        questionId:   q.id,
        questionText: q.question_text,
        sortOrder:    i,
        reached,
        answered:     answeredThis.size,
        dropped,
        dropPct,
      };
    });

    // ── Timing heatmap (from metadata.time_per_question) ────────────────
    const timingMap = {};  // { qId: [seconds...] }
    rsW.forEach(r => {
      const tpq = r.metadata?.time_per_question;
      if (!tpq) return;
      Object.entries(tpq).forEach(([qId, secs]) => {
        if (!timingMap[qId]) timingMap[qId] = [];
        timingMap[qId].push(Number(secs) || 0);
      });
    });

    const timingHeatmap = qs.map(q => {
      const vals    = timingMap[q.id] || [];
      const avgSecs = vals.length
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 0;
      const label = avgSecs < 5  ? 'Fast'
                  : avgSecs < 15 ? 'Normal'
                  : avgSecs < 30 ? 'Slow'
                  : 'Very slow';
      return { questionId: q.id, questionText: q.question_text, avgSecs, label, responses: vals.length };
    });

    // ── Quality breakdown ────────────────────────────────────────────────
    const qualityBreakdown = { high: 0, medium: 0, low: 0, unscored: 0 };
    rsW.forEach(r => {
      const qs = r.metadata?.quality_score;
      if (qs == null) { qualityBreakdown.unscored++; return; }
      if (qs >= 70)       qualityBreakdown.high++;
      else if (qs >= 40)  qualityBreakdown.medium++;
      else                qualityBreakdown.low++;
    });

    // ── Response trend (configurable window) ─────────────────────────────
    const today   = new Date();
    const days    = Array.from({ length: trendDays }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (trendDays - 1 - i));
      return d.toISOString().slice(0, 10);
    });

    const trendMap = {};
    days.forEach(d => { trendMap[d] = { started: 0, completed: 0 }; });
    rsW.forEach(r => {
      const d = r.started_at?.slice(0, 10);
      if (trendMap[d]) {
        trendMap[d].started++;
        if (r.status === 'completed') trendMap[d].completed++;
      }
    });
    const responseTrend = days.map(d => ({
      date:      fmtDay(d),
      started:   trendMap[d].started,
      completed: trendMap[d].completed,
    }));

    // ── Device breakdown ─────────────────────────────────────────────────
    const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
    rsW.forEach(r => {
      const dev = r.metadata?.device || 'unknown';
      deviceBreakdown[dev] = (deviceBreakdown[dev] || 0) + 1;
    });

    // ── Per-question answer analytics ────────────────────────────────────
    const questionAnalytics = qs.map(q => ({
      question: q,
      data:     computeQuestionData(q, ansW),
    }));

    return {
      total,
      completedCount: completed.length,
      abandonedCount: abandoned.length,
      completionRate,
      abandonRate,
      milestones,
      avgTimeMin,
      nps,
      dropOffFunnel,
      timingHeatmap,
      qualityBreakdown,
      responseTrend,
      deviceBreakdown,
      questionAnalytics,
    };
  }, [qs, rs, ans, trendDays]);
}

// ─── Per-question data computation ──────────────────────────────────────────
function computeQuestionData(q, ans) {
  const qa = ans.filter(a => a.question_id === q.id);
  if (!qa.length) return null;

  // Choice types → doughnut
  if (['single_choice', 'dropdown', 'yes_no'].includes(q.question_type)) {
    const c = {};
    qa.forEach(a => { const v = a.answer_value || '—'; c[v] = (c[v] || 0) + 1; });
    const labels = Object.keys(c).map(k => (q.options || []).find(o => o.value === k)?.label || k);
    return { type: 'doughnut', labels, values: Object.values(c), total: qa.length };
  }

  // Multiple choice → bar
  if (q.question_type === 'multiple_choice') {
    const c = {};
    qa.forEach(a => (a.answer_json || []).forEach(v => { c[v] = (c[v] || 0) + 1; }));
    const labels = Object.keys(c).map(k => (q.options || []).find(o => o.value === k)?.label || k);
    return { type: 'bar', labels, values: Object.values(c), total: qa.length };
  }

  // Rating / Scale → bar + average
  if (['rating', 'scale'].includes(q.question_type)) {
    const vs  = qa.map(a => parseInt(a.answer_value) || 0).filter(Boolean);
    const avg = vs.length ? (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1) : 0;
    const mx  = q.question_type === 'rating' ? 5 : 10;
    const d   = {};
    for (let i = 1; i <= mx; i++) d[i] = 0;
    vs.forEach(v => { if (d[v] !== undefined) d[v]++; });
    return { type: 'bar', labels: Object.keys(d), values: Object.values(d), avg, total: vs.length };
  }

  // Ranking → ordered bar showing avg rank per option
  if (q.question_type === 'ranking') {
    const rankTotals = {};
    const rankCounts = {};
    qa.forEach(a => {
      const ordered = a.answer_json;
      if (!Array.isArray(ordered)) return;
      ordered.forEach((val, idx) => {
        rankTotals[val] = (rankTotals[val] || 0) + (idx + 1);
        rankCounts[val] = (rankCounts[val] || 0) + 1;
      });
    });
    const avgRanks = Object.keys(rankTotals)
      .map(v => ({
        label:   (q.options || []).find(o => o.value === v)?.label || v,
        avgRank: rankTotals[v] / rankCounts[v],
      }))
      .sort((a, b) => a.avgRank - b.avgRank); // sort best rank first

    return {
      type:   'ranking',
      labels: avgRanks.map(x => x.label),
      values: avgRanks.map(x => parseFloat(x.avgRank.toFixed(2))),
      total:  qa.length,
    };
  }

  // Slider → histogram + avg + min + max
  if (q.question_type === 'slider') {
    const vs  = qa.map(a => parseFloat(a.answer_value)).filter(n => !isNaN(n));
    if (!vs.length) return null;
    const avg = (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1);
    const min = Math.min(...vs);
    const max = Math.max(...vs);

    // Build 10-bucket histogram
    const rule     = q.validation_rules || {};
    const qMin     = parseFloat(rule.min ?? 0);
    const qMax     = parseFloat(rule.max ?? 100);
    const buckets  = 10;
    const step     = (qMax - qMin) / buckets;
    const counts   = Array(buckets).fill(0);
    vs.forEach(v => {
      const i = Math.min(Math.floor((v - qMin) / step), buckets - 1);
      counts[i]++;
    });
    const labels = counts.map((_, i) =>
      `${Math.round(qMin + i * step)}–${Math.round(qMin + (i + 1) * step)}`
    );

    return { type: 'slider', labels, values: counts, avg, min, max, total: vs.length };
  }

  // Matrix → per-row breakdown, each column = a count
  if (q.question_type === 'matrix') {
    const opts   = q.options || {};
    const rows   = opts.rows    || [];
    const cols   = opts.columns || [];
    // matrix[rowVal][colVal] = count
    const matrix = {};
    rows.forEach(r => {
      matrix[r.value] = {};
      cols.forEach(c => { matrix[r.value][c.value] = 0; });
    });
    qa.forEach(a => {
      const val = a.answer_json;
      if (!val || typeof val !== 'object') return;
      Object.entries(val).forEach(([rVal, cVal]) => {
        if (matrix[rVal] && cVal && matrix[rVal][cVal] !== undefined) {
          matrix[rVal][cVal]++;
        }
      });
    });
    return { type: 'matrix', rows, cols, matrix, total: qa.length };
  }

  // Text types → list
  return {
    type:  'text',
    items: qa.map(a => a.answer_value).filter(Boolean),
    total: qa.length,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDay(iso) {
  const d    = new Date(iso + 'T00:00:00');
  const mo   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${mo} ${d.getDate()}`;
}

function emptyResult() {
  return {
    total: 0, completedCount: 0, abandonedCount: 0,
    completionRate: 0, abandonRate: 0,
    milestones: { pct25: 0, pct50: 0, pct75: 0, pct100: 0 },
    avgTimeMin: null, nps: null,
    dropOffFunnel: [], timingHeatmap: [],
    qualityBreakdown: { high: 0, medium: 0, low: 0, unscored: 0 },
    responseTrend: [], deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0, unknown: 0 },
    questionAnalytics: [],
  };
}
