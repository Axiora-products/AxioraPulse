import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';

const FILE_TYPES = [
  { id: 'all', label: 'All', icon: '📂' },
  { id: 'file', label: 'Documents', icon: '📄' },
  { id: 'audio', label: 'Audio', icon: '🎙️' },
  { id: 'image', label: 'Images', icon: '🖼️' },
];

export default function DocumentLibraryPane() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/uploads/files');
      setFiles(data);
    } catch (e) {
      console.error('Failed to fetch files', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredFiles = filter === 'all'
    ? files
    : files.filter(f => {
      if (filter === 'image') return f.content_type?.startsWith('image/');
      return f.upload_type === filter;
    });

  const getFileIcon = (f) => {
    if (f.content_type?.startsWith('image/')) return '🖼️';
    if (f.upload_type === 'audio') return '🎙️';
    return '📄';
  };

  return (
    <div className="doc-pane">
      <div className="doc-pane-header">
        <h3 className="doc-pane-title">Library</h3>
        {/* <button onClick={fetchFiles} className="doc-refresh-btn" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        </button> */}
      </div>

      <div className="doc-filter-select-wrap">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="doc-filter-select"
        >
          {FILE_TYPES.map(t => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="doc-list">
        {loading ? (
          <div className="doc-loading">
            {[1, 2, 3, 4].map(i => <div key={i} className="doc-skeleton" />)}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="doc-empty">
            <div className="doc-empty-icon">📭</div>
            <p>No {filter !== 'all' ? filter : ''} files found</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredFiles.map((f, i) => (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03 }}
                className="doc-item"
              >
                <div className="doc-item-icon">{getFileIcon(f)}</div>
                <div className="doc-item-info">
                  <div className="doc-item-name" title={f.filename}>{f.filename}</div>
                  <div className="doc-item-meta">
                    {(f.file_size / 1024).toFixed(0)} KB • {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="doc-item-actions">
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="doc-action-btn" title="View">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                  </a>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <style>{`
        .doc-pane {
  display:flex;
  flex-direction:column;

  min-height:100vh;

  background:var(--warm-white);

  border-left:1px solid rgba(22,15,8,0.07);

padding:24px 20px 24px 20px;
  width:240px;

  flex-shrink:0;
}
        .doc-pane-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .doc-pane-title {
          font-family: 'Syne', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(22,15,8,0.35);
          margin: 0;
        }
        .doc-refresh-btn {
          background: none;
          border: none;
          color: rgba(22,15,8,0.25);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .doc-refresh-btn:hover {
          color: var(--coral);
          background: rgba(255,69,0,0.06);
        }
        
        
        
        .doc-filter-select-wrap{
  margin-bottom:20px;
  position:relative;
}

.doc-filter-select{
  width:100%;

  padding:14px 16px;

  border-radius:16px;

  border:1px solid rgba(255,69,0,0.14);

  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,0.75),
      rgba(255,248,240,0.92)
    );

  color:var(--espresso);

  font-family:'Syne',sans-serif;
  font-size:11px;
  font-weight:700;

  letter-spacing:.08em;
  text-transform:uppercase;

  outline:none;

  cursor:pointer;

  transition:all .25s ease;

  appearance:none;

  box-shadow:
    0 4px 14px rgba(22,15,8,0.04);
}

.doc-filter-select:hover{
  border-color:var(--coral);
}

.doc-filter-select:focus{
  border-color:var(--coral);
  box-shadow:
    0 0 0 4px rgba(255,69,0,0.08);
}
        .doc-filter-btn.active .doc-filter-label { color: var(--coral); }
        
        .doc-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .doc-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--cream);
          border: 1px solid rgba(22,15,8,0.06);
          border-radius: 14px;
          transition: all 0.2s;
        }
        .doc-item:hover {
          border-color: rgba(22,15,8,0.12);
          box-shadow: 0 4px 12px rgba(22,15,8,0.04);
        }
        .doc-item-icon {
          width: 32px;
          height: 32px;
          background: white;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .doc-item-info {
          flex: 1;
          min-width: 0;
        }
        .doc-item-name {
          font-family: 'Fraunces', serif;
          font-size: 13px;
          font-weight: 500;
          color: var(--espresso);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .doc-item-meta {
          font-family: 'Syne', sans-serif;
          font-size: 9px;
          font-weight: 600;
          color: rgba(22,15,8,0.3);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 2px;
        }
        .doc-action-btn {
          color: rgba(22,15,8,0.25);
          padding: 6px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .doc-action-btn:hover {
          color: var(--coral);
          background: rgba(255,69,0,0.08);
        }
        .doc-empty {
          text-align: center;
          padding: 40px 20px;
        }
        .doc-empty-icon { font-size: 32px; margin-bottom: 12px; opacity: 0.2; }
        .doc-empty p {
          font-family: 'Fraunces', serif;
          font-size: 13px;
          color: rgba(22,15,8,0.4);
        }
        .doc-skeleton {
          height: 56px;
          background: var(--cream-deep);
          border-radius: 14px;
          animation: nx-shimmer 1.8s infinite;
          margin-bottom: 10px;
        }
      `}</style>
    </div>
  );
}
