import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLoading } from "../context/LoadingContext";

/* ─────────────────────────────────────────────────────────────────
   LANDING PAGE — Axiora Pulse
   Faithful React port of pulse-v10.html
   All CSS is injected via <style> so Tailwind does not interfere.
───────────────────────────────────────────────────────────────── */

const CSS = `
:root {
  --coral: #FF4500;
  --coral-bright: #FF6B35;
  --saffron: #FFB800;
  --saffron-light: #FFD166;
  --terracotta: #D63B1F;
  --cream: #FDF5E8;
  --cream-deep: #F7EDD8;
  --espresso: #160F08;
  --espresso-mid: #2C1A0E;
  --blush: #FADDCA;
  --sage: #1E7A4A;
  --cobalt: #0047FF;
  --electric: #00D4FF;
  --lime: #C8F54A;
  --warm-white: #FFFBF4;
  --card-bg: #FFFFFF;
}

/* ─── RESET FOR LANDING ─── */
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp { background: var(--cream); color: var(--espresso); font-family: 'Fraunces', serif; overflow-x: hidden; }

/* ─── SCROLLBAR ─── */
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: var(--cream); }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--coral), var(--saffron)); border-radius: 10px; }
::selection { background: var(--coral); color: #fff; }

/* ─── NAV ─── */
.lp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  padding: 28px 72px;
  display: flex; align-items: center; justify-content: space-between;
  transition: all .4s ease;
}
.lp-nav.stuck {
  background: rgba(253,245,232,.94); backdrop-filter: blur(24px);
  padding: 16px 72px; box-shadow: 0 1px 0 rgba(22,15,8,.06);
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
.lp-nav-links { display: flex; align-items: center; gap: 40px; list-style: none; margin: 0; padding: 0; }
.lp-nav-links a {
  font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase; color: var(--espresso);
  text-decoration: none; opacity: .55; transition: opacity .2s;
}
.lp-nav-links a:hover { opacity: 1; }
.lp-nav-pill {
  background: var(--espresso) !important; color: var(--cream) !important;
  opacity: 1 !important; padding: 12px 28px; border-radius: 100px;
}
.lp-nav-pill:hover { background: var(--coral) !important; transform: translateY(-1px); }
.lp-nav-btn {
  font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase;
  background: var(--espresso); color: var(--cream);
  border: none; padding: 12px 28px; border-radius: 100px;
  cursor: pointer; transition: background .3s ease, transform .2s ease;
}
.lp-nav-btn:hover { background: var(--coral); transform: translateY(-1px); }
.lp-nav-burger { display: none; }

/* ─── HERO ─── */
#lp-hero {
  min-height: 100vh; position: relative;
  display: flex; flex-direction: column; justify-content: center;
  overflow: hidden; background: var(--warm-white); padding-bottom: 100px;
}
.lp-mesh { position: absolute; inset: 0; z-index: 0; }
.lp-mb { position: absolute; border-radius: 50%; filter: blur(90px); animation: lpDrift 14s ease-in-out infinite; }
.lp-mb1 { width: 900px; height: 900px; background: radial-gradient(circle,rgba(255,69,0,.45),rgba(255,184,0,.2),transparent 70%); top: -300px; right: -200px; animation-delay: 0s; }
.lp-mb2 { width: 600px; height: 600px; background: radial-gradient(circle,rgba(255,107,53,.35),rgba(242,213,194,.5),transparent 70%); bottom: -150px; left: 100px; animation-delay: -5s; }
.lp-mb3 { width: 500px; height: 500px; background: radial-gradient(circle,rgba(255,184,0,.3),rgba(255,69,0,.15),transparent 70%); top: 40%; left: 35%; animation-delay: -9s; }
.lp-mb4 { width: 350px; height: 350px; background: radial-gradient(circle,rgba(0,71,255,.12),rgba(0,212,255,.08),transparent 70%); top: 20%; left: 10%; animation-delay: -3s; }
@keyframes lpDrift {
  0%,100% { transform: translate(0,0) scale(1); }
  33% { transform: translate(40px,-50px) scale(1.07); }
  66% { transform: translate(-25px,30px) scale(.95); }
}
.lp-grain {
  position: absolute; inset: 0; z-index: 1; opacity: .035; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 250px;
}
.lp-ghost {
  position: absolute; pointer-events: none; user-select: none;
  font-family: 'Playfair Display', serif; font-weight: 900;
  color: transparent; letter-spacing: -5px; line-height: 1;
}
.lp-ghost-h {
  font-size: clamp(160px,18vw,260px);
  -webkit-text-stroke: 1px rgba(255,69,0,.055);
  bottom: -50px; left: -20px; z-index: 1;
}
.lp-hero-wrap {
  position: relative; z-index: 2; max-width: 1360px; margin: 0 auto; width: 100%;
  padding: 160px 72px 0;
  display: grid; grid-template-columns: 1fr 480px; gap: 60px; align-items: center;
}
.lp-h-tag {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700;
  letter-spacing: .16em; text-transform: uppercase; color: var(--coral);
  margin-bottom: 36px; opacity: 0; animation: lpRiseUp .7s ease forwards .3s;
}
.lp-h-tag-line { width: 30px; height: 1.5px; background: var(--coral); }
.lp-h-head {
  font-family: 'Playfair Display', serif;
  font-size: clamp(58px,6.5vw,96px);
  font-weight: 900; line-height: .97; letter-spacing: -3px;
  color: var(--espresso); margin-bottom: 36px;
}
.lp-h-head em { font-style: italic; color: var(--coral); position: relative; display: inline-block; }
.lp-h-head em::after {
  content: ''; position: absolute; bottom: -4px; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg,var(--coral),var(--saffron)); border-radius: 2px;
  transform: scaleX(0); transform-origin: left;
  animation: lpUnderline 1s ease forwards 1.8s;
}
@keyframes lpUnderline { to { transform: scaleX(1); } }
.lp-hline { overflow: hidden; display: block; line-height: 1.05; }
.lp-h-word { display: inline-block; opacity: 0; transform: translateY(110%); animation: lpWordUp .8s cubic-bezier(.16,1,.3,1) forwards; }
.lp-hw1 { animation-delay: .5s; } .lp-hw2 { animation-delay: .65s; } .lp-hw3 { animation-delay: .75s; }
.lp-hw4 { animation-delay: .85s; } .lp-hw5 { animation-delay: 1s; }  .lp-hw6 { animation-delay: 1.1s; }
@keyframes lpWordUp { to { opacity: 1; transform: translateY(0); } }
.lp-h-sub {
  font-family: 'Fraunces', serif; font-size: 20px; font-weight: 300;
  line-height: 1.72; color: var(--espresso);
  max-width: 520px; margin-bottom: 52px;
  opacity: 0; animation: lpFadeIn .9s ease forwards 1.4s;
}
@keyframes lpFadeIn { to { opacity: .68; } }
.lp-h-ctas { display: flex; align-items: center; gap: 24px; opacity: 0; animation: lpRiseUp .8s ease forwards 1.6s; }
@keyframes lpRiseUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

/* Buttons */
.lp-btn-fire {
  display: inline-flex; align-items: center; gap: 14px;
  background: var(--coral); color: #fff;
  font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700;
  letter-spacing: .06em; padding: 20px 40px; border-radius: 100px;
  text-decoration: none; border: none; position: relative; overflow: hidden; cursor: pointer;
  transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease;
}
.lp-btn-fire::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg,var(--saffron),var(--coral-bright));
  opacity: 0; transition: opacity .4s ease; border-radius: 100px;
}
.lp-btn-fire:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 24px 48px rgba(255,69,0,.35); }
.lp-btn-fire:hover::before { opacity: 1; }
.lp-btn-fire span, .lp-btn-fire-arr { position: relative; z-index: 1; }
.lp-btn-fire-arr {
  width: 22px; height: 22px; border: 1.5px solid rgba(255,255,255,.5); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 1; transition: transform .3s ease;
}
.lp-btn-fire:hover .lp-btn-fire-arr { transform: rotate(45deg); }
.lp-btn-outline {
  display: inline-flex; align-items: center; gap: 12px;
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
  letter-spacing: .06em; color: var(--espresso); text-decoration: none;
  opacity: .6; transition: opacity .2s ease; background: none; border: none; cursor: pointer;
}
.lp-btn-outline:hover { opacity: 1; }
.lp-play-ring {
  width: 46px; height: 46px; border: 1.5px solid rgba(22,15,8,.2); border-radius: 50%;
  display: flex; align-items: center; justify-content: center; transition: all .3s ease;
}
.lp-btn-outline:hover .lp-play-ring { border-color: var(--coral); background: var(--coral); }
.lp-btn-outline:hover .lp-play-ring svg { stroke: #fff; }

/* Hero cards */
.lp-hero-cards {
  position: relative; height: 560px;
  opacity: 0; animation: lpRiseUp 1s ease forwards 1.9s;
}
.lp-hcard {
  position: absolute; background: #fff; border-radius: 22px;
  box-shadow: 0 12px 48px rgba(22,15,8,.09), 0 2px 8px rgba(22,15,8,.04);
  overflow: hidden;
}
.lp-hcard::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg,var(--coral),var(--saffron));
}
.lp-hcard:nth-child(1) { width: 280px; top: 0; left: 0; padding: 28px; animation: hcFloat 7s ease-in-out infinite 0s; }
.lp-hcard:nth-child(2) { width: 220px; top: 100px; right: 0; padding: 24px; animation: hcFloat 7s ease-in-out infinite -2.3s; }
.lp-hcard:nth-child(3) { width: 260px; bottom: 100px; left: 10px; padding: 26px; animation: hcFloat 7s ease-in-out infinite -4.5s; }
.lp-hcard:nth-child(4) { width: 190px; bottom: 20px; right: 10px; padding: 22px; animation: hcFloat 7s ease-in-out infinite -1.5s; }
@keyframes hcFloat { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-16px) rotate(.5deg); } }
.lp-hc-label { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--coral); margin-bottom: 12px; }
.lp-hc-big { font-family: 'Playfair Display', serif; font-size: 44px; font-weight: 900; color: var(--espresso); line-height: 1; margin-bottom: 6px; }
.lp-hc-sub { font-family: 'Fraunces', serif; font-size: 12px; font-weight: 300; color: var(--espresso); opacity: .55; line-height: 1.5; }
.lp-gbar { height: 6px; background: var(--blush); border-radius: 10px; margin-top: 16px; overflow: hidden; }
.lp-gbar-fill { height: 100%; border-radius: 10px; background: linear-gradient(90deg,var(--coral),var(--saffron),var(--lime)); animation: fillPulse 3s ease-in-out infinite alternate; width: 84%; }
@keyframes fillPulse { from { width: 42%; } to { width: 86%; } }
.lp-edots { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.lp-edot { display: flex; align-items: center; gap: 9px; }
.lp-edot-pip { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; animation: pipFade 3s ease-in-out infinite; }
.lp-edot:nth-child(1) .lp-edot-pip { background: var(--coral); animation-delay: 0s; }
.lp-edot:nth-child(2) .lp-edot-pip { background: var(--saffron); animation-delay: .4s; }
.lp-edot:nth-child(3) .lp-edot-pip { background: var(--sage); animation-delay: .8s; }
.lp-edot:nth-child(4) .lp-edot-pip { background: var(--cobalt); animation-delay: 1.2s; }
.lp-edot:nth-child(5) .lp-edot-pip { background: var(--espresso-mid); animation-delay: 1.6s; }
@keyframes pipFade { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
.lp-edot-bar-track { flex: 1; height: 3px; background: var(--blush); border-radius: 4px; overflow: hidden; }
.lp-edot-bar-fill { height: 100%; border-radius: 4px; animation: edotAnim 3s ease-in-out infinite alternate; }
.lp-edot:nth-child(1) .lp-edot-bar-fill { background: var(--coral); width: 72%; animation-delay: 0s; }
.lp-edot:nth-child(2) .lp-edot-bar-fill { background: var(--saffron); width: 54%; animation-delay: .3s; }
.lp-edot:nth-child(3) .lp-edot-bar-fill { background: var(--sage); width: 40%; animation-delay: .6s; }
.lp-edot:nth-child(4) .lp-edot-bar-fill { background: var(--cobalt); width: 28%; animation-delay: .9s; }
.lp-edot:nth-child(5) .lp-edot-bar-fill { background: var(--espresso-mid); width: 18%; animation-delay: 1.2s; }
@keyframes edotAnim { from { opacity: .7; } to { opacity: 1; } }
.lp-edot-lbl { font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--espresso); opacity: .45; white-space: nowrap; min-width: 54px; }
.lp-sparkline { display: flex; align-items: flex-end; gap: 3px; height: 44px; margin-top: 14px; }
.lp-sp { flex: 1; border-radius: 3px 3px 0 0; background: var(--blush); animation: spGrow 3s ease-in-out infinite alternate; }
.lp-sp:nth-child(1) { height: 35%; }
.lp-sp:nth-child(2) { height: 65%; background: var(--coral-bright); animation-delay: .15s; }
.lp-sp:nth-child(3) { height: 50%; animation-delay: .3s; }
.lp-sp:nth-child(4) { height: 90%; background: var(--coral); animation-delay: .45s; }
.lp-sp:nth-child(5) { height: 42%; animation-delay: .6s; }
.lp-sp:nth-child(6) { height: 78%; background: var(--saffron); animation-delay: .75s; }
.lp-sp:nth-child(7) { height: 55%; animation-delay: .9s; }
.lp-sp:nth-child(8) { height: 88%; background: var(--coral); animation-delay: 1.05s; }
@keyframes spGrow { from { transform: scaleY(.75); } to { transform: scaleY(1); } }
.lp-trend { display: inline-flex; align-items: center; gap: 6px; background: rgba(30,122,74,.12); color: var(--sage); font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 100px; margin-top: 12px; }
.lp-scroll-cue { position: absolute; bottom: 44px; left: 72px; z-index: 3; display: flex; align-items: center; gap: 16px; opacity: 0; animation: lpRiseUp .8s ease forwards 2.4s; }
.lp-sc-line { width: 44px; height: 1px; background: var(--espresso); opacity: .2; overflow: hidden; position: relative; }
.lp-sc-line::after { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: var(--coral); animation: lpScan 2.2s ease-in-out infinite; }
@keyframes lpScan { to { left: 100%; } }
.lp-sc-txt { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--espresso); opacity: .35; }
.lp-ticker-bar { position: absolute; bottom: 0; left: 0; right: 0; z-index: 3; background: var(--espresso); padding: 0 72px; display: flex; align-items: center; overflow: hidden; height: 52px; border-top: 1px solid rgba(253,245,232,.06); }
.lp-ticker-lbl { font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: rgba(253,245,232,.25); white-space: nowrap; flex-shrink: 0; padding-right: 40px; border-right: 1px solid rgba(253,245,232,.1); margin-right: 40px; }
.lp-ticker-overflow { overflow: hidden; flex: 1; }
.lp-ticker-track { display: flex; animation: ticker 28s linear infinite; white-space: nowrap; }
@keyframes ticker { to { transform: translateX(-50%); } }
.lp-ticker-item { font-family: 'Playfair Display', serif; font-size: 13px; font-style: italic; color: rgba(253,245,232,.28); white-space: nowrap; padding: 0 36px; display: inline-flex; align-items: center; position: relative; }
.lp-ticker-item::after { content: '·'; position: absolute; right: 0; color: rgba(255,69,0,.3); font-style: normal; font-family: 'Syne', sans-serif; font-size: 16px; }

/* ─── HOW IT WORKS ─── */
#lp-how { background: var(--cream); padding: 160px 72px; position: relative; overflow: hidden; }
#lp-how .lp-ghost { font-size: clamp(120px,14vw,220px); -webkit-text-stroke: 1px rgba(255,69,0,.04); top: -40px; right: -30px; z-index: 0; letter-spacing: -3px; }
.lp-sec-head { max-width: 1216px; margin: 0 auto 100px; display: flex; align-items: flex-end; justify-content: space-between; position: relative; z-index: 1; }
.lp-sec-tag { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--coral); display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.lp-sec-tag::before { content: ''; width: 28px; height: 1.5px; background: var(--coral); }
.lp-sec-title { font-family: 'Playfair Display', serif; font-size: clamp(40px,4.8vw,68px); font-weight: 900; line-height: 1.02; letter-spacing: -2px; color: var(--espresso); max-width: 580px; }
.lp-sec-title em { font-style: italic; color: var(--coral); }
.lp-sec-aside { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 300; line-height: 1.72; color: var(--espresso); opacity: .55; max-width: 320px; text-align: right; }
.lp-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 3px; max-width: 1216px; margin: 0 auto; position: relative; z-index: 1; }
.lp-step { background: var(--warm-white); padding: 64px 52px; position: relative; overflow: hidden; transition: transform .5s cubic-bezier(.34,1.56,.64,1); cursor: default; }
.lp-step:first-child { border-radius: 28px 0 0 28px; }
.lp-step:last-child { border-radius: 0 28px 28px 0; }
.lp-step::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: var(--blush); transition: background .3s ease; }
.lp-step:nth-child(1)::before { background: linear-gradient(90deg,var(--coral),var(--coral-bright)); }
.lp-step:nth-child(2)::before { background: linear-gradient(90deg,var(--saffron),var(--saffron-light)); }
.lp-step:nth-child(3)::before { background: linear-gradient(90deg,var(--sage),#2ecc71); }
.lp-step-flood { position: absolute; inset: 0; opacity: 0; transition: opacity .45s ease; }
.lp-step:nth-child(1) .lp-step-flood { background: linear-gradient(145deg,var(--coral),var(--terracotta)); }
.lp-step:nth-child(2) .lp-step-flood { background: linear-gradient(145deg,var(--saffron),#E6900A); }
.lp-step:nth-child(3) .lp-step-flood { background: linear-gradient(145deg,var(--sage),#155C38); }
.lp-step:hover .lp-step-flood { opacity: 1; }
.lp-step:hover { transform: translateY(-10px); }
.lp-step-n { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .16em; color: var(--coral); margin-bottom: 44px; position: relative; z-index: 1; transition: color .3s; }
.lp-step:hover .lp-step-n { color: rgba(255,255,255,.6); }
.lp-step-ico { width: 58px; height: 58px; border: 1.5px solid rgba(22,15,8,.1); border-radius: 18px; display: flex; align-items: center; justify-content: center; margin-bottom: 36px; position: relative; z-index: 1; transition: all .3s ease; }
.lp-step-ico svg { width: 24px; height: 24px; stroke: var(--espresso); stroke-width: 1.5; fill: none; transition: stroke .3s; }
.lp-step:hover .lp-step-ico { border-color: rgba(255,255,255,.25); }
.lp-step:hover .lp-step-ico svg { stroke: #fff; }
.lp-step-ttl { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 700; line-height: 1.15; color: var(--espresso); margin-bottom: 18px; position: relative; z-index: 1; transition: color .3s; }
.lp-step:hover .lp-step-ttl { color: #fff; }
.lp-step-dsc { font-family: 'Fraunces', serif; font-size: 15.5px; font-weight: 300; line-height: 1.72; color: var(--espresso); opacity: .6; margin-bottom: 44px; position: relative; z-index: 1; transition: color .3s, opacity .3s; }
.lp-step:hover .lp-step-dsc { color: #fff; opacity: .8; }
.lp-step-stats { display: flex; gap: 36px; position: relative; z-index: 1; }
.lp-step-stat-l { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--espresso); opacity: .38; margin-bottom: 5px; transition: color .3s, opacity .3s; }
.lp-step:hover .lp-step-stat-l { color: #fff; opacity: .55; }
.lp-step-stat-v { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: var(--espresso); transition: color .3s; }
.lp-step:hover .lp-step-stat-v { color: #fff; }

/* ─── DIAGONAL CUTS ─── */
.lp-cut-r { height: 70px; background: linear-gradient(to bottom right, var(--from-color) 49.9%, var(--to-color) 50%); }
.lp-cut-l { height: 70px; background: linear-gradient(to bottom left, var(--from-color) 49.9%, var(--to-color) 50%); }

/* ─── BUILDER ─── */
#lp-builder { background: var(--cream-deep); padding: 160px 72px; position: relative; overflow: hidden; }
#lp-builder .lp-ghost { -webkit-text-stroke: 1px rgba(255,69,0,.04); font-size: clamp(100px,12vw,200px); bottom: -30px; left: -20px; z-index: 0; }
.lp-builder-inner { max-width: 1216px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1.15fr; gap: 90px; align-items: center; position: relative; z-index: 1; }
.lp-builder-canvas { background: #fff; border-radius: 28px; box-shadow: 0 24px 80px rgba(22,15,8,.1), 0 4px 12px rgba(22,15,8,.05); overflow: hidden; }
.lp-canvas-topbar { background: var(--espresso); padding: 16px 24px; display: flex; align-items: center; gap: 10px; }
.lp-tbar-dots { display: flex; gap: 7px; }
.lp-tbar-dot { width: 11px; height: 11px; border-radius: 50%; }
.lp-tbar-dot:nth-child(1) { background: #FF5F57; }
.lp-tbar-dot:nth-child(2) { background: #FEBC2E; }
.lp-tbar-dot:nth-child(3) { background: #28C840; }
.lp-tbar-title { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .1em; color: rgba(253,245,232,.45); margin-left: auto; margin-right: auto; }
.lp-canvas-body { padding: 36px 32px; display: flex; flex-direction: column; gap: 14px; }
.lp-q-card { border: 1.5px solid var(--blush); border-radius: 16px; padding: 20px 22px; transition: all .35s cubic-bezier(.34,1.56,.64,1); cursor: default; position: relative; overflow: hidden; }
.lp-q-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: linear-gradient(180deg,var(--coral),var(--saffron)); transform: scaleY(0); transform-origin: top; transition: transform .35s ease; }
.lp-q-card:hover { border-color: transparent; box-shadow: 0 8px 32px rgba(255,69,0,.12); transform: translateX(4px); }
.lp-q-card:hover::before { transform: scaleY(1); }
.lp-q-card.active { border-color: var(--coral); box-shadow: 0 8px 32px rgba(255,69,0,.15); }
.lp-q-card.active::before { transform: scaleY(1); }
.lp-q-type { font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--coral); margin-bottom: 8px; }
.lp-q-text { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 400; color: var(--espresso); line-height: 1.5; margin-bottom: 12px; }
.lp-q-options { display: flex; flex-wrap: wrap; gap: 7px; }
.lp-q-opt { background: var(--blush); border-radius: 100px; padding: 6px 14px; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; color: var(--espresso); transition: all .25s ease; }
.lp-q-card:hover .lp-q-opt:first-child, .lp-q-card.active .lp-q-opt:first-child { background: var(--coral); color: #fff; }
.lp-q-slider-track { height: 6px; background: var(--blush); border-radius: 10px; position: relative; }
.lp-q-slider-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 62%; background: linear-gradient(90deg,var(--coral),var(--saffron)); border-radius: 10px; }
.lp-q-slider-thumb { position: absolute; right: 38%; top: 50%; transform: translate(50%,-50%); width: 16px; height: 16px; background: #fff; border-radius: 50%; box-shadow: 0 2px 8px rgba(255,69,0,.3), 0 0 0 3px rgba(255,69,0,.15); }
.lp-q-stars { display: flex; gap: 6px; }
.lp-star { font-size: 20px; animation: lpStarPop 1.5s ease-in-out infinite alternate; }
.lp-star:nth-child(1) { animation-delay: 0s; } .lp-star:nth-child(2) { animation-delay: .15s; } .lp-star:nth-child(3) { animation-delay: .3s; } .lp-star:nth-child(4) { animation-delay: .45s; }
@keyframes lpStarPop { from { transform: scale(1); } to { transform: scale(1.15); } }
.lp-canvas-add-btn { display: flex; align-items: center; gap: 10px; border: 1.5px dashed rgba(255,69,0,.25); border-radius: 14px; padding: 16px 22px; cursor: default; transition: all .3s ease; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--coral); opacity: .55; }
.lp-canvas-add-btn:hover { opacity: 1; border-color: var(--coral); background: rgba(255,69,0,.04); }
.lp-plus-ico { width: 22px; height: 22px; background: rgba(255,69,0,.1); border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.lp-builder-txt .lp-sec-aside { text-align: left; max-width: 440px; margin-bottom: 44px; }
.lp-q-types-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 44px; }
.lp-qt-chip { display: flex; align-items: center; gap: 10px; background: var(--warm-white); border: 1.5px solid transparent; border-radius: 14px; padding: 14px 16px; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--espresso); transition: all .3s cubic-bezier(.34,1.56,.64,1); cursor: default; }
.lp-qt-chip:hover { border-color: var(--coral); background: #fff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(255,69,0,.1); }
.lp-qt-ico { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }

/* ─── ANALYTICS ─── */
#lp-analytics { background: var(--espresso); padding: 160px 72px; position: relative; overflow: hidden; }
.lp-analytics-glow { position: absolute; width: 800px; height: 800px; border-radius: 50%; background: radial-gradient(circle,rgba(255,69,0,.12),rgba(255,184,0,.06),transparent 70%); top: -200px; right: -200px; pointer-events: none; animation: glowPulse 8s ease-in-out infinite; }
@keyframes glowPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
#lp-analytics .lp-ghost { -webkit-text-stroke: 1px rgba(253,245,232,.04); font-size: clamp(100px,13vw,210px); bottom: -50px; right: -30px; z-index: 0; }
.lp-analytics-head { max-width: 1216px; margin: 0 auto 90px; display: flex; align-items: flex-end; justify-content: space-between; position: relative; z-index: 1; }
.lp-analytics-head .lp-sec-tag { color: var(--saffron); }
.lp-analytics-head .lp-sec-tag::before { background: var(--saffron); }
.lp-analytics-head .lp-sec-title { color: var(--cream); }
.lp-analytics-head .lp-sec-title em { color: var(--saffron); }
.lp-analytics-head .lp-sec-aside { color: rgba(253,245,232,.5); }
.lp-dash-wrap { max-width: 1216px; margin: 0 auto; position: relative; z-index: 1; background: rgba(253,245,232,.04); border: 1px solid rgba(253,245,232,.07); border-radius: 28px; padding: 40px; backdrop-filter: blur(10px); }
.lp-dash-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid rgba(253,245,232,.07); }
.lp-dash-ttl { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: var(--cream); }
.lp-dash-sub { font-family: 'Fraunces', serif; font-size: 13px; font-weight: 300; color: rgba(253,245,232,.4); margin-top: 4px; }
.lp-dash-badges { display: flex; gap: 10px; }
.lp-dash-badge { display: flex; align-items: center; gap: 7px; background: rgba(253,245,232,.07); border: 1px solid rgba(253,245,232,.1); border-radius: 100px; padding: 8px 16px; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .06em; color: rgba(253,245,232,.6); }
.lp-live-pip { width: 7px; height: 7px; background: #22c55e; border-radius: 50%; animation: lpPip 2s ease-in-out infinite; }
@keyframes lpPip { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
.lp-kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 32px; }
.lp-kpi-box { background: rgba(253,245,232,.05); border: 1px solid rgba(253,245,232,.07); border-radius: 18px; padding: 24px; transition: all .35s cubic-bezier(.34,1.56,.64,1); cursor: default; }
.lp-kpi-box:hover { background: rgba(255,69,0,.12); border-color: rgba(255,69,0,.3); transform: translateY(-4px); }
.lp-kpi-lbl { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: rgba(253,245,232,.4); margin-bottom: 12px; }
.lp-kpi-val { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 900; color: var(--cream); line-height: 1; margin-bottom: 8px; }
.lp-kpi-chg { display: inline-flex; align-items: center; gap: 5px; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 100px; }
.lp-kpi-chg.up { background: rgba(30,122,74,.2); color: #4ade80; }
.lp-kpi-chg.dn { background: rgba(214,59,31,.2); color: #fca5a5; }
.lp-dash-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; }
.lp-chart-card { background: rgba(253,245,232,.04); border: 1px solid rgba(253,245,232,.07); border-radius: 20px; padding: 28px; }
.lp-chart-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.lp-chart-ttl { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(253,245,232,.5); }
.lp-chart-leg { display: flex; gap: 16px; }
.lp-leg-item { display: flex; align-items: center; gap: 6px; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; color: rgba(253,245,232,.4); }
.lp-leg-dot { width: 7px; height: 7px; border-radius: 50%; }
.lp-donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 24px; }
.lp-donut-center { position: relative; width: 180px; height: 180px; }
.lp-donut-lbl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.lp-donut-big { font-family: 'Playfair Display', serif; font-size: 38px; font-weight: 900; color: var(--cream); line-height: 1; }
.lp-donut-small { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: rgba(253,245,232,.4); }
.lp-donut-legend { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.lp-dl-row { display: flex; align-items: center; gap: 10px; font-family: 'Fraunces', serif; font-size: 13px; font-weight: 300; color: rgba(253,245,232,.7); }
.lp-dl-bar-track { flex: 1; height: 4px; background: rgba(253,245,232,.07); border-radius: 4px; overflow: hidden; }
.lp-dl-bar-fill { height: 100%; border-radius: 4px; animation: dlFill 2s ease-out forwards; }
.lp-dl-pct { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; color: rgba(253,245,232,.5); min-width: 32px; text-align: right; }
.lp-sentiment-row { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
.lp-sent-spectrum { flex: 1; height: 10px; border-radius: 10px; background: linear-gradient(90deg,#ef4444 0%,var(--saffron) 40%,#22c55e 80%,var(--cobalt) 100%); position: relative; }
.lp-sent-needle { position: absolute; top: 50%; left: 68%; width: 18px; height: 18px; background: #fff; border-radius: 50%; transform: translate(-50%,-50%); box-shadow: 0 2px 10px rgba(0,0,0,.4); animation: needleDrift 4s ease-in-out infinite alternate; }
@keyframes needleDrift { from { left: 64%; } to { left: 72%; } }
@keyframes dlFill { from { width: 0; } to { width: var(--w, 100%); } }

/* ─── TESTIMONIALS ─── */
#lp-testimonials { background: var(--cream); padding: 160px 72px; position: relative; overflow: hidden; }
#lp-testimonials .lp-ghost { -webkit-text-stroke: 1px rgba(255,69,0,.04); font-size: clamp(120px,16vw,240px); top: -30px; left: -20px; z-index: 0; }
.lp-testi-head { max-width: 1216px; margin: 0 auto 90px; position: relative; z-index: 1; display: flex; align-items: flex-end; justify-content: space-between; }
.lp-testi-scroll-hint { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--espresso); opacity: .35; display: flex; align-items: center; gap: 10px; }
.lp-testi-scroll-hint::after { content: '→'; color: var(--coral); }
.lp-testi-track { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; max-width: 1216px; margin: 0 auto; position: relative; z-index: 1; }
.lp-tcard { background: var(--warm-white); border-radius: 24px; padding: 44px; position: relative; overflow: hidden; transition: all .4s cubic-bezier(.34,1.56,.64,1); cursor: default; border: 1.5px solid transparent; }
.lp-tcard::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--blush); transition: background .3s ease; }
.lp-tcard:hover::before { background: linear-gradient(90deg,var(--coral),var(--saffron)); }
.lp-tcard:hover { transform: translateY(-8px); border-color: rgba(255,69,0,.15); box-shadow: 0 24px 64px rgba(255,69,0,.1); }
.lp-tcard:nth-child(2) { transform: translateY(24px); }
.lp-tcard:nth-child(2):hover { transform: translateY(16px); }
.lp-quote-mark { font-family: 'Playfair Display', serif; font-size: 80px; font-weight: 900; color: var(--coral); opacity: .15; line-height: .7; margin-bottom: 8px; transition: opacity .3s; }
.lp-tcard:hover .lp-quote-mark { opacity: .25; }
.lp-tcard-quote { font-family: 'Playfair Display', serif; font-size: 19px; font-weight: 400; font-style: italic; line-height: 1.65; color: var(--espresso); margin-bottom: 36px; }
.lp-tcard-author { display: flex; align-items: center; gap: 16px; }
.lp-author-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 700; color: #fff; flex-shrink: 0; }
.lp-author-name { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .04em; color: var(--espresso); margin-bottom: 3px; }
.lp-author-role { font-family: 'Fraunces', serif; font-size: 12px; font-weight: 300; color: var(--espresso); opacity: .5; }
.lp-tcard-stars { position: absolute; top: 28px; right: 28px; font-size: 13px; }

/* ─── PRICING ─── */
#lp-pricing { background: var(--cream-deep); padding: 160px 72px; position: relative; overflow: hidden; }
#lp-pricing .lp-ghost { -webkit-text-stroke: 1px rgba(255,69,0,.04); font-size: clamp(120px,16vw,240px); bottom: -40px; right: -20px; z-index: 0; }
.lp-pricing-head { max-width: 1216px; margin: 0 auto 90px; text-align: center; position: relative; z-index: 1; }
.lp-pricing-head .lp-sec-tag { justify-content: center; margin-bottom: 20px; }
.lp-pricing-head .lp-sec-tag::before { display: none; }
.lp-pricing-head .lp-sec-title { margin: 0 auto 20px; text-align: center; }
.lp-pricing-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; max-width: 1216px; margin: 0 auto; position: relative; z-index: 1; }
.lp-pcard { border-radius: 28px; padding: 52px 44px; position: relative; overflow: hidden; transition: transform .4s cubic-bezier(.34,1.56,.64,1); cursor: default; }
.lp-pcard.std { background: var(--warm-white); border: 1.5px solid rgba(22,15,8,.07); }
.lp-pcard.pro { background: var(--espresso); transform: scale(1.04); box-shadow: 0 32px 80px rgba(22,15,8,.2); }
.lp-pcard.ent { background: var(--warm-white); border: 1.5px solid rgba(22,15,8,.07); }
.lp-pcard.std:hover, .lp-pcard.ent:hover { transform: translateY(-6px); }
.lp-pcard.pro:hover { transform: scale(1.04) translateY(-6px); }
.lp-pcard-badge { display: inline-flex; align-items: center; gap: 6px; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 6px 14px; border-radius: 100px; margin-bottom: 28px; }
.std .lp-pcard-badge { background: var(--blush); color: var(--terracotta); }
.pro .lp-pcard-badge { background: var(--coral); color: #fff; }
.ent .lp-pcard-badge { background: rgba(22,15,8,.07); color: var(--espresso); opacity: .7; }
.lp-pcard-name { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; margin-bottom: 12px; }
.std .lp-pcard-name, .ent .lp-pcard-name { color: var(--espresso); }
.pro .lp-pcard-name { color: var(--cream); }
.lp-pcard-price { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.lp-p-curr { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; opacity: .5; }
.lp-p-amt { font-family: 'Playfair Display', serif; font-size: 58px; font-weight: 900; line-height: 1; letter-spacing: -2px; }
.std .lp-p-curr, .std .lp-p-amt, .ent .lp-p-curr, .ent .lp-p-amt { color: var(--espresso); }
.pro .lp-p-curr, .pro .lp-p-amt { color: var(--cream); }
.lp-p-per { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 300; opacity: .5; }
.std .lp-p-per, .ent .lp-p-per { color: var(--espresso); }
.pro .lp-p-per { color: var(--cream); }
.lp-pcard-desc { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 300; line-height: 1.6; margin-bottom: 36px; }
.std .lp-pcard-desc, .ent .lp-pcard-desc { color: var(--espresso); opacity: .55; }
.pro .lp-pcard-desc { color: rgba(253,245,232,.55); }
.lp-pcard-divider { height: 1px; margin-bottom: 32px; }
.std .lp-pcard-divider, .ent .lp-pcard-divider { background: rgba(22,15,8,.07); }
.pro .lp-pcard-divider { background: rgba(253,245,232,.1); }
.lp-pcard-features { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 14px; margin-bottom: 44px; }
.lp-pcard-features li { display: flex; align-items: flex-start; gap: 12px; font-family: 'Fraunces', serif; font-size: 15px; font-weight: 300; line-height: 1.5; }
.std .lp-pcard-features li, .ent .lp-pcard-features li { color: var(--espresso); opacity: .7; }
.pro .lp-pcard-features li { color: rgba(253,245,232,.75); }
.lp-feat-check { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center; }
.std .lp-feat-check, .ent .lp-feat-check { background: rgba(255,69,0,.12); }
.pro .lp-feat-check { background: rgba(253,245,232,.15); }
.lp-pcard-btn { width: 100%; padding: 18px; border-radius: 100px; border: none; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; transition: all .3s cubic-bezier(.34,1.56,.64,1); }
.std .lp-pcard-btn { background: var(--blush); color: var(--terracotta); }
.std .lp-pcard-btn:hover { background: var(--coral); color: #fff; transform: translateY(-2px); box-shadow: 0 12px 32px rgba(255,69,0,.25); }
.pro .lp-pcard-btn { background: var(--coral); color: #fff; box-shadow: 0 12px 32px rgba(255,69,0,.3); }
.pro .lp-pcard-btn:hover { background: var(--saffron); color: var(--espresso); transform: translateY(-2px); }
.ent .lp-pcard-btn { background: rgba(22,15,8,.06); color: var(--espresso); }
.ent .lp-pcard-btn:hover { background: var(--espresso); color: var(--cream); transform: translateY(-2px); }

/* ─── FOOTER ─── */
#lp-footer { background: var(--espresso); padding: 90px 72px 44px; position: relative; overflow: hidden; }
#lp-footer .lp-ghost { font-size: clamp(100px,15vw,260px); -webkit-text-stroke: 1px rgba(253,245,232,.05); bottom: -50px; left: -10px; z-index: 0; letter-spacing: -6px; }
.lp-footer-inner { max-width: 1216px; margin: 0 auto; position: relative; z-index: 1; }
.lp-footer-top { display: grid; grid-template-columns: 2.2fr 1fr 1fr 1fr; gap: 60px; margin-bottom: 72px; padding-bottom: 60px; border-bottom: 1px solid rgba(253,245,232,.07); }
.lp-f-brand { font-family: 'Playfair Display', serif; font-weight: 900; font-size: 24px; color: var(--cream); margin-bottom: 18px; display: flex; align-items: flex-start; gap: 2px; }
.lp-f-brand-dot { position: relative; width: 7px; height: 7px; background: var(--coral); border-radius: 50%; align-self: flex-start; margin-top: 5px; margin-left: 7px; flex-shrink: 0; box-shadow: 0 0 8px rgba(255,69,0,.5); }
.lp-f-brand-dot .sonar-ring { position: absolute; border-radius: 50%; border: 1px solid var(--coral); top: 50%; left: 50%; width: 7px; height: 7px; transform: translate(-50%,-50%) scale(0); opacity: 0; animation: sonarRing 3s ease-out infinite; }
.lp-f-brand-dot .sonar-ring:nth-child(1) { animation-delay: 0s; }
.lp-f-brand-dot .sonar-ring:nth-child(2) { animation-delay: .9s; }
.lp-f-brand-dot .sonar-ring:nth-child(3) { animation-delay: 1.8s; }
.lp-f-desc { font-family: 'Fraunces', serif; font-size: 14.5px; font-weight: 300; line-height: 1.72; color: rgba(253,245,232,.4); max-width: 300px; margin-bottom: 32px; }
.lp-f-socials { display: flex; gap: 12px; }
.lp-f-soc { width: 38px; height: 38px; border: 1px solid rgba(253,245,232,.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; color: rgba(253,245,232,.4); text-decoration: none; transition: all .3s ease; }
.lp-f-soc:hover { border-color: var(--coral); color: var(--coral); background: rgba(255,69,0,.1); }
.lp-f-col-title { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: rgba(253,245,232,.28); margin-bottom: 24px; }
.lp-f-links { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.lp-f-links a { font-family: 'Fraunces', serif; font-size: 14.5px; font-weight: 300; color: rgba(253,245,232,.5); text-decoration: none; display: inline-block; transition: color .2s ease; position: relative; }
.lp-f-links a::after { content: ''; position: absolute; bottom: -1px; left: 0; width: 0; height: 1px; background: var(--saffron); transition: width .3s ease; }
.lp-f-links a:hover { color: var(--cream); }
.lp-f-links a:hover::after { width: 100%; }
.lp-footer-bottom { display: flex; align-items: center; justify-content: space-between; padding-top: 28px; border-top: 1px solid rgba(253,245,232,.06); }
.lp-f-copy { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: .05em; color: rgba(253,245,232,.22); }
.lp-f-award { display: flex; align-items: center; gap: 8px; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(253,245,232,.25); }
.lp-award-star { color: var(--saffron); }

/* ─── SCROLL REVEAL ─── */
.lp-sr { opacity: 0; transform: translateY(44px); transition: opacity .9s ease, transform .9s cubic-bezier(.16,1,.3,1); }
.lp-sr.vis { opacity: 1; transform: none; }
.lp-sr-d1 { transition-delay: .1s; } .lp-sr-d2 { transition-delay: .2s; } .lp-sr-d3 { transition-delay: .3s; } .lp-sr-d4 { transition-delay: .4s; }

/* ─── MOBILE RESPONSIVE ─── */
@media (max-width: 768px) {
  /* Nav */
  .lp-nav { padding: 18px 20px; }
  .lp-nav.stuck { padding: 14px 20px; }
  .lp-nav-links { display: none; }
  .lp-nav-burger { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: none; border: 1.5px solid rgba(22,15,8,.12); border-radius: 10px; cursor: pointer; }

  /* Hero */
  #lp-hero { padding-bottom: 60px; }
  .lp-hero-wrap { grid-template-columns: 1fr; gap: 0; padding: 100px 20px 0; }
  .lp-hero-cards { display: none; }
  .lp-h-head { font-size: clamp(42px,11vw,64px); letter-spacing: -2px; }
  .lp-h-sub { font-size: 16px; margin-bottom: 36px; }
  .lp-h-ctas { flex-direction: column; align-items: flex-start; gap: 16px; }
  .lp-btn-fire { width: 100%; justify-content: center; }
  .lp-scroll-cue { display: none; }
  .lp-ticker-bar { padding: 0 20px; }
  .lp-ticker-lbl { display: none; }

  /* How it works */
  #lp-how { padding: 80px 20px; }
  .lp-sec-head { flex-direction: column; align-items: flex-start; gap: 20px; margin-bottom: 48px; }
  .lp-sec-aside { text-align: left; max-width: 100%; }
  .lp-steps { grid-template-columns: 1fr; gap: 3px; }
  .lp-step { padding: 40px 28px; }
  .lp-step:first-child { border-radius: 28px 28px 0 0; }
  .lp-step:last-child { border-radius: 0 0 28px 28px; }

  /* Builder */
  #lp-builder { padding: 80px 20px; }
  .lp-builder-inner { grid-template-columns: 1fr; gap: 48px; }

  /* Analytics */
  #lp-analytics { padding: 80px 20px; }
  .lp-analytics-head { flex-direction: column; align-items: flex-start; gap: 20px; margin-bottom: 48px; }
  .lp-kpi-row { grid-template-columns: 1fr 1fr; gap: 12px; }
  .lp-dash-grid { grid-template-columns: 1fr; }
  .lp-dash-wrap { padding: 20px; }
  .lp-dash-topbar { flex-direction: column; align-items: flex-start; gap: 12px; }
  .lp-dash-badges { flex-wrap: wrap; }
  .lp-kpi-val { font-size: 32px; }

  /* Testimonials */
  #lp-testimonials { padding: 80px 20px; }
  .lp-testi-head { flex-direction: column; align-items: flex-start; gap: 16px; margin-bottom: 48px; }
  .lp-testi-track { grid-template-columns: 1fr; }
  .lp-tcard:nth-child(2) { transform: none; }
  .lp-tcard:nth-child(2):hover { transform: translateY(-8px); }
  .lp-tcard { padding: 32px 28px; }

  /* Pricing */
  #lp-pricing { padding: 80px 20px; }
  .lp-pricing-head { margin-bottom: 48px; }
  .lp-pricing-grid { grid-template-columns: 1fr; gap: 16px; }
  .lp-pcard.pro { transform: none; }
  .lp-pcard.pro:hover { transform: translateY(-6px); }
  .lp-pcard { padding: 36px 28px; }
  .lp-p-amt { font-size: 48px; }

  /* Footer */
  #lp-footer { padding: 60px 20px 32px; }
  .lp-footer-top { grid-template-columns: 1fr; gap: 40px; margin-bottom: 40px; padding-bottom: 40px; }
  .lp-footer-bottom { flex-direction: column; align-items: flex-start; gap: 12px; }
  .lp-f-desc { max-width: 100%; }

  /* Diagonal cuts — collapse on mobile */
  .lp-cut-r, .lp-cut-l { height: 30px; }

  /* FAQ / other sections */
  #lp-faq { padding: 80px 20px; }
  .lp-faq-inner { max-width: 100%; }
}

@media (max-width: 480px) {
  .lp-kpi-row { grid-template-columns: 1fr; }
  .lp-q-types-grid { grid-template-columns: 1fr; }
}
`;

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const onEnterApp = () => navigate('/login');
  const bodyRef = useRef(null);
  const { stopLoading } = useLoading();
  useEffect(() => { stopLoading(); }, [stopLoading]);

  // Inject CSS once
  useEffect(() => {
    if (!document.getElementById("lp-gfonts")) {
      const link = document.createElement("link");
      link.id = "lp-gfonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900&family=Syne:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&display=swap";
      document.head.appendChild(link);
    }
    // Keep style tag alive across remounts to avoid animation flicker
    if (!document.getElementById("lp-styles")) {
      const el = document.createElement("style");
      el.id = "lp-styles";
      el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);

  // Force hero CSS animations to replay on every mount
  useEffect(() => {
    const heroAnims = document.querySelectorAll(
      ".lp-h-tag, .lp-h-word, .lp-h-sub, .lp-h-ctas, .lp-hero-cards, .lp-scroll-cue"
    );
    heroAnims.forEach(el => {
      el.style.animation = "none";
      // Trigger reflow
      void el.offsetWidth;
      el.style.animation = "";
    });
  }, []);

  // Nav stuck
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const fn = () => setStuck(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Scroll reveal
  useEffect(() => {
    let obs;
    const t = setTimeout(() => {
      const elements = document.querySelectorAll(".lp-sr");

      // Any element already scrolled past or in view should be visible immediately
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) el.classList.add("vis");
      });

      // Observer handles the rest as user scrolls down
      obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("vis"); });
      }, { threshold: 0.12 });

      elements.forEach(el => obs.observe(el));
    }, 80);

    return () => {
      clearTimeout(t);
      if (obs) obs.disconnect();
    };
  }, []);


  // Counter animation (matching HTML animCount)
  useEffect(() => {
    const animCount = (el, end, dur, suffix = '') => {
      let start = null;
      const step = ts => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.floor(ease * end).toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // Reset to zero so they re-count on remount
    document.querySelectorAll("[data-counter]").forEach(el => { el.textContent = "0"; });

    const ctrObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target;
          if (el.dataset.counter === "ctr1") animCount(el, 84, 2000, '%');
          if (el.dataset.counter === "kpi1") animCount(el, 4821, 2500);
          ctrObs.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    const t = setTimeout(() => {
      document.querySelectorAll("[data-counter]").forEach(el => ctrObs.observe(el));
    }, 100);
    return () => { clearTimeout(t); ctrObs.disconnect(); };
  }, []);

  // Parallax blobs on hero
  const meshRef = useRef(null);
  useEffect(() => {
    const fn = e => {
      if (!meshRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      meshRef.current.querySelectorAll(".lp-mb").forEach((b, i) => {
        const f = (i + 1) * 0.55;
        b.style.transform = `translate(${x * f}px,${y * f}px)`;
      });
    };
    document.addEventListener("mousemove", fn);
    return () => document.removeEventListener("mousemove", fn);
  }, []);

  const TICKER = ["Unilever", "HDFC Bank", "Reliance Industries", "Asian Paints", "Titan Company", "Marico", "ITC Limited", "Bajaj Finserv", "Myntra", "Tata Consumer"];

  return (
    <div className="lp">
      {/* ── NAV ── */}
      <nav className={`lp-nav${stuck ? " stuck" : ""}`}>
        <a href="#" className="lp-logo">
          <span className="lp-logo-parent">Axiora</span>
          <span className="lp-logo-product">Pulse</span>
          <div className="lp-logo-dot">
            <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
          </div>
        </a>
        <ul className="lp-nav-links">
          <li><a href="#lp-how">Research</a></li>
          <li><a href="#lp-builder">Builder</a></li>
          <li><a href="#lp-analytics">Analytics</a></li>
          <li><a href="#lp-pricing">Pricing</a></li>
          <li><button className="lp-nav-btn" onClick={onEnterApp}>Sign In</button></li>
        </ul>
      </nav>

      {/* ── HERO ── */}
      <section id="lp-hero">
        <div className="lp-mesh" ref={meshRef}>
          <div className="lp-mb lp-mb1" /><div className="lp-mb lp-mb2" />
          <div className="lp-mb lp-mb3" /><div className="lp-mb lp-mb4" />
        </div>
        <div className="lp-grain" />
        <div className="lp-ghost lp-ghost-h">Pulse</div>

        <div className="lp-hero-wrap">
          {/* Left */}
          <div>
            <div className="lp-h-tag"><span className="lp-h-tag-line" />Behavioural Survey Intelligence</div>
            <h1 className="lp-h-head">
              <span className="lp-hline"><span className="lp-h-word lp-hw1">Opinion&nbsp;</span><span className="lp-h-word lp-hw2">is&nbsp;</span></span>
              <span className="lp-hline"><span className="lp-h-word lp-hw3"><em>evidence.</em>&nbsp;</span></span>
              <span className="lp-hline"><span className="lp-h-word lp-hw4">Treat&nbsp;</span><span className="lp-h-word lp-hw5">it&nbsp;</span><span className="lp-h-word lp-hw6">that way.</span></span>
            </h1>
            <p className="lp-h-sub">Axiora Pulse is engineered on Likert-scale rigour, cognitive load reduction, and response-bias elimination — so every data point you collect is one you can defend in a boardroom.</p>
            <div className="lp-h-ctas">
              <button className="lp-btn-fire" onClick={onEnterApp}>
                <span>Design Your First Study</span>
                <div className="lp-btn-fire-arr">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H4M8 2V6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </button>
              <button className="lp-btn-outline">
                <div className="lp-play-ring">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3.5 2.5L10 6.5L3.5 10.5V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                </div>
                See Methodology
              </button>
            </div>
          </div>

          {/* Right: Hero cards */}
          <div className="lp-hero-cards">
            <div className="lp-hcard">
              <div className="lp-hc-label">Median Completion Rate</div>
              <div className="lp-hc-big" data-counter="ctr1">84%</div>
              <div className="lp-hc-sub">Across double-blind field studies</div>
              <div className="lp-gbar"><div className="lp-gbar-fill" /></div>
            </div>
            <div className="lp-hcard">
              <div className="lp-hc-label">Affective State Mapping</div>
              <div className="lp-edots">
                {["Delighted", "Curious", "Satisfied", "Neutral", "Concerned"].map(l => (
                  <div className="lp-edot" key={l}>
                    <div className="lp-edot-pip" />
                    <div className="lp-edot-bar-track"><div className="lp-edot-bar-fill" /></div>
                    <span className="lp-edot-lbl">{l}</span>
                  </div>
                ))}
              </div>
              <div className="lp-hc-sub" style={{ marginTop: 10 }}>Russell's Circumplex · Validated scale</div>
            </div>
            <div className="lp-hcard">
              <div className="lp-hc-label">Coded Responses</div>
              <div className="lp-hc-big">2.4k</div>
              <div className="lp-hc-sub">Thematic + sentiment coded</div>
              <div className="lp-sparkline">
                {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div className="lp-sp" key={i} />)}
              </div>
            </div>
            <div className="lp-hcard">
              <div className="lp-hc-label">Net Promoter Score</div>
              <div className="lp-hc-big" style={{ fontSize: 32, color: "var(--sage)" }}>+72</div>
              <div className="lp-trend">↑ 8pt lift · stat. significant</div>
            </div>
          </div>
        </div>

        <div className="lp-scroll-cue">
          <div className="lp-sc-line" />
          <div className="lp-sc-txt">Scroll to explore</div>
        </div>

        <div className="lp-ticker-bar">
          <span className="lp-ticker-lbl">Research partners</span>
          <div className="lp-ticker-overflow">
            <div className="lp-ticker-track">
              {[...TICKER, ...TICKER].map((name, i) => (
                <span className="lp-ticker-item" key={i}>{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Diagonal cut */}
      <div style={{ height: 70, background: "linear-gradient(to bottom right,var(--cream-deep) 49.9%,#fff 50%)" }} />

      {/* ── HOW IT WORKS ── */}
      <section id="lp-how">
        <div className="lp-ghost" style={{ fontSize: "clamp(120px,14vw,220px)", WebkitTextStroke: "1px rgba(255,69,0,.04)", top: -40, right: -30, zIndex: 0, letterSpacing: -3 }}>Process</div>
        <div className="lp-sec-head lp-sr">
          <div>
            <div className="lp-sec-tag">Survey Science</div>
            <h2 className="lp-sec-title">Built on three <em>principles</em> of good research</h2>
          </div>
          <p className="lp-sec-aside">Rooted in psychometric theory, field-tested with 2.4 million respondents across India. Every feature has a methodological reason to exist.</p>
        </div>
        <div className="lp-steps">
          {[
            { n: "01 — Design", title: "Instrument Design", desc: "Construct questionnaires that eliminate acquiescence bias, social desirability effects, and primacy order artefacts. Our builder enforces best-practice sequencing — funnelling from broad to specific, never leading, never double-barrelling.", stats: [["Validated scales", "24+"], ["Avg instrument build", "11 min"]], icon: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12h8M12 8v8" /></> },
            { n: "02 — Distribute", title: "Sampling & Field", desc: "Quota-controlled sampling across demographic, psychographic, and behavioural strata. Real-time speedster detection, straight-lining alerts, and open-text gibberish filtering protect data quality before it costs you.", stats: [["Sampling strata", "18"], ["Median field time", "38 hrs"]], icon: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.59 13.51L15.42 17.49M15.41 6.51L8.59 10.49" /></> },
            { n: "03 — Understand", title: "Analysis & Inference", desc: "Cross-tabulation, regression weighting, MaxDiff scoring, and driver analysis run automatically. Statistical significance is flagged at every comparison. You see what is real — not what is merely frequent.", stats: [["Analysis methods", "17"], ["Sig. threshold", "p < .05"]], icon: <><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></> },
          ].map((step, i) => (
            <div className={`lp-step lp-sr lp-sr-d${i + 1}`} key={i}>
              <div className="lp-step-flood" />
              <div className="lp-step-n">{step.n}</div>
              <div className="lp-step-ico"><svg viewBox="0 0 24 24">{step.icon}</svg></div>
              <h3 className="lp-step-ttl">{step.title}</h3>
              <p className="lp-step-dsc">{step.desc}</p>
              <div className="lp-step-stats">
                {step.stats.map(([l, v]) => (
                  <div key={l}><div className="lp-step-stat-l">{l}</div><div className="lp-step-stat-v">{v}</div></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* ── BUILDER ── */}
      <section id="lp-builder">
        <div className="lp-ghost" style={{ fontSize: "clamp(100px,12vw,200px)", WebkitTextStroke: "1px rgba(255,69,0,.04)", bottom: -30, left: -20, zIndex: 0 }}>Builder</div>
        <div className="lp-builder-inner">
          <div className="lp-builder-canvas lp-sr lp-sr-d1">
            <div className="lp-canvas-topbar">
              <div className="lp-tbar-dots"><div className="lp-tbar-dot" /><div className="lp-tbar-dot" /><div className="lp-tbar-dot" /></div>
              <div className="lp-tbar-title">Product Feedback — Q1 2025</div>
            </div>
            <div className="lp-canvas-body">
              <div className="lp-q-card active">
                <div className="lp-q-type">Forced Choice — Single Select</div>
                <div className="lp-q-text">Which one factor most influenced your decision to purchase?</div>
                <div className="lp-q-options">
                  {["Price point", "Brand trust", "Peer referral", "Availability"].map(o => <span className="lp-q-opt" key={o}>{o}</span>)}
                </div>
              </div>
              <div className="lp-q-card">
                <div className="lp-q-type">11-point NPS Scale</div>
                <div className="lp-q-text">How likely are you to recommend this brand to a colleague or peer?</div>
                <div style={{ padding: "8px 0 4px" }}>
                  <div className="lp-q-slider-track"><div className="lp-q-slider-fill" /><div className="lp-q-slider-thumb" /></div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <span style={{ fontFamily: "Syne,sans-serif", fontSize: 10, color: "var(--espresso)", opacity: .4 }}>0 · Not at all likely</span>
                  <span style={{ fontFamily: "Syne,sans-serif", fontSize: 10, color: "var(--espresso)", opacity: .4 }}>10 · Extremely likely</span>
                </div>
              </div>
              <div className="lp-q-card">
                <div className="lp-q-type">Semantic Differential</div>
                <div className="lp-q-text">Rate your perception of the brand on each dimension</div>
                <div className="lp-q-stars">
                  <span className="lp-star">⭐</span><span className="lp-star">⭐</span><span className="lp-star">⭐</span><span className="lp-star">⭐</span><span>☆</span>
                </div>
              </div>
              <div className="lp-canvas-add-btn">
                <div className="lp-plus-ico">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="var(--coral)" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>
                Add Question
              </div>
            </div>
          </div>
          <div className="lp-builder-txt lp-sr lp-sr-d2">
            <div className="lp-sec-tag">Instrument Builder</div>
            <h2 className="lp-sec-title">Every question is a <em>decision</em></h2>
            <p className="lp-sec-aside">Closed-ended or open? Forced-choice or ranked preference? The builder flags when your wording risks anchoring, framing, or double-barrelling a response — before a single respondent sees it.</p>
            <div className="lp-q-types-grid">
              {[
                { label: "Likert Scale", bg: "rgba(255,69,0,.08)", stroke: "var(--coral)", icon: <><path d="M7 2v10M2 7h10" strokeLinecap="round" /></> },
                { label: "MaxDiff Ranking", bg: "rgba(255,184,0,.1)", stroke: "#B8870A", icon: <><rect x="1.5" y="2.5" width="11" height="9" rx="2" /><circle cx="4.5" cy="5.5" r="1" /><path d="M1.5 10l3-3 2.5 2.5 2-2L12 10" /></> },
                { label: "Open Verbatim", bg: "rgba(30,122,74,.1)", stroke: "var(--sage)", icon: <><path d="M2 4h10M2 7h7M2 10h5" strokeLinecap="round" /></> },
                { label: "Conjoint Grid", bg: "rgba(0,71,255,.08)", stroke: "var(--cobalt)", icon: <><rect x="1.5" y="8" width="2.5" height="4" rx="1" /><rect x="5.75" y="5" width="2.5" height="7" rx="1" /><rect x="10" y="2" width="2.5" height="10" rx="1" /></> },
                { label: "Semantic Diff", bg: "rgba(255,69,0,.08)", stroke: "var(--coral)", icon: <><path d="M7 1.5l1.5 3.2 3.5.5-2.5 2.5.6 3.5L7 9.5l-3.1 1.7.6-3.5-2.5-2.5 3.5-.5z" strokeLinejoin="round" /></> },
                { label: "Net Promoter", bg: "rgba(22,15,8,.06)", stroke: "var(--espresso)", icon: <><circle cx="7" cy="7" r="5.5" /><path d="M4.5 7h5M7 4.5v5" strokeLinecap="round" /></> },
              ].map(qt => (
                <div className="lp-qt-chip" key={qt.label}>
                  <div className="lp-qt-ico" style={{ background: qt.bg }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={qt.stroke} strokeWidth="1.5" strokeLinecap="round">{qt.icon}</svg>
                  </div>
                  {qt.label}
                </div>
              ))}
            </div>
            <button className="lp-btn-fire" onClick={onEnterApp}>
              <span>Build a Study</span>
              <div className="lp-btn-fire-arr">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H4M8 2V6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </button>
          </div>
        </div>
      </section>

      <div style={{ height: 70, background: "linear-gradient(to bottom left,var(--espresso) 49.9%,var(--cream-deep) 50%)" }} />

      {/* ── ANALYTICS ── */}
      <section id="lp-analytics">
        <div className="lp-analytics-glow" />
        <div className="lp-ghost" style={{ WebkitTextStroke: "1px rgba(253,245,232,.04)", fontSize: "clamp(100px,13vw,210px)", bottom: -50, right: -30, zIndex: 0 }}>Data</div>
        <div className="lp-analytics-head lp-sr">
          <div>
            <div className="lp-sec-tag">Analysis Engine</div>
            <h2 className="lp-sec-title">Significance, not just <em>frequency</em></h2>
          </div>
          <p className="lp-sec-aside">Most tools tell you what respondents said. Pulse tells you what they meant — tested against statistical thresholds, weighted for sample representativeness, flagged for significance at every cut.</p>
        </div>
        <div className="lp-dash-wrap lp-sr lp-sr-d1">
          <div className="lp-dash-topbar">
            <div>
              <div className="lp-dash-ttl">Brand Equity Tracker — Wave 3</div>
              <div className="lp-dash-sub">Quant study · n=4,821 · Urban India · SEC A/B · 22–48 yrs</div>
            </div>
            <div className="lp-dash-badges">
              <div className="lp-dash-badge"><div className="lp-live-pip" />Live tracking</div>
              <div className="lp-dash-badge">n = 4,821 · 95% CI</div>
              <div className="lp-dash-badge">MoE ±1.4% · p &lt; .05</div>
            </div>
          </div>
          <div className="lp-kpi-row">
            {[["Valid Completes", "4,821", "↑ Wave-on-wave +23%", "up"], ["Incidence Rate", "84%", "↑ 8pts vs category norm", "up"], ["Brand Affect Score", "+68", "↑ Sig. above neutral (z=3.2)", "up"], ["Median LOI", "3.2m", "0.4m above target LOI", "dn"]].map(([l, v, ch, cls], idx) => (
              <div className={`lp-kpi-box lp-sr lp-sr-d${idx + 1}`} key={l}>
                <div className="lp-kpi-lbl">{l}</div>
                <div className="lp-kpi-val" {...(idx === 0 ? { "data-counter": "kpi1" } : {})}>{v}</div>
                <div className={`lp-kpi-chg ${cls}`}>{ch}</div>
              </div>
            ))}
          </div>
          <div className="lp-dash-grid">
            <div className="lp-chart-card lp-sr lp-sr-d1">
              <div className="lp-chart-head">
                <div className="lp-chart-ttl">Field Completion — Daily Completes</div>
                <div className="lp-chart-leg">
                  <div className="lp-leg-item"><div className="lp-leg-dot" style={{ background: "var(--coral)" }} />Wave 3 (current)</div>
                  <div className="lp-leg-item"><div className="lp-leg-dot" style={{ background: "rgba(253,245,232,.2)" }} />Wave 2 (baseline)</div>
                </div>
              </div>
              <svg viewBox="0 0 520 160" fill="none" style={{ width: "100%" }}>
                <defs><linearGradient id="lpBarGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FF6B35" /><stop offset="100%" stopColor="#FF4500" stopOpacity=".7" /></linearGradient></defs>
                {[140, 100, 60, 20].map(y => <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="rgba(253,245,232,.06)" strokeWidth="1" />)}
                {[[10, 90], [80, 70], [150, 80], [220, 50], [290, 60], [360, 75], [430, 40]].map(([x, y], i) => <rect key={i} x={x} y={y} width="30" height={140 - y} rx="4" fill="rgba(253,245,232,.08)" />)}
                {[[44, 60], [114, 30], [184, 50], [254, 20], [324, 35], [394, 45], [464, 10]].map(([x, y], i) => <rect key={i} x={x} y={y} width="30" height={140 - y} rx="4" fill="url(#lpBarGrad)" />)}
                {["W1", "W2", "W3", "W4", "W5", "W6", "W7"].map((w, i) => <text key={w} x={25 + i * 70} y="158" fill="rgba(253,245,232,.3)" fontFamily="sans-serif" fontSize="10">{w}</text>)}
              </svg>
              <div style={{ marginTop: 24 }}>
                <div style={{ fontFamily: "Syne,sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(253,245,232,.35)", marginBottom: 10 }}>Sentiment Polarity — Weighted Distribution</div>
                <div className="lp-sentiment-row">
                  <span style={{ fontFamily: "Syne,sans-serif", fontSize: 10, color: "rgba(253,245,232,.3)" }}>—</span>
                  <div className="lp-sent-spectrum"><div className="lp-sent-needle" /></div>
                  <span style={{ fontFamily: "Syne,sans-serif", fontSize: 10, color: "rgba(253,245,232,.3)" }}>+</span>
                </div>
              </div>
            </div>
            <div className="lp-chart-card lp-sr lp-sr-d2">
              <div className="lp-chart-head"><div className="lp-chart-ttl">Affective State Distribution</div></div>
              <div className="lp-donut-wrap">
                <div className="lp-donut-center">
                  <svg viewBox="0 0 180 180" width="180" height="180">
                    <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(253,245,232,.05)" strokeWidth="26" />
                    <circle cx="90" cy="90" r="70" fill="none" stroke="#FF4500" strokeWidth="26" strokeDasharray="175 264" strokeDashoffset="0" strokeLinecap="round" />
                    <circle cx="90" cy="90" r="70" fill="none" stroke="#FFB800" strokeWidth="26" strokeDasharray="106 333" strokeDashoffset="-175" strokeLinecap="round" />
                    <circle cx="90" cy="90" r="70" fill="none" stroke="#1E7A4A" strokeWidth="26" strokeDasharray="66 373" strokeDashoffset="-281" strokeLinecap="round" />
                    <circle cx="90" cy="90" r="70" fill="none" stroke="#0047FF" strokeWidth="26" strokeDasharray="53 386" strokeDashoffset="-347" strokeLinecap="round" />
                  </svg>
                  <div className="lp-donut-lbl">
                    <div className="lp-donut-big">68%</div>
                    <div className="lp-donut-small">Positive affect</div>
                  </div>
                </div>
                <div className="lp-donut-legend">
                  {[["#FF4500", "Delighted", "40%"], ["#FFB800", "Curious", "28%"], ["#1E7A4A", "Satisfied", "20%"], ["#0047FF", "Concerned", "12%"]].map(([c, l, p]) => (
                    <div className="lp-dl-row" key={l}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                      {l}
                      <div className="lp-dl-bar-track"><div className="lp-dl-bar-fill" style={{ background: c, '--w': p }} /></div>
                      <div className="lp-dl-pct">{p}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 70, background: "linear-gradient(to bottom right,var(--espresso) 49.9%,var(--cream) 50%)" }} />

      {/* ── TESTIMONIALS ── */}
      <section id="lp-testimonials">
        <div className="lp-ghost" style={{ WebkitTextStroke: "1px rgba(255,69,0,.04)", fontSize: "clamp(120px,16vw,240px)", top: -30, left: -20, zIndex: 0 }}>Love</div>
        <div className="lp-testi-head lp-sr">
          <div>
            <div className="lp-sec-tag">Practitioner Voices</div>
            <h2 className="lp-sec-title">Trusted by researchers who <em>know the difference</em></h2>
          </div>
          <div className="lp-testi-scroll-hint">3 practitioners</div>
        </div>
        <div className="lp-testi-track">
          {[
            { q: "The forced-choice architecture and automatic straight-line detection genuinely improved our data quality. We retired three legacy tools once we saw what clean data actually looked like.", name: "Priya Nambiar", role: "Senior Research Manager, Hindustan Unilever", init: "P", grad: "linear-gradient(135deg,var(--coral),var(--terracotta))" },
            { q: "Conjoint and MaxDiff in the same tool — with weighting built in. That alone saved us two weeks per study. The cross-tab interface is the most intuitive I've seen at this price point.", name: "Rohit Desai", role: "Quantitative Research Lead, Ipsos India", init: "R", grad: "linear-gradient(135deg,var(--saffron),#E6900A)" },
            { q: "Our panel incidence rate went from 31% to 79% after switching. The cognitive load reduction in question design is real — respondents drop off where instruments are poorly constructed, and Pulse won't let you construct them poorly.", name: "Anusha Krishnamurthy", role: "Head of Consumer Insights, Tata Consumer Products", init: "A", grad: "linear-gradient(135deg,var(--sage),#155C38)" },
          ].map((t, i) => (
            <div className={`lp-tcard lp-sr lp-sr-d${i + 1}`} key={i}>
              <div className="lp-tcard-stars">★★★★★</div>
              <div className="lp-quote-mark">"</div>
              <p className="lp-tcard-quote">{t.q}</p>
              <div className="lp-tcard-author">
                <div className="lp-author-avatar" style={{ background: t.grad }}>{t.init}</div>
                <div>
                  <div className="lp-author-name">{t.name}</div>
                  <div className="lp-author-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="lp-pricing">
        <div className="lp-ghost" style={{ WebkitTextStroke: "1px rgba(255,69,0,.04)", fontSize: "clamp(120px,16vw,240px)", bottom: -40, right: -20, zIndex: 0 }}>Price</div>
        <div className="lp-pricing-head lp-sr">
          <div className="lp-sec-tag">Pricing</div>
          <h2 className="lp-sec-title">Priced for <em>every</em> research cadence</h2>
          <p style={{ fontFamily: "Fraunces,serif", fontSize: 18, fontWeight: 300, lineHeight: 1.7, color: "var(--espresso)", opacity: .6, maxWidth: 480, margin: "0 auto" }}>Ad hoc or continuous tracking. Single study or always-on panel. The plan fits the methodology, not the other way around.</p>
        </div>
        <div className="lp-pricing-grid">
          {[
            { cls: "std", badge: "Starter", name: "Free", curr: "₹", amt: "0", per: "/ month", desc: "Ad hoc studies, concept testing, and quick pulse checks. Ideal for brand teams conducting research independently.", feats: ["3 active surveys", "100 responses / month", "Basic analytics", "5 question types"], btn: "Start Free Study" },
            { cls: "pro", badge: "Most Used", name: "Pro", curr: "₹", amt: "2,499", per: "/ month", desc: "For insight teams running continuous trackers, usage & attitude studies, and brand equity waves.", feats: ["Unlimited surveys", "10,000 responses / month", "Full analytics + AI insights", "All 24+ question types", "Custom branding", "Team collaboration (5 seats)"], btn: "Start 14-Day Trial" },
            { cls: "ent", badge: "Enterprise", name: "Custom", curr: "", amt: "Talk to us", per: "", desc: "For research agencies, FMCG conglomerates, and financial institutions running multi-country, longitudinal, or panel-based programmes.", feats: ["Unlimited everything", "On-premise deployment", "Dedicated research analyst", "99.9% SLA guarantee", "API + Webhooks"], btn: "Contact Sales" },
          ].map((p, i) => (
            <div className={`lp-pcard ${p.cls} lp-sr lp-sr-d${i + 1}`} key={p.cls}>
              <div className="lp-pcard-badge">{p.badge}</div>
              <div className="lp-pcard-name">{p.name}</div>
              <div className="lp-pcard-price">
                <span className="lp-p-curr">{p.curr}</span>
                <span className="lp-p-amt" style={p.cls === "ent" ? { fontSize: 40, letterSpacing: -1 } : {}}>{p.amt}</span>
                <span className="lp-p-per">{p.per}</span>
              </div>
              <div className="lp-pcard-desc">{p.desc}</div>
              <div className="lp-pcard-divider" />
              <ul className="lp-pcard-features">
                {p.feats.map(f => (
                  <li key={f}>
                    <div className="lp-feat-check">
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke={p.cls === "pro" ? "var(--cream)" : "var(--coral)"} strokeWidth="2.5" strokeLinecap="round"><polyline points="1.5,4.5 3.5,6.5 7.5,2" /></svg>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="lp-pcard-btn" onClick={onEnterApp}>{p.btn}</button>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="lp-footer">
        <div className="lp-ghost" style={{ fontSize: "clamp(100px,15vw,260px)", WebkitTextStroke: "1px rgba(253,245,232,.05)", bottom: -50, left: -10, zIndex: 0, letterSpacing: -6 }}>PULSE</div>
        <div className="lp-grain" style={{ opacity: .02 }} />
        <div className="lp-footer-inner">
          <div className="lp-footer-top">
            <div>
              <div className="lp-f-brand">
                <span style={{ fontFamily: "Syne,sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", opacity: .35, marginRight: 7, position: "relative", top: -3 }}>Axiora</span>
                Pulse
                <div className="lp-f-brand-dot">
                  <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
                </div>
              </div>
              <p className="lp-f-desc">Market intelligence that feels human. Built for brands who believe understanding people is the greatest competitive advantage.</p>
              <div className="lp-f-socials">
                {["Li", "Tw", "In", "Yt"].map(s => <a href="#" className="lp-f-soc" key={s}>{s}</a>)}
              </div>
            </div>
            {[
              { title: "Product", links: ["Survey Builder", "Analytics", "Distribution", "AI Insights", "Reports"] },
              { title: "Company", links: ["About Us", "Careers", "Press Kit", "Blog", "Contact"] },
              { title: "Legal", links: ["Privacy Policy", "Terms of Use", "Security", "GDPR", "Cookie Policy"] },
            ].map(col => (
              <div key={col.title}>
                <div className="lp-f-col-title">{col.title}</div>
                <ul className="lp-f-links">
                  {col.links.map(l => <li key={l}><a href="#">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="lp-footer-bottom">
            <div className="lp-f-copy">© 2025 Axiora · Pulse is a product of Axiora Pvt Ltd · Built for researchers, by researchers · Bengaluru</div>
            <div className="lp-f-award"><span className="lp-award-star">★</span>Paris Design Award Nominee 2025<span className="lp-award-star">★</span></div>
          </div>
        </div>
      </footer>
    </div>
  );
}