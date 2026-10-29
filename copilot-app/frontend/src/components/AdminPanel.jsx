import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, FileText, Trash2, Plus, BookOpen, Shield, CheckCircle2,
  AlertCircle, RefreshCw, ChevronDown, ChevronUp, X
} from 'lucide-react';

/**
 * AdminPanel — Phase 3
 * Admin-only view for managing the copilot knowledge base.
 * Admins can upload, view, and delete company policy documents.
 * These documents are retrieved during live calls to ground copilot suggestions.
 */
export default function AdminPanel({ agentRole = 'admin', onBack }) {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (e) {
      showNotification('error', 'Could not reach backend. Running in offline mode.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !uploadContent.trim()) {
      showNotification('error', 'Both title and content are required.');
      return;
    }
    setUploading(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Role': agentRole,
        },
        body: JSON.stringify({ title: uploadTitle.trim(), content: uploadContent.trim() }),
      });
      if (res.ok || res.status === 201) {
        showNotification('success', `Document "${uploadTitle}" uploaded successfully.`);
        setUploadTitle('');
        setUploadContent('');
        fetchDocuments();
      } else {
        const err = await res.json();
        showNotification('error', err.detail || 'Upload failed.');
      }
    } catch (e) {
      showNotification('error', 'Network error. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Delete document "${title}"? This cannot be undone.`)) return;
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'X-Agent-Role': agentRole },
      });
      if (res.ok) {
        showNotification('success', `Document "${title}" deleted.`);
        fetchDocuments();
      } else {
        showNotification('error', 'Could not delete document.');
      }
    } catch (e) {
      showNotification('error', 'Network error during delete.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="glass-panel p-5 border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
            <BookOpen className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Knowledge Base Admin</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload policy documents and scripts that ground live copilot suggestions.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border ${agentRole === 'admin' ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
            {agentRole === 'admin' ? '🔐 Admin Role' : '👁 Agent Role (Read-Only)'}
          </span>
          <button
            onClick={fetchDocuments}
            className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
            title="Refresh documents"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`glass-panel px-4 py-3 flex items-center gap-3 text-sm border ${
          notification.type === 'success'
            ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
            : 'border-rose-500/40 bg-rose-950/20 text-rose-300'
        }`}>
          {notification.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-auto">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Upload Form */}
      <div className="glass-panel p-6 border-slate-800 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Plus className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Upload New Document</h3>
        </div>
        <form onSubmit={handleUpload} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider font-mono mb-1.5 block">
              Document Title *
            </label>
            <input
              type="text"
              value={uploadTitle}
              onChange={e => setUploadTitle(e.target.value)}
              placeholder="e.g. Refund Policy v3.2, Technical Escalation Guide"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider font-mono mb-1.5 block">
              Document Content *
            </label>
            <textarea
              value={uploadContent}
              onChange={e => setUploadContent(e.target.value)}
              placeholder="Paste the full policy text, script, or knowledge article here..."
              rows={6}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none font-mono"
            />
            <div className="text-[10px] text-slate-500 mt-1 text-right font-mono">
              {uploadContent.length} characters
            </div>
          </div>
          <button
            type="submit"
            disabled={uploading || !uploadTitle.trim() || !uploadContent.trim()}
            className="self-start bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold px-5 py-2 rounded-lg text-xs flex items-center gap-2 transition-all"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </form>
      </div>

      {/* Document Library */}
      <div className="glass-panel p-5 border-slate-800 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Knowledge Library
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-slate-500 text-sm">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            No documents uploaded yet. Upload your first policy document above.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((doc) => (
              <div
                key={doc.doc_id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden"
              >
                {/* Doc header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setExpandedDoc(expandedDoc === doc.doc_id ? null : doc.doc_id)}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                  >
                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-200 truncate">{doc.title}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {doc.word_count} words · Uploaded {formatDate(doc.created_at)} · by {doc.uploaded_by}
                      </div>
                    </div>
                    {expandedDoc === doc.doc_id
                      ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                      : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(doc.doc_id, doc.title)}
                    disabled={deletingId === doc.doc_id || doc.uploaded_by === 'system'}
                    title={doc.uploaded_by === 'system' ? 'System default docs can be deleted too' : 'Delete document'}
                    className="ml-3 p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30 transition-colors rounded-md hover:bg-rose-950/30 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Expanded content */}
                {expandedDoc === doc.doc_id && (
                  <div className="px-4 pb-4 border-t border-slate-800/60 pt-3">
                    <div className="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {doc.content}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-2">
                      ID: {doc.doc_id}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="glass-panel p-4 border-slate-800 flex items-start gap-3">
        <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Zero-Trust Document Policy:</strong> Documents are stored only in the Control Plane and are never accessible from the PCI Data Plane (payment service). The copilot only receives redacted transcripts — any Luhn-valid card number in a transcript is masked before retrieval occurs. Agents can view suggestions but cannot manage documents.
        </div>
      </div>
    </div>
  );
}

