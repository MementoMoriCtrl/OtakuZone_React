export function success(response, data, meta) {
  return response.status(200).json({ success: true, data, ...(meta ? { meta } : {}) })
}

export function failure(response, status, code, message, details) {
  return response.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } })
}
