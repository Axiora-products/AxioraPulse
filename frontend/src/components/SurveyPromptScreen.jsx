import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../api/axios';

export const SURVEY_MODES = [
  { id: 'conversational', label: 'Conversational', icon: '💬', desc: 'Warm, friendly, natural dialogue style' },
  { id: 'emotionally_triggering', label: 'Emotionally Triggering', icon: '💗', desc: 'Evocative language that probes deeper feelings' },
  { id: 'deep_analysis', label: 'Deep Analysis', icon: '🔬', desc: 'Thorough, multi-layered research questions' },
  { id: 'professional', label: 'Professional', icon: '💼', desc: 'Formal, corporate-grade survey tone' },
  { id: 'employee_feedback', label: 'Employee Feedback', icon: '👥', desc: 'HR engagement & satisfaction surveys' },
  { id: 'business_feedback', label: 'Business Feedback', icon: '📊', desc: 'Customer/stakeholder ROI-focused' },
  { id: 'custom', label: 'Custom', icon: '✨', desc: 'Flexible, adapts to your description' },
];

export const getSurveyModeLabel = mode => ({
  conversational: 'Conversational Survey',
  emotionally_triggering: 'Emotionally Triggering Survey',
  deep_analysis: 'Deep Analysis Survey',
  professional: 'Professional Survey',
  employee_feedback: 'Employee Feedback Survey',
  business_feedback: 'Business Feedback Survey',
  custom: 'Custom Survey Mode',
}[mode?.id] || mode?.label || 'Conversational Survey');

const QUICK_TEMPLATES = [
  { name: 'NPS Survey', icon: '📊', category: 'Customer' },
  { name: 'Product Feedback', icon: '🛠️', category: 'Product' },
  { name: 'Employee Pulse', icon: '👥', category: 'HR' },
  { name: 'Event Feedback', icon: '🎤', category: 'Events' },
  { name: 'Market Research', icon: '🔍', category: 'Research' },
  { name: 'Exit Interview', icon: '🚪', category: 'HR' },
];

export default function SurveyPromptScreen({ onGenerate, onSkip, onLoadTemplate, galleryTemplates, aiGenerating, initialData }) {
  const [prompt, setPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState(SURVEY_MODES[0]);
  const [customInstruction, setCustomInstruction] = useState('');
  const [modeOpen, setModeOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [attachedAudio, setAttachedAudio] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [draftSaved, setDraftSaved] = useState(false);

  // Initialize from initialData (Resume Logic)
  useEffect(() => {
    if (initialData) {
      setPrompt(initialData.prompt || '');
      const mode = SURVEY_MODES.find(m => m.id === initialData.mode) || SURVEY_MODES[0];
      setSelectedMode(mode);
      setCustomInstruction(initialData.customInstruction || '');
      setDraftId(initialData.id);
      
      // Load attachments metadata
      if (initialData.attachments && initialData.attachments.length > 0) {
        const loadAttachments = async () => {
          try {
            const { data: allFiles } = await API.get('/uploads/files');
            const myFiles = allFiles.filter(f => initialData.attachments.includes(f.id));
            setAttachedFiles(myFiles.filter(f => f.upload_type === 'file'));
            setAttachedAudio(myFiles.filter(f => f.upload_type === 'audio'));
          } catch (e) {
            console.error('Failed to load attachment metadata', e);
          }
        };
        loadAttachments();
      }
    }
  }, [initialData]);

  const modeRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const autoSaveTimer = useRef(null);

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!modeOpen) return;
    const handler = e => { if (modeRef.current && !modeRef.current.contains(e.target)) setModeOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modeOpen]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
  }, [prompt]);

  // ── Auto-save with 3-second debounce ──
  const doAutoSave = useCallback(async () => {
    if (!prompt.trim()) return;
    try {
      const { data } = await API.patch('/surveys/draft/auto-save', {
        draft_id: draftId,
        prompt: prompt,
        mode: selectedMode.id,
        custom_instruction: customInstruction,
        attachments: [...attachedFiles, ...attachedAudio].map(f => f.filename),
      });
      if (data.id && !draftId) setDraftId(data.id);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch {
      // Silent fail for auto-save
    }
  }, [prompt, selectedMode, customInstruction, attachedFiles, attachedAudio, draftId]);

  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    if (prompt.trim()) {
      autoSaveTimer.current = setTimeout(doAutoSave, 3000);
    }
    return () => clearTimeout(autoSaveTimer.current);
  }, [prompt, selectedMode, customInstruction, attachedFiles, attachedAudio, doAutoSave]);

  // ── File Upload Handler ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await API.post('/uploads/file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAttachedFiles(prev => [...prev, {
        id: data.id,
        filename: data.filename,
        extractedText: data.extracted_text || '',
        type: 'file',
      }]);
      toast.success(`"${data.filename}" attached`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
    setUploading(false);
    e.target.value = '';
  };

  // ── Audio Upload Handler ──
  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await API.post('/uploads/audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAttachedAudio(prev => [...prev, {
        id: data.id,
        filename: data.filename,
        extractedText: data.extracted_text || '',
        type: 'audio',
      }]);
      toast.success(`"${data.filename}" attached`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Audio upload failed');
    }
    setUploading(false);
    e.target.value = '';
  };

  const removeAttachment = (id, type) => {
    if (type === 'file') setAttachedFiles(prev => prev.filter(f => f.id !== id));
    else setAttachedAudio(prev => prev.filter(f => f.id !== id));
  };

  const handleSubmit = () => {
    if (!prompt.trim()) return toast.error('Describe what you want to research');
    if (selectedMode.id === 'custom' && !customInstruction.trim()) return toast.error('Add custom mode instructions first');
    const fileContext = attachedFiles.map(f => f.extractedText).filter(Boolean).join('\n\n');
    const audioContext = attachedAudio.map(f => f.extractedText).filter(Boolean).join('\n\n');
    onGenerate(prompt, prompt, selectedMode.id, fileContext, audioContext, customInstruction);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTemplate = (name) => {
    const tmpl = galleryTemplates.find(t => t.name === name);
    if (tmpl) onLoadTemplate(tmpl);
  };

  const hasAttachments = attachedFiles.length > 0 || attachedAudio.length > 0;

  return (
    <div className="cp-center">
      <div className="idea-protection-badge">Confidentiality Protected by Axiora Pulse</div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
      <input ref={audioInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleAudioUpload} />

      {/* Decorative blobs */}
      <div className="cp-blob cp-blob-1" />
      <div className="cp-blob cp-blob-2" />
      <div className="cp-blob cp-blob-3" />

      {/* Greeting */}
      <div className="cp-greeting">
        <div className="cp-greeting-tag">Research Studio</div>
        <h1>What would you like<br />to <em>research</em>?</h1>
        <p>Describe your survey and AI will craft the perfect questions for you.</p>
      </div>

      {/* Prompt Box */}
      <div className="cp-prompt-wrap">
        <div className="cp-prompt-box">
          <textarea
            ref={textareaRef}
            className="cp-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. I need a customer satisfaction survey for my new coffee shop. Ask about coffee quality, ambiance, service speed, and likelihood to recommend…"
            disabled={aiGenerating}
          />

          {/* Attached Files Chips */}
          {hasAttachments && (
            <div style={{ padding: '4px 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {attachedFiles.map(f => (
                <div key={f.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px 5px 8px', borderRadius: 10,
                  background: 'rgba(255,69,0,0.06)', border: '1px solid rgba(255,69,0,0.15)',
                  fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.04em', color: 'var(--coral)',
                }}>
                  📄 {f.filename}
                  <button onClick={() => removeAttachment(f.id, 'file')} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)',
                    fontSize: 11, lineHeight: 1, padding: 0, marginLeft: 2,
                  }}>✕</button>
                </div>
              ))}
              {attachedAudio.map(f => (
                <div key={f.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px 5px 8px', borderRadius: 10,
                  background: 'rgba(0,71,255,0.06)', border: '1px solid rgba(0,71,255,0.15)',
                  fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.04em', color: 'var(--cobalt)',
                }}>
                  🎙️ {f.filename}
                  <button onClick={() => removeAttachment(f.id, 'audio')} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)',
                    fontSize: 11, lineHeight: 1, padding: 0, marginLeft: 2,
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="cp-toolbar">
            {/* Upload Files */}
            <button
              type="button"
              className="cp-tool-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  style={{ display: 'inline-block', width: 12, height: 12, border: '1.5px solid rgba(22,15,8,0.15)', borderTopColor: 'var(--coral)', borderRadius: '50%' }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              )}
              <span className="cp-tool-label">Upload Files</span>
            </button>

            {/* Record/Upload Audio */}
            <button
              type="button"
              className="cp-tool-btn"
              onClick={() => audioInputRef.current?.click()}
              disabled={uploading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span className="cp-tool-label">Upload Audio</span>
            </button>

            {/* Survey Mode Selector */}
            <div className="cp-mode-selector" ref={modeRef}>
              <button
                type="button"
                className={`cp-mode-pill${modeOpen ? ' open' : ''}`}
                onClick={() => setModeOpen(o => !o)}
              >
                <span>{selectedMode.icon}</span>
                <span>{getSurveyModeLabel(selectedMode)}</span>
                <svg className="cp-chevron" width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
                  <path d="M0 0l4 5 4-5z" />
                </svg>
              </button>

              {modeOpen && (
                <div className="cp-mode-dropdown">
                  {SURVEY_MODES.map(mode => (
                    <button
                      key={mode.id}
                      className={`cp-mode-option${selectedMode.id === mode.id ? ' active' : ''}`}
                      onClick={() => { setSelectedMode(mode); setModeOpen(false); }}
                    >
                      <div className="cp-mode-icon">{mode.icon}</div>
                      <div className="cp-mode-option-text">
                        <div>{getSurveyModeLabel(mode)}</div>
                        <div className="cp-mode-option-desc">{mode.desc}</div>
                      </div>
                      {selectedMode.id === mode.id && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="cp-toolbar-spacer" />

            {/* Draft saved indicator */}
            {draftSaved && (
              <span style={{
                fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--sage)', opacity: 0.7,
                animation: 'cpFadeIn 0.3s ease',
              }}>
                ✓ Draft saved
              </span>
            )}

            {/* Submit */}
            <button
              type="button"
              className={`cp-submit-btn${aiGenerating ? ' generating' : ''}`}
              onClick={handleSubmit}
              disabled={aiGenerating || !prompt.trim()}
              style={{ position: 'relative' }}
              title="Generate survey"
            >
              {aiGenerating && (
                <>
                  <div className="sonar-ring" />
                  <div className="sonar-ring" />
                  <div className="sonar-ring" />
                </>
              )}
              {aiGenerating ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(253,245,232,0.3)', borderTopColor: 'var(--cream)', borderRadius: '50%' }}
                />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>

          {selectedMode.id === 'custom' && (
            <div className="cp-custom-mode">
              <textarea
                value={customInstruction}
                onChange={e => setCustomInstruction(e.target.value)}
                placeholder="Describe the tone, depth, question style, engagement level, or structure you want..."
                rows={2}
                disabled={aiGenerating}
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick Template Chips */}
      <div className="cp-chips-section">
        <div className="cp-chips-label">Or start from a template</div>
        <div className="cp-chips-row">
          {QUICK_TEMPLATES.map(t => (
            <button
              key={t.name}
              type="button"
              className="cp-chip"
              onClick={() => handleTemplate(t.name)}
            >
              <span className="cp-chip-icon">{t.icon}</span>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Skip link */}
      <div className="cp-skip">
        <button type="button" className="cp-skip-btn" onClick={onSkip}>
          Skip, build manually
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
