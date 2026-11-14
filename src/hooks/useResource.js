import { useCallback, useEffect, useState } from 'react'

export default function useResource(loader) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ loader: null, attempt: -1, data: null, error: null, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    loader({ signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ loader, attempt, data, error: null, loading: false }) },
      (error) => { if (!controller.signal.aborted) setState({ loader, attempt, data: null, error: error.message || 'Error inesperado al consultar el servicio.', loading: false }) },
    )
    return () => controller.abort()
  }, [loader, attempt])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const current = state.loader === loader && state.attempt === attempt ? state : { data: null, error: null, loading: true }
  return { ...current, retry }
}
