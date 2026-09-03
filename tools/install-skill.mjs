import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from './lib/workspace.mjs'

const source = path.join(repoRoot, 'skills', 'course-tutor')
const skillsRoot = path.join(repoRoot, '.agents', 'skills')
const destination = path.join(skillsRoot, 'course-tutor')

try {
  fs.mkdirSync(skillsRoot, { recursive: true })
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, { recursive: true })
  console.log(`Installed course-tutor at ${destination}`)
  console.log('Restart Codex if the skill does not appear immediately.')
} catch (error) {
  console.error(`Could not install the skill into .agents: ${error.message}`)
  console.error('This environment may manage .agents as read-only. The AGENTS.md fallback will load skills/course-tutor/SKILL.md.')
  process.exitCode = 1
}

