import type { ScoredCandidate, YtCandidate } from './types.js';

/** 유니코드 통일 + 소문자 + 기호 제거 */
export const normalize = (s: string): string => (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’“”`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** 괄호 안 부가정보 제거: (feat. x), (with x), [inst.] 등 */
export const stripParens = (s: string): string => (s || '')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 원곡이 아닌 '버전' 트랙을 나타내는 표시.
 * 멜론 원곡 제목에 같은 표시가 없는데 후보에만 있으면 감점한다.
 */
const VERSION_MARKERS =
    /\b(instrumental|inst|karaoke|sing[\s-]*along|remix|rem\/x|live|cover)\b|a\s?c+ap+ella|반주|노래방|아카펠라/i;

export const hasVersionMarker = (title: string): boolean => VERSION_MARKERS.test(title || '');

/** bigram Dice 계수 (0~1) */
const dice = (a: string, b: string): number => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

    const bigrams = (s: string): Map<string, number> => {
        const m = new Map<string, number>();
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2);
            m.set(g, (m.get(g) ?? 0) + 1);
        }
        return m;
    };

    const A = bigrams(a);
    const B = bigrams(b);
    let hits = 0;
    for (const [g, n] of A) hits += Math.min(n, B.get(g) ?? 0);
    return (2 * hits) / (a.length - 1 + b.length - 1);
};

/** 원문 / 괄호제거본 중 높은 쪽 유사도 */
const similarity = (a: string, b: string): number => Math.max(
    dice(normalize(a), normalize(b)),
    dice(normalize(stripParens(a)), normalize(stripParens(b))),
);

const SONG_TYPES = new Set(['노래', 'Song']);
const VIDEO_TYPES = new Set(['동영상', 'Video']);

export interface MatchTarget {
    title: string;
    artist: string;
}

/**
 * 후보 하나의 점수를 계산한다.
 *
 * 가중치는 실제 오매칭 사례를 보고 정했다:
 * - 앨범/EP/싱글 카드도 재생용 watchEndpoint에 ATV 타입을 달고 오기 때문에,
 *   ATV 보너스보다 타입 배제를 **먼저** 적용해야 앨범이 곡을 이기지 않는다.
 * - 멜론은 아티스트를 영문("Seori"), 유튜브는 한글("서리")로 주는 경우가 많아
 *   제목 가중치를 아티스트보다 높게 둔다.
 * - 제목 표기가 아예 다른 경우(예: '조또' vs 'JOTTO') 유사도가 무력해지므로
 *   유튜브 자체 관련도 순위를 약한 타이브레이커로 쓴다.
 */
export const scoreCandidate = (
    target: MatchTarget,
    candidate: YtCandidate,
    rank: number,
): ScoredCandidate => {
    const titleSim = similarity(target.title, candidate.title);
    const rawArtistSim = similarity(target.artist, candidate.artist);

    // 아티스트명이 포함관계면 같은 사람으로 본다 ("Seori" vs "서리 Seori")
    const na = normalize(target.artist);
    const nc = normalize(candidate.artist);
    const artistSim = na && nc && (na.includes(nc) || nc.includes(na))
        ? Math.max(rawArtistSim, 0.85)
        : rawArtistSim;

    const isSong = SONG_TYPES.has(candidate.type);
    const isVideo = VIDEO_TYPES.has(candidate.type);

    const typeBonus = !isSong && !isVideo
        ? -0.35
        : candidate.musicVideoType === 'MUSIC_VIDEO_TYPE_ATV'
            ? 0.18
            : isSong
                ? 0.12
                : -0.08;

    const exactBonus = normalize(candidate.title) === normalize(target.title) ? 0.12 : 0;
    const versionPenalty =
        hasVersionMarker(candidate.title) && !hasVersionMarker(target.title) ? 0.30 : 0;
    // 어떤 후보도 제목이 닮지 않았다면(예: '조또' vs 'JOTTO') 제목 유사도는 쓸모가 없다.
    // 그럴 때는 로마자·번역까지 감안하는 유튜브 자체 관련도 순위를 훨씬 무겁게 본다.
    const rankWeight = titleSim < 0.25 ? 0.30 : 0.08;
    const rankBonus = Math.max(0, rankWeight * (1 - rank / 4));

    const score = 0.68 * titleSim
        + 0.32 * artistSim
        + typeBonus
        + exactBonus
        + rankBonus
        - versionPenalty;

    return { ...candidate, score, titleSim, artistSim };
};

/** 후보들 중 가장 높은 점수를 고른다. */
export const pickBest = (
    target: MatchTarget,
    candidates: YtCandidate[],
): ScoredCandidate | null => {
    let best: ScoredCandidate | null = null;

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!c) continue;
        const scored = scoreCandidate(target, c, i);
        if (!best || scored.score > best.score) best = scored;
    }

    return best;
};

/**
 * 자동으로 반영해도 안전한 매칭인지 판단한다.
 * (공식 음원 + 버전 표기 없음 + 충분히 높은 점수)
 */
export const isConfident = (c: ScoredCandidate): boolean =>
    SONG_TYPES.has(c.type)
    && c.musicVideoType === 'MUSIC_VIDEO_TYPE_ATV'
    && !hasVersionMarker(c.title)
    && c.score >= 1.0;
