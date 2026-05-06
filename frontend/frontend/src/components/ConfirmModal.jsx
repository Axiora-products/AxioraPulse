import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ConfirmModal — on-brand replacement for window.confirm / window.prompt / window.alert
 *
 * Usage (confirm):
 *   <ConfirmModal
 *     open={open} onClose={() => setOpen(false)}
 *     title="Delete survey?" body="This will permanently delete all responses."
 *     confirmLabel="Delete" danger
 *     onConfirm={() => doDelete()}
 *   />
 *
 * Usage (prompt — with input):
 *   <ConfirmModal ... prompt={{ label: 'Days to extend', defaultValue: '7', type: 'number' }}
 *     onConfirm={(value) => extendBy(value)}
 *   />
 *
 * Usage (alert — info only):
 *   <ConfirmModal ... alert onConfirm={() => {}} confirmLabel="OK" />
 */
export default function ConfirmModal({
  open, onClose,
  title, body,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = false,
  alert        = false,   // info-only, no cancel button
  prompt       = null,    // { label, defaultValue, type }
  onConfirm,
}) {
  const [inputVal, setInputVal] = useState(prompt?.defaultValue ?? '');
  const inputRef = useRef(null);

  // Reset input when modal opens
  useEffect(() => {
    if (open) {
      setInputVal(prompt?.defaultValue ?? '');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  function handleConfirm() {
    if (prompt && !inputVal.toString().trim()) return;
    onConfirm?.(prompt ? inputVal : undefined);
    onClose();
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onClose();
  }

  const confirmBg = danger ? 'var(--terracotta)' : 'var(--espresso)';
  const confirmHover = danger ? 'var(--coral)' : 'var(--coral)';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onKeyDown={handleKey}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(22,15,8,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="modal-card"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background: 'var(--warm-white)',
              borderRadius: 24,
              padding: '36px 36px 28px',
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 32px 80px rgba(22,15,8,0.25)',
              border: '1px solid rgba(22,15,8,0.06)',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: danger ? 'rgba(214,59,31,0.1)' : 'rgba(22,15,8,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 20,
            }}>
              {danger ? '⚠️' : alert ? 'ℹ️' : '❓'}
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily: 'Playfair Display, serif',
              fontWeight: 700, fontSize: 22,
              letterSpacing: '-0.5px',
              color: 'var(--espresso)',
              margin: '0 0 10px',
            }}>
              {title}
            </h2>

            {/* Body */}
            {body && (
              <p style={{
                fontFamily: 'Fraunces, serif',
                fontWeight: 300, fontSize: 15,
                color: 'rgba(22,15,8,0.55)',
                lineHeight: 1.65,
                margin: '0 0 20px',
              }}>
                {body}
              </p>
            )}

            {/* Optional prompt input */}
            {prompt && (
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'Syne, sans-serif',
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(22,15,8,0.45)',
                  marginBottom: 8,
                }}>
                  {prompt.label}
                </label>
                <input
                  ref={inputRef}
                  type={prompt.type || 'text'}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  min={prompt.min}
                  max={prompt.max}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 16px',
                    background: 'var(--cream)',
                    border: '1.5px solid rgba(22,15,8,0.12)',
                    borderRadius: 12,
                    fontFamily: 'Fraunces, serif',
                    fontSize: 15, color: 'var(--espresso)',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.12)'}
                />
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              {!alert && (
                <button
                  onClick={onClose}
                  style={{
                    padding: '11px 22px',
                    borderRadius: 999,
                    border: 'none',
                    background: 'var(--cream-deep)',
                    color: 'rgba(22,15,8,0.55)',
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 700, fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,15,8,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--cream-deep)'}
                >
                  {cancelLabel}
                </button>
              )}
              <button
                onClick={handleConfirm}
                style={{
                  padding: '11px 24px',
                  borderRadius: 999,
                  border: 'none',
                  background: confirmBg,
                  color: '#fff',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700, fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = confirmHover}
                onMouseLeave={e => e.currentTarget.style.background = confirmBg}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
