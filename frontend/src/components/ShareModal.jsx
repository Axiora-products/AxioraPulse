import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../api/axios';
import BulkEmailModal from './BulkEmailModal';
import BulkWhatsAppModal from './BulkWhatsAppModal';
import { parseFile } from '../utils/contactParser';
import { getApiErrorMessage } from '../lib/apiError';



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


export default function ShareModal({ survey, isOpen, onClose, onSlugChange, onPublished }) {
  const [tab, setTab] = useState('link');
  // A draft survey's public link 404s (drafts are hidden from respondents), so the
  // share UI is gated behind publishing. statusOverride flips to 'active' on publish.
  const [statusOverride, setStatusOverride] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const isDraft = ((statusOverride ?? survey?.status) || '').toString().toLowerCase() === 'draft';

  const publishNow = async () => {
    if (!survey?.id) return;
    setPublishing(true);
    try {
      await API.patch(`/surveys/${survey.id}/status`, { status: 'active' });
      setStatusOverride('active');
      onPublished?.();
      toast.success('Survey published — your share link is now live');
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Add a title and at least 2 questions before publishing.'));
    } finally {
      setPublishing(false);
    }
  };
  const [copied, setCopied] = useState(false);
  const [currentSlug, setCurrentSlug] = useState(survey?.slug || '');
  const [slugDraft, setSlugDraft] = useState(survey?.slug || '');
  const [slugStatus, setSlugStatus] = useState('idle'); // idle | checking | available | taken | invalid
  const [savingSlug, setSavingSlug] = useState(false);
  const [embedSize, setEmbed] = useState(1);     // index into EMBED_SIZES
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);
  const [whatsAppNumbers, setWhatsAppNumbers] = useState('');
  const [whatsAppFile, setWhatsAppFile] = useState(null);
  const [isWhatsAppFileParsing, setIsWhatsAppFileParsing] = useState(false);
  const [whatsAppView, setWhatsAppView] = useState(null); // null | 'choice' | 'bulk'
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState(`Check out this survey: "${survey?.title || 'User Feedback'}"\n\nPlease participate: [link]`);
  const [telegramView, setTelegramView] = useState(null); // null | 'choice' | 'bulk'
  const [telegramUsernames, setTelegramUsernames] = useState('');
  const [telegramFile, setTelegramFile] = useState(null);
  const [isTelegramFileParsing, setIsTelegramFileParsing] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');
  const [facebookView, setFacebookView] = useState(null); // null | 'choice'
  const [instagramView, setInstagramView] = useState(null); // null | 'choice'
  const [twitterView, setTwitterView] = useState(null); // null | 'choice'
  // ── AI Social Share Kit ────────────────────────────────────────────────────
  const [aiSocialContent, setAiSocialContent] = useState(null);
  const [aiSocialLoading, setAiSocialLoading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('linkedin');
  const [copiedChip, setCopiedChip] = useState(null);
  const [aiWhatsAppCaption, setAiWhatsAppCaption] = useState('');
  const shareCardCanvasRef = useRef(null);
  const inputRef = useRef(null);

  const appOrigin = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
  const surveyUrl = `${appOrigin}/s/${currentSlug}`;
  const embedUrl = `${appOrigin}/embed/${currentSlug}`;
  // Tag the public link with its acquisition channel so responses are attributable
  // per source (whatsapp, linkedin, email, qr, …). The plain link stays clean → 'direct'.
  const withSource = (src) => `${surveyUrl}?src=${src}`;
  const sel = EMBED_SIZES[embedSize];
  const embedCode = `<iframe\n  src="${embedUrl}"\n  width="${sel.w}"\n  height="${sel.h}"\n  frameborder="0"\n  style="border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.12)"\n  allow="clipboard-write"\n></iframe>`;
  const shareText = `Check this survey: ${survey?.title}`;
  const encodedUrl = encodeURIComponent(surveyUrl);
  const encodedText = encodeURIComponent(shareText);

  function openShare(url) {
    window.open(url, "_blank");
  }

  async function nativeShare() {
    // Build the best available caption (AI WhatsApp or fallback)
    const caption = (() => {
      if (aiSocialContent?.captions?.whatsapp) {
        return aiSocialContent.captions.whatsapp
          .replace(/\[link\]/gi, surveyUrl)
          .replace(/\[survey link\]/gi, surveyUrl);
      }
      const desc = survey?.description || `Please take a moment to share your feedback on: "${survey?.title || 'Survey'}".`;
      return `📊 We'd love your feedback!\n\n${desc}\n\n👉 ${surveyUrl}`;
    })();

    const canvas = shareCardCanvasRef.current;

    // 1️⃣ Web Share API WITH image file (Android/iOS mobile)
    if (navigator.share && canvas) {
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], `${survey?.slug || 'survey'}-share-card.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: survey?.title || 'Survey', text: caption });
            return;
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        // fall through to text-only share
      }
    }

    // 2️⃣ Text-only Web Share API
    if (navigator.share) {
      try {
        await navigator.share({ title: survey?.title || 'Survey', text: caption, url: surveyUrl });
      } catch (err) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard.writeText(caption);
          toast.success('Caption copied — paste it in any app!');
        }
      }
    } else {
      // 3️⃣ Desktop clipboard fallback
      await navigator.clipboard.writeText(caption);
      toast.success('Caption copied — paste it in any messaging app!');
    }
  }
  // ── AI Social Content Fetcher ──────────────────────────────────────────────
  const fetchAISocialContent = useCallback(async () => {
    if (!survey?.id || aiSocialContent || aiSocialLoading) return;
    setAiSocialLoading(true);
    try {
      const res = await API.post('/ai/social-share-content', { survey_id: survey.id });
      setAiSocialContent(res.data);
    } catch (err) {
      console.error('[ShareModal] AI social content error:', err);
      toast.error('Could not load AI content — using basic share text');
    } finally {
      setAiSocialLoading(false);
    }
  }, [survey?.id, aiSocialContent, aiSocialLoading]);

  // ── Canvas Share Card Renderer ─────────────────────────────────────────────
  const drawShareCard = useCallback(() => {
    const canvas = shareCardCanvasRef.current;
    if (!canvas) return;
    const W = 800, H = 420;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background gradient (espresso → deep brown)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#160F08');
    bgGrad.addColorStop(0.6, '#2C1A0E');
    bgGrad.addColorStop(1, '#1A0A03');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Coral accent glow (top-right)
    const glow1 = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 300);
    glow1.addColorStop(0, 'rgba(255,69,0,0.28)');
    glow1.addColorStop(1, 'rgba(255,69,0,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);

    // Saffron glow (bottom-left)
    const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.9, 0, W * 0.1, H * 0.9, 220);
    glow2.addColorStop(0, 'rgba(255,184,0,0.18)');
    glow2.addColorStop(1, 'rgba(255,184,0,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // Left coral accent bar
    const barGrad = ctx.createLinearGradient(0, 0, 0, H);
    barGrad.addColorStop(0, '#FF4500');
    barGrad.addColorStop(1, '#FFB800');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, 5, H);

    // Branding label
    ctx.font = '700 11px "Arial", sans-serif';
    ctx.letterSpacing = '0.2em';
    ctx.fillStyle = 'rgba(255,69,0,0.7)';
    ctx.fillText('AXIORAPULSE', 44, 50);

    // Survey title
    const title = survey?.title || 'Survey';
    ctx.font = 'bold 38px "Georgia", serif';
    ctx.fillStyle = '#FDF5E8';
    const maxW = W - 88;
    let titleLine = title;
    if (ctx.measureText(title).width > maxW) {
      const words = title.split(' ');
      let line1 = '', line2 = '';
      for (const w of words) {
        if (ctx.measureText(line1 + w).width < maxW) line1 += (line1 ? ' ' : '') + w;
        else line2 += (line2 ? ' ' : '') + w;
      }
      ctx.fillText(line1, 44, 130);
      ctx.font = 'bold 32px "Georgia", serif';
      ctx.fillText(line2, 44, 175);
    } else {
      ctx.fillText(titleLine, 44, 140);
    }

    // Tagline
    const tagline = aiSocialContent?.tagline || 'Share your insights. Shape the future.';
    ctx.font = '300 17px "Georgia", serif';
    ctx.fillStyle = 'rgba(253,245,232,0.65)';
    const tagWords = tagline.split(' ');
    let tagLine = '', tagY = 210;
    for (const w of tagWords) {
      if (ctx.measureText(tagLine + w).width < maxW) { tagLine += (tagLine ? ' ' : '') + w; }
      else { ctx.fillText(tagLine, 44, tagY); tagLine = w; tagY += 26; }
    }
    if (tagLine) ctx.fillText(tagLine, 44, tagY);

    // Hashtags (top 5)
    const tags = (aiSocialContent?.hashtags || []).slice(0, 5);
    if (tags.length) {
      let tx = 44;
      const ty = H - 86;
      ctx.font = '700 12px "Arial", sans-serif';
      for (const tag of tags) {
        const tw = ctx.measureText(tag).width + 20;
        const rx = tx, ry = ty - 18, rw = tw, rh = 28;
        ctx.fillStyle = 'rgba(255,69,0,0.18)';
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,69,0,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#FF6B35';
        ctx.fillText(tag, tx + 10, ty + 4);
        tx += tw + 8;
        if (tx > W - 200) break;
      }
    }

    // Divider line
    ctx.strokeStyle = 'rgba(253,245,232,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(44, H - 52);
    ctx.lineTo(W - 44, H - 52);
    ctx.stroke();

    // Bottom row: survey URL hint + watermark
    ctx.font = '400 11px "Arial", sans-serif';
    ctx.fillStyle = 'rgba(253,245,232,0.3)';
    ctx.fillText('Powered by AxioraPulse · axiorapulse.com', 44, H - 24);

    // Pulse dot watermark (top right corner)
    ctx.fillStyle = '#FF4500';
    ctx.beginPath();
    ctx.arc(W - 44, 44, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,69,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W - 44, 44, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W - 44, 44, 22, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,69,0,0.15)';
    ctx.stroke();
  }, [survey?.title, aiSocialContent]);

  // Redraw canvas whenever content updates
  useEffect(() => {
    if (tab === 'social') drawShareCard();
  }, [tab, drawShareCard]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setTab('link');
      setCopied(false);
      setEmailTo('');
      setWhatsAppNumbers('');
      setWhatsAppFile(null);
      setIsWhatsAppFileParsing(false);
      setWhatsAppView(null);
      setSendingWhatsApp(false);
      setTelegramView(null);
      setTelegramUsernames('');
      setTelegramFile(null);
      setIsTelegramFileParsing(false);
      setSendingTelegram(false);
      setFacebookView(null);
      setInstagramView(null);
      setTwitterView(null);
      // Reset AI social state on close
      setAiSocialContent(null);
      setAiSocialLoading(false);
      setSelectedPlatform('linkedin');
      setCopiedChip(null);
      setAiWhatsAppCaption('');
    } else {
      const intro = `Hello! We would love to get your feedback on our survey: "${survey?.title || 'User Feedback'}"\n\nPlease tap this link to participate:`;
      setWhatsAppMessage(`${intro} ${withSource('whatsapp')}`);
      setTelegramMessage(`${intro} ${withSource('telegram')}`);
      setCurrentSlug(survey?.slug || '');
      setSlugDraft(survey?.slug || '');
      setSlugStatus('idle');
    }
  }, [isOpen, survey, surveyUrl]);

  // When AI content loads, sync WhatsApp/Telegram sub-panel messages with AI captions
  useEffect(() => {
    if (!aiSocialContent || !surveyUrl) return;
    const resolve = (raw) =>
      raw ? raw.replace(/\[link\]/gi, surveyUrl).replace(/\[survey link\]/gi, surveyUrl) : '';
    const waCaption = resolve(aiSocialContent.captions?.whatsapp);
    if (waCaption) {
      setWhatsAppMessage(waCaption);
      setAiWhatsAppCaption(waCaption);
    }
    const tgCaption = resolve(aiSocialContent.captions?.telegram);
    if (tgCaption) setTelegramMessage(tgCaption);
  }, [aiSocialContent, surveyUrl]);

  // Debounced custom survey slug availability check
  useEffect(() => {
    const trimmed = slugDraft.trim();
    if (!trimmed || trimmed === currentSlug) {
      setSlugStatus('idle');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(trimmed)) {
      setSlugStatus('invalid');
      return;
    }

    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const params = { slug: trimmed };
        if (survey?.id && survey.id !== 'undefined' && survey.id !== 'null') {
          params.exclude_survey_id = survey.id;
        }
        const res = await API.get('/surveys/check-slug', { params });
        if (res.data?.available) {
          setSlugStatus('available');
        } else if (res.data?.reason === 'invalid') {
          setSlugStatus('invalid');
        } else {
          setSlugStatus('taken');
        }
      } catch (err) {
        console.error('Failed to check slug availability:', err);
        setSlugStatus('taken');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slugDraft, currentSlug, survey?.id]);

  async function saveSlug() {
    const trimmed = slugDraft.trim();
    if (!trimmed || trimmed === currentSlug || slugStatus !== 'available') return;
    setSavingSlug(true);
    try {
      await API.patch(`/surveys/${survey.id}`, { slug: trimmed });
      setCurrentSlug(trimmed);
      setSlugStatus('idle');
      toast.success('Survey link updated successfully!');
      if (onSlugChange) {
        onSlugChange(trimmed);
      }
    } catch (err) {
      console.error('Failed to save slug:', err);
      toast.error(getApiErrorMessage(err, 'Failed to update survey link'));
    } finally {
      setSavingSlug(false);
    }
  }



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
          survey_link: withSource('email'),
          survey_title: survey?.title
        });
      } else {
        // Bulk email
        await API.post("/users/bulk-share-survey", {
          emails,
          survey_link: withSource('email'),
          survey_title: survey?.title
        });
      }

      toast.success(`Survey sent successfully`);
      setEmailTo("");

    } catch (error) {
      const msg =
        getApiErrorMessage(error, "Failed to send survey");

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
        survey_link: withSource('whatsapp'),
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
      setWhatsAppView(null);

    } catch (error) {
      const msg = getApiErrorMessage(error, "Failed to send WhatsApp broadcast");
      toast.error(msg);
    } finally {
      setSendingWhatsApp(false);
    }
  }

  async function sendTelegram() {
    let recipientsList = [];
    if (telegramFile) {
      if (!telegramFile.valid || telegramFile.valid.length === 0) {
        return toast.error("No valid entries to send to");
      }
      recipientsList = telegramFile.valid;
    } else {
      if (!telegramUsernames.trim()) {
        return toast.error("Enter Telegram usernames or upload a file");
      }
      recipientsList = telegramUsernames.split(/[\n,]/).map(n => n.trim()).filter(Boolean);
    }
    setSendingTelegram(true);
    try {
      const res = await API.post("/users/bulk-share-telegram", {
        recipients: recipientsList,
        survey_link: withSource('telegram'),
        survey_title: survey?.title,
        message: telegramMessage
      });
      const { sent, failed } = res.data;
      toast.success(`Telegram broadcast complete! Sent: ${sent}, Failed: ${failed}.`, { duration: 6000 });
      setTelegramUsernames('');
      setTelegramFile(null);
      setTelegramView(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to send Telegram broadcast"));
    } finally {
      setSendingTelegram(false);
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
                <button onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 18, lineHeight: 1, padding: 4, transition: 'color 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--espresso)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.3)'}>✕</button>
              </div>

              {isDraft ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 8px 12px' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,184,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 18 }}>📋</div>
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 20, color: 'var(--espresso)', margin: '0 0 10px' }}>Publish your survey to share it</h3>
                  <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.55)', lineHeight: 1.6, maxWidth: 360, margin: '0 0 24px' }}>
                    This survey is still a draft, so its public link isn’t live yet. Publish it to make the shareable link work for respondents.
                  </p>
                  <button onClick={publishNow} disabled={publishing}
                    style={{ padding: '13px 30px', borderRadius: 999, border: 'none', background: 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: publishing ? 'wait' : 'pointer', opacity: publishing ? 0.6 : 1 }}>
                    {publishing ? 'Publishing…' : 'Publish & Share'}
                  </button>
                </div>
              ) : (<>

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 4, padding: 5, background: 'var(--cream-deep)', borderRadius: 999, marginBottom: 28, flexShrink: 0 }}>
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

                  {/* Customize the link as a clean, user-defined slug */}
                  {survey?.id && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', background: 'var(--cream)', border: '1px solid rgba(22,15,8,0.06)', borderRadius: 12 }}>
                      <label style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>
                        Customize link
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ ...fieldStyle, flex: 1, display: 'flex', alignItems: 'center', padding: '0 0 0 12px', overflow: 'hidden', background: 'var(--warm-white)' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(22,15,8,0.35)', whiteSpace: 'nowrap' }}>/s/</span>
                          <input
                            value={slugDraft}
                            onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            onKeyDown={e => { if (e.key === 'Enter' && slugStatus === 'available') saveSlug(); }}
                            placeholder="my-clean-link"
                            maxLength={50}
                            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'monospace', fontSize: 12, color: 'var(--espresso)', padding: '12px 12px 12px 2px' }}
                          />
                        </div>
                        <motion.button whileTap={{ scale: 0.96 }} onClick={saveSlug}
                          disabled={savingSlug || slugStatus !== 'available'}
                          style={{ ...btnPrimary(savingSlug || slugStatus !== 'available'), minWidth: 80 }}>
                          {savingSlug ? '…' : 'Save'}
                        </motion.button>
                      </div>
                      {/* Availability / validation status */}
                      <div style={{ minHeight: 14, fontFamily: 'Syne,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
                        {slugDraft.trim() !== currentSlug && slugStatus === 'invalid' && (
                          <span style={{ color: 'var(--terracotta)' }}>Use lowercase letters, numbers and hyphens only</span>
                        )}
                        {slugDraft.trim() !== currentSlug && slugStatus === 'checking' && (
                          <span style={{ color: 'rgba(22,15,8,0.4)' }}>Checking availability…</span>
                        )}
                        {slugDraft.trim() !== currentSlug && slugStatus === 'available' && (
                          <span style={{ color: 'var(--sage)' }}>✓ Available</span>
                        )}
                        {slugDraft.trim() !== currentSlug && slugStatus === 'taken' && (
                          <span style={{ color: 'var(--terracotta)' }}>✕ Already taken — try another</span>
                        )}
                      </div>
                    </div>
                  )}

                  <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.4)', margin: 0, lineHeight: 1.6 }}>
                    Give your survey a clean, memorable link, then share it anywhere. Respondents don't need an account to take the survey.
                  </p>
                </div>
              )}

              {/* ── QR tab ── */}
              {tab === 'qr' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                  <div style={{ padding: 16, background: '#FDF5E8', borderRadius: 16, border: '1px solid rgba(22,15,8,0.08)' }}>
                    <QRCode url={withSource('qr')} size={180} />
                  </div>
                  <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.45)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                    Print or display this QR code to collect in-person responses.
                  </p>
                  <button
                    onClick={async () => {
                      const img = document.querySelector('#nx-qr-img') || document.querySelector('img[alt="QR code"]');
                      if (!img) return;
                      try {
                        const response = await fetch(img.src);
                        const blob = await response.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = `${survey?.slug || 'survey'}-qr.png`;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                      } catch (err) {
                        console.error('QR download failed, opening in new tab:', err);
                        window.open(img.src, '_blank');
                      }
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
              {tab === 'social' && (() => {
                // Trigger AI fetch when the Social tab opens
                if (!aiSocialContent && !aiSocialLoading) {
                  fetchAISocialContent();
                }

                const PLATFORMS = [
                  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.94 8.5H3.56V20h3.38V8.5zM5.25 3A2.25 2.25 0 1 0 5.3 7.5 2.25 2.25 0 0 0 5.25 3zM20.44 13.06c0-3.38-1.8-4.95-4.2-4.95a3.63 3.63 0 0 0-3.28 1.8V8.5H9.56c.05.93 0 11.5 0 11.5h3.4v-6.42c0-.34.03-.68.12-.93.27-.68.9-1.38 1.96-1.38 1.38 0 1.93 1.04 1.93 2.57V20h3.4v-6.94z"/></svg>
                  )},
                  { id: 'twitter', label: 'X / Twitter', color: '#000000', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.2h3.7l-8.1 9.2 9.5 12.6h-7.4l-5.8-7.6-6.7 7.6H.5l8.7-9.9L.1 1.2h7.6l5.2 6.9 6-6.9zm-1.3 19.5h2.1L6.5 3.3H4.3l13.3 17.4z"/></svg>
                  )},
                  { id: 'instagram', label: 'Instagram', color: '#E1306C', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2C4.2 2 2 4.2 2 7v10c0 2.8 2.2 5 5 5h10c2.8 0 5-2.2 5-5V7c0-2.8-2.2-5-5-5H7zm5 5.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm6-1.3a1.2 1.2 0 1 1-1.2-1.2A1.2 1.2 0 0 1 18 6.2z"/></svg>
                  )},
                  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: (
                    <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor"><path d="M16 .5C7.5.5.5 7.5.5 16c0 2.8.7 5.4 2 7.7L.5 31.5l8-2.1c2.2 1.2 4.7 1.9 7.5 1.9 8.5 0 15.5-7 15.5-15.5S24.5.5 16 .5zm0 28c-2.4 0-4.6-.6-6.5-1.7l-.5-.3-4.7 1.2 1.2-4.6-.3-.5C3.1 20.6 2.5 18.4 2.5 16 2.5 8.8 8.8 2.5 16 2.5S29.5 8.8 29.5 16 23.2 28.5 16 28.5zm7.5-9.6c-.4-.2-2.3-1.1-2.7-1.2-.4-.1-.6-.2-.9.2s-1 1.2-1.2 1.4c-.2.2-.4.3-.8.1-2.3-1.2-3.8-2.1-5.3-4.7-.4-.6.4-.6 1.1-2 .1-.2 0-.4 0-.6 0-.2-.9-2.1-1.2-2.9-.3-.7-.6-.6-.9-.6h-.8c-.3 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 3s1.3 3.5 1.5 3.7c.2.2 2.6 4 6.3 5.5.9.4 1.6.6 2.2.7.9.1 1.7.1 2.3.1.7-.1 2.3-.9 2.6-1.7.3-.8.3-1.5.2-1.7-.1-.2-.4-.3-.8-.5z"/></svg>
                  )},
                  { id: 'telegram', label: 'Telegram', color: '#229ED9', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9.04 15.48l-.39 5.46c.56 0 .8-.24 1.1-.53l2.64-2.53 5.47 4c1 .55 1.72.26 1.97-.93l3.58-16.8h.01c.3-1.4-.5-1.94-1.47-1.58L1.2 9.34c-1.36.53-1.34 1.28-.23 1.63l5.63 1.76L19.47 5.6c.62-.38 1.18-.17.71.21"/></svg>
                  )},
                  { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.87v2.28h3.32l-.53 3.5h-2.79V24C19.62 23.1 24 18.1 24 12.07z"/></svg>
                  )},
                ];

                const platformActions = {
                  // LinkedIn supports title + summary params to pre-fill the post body
                  linkedin: (caption) => {
                    const summary = encodeURIComponent(caption.substring(0, 400));
                    return `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(withSource('linkedin'))}&title=${encodeURIComponent(survey?.title || '')}&summary=${summary}`;
                  },
                  // Twitter pre-fills the tweet text box ✔
                  twitter: (caption) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`,
                  // Instagram has no web share intent — handled separately in openPlatform()
                  instagram: () => null,
                  // WhatsApp pre-fills the message box via wa.me ✔
                  whatsapp: (caption) => `https://wa.me/?text=${encodeURIComponent(caption)}`,
                  // Telegram: pass text separately from URL to avoid duplication in the pre-fill
                  telegram: (caption) => {
                    const textOnly = caption
                      .replace(withSource('telegram'), '')
                      .replace(/\n{3,}/g, '\n\n')
                      .trim();
                    return `https://t.me/share/url?url=${encodeURIComponent(withSource('telegram'))}&text=${encodeURIComponent(textOnly)}`;
                  },
                  // Facebook sharer only accepts a URL; caption is copied to clipboard for manual paste
                  facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withSource('facebook'))}`,
                };

                function getCaption(platformId) {
                  const fallback = () => {
                    const desc = survey?.description || `Please take a moment to share your feedback on our survey: "${survey?.title || 'User Feedback'}".`;
                    const cleanTitle = (survey?.title || '').replace(/[^a-zA-Z0-9]/g, '');
                    const hashtags = cleanTitle ? `#${cleanTitle} #Feedback #Survey` : '#Feedback #Survey';
                    return `📊 We'd love your feedback!\n\n${desc}\n\n👉 ${withSource(platformId)}\n\n${hashtags}`;
                  };
                  if (!aiSocialContent) return fallback();
                  const raw = aiSocialContent.captions?.[platformId];
                  if (!raw) return fallback();
                  return raw.replace(/\[link\]/gi, withSource(platformId)).replace(/\[survey link\]/gi, withSource(platformId));
                }

                async function copyCaption() {
                  const text = getCaption(selectedPlatform);
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success(`${PLATFORMS.find(p => p.id === selectedPlatform)?.label} caption copied!`);
                  } catch (err) {
                    console.error('Failed to copy caption to clipboard:', err);
                    toast.error('Failed to copy to clipboard');
                  }
                }

                async function copyHashtag(tag) {
                  try {
                    await navigator.clipboard.writeText(tag);
                    setCopiedChip(tag);
                    setTimeout(() => setCopiedChip(null), 1800);
                  } catch (err) {
                    console.error('Failed to copy hashtag:', err);
                  }
                }

                async function copyAllHashtags() {
                  const tags = (aiSocialContent?.hashtags || []).join(' ');
                  try {
                    await navigator.clipboard.writeText(tags);
                    toast.success('All hashtags copied!');
                  } catch (err) {
                    console.error('Failed to copy hashtags:', err);
                  }
                }

                // Build a clean human-readable filename from the survey title
                function buildFilename() {
                  const raw = survey?.title || survey?.slug || 'survey';
                  const safe = raw
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 50);
                  return `${safe || 'survey'}-share-card.png`;
                }

                function downloadShareCard() {
                  const canvas = shareCardCanvasRef.current;
                  if (!canvas) { toast.error('Share card is not ready yet'); return; }
                  const filename = buildFilename();

                  try {
                    // ✅ Use data: URL — a.download is always respected with data: URLs
                    // (blob: URLs lose the filename in some browsers/security contexts)
                    const dataUrl = canvas.toDataURL('image/png');
                    if (!dataUrl || dataUrl === 'data:,') throw new Error('Canvas empty');

                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = filename;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    toast.success(`📥 Downloaded: ${filename}`);
                  } catch (err) {
                    console.error('Data URL download failed, trying server fallback:', err);
                    fallbackServerDownload();
                  }

                  function fallbackServerDownload() {
                    try {
                      const dataUrl = canvas.toDataURL('image/png');
                      const form = document.createElement('form');
                      form.method = 'POST';
                      form.target = '_self';
                      
                      let actionUrl = API.defaults.baseURL || '';
                      if (actionUrl.startsWith('/')) {
                        actionUrl = `${window.location.origin}${actionUrl}`;
                      } else if (!actionUrl && import.meta.env.VITE_API_BASE_URL) {
                        actionUrl = import.meta.env.VITE_API_BASE_URL;
                      }
                      
                      form.action = `${actionUrl}/ai/download-image`;
                      form.style.display = 'none';

                      const imgInput = document.createElement('input');
                      imgInput.type = 'hidden';
                      imgInput.name = 'image';
                      imgInput.value = dataUrl;
                      form.appendChild(imgInput);

                      const fileInput = document.createElement('input');
                      fileInput.type = 'hidden';
                      fileInput.name = 'filename';
                      fileInput.value = filename;
                      form.appendChild(fileInput);

                      document.body.appendChild(form);
                      form.submit();
                      document.body.removeChild(form);
                    } catch (fallbackErr) {
                      console.error('Server fallback download failed:', fallbackErr);
                      toast.error('Failed to download image');
                    }
                  }
                }

                async function copyImageToClipboard() {
                  const canvas = shareCardCanvasRef.current;
                  if (!canvas) { toast.error('Share card is not ready yet'); return; }
                  try {
                    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
                    if (!blob) throw new Error('Canvas produced no blob');
                    // Clipboard API — works in Chrome/Edge on HTTPS and localhost
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    toast.success('🖼️ Share card image copied to clipboard! Paste it directly into your post.');
                  } catch (err) {
                    console.warn('Clipboard image write not supported, falling back to download:', err);
                    // Fallback: download the file so user can attach it manually
                    downloadShareCard();
                    toast('📥 Image downloaded — attach it to your post when prompted.', { icon: '📎', duration: 5000 });
                  }
                }

                async function openPlatform() {
                  const caption = getCaption(selectedPlatform);
                  const platform = PLATFORMS.find(p => p.id === selectedPlatform);
                  const label   = platform?.label || selectedPlatform;
                  const canvas  = shareCardCanvasRef.current;

                  // ── Instagram: Web Share API with image on mobile; copy+open on desktop ──
                  if (selectedPlatform === 'instagram') {
                    if (navigator.share && canvas) {
                      try {
                        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
                        if (blob) {
                          const file = new File(
                            [blob],
                            buildFilename(),
                            { type: 'image/png' }
                          );
                          if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({ files: [file], title: survey?.title || 'Survey', text: caption });
                            return;
                          }
                        }
                      } catch (err) {
                        if (err.name === 'AbortError') return;
                      }
                    }
                    // Desktop fallback: copy caption + download image + open Instagram
                    try { await navigator.clipboard.writeText(caption); } catch (e) {}
                    downloadShareCard();
                    window.open('https://www.instagram.com/', '_blank');
                    toast.success('📸 Caption copied + image downloading! Paste the caption and attach the image when creating your Instagram post.', { duration: 7000 });
                    return;
                  }

                  // ── All other platforms ──
                  // 1. Copy caption (text + hashtags) to clipboard
                  try {
                    await navigator.clipboard.writeText(caption);
                  } catch (err) {
                    console.error('Clipboard write failed:', err);
                  }

                  // 2. Also download the share card so user can attach it to the post
                  downloadShareCard();

                  const urlFn = platformActions[selectedPlatform];
                  const url   = urlFn?.(caption);

                  const platformToasts = {
                    linkedin: '↗ LinkedIn opened — caption pre-filled + image downloading! Attach the image to your post.',
                    twitter:  '↗ X / Twitter opened — post pre-filled + image downloading! Attach the image.',
                    whatsapp: '↗ WhatsApp opened — message pre-filled! Send the image separately if needed.',
                    telegram: '↗ Telegram opened — message pre-filled! Send the image separately if needed.',
                    facebook: '↗ Facebook opened — caption copied + image downloading! Paste caption & upload image.',
                  };

                  if (url) {
                    toast.success(platformToasts[selectedPlatform] || `Caption copied! Opening ${label}…`, { duration: 6000 });
                    setTimeout(() => window.open(url, '_blank'), 200);
                  }
                }

                const shimmerStyle = {
                  background: 'linear-gradient(90deg, rgba(22,15,8,0.05) 25%, rgba(22,15,8,0.1) 50%, rgba(22,15,8,0.05) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.4s infinite',
                  borderRadius: 8,
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Share Card Canvas */}
                    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(22,15,8,0.08)', position: 'relative' }}>
                      <canvas
                        ref={shareCardCanvasRef}
                        style={{ width: '100%', display: 'block', aspectRatio: '800/420', borderRadius: 14 }}
                      />
                      {aiSocialLoading && (
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: 14,
                          background: 'linear-gradient(135deg, #160F08, #2C1A0E)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10,
                        }}>
                          <div style={{ fontSize: 22 }}>✨</div>
                          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, color: 'rgba(253,245,232,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                            Generating Pulse share card…
                          </div>
                          <div style={{ width: 80, height: 3, borderRadius: 3, background: 'rgba(255,69,0,0.15)', overflow: 'hidden' }}>
                            <div style={{ width: '50%', height: '100%', background: 'var(--coral)', borderRadius: 3, animation: 'shimmer 1s infinite' }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Download + AI badge row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {aiSocialContent && !aiSocialContent.fallback_used && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                            background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.2)',
                            borderRadius: 999, fontFamily: 'Syne,sans-serif', fontWeight: 700,
                            fontSize: 8, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: '0.1em',
                          }}>
                            ✦ Pulse Generated
                          </div>
                        )}
                        {aiSocialContent?.fallback_used && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                            background: 'rgba(22,15,8,0.06)', border: '1px solid rgba(22,15,8,0.1)',
                            borderRadius: 999, fontFamily: 'Syne,sans-serif', fontWeight: 700,
                            fontSize: 8, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em',
                          }}>
                            Auto-generated
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          id="share-card-download-btn"
                          onClick={downloadShareCard}
                          style={{
                            padding: '8px 14px', borderRadius: 999, border: 'none',
                            background: 'var(--espresso)', color: 'var(--cream)',
                            fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9,
                            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}
                          title="Download share card as PNG"
                        >
                          ↓ Download PNG
                        </button>
                        <button
                          id="share-card-copy-image-btn"
                          onClick={copyImageToClipboard}
                          style={{
                            padding: '8px 14px', borderRadius: 999,
                            border: '1.5px solid rgba(22,15,8,0.15)', background: 'transparent',
                            color: 'var(--espresso)',
                            fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9,
                            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--coral)'; e.currentTarget.style.color = 'var(--coral)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.15)'; e.currentTarget.style.color = 'var(--espresso)'; }}
                          title="Copy image to clipboard — paste directly into your post"
                        >
                          🖼 Copy Image
                        </button>
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }} />
                      <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform Captions</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }} />
                    </div>

                    {/* Platform Selector */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {PLATFORMS.map(p => (
                        <button
                          key={p.id}
                          id={`platform-btn-${p.id}`}
                          onClick={() => setSelectedPlatform(p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '7px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                            fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.08em',
                            textTransform: 'uppercase', transition: 'all 0.2s',
                            background: selectedPlatform === p.id ? p.color : 'rgba(22,15,8,0.06)',
                            color: selectedPlatform === p.id ? '#fff' : 'rgba(22,15,8,0.5)',
                            boxShadow: selectedPlatform === p.id ? `0 4px 12px ${p.color}33` : 'none',
                          }}
                        >
                          <span style={{ color: selectedPlatform === p.id ? '#fff' : p.color }}>{p.icon}</span>
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Caption Preview Box */}
                    <div style={{
                      background: 'var(--cream)', border: '1px solid rgba(22,15,8,0.08)',
                      borderRadius: 14, padding: '14px 16px', position: 'relative',
                      minHeight: 90,
                    }}>
                      {aiSocialLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[100, 85, 70].map((w, i) => (
                            <div key={i} style={{ ...shimmerStyle, height: 12, width: `${w}%` }} />
                          ))}
                        </div>
                      ) : (
                        <p style={{
                          fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 12,
                          color: 'var(--espresso)', lineHeight: 1.7, margin: 0,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: 150, overflowY: 'auto',
                        }}>
                          {getCaption(selectedPlatform)}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        id="copy-caption-btn"
                        onClick={copyCaption}
                        disabled={aiSocialLoading}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: 999, border: 'none',
                          background: aiSocialLoading ? 'rgba(22,15,8,0.08)' : 'var(--espresso)',
                          color: aiSocialLoading ? 'rgba(22,15,8,0.3)' : 'var(--cream)',
                          fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9,
                          letterSpacing: '0.1em', textTransform: 'uppercase', cursor: aiSocialLoading ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { if (!aiSocialLoading) e.currentTarget.style.background = 'var(--coral)'; }}
                        onMouseLeave={e => { if (!aiSocialLoading) e.currentTarget.style.background = 'var(--espresso)'; }}
                      >
                        📋 Copy Text
                      </button>
                      <button
                        id="open-platform-btn"
                        onClick={openPlatform}
                        disabled={aiSocialLoading}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: 999,
                          border: `1.5px solid ${PLATFORMS.find(p => p.id === selectedPlatform)?.color || 'var(--espresso)'}`,
                          background: 'transparent',
                          color: PLATFORMS.find(p => p.id === selectedPlatform)?.color || 'var(--espresso)',
                          fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          cursor: aiSocialLoading ? 'default' : 'pointer', transition: 'all 0.2s',
                          opacity: aiSocialLoading ? 0.4 : 1,
                        }}
                        onMouseEnter={e => {
                          if (!aiSocialLoading) {
                            const c = PLATFORMS.find(p => p.id === selectedPlatform)?.color || 'var(--espresso)';
                            e.currentTarget.style.background = c;
                            e.currentTarget.style.color = '#fff';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!aiSocialLoading) {
                            const c = PLATFORMS.find(p => p.id === selectedPlatform)?.color || 'var(--espresso)';
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = c;
                          }
                        }}
                      >
                        ↗ Open Platform
                      </button>
                    </div>

                    {/* Hashtag Chips */}
                    {(aiSocialContent?.hashtags?.length > 0 || aiSocialLoading) && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Hashtags
                          </span>
                          {!aiSocialLoading && aiSocialContent?.hashtags?.length > 0 && (
                            <button
                              id="copy-all-hashtags-btn"
                              onClick={copyAllHashtags}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 8,
                                color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: '0.08em',
                                padding: '2px 6px', borderRadius: 4, transition: 'opacity 0.2s',
                              }}
                            >
                              Copy All
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {aiSocialLoading ? (
                            [60, 80, 50, 70, 55, 75, 45, 65].map((w, i) => (
                              <div key={i} style={{ ...shimmerStyle, height: 26, width: w, borderRadius: 13 }} />
                            ))
                          ) : (
                            (aiSocialContent?.hashtags || []).map((tag, idx) => (
                              <button
                                key={idx}
                                id={`hashtag-chip-${idx}`}
                                onClick={() => copyHashtag(tag)}
                                title="Click to copy"
                                style={{
                                  padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(255,69,0,0.25)',
                                  background: copiedChip === tag ? 'var(--coral)' : 'rgba(255,69,0,0.07)',
                                  color: copiedChip === tag ? '#fff' : 'var(--coral)',
                                  fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10,
                                  cursor: 'pointer', transition: 'all 0.18s', letterSpacing: '0.02em',
                                }}
                                onMouseEnter={e => { if (copiedChip !== tag) { e.currentTarget.style.background = 'rgba(255,69,0,0.15)'; }}}
                                onMouseLeave={e => { if (copiedChip !== tag) { e.currentTarget.style.background = 'rgba(255,69,0,0.07)'; }}}
                              >
                                {copiedChip === tag ? '✓' : ''} {tag}
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}

                    {/* Divider before quick share */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }} />
                      <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Share</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }} />
                    </div>

                    {/* Quick native share + WhatsApp bulk */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        id="native-share-btn"
                        onClick={nativeShare}
                        style={{
                          flex: 1, padding: '11px 14px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.1)',
                          background: 'var(--cream)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9,
                          color: 'var(--espresso)', textTransform: 'uppercase', letterSpacing: '0.08em',
                          transition: 'all 0.2s', boxSizing: 'border-box',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--coral)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(255,90,0,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        📲 Share to Contacts
                      </button>
                      <button
                        id="whatsapp-bulk-btn"
                        onClick={() => setWhatsAppView('choice')}
                        style={{
                          flex: 1, padding: '11px 14px', borderRadius: 999, border: 'none',
                          background: '#25D366', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 9,
                          color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em',
                          transition: 'all 0.2s', boxSizing: 'border-box',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <WhatsAppIcon /> WhatsApp Bulk
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* WhatsApp Bulk sub-panel */}
              {tab === 'social' && whatsAppView === 'choice' && (
                <div style={{ position: 'absolute', inset: 0, background: 'var(--warm-white)', borderRadius: 24, padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, color: '#25D366', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      WhatsApp
                    </span>
                    <button
                      onClick={() => setWhatsAppView(null)}
                      style={{ background: 'none', border: 'none', color: 'rgba(22,15,8,0.4)', fontSize: 10, fontFamily: 'Syne,sans-serif', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}
                    >
                      ← Back
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const caption = aiWhatsAppCaption || whatsAppMessage;
                      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');
                    }}
                    style={{ background: 'var(--cream)', border: '1.5px solid rgba(22,15,8,0.08)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'border-color 0.2s, box-shadow 0.2s', width: '100%', boxSizing: 'border-box' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(37,211,102,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37,211,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <WhatsAppIcon />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)', marginBottom: 4 }}>Personal Share</div>
                      <div style={{ fontFamily: 'Fraunces,serif', fontSize: 11, color: 'rgba(22,15,8,0.5)', lineHeight: 1.5 }}>Share directly to a contact or group via your WhatsApp.</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setWhatsAppView('bulk')}
                    style={{ background: 'var(--cream)', border: '1.5px solid rgba(22,15,8,0.08)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'border-color 0.2s, box-shadow 0.2s', width: '100%', boxSizing: 'border-box' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(37,211,102,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37,211,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>📢</div>
                    <div>
                      <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)', marginBottom: 4 }}>Bulk Share Campaign</div>
                      <div style={{ fontFamily: 'Fraunces,serif', fontSize: 11, color: 'rgba(22,15,8,0.5)', lineHeight: 1.5 }}>Send to multiple contacts at once via phone numbers or a contact list.</div>
                    </div>
                  </button>
                </div>
              )}

              {tab === 'social' && whatsAppView === 'bulk' && (
                <div style={{ position: 'absolute', inset: 0, background: 'var(--warm-white)', borderRadius: 24, padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, color: '#25D366', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp Share Campaign</span>
                    <button onClick={() => { setWhatsAppView('choice'); setWhatsAppFile(null); setWhatsAppNumbers(''); }} style={{ background: 'none', border: 'none', color: 'rgba(22,15,8,0.4)', fontSize: 10, fontFamily: 'Syne,sans-serif', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>← Back</button>
                  </div>
                  <p style={{ fontFamily: 'Fraunces,serif', fontWeight: 300, fontSize: 12, color: 'rgba(22,15,8,0.5)', margin: 0, lineHeight: 1.6 }}>Send the survey invite via WhatsApp to individual numbers or in bulk using contact lists.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manual Entry (Comma or new-line separated)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="text" value={whatsAppNumbers} onChange={e => setWhatsAppNumbers(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendWhatsApp()} placeholder={whatsAppFile ? 'File selected — manual input disabled' : '+919876543210, +14155552671'} disabled={!!whatsAppFile} style={{ ...fieldStyle, flex: 1, opacity: whatsAppFile ? 0.5 : 1 }} onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
                      <motion.button whileTap={{ scale: 0.96 }} onClick={sendWhatsApp} disabled={sendingWhatsApp || !!whatsAppFile || !whatsAppNumbers.trim()} style={{ ...btnPrimary(sendingWhatsApp || !!whatsAppFile || !whatsAppNumbers.trim()) }} onMouseEnter={e => { if (!sendingWhatsApp && !whatsAppFile && whatsAppNumbers.trim()) e.currentTarget.style.background = 'var(--coral)'; }} onMouseLeave={e => { if (!sendingWhatsApp && !whatsAppFile && whatsAppNumbers.trim()) e.currentTarget.style.background = 'var(--espresso)'; }}>{sendingWhatsApp ? '…' : 'Send'}</motion.button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }}></div>
                    <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(22,15,8,0.06)' }}></div>
                  </div>
                  <ContactFileUploader type="phone" fileData={whatsAppFile} setFileData={setWhatsAppFile} isParsing={isWhatsAppFileParsing} setIsParsing={setIsWhatsAppFileParsing} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Message Body</label>
                    <textarea rows={3} value={whatsAppMessage} onChange={e => setWhatsAppMessage(e.target.value)} style={fieldStyle} onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
                  </div>
                  <motion.button whileTap={{ scale: 0.98 }} onClick={sendWhatsApp} disabled={sendingWhatsApp} style={{ ...btnPrimary(sendingWhatsApp), background: sendingWhatsApp ? 'rgba(22,15,8,0.12)' : '#25D366', color: sendingWhatsApp ? 'rgba(22,15,8,0.3)' : '#FFF', width: '100%', justifyContent: 'center', marginTop: 4 }}>
                    {sendingWhatsApp ? 'Broadcasting...' : '🚀 Send WhatsApp Broadcast'}
                  </motion.button>
                </div>
              )}

              </>)}

            </motion.div>
          </motion.div>
        )}


        {/* Bulk Broadcast Modals */}
        <BulkEmailModal
          survey={survey}
          isOpen={isOpen && isBulkEmailOpen}
          onClose={() => setIsBulkEmailOpen(false)}
          surveyUrl={withSource('email')}
        />

        <BulkWhatsAppModal
          survey={survey}
          isOpen={isOpen && isBulkWhatsAppOpen}
          onClose={() => setIsBulkWhatsAppOpen(false)}
          surveyUrl={withSource('whatsapp')}
        />
      </AnimatePresence>
      <style>
        {`.axiora-social-btn {
  width: 100%;
  padding: 11px 14px;
  border: none;
  border-radius: 999px;
  background: var(--espresso);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--cream);
  font-family: 'Syne', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
  box-sizing: border-box;
}

.axiora-social-btn:hover {
  background: var(--coral);
  transform: translateY(-1px);
}

.axiora-social-btn:active {
  transform: scale(0.98);
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}`}
      </style>
    </>
  );
}
