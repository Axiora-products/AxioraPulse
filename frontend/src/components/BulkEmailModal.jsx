import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import API from '../api/axios';

export default function BulkEmailModal({ survey, isOpen, onClose, surveyUrl }) {
  const [step, setStep] = useState('input-method'); // input-method, import, compose, preview, sending, report
  const [method, setMethod] = useState(''); // 'file' or 'manual'
  const [emails, setEmails] = useState([]);
  const [manualText, setManualText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  
  // Compose states
  const [subject, setSubject] = useState(`Invitation to complete survey: ${survey?.title || 'Feedback Requested'}`);
  const [bodyText, setBodyText] = useState(
    `Hello,\n\nWe value your opinion! Please take a few moments to fill out our survey: ${survey?.title || 'Axiora Pulse'}.\n\nYour feedback is incredibly valuable to us.`
  );
  
  // Sending states
  const [sendingResults, setSendingResults] = useState(null);
  const [sendProgress, setSendProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  
  const fileInputRef = useRef(null);

  // Field styles matching design tokens
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
    transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8
  });

  const btnSecondary = {
    padding: '11px 24px', borderRadius: 999, 
    border: '1.5px solid rgba(22,15,8,0.15)',
    background: 'transparent',
    color: 'var(--espresso)',
    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8
  };

  const choiceCardStyle = (selected) => ({
    flex: 1,
    padding: 24,
    background: selected ? 'var(--cream)' : 'var(--warm-white)',
    border: `2px solid ${selected ? 'var(--coral)' : 'rgba(22,15,8,0.08)'}`,
    borderRadius: 16,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    boxShadow: selected ? '0 12px 24px rgba(255,69,0,0.06)' : 'none'
  });

  // Extract emails from text
  const extractEmails = (text) => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    return listDeduplicate(matches.map(e => e.trim().toLowerCase()));
  };

  const listDeduplicate = (arr) => {
    return Array.from(new Set(arr));
  };

  // Option 1: Handle file upload and parsing
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);

    try {
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const extracted = extractEmails(text);
        setEmails(extracted);
        toast.success(`Found ${extracted.length} valid email address(es)`);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Flatten sheet cells into string
            let fullText = '';
            json.forEach(row => {
              row.forEach(cell => {
                if (cell !== undefined && cell !== null) {
                  fullText += ` ${cell}`;
                }
              });
            });
            const extracted = extractEmails(fullText);
            setEmails(extracted);
            toast.success(`Found ${extracted.length} valid email address(es)`);
          } catch (err) {
            toast.error('Failed to parse Excel file content');
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        toast.error('Unsupported file format. Please upload .xlsx or .csv');
      }
    } catch (err) {
      toast.error('Error reading file');
    } finally {
      setParsing(false);
    }
  };

  // Option 2: Parse manually typed/pasted emails
  const handleManualParse = () => {
    const extracted = extractEmails(manualText);
    if (extracted.length === 0) {
      toast.error('No valid emails found in your entry');
      return;
    }
    setEmails(extracted);
    toast.success(`Validated ${extracted.length} email(s)`);
    setStep('compose');
  };

  // Trigger campaign send
  const sendCampaign = async () => {
    setStep('sending');
    setIsSending(true);
    setSendProgress(0);

    const HTML_Body = `
      <div style="font-family: 'Fraunces', serif; max-width: 600px; margin: 0 auto; padding: 32px; border: 1px solid rgba(22,15,8,0.08); border-radius: 20px; background: #FFFBF4; color: #160F08;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-family: sans-serif; font-size: 10px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; color: #FF4500;">Survey Science</span>
        </div>
        <h2 style="font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 900; margin: 0 0 16px 0; color: #160F08; text-align: center;">${survey?.title || 'Axiora Pulse Survey'}</h2>
        <p style="font-size: 15px; line-height: 1.7; color: rgba(22,15,8,0.7); margin: 0 0 28px 0; white-space: pre-wrap;">${bodyText}</p>
        <div style="text-align: center; margin: 36px 0;">
          <a href="${surveyUrl}" style="background-color: #160F08; color: #FDF5E8; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-family: sans-serif; font-size: 11px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; display: inline-block; box-shadow: 0 8px 16px rgba(22,15,8,0.15);">Take Survey</a>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(22,15,8,0.06); margin: 28px 0;" />
        <p style="font-family: sans-serif; font-size: 11px; color: rgba(22,15,8,0.4); margin: 0; text-align: center; line-height: 1.5;">
          You received this email because an organization invited you to share your feedback.<br>
          Powered by Axiora Pulse 🚀
        </p>
      </div>
    `;

    try {
      // Simulate live sending batches (for responsive animation)
      const batchSize = 10;
      const totalRecipients = emails.length;
      let sentCount = 0;
      let failedCount = 0;
      let resultsList = [];

      for (let i = 0; i < totalRecipients; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        
        try {
          const res = await API.post('/users/bulk-share-survey', {
            emails: batch,
            survey_link: surveyUrl,
            survey_title: survey?.title,
            subject: subject,
            body: HTML_Body
          });

          resultsList = [...resultsList, ...(res.data.results || [])];
          sentCount += res.data.sent;
          failedCount += res.data.failed;
        } catch (err) {
          // If a whole batch request fails
          batch.forEach(email => {
            resultsList.push({
              recipient: email,
              status: 'failed',
              timestamp: new Date().toISOString(),
              reason: err.response?.data?.detail || 'Network error'
            });
          });
          failedCount += batch.length;
        }

        const percentage = Math.min(Math.round(((i + batch.length) / totalRecipients) * 100), 100);
        setSendProgress(percentage);
      }

      setSendingResults({
        total: totalRecipients,
        sent: sentCount,
        failed: failedCount,
        results: resultsList
      });
      toast.success('Bulk sharing campaign finished!');
      setStep('report');
    } catch (e) {
      toast.error('Campaign failed to send');
      setStep('compose');
    } finally {
      setIsSending(false);
    }
  };

  // Download CSV report
  const downloadReport = () => {
    if (!sendingResults) return;
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Recipient,Status,Timestamp,Failure Reason\n';
    
    sendingResults.results.forEach(r => {
      csvContent += `"${r.recipient}","${r.status}","${r.timestamp}","${r.reason || 'None'}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `axiorapulse_bulk_email_report_${survey?.id || 'campaign'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetState = () => {
    setStep('input-method');
    setMethod('');
    setEmails([]);
    setManualText('');
    setFileName('');
    setSendingResults(null);
    setSendProgress(0);
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,15,8,0.4)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ background: 'var(--warm-white)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 540, boxShadow: '0 40px 100px rgba(22,15,8,0.25)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 6 }}>Bulk Survey Share</div>
            <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 22, color: 'var(--espresso)', margin: 0 }}>Email Broadcast</h2>
          </div>
          {step !== 'sending' && (
            <button onClick={() => { resetState(); onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 18 }}>✕</button>
          )}
        </div>

        {/* Step: Select Input Method */}
        {step === 'input-method' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0, lineHeight: 1.6 }}>
              Select how you would like to load your broadcast list. AXIS and SES automatically validate formats, deduplicate entries, and filter invalid domains.
            </p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={choiceCardStyle(method === 'file')} onClick={() => setMethod('file')}>
                <div style={{ fontSize: 32 }}>📁</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)' }}>Upload File</div>
                <div style={{ fontFamily: 'Fraunces,serif', fontSize: 12, color: 'rgba(22,15,8,0.4)', lineHeight: 1.4 }}>Import list from .xlsx or .csv spreadsheets</div>
              </div>
              <div style={choiceCardStyle(method === 'manual')} onClick={() => setMethod('manual')}>
                <div style={{ fontSize: 32 }}>✍️</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)' }}>Manual Entry</div>
                <div style={{ fontFamily: 'Fraunces,serif', fontSize: 12, color: 'rgba(22,15,8,0.4)', lineHeight: 1.4 }}>Comma or new-line separated email IDs</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              <button style={btnSecondary} onClick={onClose}>Cancel</button>
              <button 
                style={btnPrimary(!method)} 
                disabled={!method} 
                onClick={() => setStep('import')}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step: Import/Upload Content */}
        {step === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {method === 'file' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
                  Upload a spreadsheet containing a column of email addresses.
                </p>
                <div 
                  onClick={() => fileInputRef.current.click()}
                  style={{ border: '2.5px dashed rgba(22,15,8,0.1)', background: 'var(--cream)', borderRadius: 16, padding: '36px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
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
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📥</div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)' }}>
                    {fileName ? fileName : 'Drag & Drop or Click to Browse'}
                  </div>
                  <div style={{ fontFamily: 'Fraunces,serif', fontSize: 11, color: 'rgba(22,15,8,0.35)', marginTop: 6 }}>
                    Supports Excel (.xlsx, .xls) and Plain CSV (.csv)
                  </div>
                </div>

                {parsing && <div style={{ fontSize: 12, color: 'var(--coral)', fontFamily: 'Syne,sans-serif', textAlign: 'center' }}>🔄 Reading and extracting emails...</div>}
                
                {emails.length > 0 && (
                  <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', padding: 14, borderRadius: 12 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)', marginBottom: 4 }}>✅ Extraction Successful!</div>
                    <div style={{ fontFamily: 'Fraunces,serif', fontSize: 13, color: 'rgba(22,15,8,0.6)' }}>
                      Found <strong>{emails.length}</strong> unique, properly-formatted email address(es).
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
                  Enter or paste email IDs separated by commas or line breaks.
                </p>
                <textarea
                  rows={6}
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  placeholder="recipient1@example.com&#10;recipient2@example.com, recipient3@example.com"
                  style={fieldStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button style={btnSecondary} onClick={() => setStep('input-method')}>Back</button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={btnSecondary} onClick={() => { resetState(); onClose(); }}>Cancel</button>
                {method === 'file' ? (
                  <button 
                    style={btnPrimary(emails.length === 0)} 
                    disabled={emails.length === 0} 
                    onClick={() => setStep('compose')}
                  >
                    Next: Compose
                  </button>
                ) : (
                  <button style={btnPrimary(!manualText.trim())} disabled={!manualText.trim()} onClick={handleManualParse}>
                    Next: Compose
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: Compose Broadcast Message */}
        {step === 'compose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', gap: 10, background: 'var(--cream)', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(22,15,8,0.06)' }}>
              <span style={{ fontSize: 14 }}>🎯</span>
              <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 11, color: 'var(--espresso)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recipients Loaded: <strong>{emails.length} email(s)</strong>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', letterSpacing: '0.05em' }}>Email Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', letterSpacing: '0.05em' }}>Invitation Body Message</label>
              <textarea
                rows={5}
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
              />
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: 11, color: 'rgba(22,15,8,0.35)', lineHeight: 1.4 }}>
                * Note: A premium, styled action button reading <strong>"Take Survey"</strong> with your survey link will automatically be appended under this text.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button style={btnSecondary} onClick={() => setStep('import')}>Back</button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={btnSecondary} onClick={() => { resetState(); onClose(); }}>Cancel</button>
                <button 
                  style={btnPrimary(!subject.trim() || !bodyText.trim())} 
                  disabled={!subject.trim() || !bodyText.trim()} 
                  onClick={() => setStep('preview')}
                >
                  Preview & Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Visual Email Preview */}
        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
              Verify the layout and wording of your broadcast before launching the campaign.
            </p>

            {/* Email Inbox Simulator */}
            <div style={{ border: '1px solid rgba(22,15,8,0.08)', borderRadius: 16, background: '#FFFBF4', overflow: 'hidden' }}>
              <div style={{ background: 'var(--cream)', padding: '12px 18px', borderBottom: '1px solid rgba(22,15,8,0.06)', fontFamily: 'Syne,sans-serif', fontSize: 11, color: 'rgba(22,15,8,0.6)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong>Subject:</strong> {subject}</div>
                <div><strong>From:</strong> Axiora Pulse &lt;noreply@axiorapulse.com&gt;</div>
                <div><strong>To:</strong> Broadcast List ({emails.length} recipients)</div>
              </div>
              <div style={{ padding: 24, background: '#FFF', fontFamily: 'Fraunces, serif', fontSize: 14, color: 'var(--espresso)', lineHeight: 1.6 }}>
                <div style={{ maxWidth: 440, margin: '0 auto' }}>
                  <p style={{ whiteSpace: 'pre-wrap', color: 'rgba(22,15,8,0.7)' }}>{bodyText}</p>
                  <div style={{ textAlign: 'center', margin: '24px 0' }}>
                    <div style={{ background: 'var(--espresso)', color: 'var(--cream)', padding: '10px 22px', borderRadius: 999, display: 'inline-block', fontFamily: 'Syne,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Take Survey</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button style={btnSecondary} onClick={() => setStep('compose')}>Back</button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={btnSecondary} onClick={() => { resetState(); onClose(); }}>Cancel</button>
                <button style={btnPrimary(false)} onClick={sendCampaign}>
                  🚀 Launch Broadcast
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Live Sending Progress */}
        {step === 'sending' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 44, animation: 'spin 2s linear infinite' }} className="animate-spin">🔄</div>
            <div>
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 18, color: 'var(--espresso)', margin: '0 0 8px 0' }}>Sending Email Campaign</h3>
              <p style={{ fontFamily: 'Fraunces,serif', fontSize: 13, color: 'rgba(22,15,8,0.45)', margin: 0 }}>
                Please keep this window open while SES delivers your survey invites...
              </p>
            </div>

            {/* Progress Bar Container */}
            <div style={{ width: '100%', background: 'var(--cream)', height: 16, borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(22,15,8,0.06)' }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${sendProgress}%` }}
                style={{ background: 'var(--coral)', height: '100%', borderRadius: 999 }} 
              />
            </div>
            
            <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--espresso)' }}>
              {sendProgress}% Completed
            </span>
          </div>
        )}

        {/* Step: Delivery & Analytics Report */}
        {step === 'report' && sendingResults && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--cream)', border: '1px solid rgba(22,15,8,0.06)', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--espresso)', margin: '0 0 16px 0', letterSpacing: '0.05em' }}>Delivery Summary</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                <div style={{ borderRight: '1px solid rgba(22,15,8,0.06)' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--espresso)' }}>{sendingResults.total}</div>
                  <div style={{ fontSize: 10, fontFamily: 'Syne,sans-serif', color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', marginTop: 4 }}>Processed</div>
                </div>
                <div style={{ borderRight: '1px solid rgba(22,15,8,0.06)' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#25D366' }}>{sendingResults.sent}</div>
                  <div style={{ fontSize: 10, fontFamily: 'Syne,sans-serif', color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', marginTop: 4 }}>Delivered</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--terracotta)' }}>{sendingResults.failed}</div>
                  <div style={{ fontSize: 10, fontFamily: 'Syne,sans-serif', color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', marginTop: 4 }}>Failed</div>
                </div>
              </div>
            </div>

            {sendingResults.failed > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'var(--terracotta)', letterSpacing: '0.05em' }}>Failed Recipient Logs</label>
                <div style={{ border: '1px solid rgba(22,15,8,0.08)', borderRadius: 12, overflow: 'hidden', maxHeight: 120, overflowY: 'auto', background: 'rgba(214,59,31,0.03)' }}>
                  {sendingResults.results.filter(r => r.status === 'failed').map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(22,15,8,0.04)', fontSize: 12, fontFamily: 'monospace' }}>
                      <span style={{ color: 'var(--espresso)', fontWeight: 'bold' }}>{r.recipient}</span>
                      <span style={{ color: 'var(--terracotta)' }}>{r.reason || 'Validation error'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <button 
                style={btnSecondary} 
                onClick={downloadReport}
              >
                📊 Download CSV Report
              </button>
              <button 
                style={{ ...btnPrimary(false), minWidth: 100 }} 
                onClick={() => { resetState(); onClose(); }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
