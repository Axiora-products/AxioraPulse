import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../api/axios';



function QRCode({ url, size = 160 }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=${size}x${size}&color=160F08&bgcolor=FDF5E8&margin=8&qzone=1`;
  return (
    <img
      src={src}
      alt="QR code"
      width={size}
      height={size}
      style={{ borderRadius: 12, display: 'block' }}
    />
  );
}

const TABS = [
  { id: 'link', label: '🔗 Link' },
  { id: 'qr', label: '⬛ QR' },
  { id: 'embed', label: '</> Embed' },
  { id: 'email', label: '✉️ Email' },
  { id: 'social', label: '🌐 Social' },
];

const EMBED_SIZES = [
  { label: 'Compact', w: 480, h: 600 },
  { label: 'Standard', w: 680, h: 800 },
  { label: 'Full', w: '100%', h: 800 },
];



export default function ShareModal({ survey, isOpen, onClose }) {
  const [tab, setTab] = useState('link');
  const [copied, setCopied] = useState(false);
  const [embedSize, setEmbed] = useState(1);     // index into EMBED_SIZES
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  const surveyUrl = `${window.location.origin}/s/${survey?.slug}`;
  const embedUrl = `${window.location.origin}/embed/${survey?.slug}`;
  const sel = EMBED_SIZES[embedSize];
  const embedCode = `<iframe\n  src="${embedUrl}"\n  width="${sel.w}"\n  height="${sel.h}"\n  frameborder="0"\n  style="border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.12)"\n  allow="clipboard-write"\n></iframe>`;
  const shareText = `Check this survey: ${survey?.title}`;
  const encodedUrl = encodeURIComponent(surveyUrl);
  const encodedText = encodeURIComponent(shareText);

  function openShare(url) {
    window.open(url, "_blank");
  }
  // Reset state when closed
  useEffect(() => {
    if (!isOpen) { setTab('link'); setCopied(false); setEmailTo(''); }
  }, [isOpen]);

  function copyLink() {
    navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2500);
  }

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode);
    toast.success('Embed code copied!');
  }

  async function sendEmail() {
    if (!emailTo.trim()) {
      return toast.error("Enter an email address");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
      return toast.error("Invalid email");
    }

    setSending(true);

    try {
      await API.post("/users/share-survey", {
        email: emailTo.trim(),
        survey_link: surveyUrl,
        survey_title: survey?.title
      }); 
      toast.success(`Invite sent to ${emailTo}`);
      setEmailTo("");

    } catch (error) {
      console.log(error.response?.data);
      console.log("FULL ERROR:", error); // 🔥 full object
      console.log("RESPONSE DATA:", error.response?.data);
      console.log("STATUS:", error.response?.status);
      const msg =
        error.response?.data?.detail ||
        "Failed to send invite";

      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  // ── Shared micro-styles ─────────────────────────────────────────────────────
  const fieldStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 16px',
    background: 'var(--cream)',
    border: '1px solid rgba(22,15,8,0.1)',
    borderRadius: 12,
    fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14,
    color: 'var(--espresso)', outline: 'none',
    transition: 'border-color 0.2s',
  };
  const btnPrimary = (disabled) => ({
    padding: '11px 24px', borderRadius: 999, border: 'none',
    background: disabled ? 'rgba(22,15,8,0.12)' : 'var(--espresso)',
    color: disabled ? 'rgba(22,15,8,0.3)' : 'var(--cream)',
    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all 0.2s', flexShrink: 0,
  });

  const WhatsAppIcon = () => (
    <svg width="16" height="16" viewBox="0 0 32 32" fill="white">
      <path d="M16 .5C7.5.5.5 7.5.5 16c0 2.8.7 5.4 2 7.7L.5 31.5l8-2.1c2.2 1.2 4.7 1.9 7.5 1.9 8.5 0 15.5-7 15.5-15.5S24.5.5 16 .5zm0 28c-2.4 0-4.6-.6-6.5-1.7l-.5-.3-4.7 1.2 1.2-4.6-.3-.5C3.1 20.6 2.5 18.4 2.5 16 2.5 8.8 8.8 2.5 16 2.5S29.5 8.8 29.5 16 23.2 28.5 16 28.5zm7.5-9.6c-.4-.2-2.3-1.1-2.7-1.2-.4-.1-.6-.2-.9.2s-1 1.2-1.2 1.4c-.2.2-.4.3-.8.1-2.3-1.2-3.8-2.1-5.3-4.7-.4-.6.4-.6 1.1-2 .1-.2 0-.4 0-.6 0-.2-.9-2.1-1.2-2.9-.3-.7-.6-.6-.9-.6h-.8c-.3 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 3s1.3 3.5 1.5 3.7c.2.2 2.6 4 6.3 5.5.9.4 1.6.6 2.2.7.9.1 1.7.1 2.3.1.7-.1 2.3-.9 2.6-1.7.3-.8.3-1.5.2-1.7-.1-.2-.4-.3-.8-.5z" />
    </svg>
  );

  const TelegramIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M9.04 15.48l-.39 5.46c.56 0 .8-.24 1.1-.53l2.64-2.53 5.47 4c1 .55 1.72.26 1.97-.93l3.58-16.8h.01c.3-1.4-.5-1.94-1.47-1.58L1.2 9.34c-1.36.53-1.34 1.28-.23 1.63l5.63 1.76L19.47 5.6c.62-.38 1.18-.17.71.21" />
    </svg>
  );

  const TwitterIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M18.9 1.2h3.7l-8.1 9.2 9.5 12.6h-7.4l-5.8-7.6-6.7 7.6H.5l8.7-9.9L.1 1.2h7.6l5.2 6.9 6-6.9zm-1.3 19.5h2.1L6.5 3.3H4.3l13.3 17.4z" />
    </svg>
  );

  const InstagramIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M7 2C4.2 2 2 4.2 2 7v10c0 2.8 2.2 5 5 5h10c2.8 0 5-2.2 5-5V7c0-2.8-2.2-5-5-5H7zm5 5.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm6-1.3a1.2 1.2 0 1 1-1.2-1.2A1.2 1.2 0 0 1 18 6.2z" />
    </svg>
  );
  const socialBtn = (bg) => ({
    ...btnPrimary(false),
    background: bg,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,15,8,0.35)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--warm-white)', borderRadius: 24, padding: '32px 32px 28px', width: '100%', maxWidth: 480, boxShadow: '0 40px 100px rgba(22,15,8,0.2)', position: 'relative' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 6 }}>Share</div>
                <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px', color: 'var(--espresso)', margin: 0, lineHeight: 1.15, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{survey?.title}</h2>
              </div>
              <button onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 18, lineHeight: 1, padding: 4, transition: 'color 0.2s', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--espresso)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.3)'}>✕</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, padding: 5, background: 'var(--cream-deep)', borderRadius: 999, marginBottom: 28 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.2s', background: tab === t.id ? 'var(--espresso)' : 'transparent', color: tab === t.id ? 'var(--cream)' : 'rgba(22,15,8,0.4)' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Link tab ── */}
            {tab === 'link' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input readOnly value={surveyUrl} ref={inputRef}
                    onClick={e => e.target.select()}
                    style={{ ...fieldStyle, flex: 1, cursor: 'text', fontSize: 12, letterSpacing: '0.01em' }} />
                  <motion.button whileTap={{ scale: 0.96 }} onClick={copyLink}
                    style={{ ...btnPrimary(false), minWidth: 80, background: copied ? 'var(--sage)' : 'var(--espresso)' }}
                    onMouseEnter={e => { if (!copied) e.currentTarget.style.background = 'var(--coral)'; }}
                    onMouseLeave={e => { if (!copied) e.currentTarget.style.background = 'var(--espresso)'; }}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </motion.button>
                </div>
                <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.4)', margin: 0, lineHeight: 1.6 }}>
                  Share this link directly. Respondents don't need an account to take the survey.
                </p>
              </div>
            )}

            {/* ── QR tab ── */}
            {tab === 'qr' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ padding: 16, background: '#FDF5E8', borderRadius: 16, border: '1px solid rgba(22,15,8,0.08)' }}>
                  <QRCode url={surveyUrl} size={180} />
                </div>
                <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.45)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                  Print or display this QR code to collect in-person responses.
                </p>
                <button
                  onClick={() => {
                    const img = document.querySelector('#nx-qr-img') || document.querySelector('img[alt="QR code"]');
                    if (!img) return;
                    const a = document.createElement('a');
                    a.href = img.src;
                    a.download = `${survey?.slug}-qr.png`;
                    a.click();
                  }}
                  style={{ ...btnPrimary(false), padding: '11px 32px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
                  ↓ Download PNG
                </button>
              </div>
            )}

            {/* ── Embed tab ── */}
            {tab === 'embed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Size selector */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {EMBED_SIZES.map((s, i) => (
                    <button key={i} onClick={() => setEmbed(i)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `1.5px solid ${embedSize === i ? 'var(--espresso)' : 'rgba(22,15,8,0.1)'}`, background: embedSize === i ? 'var(--espresso)' : 'transparent', color: embedSize === i ? 'var(--cream)' : 'rgba(22,15,8,0.45)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                {/* Code block */}
                <div style={{ position: 'relative' }}>
                  <pre style={{ margin: 0, padding: '14px 16px', background: 'var(--espresso)', borderRadius: 14, fontFamily: 'monospace', fontSize: 11, color: 'rgba(253,245,232,0.75)', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {embedCode}
                  </pre>
                  <button onClick={copyEmbed}
                    style={{ position: 'absolute', top: 10, right: 10, padding: '5px 12px', borderRadius: 8, border: 'none', background: 'rgba(253,245,232,0.12)', color: 'rgba(253,245,232,0.6)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(253,245,232,0.22)'; e.currentTarget.style.color = 'rgba(253,245,232,0.9)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(253,245,232,0.12)'; e.currentTarget.style.color = 'rgba(253,245,232,0.6)'; }}>
                    Copy
                  </button>
                </div>
                <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 12, color: 'rgba(22,15,8,0.35)', margin: 0, lineHeight: 1.6 }}>
                  Paste this code into any webpage. The survey runs in a clean, no-chrome embed view.
                </p>
              </div>
            )}

            {/* ── Email tab ── */}
            {tab === 'email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.5)', margin: 0, lineHeight: 1.6 }}>
                  Send a personalised invitation with the survey link directly to someone's inbox.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendEmail()}
                    placeholder="recipient@example.com"
                    style={{ ...fieldStyle, flex: 1 }}
                    onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
                  />
                  <motion.button whileTap={{ scale: 0.96 }} onClick={sendEmail} disabled={sending}
                    style={{ ...btnPrimary(sending) }}
                    onMouseEnter={e => { if (!sending) e.currentTarget.style.background = 'var(--coral)'; }}
                    onMouseLeave={e => { if (!sending) e.currentTarget.style.background = 'var(--espresso)'; }}>
                    {sending ? '…' : 'Send'}
                  </motion.button>
                </div>
                <p style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.25)', margin: 0 }}>
                  Powered by Resend Email Service
                </p>
              </div>
            )}
            {tab === 'social' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <p style={{
                  fontFamily: 'Fraunces,serif',
                  fontSize: 13,
                  color: 'rgba(22,15,8,0.5)',
                  margin: 0
                }}>
                  Share this survey instantly across platforms.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                  {/* WhatsApp */}
                  <button
                    onClick={() => openShare(`https://wa.me/?text=${encodedText}%20${encodedUrl}`)}
                    style={socialBtn("#25D366")}
                  >
                    <WhatsAppIcon /> WhatsApp
                  </button>

                  {/* Telegram */}
                  <button
                    onClick={() => openShare(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`)}
                    style={socialBtn("#229ED9")}
                  >
                    <TelegramIcon /> Telegram
                  </button>

                  {/* Twitter/X */}
                  <button
                    onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`)}
                    style={socialBtn("#000")}
                  >
                    <TwitterIcon /> Twitter
                  </button>

                  {/* Instagram (info only) */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(surveyUrl);

                      // Try to open Instagram
                      window.open("https://www.instagram.com/", "_blank");

                      toast.success("Link copied! Paste it in Instagram bio or DM");
                    }}
                    style={{
                      ...socialBtn("linear-gradient(45deg,#f58529,#dd2a7b,#8134af,#515bd4)")
                    }}
                  >
                    <InstagramIcon /> Instagram
                  </button>
                </div>

                <p style={{
                  fontSize: 12,
                  color: 'rgba(22,15,8,0.35)',
                  margin: 0
                }}>
                  Instagram doesn't support direct sharing — link copied instead.
                </p>

              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
