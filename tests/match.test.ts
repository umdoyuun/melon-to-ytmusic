import { describe, expect, it } from 'vitest';
import { hasVersionMarker, isConfident, normalize, pickBest, stripParens } from '../src/core/match.js';
import type { YtCandidate } from '../src/core/types.js';

const candidate = (partial: Partial<YtCandidate> & { videoId: string }): YtCandidate => ({
    title: '',
    artist: '',
    type: '노래',
    musicVideoType: 'MUSIC_VIDEO_TYPE_ATV',
    subtitle: '',
    source: 'list',
    ...partial,
});

describe('normalize / stripParens', () => {
    it('대소문자와 기호를 무시한다', () => {
        expect(normalize("Don't Start Now")).toBe('don t start now');
    });

    it('괄호 안 부가정보를 떼어낸다', () => {
        expect(stripParens('바람 (Feat. Jclef)')).toBe('바람');
        expect(stripParens('Six Feet Under [The Remixes]')).toBe('Six Feet Under');
    });
});

describe('hasVersionMarker', () => {
    it('원곡이 아닌 버전을 알아본다', () => {
        for (const title of [
            'PINK MOON (Instrumental)',
            '비가 오는 날엔 (Inst.)',
            'Soda Pop (Acapella)',
            '철학보다 무서운 건 (82693) MR 노래방',
            'Fortnight (Cults Remix)',
            'Backlight (Live At Nippon Budokan)',
        ]) {
            expect(hasVersionMarker(title), title).toBe(true);
        }
    });

    it('평범한 제목은 걸리지 않는다', () => {
        for (const title of ['Anti-Hero', '밤양갱', 'My Gravity (with 김종완 of NELL)']) {
            expect(hasVersionMarker(title), title).toBe(false);
        }
    });
});

describe('pickBest', () => {
    it('아티스트 표기가 한/영으로 달라도 공식 음원을 고른다', () => {
        // 실제 오매칭 사례: 멜론 "Seori" vs 유튜브 "서리"
        const best = pickBest(
            { title: 'My Gravity (with 김종완 of NELL)', artist: 'Seori' },
            [
                candidate({
                    videoId: 'ATV', title: 'My Gravity (with 김종완 of NELL)',
                    artist: '서리', type: '노래', source: 'card',
                }),
                candidate({
                    videoId: 'MV', title: "서리(Seori) ‘My Gravity (with 김종완 of NELL)’ MV",
                    artist: '서리 Seori', type: '동영상', musicVideoType: 'MUSIC_VIDEO_TYPE_OMV',
                }),
            ],
        );

        expect(best?.videoId).toBe('ATV');
    });

    it('앨범/EP 카드보다 곡을 우선한다', () => {
        // 앨범 카드도 재생용 watchEndpoint에 ATV 타입을 달고 온다
        const best = pickBest(
            { title: 'Lover', artist: 'Taylor Swift' },
            [
                candidate({ videoId: 'ALBUM', title: 'Lover', artist: 'Taylor Swift', type: '앨범' }),
                candidate({ videoId: 'SONG', title: 'Lover', artist: 'Taylor Swift', type: '노래' }),
            ],
        );

        expect(best?.videoId).toBe('SONG');
    });

    it('멜론이 요구하지 않은 반주/리믹스 버전을 피한다', () => {
        const best = pickBest(
            { title: 'PINK MOON', artist: '류수정' },
            [
                candidate({ videoId: 'INST', title: 'PINK MOON (Instrumental)', artist: '류수정' }),
                candidate({ videoId: 'ORIGINAL', title: 'PINK MOON', artist: '류수정' }),
            ],
        );

        expect(best?.videoId).toBe('ORIGINAL');
    });

    it('제목 표기가 아예 다르면 유튜브 관련도 순서를 따른다', () => {
        // '조또' vs 'JOTTO' — 문자열 유사도가 0이라 순위가 타이브레이커가 된다
        const best = pickBest(
            { title: '조또', artist: '비비 (BIBI)' },
            [
                candidate({ videoId: 'JOTTO', title: 'JOTTO', artist: 'BIBI' }),
                candidate({ videoId: 'OTHER', title: '밤양갱', artist: '비비 (BIBI)' }),
            ],
        );

        expect(best?.videoId).toBe('JOTTO');
    });

    it('후보가 없으면 null', () => {
        expect(pickBest({ title: 'x', artist: 'y' }, [])).toBeNull();
    });
});

describe('isConfident', () => {
    it('공식 음원 + 정확한 제목만 확실하다고 본다', () => {
        const best = pickBest(
            { title: 'Anti-Hero', artist: 'Taylor Swift' },
            [candidate({ videoId: 'a', title: 'Anti-Hero', artist: 'Taylor Swift' })],
        );
        expect(isConfident(best!)).toBe(true);
    });

    it('뮤직비디오는 확실하다고 보지 않는다', () => {
        const best = pickBest(
            { title: 'Anti-Hero', artist: 'Taylor Swift' },
            [candidate({
                videoId: 'a', title: 'Anti-Hero', artist: 'Taylor Swift',
                type: '동영상', musicVideoType: 'MUSIC_VIDEO_TYPE_OMV',
            })],
        );
        expect(isConfident(best!)).toBe(false);
    });
});
