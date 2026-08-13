import type { YtCandidate } from '../core/types.js';
import { findAll, runsText, type Innertube } from './innertube.js';

/**
 * 2026년 기준 유튜브 뮤직 검색 응답 구조.
 *
 * 예전에는 결과가 `musicShelfRenderer`(노래/앨범/아티스트 셸프)로 묶여 있었지만,
 * 지금은 최상단 추천이 `musicCardShelfRenderer`, 나머지가 결과 1건씩 담긴
 * `itemSectionRenderer`의 나열로 바뀌었다. 셸프 제목이 사라졌기 때문에
 * 결과 종류는 부제("노래 • 서리 • 3:41")의 첫 토큰으로 판별한다.
 */

/** "노래 • 서리 • 3:41" → { type: '노래', artist: '서리' } */
const parseSubtitle = (subtitle: string): { type: string; artist: string } => {
    const parts = subtitle.split('•').map(s => s.trim()).filter(Boolean);
    return { type: parts[0] ?? '', artist: parts[1] ?? '' };
};

const musicVideoTypeOf = (node: unknown): string => {
    const cfg = findAll(node, 'watchEndpointMusicConfig')[0] as { musicVideoType?: string } | undefined;
    return cfg?.musicVideoType ?? '';
};

const parseListItem = (item: Record<string, unknown>): YtCandidate | null => {
    const playlistItemData = item['playlistItemData'] as { videoId?: string } | undefined;
    const overlayEndpoint = findAll(item['overlay'] ?? {}, 'watchEndpoint')[0] as { videoId?: string } | undefined;
    const videoId = playlistItemData?.videoId ?? overlayEndpoint?.videoId;
    if (!videoId) return null;

    const columns = (item['flexColumns'] ?? []) as Array<Record<string, { text?: unknown }>>;
    const columnText = (i: number): string =>
        runsText(columns[i]?.['musicResponsiveListItemFlexColumnRenderer']?.text);

    const subtitle = columnText(1);
    const { type, artist } = parseSubtitle(subtitle);

    return {
        videoId,
        title: columnText(0),
        artist,
        type,
        musicVideoType: musicVideoTypeOf(item),
        subtitle,
        source: 'list',
    };
};

const parseCard = (card: Record<string, unknown>): YtCandidate | null => {
    const endpoint = findAll(card, 'watchEndpoint')[0] as { videoId?: string } | undefined;
    if (!endpoint?.videoId) return null;

    const subtitle = runsText(card['subtitle']);
    const { type, artist } = parseSubtitle(subtitle);

    return {
        videoId: endpoint.videoId,
        title: runsText(card['title']),
        artist,
        type,
        musicVideoType: musicVideoTypeOf(card),
        subtitle,
        source: 'card',
    };
};

/** 검색해서 후보 목록을 유튜브가 준 관련도 순서 그대로 돌려준다. */
export const search = async (client: Innertube, query: string): Promise<YtCandidate[]> => {
    const json = await client.call<Record<string, any>>('search', { query });

    const sections = json?.['contents']?.tabbedSearchResultsRenderer?.tabs?.[0]
        ?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];

    const results: YtCandidate[] = [];
    const seen = new Set<string>();

    const push = (candidate: YtCandidate | null): void => {
        if (!candidate || seen.has(candidate.videoId)) return;
        seen.add(candidate.videoId);
        results.push(candidate);
    };

    for (const section of sections as Array<Record<string, any>>) {
        if (section['musicCardShelfRenderer']) {
            push(parseCard(section['musicCardShelfRenderer']));
            continue;
        }
        for (const item of section['itemSectionRenderer']?.contents ?? []) {
            if (item['musicResponsiveListItemRenderer']) {
                push(parseListItem(item['musicResponsiveListItemRenderer']));
            }
        }
    }

    return results;
};
