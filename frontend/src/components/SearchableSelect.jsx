import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Accessible, search-as-you-type combobox (single select).
 *
 * Designed to blend into any host UI via style overrides, and to stay fast on
 * large option sets by only rendering the first `maxResults` matches for the
 * current query (lightweight virtualization-by-capping).
 *
 * Behaviour:
 *  - Type to filter options live; matches are substring, case-insensitive.
 *  - Full keyboard support: ↑/↓ to move, Enter to choose, Esc to close, Tab closes.
 *  - Closes on outside click / blur; selection is preserved across re-renders.
 *  - Optional clear (×) button. Works with mouse and touch.
 *
 * Options may be an array of strings or of { value, label } objects.
 *
 * Props:
 *  - value:        currently selected value (string)
 *  - onChange:     (value) => void
 *  - options:      Array<string | { value, label }>
 *  - placeholder:  input placeholder when nothing is selected
 *  - disabled, required, clearable, maxResults
 *  - emptyText:    shown when no option matches the query
 *  - ariaLabel:    accessible name for the combobox
 *  - dark:         use the dark-surface menu palette
 *  - inputStyle / wrapStyle / menuStyle: style overrides to match the host UI
 *  - id:           id for the input (label association)
 *  - onFocus / onBlur
 */
export default function SearchableSelect({
  value = '',
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  required = false,
  clearable = true,
  maxResults = 100,
  emptyText = 'No matches',
  ariaLabel,
  dark = false,
  inputStyle,
  wrapStyle,
  menuStyle,
  id,
  onFocus,
  onBlur,
}) {
  const reactId = useId();
  const inputId = id || `ss-${reactId}`;
  const listId = `${inputId}-listbox`;

  // Normalise options to { value, label }.
  const items = useMemo(
    () =>
      (options || []).map((o) =>
        typeof o === 'object' && o !== null ? { value: o.value, label: o.label ?? String(o.value) } : { value: o, label: String(o) },
      ),
    [options],
  );

  const selectedLabel = useMemo(() => items.find((i) => i.value === value)?.label ?? (value || ''), [items, value]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Placement so the menu never spills off-screen: flip above when there isn't
  // enough room below, and cap its height to the available space.
  const [place, setPlace] = useState({ up: false, maxH: 260 });
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const optionRefs = useRef([]);

  // When closed, the input mirrors the selected label; when open, the typed query.
  const display = open ? query : selectedLabel;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
    return base.slice(0, maxResults);
  }, [items, query, maxResults]);

  const overflow = useMemo(() => {
    const q = query.trim().toLowerCase();
    const total = q ? items.filter((i) => i.label.toLowerCase().includes(q)).length : items.length;
    return Math.max(0, total - filtered.length);
  }, [items, query, filtered.length]);

  // Close on outside click / touch.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) optionRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openMenu = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, filtered.findIndex((i) => i.value === value)));
    // Decide drop direction + max height from the space around the field.
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect && typeof window !== 'undefined') {
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const desired = 260;
      const up = below < Math.min(desired, 220) && above > below;
      const maxH = Math.max(140, Math.min(desired, (up ? above : below) - 16));
      setPlace({ up, maxH });
    }
    setOpen(true);
  };

  const choose = (item) => {
    if (!item) return;
    onChange?.(item.value);
    setOpen(false);
    setQuery('');
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange?.('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        choose(filtered[active]);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const baseInput = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 36px 12px 14px',
    borderRadius: 12,
    border: '1.5px solid rgba(22,15,8,0.12)',
    background: '#fff',
    fontFamily: "'Fraunces', serif",
    fontSize: 15,
    color: 'var(--espresso, #160F08)',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'text',
    opacity: disabled ? 0.55 : 1,
  };

  const menuBase = dark
    ? {
        background: '#211710',
        border: '1px solid rgba(237,232,223,0.12)',
        color: '#EDE8DF',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      }
    : {
        background: '#FFFBF4',
        border: '1px solid rgba(22,15,8,0.1)',
        color: 'var(--espresso, #160F08)',
        boxShadow: '0 18px 50px rgba(22,15,8,0.18)',
      };

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...wrapStyle }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${inputId}-opt-${active}` : undefined}
          aria-label={ariaLabel}
          aria-required={required}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={display}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onFocus={(e) => {
            openMenu();
            onFocus?.(e);
          }}
          onClick={openMenu}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          style={{ ...baseInput, ...inputStyle }}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clear}
            tabIndex={-1}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '50%',
              background: 'rgba(127,127,127,0.18)',
              color: 'inherit',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        ) : (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
              transition: 'transform 0.18s',
              pointerEvents: 'none',
              opacity: 0.5,
              fontSize: 11,
            }}
          >
            ▾
          </span>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 50,
            ...(place.up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
            left: 0,
            right: 0,
            margin: 0,
            padding: 6,
            listStyle: 'none',
            borderRadius: 14,
            maxHeight: place.maxH,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            ...menuBase,
            ...menuStyle,
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '10px 12px', fontFamily: "'Fraunces', serif", fontSize: 14, opacity: 0.6 }}>{emptyText}</li>
          ) : (
            filtered.map((item, i) => {
              const isActive = i === active;
              const isSelected = item.value === value;
              return (
                <li
                  key={`${item.value}-${i}`}
                  id={`${inputId}-opt-${i}`}
                  ref={(el) => (optionRefs.current[i] = el)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(item);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 9,
                    cursor: 'pointer',
                    fontFamily: "'Fraunces', serif",
                    fontSize: 15,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    background: isActive ? (dark ? 'rgba(255,90,0,0.22)' : 'rgba(255,69,0,0.1)') : 'transparent',
                    fontWeight: isSelected ? 700 : 400,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {isSelected ? <span aria-hidden style={{ color: '#FF5A00', fontSize: 12 }}>✓</span> : null}
                </li>
              );
            })
          )}
          {overflow > 0 && (
            <li
              aria-hidden
              style={{ padding: '8px 12px', fontFamily: "'Syne', sans-serif", fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.5 }}
            >
              +{overflow} more — keep typing to refine
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
