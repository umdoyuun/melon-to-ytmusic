import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { config, findChrome } from '../config.js';
import { log } from '../core/logger.js';

const cdpUrl = (): string => `http://127.0.0.1:${config.debugPort}`;

const isPortAlive = async (): Promise<boolean> => {
    try {
        const res = await fetch(`${cdpUrl()}/json/version`, {
            signal: AbortSignal.timeout(1000),
        });
        return res.ok;
    } catch {
        return false;
    }
};

/**
 * 전용 프로필로 Chrome을 띄운다.
 *
 * 평소 쓰는 프로필과 분리하는 이유:
 * 1) 이미 실행 중인 Chrome은 --remote-debugging-port 를 나중에 열 수 없다.
 * 2) 자동화가 개인 브라우저 세션을 건드리지 않게 한다.
 */
const launch = async (): Promise<void> => {
    if (await isPortAlive()) {
        log.info(`이미 열려있는 Chrome(포트 ${config.debugPort})에 연결합니다.`);
        return;
    }

    const chromePath = findChrome();
    mkdirSync(config.profileDir, { recursive: true });
    log.info('전용 프로필로 Chrome을 실행합니다.');

    spawn(chromePath, [
        `--remote-debugging-port=${config.debugPort}`,
        `--user-data-dir=${config.profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
    ], { detached: true, stdio: 'ignore' }).unref();

    for (let i = 0; i < 30; i++) {
        await sleep(1000);
        if (await isPortAlive()) return;
    }

    throw new Error(
        `Chrome 디버깅 포트(${config.debugPort})가 열리지 않았습니다. ` +
        '기존 Chrome 창을 모두 닫고 다시 시도해보세요.',
    );
};

export interface BrowserSession {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    close(): Promise<void>;
}

/**
 * 사용자가 직접 로그인한 Chrome에 CDP로 붙는다.
 *
 * 아이디/비밀번호를 프로그램이 다루지 않는 것이 핵심이다.
 * 구글은 자동화된 로그인을 차단하고 2단계 인증도 요구하므로,
 * 로그인은 사람이 하고 프로그램은 그 세션만 빌려 쓴다.
 */
export const connect = async (): Promise<BrowserSession> => {
    await launch();

    const browser = await chromium.connectOverCDP(cdpUrl());
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome 컨텍스트를 찾지 못했습니다.');

    const page = context.pages()[0] ?? await context.newPage();

    /*
     * page.evaluate 로 보내는 함수는 트랜스파일된 형태로 브라우저에서 실행된다.
     * esbuild(tsx)는 keepNames 옵션 때문에 이름 있는 함수에 `__name(...)` 헬퍼를 붙이는데,
     * 그 헬퍼는 번들에만 있고 브라우저 컨텍스트에는 없어서 "__name is not defined"로 죽는다.
     * (tsc 로 빌드해 실행하면 나지 않지만, 개발 중 tsx 실행에서 매번 걸린다.)
     * 문자열로 주입해야 이 스크립트 자신은 트랜스파일되지 않는다.
     */
    const nameShim = 'globalThis.__name = globalThis.__name || ((fn) => fn);';
    await context.addInitScript({ content: nameShim });
    await page.evaluate(nameShim).catch(() => undefined);

    return {
        browser,
        context,
        page,
        // 브라우저 자체는 닫지 않는다 — 로그인 세션을 유지해야 다음 명령이 바로 동작한다.
        close: async () => { await browser.close(); },
    };
};
