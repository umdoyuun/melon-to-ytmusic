import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const CHROME_CANDIDATES: Record<string, string[]> = {
    win32: [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    ],
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ],
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ],
};

/** 설치된 Chrome 실행 파일 경로를 찾는다. */
export const findChrome = (): string => {
    const override = process.env.MTYM_CHROME_PATH;
    if (override) {
        if (!existsSync(override)) {
            throw new Error(`MTYM_CHROME_PATH가 가리키는 파일이 없습니다: ${override}`);
        }
        return override;
    }

    const found = (CHROME_CANDIDATES[process.platform] ?? []).find(p => existsSync(p));
    if (!found) {
        throw new Error(
            'Chrome을 찾지 못했습니다. MTYM_CHROME_PATH 환경변수로 직접 지정해주세요.',
        );
    }
    return found;
};

/**
 * 결과물 디렉터리.
 *
 * 플러그인으로 설치해서 쓰면 코드가 관리되는 캐시 위치에 놓이기 때문에,
 * 결과물을 그 안에 두면 플러그인 업데이트 때 날아갈 수 있다.
 * 그래서 `--data-dir`로 바깥을 가리킬 수 있게 해뒀다.
 */
let dataDir = resolve(process.env.MTYM_DATA_DIR ?? 'data');

export const setDataDir = (dir: string): void => { dataDir = resolve(dir); };
export const getDataDir = (): string => dataDir;

export const config = {
    /**
     * 로그인 세션을 담아둘 Chrome 전용 프로필.
     * 평소 쓰는 프로필과 분리해서, 자동화가 개인 브라우저를 건드리지 않게 한다.
     */
    profileDir: resolve(
        process.env.MTYM_CHROME_PROFILE ?? `${homedir()}/.melon-to-ytmusic/chrome-profile`,
    ),

    /** CDP 디버깅 포트 */
    debugPort: Number(process.env.MTYM_DEBUG_PORT ?? 9222),

    /** 검색 간 대기 (레이트리밋 회피) */
    searchDelayMs: Number(process.env.MTYM_SEARCH_DELAY_MS ?? 250),

    /** 플레이리스트에 한 번에 넣을 곡 수 */
    addBatchSize: Number(process.env.MTYM_ADD_BATCH ?? 50),

    /** 이 점수 미만은 리포트에 '확인 필요'로 표시 */
    lowScoreThreshold: Number(process.env.MTYM_LOW_SCORE ?? 0.75),
} as const;

export const dataPath = (name: string): string => resolve(getDataDir(), name);
