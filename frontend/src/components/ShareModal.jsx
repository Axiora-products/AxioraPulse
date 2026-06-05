import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../api/axios';
import BulkEmailModal from './BulkEmailModal';
import BulkWhatsAppModal from './BulkWhatsAppModal';
import { parseFile } from '../utils/contactParser';



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


function ContactFileUploader({ type, fileData, setFileData, isParsing, setIsParsing }) {
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const result = await parseFile(file, type);
      setFileData({
        name: file.name,
        total: result.total,
        valid: result.valid,
        invalid: result.invalid
      });
      toast.success(`Loaded ${result.valid.length} valid contacts from ${file.name}`);
    } catch (err) {
      toast.error("Failed to parse the file");
    } finally {
      setIsParsing(false);
    }
  };

  const clearFile = () => {
    setFileData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!fileData ? (
        <div
          onClick={() => fileInputRef.current.click()}
          style={{
            border: '2px dashed rgba(22,15,8,0.1)',
            borderRadius: 12,
            padding: '16px 20px',
            textAlign: 'center',
            background: 'var(--cream)',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--coral)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.1)'}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 24, marginBottom: 6 }}>📥</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, color: 'var(--espresso)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isParsing ? 'Processing File...' : 'Upload List (.csv, .xlsx)'}
          </div>
          <div style={{ fontFamily: 'Fraunces,serif', fontSize: 11, color: 'rgba(22,15,8,0.4)', marginTop: 4 }}>
            Drag & drop or click to browse contact lists
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--cream)',
          border: '1px solid rgba(22,15,8,0.06)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, color: 'var(--espresso)', wordBreak: 'break-all' }}>
                {fileData.name}
              </span>
            </div>
            <button
              onClick={clearFile}
              style={{
                background: 'rgba(22,15,8,0.06)',
                border: 'none',
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 10,
                color: 'var(--espresso)'
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid rgba(22,15,8,0.04)', paddingTop: 8 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--espresso)' }}>{fileData.total}</div>
              <div style={{ fontSize: 8, fontFamily: 'Syne,sans-serif', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Total</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid rgba(22,15,8,0.04)', borderRight: '1px solid rgba(22,15,8,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#25D366' }}>{fileData.valid.length}</div>
              <div style={{ fontSize: 8, fontFamily: 'Syne,sans-serif', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Valid</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--terracotta)' }}>{fileData.invalid.length}</div>
              <div style={{ fontSize: 8, fontFamily: 'Syne,sans-serif', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Invalid</div>
            </div>
          </div>

          {fileData.invalid.length > 0 && (
            <div style={{
              background: 'rgba(214,59,31,0.04)',
              border: '1px solid rgba(214,59,31,0.15)',
              borderRadius: 8,
              padding: '8px 12px',
              maxHeight: 80,
              overflowY: 'auto',
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--terracotta)'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4, fontFamily: 'Syne,sans-serif', fontSize: 9, textTransform: 'uppercase' }}>
                ⚠️ Invalid Entries (will be ignored):
              </div>
              {fileData.invalid.map((item, idx) => (
                <div key={idx} style={{ borderBottom: '1px solid rgba(214,59,31,0.05)', paddingBottom: 2, marginBottom: 2 }}>
                  {item.value} - {item.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function ShareModal({ survey, isOpen, onClose }) {
  const [tab, setTab] = useState('link');
  const [copied, setCopied] = useState(false);
  const [embedSize, setEmbed] = useState(1);     // index into EMBED_SIZES
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);
  const [whatsAppNumbers, setWhatsAppNumbers] = useState('');
  const [whatsAppFile, setWhatsAppFile] = useState(null);
  const [isWhatsAppFileParsing, setIsWhatsAppFileParsing] = useState(false);
  const [isWhatsAppSubViewOpen, setIsWhatsAppSubViewOpen] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState(`Check out this survey: "${survey?.title || 'User Feedback'}"\n\nPlease participate: [link]`);
  const inputRef = useRef(null);

  const appOrigin = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
  const surveyUrl = `${appOrigin}/s/${survey?.slug}`;
  const embedUrl = `${appOrigin}/embed/${survey?.slug}`;
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
    if (!isOpen) {
      setTab('link');
      setCopied(false);
      setEmailTo('');
      setWhatsAppNumbers('');
      setWhatsAppFile(null);
      setIsWhatsAppFileParsing(false);
      setIsWhatsAppSubViewOpen(false);
      setSendingWhatsApp(false);
    } else {
      setWhatsAppMessage(`Hello! We would love to get your feedback on our survey: "${survey?.title || 'User Feedback'}"\n\nPlease tap this link to participate: ${surveyUrl}`);
    }
  }, [isOpen, survey, surveyUrl]);

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
      return toast.error("Enter email addresses");
    }

    // Split emails
    const emails = emailTo
      .split(",")
      .map(e => e.trim())
      .filter(Boolean);

    // Validate
    const invalid = emails.find(
      e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
    );

    if (invalid) {
      return toast.error(`Invalid email: ${invalid}`);
    }

    setSending(true);

    try {
      // Single email
      if (emails.length === 1) {
        await API.post("/users/share-survey", {
          email: emails[0],
          survey_link: surveyUrl,
          survey_title: survey?.title
        });
      } else {
        // Bulk email
        await API.post("/users/bulk-share-survey", {
          emails,
          survey_link: surveyUrl,
          survey_title: survey?.title
        });
      }

      toast.success(`Survey sent successfully`);
      setEmailTo("");

    } catch (error) {
      const msg =
        error.response?.data?.detail ||
        "Failed to send survey";

      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  function downloadBroadcastReport(results) {
    if (!results || results.length === 0) return;

    // Define CSV headers exactly matching the user's details
    const headers = ["Mobile Number", "Status", "Timestamp", "Reason/Error"];

    // Convert results to CSV rows
    const csvRows = [
      headers.join(","),
      ...results.map(r => {
        const mobile = (r.recipient || '').toString().replace(/"/g, '""');
        const rawStatus = r.status || '';
        const status = rawStatus === 'sent' ? 'sent successfully' : 'failed';
        const timestamp = (r.timestamp || '').replace(/"/g, '""');
        const reason = (r.reason || '').replace(/"/g, '""');
        return `"${mobile}","${status}","${timestamp}","${reason}"`;
      })
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n"); // Add UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    const timestampStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.setAttribute("href", url);
    link.setAttribute("download", `whatsapp_broadcast_report_${timestampStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function sendWhatsApp() {
    let numbersList = [];

    if (whatsAppFile) {
      if (!whatsAppFile.valid || whatsAppFile.valid.length === 0) {
        return toast.error("No valid phone numbers to send to");
      }
      numbersList = whatsAppFile.valid;
    } else {
      if (!whatsAppNumbers.trim()) {
        return toast.error("Enter phone numbers or upload a file");
      }

      // Split manual numbers by comma or new line
      numbersList = whatsAppNumbers
        .split(/[\n,]/)
        .map(n => n.replace(/[\s\-\(\)]/g, '').trim())
        .filter(Boolean);

      // Validate
      const invalidNum = numbersList.find(n => !/^\+?[1-9]\d{6,14}$/.test(n));
      if (invalidNum) {
        return toast.error(`Invalid mobile number format: ${invalidNum}`);
      }
    }

    setSendingWhatsApp(true);

    try {
      const res = await API.post("/users/bulk-share-whatsapp", {
        numbers: numbersList,
        survey_link: surveyUrl,
        survey_title: survey?.title,
        message: whatsAppMessage
      });

      const { sent, failed, results } = res.data;

      // Automatically trigger report spreadsheet download
      if (results && results.length > 0) {
        downloadBroadcastReport(results);
      }

      toast.success(`WhatsApp broadcast complete! Sent: ${sent}, Failed: ${failed}. Spreadsheet report downloaded.`, { duration: 6000 });
      setWhatsAppNumbers('');
      setWhatsAppFile(null);
      setIsWhatsAppSubViewOpen(false);

    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to send WhatsApp broadcast";
      toast.error(msg);
    } finally {
      setSendingWhatsApp(false);
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
    <>
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
              style={{ background: 'var(--warm-white)', borderRadius: 24, padding: '32px 32px 28px', width: '100%', maxWidth: 480, boxShadow: '0 40px 100px rgba(22,15,8,0.2)', position: 'relative', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 6 }}>Share</div>
                  <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px', color: 'var(--espresso)', margin: 0, lineHeight: 1.15, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{survey?.title}</h2>
                </div>
                <button id="share-modal-close-btn" onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 18, lineHeight: 1, padding: 4, transition: 'color 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--espresso)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.3)'}>✕</button>
              </div>

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 4, padding: 5, background: 'var(--cream-deep)', borderRadius: 999, marginBottom: 28, flexShrink: 0 }}>
                {TABS.map(t => (
                  <button id={`share-modal-tab-${t.id}`} key={t.id} onClick={() => setTab(t.id)}
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
                      id="share-modal-link-input"
                      onClick={e => e.target.select()}
                      style={{ ...fieldStyle, flex: 1, cursor: 'text', fontSize: 12, letterSpacing: '0.01em' }} />
                    <motion.button id="share-modal-copy-link-btn" whileTap={{ scale: 0.96 }} onClick={copyLink}
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
                    id="share-modal-download-qr-btn"
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
                      <button id={`share-modal-embed-size-${i}`} key={i} onClick={() => setEmbed(i)}
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
                    <button id="share-modal-copy-embed-btn" onClick={copyEmbed}
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
                      id="share-modal-email-input"
                      type="email"
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendEmail()}
                      placeholder="recipient@example.com"
                      style={{ ...fieldStyle, flex: 1 }}
                      onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                      onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
                    />
                    <motion.button id="share-modal-send-email-btn" whileTap={{ scale: 0.96 }} onClick={sendEmail} disabled={sending}
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
                  {!isWhatsAppSubViewOpen ? (
                    <>
                      <p style={{ fontFamily: 'Fraunces,serif', fontSize: 13, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
                        Share this survey instantly across platforms.
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {/* WhatsApp */}
                        <button
                          id="share-modal-whatsapp-toggle-btn"
                          onClick={() => setIsWhatsAppSubViewOpen(true)}
                          className="axiora-social-btn"                      >
                          <WhatsAppIcon /> WhatsApp
                        </button>

                        {/* Telegram */}
                        <button
                          id="share-modal-telegram-btn"
                          onClick={() => openShare(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`)}
                          className="axiora-social-btn"                      >
                          <TelegramIcon /> Telegram
                        </button>

                        {/* Twitter/X */}
                        <button
                          id="share-modal-twitter-btn"
                          onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`)}
                          className="axiora-social-btn"
                        >
                          <TwitterIcon /> Twitter
                        </button>

                        {/* Instagram */}
                        <button
                          id="share-modal-instagram-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(surveyUrl);
                            window.open("https://www.instagram.com/", "_blank");
                            toast.success("Link copied! Paste it in Instagram bio or DM");
                          }}
                          className="axiora-social-btn"
                        >
                          <InstagramIcon /> Instagram
                        </button>
                        {/* Facebook */}
                        <button
                          id="share-modal-facebook-btn"
                          onClick={() =>
                            openShare(
                              `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
                            )
                          }
                          className="axiora-social-btn"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.7.3-1 1-1z" />
                          </svg>

                          Facebook
                        </button>

                        {/* LinkedIn */}
                        <button
                          id="share-modal-linkedin-btn"
                          onClick={() =>
                            openShare(
                              `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
                            )
                          }
                          className="axiora-social-btn"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M6.94 8.5H3.56V20h3.38V8.5zM5.25 3A2.25 2.25 0 1 0 5.3 7.5 2.25 2.25 0 0 0 5.25 3zM20.44 13.06c0-3.38-1.8-4.95-4.2-4.95a3.63 3.63 0 0 0-3.28 1.8V8.5H9.56c.05.93 0 11.5 0 11.5h3.4v-6.42c0-.34.03-.68.12-.93.27-.68.9-1.38 1.96-1.38 1.38 0 1.93 1.04 1.93 2.57V20h3.4v-6.94z" />
                          </svg>

                          LinkedIn
                        </button>
                      </div>

                      <p style={{ fontSize: 12, color: 'rgba(22,15,8,0.35)', margin: 0 }}>
                        Instagram doesn't support direct sharing — link copied instead.
                      </p>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, color: '#25D366', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          WhatsApp Share Campaign
                        </span>
                        <button
                          id="share-modal-whatsapp-back-btn"
                          onClick={() => { setIsWhatsAppSubViewOpen(false); setWhatsAppFile(null); setWhatsAppNumbers(''); }}
                          style={{ background: 'none', border: 'none', color: 'rgba(22,15,8,0.4)', fontSize: 10, fontFamily: 'Syne,sans-serif', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}
                        >
                          ← Back to Social
                        </button>
                      </div>

                      <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 12, color: 'rgba(22,15,8,0.5)', margin: 0, lineHeight: 1.6 }}>
                        Send the survey invite via WhatsApp to individual numbers or in bulk using contact lists.
                      </p>

                      {/* Phone Number Input */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Manual Entry (Comma or new-line separated)
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            id="share-modal-whatsapp-numbers-input"
                            type="text"
                            value={whatsAppNumbers}
                            onChange={e => setWhatsAppNumbers(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendWhatsApp()}
                            placeholder={whatsAppFile ? "File selected — manual input disabled" : "+919876543210, +14155552671"}
                            disabled={!!whatsAppFile}
                            style={{ ...fieldStyle, flex: 1, opacity: whatsAppFile ? 0.5 : 1 }}
                            onFocus={e => e.target.style.borderColor = '#25D366'}
                            onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
                          />
                          <motion.button
                            id="share-modal-whatsapp-send-manual-btn"
                            whileTap={{ scale: 0.96 }}
                            onClick={sendWhatsApp}
                            disabled={sendingWhatsApp || !!whatsAppFile || !whatsAppNumbers.trim()}
                            style={{ ...btnPrimary(sendingWhatsApp || !!whatsAppFile || !whatsAppNumbers.trim()) }}
                            onMouseEnter={e => { if (!sendingWhatsApp && !whatsAppFile && whatsAppNumbers.trim()) e.currentTarget.style.background = 'var(--coral)'; }}
                            onMouseLeave={e => { if (!sendingWhatsApp && !whatsAppFile && whatsAppNumbers.trim()) e.currentTarget.style.background = 'var(--espresso)'; }}
                          >
                            {sendingWhatsApp ? '…' : 'Send'}
                          </motion.button>
                        </div>
                      </div>

                      {/* OR Divider */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }}></div>
                        <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }}></div>
                      </div>

                      {/* File Upload Zone */}
                      <ContactFileUploader
                        type="phone"
                        fileData={whatsAppFile}
                        setFileData={setWhatsAppFile}
                        isParsing={isWhatsAppFileParsing}
                        setIsParsing={setIsWhatsAppFileParsing}
                      />

                      {/* WhatsApp Custom Message text */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Custom Message Body
                        </label>
                        <textarea
                          id="share-modal-whatsapp-message-input"
                          rows={3}
                          value={whatsAppMessage}
                          onChange={e => setWhatsAppMessage(e.target.value)}
                          style={fieldStyle}
                          onFocus={e => e.target.style.borderColor = '#25D366'}
                          onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
                        />
                      </div>

                      {/* Action Button */}
                      <motion.button
                        id="share-modal-whatsapp-broadcast-btn"
                        whileTap={{ scale: 0.98 }}
                        onClick={sendWhatsApp}
                        disabled={sendingWhatsApp}
                        style={{
                          ...btnPrimary(sendingWhatsApp),
                          background: sendingWhatsApp ? 'rgba(22,15,8,0.12)' : '#25D366',
                          color: sendingWhatsApp ? 'rgba(22,15,8,0.3)' : '#FFF',
                          width: '100%',
                          justifyContent: 'center',
                          marginTop: 4
                        }}
                      >
                        {sendingWhatsApp ? 'Broadcasting...' : '🚀 Send WhatsApp Broadcast'}
                      </motion.button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Bulk Broadcast Modals */}
        <BulkEmailModal
          survey={survey}
          isOpen={isOpen && isBulkEmailOpen}
          onClose={() => setIsBulkEmailOpen(false)}
          surveyUrl={surveyUrl}
        />

        <BulkWhatsAppModal
          survey={survey}
          isOpen={isOpen && isBulkWhatsAppOpen}
          onClose={() => setIsBulkWhatsAppOpen(false)}
          surveyUrl={surveyUrl}
        />
      </AnimatePresence>
      <style>
        {`.axiora-social-btn {
  position: relative;
  overflow: hidden;

  height: 40px;
  width: 100%;

  border: 1px solid rgba(255,120,40,0.08);
  border-radius: 18px;

  background:
    linear-gradient(
      135deg,
      #140602 0%,
      #2b0d02 45%,
      #3a1204 100%
    );

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  color: rgba(255,255,255,0.92);

  font-family: 'Syne', sans-serif;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  cursor: pointer;

  transition:
    transform 0.25s ease,
    background 0.25s ease,
    box-shadow 0.25s ease,
    border-color 0.25s ease;

  box-shadow:
    0 10px 26px rgba(0,0,0,0.12),
    inset 0 1px 0 rgba(255,255,255,0.03);
}

/* ICON STYLE */
.axiora-social-btn svg {
  transition:
    transform 0.25s ease,
    filter 0.25s ease;
}

/* PREMIUM HOVER */
.axiora-social-btn:hover {
  background:
    linear-gradient(
      135deg,
      #ff8f42 0%,
      #ff641f 45%,
      #ff4d00 100%
    );

  border-color: rgba(255,140,60,0.35);

  transform: translateY(-2px);

  box-shadow:
    0 18px 38px rgba(255,90,0,0.22),
    0 0 24px rgba(255,120,40,0.12);
}

/* ICON HOVER */
.axiora-social-btn:hover svg {
  transform: scale(1.08);

  filter:
    drop-shadow(0 0 10px rgba(255,255,255,0.22));
}

/* SHINE EFFECT */
.axiora-social-btn::before {
  content: '';

  position: absolute;
  inset: 0;

  background:
    linear-gradient(
      120deg,
      transparent 20%,
      rgba(255,255,255,0.12) 50%,
      transparent 80%
    );

  transform: translateX(-120%);
  transition: transform 0.8s ease;
}

.axiora-social-btn:hover::before {
  transform: translateX(120%);
}

/* CLICK */
.axiora-social-btn:active {
  transform: scale(0.98);
}`}
      </style>
    </>
  );
}
