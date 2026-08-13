import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataPath } from '../config.js';

/** data 디렉터리의 JSON 파일을 읽는다. 없으면 fallback. */
export const readJson = <T>(name: string, fallback: T): T => {
    const path = dataPath(name);
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
};

/** data 디렉터리에 JSON을 쓴다. */
export const writeJson = (name: string, value: unknown): void => {
    const path = dataPath(name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
};

/** data 디렉터리에 텍스트를 쓴다. */
export const writeText = (name: string, text: string): void => {
    const path = dataPath(name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
};

export const exists = (name: string): boolean => existsSync(dataPath(name));

export const FILES = {
    playlist: 'melon-playlist.json',
    genres: 'melon-genres.json',
    state: 'migration-state.json',
    report: 'migration-report.txt',
    moodBuckets: 'mood-buckets.json',
    moodAssignments: 'mood-assignments.tsv',
    moodPlaylists: 'mood-playlists.json',
} as const;
