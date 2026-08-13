import { normalize } from './match.js';
import {
    ARTIST_MOOD,
    CALM_GENRES,
    DRIVE_GENRES,
    POP_GENRES,
    SONG_MOOD,
} from '../rules/moodRules.js';
import type { MoodVerdict } from './types.js';

/** 멜론은 "League of Legends, Djerv" 처럼 아티스트를 이어붙여 준다. */
export const firstArtist = (artist: string): string => (artist || '').split(',')[0]?.trim() ?? '';

const ruleKey = (artist: string, title: string): string =>
    `${normalize(firstArtist(artist))}|${normalize(title)}`;

/** 규칙 테이블을 정규화된 키로 미리 변환해둔다. */
const songMood = new Map<string, MoodVerdict['mood']>(
    Object.entries(SONG_MOOD).map(([key, mood]) => {
        const sep = key.indexOf('|');
        return [ruleKey(key.slice(0, sep), key.slice(sep + 1)), mood] as const;
    }),
);

const artistMood = new Map<string, MoodVerdict['mood']>(
    Object.entries(ARTIST_MOOD).map(([artist, mood]) => [normalize(firstArtist(artist)), mood] as const),
);

/** "발라드, 국내드라마" → ['발라드', '국내드라마'] */
export const parseGenres = (genre: string | undefined): string[] =>
    (genre ?? '').split(',').map(g => g.trim()).filter(Boolean);

export const isPop = (genreTags: string[]): boolean =>
    genreTags.some(t => POP_GENRES.includes(t));

/**
 * 곡 하나의 무드를 판정한다.
 * 장르로도 판단이 안 서면 'both' — 드라이브·잔잔 양쪽에 넣는다.
 */
export const classifyMood = (
    song: { artist: string; title: string },
    genreTags: string[],
): MoodVerdict => {
    const bySong = songMood.get(ruleKey(song.artist, song.title));
    if (bySong) return { mood: bySong, by: 'song' };

    const byArtist = artistMood.get(normalize(firstArtist(song.artist)));
    if (byArtist) return { mood: byArtist, by: 'artist' };

    const hasDrive = genreTags.some(t => DRIVE_GENRES.includes(t));
    const hasCalm = genreTags.some(t => CALM_GENRES.includes(t));

    if (hasDrive && !hasCalm) return { mood: 'drive', by: 'genre' };
    if (hasCalm && !hasDrive) return { mood: 'calm', by: 'genre' };
    if (hasDrive && hasCalm) return { mood: 'both', by: 'genre' };

    return { mood: 'both', by: 'default' };
};
