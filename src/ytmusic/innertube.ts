import { createHash } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright-core';

export const YTM_ORIGIN = 'https://music.youtube.com';

interface YtCfg {
    context: unknown;
    clientVersion: string;
    visitorData: string;
    loggedIn: boolean;
    sessionIndex: number;
    delegatedSessionId?: string;
}

export interface Innertube {
    call<T = unknown>(endpoint: string, payload: Record<string, unknown>): Promise<T>;
    clientVersion: string;
}

/**
 * 구글 인증 헤더.
 *
 * 유튜브 내부 API는 `SAPISIDHASH <초단위시각>_<sha1(시각 + " " + SAPISID + " " + origin)>`
 * 형태의 Authorization 헤더를 요구한다. SAPISID는 HttpOnly 쿠키라 document.cookie로는
 * 읽을 수 없지만, CDP(브라우저 컨텍스트)로는 읽을 수 있다.
 */
const makeAuthHeader = (sapisid: string) => (): string => {
    const ts = Math.floor(Date.now() / 1000);
    const hash = createHash('sha1').update(`${ts} ${sapisid} ${YTM_ORIGIN}`).digest('hex');
    return `SAPISIDHASH ${ts}_${hash}`;
};

/**
 * 로그인된 브라우저 세션에서 innertube 클라이언트를 만든다.
 * 로그인 자체는 사람이 브라우저에서 직접 한다.
 */
export const createInnertube = async (
    context: BrowserContext,
    page: Page,
): Promise<Innertube> => {
    await page.goto(YTM_ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const cfg = await page.evaluate((): YtCfg | { error: string } => {
        const data = (window as unknown as { ytcfg?: { data_?: Record<string, unknown> } }).ytcfg?.data_;
        if (!data) return { error: 'ytcfg를 찾지 못했습니다.' };
        return {
            context: data['INNERTUBE_CONTEXT'],
            clientVersion: String(data['INNERTUBE_CLIENT_VERSION'] ?? ''),
            visitorData: String(data['VISITOR_DATA'] ?? ''),
            loggedIn: Boolean(data['LOGGED_IN']),
            sessionIndex: Number(data['SESSION_INDEX'] ?? 0),
            delegatedSessionId: data['DELEGATED_SESSION_ID'] as string | undefined,
        };
    });

    if ('error' in cfg) throw new Error(`유튜브 뮤직 설정을 읽지 못했습니다: ${cfg.error}`);
    if (!cfg.loggedIn) {
        throw new Error('유튜브 뮤직에 로그인되어 있지 않습니다. `mtym login`으로 먼저 로그인해주세요.');
    }

    const cookies = await context.cookies(YTM_ORIGIN);
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const sapisid = cookies.find(c => c.name === 'SAPISID')
        ?? cookies.find(c => c.name === '__Secure-3PAPISID')
        ?? cookies.find(c => c.name === '__Secure-1PAPISID');

    if (!sapisid) {
        throw new Error('SAPISID 쿠키를 찾지 못했습니다. 유튜브 뮤직 로그인 상태를 확인해주세요.');
    }

    const authHeader = makeAuthHeader(sapisid.value);

    const call = async <T>(endpoint: string, payload: Record<string, unknown>): Promise<T> => {
        const res = await fetch(`${YTM_ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: cookieHeader,
                Authorization: authHeader(),
                Origin: YTM_ORIGIN,
                'X-Origin': YTM_ORIGIN,
                'X-Goog-AuthUser': String(cfg.sessionIndex),
                'X-Goog-Visitor-Id': cfg.visitorData,
                'X-YouTube-Client-Name': '67',
                'X-YouTube-Client-Version': cfg.clientVersion,
                ...(cfg.delegatedSessionId ? { 'X-Goog-PageId': cfg.delegatedSessionId } : {}),
            },
            body: JSON.stringify({ context: cfg.context, ...payload }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`${endpoint} 실패 (HTTP ${res.status}): ${body.slice(0, 300)}`);
        }
        return await res.json() as T;
    };

    return { call, clientVersion: cfg.clientVersion };
};

/** 응답 트리에서 특정 키를 가진 값을 전부 모은다. */
export const findAll = (node: unknown, key: string, acc: unknown[] = []): unknown[] => {
    if (!node || typeof node !== 'object') return acc;

    if (Array.isArray(node)) {
        for (const child of node) findAll(child, key, acc);
        return acc;
    }

    for (const [k, v] of Object.entries(node)) {
        if (k === key) acc.push(v);
        findAll(v, key, acc);
    }
    return acc;
};

/** { runs: [...] } 또는 { simpleText } 형태의 텍스트 노드를 문자열로 */
export const runsText = (node: unknown): string => {
    if (!node || typeof node !== 'object') return '';
    const obj = node as { runs?: Array<{ text?: string }>; simpleText?: string };
    if (obj.runs) return obj.runs.map(r => r.text ?? '').join('');
    return obj.simpleText ?? '';
};
