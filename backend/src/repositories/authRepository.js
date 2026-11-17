import { authSql } from '../db/authSql.js'
import { executeRows } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { normalizeEmail } from '../validators/email.js'

export function createAuthRepository(pool) {
  return {
    async findByEmail(email) { return (await executeRows(pool, authSql.byEmail, [normalizeEmail(email)]))[0] ?? null },
    async registerWithSession(input, session) {
      const email = normalizeEmail(input.email)
      return withTransaction(pool, async (connection) => {
        const roles = await executeRows(connection, authSql.clientRole, ['cliente'])
        if (!roles.length) throw new Error('Falta el rol de registro')
        const result = await executeRows(connection, authSql.register, [roles[0].id, input.name, email, input.passwordHash])
        const id = String(result.insertId)
        await executeRows(connection, authSql.insertSession, [session.id, id, session.expiresAt])
        return (await executeRows(connection, authSql.byId, [id]))[0]
      })
    },
    async startSession(userId, session) {
      await withTransaction(pool, (connection) => executeRows(connection, authSql.insertSession, [session.id, userId, session.expiresAt]))
    },
    async findSession(id, userId) { return (await executeRows(pool, authSql.session, [id, userId]))[0] ?? null },
    async revokeSession(id, userId) { await executeRows(pool, authSql.revoke, [id, userId]) },
    async updateProfile(userId, input) {
      return withTransaction(pool, async (connection) => {
        await executeRows(connection, authSql.profile, [input.name, input.bio, userId, 'activo'])
        return (await executeRows(connection, authSql.byId, [userId]))[0] ?? null
      })
    },
    async overview() { const rows = await executeRows(pool, authSql.overview); return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)])) },
  }
}
