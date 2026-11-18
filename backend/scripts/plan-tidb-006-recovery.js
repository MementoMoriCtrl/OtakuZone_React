import { readFile } from 'node:fs/promises'
import { planTidb006Recovery } from '../src/db/tidb006RecoveryPlan.js'

// Deliberately no loadEnvironment, connection factory or execute mode.
try {
  if (process.argv.length !== 4 || process.argv[2] !== '--snapshot') throw new Error('Uso local: node backend/scripts/plan-tidb-006-recovery.js --snapshot <archivo.json>')
  const snapshot = JSON.parse((await readFile(process.argv[3], 'utf8')).replace(/^\uFEFF/, ''))
  const plan = await planTidb006Recovery(snapshot)
  console.log(JSON.stringify(plan, null, 2))
} catch {
  // Never print untrusted snapshot contents or arbitrary read/parse errors.
  console.error('Plan 006 no generado. Revisar formato, metadatos completos, conflictos y ledger; no ejecutar recuperación.')
  process.exitCode = 1
}
