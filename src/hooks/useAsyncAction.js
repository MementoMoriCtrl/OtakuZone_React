import { useEffect, useRef, useState } from 'react'

export default function useAsyncAction() {
  const [state, setState] = useState({ loading: false, error: '', success: '' })
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async (task, success = '') => {
    if (busy.current) return false
    busy.current = true
    setState({ loading: true, error: '', success: '' })
    try {
      await task()
      if (mounted.current) setState({ loading: false, error: '', success })
      return true
    } catch (error) {
      if (mounted.current) setState({ loading: false, error: error.message || 'No se pudo completar la solicitud.', success: '' })
      return false
    } finally { busy.current = false }
  }
  return { ...state, run, reset: () => { if (!busy.current) setState({ loading: false, error: '', success: '' }) } }
}
