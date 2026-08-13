#!/usr/bin/env node
/**
 * skills/ 아래 스킬을 ~/.claude/skills/ 로 복사합니다.
 *
 * 레포를 클론해서 쓰는 경우, 스킬은 ~/.claude/skills/ 나 프로젝트의 .claude/skills/ 에
 * 있어야 인식됩니다. 반면 플러그인 규약은 <플러그인>/skills/ 라서 경로가 다릅니다.
 * 레포에는 skills/ 하나만 두고, 클론해서 쓸 때 이 스크립트로 복사합니다.
 *
 *   node scripts/install-skill.js            # ~/.claude/skills 로
 *   node scripts/install-skill.js --project  # ./.claude/skills 로
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'skills');

if (!existsSync(source)) {
    console.error(`skills 디렉터리가 없습니다: ${source}`);
    process.exit(1);
}

const toProject = process.argv.includes('--project');
const target = toProject
    ? resolve(process.cwd(), '.claude', 'skills')
    : join(homedir(), '.claude', 'skills');

mkdirSync(target, { recursive: true });

const names = readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

if (names.length === 0) {
    console.error('설치할 스킬이 없습니다.');
    process.exit(1);
}

for (const name of names) {
    const destination = join(target, name);
    // 예전 파일이 남지 않도록 지우고 새로 복사한다
    rmSync(destination, { recursive: true, force: true });
    cpSync(join(source, name), destination, { recursive: true });
    console.log(`설치: ${destination}`);
}

console.log(`\n스킬 ${names.length}개를 설치했습니다.`);
console.log('Claude Code를 다시 시작하면 잡힙니다.');
console.log(`레포를 업데이트한 뒤에는 다시 실행하세요: npm run skill:install${toProject ? ' -- --project' : ''}`);
