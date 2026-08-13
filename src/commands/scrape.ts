import { connect } from '../browser/chrome.js';
import { log } from '../core/logger.js';
import { FILES, readJson, writeJson, writeText } from '../core/store.js';
import type { MelonSongDetail, ScrapedPlaylist } from '../core/types.js';
import { autoDismissDialogs } from '../melon/client.js';
import { scrapeGenres } from '../melon/genre.js';
import { listPlaylists, scrapePlaylist } from '../melon/playlist.js';

/** 마이뮤직의 플레이리스트 목록을 보여준다. */
export const playlistsCommand = async (): Promise<void> => {
    const session = await connect();
    autoDismissDialogs(session.page);

    const playlists = await listPlaylists(session.page);
    await session.close();

    if (playlists.length === 0) {
        log.warn('플레이리스트를 찾지 못했습니다. `mtym login`으로 로그인 상태를 확인해보세요.');
        return;
    }

    log.step(`플레이리스트 ${playlists.length}개`);
    for (const p of playlists) {
        log.info(`  ${p.seq.padEnd(12)} ${String(p.songCount).padStart(5)}곡  ${p.name}`);
    }
    log.info('\n옮기려면: mtym scrape --playlist <번호>');
};

export interface ScrapeOptions {
    playlist: string;
    genres: boolean;
}

/** 플레이리스트의 곡 목록(+선택적으로 장르)을 수집한다. */
export const scrapeCommand = async (options: ScrapeOptions): Promise<void> => {
    const session = await connect();
    autoDismissDialogs(session.page);

    const playlists = await listPlaylists(session.page);
    const target = playlists.find(p => p.seq === options.playlist);
    const name = target?.name ?? options.playlist;

    log.step(`"${name}" 수집`);
    const { songs, total } = await scrapePlaylist(session.page, options.playlist);

    const scraped: ScrapedPlaylist = {
        name,
        plylstSeq: options.playlist,
        total,
        scrapedAt: new Date().toISOString(),
        songs,
    };
    writeJson(FILES.playlist, scraped);
    writeText(
        'melon-playlist.tsv',
        ['번호\t아티스트\t곡명\t앨범',
            ...songs.map((s, i) => `${i + 1}\t${s.artist}\t${s.title}\t${s.album}`)].join('\n'),
    );
    log.info(`  ${songs.length}/${total}곡 저장`);

    if (options.genres) {
        log.step('곡별 장르 수집');
        const known = readJson<Record<string, MelonSongDetail>>(FILES.genres, {});
        const genres = await scrapeGenres(
            session.page,
            songs.map(s => s.songId),
            known,
            collected => writeJson(FILES.genres, collected),
        );
        writeJson(FILES.genres, genres);
        log.info(`  ${Object.keys(genres).length}곡 장르 저장`);
    }

    await session.close();
    log.info('\n다음: mtym migrate');
};
