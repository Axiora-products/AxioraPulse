import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ConditionalLogicEditor
 * Renders inside each question card in SurveyCreate/SurveyEdit.
 * Lets creators add a "Show this question only if…" rule.
 *
 * Props:
 *   question     — current question object
 *   allQuestions — full array of questions (for source selection)
 *   onChange     — fn(conditional_logic) — call with new logic or null to clear
 *
 * Saves into question.conditional_logic:
 *   { show_if: { question_id, operator, value } }
 */

const OPERATORS = {
  short_text:      [{ v: 'contains', l: 'contains' }, { v: 'not_contains', l: 'does not contain' }, { v: 'equals', l: 'equals' }],
  long_text:       [{ v: 'contains', l: 'contains' }, { v: 'not_contains', l: 'does not contain' }],
  single_choice:   [{ v: 'equals', l: 'is' }, { v: 'not_equals', l: 'is not' }],
  multiple_choice: [{ v: 'includes', l: 'includes' }, { v: 'not_includes', l: 'does not include' }],
  dropdown:        [{ v: 'equals', l: 'is' }, { v: 'not_equals', l: 'is not' }],
  yes_no:          [{ v: 'equals', l: 'is' }],
  rating:          [{ v: 'equals', l: 'equals' }, { v: 'gte', l: 'is ≥' }, { v: 'lte', l: 'is ≤' }],
  scale:           [{ v: 'equals', l: 'equals' }, { v: 'gte', l: 'is ≥' }, { v: 'lte', l: 'is ≤' }],
  number:          [{ v: 'equals', l: 'equals' }, { v: 'gte', l: 'is ≥' }, { v: 'lte', l: 'is ≤' }],
  email:           [{ v: 'contains', l: 'contains' }],
  date:            [{ v: 'equals', l: 'equals' }, { v: 'gte', l: 'is after' }, { v: 'lte', l: 'is before' }],
  ranking:         [{ v: 'first_is', l: 'top ranked is' }],
  slider:          [{ v: 'equals', l: 'equals' }, { v: 'gte', l: 'is ≥' }, { v: 'lte', l: 'is ≤' }],
};

const inp = {
  padding: '10px 14px', background: 'var(--cream)', border: '1px solid rgba(22,15,8,0.1)',
  borderRadius: 10, fontFamily: 'Fraunces, serif', fontSize: 14, color: 'var(--espresso)',
  outline: 'none', transition: 'border-color 0.2s',
};
const focusIn  = e => e.target.style.borderColor = 'var(--coral)';
const focusOut = e => e.target.style.borderColor = 'rgba(22,15,8,0.1)';

export default function ConditionalLogicEditor({ question, allQuestions, onChange }) {
  const existing = question.conditional_logic?.show_if || null;
  const [enabled, setEnabled]     = useState(!!existing);
  const [sourceId, setSourceId]   = useState(existing?.question_id || '');
  const [operator, setOperator]   = useState(existing?.operator || 'equals');
  const [value, setValue]         = useState(existing?.value || '');

  // Only prior questions can be sources (can't depend on later ones)
  const myIndex  = allQuestions.findIndex(q => q._id === question._id || q.id === question.id);
  const eligible = allQuestions.slice(0, myIndex).filter(q =>
    !['file_upload'].includes(q.question_type)
  );

  const sourceQ  = eligible.find(q => (q._id || q.id) === sourceId);
  const ops      = OPERATORS[sourceQ?.question_type] || [{ v: 'equals', l: 'equals' }];

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!next) { setSourceId(''); setOperator('equals'); setValue(''); onChange(null); }
  }

  function commit(sid, op, val) {
    if (!sid) return onChange(null);
    onChange({ show_if: { question_id: sid, operator: op, value: val } });
  }

  function onSource(v) { setSourceId(v); setOperator('equals'); setValue(''); commit(v, 'equals', ''); }
  function onOp(v)     { setOperator(v); commit(sourceId, v, value); }
  function onVal(v)    { setValue(v); commit(sourceId, operator, v); }

  // Render value input depending on source type
  function ValueInput() {
    if (!sourceQ) return null;
    const t = sourceQ.question_type;

    if (['single_choice', 'multiple_choice', 'dropdown'].includes(t)) {
      return (
        <select value={value} onChange={e => onVal(e.target.value)}
          style={{ ...inp, appearance: 'none', paddingRight: 28, flex: 1 }}
          onFocus={focusIn} onBlur={focusOut}>
          <option value="">Pick a value…</option>
          {(sourceQ.options || []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (t === 'yes_no') {
      return (
        <select value={value} onChange={e => onVal(e.target.value)}
          style={{ ...inp, flex: 1 }} onFocus={focusIn} onBlur={focusOut}>
          <option value="">Pick…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    }
    if (['rating', 'scale', 'number', 'slider'].includes(t)) {
      return (
        <input type="number" value={value} onChange={e => onVal(e.target.value)}
          placeholder={t === 'rating' ? '1–5' : t === 'scale' ? '1–10' : 'Value'}
          style={{ ...inp, flex: 1, width: 80 }} onFocus={focusIn} onBlur={focusOut} />
      );
    }
    return (
      <input type="text" value={value} onChange={e => onVal(e.target.value)}
        placeholder="Enter value…"
        style={{ ...inp, flex: 1 }} onFocus={focusIn} onBlur={focusOut} />
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Toggle switch */}
        <div
          onClick={toggle}
          style={{
            width: 36, height: 20, borderRadius: 999, cursor: 'pointer',
            background: enabled ? 'var(--coral)' : 'rgba(22,15,8,0.12)',
            position: 'relative', transition: 'background 0.25s', flexShrink: 0,
          }}>
          <div style={{
            position: 'absolute', width: 14, height: 14, borderRadius: '50%',
            background: '#fff', top: 3, left: enabled ? 19 : 3,
            transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(22,15,8,0.2)',
          }} />
        </div>
        <span style={{
          fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: enabled ? 'var(--coral)' : 'rgba(22,15,8,0.3)',
          transition: 'color 0.2s',
        }}>
          Conditional logic
        </span>
      </div>

      {/* Logic builder */}
      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              marginTop: 14, padding: '16px 18px',
              background: 'rgba(255,69,0,0.03)',
              border: '1px solid rgba(255,69,0,0.12)',
              borderRadius: 14,
            }}>
              <div style={{
                fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'rgba(22,15,8,0.35)', marginBottom: 12,
              }}>
                Show this question only if…
              </div>

              {eligible.length === 0 ? (
                <p style={{
                  fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13,
                  color: 'rgba(22,15,8,0.4)', margin: 0,
                }}>
                  No earlier questions to base a condition on yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {/* Source question select */}
                  <select value={sourceId} onChange={e => onSource(e.target.value)}
                    style={{ ...inp, flex: '1 1 160px', minWidth: 140 }}
                    onFocus={focusIn} onBlur={focusOut}>
                    <option value="">Question…</option>
                    {eligible.map((q, i) => (
                      <option key={q._id || q.id} value={q._id || q.id}>
                        Q{i + 1}: {q.question_text.slice(0, 40)}{q.question_text.length > 40 ? '…' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  {sourceId && (
                    <select value={operator} onChange={e => onOp(e.target.value)}
                      style={{ ...inp, flex: '0 1 120px' }}
                      onFocus={focusIn} onBlur={focusOut}>
                      {ops.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  )}

                  {/* Value */}
                  {sourceId && <ValueInput />}
                </div>
              )}

              {/* Preview text */}
              {sourceId && value && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 12, padding: '8px 12px',
                    background: 'var(--cream-deep)', borderRadius: 8,
                    fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 12,
                    color: 'rgba(22,15,8,0.5)', lineHeight: 1.5,
                  }}>
                  ✓ This question will only appear when <strong style={{ fontWeight: 500 }}>
                    Q{eligible.findIndex(q => (q._id || q.id) === sourceId) + 1}
                  </strong> {ops.find(o => o.v === operator)?.l} <strong style={{ fontWeight: 500 }}>
                    "{sourceQ?.options?.find?.(o => o.value === value)?.label || value}"
                  </strong>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
