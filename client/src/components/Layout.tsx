import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Users, Shield, LogOut, Zap, Send, Inbox, Filter, GitBranch, ClipboardList, TrendingUp, Target } from 'lucide-react';

const navItems = [
  { to: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/campaigns',   label: 'Campaigns',   icon: Megaphone },
  { to: '/contacts',    label: 'Contacts',    icon: Users },
  { to: '/segments',    label: 'Segments',    icon: Filter },
  { to: '/workflows',   label: 'Workflows',   icon: GitBranch },
  { to: '/forms',       label: 'Forms',       icon: ClipboardList },
  { to: '/attribution', label: 'Attribution', icon: TrendingUp },
  { to: '/ads',         label: 'Ads',         icon: Target },
  { to: '/messages',    label: 'Messages',    icon: Send },
  { to: '/inbox',       label: 'Inbox',       icon: Inbox },
  { to: '/mandates',    label: 'Mandates',    icon: Shield },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <div style={{ display:'flex', height:'100vh', background:'#06060f', overflow:'hidden', position:'relative' }}>
      {/* Aurora background */}
      <div className="aurora-bg" />

      {/* Sidebar */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1,
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
      }}>
        {/* Logo */}
        <div style={{
          padding: '24px 20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <Zap size={16} color="#fff" fill="rgba(255,255,255,0.9)" />
          </div>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:13, letterSpacing:'-0.02em' }}>AirPay</div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase' }}>Campaigns</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10,
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              transition: 'all 0.2s ease',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
              background: isActive
                ? 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)'
                : 'transparent',
              border: isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
              boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
            })}>
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding:'12px 10px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}
            style={{
              display:'flex', alignItems:'center', gap:10, width:'100%',
              padding:'9px 12px', borderRadius:10, fontSize:13, fontWeight:500,
              color:'rgba(255,255,255,0.3)', background:'transparent', border:'none', cursor:'pointer',
              transition:'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
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
