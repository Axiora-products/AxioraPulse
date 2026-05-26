import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FileSpreadsheet,
  FileVideo,
  Folder,
  FileCode2,
  Archive,
  FileJson,
  Mic,
  ImageIcon,
  Files,
  Music2,
  Images,
  ChevronRight,
  ChevronDown, // ADD THIS
  PanelRightClose,
  PanelRightOpen,
  ChevronsRight,
  FolderOpen,
} from 'lucide-react';

const FILE_TYPES = [
  {
    id: 'all',
    label: 'All Files',
    icon: Files,
    color: '#FF5A00',
    bg: 'rgba(255,90,0,0.10)',
  },
  {
    id: 'file',
    label: 'Documents',
    icon: FileText,
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.10)',
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: Music2,
    color: '#C026D3',
    bg: 'rgba(192,38,211,0.10)',
  },
  {
    id: 'image',
    label: 'Images',
    icon: Images,
    color: '#CA8A04',
    bg: 'rgba(202,138,4,0.10)',
  },
];

export default function DocumentFilesPane({ onCollapse }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState('all');

  const getFileIcon = (type, name = '') => {
    const t = (type || '').toLowerCase();
    const n = (name || '').toLowerCase();

    const commonProps = {
      size: 18,
      strokeWidth: 1.8,
    };

    if (t.includes('pdf')) {
      return <FileText {...commonProps} color="#FF5A00" />;
    }

    if (
      t.includes('word') ||
      n.endsWith('.doc') ||
      n.endsWith('.docx')
    ) {
      return <FileText {...commonProps} color="#2563EB" />;
    }

    if (
      t.includes('sheet') ||
      n.endsWith('.xls') ||
      n.endsWith('.xlsx')
    ) {
      return <FileSpreadsheet {...commonProps} color="#16A34A" />;
    }

    if (
      t.includes('audio') ||
      n.endsWith('.mp3') ||
      n.endsWith('.wav')
    ) {
      return <Mic {...commonProps} color="#C026D3" />;
    }

    if (
      t.includes('video') ||
      n.endsWith('.mp4')
    ) {
      return <FileVideo {...commonProps} color="#DC2626" />;
    }

    if (
      t.includes('image') ||
      ['.png', '.jpg', '.jpeg', '.webp'].some(ext => n.endsWith(ext))
    ) {
      return <ImageIcon {...commonProps} color="#CA8A04" />;
    }

    if (
      n.endsWith('.zip') ||
      n.endsWith('.rar')
    ) {
      return <Archive {...commonProps} color="#7C3AED" />;
    }

    if (
      n.endsWith('.json')
    ) {
      return <FileJson {...commonProps} color="#0F766E" />;
    }

    if (
      n.endsWith('.js') ||
      n.endsWith('.jsx') ||
      n.endsWith('.ts') ||
      n.endsWith('.tsx')
    ) {
      return <FileCode2 {...commonProps} color="#EA580C" />;
    }

    return <Folder {...commonProps} color="#6B7280" />;
  };

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



  return (
    <div className="doc-pane">
      <div className="doc-pane-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 className="doc-pane-title">Files</h3>
        </div>
        <button
          onClick={onCollapse}
          className="doc-collapse-btn"
          title="Close Files Panel"
        >
          <PanelRightClose
            size={18}
            strokeWidth={2}
          />
        </button>
      </div>

      <div className="premium-navbar-dropdown">
        <button className="premium-navbar-trigger">
          {
            FILE_TYPES.find(t => t.id === filter)?.label || 'All Files'
          }
          <ChevronDown size={16} />
        </button>

        <div className="premium-navbar-menu">

          {FILE_TYPES.map((t) => {
            const Icon = t.icon;

            return (
              <motion.button
                key={t.id}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setFilter(t.id)}
                className={`premium-navbar-item ${filter === t.id ? 'active' : ''}`}
              >
                <div
                  className="premium-navbar-icon"
                  style={{
                    background: t.bg,
                    color: t.color,
                  }}
                >
                  <Icon size={18} strokeWidth={2} />
                </div>

                <div className="premium-navbar-texts">
                  <div className="premium-navbar-title">
                    {t.label}
                  </div>

                  <div className="premium-navbar-sub">
                    Browse files
                  </div>
                </div>

                <ChevronRight
                  size={16}
                  strokeWidth={2}
                  className="premium-navbar-arrow"
                />
              </motion.button>
            );
          })}

        </div>

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
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ delay: i * 0.03 }}
                className="premium-file-card"
              >

                <div className="premium-file-icon">
                  {getFileIcon(f.content_type, f.filename)}
                </div>

                <div className="premium-file-info">

                  <div
                    className="premium-file-name"
                    title={f.filename}
                  >
                    {f.filename}
                  </div>

                  <div className="premium-file-meta">

                    <span className="premium-file-type">
                      {f.upload_type}
                    </span>

                    <span className="premium-file-dot">•</span>

                    <span>
                      {(f.file_size / 1024).toFixed(0)} KB
                    </span>

                  </div>

                </div>

                <a
                  href={f.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="premium-file-action"
                  title="Open File"
                >
                  ↗
                </a>

              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <style>{`
          .doc-pane {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            background: var(--warm-white);
            border-left: 1px solid rgba(22,15,8,0.07);
            padding: 24px 20px 24px 20px;
            width: 210px;
            flex-shrink: 0;
            box-sizing: border-box;
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
          .doc-collapse-btn:hover {
            color: var(--coral) !important;
            background: rgba(255,69,0,0.06);
          }
          .doc-filter-select-wrap {
            margin-bottom: 20px;
            position: relative;
          }
          .doc-filter-select {
            width: 100%;
            padding: 14px 16px;
            border-radius: 16px;
            border: 1px solid rgba(255,69,0,0.14);
            background: linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,248,240,0.92));
            color: var(--espresso);
            font-family: 'Syne', sans-serif;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
            outline: none;
            cursor: pointer;
            transition: all .25s ease;
            appearance: none;
            box-shadow: 0 4px 14px rgba(22,15,8,0.04);
          }
          .doc-filter-select:hover {
            border-color: var(--coral);
          }
          .doc-filter-select:focus {
            border-color: var(--coral);
            box-shadow: 0 0 0 4px rgba(255,69,0,0.08);
          }
          .doc-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
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
            .premium-file-card {
    display: flex;
    align-items: center;
    gap: 14px;

    padding: 14px;

    border-radius: 20px;

    background:
      linear-gradient(
        180deg,
        rgba(255,255,255,0.88),
        rgba(255,248,240,0.92)
      );

    border: 1px solid rgba(22,15,8,0.06);

    transition: all 0.28s ease;

    backdrop-filter: blur(14px);

    position: relative;

    overflow: hidden;
  }

  .premium-file-card:hover {
    transform: translateY(-2px);

    border-color: rgba(255,90,0,0.18);

    box-shadow:
      0 12px 30px rgba(22,15,8,0.08),
      0 0 0 1px rgba(255,90,0,0.04);
  }

  .premium-file-icon {
    width: 44px;
    height: 44px;

    border-radius: 14px;

    background: rgba(255,255,255,0.85);

    border: 1px solid rgba(22,15,8,0.06);

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;
  }

  .premium-file-info {
    flex: 1;
    min-width: 0;
  }

  .premium-file-name {
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 700;

    color: var(--espresso);

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    margin-bottom: 4px;
  }

  .premium-file-meta {
    display: flex;
    align-items: center;
    gap: 6px;

    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;

    letter-spacing: 0.06em;
    text-transform: uppercase;

    color: rgba(22,15,8,0.38);
  }

  .premium-file-type {
    color: var(--coral);
  }

  .premium-file-dot {
    opacity: 0.35;
  }

  .premium-file-action {
    width: 34px;
    height: 34px;

    border-radius: 10px;

    background: rgba(255,255,255,0.75);

    border: 1px solid rgba(22,15,8,0.06);

    display: flex;
    align-items: center;
    justify-content: center;

    color: rgba(22,15,8,0.45);

    text-decoration: none;

    transition: all 0.22s ease;
  }

  .premium-file-action:hover {
    color: var(--coral);

    background: rgba(255,90,0,0.08);

    border-color: rgba(255,90,0,0.18);
  }
  /* =========================
    PREMIUM NAVBAR DROPDOWN
    PERFECT SIDEBAR FIT
  ========================= */


  /* =========================
    COMPACT SIDEBAR DROPDOWN
  ========================= */

  .premium-navbar-dropdown {
    position: relative;
    width: 100%;
    margin-bottom: 14px;
  }

  /* =========================
    TRIGGER
  ========================= */

  .premium-navbar-trigger {
    width: 100%;
    height: 46px;

    padding: 0 14px;

    border-radius: 14px;
    border: 1px solid rgba(255,90,0,0.10);

    background:
      linear-gradient(
        180deg,
        rgba(255,255,255,0.92),
        rgba(255,248,240,0.96)
      );

    color: var(--espresso);

    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 700;

    display: flex;
    align-items: center;
    justify-content: space-between;

    cursor: pointer;

    box-sizing: border-box;

    overflow: hidden;
  }

  /* =========================
    MENU
  ========================= */

  .premium-navbar-menu {
    position: absolute;

    top: calc(100% + 8px);
    left: 0;

    width: 100%;

    padding: 8px;

    border-radius: 20px;

    background:
      linear-gradient(
        180deg,
        #121224,
        #05050d
      );

    border: 1px solid rgba(255,255,255,0.05);

    display: flex;
    flex-direction: column;

    gap: 6px;

    box-sizing: border-box;

    opacity: 0;
    visibility: hidden;

    transform: translateY(8px);

    transition: all 0.22s ease;

    z-index: 999;

    overflow: hidden;
  }

  /* SHOW */

  .premium-navbar-dropdown:hover .premium-navbar-menu {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  /* =========================
    ITEM
  ========================= */

  .premium-navbar-item {
    width: 100%;

    border: none;
    background: transparent;

    padding: 10px;

    border-radius: 16px;

    display: flex;
    align-items: center;

    gap: 10px;

    cursor: pointer;

    transition: all 0.22s ease;

    box-sizing: border-box;

    overflow: hidden;
  }

  .premium-navbar-item:hover {
    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,0.06),
        rgba(255,255,255,0.02)
      );
  }

  .premium-navbar-item.active {
    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,0.08),
        rgba(255,255,255,0.03)
      );
  }

  /* =========================
    ICON
  ========================= */

  .premium-navbar-icon {
    width: 38px;
    height: 38px;

    min-width: 38px;

    border-radius: 12px;

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;
  }

  /* =========================
    TEXT
  ========================= */

  .premium-navbar-texts {
    flex: 1;

    min-width: 0;

    overflow: hidden;
  }

  .premium-navbar-title {
    color: #ffffff;

    font-family: 'Fraunces', serif;
    font-size: 11px;
    font-weight: 700;

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .premium-navbar-sub {
    margin-top: 2px;

    color: rgba(255,255,255,0.45);

    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 600;

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* =========================
    ARROW
  ========================= */

  .premium-navbar-arrow {
    color: rgba(255,255,255,0.28);

    flex-shrink: 0;

    width: 14px;
    height: 14px;
  }
    .db-layout {
  overflow-x: hidden;
  overflow-y: auto;
}

 .db-main {
  flex: 1 1 auto;

  min-width: 0;

  width: auto;

  transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

  .db-right-pane {
  width: 280px; 

  flex-shrink: 0;
  background: var(--warm-white);

  border-left: 1px solid rgba(22,15,8,0.07);

  overflow: hidden;

  transition:
    width 0.32s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.25s ease,
    margin 0.32s ease;
}

/* COLLAPSED */

.db-right-pane.collapsed {
  width: 0 !important;

  min-width: 0 !important;

  flex: 0 0 0;

  opacity: 0;

  overflow: hidden;

  border-left: none;

  padding: 0;

  pointer-events: none;
}
        `}</style>
    </div>
  );
}
