import React, { useState, useEffect } from 'react';
import {
  Upload, FileText, Trash2, Plus, BookOpen, Shield, CheckCircle2,
  AlertCircle, RefreshCw, ChevronDown, ChevronUp, X, Lock, Eye
} from 'lucide-react';

/**
 * AdminPanel
 * Role-Based Knowledge Base management for copilot grounding.
 * Admin: Full upload, view, and delete privileges.
 * Agent: Strictly read-only access to browse and view documents.
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
    if (agentRole !== 'admin') {
      showNotification('error', 'Unauthorized: Only Administrators can upload documents.');
      return;
    }
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
    if (agentRole !== 'admin') {
      showNotification('error', 'Unauthorized: Only Administrators can delete documents.');
      return;
    }
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

  const formatDate = (ts) => {
    if (!ts) return 'Just now';
    const num = Number(ts);
    if (isNaN(num)) return 'Recent';
    const d = new Date(num < 10000000000 ? num * 1000 : num);
    return isNaN(d.getTime()) ? 'Recent' : d.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#0B261B] border border-[#165038]">
            <BookOpen className="w-5 h-5 text-[#00E676]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#EDF3F0]">Knowledge Base & Copilot Grounding</h2>
            <p className="text-xs text-[#768782] mt-0.5">
              Enterprise policies and scripts retrieved during live customer calls by Muse Spark Open.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-mono px-3 py-1 rounded-full border ${
            agentRole === 'admin'
              ? 'bg-[#0B2A1E] text-[#00E676] border-[#165038]'
              : 'bg-[#131E1B] text-[#768782] border-[#1A2824]'
          }`}>
            {agentRole === 'admin' ? '🛡️ Admin (Full Access)' : '👤 Agent (Read-Only)'}
          </span>
          <button
            onClick={fetchDocuments}
            className="p-2 text-[#768782] hover:text-[#00E676] transition-colors"
            title="Refresh documents"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-xs border ${
          notification.type === 'success'
            ? 'border-[#165038] bg-[#0B261B] text-[#00E676]'
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

      {/* Upload Form (Admin only) or Read-Only Notice (Agent) */}
      {agentRole === 'admin' ? (
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-[#1A2824] pb-3">
            <Plus className="w-4 h-4 text-[#00E676]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#EDF3F0]">Upload New Grounding Document</h3>
          </div>
          <form onSubmit={handleUpload} className="flex flex-col gap-3">
            <div>
              <label className="text-[11px] text-[#768782] uppercase tracking-wider font-mono mb-1.5 block">
                Document Title *
              </label>
              <input
                type="text"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. Refund Policy v3.2, Billing Escalation Guide"
                className="w-full bg-[#070B0A] border border-[#1A2824] rounded-xl px-3 py-2.5 text-xs text-[#EDF3F0] placeholder:text-[#4B5A55] focus:outline-none focus:border-[#00E676] transition-colors"
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-[11px] text-[#768782] uppercase tracking-wider font-mono mb-1.5 block">
                Document Content *
              </label>
              <textarea
                value={uploadContent}
                onChange={e => setUploadContent(e.target.value)}
                placeholder="Paste the policy text, pricing tables, or customer objection script that Muse Spark Open should retrieve..."
                rows={5}
                className="w-full bg-[#070B0A] border border-[#1A2824] rounded-xl px-3 py-2.5 text-xs text-[#EDF3F0] placeholder:text-[#4B5A55] focus:outline-none focus:border-[#00E676] transition-colors resize-y font-mono"
              />
            </div>
            <div className="flex justify-end mt-1">
              <button
                type="submit"
                disabled={uploading || !uploadTitle.trim() || !uploadContent.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00E676] hover:bg-[#00C853] disabled:opacity-40 text-[#070B0A] font-bold text-xs transition-all shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Indexing into Vector Store...' : 'Upload & Ground'}</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#111C19] border border-[#1C2C28] text-[#768782]">
              <Lock className="w-5 h-5 text-[#34D399]" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#EDF3F0]">Read-Only Knowledge Base</h3>
              <p className="text-xs text-[#768782] mt-0.5">
                Agents have view-only access to company policies and scripts. Document uploads and edits require Admin privileges.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#111C19] text-[#768782] border border-[#1A2824]">
            RBAC: Protected
          </span>
        </div>
      )}

      {/* Documents List */}
      <div className="bg-[#0E1614] border border-[#1A2824] rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1A2824] pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#00E676]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#EDF3F0]">
              Active Knowledge Documents ({documents.length})
            </h3>
          </div>
          <span className="text-[11px] font-mono text-[#768782]">
            Grounded in Baseten Muse Spark Open
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#768782]">
            <RefreshCw className="w-5 h-5 animate-spin text-[#00E676]" />
            <span className="text-xs font-mono">Loading knowledge base...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#768782] text-center">
            <FileText className="w-8 h-8 text-[#1A2824]" />
            <p className="text-xs">No documents uploaded yet.</p>
            {agentRole === 'admin' && (
              <p className="text-[11px] text-[#4B5A55]">Use the upload form above to index your first policy.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {documents.map(doc => {
              const isExpanded = expandedDoc === doc.id;
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-[#1A2824] bg-[#070B0A] overflow-hidden transition-all hover:border-[#1E302B]"
                >
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#0B261B] border border-[#165038] flex items-center justify-center text-[#00E676] shrink-0">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#EDF3F0] truncate flex items-center gap-2">
                          <span>{doc.title}</span>
                          <span className="text-[10px] font-mono text-[#34D399] bg-[#0B2A1E] border border-[#165038] px-1.5 py-0.2 rounded">
                            {doc.chunk_count || 1} chunks
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[#768782] mt-0.5">
                          ID: {doc.id} • Added: {formatDate(doc.created_at)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                        className="p-1.5 text-[#768782] hover:text-[#EDF3F0] rounded-lg transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand Content'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {agentRole === 'admin' && (
                        <button
                          onClick={() => handleDelete(doc.id, doc.title)}
                          disabled={deletingId === doc.id}
                          className="p-1.5 text-[#768782] hover:text-rose-400 rounded-lg transition-colors disabled:opacity-40"
                          title="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-[#1A2824] bg-[#0A110F]">
                      <div className="text-[11px] font-mono text-[#768782] uppercase mb-1.5 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-[#00E676]" />
                        <span>Document Raw Content:</span>
                      </div>
                      <pre className="text-xs font-mono text-[#C0D0CB] bg-[#070B0A] p-3 rounded-lg border border-[#1A2824] whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                        {doc.content}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}