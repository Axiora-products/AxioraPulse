import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import useDrivePicker from 'react-google-drive-picker';
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

const MIN_RECORDING_DURATION_MS = 2000;
const MIN_RECORDING_BYTES = 4000;
const MAX_RECORDING_DURATION_MS = 29000;
const TRANSCRIPTION_REQUEST_TIMEOUT_MS = 120000;
const TRANSCRIPTION_TIMEOUT_MESSAGE = 'Transcription is taking too long. Please try a shorter recording.';

export default function SurveyPromptScreen({ onGenerate, onSkip, onLoadTemplate, galleryTemplates, aiGenerating, initialData }) {
  const [prompt, setPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState(SURVEY_MODES[0]);
  const [customInstruction, setCustomInstruction] = useState('');
  const [modeOpen, setModeOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [attachedAudio, setAttachedAudio] = useState([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isTranscribingMic, setIsTranscribingMic] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [fetchedLibrary, setFetchedLibrary] = useState(false);
  const [myFolderView, setMyFolderView] = useState(false);
  const [libraryPage, setLibraryPage] = useState(0);

  const [openPicker, authResponse] = useDrivePicker();
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const recordingTimeoutRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const preferredMimeType = 'audio/webm;codecs=opus';
      const supportsOpus = MediaRecorder.isTypeSupported?.(preferredMimeType);
      const recorderOptions = {
        audioBitsPerSecond: 128000,
        ...(supportsOpus ? { mimeType: preferredMimeType } : {}),
      };
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;
      recordingStartedAtRef.current = Date.now();

      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        const recordingDuration = Date.now() - recordingStartedAtRef.current;
        const recorderMimeType = mediaRecorder.mimeType || 'audio/webm';
        const uploadMimeType = recorderMimeType.split(';')[0];
        const audioBlob = new Blob(chunks, { type: uploadMimeType });

        if (recordingDuration < MIN_RECORDING_DURATION_MS || audioBlob.size < MIN_RECORDING_BYTES) {
          toast.error('Please record for at least 2 seconds and speak clearly.');
          setAudioChunks([]);
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        console.log('Microphone blob size:', audioBlob.size);
        console.log('Microphone blob type:', audioBlob.type);
        console.log('Microphone FormData keys:', Array.from(formData.keys()));

        setIsTranscribingMic(true);
        try {
          const response = await API.post('/uploads/audio/transcribe', formData, {
            timeout: TRANSCRIPTION_REQUEST_TIMEOUT_MS,
          });
          console.log('Transcription response:', response.data);
          const { data } = response;
          const transcript = data.text?.trim();
          if (transcript) {
            setPrompt(prev => `${prev}${prev.trim() ? ' ' : ''}${transcript}`);
            toast.success('Recording transcribed');
          }
        } catch (err) {
          const errorText = typeof err.response?.data === 'string'
            ? err.response.data
            : JSON.stringify(err.response?.data || { message: err.message });
          console.error(
            'Audio transcription response:',
            err.response?.status,
            errorText,
          );
          toast.error(
            err.code === 'ECONNABORTED'
              ? TRANSCRIPTION_TIMEOUT_MESSAGE
              : err.response?.data?.detail || 'Audio transcription failed',
          );
        } finally {
          setIsTranscribingMic(false);
          setAudioChunks([]);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
          toast('Recording stopped before the 30-second limit.');
        }
      }, MAX_RECORDING_DURATION_MS);
      setAudioChunks(chunks);
      setIsRecording(true);
    } catch (err) {
      console.error("Mic permission denied", err);
    }
  };

  const stopRecording = () => {
    clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };
  const handleOpenPicker = () => {
    setUploadOpen(false);
    openPicker({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      developerKey: import.meta.env.VITE_GOOGLE_API_KEY,
      viewId: "DOCS",
      showUploadView: true,
      showUploadFolders: true,
      supportDrives: true,
      multiselect: false,
      callbackFunction: async (data) => {
        if (data.action === 'picked') {
          setIsUploadingFile(true);
          try {
            const file = data.docs[0];
            const res = await API.post('/uploads/drive', {
              fileId: file.id,
              accessToken: authResponse.access_token,
              filename: file.name,
              mimeType: file.mimeType
            });
            setAttachedFiles(prev => [...prev, {
              id: res.data.id,
              filename: res.data.filename,
              extractedText: res.data.extracted_text || '',
              type: 'file'
            }]);
            toast.success(`"${file.name}" attached from Drive`);
          } catch (err) {
            toast.error(err.response?.data?.detail || "Drive import failed");
            console.error(err);
          } finally {
            setIsUploadingFile(false);
          }
        }
      },
    });
  };

  useEffect(() => {
    if (myFolderView && !fetchedLibrary) {
      API.get('/uploads/files').then(({ data }) => {
        setLibraryFiles(data);
        setFetchedLibrary(true);
      }).catch(err => console.error('Failed to pre-fetch library files', err));
    }
  }, [myFolderView, fetchedLibrary]);

  useEffect(() => {
    if (!uploadOpen) {
      setTimeout(() => {
        setMyFolderView(false);
        setLibraryPage(0);
      }, 200);
    }
  }, [uploadOpen]);

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
            const myFiles = allFiles.filter(f => initialData.attachments.includes(f.id)).map(f => ({
              id: f.id,
              filename: f.filename,
              extractedText: f.extracted_text || '',
              type: f.upload_type
            }));
            setAttachedFiles(myFiles.filter(f => f.type === 'file'));
            setAttachedAudio(myFiles.filter(f => f.type === 'audio'));
          } catch (e) {
            console.error('Failed to load attachment metadata', e);
          }
        };
        loadAttachments();
      }
    }
  }, [initialData]);

  const modeRef = useRef(null);
  const uploadRef = useRef(null);
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

  // Close upload dropdown on outside click
  useEffect(() => {
    if (!uploadOpen) return;
    const handler = e => { if (uploadRef.current && !uploadRef.current.contains(e.target)) setUploadOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [uploadOpen]);

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
    setIsUploadingFile(true);
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
    setIsUploadingFile(false);
    e.target.value = '';
  };

  // ── Audio Upload Handler ──
  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await API.post('/uploads/audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: TRANSCRIPTION_REQUEST_TIMEOUT_MS,
      });
      console.log('Transcription response:', response.data);
      const { data } = response;
      setAttachedAudio(prev => [...prev, {
        id: data.id,
        filename: data.filename,
        extractedText: data.extracted_text || '',
        type: 'audio',
      }]);
      toast.success(`"${data.filename}" attached`);
    } catch (err) {
      const errorText = typeof err.response?.data === 'string'
        ? err.response.data
        : JSON.stringify(err.response?.data || { message: err.message });
      console.error(
        'Audio upload response:',
        err.response?.status,
        errorText,
      );
      toast.error(
        err.code === 'ECONNABORTED'
          ? TRANSCRIPTION_TIMEOUT_MESSAGE
          : err.response?.data?.detail || 'Audio upload failed',
      );
    }
    setIsUploadingFile(false);
    e.target.value = '';
  };

  const removeAttachment = (id, type) => {
    if (type === 'file') setAttachedFiles(prev => prev.filter(f => f.id !== id));
    else setAttachedAudio(prev => prev.filter(f => f.id !== id));
  };

  // openLibrary function removed as modal is now replaced by in-place pagination

  const handleLibrarySelect = (file) => {
    if (file.upload_type === 'audio') {
      if (!attachedAudio.find(f => f.id === file.id)) {
        setAttachedAudio(prev => [...prev, { id: file.id, filename: file.filename, extractedText: file.extracted_text || '', type: 'audio' }]);
        toast.success(`"${file.filename}" attached`);
      } else {
        toast.error('File already attached');
      }
    } else {
      if (!attachedFiles.find(f => f.id === file.id)) {
        setAttachedFiles(prev => [...prev, { id: file.id, filename: file.filename, extractedText: file.extracted_text || '', type: 'file' }]);
        toast.success(`"${file.filename}" attached`);
      } else {
        toast.error('File already attached');
      }
    }
  };

  const handleSubmit = () => {
    const hasAttachments = attachedFiles.length > 0 || attachedAudio.length > 0;
    if (!prompt.trim() && !hasAttachments) return toast.error('Describe what you want to research or attach a file');
    if (selectedMode.id === 'custom' && !customInstruction.trim()) return toast.error('Add custom mode instructions first');
    const fileContext = attachedFiles.map(f => f.extractedText).filter(Boolean).join('\n\n');
    const audioContext = attachedAudio.map(f => f.extractedText).filter(Boolean).join('\n\n');
    const finalPrompt = prompt.trim() || "Please generate a comprehensive survey based on the provided documents.";
    onGenerate(finalPrompt, finalPrompt, selectedMode.id, fileContext, audioContext, customInstruction);
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
            <div className="cp-mode-selector" ref={uploadRef}>
              <button
                type="button"
                className={`cp-tool-btn premium-upload-btn ${uploadOpen ? ' open' : ''}`}
                onClick={() => setUploadOpen(o => !o)}
                disabled={isUploadingFile}
              >
                {isUploadingFile ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: 'linear'
                    }}
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      border: '2px solid rgba(255,120,40,0.15)',
                      borderTopColor: '#ff5a1f',
                      borderRadius: '50%',
                    }}
                  />
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
              </button>

              {uploadOpen && (
                <div
                  className="cp-mode-dropdown premium-upload-dropdown"
                  style={{
                    minWidth: '260px',
                    bottom: 'calc(100% + 10px)',
                    left: 0,
                    padding: '10px',
                  }}
                >

                  {/* MY FOLDER */}
                  <button
                    type="button"
                    className={`cp-mode-option premium-option ${myFolderView ? ' active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMyFolderView(!myFolderView);
                    }}
                  >
                    <div className="premium-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    <div
                      className="cp-mode-option-text"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                      }}
                    >
                      <div>My folder</div>

                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          opacity: myFolderView ? 1 : 0.3,
                          transform: myFolderView ? 'rotate(90deg)' : 'none',
                          transition: 'all 0.25s',
                        }}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </button>

                  {/* EXPAND */}
                  <AnimatePresence>
                    {myFolderView && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{
                          overflow: 'hidden',
                          paddingLeft: '12px',
                          marginTop: '4px',
                          marginBottom: '8px',
                        }}
                      >
                        {libraryFiles.slice(libraryPage * 5, libraryPage * 5 + 5).map(f => (
                          <button
                            key={f.id}
                            type="button"
                            className="cp-mode-option premium-file-option"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLibrarySelect(f);
                              setUploadOpen(false);
                            }}
                          >
                            <div className="premium-mini-icon">
                              {f.upload_type === 'audio' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                  <path
                                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                  />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                  <path
                                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                  />
                                </svg>
                              )}
                            </div>

                            <div
                              className="cp-mode-option-text"
                              style={{
                                flex: 1,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  fontSize: 11,
                                }}
                              >
                                {f.filename}
                              </div>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* DRIVE */}
                  <button
                    type="button"
                    className="cp-mode-option premium-option"
                    onClick={handleOpenPicker}
                  >
                    <div className="premium-icon drive-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M7 3h10l4 7-5 8H6L1 10l6-7z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    <div className="cp-mode-option-text">
                      <div>From drive</div>
                    </div>
                  </button>

                  {/* LOCAL */}
                  <button
                    type="button"
                    className="cp-mode-option premium-option"
                    onClick={() => {
                      setUploadOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <div className="premium-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect
                          x="3"
                          y="4"
                          width="18"
                          height="12"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M8 20h8"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>

                    <div className="cp-mode-option-text">
                      <div>Local system</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
            {/* Record/Upload Audio */}
            <button
              type="button"
              className={`cp-tool-btn ${isRecording ? "recording" : ""}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isTranscribingMic}
            >
              {isTranscribingMic ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 1,
                    ease: 'linear'
                  }}
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,120,40,0.15)',
                    borderTopColor: '#ff5a1f',
                    borderRadius: '50%',
                  }}
                />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={isRecording ? "currentColor" : "none"}
                  stroke={isRecording ? "#ff5a1f" : "currentColor"}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}

              <div className="voice-record-container">
                {/* <span className="recording-text">
                  {isRecording ? " : ""}
                </span> */}

                {isRecording && (
                  <div className="chatgpt-wave">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          animationDelay: `${i * 0.04}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
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
              disabled={aiGenerating || (!prompt.trim() && !hasAttachments)}
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
      <style>
        {`.chatgpt-wave {
  display: flex;
  align-items: center;
  gap: 3px;

  width: 95px;
  height: 20px;

  overflow: hidden;
}

.chatgpt-wave span {
  width: 3px;
  border-radius: 999px;

  /* PREMIUM ORANGE */
  background: linear-gradient(
    180deg,
    #ffb066 0%,
    #ff7a1a 45%,
    #ff5200 100%
  );

  box-shadow:
    0 0 6px rgba(255, 98, 0, 0.35),
    0 0 12px rgba(255, 120, 40, 0.18);

  animation: chatWave 0.9s infinite ease-in-out;
}

.chatgpt-wave span:nth-child(odd) {
  height: 6px;
}

.chatgpt-wave span:nth-child(even) {
  height: 13px;
}

.chatgpt-wave span:nth-child(3n) {
  height: 20px;
}

.voice-record-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recording-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  /* PREMIUM TEXT */
  color: #ff6b1a;

  white-space: nowrap;
}

.cp-tool-btn.recording {
  background: rgba(255, 115, 0, 0.08);
  border: 1px solid rgba(255, 115, 0, 0.22);

  box-shadow:
    0 0 0 1px rgba(255, 120, 20, 0.06),
    0 10px 30px rgba(255, 98, 0, 0.08);
}

@keyframes chatWave {
  0%, 100% {
    transform: scaleY(0.55);
    opacity: 0.45;
  }

  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

.premium-option {
  border-radius: 18px;
  transition: all 0.25s ease;

  position: relative;
  overflow: hidden;
}

.premium-option:hover {
  background: rgba(255,120,40,0.07);
  transform: translateY(-1px);
}

/* ICON NORMAL */
.premium-icon {
  width: 36px;
  height: 36px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 14px;

  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,0.95),
      rgba(255,245,238,0.8)
    );

  border: 1px solid rgba(255,120,40,0.12);

  color: #ff641f;

  transition: all 0.25s ease;

  box-shadow:
    0 6px 18px rgba(255,120,40,0.08);
}

/* ICON HOVER */
.premium-option:hover .premium-icon {
  background:
    linear-gradient(
      180deg,
      #ff8a3d 0%,
      #ff641f 100%
    );

  color: white;

  border-color: rgba(255,120,40,0.35);

  transform: scale(1.05);

  box-shadow:
    0 12px 24px rgba(255,90,0,0.22),
    0 0 18px rgba(255,120,40,0.16);
}

/* MINI ICONS */
.premium-mini-icon {
  width: 28px;
  height: 28px;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 10px;

  background: rgba(255,120,40,0.08);

  color: #ff641f;

  transition: all 0.25s ease;
}

.premium-file-option:hover .premium-mini-icon {
  background:
    linear-gradient(
      180deg,
      #ff8a3d 0%,
      #ff641f 100%
    );

  color: white;

  transform: scale(1.05);

  box-shadow:
    0 10px 20px rgba(255,90,0,0.18);
}
    /* FILE + MIC BUTTON */
.cp-tool-btn {
  cursor: pointer;
  transition:
    all 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    color 0.25s ease;
}

/* HOVER EFFECT */
.cp-tool-btn:hover {
  color: #ff641f;

  border-color: rgba(255,120,40,0.28);

  background:
    linear-gradient(
      180deg,
      rgba(255,140,60,0.08),
      rgba(255,90,0,0.04)
    );

  box-shadow:
    0 10px 26px rgba(255,90,0,0.12),
    0 0 0 1px rgba(255,120,40,0.08);

  transform: translateY(-1px);
}

/* SVG ICON ORANGE */
.cp-tool-btn:hover svg {
  color: #ff641f;
  stroke: #ff641f;
}

/* MIC BUTTON SPECIAL */
.cp-tool-btn.recording:hover {
  background:
    linear-gradient(
      180deg,
      rgba(255,120,40,0.12),
      rgba(255,90,0,0.06)
    );

  box-shadow:
    0 12px 28px rgba(255,90,0,0.18),
    0 0 20px rgba(255,120,40,0.08);
}

/* ORANGE CURSOR FEEL */
.cp-tool-btn:hover,
.premium-option:hover,
.premium-file-option:hover {
  cursor: pointer;
}
}`}
      </style>
    </div>
  );
}
