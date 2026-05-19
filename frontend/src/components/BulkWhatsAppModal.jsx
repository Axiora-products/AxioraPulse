import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import API from '../api/axios';

export default function BulkWhatsAppModal({ survey, isOpen, onClose, surveyUrl }) {
  const [step, setStep] = useState('input-method'); // input-method, import, compose, preview, sending, report
  const [method, setMethod] = useState(''); // 'file' or 'manual'
  const [numbers, setNumbers] = useState([]);
  const [manualText, setManualText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  
  // Compose states
  const [message, setMessage] = useState(
    `Hello! We would love to get your feedback on our survey: "${survey?.title || 'User Feedback'}"\n\nPlease tap this link to participate: ${surveyUrl}`
  );
  const [mediaUrl, setMediaUrl] = useState('');
  
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
    background: disabled ? 'rgba(22,15,8,0.12)' : '#25D366', // WhatsApp Green
    color: disabled ? 'rgba(22,15,8,0.3)' : '#FFF',
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
    border: `2px solid ${selected ? '#25D366' : 'rgba(22,15,8,0.08)'}`,
    borderRadius: 16,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    boxShadow: selected ? '0 12px 24px rgba(37,211,162,0.06)' : 'none'
  });

  // Extract phone numbers from text
  const extractNumbers = (text) => {
    // Strip hyphens, spaces, and brackets to make matching clean
    const preCleaned = text.replace(/[\(\)\-\s]/g, '');
    // Match numbers containing 7 to 15 digits, optionally prefixed with +
    const phoneRegex = /\+?[0-9]{7,15}/g;
    const matches = preCleaned.match(phoneRegex) || [];
    return listDeduplicate(matches.map(n => n.trim()));
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
        const extracted = extractNumbers(text);
        setNumbers(extracted);
        toast.success(`Found ${extracted.length} valid phone number(s)`);
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
            const extracted = extractNumbers(fullText);
            setNumbers(extracted);
            toast.success(`Found ${extracted.length} valid phone number(s)`);
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

  // Option 2: Parse manually typed/pasted numbers
  const handleManualParse = () => {
    const extracted = extractNumbers(manualText);
    if (extracted.length === 0) {
      toast.error('No valid phone numbers found in your entry');
      return;
    }
    setNumbers(extracted);
    toast.success(`Validated ${extracted.length} phone number(s)`);
    setStep('compose');
  };

  // Trigger campaign send
  const sendCampaign = async () => {
    setStep('sending');
    setIsSending(true);
    setSendProgress(0);

    try {
      const batchSize = 15;
      const totalRecipients = numbers.length;
      let sentCount = 0;
      let failedCount = 0;
      let resultsList = [];

      for (let i = 0; i < totalRecipients; i += batchSize) {
        const batch = numbers.slice(i, i + batchSize);
        
        try {
          const res = await API.post('/users/bulk-share-whatsapp', {
            numbers: batch,
            survey_link: surveyUrl,
            survey_title: survey?.title,
            message: message,
            media_url: mediaUrl || null
          });

          resultsList = [...resultsList, ...(res.data.results || [])];
          sentCount += res.data.sent;
          failedCount += res.data.failed;
        } catch (err) {
          batch.forEach(num => {
            resultsList.push({
              recipient: num,
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
      toast.success('WhatsApp broadcast finished!');
      setStep('report');
    } catch (e) {
      toast.error('WhatsApp campaign failed to send');
      setStep('compose');
    } finally {
      setIsSending(false);
    }
  };

  // Download CSV report
  const downloadReport = () => {
    if (!sendingResults) return;
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Mobile Number,Status,Timestamp,Failure Reason\n';
    
    sendingResults.results.forEach(r => {
      csvContent += `"${r.recipient}","${r.status}","${r.timestamp}","${r.reason || 'None'}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `axiorapulse_bulk_whatsapp_report_${survey?.id || 'campaign'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetState = () => {
    setStep('input-method');
    setMethod('');
    setNumbers([]);
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
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#25D366', marginBottom: 6 }}>Bulk Survey Share</div>
            <h2 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 22, color: 'var(--espresso)', margin: 0 }}>WhatsApp Broadcast</h2>
          </div>
          {step !== 'sending' && (
            <button onClick={() => { resetState(); onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 18 }}>✕</button>
          )}
        </div>

        {/* Step: Select Input Method */}
        {step === 'input-method' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0, lineHeight: 1.6 }}>
              Choose how to load your broadcast contact list. Invalid separation characters are automatically handled, and formatting is standardized for international dialing.
            </p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={choiceCardStyle(method === 'file')} onClick={() => setMethod('file')}>
                <div style={{ fontSize: 32 }}>📁</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)' }}>Upload File</div>
                <div style={{ fontFamily: 'Fraunces,serif', fontSize: 12, color: 'rgba(22,15,8,0.4)', lineHeight: 1.4 }}>Import contact list from .xlsx or .csv files</div>
              </div>
              <div style={choiceCardStyle(method === 'manual')} onClick={() => setMethod('manual')}>
                <div style={{ fontSize: 32 }}>✍️</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)' }}>Manual Entry</div>
                <div style={{ fontFamily: 'Fraunces,serif', fontSize: 12, color: 'rgba(22,15,8,0.4)', lineHeight: 1.4 }}>Comma or new-line separated mobile numbers</div>
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

        {/* Step: Import Content */}
        {step === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {method === 'file' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
                  Upload a spreadsheet containing a column of mobile numbers (preferably with country codes).
                </p>
                <div 
                  onClick={() => fileInputRef.current.click()}
                  style={{ border: '2.5px dashed rgba(22,15,8,0.1)', background: 'var(--cream)', borderRadius: 16, padding: '36px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#25D366'}
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

                {parsing && <div style={{ fontSize: 12, color: '#25D366', fontFamily: 'Syne,sans-serif', textAlign: 'center' }}>🔄 Extracting mobile numbers...</div>}
                
                {numbers.length > 0 && (
                  <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', padding: 14, borderRadius: 12 }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--espresso)', marginBottom: 4 }}>✅ Ingestion Successful!</div>
                    <div style={{ fontFamily: 'Fraunces,serif', fontSize: 13, color: 'rgba(22,15,8,0.6)' }}>
                      Identified <strong>{numbers.length}</strong> unique, valid phone numbers.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
                  Type or paste mobile numbers separated by commas or line breaks.
                </p>
                <textarea
                  rows={6}
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  placeholder="+919876543210&#10;+447911123456, +14155552671"
                  style={fieldStyle}
                  onFocus={e => e.target.style.borderColor = '#25D366'}
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
                    style={btnPrimary(numbers.length === 0)} 
                    disabled={numbers.length === 0} 
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
                Numbers Loaded: <strong>{numbers.length} recipient(s)</strong>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', letterSpacing: '0.05em' }}>WhatsApp Message Text</label>
              <textarea
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = '#25D366'}
                onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', letterSpacing: '0.05em' }}>Optional Media/Image URL</label>
              <input
                type="text"
                placeholder="https://example.com/banner.png (optional)"
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = '#25D366'}
                onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button style={btnSecondary} onClick={() => setStep('import')}>Back</button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={btnSecondary} onClick={() => { resetState(); onClose(); }}>Cancel</button>
                <button 
                  style={btnPrimary(!message.trim())} 
                  disabled={!message.trim()} 
                  onClick={() => setStep('preview')}
                >
                  Preview & Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: WhatsApp Preview Screen */}
        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'Fraunces,serif', fontSize: 14, color: 'rgba(22,15,8,0.5)', margin: 0 }}>
              Verify the message layout inside the mobile chat bubble simulation before broadcasting.
            </p>

            {/* WhatsApp Chat Simulator */}
            <div style={{ border: '1px solid rgba(37,211,102,0.12)', borderRadius: 20, background: '#ECE5DD', overflow: 'hidden', padding: 20, position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Header Bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#075E54', padding: '10px 16px', color: '#FFF', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'sans-serif', fontWeight: 'bold' }}>
                <div style={{ width: 8, height: 8, background: '#25D366', borderRadius: '50%' }}></div>
                Broadcast Channel ({numbers.length} contacts)
              </div>
              
              <div style={{ height: 28 }}></div> {/* Spacer */}

              {/* Message Bubble */}
              <div style={{ maxWidth: '85%', alignSelf: 'flex-start', background: '#DCF8C6', borderRadius: '0px 12px 12px 12px', padding: '12px 16px', position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mediaUrl && (
                  <img 
                    src={mediaUrl} 
                    alt="Broadcast attachment" 
                    style={{ width: '100%', borderRadius: 8, maxHeight: 120, objectFit: 'cover', display: 'block', marginBottom: 4 }}
                    onError={e => e.currentTarget.style.display = 'none'}
                  />
                )}
                <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#303030', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {message}
                </div>
                <div style={{ alignSelf: 'flex-end', fontSize: 9, color: 'rgba(0,0,0,0.38)', fontFamily: 'sans-serif' }}>
                  Just now ✓✓
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button style={btnSecondary} onClick={() => setStep('compose')}>Back</button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={btnSecondary} onClick={() => { resetState(); onClose(); }}>Cancel</button>
                <button style={btnPrimary(false)} onClick={sendCampaign}>
                  🚀 Send WhatsApp Broadcast
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
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontWeight: 900, fontSize: 18, color: 'var(--espresso)', margin: '0 0 8px 0' }}>Broadcasting to WhatsApp</h3>
              <p style={{ fontFamily: 'Fraunces,serif', fontSize: 13, color: 'rgba(22,15,8,0.45)', margin: 0 }}>
                Processing and dispatching messages in parallel batches...
              </p>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', background: 'var(--cream)', height: 16, borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(22,15,8,0.06)' }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${sendProgress}%` }}
                style={{ background: '#25D366', height: '100%', borderRadius: 999 }} 
              />
            </div>
            
            <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--espresso)' }}>
              {sendProgress}% Completed
            </span>
          </div>
        )}

        {/* Step: Analytics and Reports */}
        {step === 'report' && sendingResults && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--cream)', border: '1px solid rgba(22,15,8,0.06)', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--espresso)', margin: '0 0 16px 0', letterSpacing: '0.05em' }}>Broadcast Summary</h3>
              
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
                <label style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: 'var(--terracotta)', letterSpacing: '0.05em' }}>Failed Contact Logs</label>
                <div style={{ border: '1px solid rgba(22,15,8,0.08)', borderRadius: 12, overflow: 'hidden', maxHeight: 120, overflowY: 'auto', background: 'rgba(214,59,31,0.03)' }}>
                  {sendingResults.results.filter(r => r.status === 'failed').map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(22,15,8,0.04)', fontSize: 12, fontFamily: 'monospace' }}>
                      <span style={{ color: 'var(--espresso)', fontWeight: 'bold' }}>{r.recipient}</span>
                      <span style={{ color: 'var(--terracotta)' }}>{r.reason || 'Invalid configuration'}</span>
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
