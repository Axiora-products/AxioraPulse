import { motion } from 'framer-motion';

/**
 * MatrixInput — Row × Column selection grid.
 *
 * Safe parsing for q.options — handles:
 *   { rows: [...], columns: [...] }   ← structured (preferred)
 *   JSON string of the above
 *   flat array                         ← treated as columns, uses q.matrix_rows or defaults
 *   null / undefined                   ← shows empty state
 *
 * val  — { [rowValue]: columnValue }
 * set  — setter fn
 * tc   — theme color
 */
export default function MatrixInput({ q, val = {}, set, tc }) {
  // Safe parse options
  const parseOpts = () => {
    let opts = q.options;
    if (!opts) return { rows: [], cols: [] };
    try {
      if (typeof opts === 'string') opts = JSON.parse(opts);
    } catch { return { rows: [], cols: [] }; }

    if (Array.isArray(opts)) {
      // Legacy flat array → treat as columns
      const fallbackRows = Array.isArray(q.matrix_rows)
        ? q.matrix_rows
        : [{ label: 'Item 1', value: 'row_1' }, { label: 'Item 2', value: 'row_2' }];
      return { rows: fallbackRows, cols: opts };
    }

    return {
      rows: Array.isArray(opts.rows)    ? opts.rows    : [],
      cols: Array.isArray(opts.columns) ? opts.columns : [],
    };
  };

  const { rows, cols } = parseOpts();

  function toggle(rowVal, colVal) {
    // Clicking the same value again deselects it
    const next = { ...val };
    if (next[rowVal] === colVal) delete next[rowVal];
    else next[rowVal] = colVal;
    set(next);
  }

  const answered = Object.keys(val).length;
  const pct      = rows.length ? Math.round((answered / rows.length) * 100) : 0;

  if (rows.length === 0 || cols.length === 0) {
    return (
      <div style={{ padding: '24px 0', color: 'rgba(22,15,8,0.3)', fontFamily: 'Fraunces, serif', fontSize: 15 }}>
        No rows or columns configured for this matrix question.
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 2, borderRadius: 999, background: 'rgba(22,15,8,0.07)', overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%', background: tc, borderRadius: 999 }}
          />
        </div>
        <span style={{
          fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(22,15,8,0.3)', flexShrink: 0,
        }}>
          {answered} / {rows.length}
        </span>
      </div>

      {/* Scrollable grid */}
      <div style={{ overflowX: 'auto', marginLeft: -4, marginRight: -4, paddingBottom: 4 }}>
        <table style={{
          borderCollapse: 'separate',
          borderSpacing: '0',
          minWidth: cols.length > 3 ? 500 : 'auto',
          width: '100%',
        }}>
          {/* Column headers */}
          <thead>
            <tr>
              <th style={{ width: '38%', paddingBottom: 12 }} />
              {cols.map((col, ci) => (
                <th key={col.value ?? ci} style={{
                  paddingBottom: 12,
                  paddingLeft: 8, paddingRight: 8,
                  textAlign: 'center',
                  fontFamily: 'Syne, sans-serif',
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(22,15,8,0.38)',
                  whiteSpace: 'nowrap',
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Rows */}
          <tbody>
            {rows.map((row, ri) => {
              const selected = val[row.value];
              const isAnswered = selected !== undefined;
              return (
                <motion.tr
                  key={row.value ?? ri}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: ri * 0.05, duration: 0.3 }}
                >
                  {/* Row label */}
                  <td style={{
                    fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15,
                    color: isAnswered ? 'var(--espresso, #160F08)' : 'rgba(22,15,8,0.55)',
                    paddingRight: 20,
                    paddingTop: 6, paddingBottom: 6,
                    verticalAlign: 'middle',
                    transition: 'color 0.2s',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isAnswered && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          style={{ color: tc, fontSize: 11, lineHeight: 1 }}>✓</motion.span>
                      )}
                      {row.label}
                    </span>
                  </td>

                  {/* Column cells */}
                  {cols.map((col, ci) => {
                    const active = selected === col.value;
                    return (
                      <td key={col.value ?? ci} style={{
                        textAlign: 'center',
                        padding: '6px 8px',
                        verticalAlign: 'middle',
                      }}>
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.88 }}
                          onClick={() => toggle(row.value, col.value)}
                          style={{
                            width: 34, height: 34,
                            borderRadius: '50%',
                            border: `2px solid ${active ? tc : 'rgba(22,15,8,0.13)'}`,
                            background: active ? tc : 'transparent',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto',
                            transition: 'border-color 0.2s, background 0.2s',
                            boxShadow: active ? `0 4px 16px ${tc}35` : 'none',
                          }}
                          aria-label={`${row.label}: ${col.label}`}
                          aria-pressed={active}
                        >
                          {active && (
                            <motion.svg
                              initial={{ scale: 0, rotate: -20 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                              width="12" height="12" viewBox="0 0 24 24"
                              fill="none" stroke="white" strokeWidth="3"
                              strokeLinecap="round" strokeLinejoin="round"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </motion.svg>
                          )}
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

      {/* Completion message */}
      {answered === rows.length && rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 18, display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: tc,
          }}
        >
          <span>✓</span> All rows answered
        </motion.div>
      )}
      {answered > 0 && answered < rows.length && (
        <p style={{
          marginTop: 14, fontFamily: 'Fraunces, serif', fontWeight: 300,
          fontSize: 12, color: 'rgba(22,15,8,0.3)', fontStyle: 'italic',
        }}>
          {rows.length - answered} row{rows.length - answered !== 1 ? 's' : ''} remaining
        </p>
      )}
    </div>
  );
}
