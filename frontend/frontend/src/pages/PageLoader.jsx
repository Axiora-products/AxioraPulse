import { useEffect, useState } from "react";

/**
 * PageLoader — Full-page overlay spinner derived from the Axiora favicon.
 *
 * Usage:
 *   import PageLoader from "./PageLoader";
 *   {isLoading && <PageLoader />}
 *
 * Optional props:
 *   label    {string}  — text below the logo  (default: "Loading…")
 *   fadeOut  {bool}    — adds a fade-out class when unmounting (default: true)
 */
export default function PageLoader({ label = "Loading…", fadeOut = true }) {
  const [leaving, setLeaving] = useState(false);

  // If the parent removes the component, trigger fade-out first
  useEffect(() => {
    return () => {
      if (fadeOut) setLeaving(true);
    };
  }, [fadeOut]);

  return (
    <>
      <style>{`
        /* ── Overlay ───────────────────────────────────────────── */
        .pl-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          background: #160F08;
          animation: pl-fade-in 0.35s ease both;
        }
        .pl-overlay.pl-leaving {
          animation: pl-fade-out 0.4s ease both;
        }

        /* ── SVG canvas ─────────────────────────────────────────── */
        .pl-logo {
          position: relative;
          width: 80px;
          height: 80px;
        }

        /* ── Sonar rings ────────────────────────────────────────── */

        /* 
          Each ring starts at its "resting" radius and scale/opacity-pulse
          outward, mimicking an active radar ping.
          Stagger: ring1=0s, ring2=0.4s, ring3=0.8s
        */
        .pl-ring {
          transform-origin: 50% 50%;
          animation: pl-sonar 2.4s ease-out infinite;
        }
        .pl-ring-1 { animation-delay: 0s;   }
        .pl-ring-2 { animation-delay: 0.5s; }
        .pl-ring-3 { animation-delay: 1.0s; }

        @keyframes pl-sonar {
          0%   { transform: scale(0.5);  opacity: 0;    }
          10%  { opacity: 1; }
          80%  { transform: scale(1.7);  opacity: 0;    }
          100% { transform: scale(1.7);  opacity: 0;    }
        }

        /* ── Core dot: gentle breathing pulse ───────────────────── */
        .pl-dot-group {
          animation: pl-breathe 2.4s ease-in-out infinite;
          transform-origin: 40px 40px; /* center of 80×80 */
        }
        @keyframes pl-breathe {
          0%, 100% { transform: scale(1);    }
          50%       { transform: scale(1.12); }
        }

        /* ── Label ──────────────────────────────────────────────── */
        .pl-label {
          font-family: 'Syne', 'Helvetica Neue', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255, 100, 50, 0.55);
          animation: pl-label-pulse 2.4s ease-in-out infinite;
        }
        @keyframes pl-label-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1;    }
        }

        /* ── Mesh ambient glow behind everything ────────────────── */
        .pl-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            ellipse 260px 260px at 50% 50%,
            rgba(255, 69, 0, 0.07) 0%,
            transparent 70%
          );
        }

        /* ── Entrance / exit ────────────────────────────────────── */
        @keyframes pl-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pl-fade-out { from { opacity: 1 } to { opacity: 0 } }
      `}</style>

      <div className={`pl-overlay${leaving ? " pl-leaving" : ""}`}>
        {/* Ambient radial glow */}
        <div className="pl-glow" />

        {/* ── Favicon-derived SVG, scaled to 80 × 80 ── */}
        <div className="pl-logo">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 80 80"
            width="80"
            height="80"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="pl-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor="#1E120A" />
                <stop offset="100%" stopColor="#160F08" />
              </linearGradient>

              <radialGradient id="pl-dot-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#FF6B35" />
                <stop offset="60%"  stopColor="#FF4500" />
                <stop offset="100%" stopColor="#D63B1F" />
              </radialGradient>

              <radialGradient id="pl-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#FF4500" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#FF4500" stopOpacity="0"    />
              </radialGradient>

              <clipPath id="pl-rr">
                <rect width="80" height="80" rx="18" />
              </clipPath>
            </defs>

            <g clipPath="url(#pl-rr)">
              {/* Background */}
              <rect width="80" height="80" fill="url(#pl-bg)" />

              {/* Warm mesh */}
              <ellipse cx="55" cy="25" rx="40" ry="35"
                fill="#FF4500" fillOpacity="0.06" />

              {/* ── Sonar rings (animated) ── */}
              {/* Ring 3 — outermost */}
              <circle
                className="pl-ring pl-ring-3"
                cx="40" cy="40" r="27"
                fill="none"
                stroke="#FF4500"
                strokeWidth="1.4"
                strokeOpacity="0.35"
              />
              {/* Ring 2 */}
              <circle
                className="pl-ring pl-ring-2"
                cx="40" cy="40" r="20"
                fill="none"
                stroke="#FF4500"
                strokeWidth="1.6"
                strokeOpacity="0.5"
              />
              {/* Ring 1 — closest */}
              <circle
                className="pl-ring pl-ring-1"
                cx="40" cy="40" r="13.5"
                fill="none"
                stroke="#FF4500"
                strokeWidth="2"
                strokeOpacity="0.7"
              />

              {/* ── Core dot (breathing pulse) ── */}
              <g className="pl-dot-group">
                {/* Halo bloom */}
                <circle cx="40" cy="40" r="12" fill="url(#pl-halo)" />
                {/* Core */}
                <circle cx="40" cy="40" r="8" fill="url(#pl-dot-glow)" />
                {/* Specular highlight */}
                <circle cx="37.5" cy="37" r="2.2"
                  fill="white" fillOpacity="0.35" />
              </g>
            </g>
          </svg>
        </div>

        {/* Label */}
        {label && <span className="pl-label">{label}</span>}
      </div>
    </>
  );
}
