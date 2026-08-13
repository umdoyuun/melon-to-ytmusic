import type { Page } from 'playwright-core';
import { log } from '../core/logger.js';
import type { MelonPlaylist, MelonSong } from '../core/types.js';
import { MELON_ORIGIN, getMemberKey, gotoMelon } from './client.js';

const PAGE_SIZE = 50;

/** 마이뮤직 > 플레이리스트 목록 */
export const listPlaylists = async (page: Page): Promise<MelonPlaylist[]> => {
    await gotoMelon(page, '/');
    const memberKey = await getMemberKey(page);

    await gotoMelon(page, `/mymusic/playlist/mymusicplaylist_list.htm?memberKey=${memberKey}`);
    await page.waitForTimeout(1500);

    return page.evaluate(() => {
        const clean = (s: string | null | undefined): string =>
            (s ?? '').replace(/\s+/g, ' ').trim();

        return [...document.querySelectorAll('#pageList tbody tr')].map((tr) => {
            const link = tr.querySelector<HTMLAnchorElement>('dt a[href*="goPlaylistDetail"]');
            const href = link?.getAttribute('href') ?? '';
            // goPlaylistDetail('0','Y','N','558381546') 에서 마지막 인자가 plylstSeq
            const seq = href.match(/goPlaylistDetail\((?:[^)]*,)\s*'(\d+)'\s*\)/)?.[1] ?? '';
            const countText = clean(tr.querySelector('.fc_strong')?.textContent);
            const songCount = Number(countText.replace(/[^\d]/g, '')) || 0;

            return { seq, name: clean(link?.textContent), songCount };
        }).filter(p => p.seq);
    });
};

/** 플레이리스트 상세 페이지의 수록곡 총 개수 */
const readTotal = (page: Page): Promise<number> => page.evaluate(() => {
    const m = document.body.innerText.match(/수록곡\s*\((\d[\d,]*)\)/);
    return m?.[1] ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
});

/** 현재 보이는 페이지의 곡 목록 */
const parsePage = (page: Page): Promise<MelonSong[]> => page.evaluate(() => {
    const clean = (s: string | null | undefined): string =>
        (s ?? '').replace(/\s+/g, ' ').trim();

    return [...document.querySelectorAll('#frm table tbody tr, table tbody tr')]
        .map((tr) => {
            const checkbox = tr.querySelector<HTMLInputElement>('input.input_check');
            const titleEl = tr.querySelector('a.fc_gray');
            if (!titleEl) return null;

            const artists = [...tr.querySelectorAll('[id="artistName"] a, .wrapArtistName a')]
                .map(a => clean(a.textContent))
                .filter(Boolean);

            const leftCells = [...tr.querySelectorAll('td.t_left')];
            const albumEl = leftCells[2]?.querySelector('a');

            return {
                songId: checkbox?.value ?? '',
                title: clean(titleEl.textContent),
                artist: artists.join(', '),
                album: clean(albumEl?.textContent),
            };
        })
        .filter((s): s is MelonSong => s !== null);
});

/**
 * 플레이리스트의 모든 곡을 읽는다.
 *
 * 멜론은 50곡씩 끊어 보여주고, 페이지 이동은 전역 `pageObj.sendPage('<시작번호>')`로 한다.
 * 목록이 실제로 갱신됐는지는 마지막 곡의 songId 변화로 확인한다.
 */
export const scrapePlaylist = async (
    page: Page,
    plylstSeq: string,
): Promise<{ songs: MelonSong[]; total: number }> => {
    await gotoMelon(page, `/mymusic/playlist/mymusicplaylistview_inform.htm?plylstSeq=${plylstSeq}`);
    await page.waitForTimeout(1500);

    const total = await readTotal(page);
    if (total === 0) {
        throw new Error(`플레이리스트(${plylstSeq})에서 수록곡을 찾지 못했습니다.`);
    }

    const songs: MelonSong[] = [];
    const seen = new Set<string>();

    for (let start = 1; start <= total; start += PAGE_SIZE) {
        if (start > 1) {
            const previousLast = songs.at(-1)?.songId;
            await page.evaluate((s) => {
                (window as unknown as { pageObj: { sendPage(n: string): void } })
                    .pageObj.sendPage(String(s));
            }, start);

            for (let attempt = 0; attempt < 30; attempt++) {
                await page.waitForTimeout(400);
                const rows = await parsePage(page);
                if (rows.length > 0 && rows.at(-1)?.songId !== previousLast) break;
            }
        }

        const rows = await parsePage(page);
        if (rows.length === 0) break;

        for (const song of rows) {
            const key = song.songId || `${song.artist}|${song.title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            songs.push(song);
        }

        log.progress(Math.min(songs.length, total), total, '곡 수집');
    }

    return { songs, total };
};

export const playlistUrl = (plylstSeq: string): string =>
    `${MELON_ORIGIN}/mymusic/playlist/mymusicplaylistview_inform.htm?plylstSeq=${plylstSeq}`;
