import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../hooks/useAuth.tsx'
import { displayName } from '../../services/client.ts'

const layoutStyles = String.raw`
.app-shell {
  min-height: 100vh;
}
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 3;
  display: flex;
  width: 252px;
  flex-direction: column;
  padding: 27px 18px 20px;
  border-right: 1px solid var(--line);
  background: #fbfcfb;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 10px;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.brand small {
  display: block;
  margin-top: 3px;
  color: #98a39e;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.brand-mark {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  border-radius: 11px;
  background: var(--green);
  color: white;
  font-family: Georgia, serif;
  font-size: 21px;
  font-weight: 700;
}
.nav-caption {
  margin: 48px 10px 12px;
  color: #9aa69f;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.main-nav {
  display: grid;
  gap: 5px;
}
.nav-link {
  display: flex;
  min-height: 43px;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-radius: 9px;
  color: #697771;
  font-size: 13px;
  font-weight: 550;
  transition:
    background 0.18s,
    color 0.18s;
}
.nav-link:hover {
  background: #f0f5f2;
  color: var(--ink);
}
.nav-link.active {
  background: var(--green-soft);
  color: var(--green-dark);
  font-weight: 700;
}
.nav-symbol {
  width: 18px;
  color: #84918b;
  font-size: 16px;
  text-align: center;
}
.nav-link.active .nav-symbol {
  color: var(--green);
}
.sidebar-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 17px 5px 0;
  border-top: 1px solid var(--line);
}
.profile-avatar {
  display: grid;
  width: 35px;
  height: 35px;
  flex: none;
  place-items: center;
  border: 1px solid #dcebe3;
  border-radius: 50%;
  background: #eef7f2;
  color: var(--green-dark);
  font-size: 13px;
  font-weight: 750;
}
.profile-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.profile-copy strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-copy span {
  color: var(--muted);
  font-size: 11px;
}
.icon-button {
  display: grid;
  width: 31px;
  height: 31px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #718078;
  font-size: 17px;
}
.icon-button:hover {
  background: #f0f4f2;
  color: var(--ink);
}
.logout-button {
  margin-left: auto;
}
.main-area {
  min-height: 100vh;
  margin-left: 252px;
  padding: 44px clamp(24px, 4.2vw, 64px) 72px;
}
.page-container {
  width: min(100%, 1230px);
  margin: 0 auto;
}
.narrow-container {
  max-width: 850px;
}
.detail-container {
  max-width: 1180px;
}
@media (max-width: 1050px) { .sidebar { width:218px; }.main-area { margin-left:218px; padding-right:27px; padding-left:27px; } }
@media (max-width: 760px) { .sidebar { position:sticky; top:0; width:100%; height:auto; flex-direction:row; align-items:center; padding:10px 14px; border-right:0; border-bottom:1px solid var(--line); }.brand { padding:0; font-size:12px; }.brand-mark { width:31px; height:31px; }.brand small,.nav-caption,.sidebar-bottom .profile-copy,.sidebar-bottom .profile-avatar { display:none; }.main-nav { display:flex; gap:3px; margin-left:auto; }.nav-link { min-height:35px; gap:5px; padding:0 8px; font-size:10px; }.nav-symbol { width:auto; font-size:13px; }.sidebar-bottom { margin:0 0 0 5px; padding:0; border:0; }.logout-button { width:31px; height:31px; }.main-area { min-height:calc(100vh - 53px); margin-left:0; padding:28px 18px 50px; } }
@media (max-width: 480px) { .sidebar { flex-wrap:wrap; justify-content:space-between; }.main-nav { order:3; width:100%; justify-content:space-between; margin:8px 0 0; }.nav-link { flex:1; justify-content:center; }.sidebar-bottom { margin-left:auto; }.main-area { padding:23px 13px 40px; } }

`

const roleLabels = { admin: '管理员', agent: '处理人员', user: '普通用户' } as const

export const AppShell = () => {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (!session) return null

  const active = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`
  const handleLogout = async () => {
    await logout().catch(() => undefined)
    navigate('/login', { replace: true, state: { from: location.pathname } })
  }

  return (
    <div className="app-shell">
      <style>{layoutStyles}</style>
      <aside className="sidebar">
        <Link to="/tickets" className="brand">
          <span className="brand-mark">T</span>
          <span>
            Ticket Desk<small>服务工单工作台</small>
          </span>
        </Link>
        <div className="nav-caption">工作区</div>
        <nav aria-label="主导航" className="main-nav">
          <NavLink className={active} to="/tickets">
            <span className="nav-symbol">▤</span>工单
          </NavLink>
          <NavLink className={active} to="/categories">
            <span className="nav-symbol">◇</span>工单分类
          </NavLink>
          {session.user.role === 'admin' && (
            <NavLink className={active} to="/users">
              <span className="nav-symbol">♙</span>用户管理
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-avatar">
            {displayName(session.user).slice(0, 1).toUpperCase()}
          </div>
          <div className="profile-copy">
            <strong>{displayName(session.user)}</strong>
            <span>{roleLabels[session.user.role]}</span>
          </div>
          <button
            className="icon-button logout-button"
            aria-label="退出登录"
            title="退出登录"
            onClick={handleLogout}
            type="button"
          >
            ↗
          </button>
        </div>
      </aside>
      <main className="main-area">
        <Outlet />
      </main>
    </div>
  )
}
