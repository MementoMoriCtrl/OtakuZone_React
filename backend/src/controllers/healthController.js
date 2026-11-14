import { success } from '../utils/responses.js'

export function health(_request, response) {
  return success(response, { status: 'ok', service: 'otakuzone-api', version: 'v1' })
}
