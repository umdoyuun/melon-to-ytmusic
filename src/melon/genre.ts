import type { Page } from 'playwright-core';
import { log } from '../core/logger.js';
import type { MelonSongDetail } from '../core/types.js';
import { MELON_ORIGIN, gotoMelon } from './client.js';

/** 곡 상세를 한 번에 몇 건씩 받아올지 */
const BATCH = 8;

/**
 * 곡 상세 페이지에서 장르를 읽는다.
 *
 * 페이지를 실제로 이동하는 대신 브라우저 컨텍스트 안에서 fetch 하기 때문에
 * (쿠키가 그대로 실리고 동일 출처라 CORS 문제도 없다) 수백 곡도 몇 분이면 끝난다.
 */
const fetchDetails = (
    page: Page,
    songIds: string[],
): Promise<Array<{ songId: string; detail: MelonSongDetail | null }>> => page.evaluate(
    async ({ ids, origin }) => {
        const clean = (s: string | null | undefined): string =>
            (s ?? '').replace(/\s+/g, ' ').trim();

        return Promise.all(ids.map(async (songId) => {
            try {
                const res = await fetch(`${origin}/song/detail.htm?songId=${songId}`, {
                    credentials: 'include',
                });
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

                const meta = doc.querySelector('.meta .list') ?? doc.querySelector('dl.list');
                const labels = [...(meta?.querySelectorAll('dt') ?? [])].map(e => clean(e.textContent));
                const values = [...(meta?.querySelectorAll('dd') ?? [])].map(e => clean(e.textContent));
                const pick = (label: string): string => {
                    const i = labels.indexOf(label);
                    return i >= 0 ? (values[i] ?? '') : '';
                };

                return {
                    songId,
                    detail: {
                        genre: pick('장르'),
                        releaseDate: pick('발매일'),
                        album: pick('앨범'),
                    },
                };
            } catch {
                return { songId, detail: null };
            }
        }));
    },
    { ids: songIds, origin: MELON_ORIGIN },
);

/**
 * 여러 곡의 장르를 모은다. 이미 알고 있는 곡은 건너뛴다.
 * @param known 이미 수집된 songId -> 상세
 */
export const scrapeGenres = async (
    page: Page,
    songIds: string[],
    known: Record<string, MelonSongDetail> = {},
    onProgress?: (collected: Record<string, MelonSongDetail>) => void,
): Promise<Record<string, MelonSongDetail>> => {
    const collected: Record<string, MelonSongDetail> = { ...known };
    const todo = songIds.filter(id => id && !collected[id]);

    if (todo.length === 0) return collected;

    await gotoMelon(page, '/');

    for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);

        try {
            for (const { songId, detail } of await fetchDetails(page, batch)) {
                if (detail) collected[songId] = detail;
            }
        } catch (e) {
            log.warn(`장르 수집 배치 실패: ${(e as Error).message}`);
            await page.waitForTimeout(2000);
        }

        log.progress(Math.min(i + BATCH, todo.length), todo.length, '장르 수집');
        if ((i / BATCH) % 10 === 0) onProgress?.(collected);
        await page.waitForTimeout(200);
    }

    onProgress?.(collected);
    return collected;
};
