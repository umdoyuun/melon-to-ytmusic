import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.js';
import { connect } from '../browser/chrome.js';
import { log } from '../core/logger.js';
import { classifyMood, isPop, parseGenres } from '../core/mood.js';
import { FILES, readJson, writeJson, writeText } from '../core/store.js';
import type {
    MelonSongDetail,
    MigrationState,
    MoodBuckets,
    ScrapedPlaylist,
} from '../core/types.js';
import { createInnertube } from '../ytmusic/innertube.js';
import { addToPlaylist, createPlaylist, deletePlaylist, playlistUrl } from '../ytmusic/playlist.js';

const DEFINITIONS = [
    { key: 'pop', name: '팝송', description: '멜론 장르가 POP인 곡' },
    { key: 'drive', name: '드라이브', description: '신나는 곡' },
    { key: 'calm', name: '잔잔', description: '잔잔한 곡' },
] as const;

type MoodPlaylistState = Record<string, { playlistId: string; added: number }>;

/** 곡을 세 갈래로 나눈다. 드라이브/잔잔은 겹칠 수 있다. */
export const classifyCommand = (): MoodBuckets => {
    const playlist = readJson<ScrapedPlaylist | null>(FILES.playlist, null);
    const state = readJson<MigrationState | null>(FILES.state, null);
    const genres = readJson<Record<string, MelonSongDetail>>(FILES.genres, {});

    if (!playlist) throw new Error('먼저 `mtym scrape --playlist <번호>`를 실행하세요.');
    if (!state) throw new Error('먼저 `mtym migrate`를 실행하세요.');
    if (Object.keys(genres).length === 0) {
        throw new Error('장르 정보가 없습니다. `mtym scrape --playlist <번호> --genres`로 다시 수집하세요.');
    }

    const videoIdByIndex = new Map<number, string>();
    for (const m of state.matches) {
        if (m.match) videoIdByIndex.set(m.index, m.match.videoId);
    }

    const buckets: MoodBuckets = { pop: [], drive: [], calm: [] };
    const rows: string[] = [];
    const reasons = new Map<string, number>();

    playlist.songs.forEach((song, i) => {
        const videoId = videoIdByIndex.get(i);
        if (!videoId) return;   // 유튜브에서 못 찾은 곡은 제외

        const tags = parseGenres(genres[song.songId]?.genre);
        const { mood, by } = classifyMood(song, tags);

        if (isPop(tags)) buckets.pop.push(videoId);
        if (mood === 'drive' || mood === 'both') buckets.drive.push(videoId);
        if (mood === 'calm' || mood === 'both') buckets.calm.push(videoId);

        reasons.set(`${mood}/${by}`, (reasons.get(`${mood}/${by}`) ?? 0) + 1);

        const memberships = [
            isPop(tags) ? '팝송' : '',
            mood === 'drive' || mood === 'both' ? '드라이브' : '',
            mood === 'calm' || mood === 'both' ? '잔잔' : '',
        ].filter(Boolean).join(', ');

        rows.push(`${i + 1}\t${memberships}\t${by}\t${song.artist}\t${song.title}\t${tags.join('/')}`);
    });

    for (const key of Object.keys(buckets) as Array<keyof MoodBuckets>) {
        buckets[key] = [...new Set(buckets[key])];
    }

    writeJson(FILES.moodBuckets, buckets);
    writeText(FILES.moodAssignments, ['번호\t분류\t근거\t아티스트\t곡명\t장르', ...rows].join('\n'));

    log.step('분류 결과');
    for (const d of DEFINITIONS) log.info(`  ${d.name.padEnd(6)} ${buckets[d.key].length}곡`);

    log.step('판정 근거');
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
        log.info(`  ${String(count).padStart(4)}  ${reason}`);
    }
    log.info(`\n곡별 판정: ${FILES.moodAssignments}`);
    log.info('마음에 안 드는 곡은 src/rules/moodRules.ts 를 고치고 다시 실행하세요.');

    return buckets;
};

export const moodsCommand = async (options: { recreate: boolean; dryRun: boolean }): Promise<void> => {
    const buckets = classifyCommand();
    if (options.dryRun) return;

    const state = readJson<MoodPlaylistState>(FILES.moodPlaylists, {});
    const session = await connect();
    const client = await createInnertube(session.context, session.page);

    for (const definition of DEFINITIONS) {
        const videoIds = buckets[definition.key];
        const existing = state[definition.key];

        if (existing && options.recreate) {
            log.info(`  기존 "${definition.name}" 삭제: ${existing.playlistId}`);
            await deletePlaylist(client, existing.playlistId);
            delete state[definition.key];
            writeJson(FILES.moodPlaylists, state);
        }

        let entry = state[definition.key];
        if (!entry) {
            const playlistId = await createPlaylist(client, definition.name, definition.description);
            entry = { playlistId, added: 0 };
            state[definition.key] = entry;
            writeJson(FILES.moodPlaylists, state);
            log.step(`"${definition.name}" 생성: ${playlistId}`);
        } else {
            log.step(`"${definition.name}" 이어서 진행 (${entry.added}/${videoIds.length})`);
        }

        while (entry.added < videoIds.length) {
            const batch = videoIds.slice(entry.added, entry.added + config.addBatchSize);
            try {
                await addToPlaylist(client, entry.playlistId, batch);
                entry.added += batch.length;
            } catch (e) {
                log.warn(`배치 실패, 곡별 재시도: ${(e as Error).message}`);
                for (const videoId of batch) {
                    try {
                        await addToPlaylist(client, entry.playlistId, [videoId]);
                    } catch {
                        log.error(`추가 실패: ${videoId}`);
                    }
                    entry.added++;
                    await sleep(400);
                }
            }
            writeJson(FILES.moodPlaylists, state);
            log.progress(entry.added, videoIds.length, definition.name);
            await sleep(800);
        }
    }

    await session.close();

    log.step('완료');
    for (const d of DEFINITIONS) {
        const entry = state[d.key];
        if (entry) {
            log.info(`  ${d.name.padEnd(6)} ${buckets[d.key].length}곡  ${playlistUrl(entry.playlistId)}`);
        }
    }
};
