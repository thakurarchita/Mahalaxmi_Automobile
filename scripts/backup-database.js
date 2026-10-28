import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourcePath = path.resolve(
  process.env.DATABASE_PATH || path.join(projectRoot, 'data', 'mahalaxmi-automobiles.sqlite'),
)
const backupPath = path.resolve(
  process.argv[2] || path.join(projectRoot, 'data', 'railway-import.sqlite'),
)

if (sourcePath === backupPath) {
  throw new Error('The backup destination must be different from the source database.')
}
if (fs.existsSync(backupPath)) {
  throw new Error(`Backup destination already exists: ${backupPath}`)
}

const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
try {
  await source.backup(backupPath)
} finally {
  source.close()
}

const backup = new Database(backupPath, { readonly: true, fileMustExist: true })
try {
  const integrity = backup.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') {
    throw new Error(`Database backup failed its integrity check: ${integrity}`)
  }
} finally {
  backup.close()
}

console.log(`Verified SQLite backup created at ${backupPath}`)
