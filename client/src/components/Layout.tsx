import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Users, Shield, LogOut, Zap, Send, Inbox, Filter, GitBranch, ClipboardList, TrendingUp, Target, Share2, FileText, Bot, Sun, Moon, MessageCircle, ChevronDown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useBusinessAccount } from '../contexts/BusinessAccountContext';

const navItems = [
  { to: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/campaigns',   label: 'Campaigns',   icon: Megaphone },
  { to: '/contacts',    label: 'Contacts',    icon: Users },
  { to: '/segments',    label: 'Segments',    icon: Filter },
  { to: '/workflows',   label: 'Workflows',   icon: GitBranch },
  { to: '/forms',       label: 'Forms',       icon: ClipboardList },
  { to: '/templates',   label: 'Templates',   icon: FileText },
  { to: '/whatsapp',    label: 'WhatsApp',    icon: MessageCircle },
  { to: '/attribution', label: 'Attribution', icon: TrendingUp },
  { to: '/ads',         label: 'Ads',         icon: Target },
  { to: '/social',      label: 'Social',      icon: Share2 },
  { to: '/messages',    label: 'Messages',    icon: Send },
  { to: '/inbox',       label: 'Inbox',       icon: Inbox },
  { to: '/mandates',    label: 'Mandates',    icon: Shield },
  { to: '/agent',       label: 'AI Agent',    icon: Bot },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  const { accounts, selectedId, setSelectedId } = useBusinessAccount();

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--color-base)', overflow:'hidden', position:'relative', transition:'background 0.25s ease' }}>
      {/* Aurora background */}
      <div className="aurora-bg" />

      {/* Sidebar */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--color-surface)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1,
        boxShadow: 'inset -1px 0 0 var(--color-border-faint)',
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}>
        {/* Logo */}
        <div style={{
          padding: '24px 20px 16px',
          borderBottom: accounts.length > 0 ? 'none' : '1px solid var(--color-border-faint)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%)',
            border: '1px solid var(--color-border-medium)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px var(--color-shadow-sm)',
          }}>
            <Zap size={16} color={isDark ? '#fff' : '#6366f1'} fill={isDark ? 'rgba(255,255,255,0.9)' : 'rgba(99,102,241,0.9)'} />
          </div>
          <div>
            <div style={{ color:'var(--color-text)', fontWeight:700, fontSize:13, letterSpacing:'-0.02em' }}>AirPay</div>
            <div style={{ color:'var(--color-text-dim)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase' }}>Campaigns</div>
          </div>
        </div>

        {/* Business account switcher */}
        {accounts.length > 0 && (
          <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid var(--color-border-faint)' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: 5, paddingLeft: 2 }}>Business</div>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedId ?? ''}
                onChange={e => setSelectedId(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '7px 28px 7px 10px',
                  borderRadius: 8,
                  background: 'var(--color-nav-active-bg)',
                  border: '1px solid var(--color-nav-active-border)',
                  color: 'var(--color-text)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  outline: 'none',
                  boxShadow: 'var(--color-nav-active-shadow)',
                }}
              >
                {accounts.length > 1 && <option value="">All businesses</option>}
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--color-text-dim)' }} />
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10,
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              transition: 'all 0.2s ease',
              color: isActive ? 'var(--color-text)' : 'var(--color-nav-inactive)',
              background: isActive ? 'var(--color-nav-active-bg)' : 'transparent',
              border: isActive ? '1px solid var(--color-nav-active-border)' : '1px solid transparent',
              boxShadow: isActive ? 'var(--color-nav-active-shadow)' : 'none',
            })}>
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom controls: theme toggle + logout */}
        <div style={{ padding:'12px 10px', borderTop:'1px solid var(--color-border-faint)', display:'flex', flexDirection:'column', gap:2 }}>
          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              display:'flex', alignItems:'center', gap:10, width:'100%',
              padding:'9px 12px', borderRadius:10, fontSize:13, fontWeight:500,
              color:'var(--color-text-dim)', background:'transparent', border:'none', cursor:'pointer',
              transition:'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>

          {/* Logout */}
          <button
            onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}
            style={{
              display:'flex', alignItems:'center', gap:10, width:'100%',
              padding:'9px 12px', borderRadius:10, fontSize:13, fontWeight:500,
              color:'var(--color-text-dim)', background:'transparent', border:'none', cursor:'pointer',
              transition:'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, overflowY:'auto', position:'relative', zIndex:1 }}>
        {children}
      </main>
    </div>
  );
}
