import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Compass,
  FileText,
  Gauge,
  Lightbulb,
  Lock,
  LogIn,
  Menu,
  MessageSquare,
  PieChart,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useLoading } from "../context/LoadingContext";

const CSS = `
:root {
  --pulse-orange: #FF4500;
  --pulse-orange-dark: #D63B1F;
  --pulse-saffron: #FFB800;
  --pulse-cream: #FDF5E8;
  --pulse-cream-deep: #F7EDD8;
  --pulse-blue: #0047FF;
  --pulse-ink: #160F08;
  --pulse-muted: rgba(22, 15, 8, .56);
  --pulse-line: rgba(22, 15, 8, .08);
  --pulse-soft: #FADDCA;
  --pulse-blue-soft: rgba(0, 71, 255, .08);
  --pulse-bg: #FDF5E8;
  --pulse-white: #FFFFFF;
}

.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp {
  min-height: 100vh;
  background: var(--pulse-bg);
  color: var(--pulse-ink);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-x: hidden;
}
.lp button, .lp input { font: inherit; }
.lp a { color: inherit; }
.lp-shell { width: min(1184px, calc(100% - 48px)); margin: 0 auto; }
.lp-heading {
  font-family: "Playfair Display", Georgia, serif;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.03;
  color: var(--pulse-ink);
}
.lp-section { padding: 56px 0; }
.lp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--pulse-orange-dark);
  font-family: "Syne", Inter, sans-serif;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;

  padding: 25px 0 20px 0; /* top right bottom left */
}
.lp-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 32px;
  margin-bottom: 32px;
}
.lp-section-title { max-width: 640px; margin: 10px 0 0; font-family: "Playfair Display", serif;
  font-size: clamp(40px, 4.8vw, 68px);
  font-weight: 900; }
.lp-section-copy { max-width: 440px; margin: 0; color: var(--pulse-muted); font-size: 16px; line-height: 1.65; }
.lp-hero-copy,
.lp-testimonial-quote,
.lp-review-card p { Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.lp-step p,
.lp-template p,
.lp-symbol p,
.lp-success-body p,
.lp-price-desc,
.lp-price-list li,
.lp-faq-a,
.lp-report-label,
.lp-report-value,
.lp-mini-stat span,
.lp-social-copy,
.lp-social-stat span,
.lp-section-copy,
.lp-footer p,
.lp-footer a,
.lp-footer-bottom { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.lp-icon { width: 20px; height: 20px; stroke-width: 2; }
.lp-icon-sm { width: 16px; height: 16px; stroke-width: 2.25; }

.lp-nav {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 1000;

  background:
    radial-gradient(circle at 75% 38%, rgba(255,69,0,.16), transparent 13%),
    linear-gradient(
      118deg,
      rgba(255,69,0,.16) 0%,
      rgba(255,184,0,.10) 34%,
      rgba(253,245,232,.96) 76%
    ),
    var(--pulse-bg);

  border-bottom: 1px solid rgba(22,15,8,.06);
}
.lp-nav-inner {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.lp-logo {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
.lp-brand-logo {
  display: inline-grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  align-items: end;
  line-height: 1;
}
.lp-logo-wrapper{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
}

.lp-logo{
  display:flex;
  align-items:flex-start;
  line-height:1;
}

.lp-logo-tagline{
  margin-top:4px;
  margin-left:1px;   /* align under Pulse */
  font-size:11px;
  font-weight:700;
  color:#FF4500;
  font-family:'Playfair Display', serif;
  white-space:nowrap;
  line-height:1.2;
}
.lp-brand-axiora {
  grid-column: 1 / 2;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .42em;
  color: rgba(7, 5, 3, .46);
  text-transform: uppercase;
  transform: translateY(3px);
}
.lp-brand-pulse {
  grid-column: 1 / 2;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: 0;
  color: var(--pulse-ink);
}
.lp-brand-dot {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
  position: relative;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--pulse-orange);
  box-shadow: 0 0 0 8px rgba(255, 69, 0, .12), 0 0 24px rgba(255, 69, 0, .28);
  transform: translateY(-13px);
}
.lp-brand-dot::before,
.lp-brand-dot::after {
  content: "";
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 1px solid rgba(255, 69, 0, .24);
}
.lp-brand-dot::after {
  inset: -15px;
  opacity: .45;
}
.lp-nav-links {
  display: flex;
  align-items: center;
  gap: 24px;
  font-family: "Syne", sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: var(--pulse-muted);
}
.lp-nav-links a { text-decoration: none; }
.lp-nav-links a:hover { color: var(--pulse-ink); }
.lp-nav-actions { display: flex; align-items: center; gap: 10px; }
.lp-mobile-menu { display: none; }

.lp-btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
}
.lp-btn:hover { transform: translateY(-1px); }
.lp-btn-primary {
  background: var(--pulse-orange);
  color: #fff;
  box-shadow: 0 12px 26px rgba(255, 149, 0, .24);
}
.lp-btn-primary:hover { background: var(--pulse-orange-dark); }
.lp-btn-secondary {
  background: var(--pulse-white);
  color: var(--pulse-ink);
  border-color: var(--pulse-line);
}
.lp-btn-secondary:hover { border-color: rgba(0, 82, 204, .32); }
.lp-btn-blue {
  background: var(--pulse-blue);
  color: #fff;
  box-shadow: 0 12px 26px rgba(0, 82, 204, .22);
}
.lp-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--pulse-line);
  background: var(--pulse-white);
  cursor: pointer;
}

.lp-hero {
  min-height: 60vh;
  display: grid;
  align-items: center;
  padding: 64px 0 34px;
  background:
    radial-gradient(circle at 75% 38%, rgba(255, 69, 0, .16), transparent 13%),
    linear-gradient(118deg, rgba(255, 69, 0, .16) 0%, rgba(255, 184, 0, .1) 34%, rgba(253, 245, 232, .96) 76%),
    var(--pulse-bg);
}
.lp-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr);
  align-items: center;
  gap: 56px;
}
.lp-hero h1 {
  margin: 16px 0 18px;
  font-family: "Playfair Display", serif;
  font-size: clamp(58px, 6.5vw, 96px);
  font-weight: 900;
  line-height: 1.02;  max-width: 760px;
}
.lp-hero h1 span { color: var(--pulse-orange-dark); }
.lp-hero-copy {
  max-width: 590px;
  color: var(--pulse-muted);
  font-family: "Fraunces", serif;
  font-size: 20px;
  line-height: 1.8;  line-height: 1.65;
  margin: 0 0 28px;
}
.lp-hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
.lp-hero-note {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--pulse-muted);
  font-size: 13px;
}
.lp-note-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255,255,255,.72);
  border: 1px solid rgba(230,233,239,.9);
}
.lp-proof-panel {
  background: rgba(255, 247, 239, .86);
  border: 1px solid rgba(237, 215, 201, .92);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(94, 43, 9, .14);
  padding: 22px;
}
.lp-proof-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.lp-proof-title { font-weight: 900; font-size: 16px; }
.lp-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #128A4A;
  font-size: 12px;
  font-weight: 800;
}
.lp-live::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16A34A;
}
.lp-report-card {
  border-radius: 8px;
  border: 1px solid var(--pulse-line);
  background: #fff;
  padding: 18px;
}
.lp-report-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #F1F3F6;
}
.lp-report-row:last-child { border-bottom: 0; }
.lp-report-label { color: var(--pulse-muted); font-size: 13px; }
.lp-report-value { font-weight: 900; }
.lp-bar {
  height: 8px;
  border-radius: 999px;
  background: #EEF0F4;
  overflow: hidden;
  margin-top: 8px;
}
.lp-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--pulse-orange), var(--pulse-blue));
}
.lp-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
}
.lp-mini-stat {
  border-radius: 8px;
  background: var(--pulse-soft);
  padding: 12px;
}
.lp-mini-stat strong { display: block; font-size: 22px; line-height: 1; }
.lp-mini-stat span { display: block; margin-top: 5px; color: var(--pulse-muted); font-size: 11px; line-height: 1.35; }

.lp-social {
  border-top: 1px solid rgba(253,245,232,.08);
  border-bottom: 1px solid rgba(253,245,232,.08);
  background: var(--pulse-ink);
  padding: 24px 0;
  color: var(--pulse-cream);
}
.lp-social-inner {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr;
  gap: 24px;
  align-items: center;
}
.lp-avatar-row { display: flex; align-items: center; gap: 14px; }
.lp-avatars { display: flex; }
.lp-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid #fff;
  margin-left: -10px;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 900;
}
.lp-avatar:first-child { margin-left: 0; }
.lp-social-copy { color: rgba(253,245,232,.62); font-size: 14px; line-height: 1.5; }
.lp-social-stat strong { display: block; font-size: 28px; line-height: 1; }
.lp-social-stat span { color: rgba(253,245,232,.48); font-size: 13px; }

.lp-steps-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.lp-step {
  background: #fff;
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  padding: 22px;
}
.lp-step-num {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--pulse-soft);
  color: var(--pulse-orange-dark);
  font-weight: 900;
  margin-bottom: 18px;
}
.lp-step h3 { margin: 0 0 10px; font-size: 18px; }
.lp-step p { margin: 0; color: var(--pulse-muted); line-height: 1.6; font-size: 14px; }

.lp-testimonials { background: #fff; }
.lp-testimonial-wrap {
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  gap: 18px;
  align-items: center;
}
.lp-testimonial-card {
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  padding: 30px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  background: var(--pulse-bg);
}
.lp-testimonial-quote {
  margin: 0 0 22px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: clamp(22px, 2.4vw, 32px);
  line-height: 1.22;
}
.lp-founder { display: flex; align-items: center; gap: 14px; }
.lp-founder-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 900;
}
.lp-founder-name { font-weight: 900; }
.lp-founder-role { color: var(--pulse-muted); font-size: 13px; margin-top: 2px; }
.lp-result-box {
  min-width: 210px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--pulse-line);
  padding: 18px;
  align-self: stretch;
}
.lp-result-box strong { display: block; font-size: 34px; color: var(--pulse-blue); line-height: 1; }
.lp-result-box span { display: block; color: var(--pulse-muted); margin-top: 8px; font-size: 13px; line-height: 1.45; }
.lp-carousel-btn {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid var(--pulse-line);
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.lp-template-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.lp-template {
  min-height: 210px;
  border-radius: 8px;
  border: 1px solid var(--pulse-line);
  background: #fff;
  padding: 22px;
  display: flex;
  flex-direction: column;
}
.lp-template-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--pulse-blue);
  background: var(--pulse-blue-soft);
  margin-bottom: 18px;
}
.lp-template h3 { margin: 0 0 8px; font-size: 18px; }
.lp-template p { margin: 0; color: var(--pulse-muted); line-height: 1.55; font-size: 14px; }
.lp-template button { margin-top: auto; align-self: flex-start; }

.lp-symbol-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.lp-symbol {
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--pulse-line);
  padding: 22px;
  min-height: 178px;
}
.lp-symbol-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 69, 0, .09);
  color: var(--pulse-orange);
  margin-bottom: 18px;
}
.lp-symbol h3 { margin: 0 0 8px; font-size: 18px; }
.lp-symbol p { margin: 0; color: var(--pulse-muted); font-size: 14px; line-height: 1.58; }

.lp-analytics {
  background: var(--pulse-ink);
  color: var(--pulse-cream);
}
.lp-analytics .lp-heading,
.lp-analytics .lp-section-title { color: var(--pulse-cream); }
.lp-analytics .lp-section-copy { color: rgba(253,245,232,.58); }
.lp-analytics .lp-eyebrow { color: var(--pulse-saffron); }
.lp-analytics-board {
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(253,245,232,.08), rgba(253,245,232,.025)),
    rgba(253,245,232,.04);
  border: 1px solid rgba(253,245,232,.08);
  padding: 24px;
  box-shadow: 0 24px 80px rgba(0,0,0,.2);
}
.lp-analytics-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid rgba(253,245,232,.08);
}
.lp-analytics-title { font-weight: 900; font-size: 20px; }
.lp-analytics-sub { color: rgba(253,245,232,.46); font-size: 13px; margin-top: 4px; }
.lp-analytics-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  background: rgba(255,69,0,.14);
  color: var(--pulse-saffron);
  padding: 8px 12px;
  font-family: "Syne", Inter, sans-serif;
  font-size: 11px;
  font-weight: 800;
}
.lp-analytics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
.lp-analytics-kpi {
  border-radius: 8px;
  background: rgba(253,245,232,.05);
  border: 1px solid rgba(253,245,232,.08);
  padding: 16px;
  position: relative;
  overflow: hidden;
}
.lp-analytics-kpi::after {
  content: "";
  position: absolute;
  right: -24px;
  top: -26px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255,69,0,.16);
}
.lp-analytics-kpi span {
  display: block;
  color: rgba(253,245,232,.48);
  font-family: "Syne", Inter, sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.lp-analytics-kpi strong {
  display: block;
  margin-top: 10px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 34px;
  line-height: 1;
  color: var(--pulse-cream);
}
.lp-analytics-kpi em {
  display: block;
  margin-top: 8px;
  color: #81E6A2;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
}
.lp-analytics-lower {
  display: grid;
  grid-template-columns: 1.22fr .78fr;
  gap: 14px;
  align-items: stretch;
}
.lp-chart-panel,
.lp-recommend-panel,
.lp-ring-panel,
.lp-funnel-panel,
.lp-segment-panel,
.lp-money-panel,
.lp-plain-panel {
  border-radius: 8px;
  background: rgba(253,245,232,.05);
  border: 1px solid rgba(253,245,232,.08);
  padding: 18px;
}
.lp-chart-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 270px;
}
.lp-side-stack {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 14px;
}
.lp-analytics-bottom {
  display: grid;
  grid-template-columns: .82fr 1.08fr .9fr;
  gap: 14px;
  margin-top: 14px;
}
.lp-decision-row {
  grid-template-columns: 1fr;
}
.lp-chart-title {
  font-family: "Syne", Inter, sans-serif;
  font-size: 11px;
  font-weight: 800;
  color: rgba(253,245,232,.5);
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: 14px;
}
.lp-chart-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
}
.lp-chart-note {
  color: rgba(253,245,232,.54);
  font-size: 12px;
  line-height: 1.45;
  text-align: right;
  max-width: 220px;
}
.lp-chart-stage {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 12px;
  min-height: 198px;
}
.lp-axis-y {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: rgba(253,245,232,.38);
  font-size: 11px;
  padding: 8px 0 24px;
}
.lp-chart-bars {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  gap: 10px;
  min-height: 198px;
  padding-top: 10px;
  background-image: linear-gradient(rgba(253,245,232,.07) 1px, transparent 1px);
  background-size: 100% 25%;
}
.lp-bar-wrap {
  height: 100%;
  display: grid;
  align-items: end;
  gap: 8px;
  position: relative;
}
.lp-chart-bar {
  width: 100%;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, var(--pulse-saffron), var(--pulse-orange));
  transform-origin: bottom;
  animation: lpBarRise 1.8s ease-in-out infinite alternate;
  box-shadow: 0 0 20px rgba(255,69,0,.18);
}
.lp-bar-label {
  color: rgba(253,245,232,.48);
  font-size: 11px;
  text-align: center;
}
.lp-bar-value {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(var(--h) + 10px);
  color: rgba(253,245,232,.82);
  font-size: 11px;
  font-weight: 900;
  z-index: 2;
  text-shadow: 0 1px 10px rgba(0,0,0,.35);
}
.lp-bar-wrap:nth-child(2) .lp-chart-bar { animation-delay: .12s; }
.lp-bar-wrap:nth-child(3) .lp-chart-bar { animation-delay: .24s; }
.lp-bar-wrap:nth-child(4) .lp-chart-bar { animation-delay: .36s; }
.lp-bar-wrap:nth-child(5) .lp-chart-bar { animation-delay: .48s; }
.lp-bar-wrap:nth-child(6) .lp-chart-bar { animation-delay: .6s; }
.lp-bar-wrap:nth-child(7) .lp-chart-bar { animation-delay: .72s; }
@keyframes lpBarRise {
  from { transform: scaleY(.72); filter: saturate(.82); }
  to { transform: scaleY(1); filter: saturate(1.08); }
}
.lp-recommend-list { display: grid; gap: 12px; }
.lp-recommend-item {
  display: flex;
  gap: 10px;
  color: rgba(253,245,232,.76);
  line-height: 1.5;
  font-size: 14px;
}
.lp-recommend-item svg { color: var(--pulse-saffron); flex-shrink: 0; margin-top: 2px; }
.lp-recommend-item strong {
  display: block;
  color: var(--pulse-cream);
  margin-bottom: 2px;
}
.lp-recommend-item span { color: rgba(253,245,232,.62); }
.lp-ring-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.lp-ring {
  display: grid;
  place-items: center;
  gap: 8px;
  text-align: center;
}
.lp-ring svg {
  width: 82px;
  height: 82px;
  transform: rotate(-90deg);
}
.lp-ring-bg { stroke: rgba(253,245,232,.1); }
.lp-ring-fg {
  stroke: var(--pulse-orange);
  stroke-linecap: round;
  stroke-dasharray: 220;
  stroke-dashoffset: calc(220 - (220 * var(--score)) / 100);
  animation: lpRingPulse 2.4s ease-in-out infinite alternate;
}
@keyframes lpRingPulse {
  from { stroke-width: 11; opacity: .78; }
  to { stroke-width: 13; opacity: 1; }
}
.lp-ring strong {
  position: absolute;
  color: var(--pulse-cream);
  font-family: "Playfair Display", Georgia, serif;
  font-size: 22px;
}
.lp-ring-visual {
  position: relative;
  display: grid;
  place-items: center;
}
.lp-ring span {
  color: rgba(253,245,232,.58);
  font-size: 12px;
  line-height: 1.35;
}
.lp-funnel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}
.lp-funnel-row {
  width: var(--w);
  min-width: 46%;
  min-height: 33px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  border-radius: 6px;
  color: rgba(253,245,232,.84);
  font-size: 13px;
  background: linear-gradient(90deg, var(--pulse-orange), var(--pulse-saffron));
  animation: lpFunnelBreath 2.8s ease-in-out infinite alternate;
}
.lp-funnel-row strong { color: var(--pulse-ink); }
@keyframes lpFunnelBreath {
  from { transform: scaleX(.94); transform-origin: center; }
  to { transform: scaleX(1); transform-origin: center; }
}
.lp-money-grid {
  display: grid;
  gap: 10px;
}
.lp-money-row {
  display: grid;
  grid-template-columns: 92px 1fr 54px;
  gap: 10px;
  align-items: center;
  color: rgba(253,245,232,.7);
  font-size: 13px;
}
.lp-money-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(253,245,232,.08);
  overflow: hidden;
}
.lp-money-fill {
  height: 100%;
  width: var(--w);
  border-radius: inherit;
  background: var(--c);
  animation: lpWidthDrift 2.8s ease-in-out infinite alternate;
}
@keyframes lpWidthDrift {
  from { transform: scaleX(.9); transform-origin: left; }
  to { transform: scaleX(1); transform-origin: left; }
}
.lp-segment-list {
  display: grid;
  gap: 10px;
}
.lp-segment-row {
  display: grid;
  grid-template-columns: 100px 1fr 44px;
  gap: 10px;
  align-items: center;
  color: rgba(253,245,232,.72);
  font-size: 13px;
}
.lp-segment-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(253,245,232,.08);
}
.lp-segment-fill {
  width: var(--w);
  height: 100%;
  border-radius: inherit;
  background: var(--c, var(--pulse-orange));
  box-shadow: 0 0 18px color-mix(in srgb, var(--c, var(--pulse-orange)) 40%, transparent);
}
.lp-plain-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.lp-plain-card {
  border-radius: 8px;
  border: 1px solid rgba(253,245,232,.08);
  background: rgba(253,245,232,.045);
  padding: 14px;
}
.lp-plain-card strong {
  display: block;
  color: var(--pulse-cream);
  font-size: 18px;
  margin-bottom: 6px;
}
.lp-plain-card span {
  display: block;
  color: rgba(253,245,232,.58);
  font-size: 12px;
  line-height: 1.45;
}
.lp-reviews-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.lp-review-card {
  background: #fff;
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  padding: 24px;
}
.lp-stars {
  display: flex;
  gap: 4px;
  color: var(--pulse-orange);
  margin-bottom: 18px;
}
.lp-review-card p {
  margin: 0 0 18px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 22px;
  line-height: 1.35;
}
.lp-review-meta { display: flex; align-items: center; gap: 12px; }
.lp-review-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--pulse-ink);
  font-weight: 900;
}
.lp-review-name { font-weight: 900; }
.lp-review-role { color: var(--pulse-muted); font-size: 13px; margin-top: 2px; }

.lp-success-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.lp-success-card {
  background: #fff;
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  overflow: hidden;
}
.lp-success-band {
  min-height: 92px;
  background: linear-gradient(135deg, rgba(255,69,0,.88), rgba(255,184,0,.78));
  padding: 18px;
  color: #fff;
  display: flex;
  align-items: flex-end;
  font-family: "Syne", Inter, sans-serif;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.lp-success-body { padding: 22px; }
.lp-success-body h3 { margin: 0 0 10px; font-size: 20px; }
.lp-success-body p { margin: 0 0 18px; color: var(--pulse-muted); line-height: 1.58; font-size: 14px; }
.lp-success-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.lp-success-metric {
  border-radius: 8px;
  background: var(--pulse-cream);
  padding: 12px;
}
.lp-success-metric strong { display: block; font-size: 22px; line-height: 1; }
.lp-success-metric span { display: block; color: var(--pulse-muted); font-size: 11px; line-height: 1.35; margin-top: 6px; }

.lp-pricing { background: #fff; }
.lp-pricing-toggle {
  display: inline-flex;
  padding: 4px;
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  background: #fff;
  gap: 4px;
}
.lp-pricing-toggle button {
  min-height: 36px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  padding: 0 14px;
  font-weight: 800;
  color: var(--pulse-muted);
  cursor: pointer;
}
.lp-pricing-toggle button.active {
  color: #fff;
  background: var(--pulse-blue);
}
.lp-pricing-stage {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 42px;
  gap: 18px;
  align-items: center;
}
.lp-plan-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}
.lp-price-card {
  position: relative;
  border-radius: 8px;
  border: 1px solid var(--pulse-line);
  background: #fff;
  padding: 20px;
}
.lp-price-card {
  display: flex;
  flex-direction: column;
  min-height: 430px;
}
.lp-price-card.featured {
  border-color: rgba(255,149,0,.5);
  box-shadow: 0 20px 50px rgba(255, 149, 0, .13);
}
.lp-price-card.dark {
  background: var(--pulse-ink);
  color: #fff;
  border-color: var(--pulse-ink);
}
.lp-price-badge {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--pulse-soft);
  color: var(--pulse-orange-dark);
  font-size: 11px;
  font-weight: 900;
  margin-bottom: 16px;
}
.dark .lp-price-badge { background: rgba(255,255,255,.12); color: #fff; }
.lp-price-name { font-size: 20px; font-weight: 900; margin-bottom: 8px; }
.lp-price-amount {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.lp-price-amount strong { font-size: 40px; line-height: 1; }
.lp-price-amount span { color: var(--pulse-muted); font-size: 13px; }
.lp-price-original {
  color: var(--pulse-muted);
  text-decoration: line-through;
  font-size: 15px;
  font-weight: 800;
}
.lp-price-offer {
  display: inline-flex;
  align-self: flex-start;
  margin-bottom: 16px;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(255, 122, 47, .12);
  color: var(--pulse-orange-dark);
  font-size: 12px;
  font-weight: 900;
}
.dark .lp-price-amount span, .dark .lp-price-desc, .dark .lp-price-list li { color: rgba(255,255,255,.72); }
.dark .lp-price-original { color: rgba(255,255,255,.46); }
.dark .lp-price-offer { background: rgba(255,255,255,.12); color: #fff; }
.lp-price-desc { margin: 0 0 18px; color: var(--pulse-muted); font-size: 14px; line-height: 1.55; }
.lp-price-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0 0 22px;
  list-style: none;
}
.lp-price-list li {
  display: flex;
  gap: 9px;
  color: var(--pulse-muted);
  font-size: 14px;
  line-height: 1.45;
}
.lp-price-card .lp-btn { margin-top: auto; width: 100%; }
.lp-rate-nav {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid var(--pulse-line);
  background: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.lp-rate-nav:disabled {
  opacity: .32;
  cursor: default;
}
.lp-rate-progress {
  margin-top: 14px;
  display: flex;
  justify-content: center;
  gap: 7px;
}
.lp-rate-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 0;
  background: rgba(110,94,83,.28);
  cursor: pointer;
}
.lp-rate-dot.active { width: 22px; border-radius: 999px; background: var(--pulse-orange); }
.lp-faq-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.lp-faq-item {
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.lp-faq-q {
  width: 100%;
  min-height: 64px;
  border: 0;
  background: #fff;
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
  font-weight: 900;
  cursor: pointer;
}
.lp-faq-a {
  padding: 0 18px 18px;
  color: var(--pulse-muted);
  line-height: 1.6;
  font-size: 14px;
}

.lp-footer {
  background: var(--pulse-ink);
  color: #fff;
  padding: 64px 0 34px;
}
.lp-footer-grid {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1fr 1.15fr;
  gap: 42px;
  padding-bottom: 36px;
  border-bottom: 1px solid rgba(255,255,255,.12);
}
.lp-footer p, .lp-footer a, .lp-footer-bottom { color: rgba(255,255,255,.66); }
.lp-footer .lp-brand-pulse { color: #fff; }
.lp-footer .lp-brand-axiora { color: rgba(255,255,255,.46); }
.lp-footer p { margin: 16px 0 0; line-height: 1.6; max-width: 320px; }
.lp-footer h4 {
  margin: 0 0 14px;
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.lp-footer ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.lp-footer a,
.lp-footer-link {
  text-decoration: none;
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: rgba(255,255,255,.66);
  font-size: 14px;
}
.lp-footer-link:hover,
.lp-footer a:hover { color: #fff; }
.lp-footer-note {
  margin-top: 18px;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.1);
  color: rgba(255,255,255,.54);
  font-size: 12px;
  line-height: 1.55;
}
.lp-social-links {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.lp-social-link {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,.12);
  display: grid;
  place-items: center;
  color: rgba(255,255,255,.72);
  background: rgba(255,255,255,.04);
  transition: color .18s ease, border-color .18s ease, background .18s ease;
}
.lp-social-link:hover {
  color: var(--pulse-orange);
  border-color: rgba(255,69,0,.5);
  background: rgba(255,69,0,.12);
}
.lp-social-link svg { width: 18px; height: 18px; fill: currentColor; }
.lp-footer-bottom {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 24px;
  font-size: 13px;
}

.lp-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(17,24,39,.52);
  display: grid;
  place-items: center;
  padding: 20px;
}
.lp-modal {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 30px 90px rgba(0,0,0,.24);
  padding: 24px;
}
.lp-modal.legal {
  width: min(860px, 100%);
  max-height: min(84vh, 760px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.lp-legal-body {
  overflow: auto;
  padding-right: 8px;
}
.lp-legal-body h4 {
  margin: 22px 0 8px;
  font-size: 15px;
  font-family: "Syne", Inter, sans-serif;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.lp-legal-body ul {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
}
.lp-legal-body li,
.lp-legal-body p {
  color: var(--pulse-muted);
  font-size: 14px;
  line-height: 1.65;
}
.lp-legal-updated {
  display: inline-flex;
  align-self: flex-start;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--pulse-cream);
  padding: 6px 10px;
  color: var(--pulse-orange-dark);
  font-size: 12px;
  font-weight: 800;
}
.lp-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.lp-modal h3 {
  font-family: "Playfair Display", Georgia, serif;
  font-size: 30px;
  margin: 0 0 6px;
}
.lp-modal p { margin: 0; color: var(--pulse-muted); line-height: 1.55; }
.lp-form { display: grid; gap: 12px; margin-top: 18px; }
.lp-input {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  padding: 0 13px;
  outline: none;
}
.lp-input:focus { border-color: var(--pulse-blue); box-shadow: 0 0 0 3px rgba(0,82,204,.12); }
.lp-modal-actions { display: flex; gap: 10px; margin-top: 18px; }
.lp-flow-options { display: grid; gap: 10px; margin-top: 18px; }
.lp-flow-option {
  border: 1px solid var(--pulse-line);
  border-radius: 8px;
  padding: 14px;
  display: flex;
  gap: 12px;
  cursor: pointer;
  background: #fff;
  text-align: left;
}
.lp-flow-option:hover { border-color: var(--pulse-orange); background: var(--pulse-soft); }
.lp-flow-option strong { display: block; margin-bottom: 3px; }
.lp-flow-option span { color: var(--pulse-muted); font-size: 13px; line-height: 1.4; }

@media (max-width: 960px) {
  .lp-nav-links { display: none; }
  .lp-mobile-menu { display: inline-flex; }
  .lp-hero-grid,
  .lp-social-inner,
  .lp-steps-grid,
  .lp-template-grid,
  .lp-symbol-grid,
  .lp-analytics-grid,
  .lp-analytics-lower,
  .lp-analytics-bottom,
  .lp-reviews-grid,
  .lp-success-grid,
  .lp-pricing-stage,
  .lp-plan-strip,
  .lp-footer-grid,
  .lp-faq-grid { grid-template-columns: 1fr; }
  .lp-hero { padding-top: 40px; }
  .lp-section-head { display: block; }
  .lp-section-copy { margin-top: 16px; }
  .lp-chart-note { text-align: left; max-width: none; }
  .lp-testimonial-card { grid-template-columns: 1fr; }
  .lp-result-box { min-width: 0; }
}

@media (max-width: 640px) {
  .lp-shell { width: min(100% - 32px, 1184px); }
  .lp-nav-inner { height: 64px; }
  .lp-nav-actions .lp-btn-secondary { display: none; }
  .lp-hero h1 { font-size: 36px; }
  .lp-hero-copy { font-size: 17px; }
  .lp-hero-ctas .lp-btn { width: 100%; }
  .lp-proof-panel { padding: 16px; }
  .lp-mini-grid { grid-template-columns: 1fr; }
  .lp-testimonial-wrap { grid-template-columns: 1fr; }
  .lp-carousel-btn { display: none; }
  .lp-rate-nav { display: none; }
  .lp-footer-bottom { flex-direction: column; }
  .lp-analytics-board { padding: 14px; }
  .lp-analytics-top { align-items: flex-start; flex-direction: column; }
  .lp-chart-head { flex-direction: column; }
  .lp-chart-stage { grid-template-columns: 1fr; min-height: 190px; }
  .lp-axis-y { display: none; }
  .lp-chart-bars { min-height: 156px; gap: 6px; }
  .lp-bar-label,
  .lp-bar-value { font-size: 10px; }
  .lp-ring-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .lp-ring svg { width: 76px; height: 76px; }
  .lp-ring strong { font-size: 20px; }
  .lp-plain-grid { grid-template-columns: 1fr; }
  .lp-segment-row { grid-template-columns: 86px 1fr 42px; font-size: 12px; }
  .lp-money-row { grid-template-columns: 76px 1fr 42px; font-size: 12px; }
}
  .lp-logo { text-decoration: none; display: flex; align-items: flex-start; gap: 0; line-height: 1; }
.lp-logo-parent {
  font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700;
  letter-spacing: .2em; text-transform: uppercase; color: var(--espresso);
  opacity: .35; margin-right: 8px; position: relative; top: -2px;
}
.lp-logo-product {
  font-family: 'Playfair Display', serif; font-weight: 900; font-size: 28px;
  letter-spacing: -1px; color: var(--espresso);
}
.lp-logo-dot {
  position: relative; width: 9px; height: 9px; background: var(--coral); border-radius: 50%;
  box-shadow: 0 0 10px rgba(255,69,0,.55); align-self: flex-start;
  margin-top: 5px; margin-left: 8px; flex-shrink: 0;
}
.lp-logo-dot .sonar-ring {
  position: absolute; border-radius: 50%; border: 1.5px solid var(--coral);
  top: 50%; left: 50%; width: 9px; height: 9px;
  transform: translate(-50%,-50%) scale(0); opacity: 0;
  animation: sonarRing 3s ease-out infinite;
}
.lp-logo-dot .sonar-ring:nth-child(1) { animation-delay: 0s; }
.lp-logo-dot .sonar-ring:nth-child(2) { animation-delay: .9s; }
.lp-logo-dot .sonar-ring:nth-child(3) { animation-delay: 1.8s; }
@keyframes sonarRing {
  0%   { transform: translate(-50%,-50%) scale(1); opacity: .65; }
  60%  { opacity: .3; }
  100% { transform: translate(-50%,-50%) scale(3.8); opacity: 0; }
}
  /* Footer logo colors */
.lp-footer .lp-logo-parent{
  color: rgba(255,255,255,.55) !important;
}

.lp-footer .lp-logo-product{
  color: #ffffff !important;
}

.lp-footer .lp-logo-dot{
  background: var(--pulse-orange);
  box-shadow: 0 0 12px rgba(255,69,0,.6);
}

.lp-footer .lp-logo-dot .sonar-ring{
  border-color: rgba(255,69,0,.7);
}
`;

const heroLines = [
  "Know the market pulse before you build.",
  "Get Pulse guidance from idea to investor readiness.",
  "Build with clarity, confidence, and capital discipline.",
  "Turn customer insight into a step-by-step action plan.",
];

const heroActionPlans = [
  {
    title: "Business Idea Validation",
    idea: "Campus meal subscription MVP",
    signalLabel: "Problem urgency",
    signalValue: "68%",
    signalWidth: "68%",
    rows: [
      ["Target customer", "Hostel students"],
      ["Willingness to pay", "₹149/week"],
      ["Key objection", "Menu variety"],
      ["Next action", "Run paid pilot"],
    ],
    stats: [["7d", "validation timeline"], ["412", "customer signals"], ["3", "mentor next steps"]],
  },
  {
    title: "Investor Readiness Check",
    idea: "Early-stage fintech pitch",
    signalLabel: "Evidence strength",
    signalValue: "74%",
    signalWidth: "74%",
    rows: [
      ["Sharpest proof", "Pain intensity"],
      ["Weakest slide", "Go-to-market"],
      ["Investor question", "CAC clarity"],
      ["Next action", "Add traction proof"],
    ],
    stats: [["5", "pitch gaps"], ["2", "proof points"], ["1", "capital ask edit"]],
  },
  {
    title: "Capital Discipline Plan",
    idea: "D2C wellness launch",
    signalLabel: "Spend confidence",
    signalValue: "61%",
    signalWidth: "61%",
    rows: [
      ["Budget risk", "Paid ads too early"],
      ["First test", "Landing waitlist"],
      ["Must avoid", "Bulk inventory"],
      ["Next action", "Test ₹10k channel"],
    ],
    stats: [["₹4.8L", "spend deferred"], ["2", "lean tests"], ["14d", "pilot window"]],
  },
  {
    title: "Step-by-Step Action Plan",
    idea: "B2B workflow tool",
    signalLabel: "Action clarity",
    signalValue: "82%",
    signalWidth: "82%",
    rows: [
      ["Week 1", "Interview 12 buyers"],
      ["Week 2", "Validate workflow pain"],
      ["Week 3", "Price pilot offer"],
      ["Next action", "Book 5 demos"],
    ],
    stats: [["3", "weekly moves"], ["12", "buyer calls"], ["5", "pilot demos"]],
  },
];

const plans = [
  {
    name: "Freemium",
    price: "₹0",
    offerPrice: "₹0",
    period: "forever",
    badge: "Try first",
    desc: "Start with one guided idea check and keep your first insights forever.",
    features: ["1 guided survey", "50 responses", "View insights forever", "Basic mentor summary"],
    cta: "Try Free",
  },
  {
    name: "Student",
    price: "₹499",
    offerPrice: "₹249",
    period: "month",
    desc: "For student founders who need clarity before a pitch, grant, or prototype.",
    features: ["3 guided studies", "500 responses / month", "Idea clarity templates", "Email support"],
    cta: "Start Student",
  },
  {
    name: "Starter",
    price: "₹1,999",
    offerPrice: "₹999",
    period: "month",
    badge: "Recommended",
    featured: true,
    desc: "For founders who need customer insight and a practical next-step plan.",
    features: ["5 guided studies", "2,000 responses / month", "Investor-readiness summary", "One-time option available"],
    cta: "Start Starter",
  },
  {
    name: "Growth",
    price: "₹4,999",
    offerPrice: "₹2,499",
    period: "month",
    desc: "For teams sharpening positioning, acquisition, and pre-traction strategy.",
    features: ["20 guided studies", "10,000 responses / month", "Customer insight dashboard", "Team workspace"],
    cta: "Choose Growth",
  },
  {
    name: "Professional",
    price: "₹9,999",
    offerPrice: "₹4,999",
    period: "month",
    dark: true,
    desc: "For accelerators, studios, and advisory teams guiding multiple founders.",
    features: ["Unlimited guided studies", "White-label ready", "Priority mentor support", "Export-ready reports"],
    cta: "Go Professional",
  },
  {
    name: "Enterprise",
    price: "Custom",
    offerPrice: "Custom",
    period: "full suite",
    desc: "For institutions running founder guidance and market learning at scale.",
    features: ["Custom response volumes", "Dedicated success team", "Security review", "Custom integrations"],
    cta: "Contact Sales",
  },
];

const oneTimePlan = {
  name: "One-time validation",
  price: "₹1,999",
  offerPrice: "₹999",
  period: "one-time",
  badge: "Low-risk test",
  desc: "Run one focused Pulse-guided validation before committing to a monthly plan.",
  features: ["1 guided validation", "Up to 2,000 responses", "Founder action plan", "No subscription"],
  cta: "Buy One Study",
};

const testimonials = [
  {
    quote: "Pulse helped us see the buyer, the price ceiling, and the next move. It felt less like a form builder and more like a mentor for our launch.",
    name: "Aarav Mehta",
    role: "Founder, fintech pilot",
    result: "312",
    resultText: "responses translated into an investor-ready action plan",
    initials: "AM",
    color: "#0052CC",
  },
  {
    quote: "The Pulse Mentor pushed us to pause an expensive feature and focus on the segment that was already showing intent.",
    name: "Nisha Rao",
    role: "Co-founder, healthtech MVP",
    result: "9 days",
    resultText: "from idea check to customer insight summary",
    initials: "NR",
    color: "#FF9500",
  },
  {
    quote: "I needed more than encouragement from friends. Pulse gave me market guidance, objections, and a sharper capital plan.",
    name: "Karan Shah",
    role: "D2C founder",
    result: "42%",
    resultText: "clearer purchase intent after mentor-led repositioning",
    initials: "KS",
    color: "#128A4A",
  },
];

const templates = [
  ["Idea Validation", "Check demand, pain intensity, and willingness to pay before you build.", Lightbulb],
  ["Business Clarity", "Clarify the customer, offer, problem, and first practical action path.", Target],
  ["Investor Readiness", "Turn customer evidence into a sharper investor update or pitch narrative.", FileText],
  ["Customer Insights", "Find who cares most, why they care, and what blocks adoption.", Users],
  ["Capital Discipline", "Prioritize what to test before spending heavily on product or marketing.", BarChart3],
  ["Pre-Traction Strategy", "Shape positioning, channel focus, and weekly execution priorities.", Rocket],
];

const symbols = [
  ["Clarity", "Know the customer, the problem, the offer, and the next best move.", Compass],
  ["Confidence", "Use market signal before building, pitching, hiring, or spending.", ShieldCheck],
  ["Capital Discipline", "Protect runway by testing assumptions before committing lakhs.", Gauge],
  ["Conquer", "Walk into reviews, pilots, and investor meetings with a grounded plan.", Trophy],
];

const analyticsKpis = [
  ["Idea Score", "72/100", "Build, but narrow the buyer"],
  ["Paying Intent", "38%", "Ready to join a pilot"],
  ["Best Price Signal", "Rs 1,999", "Test before discounting"],
  ["Runway Risk", "Low", "3 spends to delay"],
];

const readinessRings = [
  ["Problem clarity", 82],
  ["Buyer demand", 68],
  ["Pitch proof", 74],
];

const validationFunnel = [
  ["Reached", "500", "100%"],
  ["Opened", "370", "82%"],
  ["Completed", "305", "70%"],
  ["High intent", "190", "58%"],
  ["Pilot ready", "90", "42%"],
];

const segmentSignals = [
  ["Students", "82%", "#FF4500"],
  ["Freelancers", "64%", "#FFB800"],
  ["Small teams", "48%", "#4ADE80"],
  ["Enterprises", "29%", "#4D7CFF"],
];

const demandTrend = [
  ["Day 1", 42],
  ["Day 2", 58],
  ["Day 3", 51],
  ["Day 4", 69],
  ["Day 5", 74],
  ["Day 6", 81],
  ["Day 7", 88],
];

const capitalSignals = [
  ["Product", "42%", "#FFB800"],
  ["Marketing", "27%", "#4ADE80"],
  ["Hiring", "18%", "#4D7CFF"],
  ["Inventory", "63%", "#FF4500"],
];

const decisionCards = [
  ["Build next", "Interview students and freelancers before adding features."],
  ["Price test", "Run Rs 1,999 vs Rs 4,999 offer pages for 7 days."],
  ["Investor note", "Show demand, high-intent users, and delayed spend logic."],
];

const reviews = [
  ["Pulse made our idea feel measurable. The Pulse Mentor showed what to ask next instead of leaving us with a spreadsheet.", "Devika Nair", "SaaS founder", "DN"],
  ["The action plan helped us stop debating internally. We knew the buyer, the objection, and the leanest test to run.", "Rahul Iyer", "Consumer app founder", "RI"],
  ["For our pitch deck, the investor-readiness summary was the difference between opinion and a clean story.", "Meera Shah", "Healthtech founder", "MS"],
];

const successStories = [
  {
    label: "D2C launch",
    title: "Saved ad spend before launch",
    copy: "A wellness founder used Pulse to validate the first customer segment and delay a paid media push until the offer was clearer.",
    metrics: [["₹4.8L", "spend deferred"], ["14d", "pilot plan"]],
  },
  {
    label: "Student founder",
    title: "Turned a campus idea into a pilot",
    copy: "A student team tested willingness to pay, menu objections, and referral intent before approaching local partners.",
    metrics: [["412", "signals"], ["3", "next moves"]],
  },
  {
    label: "Investor prep",
    title: "Sharper story for demo day",
    copy: "A fintech founder used customer pain data and objection patterns to improve the traction and GTM sections of the pitch.",
    metrics: [["8.4/10", "readiness"], ["5", "deck fixes"]],
  },
];

const legalDocs = {
  privacy: {
    title: "Privacy Notice",
    updated: "Draft for product use - June 2026",
    intro: "This notice explains how Axiora Pulse may handle information when founders, students, teams, respondents, or organizations use the platform for idea validation, customer insight, Pulse Mentor guidance, reports, and related workflows.",
    sections: [
      ["Information handled", [
        "Account details such as name, email address, organization name, role, billing status, and login identifiers may be processed for access, support, security, and account administration.",
        "Survey, validation, prompt, response, document, report, and dashboard content may be processed to provide the requested product experience, including Pulse Mentor summaries and decision-support outputs.",
        "Technical data such as device information, browser type, approximate location signals, timestamps, IP address, page events, error logs, and usage analytics may be processed to maintain reliability and improve the service.",
      ]],
      ["How information is used", [
        "Information may be used to operate the platform, generate reports, provide customer support, improve templates and product flows, prevent misuse, process payments, and communicate service updates.",
        "Aggregated or de-identified patterns may be used to understand product performance and improve guidance quality, without presenting individual respondent identities as public references.",
        "Respondent information should be collected by users only where they have a lawful and ethical basis to do so and where respondents understand the purpose of the collection.",
      ]],
      ["Sharing and retention", [
        "Information may be shared with service providers that support hosting, analytics, communications, payment processing, security, or Pulse-enabled product functionality under appropriate operational controls.",
        "Information may be retained for as long as needed to provide the service, comply with legal or accounting obligations, resolve disputes, maintain security, and support legitimate business records.",
        "Deletion or export requests may be reviewed according to account status, technical feasibility, contractual obligations, and applicable law.",
      ]],
      ["User choices", [
        "Users may update account details, manage survey content, stop collecting responses, or request support with access, correction, export, or deletion where applicable.",
        "Users remain responsible for notices, consents, and permissions connected with the audiences they invite to respond.",
      ]],
    ],
  },
  terms: {
    title: "Terms and Conditions",
    updated: "Draft for product use - June 2026",
    intro: "These terms describe the expected use of Axiora Pulse as the Pulse mentor, idea validation, customer insight, and decision-support platform. Use of the platform should be understood as assisted judgment, not a substitute for business, legal, financial, tax, investment, or professional advice.",
    sections: [
      ["Nature of the platform", [
        "Axiora Pulse helps users structure questions, collect responses, analyze signals, generate summaries, and organize action plans for business clarity and investor readiness.",
        "Outputs may support decision-making, but they should be treated as guidance material rather than a definitive business outcome signal.",
        "Business outcomes can be affected by execution quality, pricing, timing, unit economics, competition, regulation, capital availability, global events, local market behavior, team capability, distribution, and many other factors outside the platform.",
      ]],
      ["User responsibility", [
        "Users remain responsible for their own decisions, implementation, communications, fundraising claims, financial commitments, product launches, and use of platform outputs.",
        "Users should independently review reports, validate assumptions, consult qualified professionals where appropriate, and avoid presenting Pulse outputs as assured results.",
        "Users should not upload content they do not have rights to use or collect respondent information without the required permission, notice, or lawful basis.",
      ]],
      ["Acceptable use", [
        "The platform should not be used for unlawful, deceptive, discriminatory, harmful, infringing, defamatory, exploitative, or privacy-invasive activity.",
        "Users should not attempt to reverse engineer, overload, scrape, bypass security, interfere with platform operations, or misuse Pulse-generated outputs.",
        "Survey invitations and respondent communications should be accurate, respectful, and compliant with applicable marketing, privacy, and communication rules.",
      ]],
      ["Pulse Mentor outputs and reports", [
        "Pulse-generated summaries, recommendations, scores, and action plans may contain limitations, assumptions, uncertainty, or errors.",
        "Reports are intended to help users think through customer signal and strategic options; they should be read with business judgment and market context.",
        "Where users share reports with investors, customers, partners, or institutions, users should explain methodology, sample limitations, and context honestly.",
      ]],
      ["Payments and plans", [
        "Plan access, response limits, feature availability, discounts, founding-member offers, and pricing may be adjusted according to product policy, commercial terms, or operational requirements.",
        "Limited-period offers may be subject to eligibility, usage conditions, availability, and verification before activation.",
      ]],
      ["Liability posture", [
        "To the extent permitted by applicable law, Axiora Pulse is provided as a platform for guidance and decision support, with service commitments limited to the applicable plan or agreement.",
        "Indirect business losses, lost profits, failed launches, fundraising outcomes, market changes, or implementation results remain outside the platform's control.",
      ]],
    ],
  },
  security: {
    title: "Security Statement",
    updated: "Draft for product use - June 2026",
    intro: "This statement outlines the security posture intended for Axiora Pulse. Security is treated as an operational discipline across account access, data handling, infrastructure, and product workflows.",
    sections: [
      ["Platform safeguards", [
        "Access controls, authentication flows, transport encryption, tenant-aware data handling, and environment-level controls may be used to reduce unauthorized access risk.",
        "Operational logs and monitoring may be used to detect errors, suspicious behavior, abuse patterns, and system reliability issues.",
        "Security controls are maintained as layered safeguards; no internet-based system can be described as risk-free.",
      ]],
      ["User-side safeguards", [
        "Users should use strong credentials, restrict team access, review invited collaborators, and avoid sharing confidential report links publicly.",
        "Users should avoid uploading unnecessary sensitive personal data, financial secrets, health information, government identifiers, or confidential third-party material unless the use case has been properly reviewed.",
      ]],
      ["Incident handling", [
        "Potential security issues may be assessed, contained, investigated, and communicated according to severity, legal requirements, and operational impact.",
        "Users should report suspected account compromise, unintended data exposure, or suspicious activity through the support or contact channels provided by Axiora Pulse.",
      ]],
    ],
  },
  data: {
    title: "Data Policy",
    updated: "Draft for product use - June 2026",
    intro: "This policy explains how data responsibilities are divided when users collect responses, generate insights, and use Pulse Mentor outputs through Axiora Pulse.",
    sections: [
      ["User content and respondent data", [
        "Users control the questions they ask, the audiences they invite, the business ideas they describe, and the content they upload or generate through the platform.",
        "Users should collect only the data needed for the stated validation purpose and should avoid excessive, sensitive, or irrelevant data collection.",
        "Respondent data should be handled with transparency, respect, and applicable consent or notice obligations.",
      ]],
      ["Insight generation", [
        "Pulse may process user inputs and response data to create summaries, patterns, readiness indicators, recommendations, charts, and action plans.",
        "Generated insights depend on the quality, volume, context, and honesty of inputs and responses. Weak samples, biased audiences, unclear questions, or incomplete business context may affect usefulness.",
      ]],
      ["Data quality and limitations", [
        "The platform may help identify signals, objections, and patterns, while future customer behavior remains shaped by timing, execution, economics, competition, and market context.",
        "Users should consider sample size, audience fit, collection channel, timing, local economics, competition, and execution capacity before acting on insights.",
      ]],
      ["Exports and sharing", [
        "Users may export or share reports according to plan features and product permissions.",
        "When sharing reports externally, users should avoid overstating certainty and should present findings as decision-support evidence rather than assured outcomes.",
      ]],
    ],
  },
};

const faqs = [
  ["How is this different from a Google Form?", "Pulse acts as the Pulse mentor and decision-support system. It guides the question flow, interprets customer insight, and turns responses into clarity, not just raw rows."],
  ["Can I use the free plan forever?", "Yes. The free plan includes one guided survey and 50 responses, and you can view those insights forever."],
  ["Who is the ₹1,999 one-time option for?", "It is for founders who want one focused Pulse-guided validation before choosing a subscription or spending more on the idea."],
  ["What is the Founding Member Pass?", "It is a ₹4,999 lifetime pass for the first 100 early adopters who want ongoing idea validation, business clarity, and investor-readiness support."],
  ["Will I get an investor-ready report?", "Paid plans include report-friendly summaries that connect market evidence, customer insight, capital discipline, and next-step recommendations."],
  ["Do I need research experience?", "No. Pulse uses founder-friendly prompts and Pulse guidance to help you ask practical questions without research jargon."],
  ["Can students use it?", "Yes. The Student plan is priced for campus founders, pitch competitions, and early projects."],
  ["Can I upgrade later?", "Yes. Start free, run a one-time validation, or move to a monthly plan when you need more guided studies and responses."],
];

function Modal({ type, onClose, onNavigate }) {
  const isLogin = type === "login";
  const isSignup = type === "signup";
  const legalKey = type?.startsWith("legal:") ? type.split(":")[1] : null;
  const legalDoc = legalKey ? legalDocs[legalKey] : null;

  if (legalDoc) {
    return (
      <div className="lp-modal-backdrop" role="dialog" aria-modal="true">
        <div className="lp-modal legal">
          <div className="lp-modal-head">
            <div>
              <h3>{legalDoc.title}</h3>
              <p>{legalDoc.intro}</p>
              <span className="lp-legal-updated">{legalDoc.updated}</span>
            </div>
            <button className="lp-icon-btn" onClick={onClose} aria-label="Close"><X className="lp-icon" /></button>
          </div>
          <div className="lp-legal-body">
            {legalDoc.sections.map(([heading, points]) => (
              <section key={heading}>
                <h4>{heading}</h4>
                <ul>
                  {points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </section>
            ))}
          </div>
          <div className="lp-modal-actions">
            <button className="lp-btn lp-btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (type === "start") {
    return (
      <div className="lp-modal-backdrop" role="dialog" aria-modal="true">
        <div className="lp-modal">
          <div className="lp-modal-head">
            <div>
              <h3>Start with guidance</h3>
              <p>Pick the path that matches the clarity and action support you need today.</p>
            </div>
            <button className="lp-icon-btn" onClick={onClose} aria-label="Close"><X className="lp-icon" /></button>
          </div>
          <div className="lp-flow-options">
            <button className="lp-flow-option" onClick={() => onNavigate("/register")}>
              <Rocket className="lp-icon" />
              <span><strong>Try Free</strong><span>1 guided survey, 50 responses, view forever.</span></span>
            </button>
            <button className="lp-flow-option" onClick={() => onNavigate("/register")}>
              <FileText className="lp-icon" />
              <span><strong>Run one validation</strong><span>₹1,999 one-time Pulse-guided study for cautious builders.</span></span>
            </button>
            <button className="lp-flow-option" onClick={() => onNavigate("/register")}>
              <Sparkles className="lp-icon" />
              <span><strong>Founding Member Pass</strong><span>₹4,999 lifetime Pulse Mentor access for the first 100.</span></span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-modal-backdrop" role="dialog" aria-modal="true">
      <div className="lp-modal">
        <div className="lp-modal-head">
          <div>
            <h3>{isLogin ? "Welcome back" : "Create your free account"}</h3>
            <p>{isLogin ? "Continue to your Pulse Mentor dashboard." : "Start with one guided survey and 50 responses."}</p>
          </div>
          <button className="lp-icon-btn" onClick={onClose} aria-label="Close"><X className="lp-icon" /></button>
        </div>
        <div className="lp-form">
          <input className="lp-input" placeholder="Email address" type="email" />
          <input className="lp-input" placeholder="Password" type="password" />
        </div>
        <div className="lp-modal-actions">
          <button className="lp-btn lp-btn-primary" onClick={() => onNavigate(isLogin ? "/login" : "/register")}>
            {isLogin ? "Login" : "Start Free"} <ArrowRight className="lp-icon-sm" />
          </button>
          <button className="lp-btn lp-btn-secondary" onClick={() => onNavigate(isSignup ? "/login" : "/register")}>
            {isSignup ? "I have an account" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandLogo() {
  return (
    <>
      <div className="lp-logo">
        <span className="lp-logo-parent">Axiora</span>
        <span className="lp-logo-product">Pulse</span>
        <div className="lp-logo-dot">
          <div className="sonar-ring" />
          <div className="sonar-ring" />
          <div className="sonar-ring" />
        </div>
      </div>
    </>
  );
}

function SocialIcon({ type }) {
  const paths = {
    linkedin: <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.23 0z" />,
    x: <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />,
    instagram: <path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85c.15-3.23 1.66-4.77 4.92-4.92 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" />,
    youtube: <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

export default function Landing() {
  const navigate = useNavigate();
  const { stopLoading } = useLoading();
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [pricingMode, setPricingMode] = useState("monthly");
  const [pricingWindowStart, setPricingWindowStart] = useState(1);
  const [openFaq, setOpenFaq] = useState(0);
  const [modal, setModal] = useState(null);

  useEffect(() => { stopLoading(); }, [stopLoading]);

  useEffect(() => {
    if (!document.getElementById("lp-gfonts")) {
      const link = document.createElement("link");
      link.id = "lp-gfonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,800;1,9..144,400&family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800;900&family=Syne:wght@500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
    let style = document.getElementById("lp-founder-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "lp-founder-styles";
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeadlineIndex((current) => (current + 1) % heroLines.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, []);

  const displayedPlans = useMemo(() => {
    if (pricingMode === "one-time") return [oneTimePlan, ...plans.filter((plan) => ["Starter", "Growth", "Enterprise"].includes(plan.name))];
    const monthlyOrder = ["Freemium", "Student", "Starter", "Growth", "Enterprise", "Professional"];
    const monthlyPlans = monthlyOrder.map((name) => plans.find((plan) => plan.name === name)).filter(Boolean);
    return monthlyPlans.slice(pricingWindowStart, pricingWindowStart + 4);
  }, [pricingMode, pricingWindowStart]);

  const go = (path) => {
    setModal(null);
    navigate(path);
  };

  const testimonial = testimonials[testimonialIndex];
  const activeActionPlan = heroActionPlans[headlineIndex];
  const movePricing = (direction) => {
    if (pricingMode === "one-time") return;
    setPricingWindowStart((current) => Math.max(0, Math.min(2, current + direction)));
  };

  return (
    <>
      <div className="lp">
        <nav className="lp-nav">
          <div className="lp-shell lp-nav-inner">
            <a className="lp-logo" href="#" onClick={(event) => event.preventDefault()}>
              {/* <BrandLogo /> */}
              <div className="lp-logo-wrapper">
                <div className="lp-logo">
                  <span className="lp-logo-parent">AXIORA</span>

                  <span className="lp-logo-product">Pulse</span>

                  <div className="lp-logo-dot">
                    <div className="sonar-ring"></div>
                    <div className="sonar-ring"></div>
                    <div className="sonar-ring"></div>
                  </div>
                </div>

                <div className="lp-logo-tagline">
                  Idea Validation | AI Mentorship | Smarter Decisions
                </div>
              </div>
            </a>
            <div className="lp-nav-links">
              <a href="#how">How it works</a>
              <a href="#analytics">Analytics</a>
              <a href="#reviews">Reviews</a>
              <a href="#templates">Templates</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="lp-nav-actions">
              <button className="lp-btn lp-btn-secondary" onClick={() => navigate("/login")}><LogIn className="lp-icon-sm" /> Login</button>
              <button className="lp-btn lp-btn-primary" onClick={() => setModal("start")}>Try Free <ArrowRight className="lp-icon-sm" /></button>
            </div>
          </div>
        </nav>

        <header className="lp-hero">
          <div className="lp-shell lp-hero-grid">
            <div>
              <div className="lp-eyebrow"><Sparkles className="lp-icon-sm" /> Know the Market. Get the Guidance. Build with Confidence.</div>
              <h1 className="lp-heading">{heroLines[headlineIndex].split(" ").slice(0, -3).join(" ")} <span>{heroLines[headlineIndex].split(" ").slice(-3).join(" ")}</span></h1>
              <p className="lp-hero-copy">Axiora Pulse acts as the Pulse mentor and decision-support system that guides users with idea validation, business clarity, customer insights, capital discipline, pre-traction strategy, investor readiness, and step-by-step action plans.</p>
              <div className="lp-hero-ctas">
                <button className="lp-btn lp-btn-primary" onClick={() => setModal("start")}>Start Free <ArrowRight className="lp-icon-sm" /></button>
                <button className="lp-btn lp-btn-secondary" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>View Pricing</button>
              </div>
              <div className="lp-hero-note">
                <span className="lp-note-pill"><Check className="lp-icon-sm" /> 50 responses free forever</span>
                <span className="lp-note-pill"><ShieldCheck className="lp-icon-sm" /> Confidential founder data</span>
              </div>
            </div>
            <div className="lp-proof-panel" aria-label="Example validation report">
              <div className="lp-proof-top">
                <div>
                  <div className="lp-proof-title">{activeActionPlan.title}</div>
                  <div className="lp-report-label">{activeActionPlan.idea}</div>
                </div>
                <span className="lp-live">Live</span>
              </div>
              <div className="lp-report-card">
                <div className="lp-report-row"><span className="lp-report-label">{activeActionPlan.signalLabel}</span><span className="lp-report-value">{activeActionPlan.signalValue}</span></div>
                <div className="lp-bar"><span style={{ width: activeActionPlan.signalWidth }} /></div>
                {activeActionPlan.rows.map(([label, value]) => (
                  <div className="lp-report-row" key={label}><span className="lp-report-label">{label}</span><span className="lp-report-value">{value}</span></div>
                ))}
              </div>
              <div className="lp-mini-grid">
                {activeActionPlan.stats.map(([value, label]) => (
                  <div className="lp-mini-stat" key={label}><strong>{value}</strong><span>{label}</span></div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <section className="lp-social">
          <div className="lp-shell lp-social-inner">
            <div className="lp-avatar-row">
              <div className="lp-avatars">
                {["AM", "NR", "KS", "PV"].map((name, index) => (
                  <div className="lp-avatar" key={name} style={{ background: ["#0052CC", "#FF9500", "#128A4A", "#7C3AED"][index] }}>{name}</div>
                ))}
              </div>
              <div className="lp-social-copy">Founder teams using Pulse to turn market signals into guidance, clarity, and disciplined action.</div>
            </div>
            <div className="lp-social-stat"><strong>7 days</strong><span>typical guidance cycle</span></div>
            <div className="lp-social-stat"><strong>50 free</strong><span>responses viewable forever</span></div>
            <div className="lp-social-stat"><strong>₹1,999</strong><span>one-time validation option</span></div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><Sparkles className="lp-icon-sm" /> Clarity. Confidence. Conquer.</div>
                <h2 className="lp-heading lp-section-title">The symbols behind every guided decision.</h2>
              </div>
              <p className="lp-section-copy">Pulse is not only a survey layer. It is a decision support layer for founders who need signal, judgment, and action.</p>
            </div>
            <div className="lp-symbol-grid">
              {symbols.map(([title, copy, Icon]) => (
                <div className="lp-symbol" key={title}>
                  <div className="lp-symbol-icon"><Icon className="lp-icon" /></div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><Rocket className="lp-icon-sm" /> How it works</div>
                <h2 className="lp-heading lp-section-title">From idea to guided action in four steps.</h2>
              </div>
              <p className="lp-section-copy">No research jargon. Pulse helps founders understand the market, sharpen the business, control spend, and move with confidence.</p>
            </div>
            <div className="lp-steps-grid">
              {[
                ["Choose the clarity path", "Start with idea validation, business clarity, customer insight, or investor readiness."],
                ["Let the Pulse Mentor guide", "Use founder-friendly prompts that turn uncertainty into structured learning."],
                ["Read the market pulse", "Collect customer signals and see where demand, doubt, and willingness to pay appear."],
                ["Follow the action plan", "Move with recommended next steps for traction, capital discipline, and investor prep."],
              ].map(([title, copy], index) => (
                <div className="lp-step" key={title}>
                  <div className="lp-step-num">{index + 1}</div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-analytics" id="analytics">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><PieChart className="lp-icon-sm" /> Mentor analytics</div>
                <h2 className="lp-heading lp-section-title">See the market signal, then see the action.</h2>
              </div>
              <p className="lp-section-copy">The analytics layer turns customer responses into readiness scores, pricing signal, objections, capital risk, and founder next steps.</p>
            </div>
            <div className="lp-analytics-board">
              <div className="lp-analytics-top">
                <div>
                  <div className="lp-analytics-title">Founder Decision Dashboard</div>
                  <div className="lp-analytics-sub">Market signal | buyer demand | pricing pulse | investor readiness</div>
                </div>
                <div className="lp-analytics-pill"><TrendingUp className="lp-icon-sm" /> Live signal improving</div>
              </div>
              <div className="lp-analytics-grid">
                {analyticsKpis.map(([label, value, delta]) => (
                  <div className="lp-analytics-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <em>{delta}</em>
                  </div>
                ))}
              </div>
              <div className="lp-analytics-lower">
                <div className="lp-chart-panel">
                  <div className="lp-chart-head">
                    <div className="lp-chart-title">Demand signal over 7-day validation sprint</div>
                    <div className="lp-chart-note">Simple read: higher bars mean more people understand the problem and want the solution.</div>
                  </div>
                  <div className="lp-chart-stage">
                    <div className="lp-axis-y"><span>High</span><span>Med</span><span>Low</span></div>
                    <div className="lp-chart-bars">
                      {demandTrend.map(([label, height]) => (
                        <div className="lp-bar-wrap" key={label} style={{ "--h": `${height}%` }}>
                          <div className="lp-bar-value">{height}%</div>
                          <div className="lp-chart-bar" style={{ height: `${height}%` }} />
                          <div className="lp-bar-label">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="lp-side-stack">
                  <div className="lp-recommend-panel">
                    <div className="lp-chart-title">Pulse Mentor recommendations</div>
                    <div className="lp-recommend-list">
                      {[
                        ["Start here", "Interview the highest-intent segment before adding features."],
                        ["Protect cash", "Test pricing before committing to inventory or paid ads."],
                        ["Pitch better", "Add customer evidence to the investor-readiness summary."],
                      ].map(([title, item]) => (
                        <div className="lp-recommend-item" key={title}>
                          <Check className="lp-icon-sm" />
                          <div><strong>{title}</strong><span>{item}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lp-ring-panel">
                    <div className="lp-chart-title">Readiness rings</div>
                    <div className="lp-ring-row">
                      {readinessRings.map(([label, score]) => (
                        <div className="lp-ring" key={label}>
                          <div className="lp-ring-visual">
                            <svg viewBox="0 0 100 100">
                              <circle className="lp-ring-bg" cx="50" cy="50" r="35" fill="none" strokeWidth="12" />
                              <circle className="lp-ring-fg" cx="50" cy="50" r="35" fill="none" strokeWidth="12" style={{ "--score": score }} />
                            </svg>
                            <strong>{score}</strong>
                          </div>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="lp-analytics-bottom">
                <div className="lp-funnel-panel">
                  <div className="lp-chart-title">Validation funnel</div>
                  <div className="lp-funnel">
                    {validationFunnel.map(([label, value, width]) => (
                      <div className="lp-funnel-row" key={label} style={{ "--w": width }}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lp-segment-panel">
                  <div className="lp-chart-title">Customer segment pull</div>
                  <div className="lp-segment-list">
                    {segmentSignals.map(([label, width, color]) => (
                      <div className="lp-segment-row" key={label}>
                        <span>{label}</span>
                        <div className="lp-segment-track"><div className="lp-segment-fill" style={{ "--w": width, "--c": color }} /></div>
                        <strong>{width}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lp-money-panel">
                  <div className="lp-chart-title">Capital discipline radar</div>
                  <div className="lp-money-grid">
                    {capitalSignals.map(([label, width, color]) => (
                      <div className="lp-money-row" key={label}>
                        <span>{label}</span>
                        <div className="lp-money-track"><div className="lp-money-fill" style={{ "--w": width, background: color }} /></div>
                        <strong>{width}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="lp-analytics-bottom lp-decision-row">
                <div className="lp-plain-panel">
                  <div className="lp-chart-title">Plain-English decision cards</div>
                  <div className="lp-plain-grid">
                    {decisionCards.map(([title, copy]) => (
                      <div className="lp-plain-card" key={title}>
                        <strong>{title}</strong>
                        <span>{copy}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-testimonials">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><MessageSquare className="lp-icon-sm" /> Founder stories</div>
                <h2 className="lp-heading lp-section-title">Guidance founders can use in the next meeting.</h2>
              </div>
              <p className="lp-section-copy">Three early-stage stories, each focused on a decision that became clearer through Pulse Mentor guidance and customer insight.</p>
            </div>
            <div className="lp-testimonial-wrap">
              <button className="lp-carousel-btn" aria-label="Previous testimonial" onClick={() => setTestimonialIndex((testimonialIndex + testimonials.length - 1) % testimonials.length)}><ArrowRight className="lp-icon" style={{ transform: "rotate(180deg)" }} /></button>
              <div className="lp-testimonial-card">
                <div>
                  <p className="lp-testimonial-quote">"{testimonial.quote}"</p>
                  <div className="lp-founder">
                    <div className="lp-founder-avatar" style={{ background: testimonial.color }}>{testimonial.initials}</div>
                    <div>
                      <div className="lp-founder-name">{testimonial.name}</div>
                      <div className="lp-founder-role">{testimonial.role}</div>
                    </div>
                  </div>
                </div>
                <div className="lp-result-box">
                  <strong>{testimonial.result}</strong>
                  <span>{testimonial.resultText}</span>
                </div>
              </div>
              <button className="lp-carousel-btn" aria-label="Next testimonial" onClick={() => setTestimonialIndex((testimonialIndex + 1) % testimonials.length)}><ArrowRight className="lp-icon" /></button>
            </div>
          </div>
        </section>

        <section className="lp-section" id="reviews">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><Star className="lp-icon-sm" /> Reviews</div>
                <h2 className="lp-heading lp-section-title">Founders rate Pulse for clarity, not noise.</h2>
              </div>
              <p className="lp-section-copy">Reviews focus on whether Pulse helped founders make better decisions: what to validate, what to pause, and what to do next.</p>
            </div>
            <div className="lp-reviews-grid">
              {reviews.map(([quote, name, role, initials]) => (
                <div className="lp-review-card" key={name}>
                  <div className="lp-stars" aria-label="5 star review">
                    {[0, 1, 2, 3, 4].map((star) => <Star className="lp-icon-sm" fill="currentColor" key={star} />)}
                  </div>
                  <p>"{quote}"</p>
                  <div className="lp-review-meta">
                    <div className="lp-review-avatar">{initials}</div>
                    <div>
                      <div className="lp-review-name">{name}</div>
                      <div className="lp-review-role">{role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><Trophy className="lp-icon-sm" /> Success stories</div>
                <h2 className="lp-heading lp-section-title">Small decisions that protected time, money, and momentum.</h2>
              </div>
              <p className="lp-section-copy">Success is not only funding. For early founders, success often means avoiding the wrong spend and finding the next right test.</p>
            </div>
            <div className="lp-success-grid">
              {successStories.map((story) => (
                <div className="lp-success-card" key={story.title}>
                  <div className="lp-success-band">{story.label}</div>
                  <div className="lp-success-body">
                    <h3>{story.title}</h3>
                    <p>{story.copy}</p>
                    <div className="lp-success-metrics">
                      {story.metrics.map(([value, label]) => (
                        <div className="lp-success-metric" key={label}>
                          <strong>{value}</strong>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="templates">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><Search className="lp-icon-sm" /> Templates</div>
                <h2 className="lp-heading lp-section-title">Six guided playbooks for founder decisions.</h2>
              </div>
              <p className="lp-section-copy">Each playbook starts with an outcome: validate the idea, clarify the business, protect capital, or prepare for investors.</p>
            </div>
            <div className="lp-template-grid">
              {templates.map(([title, copy, Icon]) => (
                <div className="lp-template" key={title}>
                  <div className="lp-template-icon"><Icon className="lp-icon" /></div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <button className="lp-btn lp-btn-secondary" onClick={() => setModal("start")}>Use template</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-pricing" id="pricing">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><Lock className="lp-icon-sm" /> Pricing</div>
                <h2 className="lp-heading lp-section-title">Start free. Pay when guidance accelerates action.</h2>
              </div>
              <div className="lp-pricing-toggle" aria-label="Pricing mode">
                <button className={pricingMode === "monthly" ? "active" : ""} onClick={() => { setPricingMode("monthly"); setPricingWindowStart(1); }}>Monthly</button>
                <button className={pricingMode === "one-time" ? "active" : ""} onClick={() => setPricingMode("one-time")}>One-time</button>
              </div>
            </div>
            <div className="lp-pricing-stage">
              <button className="lp-rate-nav" aria-label="Previous plans" onClick={() => movePricing(-1)} disabled={pricingMode === "one-time" || pricingWindowStart === 0}>
                <ArrowRight className="lp-icon" style={{ transform: "rotate(180deg)" }} />
              </button>
              <div>
                <div className="lp-plan-strip">
                  {displayedPlans.map((plan) => (
                    <div className={`lp-price-card${plan.featured ? " featured" : ""}${plan.dark ? " dark" : ""}`} key={plan.name}>
                      {plan.badge && <div className="lp-price-badge">{plan.badge}</div>}
                      <div className="lp-price-name">{plan.name}</div>
                      <div className="lp-price-amount">
                        {plan.offerPrice !== plan.price && <span className="lp-price-original">{plan.price}</span>}
                        <strong>{plan.offerPrice}</strong>
                        <span>/ {plan.period}</span>
                      </div>
                      {plan.offerPrice !== plan.price && <div className="lp-price-offer">50% off for a limited period</div>}
                      <p className="lp-price-desc">{plan.desc}</p>
                      <ul className="lp-price-list">
                        {plan.features.map((feature) => (
                          <li key={feature}><Check className="lp-icon-sm" /> {feature}</li>
                        ))}
                      </ul>
                      <button className={`lp-btn ${plan.dark ? "lp-btn-primary" : "lp-btn-secondary"}`} onClick={() => setModal("start")}>{plan.cta}</button>
                    </div>
                  ))}
                </div>
                <div className="lp-rate-progress" aria-hidden="true">
                  {[0, 1, 2].map((index) => (
                    <button className={`lp-rate-dot${pricingMode === "monthly" && index === pricingWindowStart ? " active" : ""}`} key={index} onClick={() => { setPricingMode("monthly"); setPricingWindowStart(index); }} />
                  ))}
                </div>
              </div>
              <button className="lp-rate-nav" aria-label="Next plans" onClick={() => movePricing(1)} disabled={pricingMode === "one-time" || pricingWindowStart === 2}>
                <ArrowRight className="lp-icon" />
              </button>
            </div>
          </div>
        </section>

        <section className="lp-section" id="faq">
          <div className="lp-shell">
            <div className="lp-section-head">
              <div>
                <div className="lp-eyebrow"><ChevronDown className="lp-icon-sm" /> FAQ</div>
                <h2 className="lp-heading lp-section-title">Founder questions, clear guidance.</h2>
              </div>
              <p className="lp-section-copy">The shortest path from "what should I do next?" to a market-informed action plan.</p>
            </div>
            <div className="lp-faq-grid">
              {faqs.map(([question, answer], index) => (
                <div className="lp-faq-item" key={question}>
                  <button className="lp-faq-q" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                    {question}
                    <ChevronDown className="lp-icon-sm" style={{ transform: openFaq === index ? "rotate(180deg)" : "none" }} />
                  </button>
                  {openFaq === index && <div className="lp-faq-a">{answer}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="lp-footer">
          <div className="lp-shell">
            <div className="lp-footer-grid">
              <div>
                <div className="lp-logo-wrapper">
                  <div className="lp-logo">
                    <span className="lp-logo-parent">AXIORA</span>

                    <span className="lp-logo-product">Pulse</span>

                    <span className="lp-logo-dot">
                      <span className="sonar-ring"></span>
                      <span className="sonar-ring"></span>
                      <span className="sonar-ring"></span>
                    </span>
                  </div>

                  <div className="lp-logo-tagline">
                    Idea Validation | AI Mentorship | Smarter Decisions
                  </div>
                </div>
                <p>Know the Market. Get the Guidance. Build with Confidence.</p>
                <div className="lp-social-links" aria-label="Axiora Pulse social links">
                  <a href="https://www.linkedin.com/company/axiora-pulse/" className="lp-social-link" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><SocialIcon type="linkedin" /></a>
                  <a href="https://x.com/AxioraPulse" className="lp-social-link" target="_blank" rel="noopener noreferrer" aria-label="X"><SocialIcon type="x" /></a>
                  <a href="https://www.instagram.com/axiora_pulse/" className="lp-social-link" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><SocialIcon type="instagram" /></a>
                  <a href="https://www.youtube.com/@AxioraPulse" className="lp-social-link" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><SocialIcon type="youtube" /></a>
                </div>
              </div>
              <div>
                <h4>Product</h4>
                <ul>
                  <li><a href="#analytics">Mentor analytics</a></li>
                  <li><a href="#templates">Guided playbooks</a></li>
                  <li><a href="#pricing">Pricing</a></li>
                  <li><a href="#faq">Investor readiness</a></li>
                </ul>
              </div>
              <div>
                <h4>Company</h4>
                <ul>
                  <li><a href="mailto:hello@axioralabs.com?subject=Axiora Pulse Enquiry">Contact</a></li>
                  <li><a href="#reviews">Founder reviews</a></li>
                  <li><a href="#analytics">Decision support</a></li>
                  <li><a href="#templates">Validation templates</a></li>
                </ul>
              </div>
              <div>
                <h4>Legal</h4>
                <ul>
                  <li><button className="lp-footer-link" onClick={() => setModal("legal:privacy")}>Privacy Notice</button></li>
                  <li><button className="lp-footer-link" onClick={() => setModal("legal:terms")}>Terms and Conditions</button></li>
                  <li><button className="lp-footer-link" onClick={() => setModal("legal:security")}>Security Statement</button></li>
                  <li><button className="lp-footer-link" onClick={() => setModal("legal:data")}>Data Policy</button></li>
                </ul>
              </div>
            </div>
            <div className="lp-footer-bottom">
              <span>© 2026 Axiora Pulse. Built for founders seeking clarity, confidence, and disciplined action.</span>
              <span>Hyderabad, India</span>
            </div>
          </div>
        </footer>

        {modal && <Modal type={modal} onClose={() => setModal(null)} onNavigate={go} />}
      </div>
      <style>{`@media (max-width: 640px) {

  /* Brand */
  .lp-brand-axiora{
    font-size:9px;
    letter-spacing:.35em;
  }

  .lp-brand-pulse{
   font-family: "Playfair Display", serif;
  font-size: 28px;
  font-weight: 900;
  }

  /* Hero */
  .lp-hero h1{
    font-family:"Playfair Display", serif;
    font-size:42px;
    line-height:1.08;
    letter-spacing:-1px;
  }

  .lp-hero-copy{
    font-family:"Fraunces", serif;
    font-size:18px;
    line-height:1.75;
  }

  /* Buttons */
  .lp-btn{
    font-family:"Syne", sans-serif;
    font-size:14px;
    font-weight:800;
  }

  /* Section Headings */
  .lp-section-title{
    font-family:"Playfair Display", serif;
    font-size:34px;
    line-height:1.15;
  }

  .lp-section-copy{
     font-family: "Fraunces", serif;
  font-size: 17px;
  line-height: 1.75;
  }

  .lp-eyebrow{
    font-family:"Syne", sans-serif;
    font-size:12px;
    font-weight:800;
  }

  /* Cards */
  .lp-step h3,
  .lp-template h3,
  .lp-symbol h3{
    font-size:20px;
    font-weight:800;
  }

  .lp-step p,
  .lp-template p,
  .lp-symbol p{
    font-size:14px;
    line-height:1.7;
  }

  /* Analytics */
  .lp-analytics-title{
    font-size:18px;
  }

  .lp-analytics-kpi strong{
    font-family:"Playfair Display", serif;
    font-size:30px;
  }

  .lp-analytics-kpi span{
    font-size:10px;
  }

  /* Testimonials */
  .lp-testimonial-quote{
    font-family:"Playfair Display", serif;
    font-size:26px;
    line-height:1.35;
  }

  .lp-founder-name{
    font-size:15px;
  }

  .lp-founder-role{
    font-size:12px;
  }

  /* Reviews */
  .lp-review-card p{
    font-family:"Playfair Display", serif;
    font-size:22px;
    line-height:1.5;
  }

  /* Success Cards */
  .lp-success-body h3{
    font-size:18px;
  }

  .lp-success-body p{
    font-size:14px;
  }

  /* Pricing */
  .lp-price-name{
    font-size:22px;
  }

  .lp-price-amount strong{
    font-family:"Playfair Display", serif;
    font-size:44px;
  }

  .lp-price-desc,
  .lp-price-list li{
    font-size:14px;
  }

  /* FAQ */
  .lp-faq-q{
    font-size:15px;
    font-weight:800;
  }

  .lp-faq-a{
    font-size:14px;
    line-height:1.7;
  }

  /* Footer */
  .lp-footer h4{
    font-size:11px;
  }

  .lp-footer a,
  .lp-footer-link,
  .lp-footer p{
    font-size:14px;
  }

  .lp-footer-bottom{
    font-size:12px;
  }
    .lp-footer .lp-logo-tagline{
  color: var(--pulse-orange);
}
  /* Footer tagline */
.lp-footer .lp-logo-tagline{
  margin-top:6px;
  margin-left:1px;
  font-size:11px;
  font-weight:700;
  font-family:'Playfair Display', serif;
  white-space:nowrap;
  line-height:1.2;
  color: var(--pulse-orange);
}

  /* Existing Layout Rules */
  .lp-shell { width: min(100% - 32px, 1184px); }
  .lp-nav-inner { height: 64px; }
  .lp-nav-actions .lp-btn-secondary { display: none; }
  .lp-hero-ctas .lp-btn { width: 100%; }
  .lp-proof-panel { padding: 16px; }
  .lp-mini-grid { grid-template-columns: 1fr; }
  .lp-testimonial-wrap { grid-template-columns: 1fr; }
  .lp-carousel-btn { display: none; }
  .lp-rate-nav { display: none; }
  .lp-footer-bottom { flex-direction: column; }
  .lp-analytics-board { padding: 14px; }
  .lp-analytics-top { align-items: flex-start; flex-direction: column; }
  .lp-chart-head { flex-direction: column; }
  .lp-chart-stage { grid-template-columns: 1fr; min-height: 190px; }
  .lp-axis-y { display: none; }
  .lp-chart-bars { min-height: 156px; gap: 6px; }
  .lp-bar-label,
  .lp-bar-value { font-size: 10px; }
  .lp-ring-row { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .lp-ring svg { width: 76px; height: 76px; }
  .lp-ring strong { font-size: 20px; }
  .lp-plain-grid { grid-template-columns: 1fr; }
  .lp-segment-row { grid-template-columns: 86px 1fr 42px; font-size: 12px; }
  .lp-money-row { grid-template-columns: 76px 1fr 42px; font-size: 12px; }
}`}</style>
    </>
  );
}