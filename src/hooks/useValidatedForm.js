import { useState } from 'react'

export default function useValidatedForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const errors = validate(values)
  const field = (name) => ({
    name, value: values[name], error: touched[name] || submitted ? errors[name] : '',
    onChange: (event) => { const value = event.target.value; setValues((previous) => ({ ...previous, [name]: value })) },
    onBlur: () => setTouched((previous) => ({ ...previous, [name]: true })),
  })
  const submit = (event, onValid) => {
    event.preventDefault()
    setSubmitted(true)
    const first = Object.keys(errors)[0]
    if (first) { event.currentTarget.elements.namedItem(first)?.focus(); return }
    onValid(values)
  }
  const reset = (nextValues) => { setValues(nextValues); setTouched({}); setSubmitted(false) }
  return { values, field, submit, reset }
}
