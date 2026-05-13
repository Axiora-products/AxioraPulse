import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const SURVEY_MODES = [
  { id: 'general', label: 'General Survey', icon: '📋', desc: 'Open-ended research on any topic' },
  { id: 'nps', label: 'NPS Survey', icon: '📊', desc: 'Measure customer loyalty & satisfaction' },
  { id: 'product', label: 'Product Feedback', icon: '🛠️', desc: 'Gather actionable product insights' },
  { id: 'employee', label: 'Employee Pulse', icon: '👥', desc: 'Check team morale & engagement' },
  { id: 'event', label: 'Event Feedback', icon: '🎤', desc: 'Capture attendee experience' },
  { id: 'market', label: 'Market Research', icon: '🔍', desc: 'Understand your target audience' },
  { id: 'exit', label: 'Exit Interview', icon: '🚪', desc: 'Learn why people are leaving' },
];

const QUICK_TEMPLATES = [
  { name: 'NPS Survey', icon: '📊', category: 'Customer' },
  { name: 'Product Feedback', icon: '🛠️', category: 'Product' },
  { name: 'Employee Pulse', icon: '👥', category: 'HR' },
  { name: 'Event Feedback', icon: '🎤', category: 'Events' },
  { name: 'Market Research', icon: '🔍', category: 'Research' },
  { name: 'Exit Interview', icon: '🚪', category: 'HR' },
];

export default function SurveyPromptScreen({ onGenerate, onSkip, onLoadTemplate, galleryTemplates, aiGenerating }) {
  const [prompt, setPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState(SURVEY_MODES[0]);
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef(null);
  const textareaRef = useRef(null);

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

  const handleSubmit = () => {
    if (!prompt.trim()) return toast.error('Describe what you want to research');
    const modeContext = selectedMode.id !== 'general' ? ` (Survey type: ${selectedMode.label})` : '';
    onGenerate(prompt + modeContext, prompt);
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

  return (
    <div className="cp-center">
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

          {/* Toolbar */}
          <div className="cp-toolbar">
            {/* Upload Files */}
            <button
              type="button"
              className="cp-tool-btn"
              onClick={() => toast('File upload coming soon!', { icon: '📎' })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="cp-tool-label">Upload Files</span>
            </button>

            {/* Record Audio */}
            <button
              type="button"
              className="cp-tool-btn"
              onClick={() => toast('Audio recording coming soon!', { icon: '🎙️' })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span className="cp-tool-label">Record Audio</span>
            </button>

            {/* Survey Mode Selector */}
            <div className="cp-mode-selector" ref={modeRef}>
              <button
                type="button"
                className={`cp-mode-pill${modeOpen ? ' open' : ''}`}
                onClick={() => setModeOpen(o => !o)}
              >
                <span>{selectedMode.icon}</span>
                <span>{selectedMode.label}</span>
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
                        <div>{mode.label}</div>
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

            {/* Submit */}
            <button
              type="button"
              className={`cp-submit-btn${aiGenerating ? ' generating' : ''}`}
              onClick={handleSubmit}
              disabled={aiGenerating || !prompt.trim()}
              title="Generate survey"
            >
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
