import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth.tsx'

const loginStyles = String.raw`
.brand { display:flex; align-items:center; gap:11px; padding:0 10px; font-size:14px; font-weight:750; letter-spacing:-.02em; }.brand small { display:block; margin-top:3px; color:#98a39e; font-size:11px; font-weight:500; letter-spacing:.02em; }.brand-mark { display:grid; width:35px; height:35px; place-items:center; border-radius:11px; background:var(--green); color:#fff; font-family:Georgia,serif; font-size:21px; font-weight:700; }
.login-layout {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(300px, 0.9fr) minmax(390px, 1.1fr);
  background: #fff;
}
.login-aside {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 35px clamp(30px, 6vw, 86px);
  overflow: hidden;
  background: #123c32;
  color: #fff;
}
.login-aside::after {
  position: absolute;
  right: -150px;
  bottom: 65px;
  width: 400px;
  height: 400px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 50%;
  box-shadow:
    0 0 0 55px rgb(255 255 255 / 3%),
    0 0 0 110px rgb(255 255 255 / 2%);
  content: '';
}
.brand-light {
  position: relative;
  z-index: 1;
  color: #fff;
}
.brand-light small {
  color: #a8c1b6;
}
.login-message {
  position: relative;
  z-index: 1;
  width: min(100%, 480px);
  margin: auto 0;
  padding: 70px 0;
}
.login-message .eyebrow {
  color: #9bcbb4;
}
.login-message h1 {
  margin: 19px 0 17px;
  font-size: clamp(34px, 4vw, 49px);
  font-weight: 600;
  letter-spacing: -0.06em;
  line-height: 1.3;
}
.login-message p {
  color: #bdd1c8;
  font-size: 13px;
  line-height: 1.8;
}
.login-aside-footer {
  position: relative;
  z-index: 1;
  color: #a1bcb0;
  font-size: 10px;
}
.login-main {
  display: grid;
  place-items: center;
  padding: 35px;
}
.login-card {
  width: min(100%, 390px);
}
.login-card h2 {
  margin: 8px 0;
  font-size: 27px;
  letter-spacing: -0.05em;
}
.login-card > .muted {
  margin: 0 0 30px;
  font-size: 12px;
}
.login-form {
  gap: 17px;
}
.login-form input {
  height: 43px;
}
.login-form .button {
  min-height: 44px;
  margin-top: 5px;
}
.login-footnote {
  margin-top: 19px;
  color: #a0aaa5;
  font-size: 10px;
  line-height: 1.6;
}
@media (max-width:760px) { .login-layout { grid-template-columns:1fr; }.login-aside { min-height:195px; padding:22px 25px; }.login-message { margin:28px 0 14px; padding:0; }.login-message h1 { margin:9px 0; font-size:27px; }.login-message p,.login-aside-footer { display:none; }.login-main { padding:42px 24px; } }

`

const validateLogin = (username: string, password: string) => {
  if (!/^[a-z0-9_-]{3,32}$/.test(username))
    return '用户名须为 3–32 位小写字母、数字、下划线或连字符。'
  if (password.length < 1 || password.length > 128) return '请输入密码，最多 128 位。'
  return ''
}

export const LoginPage = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const invalid = validateLogin(username, password)
      if (invalid) throw new Error(invalid)
      return login(username, password)
    },
    onSuccess: () => {
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/') && from !== '/login' ? from : '/tickets', { replace: true })
    },
    onError: (reason) =>
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试。'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    mutation.mutate()
  }

  return (
    <main className="login-layout">
      <style>{loginStyles}</style>
      <section className="login-aside">
        <Link to="/login" className="brand brand-light">
          <span className="brand-mark">T</span>
          <span>
            Ticket Desk<small>服务工单工作台</small>
          </span>
        </Link>
        <div className="login-message">
          <span className="eyebrow">SUPPORT OPERATIONS</span>
          <h1>
            每一条请求，
            <br />
            都有清晰的进展。
          </h1>
          <p>统一处理客户问题、协作记录与服务流程。</p>
        </div>
        <div className="login-aside-footer">安全登录 · 角色权限保护</div>
      </section>
      <section className="login-main">
        <div className="login-card">
          <div className="eyebrow">欢迎回来</div>
          <h2>登录工作台</h2>
          <p className="muted">使用管理员分配的账户继续工作。</p>
          <form className="form-stack login-form" onSubmit={submit}>
            <label>
              用户名
              <input
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={32}
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <div className="inline-alert" role="alert">
                {error}
              </div>
            )}
            <button
              className="button button-primary button-wide"
              disabled={mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? '正在登录…' : '登录'}
            </button>
          </form>
          <p className="login-footnote">登录信息仅用于身份验证，不会保存在浏览器持久存储中。</p>
        </div>
      </section>
    </main>
  )
}
