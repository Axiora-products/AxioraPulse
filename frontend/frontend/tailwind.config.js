/** @type {import('tailwindcss').Config} */

/**
 * Axiora Pulse — Design System Tokens
 * ─────────────────────────────────────
 * Colour philosophy: warm espresso darks, coral as the singular
 * energy colour, saffron as the secondary signal, cream as the
 * primary light surface. Never use generic greys or "dark" shorthands.
 *
 * Typography hierarchy:
 *   font-display  → Playfair Display  (headings, hero numbers)
 *   font-ui       → Syne              (labels, nav, buttons, caps)
 *   font-body     → Fraunces          (body copy, inputs, paragraphs)
 */

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Primary palette ──
        coral:           '#FF4500',   // Primary CTA, active states, accents
        'coral-bright':  '#FF6B35',   // Hover shimmer on coral
        terracotta:      '#D63B1F',   // Danger, destructive actions

        // ── Secondary palette ──
        saffron:         '#FFB800',   // Secondary accent, on-dark highlights
        'saffron-light': '#FFD166',   // Saffron hover / lighter tint

        // ── Surface palette ──
        cream:           '#FDF5E8',   // Primary light background
        'cream-deep':    '#F7EDD8',   // Slightly deeper cream, section alt
        'warm-white':    '#FFFBF4',   // Cards / elevated surfaces on cream
        blush:           '#FADDCA',   // Input borders, dividers on cream

        // ── Dark palette ──
        espresso:        '#160F08',   // Primary dark background / sidebar
        'espresso-mid':  '#2C1A0E',   // Elevated surfaces on espresso
        'espresso-light':'#3D2515',   // Borders, subtle dividers on espresso

        // ── Utility aliases (map page components → design tokens) ──
        dark:            '#160F08',   // alias → espresso
        accent:          '#FF4500',   // alias → coral
        soft:            '#FDF5E8',   // alias → cream (light bg)
        muted:           '#7A5C44',   // warm mid-tone for secondary text

        // ── Semantic palette ──
        sage:            '#1E7A4A',   // Success, promoters, positive signals
        cobalt:          '#0047FF',   // Info, links
        electric:        '#00D4FF',   // Highlight / electric accent
        lime:            '#C8F54A',   // Data viz only — use sparingly
      },

      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        ui:      ['Syne', 'system-ui', 'sans-serif'],
        body:    ['Fraunces', 'Georgia', 'serif'],
        // Override Tailwind's default `sans` so utility classes like
        // `font-sans` also resolve to Fraunces throughout the app.
        sans:    ['Fraunces', 'Georgia', 'serif'],
      },

      borderRadius: {
        // Tighter, more editorial radii — avoids the generic "rounded-xl" feel
        DEFAULT:  '8px',
        sm:       '6px',
        md:       '10px',
        lg:       '14px',
        xl:       '18px',
        '2xl':    '22px',
        '3xl':    '28px',
        '4xl':    '36px',
        full:     '9999px',
      },

      boxShadow: {
        // Named by intent, not by size — forces intentional usage
        card:        '0 8px 32px rgba(22, 15, 8, 0.08), 0 2px 6px rgba(22, 15, 8, 0.04)',
        warm:        '0 24px 80px rgba(22, 15, 8, 0.12), 0 4px 12px rgba(22, 15, 8, 0.06)',
        coral:       '0 24px 48px rgba(255, 69, 0, 0.35)',
        'coral-sm':  '0 8px 24px rgba(255, 69, 0, 0.2)',
        glow:        '0 0 60px rgba(255, 69, 0, 0.15)',
      },

      backgroundImage: {
        'coral-gradient':    'linear-gradient(135deg, #FF4500, #FF6B35)',
        'saffron-gradient':  'linear-gradient(135deg, #FFB800, #FFD166)',
        'espresso-gradient': 'linear-gradient(160deg, #160F08, #2C1A0E)',
        'energy-gradient':   'linear-gradient(90deg, #FF4500, #FFB800)',
      },

      letterSpacing: {
        // For Syne all-caps labels — tighter than Tailwind defaults
        'ui-xs': '0.1em',
        'ui-sm': '0.14em',
        'ui-md': '0.18em',
        'ui-lg': '0.22em',
      },
    },
  },
  plugins: [],
};
