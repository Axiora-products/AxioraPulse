import React, { useState } from 'react';

/**
 * ExtractedContentReview
 * ──────────────────────
 * Mandatory user-verification step for the Document / Screenshot / Link workflow.
 * Shows every extracted context source with its confidence score, surfaces a
 * low-confidence warning, and lets the user EDIT or REMOVE the extracted content
 * before it is sent to the AI for survey generation.
 *
 * Props:
 *   items: [{ id, type: 'file'|'audio'|'link', filename, extractedText,
 *             confidence?, ocrQuality?, warnings?, needsReview? }]
 *   onEdit(id, type, text)
 *   onRemove(id, type)
 */

const ICON = { file: '📄', audio: '🎙️', link: '🔗' };

function confidenceColor(c) {
  if (c == null) return '#9a8f80';
  if (c >= 85) return '#1e9e63';   // high — green
  if (c >= 70) return '#caa53d';   // medium — amber
  return '#d63b1f';                // low — terracotta
}

function confidenceLabel(c) {
  if (c == null) return 'Unknown';
  if (c >= 85) return 'High';
  if (c >= 70) return 'Medium';
  return 'Low';
}

export default function ExtractedContentReview({ items = [], onEdit, onRemove }) {
  const [openId, setOpenId] = useState(null);
  if (!items.length) return null;

  return (
    <div style={{ padding: '4px 16px 10px' }}>
      <div style={{
        fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)',
        marginBottom: 8,
      }}>
        Extracted context — review before generating
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => {
          const open = openId === it.id;
          const c = it.confidence;
          return (
            <div key={it.id} style={{
              border: '1px solid rgba(22,15,8,0.1)', borderRadius: 12,
              background: 'var(--warm-white, #FFFBF4)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                <span>{ICON[it.type] || '📄'}</span>
                <span title={it.filename} style={{
                  flex: 1, minWidth: 0, fontFamily: "'Syne', sans-serif", fontSize: 11,
                  fontWeight: 700, color: 'var(--espresso, #160F08)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {it.filename}
                </span>

                {c != null && (
                  <span style={{
                    fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.04em', color: '#fff', background: confidenceColor(c),
                    borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap',
                  }}>
                    {confidenceLabel(c)} · {c}%{it.ocrQuality ? ` · OCR ${it.ocrQuality}` : ''}
                  </span>
                )}

                <button type="button" onClick={() => setOpenId(open ? null : it.id)} style={{
                  background: 'none', border: '1px solid rgba(22,15,8,0.15)', borderRadius: 8,
                  cursor: 'pointer', fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700,
                  padding: '4px 8px', color: 'var(--espresso, #160F08)',
                }}>
                  {open ? 'Done' : 'Edit'}
                </button>
                <button type="button" onClick={() => onRemove?.(it.id, it.type)} title="Remove" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(22,15,8,0.35)', fontSize: 13, lineHeight: 1, padding: 0,
                }}>✕</button>
              </div>

              {(it.needsReview || (it.warnings && it.warnings.length > 0)) && (
                <div style={{
                  padding: '0 12px 8px', fontFamily: "'Fraunces', serif", fontSize: 12,
                  color: '#b3471f', lineHeight: 1.5,
                }}>
                  ⚠ {it.warnings && it.warnings.length
                    ? it.warnings.join(' ')
                    : 'Some content may not have been extracted accurately. Please review and edit before continuing.'}
                </div>
              )}

              {open && (
                <div style={{ padding: '0 12px 12px' }}>
                  <textarea
                    value={it.extractedText || ''}
                    onChange={(e) => onEdit?.(it.id, it.type, e.target.value)}
                    placeholder="Extracted content — edit or correct it here…"
                    rows={8}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      borderRadius: 10, border: '1px solid rgba(22,15,8,0.15)',
                      padding: '10px 12px', fontFamily: "'Fraunces', serif", fontSize: 13,
                      lineHeight: 1.6, color: 'var(--espresso, #160F08)', background: '#fff',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
