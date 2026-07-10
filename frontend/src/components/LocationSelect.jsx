import React, { useMemo } from 'react';
import { Country, State, City } from 'country-state-city';
import SearchableSelect from './SearchableSelect';

/**
 * Cascading Country → State → City/District selector backed by `country-state-city`,
 * with each level a search-as-you-type combobox (see {@link SearchableSelect}).
 *
 * The value is held as human-readable NAMES (what the backend stores); ISO codes
 * are resolved internally to drive the cascade. Each field only enables once its
 * parent is chosen. Cities are loaded lazily per selected state (never the full
 * global set at once), and the combobox caps rendered matches, so large datasets
 * stay responsive. When the dataset has no cities for a selected state, the city
 * field gracefully falls back to free text so the respondent is never blocked.
 *
 * Props:
 *  - value:    { country?, state?, city? }   (names)
 *  - onChange: (next) => void                (full updated value object)
 *  - show:     subset of ['country','state','city'] (default all three)
 *  - labels:   { country, state, city }      label overrides
 *  - required: marks Country required
 *  - disabled
 *  - dark:     dark-surface menu palette (for dark backgrounds)
 *  - selectStyle / labelStyle / wrapStyle: style overrides to match the host UI
 */
export default function LocationSelect({
  value = {},
  onChange,
  show = ['country', 'state', 'city'],
  labels = {},
  required = false,
  disabled = false,
  dark = false,
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
  const wrap = wrapStyle || { marginBottom: 14 };

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.name, label: c.flag ? `${c.flag}  ${c.name}` : c.name })),
    [countries],
  );
  const stateOptions = useMemo(() => states.map((s) => ({ value: s.name, label: s.name })), [states]);
  const cityOptions = useMemo(() => cities.map((c) => ({ value: c.name, label: c.name })), [cities]);

  const field = (key, options, val, enabled, onSel, disabledHint) => (
    <div style={wrap}>
      <label style={lblStyle} id={`loc-${key}-label`}>
        {L[key]}
        {required && key === 'country' ? ' *' : ''}
      </label>
      <SearchableSelect
        ariaLabel={L[key]}
        dark={dark}
        options={options}
        value={val || ''}
        disabled={disabled || !enabled}
        required={required && key === 'country'}
        placeholder={enabled ? `Search ${L[key].toLowerCase()}…` : disabledHint}
        emptyText={`No ${L[key].toLowerCase()} found`}
        inputStyle={selectStyle}
        onChange={onSel}
      />
    </div>
  );

  return (
    <>
      {show.includes('country') &&
        field('country', countryOptions, value.country, true, (v) => emit({ country: v, state: '', city: '' }))}

      {show.includes('state') &&
        field('state', stateOptions, value.state, !!countryObj, (v) => emit({ state: v, city: '' }), 'Select a country first')}

      {show.includes('city') &&
        // Cascade to a combobox when the dataset has cities; otherwise allow free
        // text so respondents in sparsely-mapped regions are never blocked.
        (!stateObj || cities.length > 0
          ? field('city', cityOptions, value.city, !!stateObj, (v) => emit({ city: v }), 'Select a state first')
          : (
            <div style={wrap}>
              <label style={lblStyle}>{L.city}</label>
              <input
                type="text"
                value={value.city || ''}
                disabled={disabled}
                placeholder="Enter city / district"
                onChange={(e) => emit({ city: e.target.value })}
                style={
                  selectStyle || {
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
                  }
                }
              />
            </div>
          ))}
    </>
  );
}
