import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.js';
import { connect } from '../browser/chrome.js';
import { log } from '../core/logger.js';
import { pickBest, stripParens } from '../core/match.js';
import { FILES, readJson, writeJson, writeText } from '../core/store.js';
import type { MatchRecord, MigrationState, ScrapedPlaylist } from '../core/types.js';
import { createInnertube, type Innertube } from '../ytmusic/innertube.js';
import { addToPlaylist, createPlaylist, playlistUrl } from '../ytmusic/playlist.js';
import { search } from '../ytmusic/search.js';

/** 검색 → 매칭. 이미 처리한 곡은 건너뛴다. */
const matchAll = async (
    client: Innertube,
    playlist: ScrapedPlaylist,
    state: MigrationState,
): Promise<void> => {
    const { songs } = playlist;
    if (state.matches.length >= songs.length) return;

    log.step(`곡 검색 (${songs.length}곡 중 ${state.matches.length}곡 완료)`);

    for (let i = state.matches.length; i < songs.length; i++) {
        const song = songs[i];
        if (!song) continue;

        const record: MatchRecord = {
            index: i,
            melon: { title: song.title, artist: song.artist },
            match: null,
        };

        try {
            let best = pickBest(song, await search(client, `${song.artist} ${song.title}`));

            // 점수가 낮으면 괄호(피처링/부제)를 떼고 한 번 더
            if (!best || best.score < 0.85) {
                const altTitle = stripParens(song.title);
                if (altTitle && altTitle !== song.title) {
                    await sleep(config.searchDelayMs);
                    const retry = pickBest(
                        { title: altTitle, artist: song.artist },
                        await search(client, `${song.artist} ${altTitle}`),
                    );
                    if (retry && (!best || retry.score > best.score)) best = retry;
                }
            }

            record.match = best;
        } catch (e) {
            record.error = (e as Error).message;
            log.warn(`검색 실패 (${i + 1}. ${song.artist} - ${song.title}): ${record.error}`);
            await sleep(3000);
        }

        state.matches.push(record);

        if ((i + 1) % 25 === 0 || i === songs.length - 1) {
            writeJson(FILES.state, state);
            log.progress(i + 1, songs.length, `매칭 ${state.matches.filter(m => m.match).length}곡`);
        }

        await sleep(config.searchDelayMs);
    }

    writeJson(FILES.state, state);
};

/** 플레이리스트를 만들고 곡을 넣는다. 중단돼도 이어서 진행된다. */
const pushAll = async (client: Innertube, state: MigrationState): Promise<string[]> => {
    const videoIds = [...new Set(
        state.matches.filter(m => m.match).map(m => m.match!.videoId),
    )];

    if (!state.playlistId) {
        state.playlistId = await createPlaylist(
            client,
            state.playlistName,
            `멜론 플레이리스트 "${state.playlistName}"에서 옮김`,
        );
        state.addedCount = 0;
        writeJson(FILES.state, state);
        log.info(`  플레이리스트 생성: ${state.playlistId}`);
    }

    log.step(`곡 추가 (중복 제거 후 ${videoIds.length}곡)`);

    while (state.addedCount < videoIds.length) {
        const batch = videoIds.slice(state.addedCount, state.addedCount + config.addBatchSize);

        try {
            await addToPlaylist(client, state.playlistId, batch);
            state.addedCount += batch.length;
        } catch (e) {
            log.warn(`배치 실패, 곡별로 재시도합니다: ${(e as Error).message}`);
            for (const videoId of batch) {
                try {
                    await addToPlaylist(client, state.playlistId, [videoId]);
                } catch {
                    log.error(`추가 실패: ${videoId}`);
                }
                state.addedCount++;
                await sleep(400);
            }
        }

        writeJson(FILES.state, state);
        log.progress(state.addedCount, videoIds.length, '추가');
        await sleep(800);
    }

    return videoIds;
};

const writeReport = (state: MigrationState, total: number): void => {
    const notFound = state.matches.filter(m => !m.match);
    const lowScore = state.matches.filter(
        m => m.match && m.match.score < config.lowScoreThreshold,
    );
    const nonSong = state.matches.filter(
        m => m.match && m.match.type !== '노래' && m.match.type !== '동영상',
    );

    writeText(FILES.report, [
        '멜론 → 유튜브 뮤직 이전 결과',
        `플레이리스트: ${state.playlistName}`,
        `URL: ${state.playlistId ? playlistUrl(state.playlistId) : '-'}`,
        `생성 시각: ${new Date().toLocaleString('ko-KR')}`,
        '',
        `전체 ${total}곡 / 매칭 ${total - notFound.length}곡 / 실패 ${notFound.length}곡`,
        '',
        `=== 매칭 실패 (${notFound.length}곡) ===`,
        ...notFound.map(m => `${m.index + 1}\t${m.melon.artist} - ${m.melon.title}${m.error ? `\t(${m.error})` : ''}`),
        '',
        `=== 곡이 아닌 결과로 매칭됨 — 앨범/EP/싱글 (${nonSong.length}곡) ===`,
        ...nonSong.map(m => `${m.index + 1}\t[${m.match!.type}]\t${m.melon.artist} - ${m.melon.title}\t→ ${m.match!.artist} - ${m.match!.title}`),
        '',
        `=== 확인 권장 — 점수 ${config.lowScoreThreshold} 미만 (${lowScore.length}곡) ===`,
        ...lowScore.map(m => `${m.index + 1}\t[${m.match!.score.toFixed(2)}]\t${m.melon.artist} - ${m.melon.title}\t→ ${m.match!.artist} - ${m.match!.title}`),
    ].join('\n'));

    log.step('결과');
    log.info(`  매칭 실패        ${notFound.length}곡`);
    log.info(`  앨범/EP로 매칭   ${nonSong.length}곡`);
    log.info(`  확인 권장        ${lowScore.length}곡`);
    log.info(`  상세: ${FILES.report}`);
};

export const migrateCommand = async (): Promise<void> => {
    const playlist = readJson<ScrapedPlaylist | null>(FILES.playlist, null);
    if (!playlist) {
        throw new Error('수집된 플레이리스트가 없습니다. 먼저 `mtym scrape --playlist <번호>`를 실행하세요.');
    }

    const state = readJson<MigrationState>(FILES.state, {
        plylstSeq: playlist.plylstSeq,
        playlistName: playlist.name,
        matches: [],
        playlistId: null,
        addedCount: 0,
    });

    const session = await connect();
    const client = await createInnertube(session.context, session.page);

    await matchAll(client, playlist, state);
    const videoIds = await pushAll(client, state);
    writeReport(state, playlist.songs.length);

    await session.close();

    log.info(`\n완료: ${videoIds.length}곡`);
    log.info(state.playlistId ? playlistUrl(state.playlistId) : '');
};
