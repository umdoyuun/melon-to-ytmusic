import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.js';
import { connect } from '../browser/chrome.js';
import { log } from '../core/logger.js';
import { isConfident, pickBest, stripParens } from '../core/match.js';
import { FILES, readJson, writeJson } from '../core/store.js';
import type { MatchRecord, MigrationState, ScoredCandidate } from '../core/types.js';
import { createInnertube } from '../ytmusic/innertube.js';
import { addToPlaylist, getPlaylistItems, removeFromPlaylist } from '../ytmusic/playlist.js';
import { search } from '../ytmusic/search.js';

interface Change {
    record: MatchRecord;
    before: ScoredCandidate;
    after: ScoredCandidate;
    safe: boolean;
}

/**
 * 의심스러운 매칭을 다시 검색해 교정한다.
 *
 * 재검증 대상은 (1) 앨범/EP/싱글 카드로 매칭된 곡과 (2) 점수가 낮은 곡이다.
 * 자동 반영은 확실한 것만 하고, 애매한 건 목록만 보여준다 —
 * 잘못 고치면 원래 맞던 곡까지 틀어지기 때문이다.
 */
export const repairCommand = async (options: { apply: boolean }): Promise<void> => {
    const state = readJson<MigrationState | null>(FILES.state, null);
    if (!state?.playlistId) {
        throw new Error('이전 결과가 없습니다. 먼저 `mtym migrate`를 실행하세요.');
    }

    const targets = state.matches.filter(m => m.match && (
        (m.match.type !== '노래' && m.match.type !== '동영상')
        || m.match.score < config.lowScoreThreshold
    ));

    log.step(`재검증 대상 ${targets.length}건 (${options.apply ? '반영' : '미리보기'})`);

    const session = await connect();
    const client = await createInnertube(session.context, session.page);

    const changes: Change[] = [];

    for (const record of targets) {
        const { melon } = record;
        try {
            let best = pickBest(melon, await search(client, `${melon.artist} ${melon.title}`));

            if (!best || best.score < 0.85) {
                const altTitle = stripParens(melon.title);
                if (altTitle && altTitle !== melon.title) {
                    await sleep(config.searchDelayMs);
                    const retry = pickBest(
                        { title: altTitle, artist: melon.artist },
                        await search(client, `${melon.artist} ${altTitle}`),
                    );
                    if (retry && (!best || retry.score > best.score)) best = retry;
                }
            }

            if (best && best.videoId !== record.match!.videoId) {
                changes.push({
                    record,
                    before: record.match!,
                    after: best,
                    safe: isConfident(best),
                });
            }
        } catch (e) {
            log.warn(`재검색 실패 #${record.index + 1}: ${(e as Error).message}`);
        }
        await sleep(config.searchDelayMs);
    }

    const safe = changes.filter(c => c.safe);
    const review = changes.filter(c => !c.safe);

    log.step(`자동 반영 가능 ${safe.length}건`);
    for (const c of safe) {
        log.info(`  #${c.record.index + 1} ${c.record.melon.artist} - ${c.record.melon.title}`);
        log.info(`      [${c.before.type}] ${c.before.title} → [${c.after.type}] ${c.after.title} (${c.after.score.toFixed(2)})`);
    }

    log.step(`직접 확인 필요 ${review.length}건 (자동 반영하지 않음)`);
    for (const c of review) {
        log.info(`  #${c.record.index + 1} ${c.record.melon.artist} - ${c.record.melon.title}`);
        log.info(`      현재: [${c.before.type}] ${c.before.artist} - ${c.before.title}`);
        log.info(`      후보: [${c.after.type}] ${c.after.artist} - ${c.after.title} (${c.after.score.toFixed(2)})`);
    }

    if (!options.apply) {
        await session.close();
        log.info('\n실제로 반영하려면 --apply 를 붙여 다시 실행하세요.');
        return;
    }
    if (safe.length === 0) {
        await session.close();
        return;
    }

    log.step('플레이리스트 교정');
    const items = await getPlaylistItems(client, state.playlistId);

    // 교정 후에도 다른 곡이 쓰는 videoId는 지우면 안 된다
    const stillUsed = new Set<string>();
    for (const m of state.matches) {
        if (!m.match) continue;
        const change = safe.find(c => c.record.index === m.index);
        stillUsed.add(change ? change.after.videoId : m.match.videoId);
    }

    const toAdd: string[] = [];
    const toRemove: Array<{ videoId: string; setVideoId: string }> = [];

    for (const c of safe) {
        const setVideoId = items.get(c.before.videoId);
        if (!stillUsed.has(c.before.videoId) && setVideoId) {
            toRemove.push({ videoId: c.before.videoId, setVideoId });
        }
        if (!items.has(c.after.videoId) && !toAdd.includes(c.after.videoId)) {
            toAdd.push(c.after.videoId);
        }
        c.record.match = c.after;
    }

    for (let i = 0; i < toAdd.length; i += config.addBatchSize) {
        await addToPlaylist(client, state.playlistId, toAdd.slice(i, i + config.addBatchSize));
        await sleep(800);
    }
    await removeFromPlaylist(client, state.playlistId, toRemove);

    state.addedCount = state.addedCount + toAdd.length - toRemove.length;
    writeJson(FILES.state, state);

    await session.close();

    log.info(`  추가 ${toAdd.length}곡 / 제거 ${toRemove.length}곡`);
    log.info('\n무드 플레이리스트를 이미 만들었다면 `mtym moods --recreate` 로 다시 만드세요.');
};
