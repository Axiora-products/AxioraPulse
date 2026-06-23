import React, { useMemo } from 'react';
import { Country, State, City } from 'country-state-city';

/**
 * Cascading Country → State → City/District selector backed by `country-state-city`.
 *
 * The value is held as human-readable NAMES (what the backend stores); ISO codes
 * are resolved internally to drive the cascade. Each select only enables once its
 * parent is chosen. When the dataset has no cities for a selected state, the city
 * field gracefully falls back to free text so the respondent is never blocked.
 *
 * Props:
 *  - value:    { country?, state?, city? }   (names)
 *  - onChange: (next) => void                (full updated value object)
 *  - show:     subset of ['country','state','city'] (default all three)
 *  - labels:   { country, state, city }      label overrides
 *  - required: marks Country required
 *  - disabled
 *  - selectStyle / labelStyle / wrapStyle: style overrides to match the host UI
 */
export default function LocationSelect({
  value = {},
  onChange,
  show = ['country', 'state', 'city'],
  labels = {},
  required = false,
  disabled = false,
  selectStyle,
  labelStyle,
  wrapStyle,
}) {
  const countries = useMemo(() => Country.getAllCountries(), []);
  const countryObj = useMemo(() => countries.find((c) => c.name === value.country) || null, [countries, value.country]);
  const states = useMemo(() => (countryObj ? State.getStatesOfCountry(countryObj.isoCode) : []), [countryObj]);
  const stateObj = useMemo(() => states.find((s) => s.name === value.state) || null, [states, value.state]);
  const cities = useMemo(
    () => (countryObj && stateObj ? City.getCitiesOfState(countryObj.isoCode, stateObj.isoCode) : []),
    [countryObj, stateObj],
  );

  const emit = (patch) => onChange?.({ ...value, ...patch });

  const L = { country: 'Country', state: 'State / Region', city: 'City / District', ...labels };

  const lblStyle = labelStyle || {
    fontFamily: "'Syne', sans-serif",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(22,15,8,0.5)',
    display: 'block',
    marginBottom: 8,
  };
  const fieldStyle = selectStyle || {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1.5px solid rgba(22,15,8,0.12)',
    background: '#fff',
    fontFamily: "'Fraunces', serif",
    fontSize: 15,
    color: 'var(--espresso, #160F08)',
    outline: 'none',
  };
  const wrap = wrapStyle || { marginBottom: 14 };

  const renderSelect = (key, options, val, enabled, onSel, disabledHint) => (
    <div style={wrap}>
      <label style={lblStyle}>
        {L[key]}
        {required && key === 'country' ? ' *' : ''}
      </label>
      <select
        value={val || ''}
        disabled={disabled || !enabled}
        required={required && key === 'country'}
        onChange={onSel}
        style={{ ...fieldStyle, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.55 }}
      >
        <option value="">{enabled ? `Select ${L[key].toLowerCase()}` : disabledHint}</option>
        {options.map((o, i) => (
          <option key={`${o.isoCode || o.name}-${i}`} value={o.name}>
            {o.flag ? `${o.flag} ` : ''}
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      {show.includes('country') &&
        renderSelect('country', countries, value.country, true, (e) =>
          emit({ country: e.target.value, state: '', city: '' }),
        )}

      {show.includes('state') &&
        renderSelect(
          'state',
          states,
          value.state,
          !!countryObj,
          (e) => emit({ state: e.target.value, city: '' }),
          'Select a country first',
        )}

      {show.includes('city') &&
        // Cascade to a select when the dataset has cities; otherwise allow free text
        // so respondents in sparsely-mapped regions are never blocked.
        (!stateObj || cities.length > 0
          ? renderSelect('city', cities, value.city, !!stateObj, (e) => emit({ city: e.target.value }), 'Select a state first')
          : (
            <div style={wrap}>
              <label style={lblStyle}>{L.city}</label>
              <input
                type="text"
                value={value.city || ''}
                disabled={disabled}
                placeholder="Enter city / district"
                onChange={(e) => emit({ city: e.target.value })}
                style={fieldStyle}
              />
            </div>
          ))}
    </>
  );
}
