import { useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';

/**
 * RankingInput — drag-to-rank with tactile physics.
 * Fixes: safe option parsing, Reorder.Item visual state via useDragControls pattern.
 */
export default function RankingInput({ q, val, set, tc }) {
  // Safe parse options from DB (may be JSON string or object)
  const rawOpts = (() => {
    try {
      if (!q.options) return [];
      if (typeof q.options === 'string') return JSON.parse(q.options);
      return Array.isArray(q.options) ? q.options : [];
    } catch { return []; }
  })();

  const opts = rawOpts.filter(o => o && (o.value !== undefined));

  // Initialise order from saved val or default to question order
  const initItems = () => {
    if (Array.isArray(val) && val.length === opts.length && val.every(v => opts.some(o => o.value === v))) {
      return val;
    }
    return opts.map(o => o.value);
  };

  const [items, setItems] = useState(initItems);

  function reorder(newOrder) {
    setItems(newOrder);
    set(newOrder);
  }

  const getLabel = v => opts.find(o => o.value === v)?.label ?? v;

  if (opts.length === 0) {
    return (
      <div style={{ padding: '24px 0', color: 'rgba(22,15,8,0.3)', fontFamily: 'Fraunces, serif', fontSize: 15 }}>
        No options configured for this ranking question.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 540 }}>
      {/* Instruction */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderRadius: 999,
        background: `${tc}10`, marginBottom: 24,
        border: `1px solid ${tc}20`,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <line x1="9" y1="22" x2="9" y2="12"/>
          <line x1="15" y1="22" x2="15" y2="12"/>
        </svg>
        <span style={{
          fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: tc,
        }}>Drag to rank · 1 is highest</span>
      </div>

      <Reorder.Group
        axis="y"
        values={items}
        onReorder={reorder}
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {items.map((v, i) => (
          <RankItem
            key={v}
            value={v}
            rank={i + 1}
            label={getLabel(v)}
            isTop={i === 0}
            tc={tc}
            total={items.length}
          />
        ))}
      </Reorder.Group>

      {/* Top pick summary */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 20,
              padding: '10px 16px',
              background: `${tc}08`,
              border: `1px solid ${tc}18`,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
            <span style={{ display: 'flex', alignItems: 'center', color: tc }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H3V4h3M18 9h3V4h-3"/><path d="M6 4h12v7a6 6 0 0 1-12 0V4z"/><path d="M12 17v4M8 21h8"/></svg>
            </span>
            <span style={{
              fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(22,15,8,0.4)',
            }}>
              Top pick: <span style={{ color: tc }}>{getLabel(items[0])}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RankItem({ value, rank, label, isTop, tc, total }) {
  return (
    <Reorder.Item
      value={value}
      whileDrag={{
        scale: 1.03,
        rotate: 1.5,
        zIndex: 50,
        cursor: 'grabbing',
      }}
      transition={{ duration: 0.15 }}
      style={{ cursor: 'grab', listStyle: 'none' }}
    >
      <motion.div
        layout
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          background: isTop ? `${tc}06` : 'rgba(255,255,255,0.7)',
          border: `1.5px solid ${isTop ? tc + '30' : 'rgba(22,15,8,0.08)'}`,
          borderRadius: 16,
          backdropFilter: 'blur(4px)',
          transition: 'border-color 0.2s, background 0.2s',
          userSelect: 'none',
        }}
      >
        {/* Rank badge */}
        <motion.div
          layout
          animate={{
            background: isTop ? tc : 'rgba(22,15,8,0.06)',
            boxShadow: isTop ? `0 4px 16px ${tc}40` : 'none',
          }}
          transition={{ duration: 0.3 }}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11,
            color: isTop ? '#fff' : 'rgba(22,15,8,0.35)',
            transition: 'color 0.3s',
          }}>
            {rank}
          </span>
        </motion.div>

        {/* Label */}
        <span style={{
          fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16,
          color: 'var(--espresso, #160F08)', flex: 1, lineHeight: 1.4,
        }}>
          {label}
        </span>

        {/* Drag handle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, opacity: 0.2 }}>
          {[0, 1, 2].map(n => (
            <div key={n} style={{ width: 20, height: 2, borderRadius: 2, background: '#160F08' }} />
          ))}
        </div>
      </motion.div>
    </Reorder.Item>
  );
}
