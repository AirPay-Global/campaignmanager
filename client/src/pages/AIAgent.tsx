import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Loader2, Wrench, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';

interface TextChunk { type: 'text'; text: string }
interface ToolUseChunk { type: 'tool_use'; name: string }
interface ToolResultChunk { type: 'tool_result'; name: string; result: unknown }
interface DoneChunk { type: 'done' }
interface ErrorChunk { type: 'error'; message: string }
type Chunk = TextChunk | ToolUseChunk | ToolResultChunk | DoneChunk | ErrorChunk;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; result?: unknown }[];
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

const CAPABILITIES = [
  'Show me dashboard stats',
  'List my active campaigns',
  'Find contacts named John',
  'List WhatsApp templates',
  'Schedule a LinkedIn post',
  'Create a new contact',
];

function ToolBadge({ name, result, done }: { name: string; result?: unknown; done: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: 'rgba(139,92,246,0.08)',
      border: '1px solid rgba(139,92,246,0.2)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 11,
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 4,
      marginTop: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: result ? 'pointer' : 'default' }}
        onClick={() => result && setOpen(o => !o)}>
        <Wrench size={11} color="rgba(139,92,246,0.8)" />
        <span style={{ color: 'rgba(139,92,246,0.9)', fontFamily: 'monospace' }}>{name}</span>
        {!done && <Loader2 size={10} color="rgba(139,92,246,0.6)" style={{ animation: 'spin 1s linear infinite' }} />}
        {done && !!result && (open ? <ChevronUp size={10} color="rgba(139,92,246,0.6)" /> : <ChevronDown size={10} color="rgba(139,92,246,0.6)" />)}
      </div>
      {open && !!result && (
        <pre style={{
          margin: 0,
          fontSize: 10,
          color: 'rgba(255,255,255,0.5)',
          maxHeight: 200,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: 4,
    }}>
      {/* tool calls shown above assistant text */}
      {!isUser && (msg.toolCalls ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: '80%' }}>
          {(msg.toolCalls ?? []).map((tc, i) => (
            <ToolBadge key={i} name={tc.name} result={tc.result} done={true} />
          ))}
        </div>
      )}
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
        background: isUser
          ? 'linear-gradient(135deg, rgba(139,92,246,0.4) 0%, rgba(79,70,229,0.4) 100%)'
          : 'rgba(255,255,255,0.06)',
        border: isUser
          ? '1px solid rgba(139,92,246,0.3)'
          : '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content || (msg.role === 'assistant' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : '')}
      </div>
    </div>
  );
}

export default function AIAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildHistory = (): HistoryEntry[] => {
    return messages.map(m => ({ role: m.role, content: m.content }));
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);

    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = { role: 'assistant', content: '', toolCalls: [] };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const history = buildHistory();

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/v1/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, history }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let chunk: Chunk;
          try { chunk = JSON.parse(raw); } catch { continue; }

          if (chunk.type === 'text') {
            setMessages(prev => {
              const copy = [...prev];
              const last = { ...copy[copy.length - 1] };
              last.content = (last.content ?? '') + chunk.text;
              copy[copy.length - 1] = last;
              return copy;
            });
          } else if (chunk.type === 'tool_use') {
            setMessages(prev => {
              const copy = [...prev];
              const last = { ...copy[copy.length - 1] };
              last.toolCalls = [...(last.toolCalls ?? []), { name: (chunk as ToolUseChunk).name }];
              copy[copy.length - 1] = last;
              return copy;
            });
          } else if (chunk.type === 'tool_result') {
            setMessages(prev => {
              const copy = [...prev];
              const last = { ...copy[copy.length - 1] };
              const tc = (chunk as ToolResultChunk);
              const calls = [...(last.toolCalls ?? [])];
              const idx = [...calls].reverse().findIndex(c => c.name === tc.name && c.result === undefined);
              if (idx !== -1) {
                const realIdx = calls.length - 1 - idx;
                calls[realIdx] = { ...calls[realIdx], result: tc.result };
              }
              last.toolCalls = calls;
              copy[copy.length - 1] = last;
              return copy;
            });
          } else if (chunk.type === 'error') {
            setMessages(prev => {
              const copy = [...prev];
              const last = { ...copy[copy.length - 1] };
              last.content = `Error: ${(chunk as ErrorChunk).message}`;
              copy[copy.length - 1] = last;
              return copy;
            });
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev];
        const last = { ...copy[copy.length - 1] };
        last.content = `Failed to connect to AI agent: ${(err as Error).message}`;
        copy[copy.length - 1] = last;
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0' }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{
          width: 40, height: 40,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(79,70,229,0.2) 100%)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={20} color="rgba(139,92,246,0.9)" />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>AI Agent</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            Ask anything — manage contacts, campaigns, templates & more
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 48 }}>
            <div style={{
              width: 64, height: 64,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(79,70,229,0.1) 100%)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={28} color="rgba(139,92,246,0.7)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                What can I help you with today?
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                I can query your contacts, campaigns, templates, social posts and more.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 500 }}>
              {CAPABILITIES.map(cap => (
                <button
                  key={cap}
                  onClick={() => sendMessage(cap)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.15)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                  }}
                >
                  {cap}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '16px 32px 24px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: '10px 12px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about your campaigns..."
            rows={1}
            disabled={loading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              resize: 'none',
              lineHeight: 1.5,
              maxHeight: 120,
              overflowY: 'auto',
              fontFamily: 'inherit',
            }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              width: 34, height: 34, flexShrink: 0,
              borderRadius: 10,
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, rgba(139,92,246,0.7) 0%, rgba(79,70,229,0.7) 100%)'
                : 'rgba(255,255,255,0.05)',
              border: '1px solid ' + (input.trim() && !loading ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'),
              color: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.2)',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
          </button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
          Press Enter to send · Shift+Enter for new line · Powered by Claude Haiku
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
