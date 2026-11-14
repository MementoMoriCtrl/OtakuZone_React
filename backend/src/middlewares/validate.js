import HttpError from '../utils/HttpError.js'

export const validate = (schema, source) => (request, _response, next) => {
  const result = schema.safeParse(request[source])
  if (!result.success) return next(new HttpError(400, 'VALIDATION_ERROR', 'Los parámetros de la solicitud no son válidos.', result.error.issues.map((issue) => ({ field: [source, ...issue.path].join('.'), message: 'Parámetro no admitido o valor inválido.' }))))
  // req.query es un getter en Express 5; no se modifica.
  request.validated = { ...request.validated, [source]: result.data }
  next()
}
