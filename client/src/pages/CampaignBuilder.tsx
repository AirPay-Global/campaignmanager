import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, UnderlineIcon, Heading1, Heading2, List, ListOrdered,
  Link2, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight,
  Eye, EyeOff, Send, Calendar, ChevronDown, ArrowLeft, Loader2, Palette,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Segment { id: string; name: string; }
interface SegmentsResponse { data: Segment[]; }

const COLORS = ['#ffffff', '#e2e8f0', '#94a3b8', '#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899'];

function ToolbarBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
        color: active ? '#818cf8' : 'rgba(255,255,255,0.6)',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />;
}

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('AirPay Global');
  const [segmentId, setSegmentId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const { data: segmentsData } = useQuery<SegmentsResponse>({
    queryKey: ['segments'],
    queryFn: () => api.get('/segments').then(r => r.data),
  });
  const segments = segmentsData?.data ?? [];

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, HTMLAttributes: { style: 'color:#818cf8;text-decoration:underline;' } }),
      Image.configure({ HTMLAttributes: { style: 'max-width:100%;border-radius:8px;' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your email here…' }),
    ],
    editorProps: {
      attributes: {
        style: 'min-height:320px;outline:none;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.85);',
      },
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: object) => api.post('/campaigns', payload),
    onSuccess: (res) => {
      const id = res.data.id as string;
      if (!scheduledAt) {
        // Launch immediately
        api.post(`/campaigns/${id}/launch`)
          .then(r => {
            addToast('success', `Campaign sent — ${(r.data as { enqueued: number }).enqueued} emails enqueued.`);
            setTimeout(() => navigate('/campaigns'), 1500);
          })
          .catch(() => {
            addToast('success', 'Campaign created. Go to Campaigns to launch it.');
            setTimeout(() => navigate('/campaigns'), 1500);
          });
      } else {
        addToast('success', 'Campaign scheduled successfully.');
        setTimeout(() => navigate('/campaigns'), 1500);
      }
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create campaign.'),
  });

  const handleSend = () => {
    if (!name.trim()) { addToast('error', 'Campaign name is required.'); return; }
    if (!subject.trim()) { addToast('error', 'Subject line is required.'); return; }
    const html = editor?.getHTML() ?? '';
    if (!html || html === '<p></p>') { addToast('error', 'Email body cannot be empty.'); return; }

    createMutation.mutate({
      name,
      channel: 'email',
      subject,
      from_name: fromName,
      message_body: wrapInEmailTemplate(subject, fromName, html),
      ...(segmentId ? { segment_id: segmentId } : {}),
      ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
    });
  };

  const insertLink = useCallback(() => {
    if (!linkUrl) return;
    editor?.chain().focus().setLink({ href: linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}` }).run();
    setLinkUrl('');
    setShowLinkModal(false);
  }, [editor, linkUrl]);

  const insertImage = useCallback(() => {
    if (!imageUrl) return;
    editor?.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl('');
    setShowImageModal(false);
  }, [editor, imageUrl]);

  const previewHtml = showPreview ? wrapInEmailTemplate(subject, fromName, editor?.getHTML() ?? '') : '';

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '28px 32px' }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => navigate('/campaigns')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Email Campaign Builder</h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Design and send beautiful email campaigns</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowPreview(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, background: showPreview ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showPreview ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`, color: showPreview ? '#818cf8' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button className="btn-chrome" onClick={handleSend} disabled={createMutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, fontSize: 13 }}>
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin-slow" /> : <Send size={14} />}
              {scheduledAt ? 'Schedule' : 'Send Now'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '360px 1fr', gap: 20 }}>

          {/* Left: settings panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass animate-fade-in-up stagger-1" style={{ borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Campaign Settings</div>

              <div>
                <span className="chrome-label">Campaign Name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. June Newsletter" className="input-glass" />
              </div>
              <div>
                <span className="chrome-label">Subject Line</span>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Compelling subject line…" className="input-glass" />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>{subject.length}/90 chars · Keep under 50 for best results</div>
              </div>
              <div>
                <span className="chrome-label">From Name</span>
                <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="AirPay Global" className="input-glass" />
              </div>
              <div>
                <span className="chrome-label">Audience</span>
                <div style={{ position: 'relative' }}>
                  <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <select value={segmentId} onChange={e => setSegmentId(e.target.value)} className="select-glass" style={{ paddingRight: 30 }}>
                    <option value="">All Contacts</option>
                    {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="glass animate-fade-in-up stagger-2" style={{ borderRadius: 16, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Calendar size={14} color="#818cf8" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Schedule</span>
              </div>
              <span className="chrome-label">Send Date & Time</span>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input-glass" style={{ colorScheme: 'dark' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
                Leave blank to send immediately when you click Send Now
              </div>
            </div>

            {/* Tips */}
            <div className="glass animate-fade-in-up stagger-3" style={{ borderRadius: 16, padding: 22, background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tips</div>
              {['Keep subject lines under 50 characters', 'Add a clear call-to-action button', 'Include an unsubscribe link in footer', 'Optimise images — keep under 1MB', 'Test your email before sending'].map(tip => (
                <div key={tip} style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6, paddingLeft: 12, borderLeft: '2px solid rgba(99,102,241,0.3)', lineHeight: 1.4 }}>{tip}</div>
              ))}
            </div>
          </div>

          {/* Right: editor or preview */}
          {showPreview ? (
            <div className="glass animate-fade-in-up" style={{ borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={13} /> Email Preview
              </div>
              <div style={{ flex: 1, background: '#f3f4f6', overflowY: 'auto' }}>
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '600px', border: 'none' }}
                  title="Email Preview"
                />
              </div>
            </div>
          ) : (
            <div className="glass animate-fade-in-up" style={{ borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Toolbar */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)' }}>
                <ToolbarBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold">
                  <Bold size={13} />
                </ToolbarBtn>
                <ToolbarBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic">
                  <Italic size={13} />
                </ToolbarBtn>
                <ToolbarBtn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline">
                  <UnderlineIcon size={13} />
                </ToolbarBtn>

                <ToolbarDivider />

                <ToolbarBtn active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
                  <Heading1 size={13} />
                </ToolbarBtn>
                <ToolbarBtn active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
                  <Heading2 size={13} />
                </ToolbarBtn>

                <ToolbarDivider />

                <ToolbarBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List">
                  <List size={13} />
                </ToolbarBtn>
                <ToolbarBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List">
                  <ListOrdered size={13} />
                </ToolbarBtn>

                <ToolbarDivider />

                <ToolbarBtn active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align Left">
                  <AlignLeft size={13} />
                </ToolbarBtn>
                <ToolbarBtn active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Align Center">
                  <AlignCenter size={13} />
                </ToolbarBtn>
                <ToolbarBtn active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align Right">
                  <AlignRight size={13} />
                </ToolbarBtn>

                <ToolbarDivider />

                <ToolbarBtn active={editor?.isActive('link')} onClick={() => setShowLinkModal(true)} title="Insert Link">
                  <Link2 size={13} />
                </ToolbarBtn>
                <ToolbarBtn onClick={() => setShowImageModal(true)} title="Insert Image">
                  <ImageIcon size={13} />
                </ToolbarBtn>

                <ToolbarDivider />

                {/* Color picker */}
                <div style={{ position: 'relative' }}>
                  <ToolbarBtn onClick={() => setShowColorPicker(p => !p)} title="Text Colour">
                    <Palette size={13} />
                  </ToolbarBtn>
                  {showColorPicker && (
                    <div style={{ position: 'absolute', top: 36, left: 0, zIndex: 10, background: 'var(--color-modal-bg)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', width: 148, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                      {COLORS.map(c => (
                        <button key={c} type="button" onClick={() => { editor?.chain().focus().setColor(c).run(); setShowColorPicker(false); }} style={{ width: 22, height: 22, borderRadius: 5, background: c, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }} />
                      ))}
                      <button type="button" onClick={() => { editor?.chain().focus().unsetColor().run(); setShowColorPicker(false); }} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 6px', cursor: 'pointer', width: '100%' }}>Reset</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Editor area */}
              <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', minHeight: 400 }}>
                <style>{`
                  .tiptap p { margin: 0 0 12px; }
                  .tiptap h1 { font-size: 28px; font-weight: 800; color: #fff; margin: 0 0 12px; letter-spacing: -0.03em; }
                  .tiptap h2 { font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 10px; letter-spacing: -0.02em; }
                  .tiptap ul, .tiptap ol { padding-left: 20px; margin: 0 0 12px; color: rgba(255,255,255,0.8); }
                  .tiptap li { margin-bottom: 4px; }
                  .tiptap a { color: #818cf8; text-decoration: underline; }
                  .tiptap img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
                  .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: rgba(255,255,255,0.18); pointer-events: none; height: 0; }
                  .tiptap:focus-visible { outline: none; }
                `}</style>
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Link modal */}
      {showLinkModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: 360, borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Insert Link</div>
            <span className="chrome-label">URL</span>
            <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && insertLink()} placeholder="https://example.com" className="input-glass" style={{ marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLinkModal(false)} className="btn-glass" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={insertLink} className="btn-chrome" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13 }}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Image modal */}
      {showImageModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: 400, borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Insert Image</div>
            <span className="chrome-label">Image URL</span>
            <input autoFocus value={imageUrl} onChange={e => setImageUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && insertImage()} placeholder="https://example.com/image.jpg" className="input-glass" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginBottom: 14 }}>Paste a direct image URL. For uploads, host your image on Imgur or Cloudinary first.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowImageModal(false)} className="btn-glass" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={insertImage} className="btn-chrome" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13 }}>Insert</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function wrapInEmailTemplate(subject: string, fromName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${subject}</title>
<style>
  body { margin:0; padding:0; background:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .wrapper { max-width:600px; margin:32px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .header { background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%); padding:28px 36px; }
  .header-title { color:#ffffff; font-size:20px; font-weight:700; margin:0; letter-spacing:-0.02em; }
  .header-sub { color:rgba(255,255,255,0.5); font-size:12px; margin:4px 0 0; letter-spacing:0.06em; text-transform:uppercase; }
  .body { padding:36px; color:#1f2937; font-size:15px; line-height:1.7; }
  .body h1 { font-size:28px; font-weight:800; color:#111827; margin:0 0 16px; letter-spacing:-0.03em; }
  .body h2 { font-size:20px; font-weight:700; color:#111827; margin:0 0 12px; }
  .body p { margin:0 0 16px; }
  .body a { color:#4f46e5; }
  .body img { max-width:100%; border-radius:8px; }
  .body ul, .body ol { padding-left:20px; margin:0 0 16px; }
  .footer { background:#f9fafb; padding:20px 36px; border-top:1px solid #e5e7eb; text-align:center; }
  .footer p { margin:0; font-size:12px; color:#9ca3af; line-height:1.6; }
  .footer a { color:#6366f1; text-decoration:none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <p class="header-title">${fromName}</p>
    <p class="header-sub">Campaign Communication</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">
    <p>You received this email from <strong>${fromName}</strong>.<br/>
    <a href="#">Unsubscribe</a> · <a href="#">Privacy Policy</a></p>
  </div>
</div>
</body>
</html>`;
}
