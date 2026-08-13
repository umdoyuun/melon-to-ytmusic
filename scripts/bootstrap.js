#!/usr/bin/env node
/**
 * 처음 쓸 때 의존성 설치와 빌드를 한 번에 끝냅니다.
 *
 * 플러그인으로 설치하면 파일만 놓이고 npm install 은 돌지 않기 때문에,
 * 스킬이 첫 실행에서 이걸 호출합니다. 이미 준비돼 있으면 아무것도 하지 않습니다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (args) => {
    console.log(`  > npm ${args.join(' ')}`);
    execFileSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
};

const force = process.argv.includes('--force');

if (force || !existsSync(join(root, 'node_modules'))) {
    console.log('의존성을 설치합니다.');
    run(['install', '--no-fund', '--no-audit']);
} else {
    console.log('의존성 준비됨.');
}

if (force || !existsSync(join(root, 'dist', 'cli.js'))) {
    console.log('빌드합니다.');
    run(['run', 'build']);
} else {
    console.log('빌드 준비됨.');
}

console.log(`\n준비 완료.\n  루트: ${root}\n  실행: node ${join(root, 'dist', 'cli.js')} login`);
