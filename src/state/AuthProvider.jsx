import { useCallback, useEffect, useRef, useState } from 'react'
import AuthContext from './AuthContext.js'
import { loadSession, loginAccount, logoutAccount, registerAccount, updateAccount } from '../services/auth.js'

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, expiresAt: null, loading: true, error: '' })
  const generation = useRef(0)
  const pending = useRef(false)
  const refresh = useCallback(async () => {
    if (pending.current) return
    const current = generation.current
    try {
      const data = await loadSession()
      if (current === generation.current) setState({ user: data.user, expiresAt: data.expiresAt, loading: false, error: '' })
    } catch (error) { if (current === generation.current) setState((previous) => ({ ...previous, loading: false, error: error.message })) }
  }, [])
  useEffect(() => {
    let active = true
    const current = generation.current
    loadSession().then((data) => { if (active && current === generation.current) setState({ user: data.user, expiresAt: data.expiresAt, loading: false, error: '' }) }, (error) => { if (active && current === generation.current) setState({ user: null, expiresAt: null, loading: false, error: error.message }) })
    const expired = () => { generation.current++; setState({ user: null, expiresAt: null, loading: false, error: '' }) }
    window.addEventListener('otakuzone:session-expired', expired)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('otakuzone:session-expired', expired); window.removeEventListener('focus', refresh) }
  }, [refresh])
  useEffect(() => {
    if (!state.expiresAt) return
    const timer = setTimeout(refresh, Math.max(0, Date.parse(state.expiresAt) - Date.now()) + 100)
    return () => clearTimeout(timer)
  }, [state.expiresAt, refresh])
  const action = async (task, mode) => {
    if (pending.current) throw new Error('Espera a que termine la solicitud actual.')
    pending.current = true
    const current = ++generation.current
    try {
      const result = await task()
      if (current === generation.current) {
        if (mode === 'logout') setState({ user: null, expiresAt: null, loading: false, error: '' })
        else if (mode === 'profile') setState((previous) => ({ ...previous, user: result, error: '' }))
        else setState({ user: result.user, expiresAt: result.expiresAt, loading: false, error: '' })
      }
      return result
    } finally { pending.current = false }
  }
  return <AuthContext value={{ ...state, refresh, register: (values) => action(() => registerAccount(values), 'enter'), login: (values) => action(() => loginAccount(values), 'enter'), logout: () => action(logoutAccount, 'logout'), updateProfile: (values) => action(() => updateAccount(values), 'profile') }}>{children}</AuthContext>
}
