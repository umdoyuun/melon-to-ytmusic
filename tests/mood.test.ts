import { describe, expect, it } from 'vitest';
import { classifyMood, firstArtist, isPop, parseGenres } from '../src/core/mood.js';

describe('parseGenres / firstArtist', () => {
    it('복합 장르를 쪼갠다', () => {
        expect(parseGenres('발라드, 국내드라마')).toEqual(['발라드', '국내드라마']);
        expect(parseGenres(undefined)).toEqual([]);
    });

    it('멜론이 이어붙인 아티스트에서 첫 명을 뽑는다', () => {
        expect(firstArtist('League of Legends, Djerv, League of Legends')).toBe('League of Legends');
    });
});

describe('isPop', () => {
    it('POP 장르만 팝송으로 본다', () => {
        expect(isPop(['POP'])).toBe(true);
        expect(isPop(['J-POP'])).toBe(false);   // '팝송'은 해외 팝으로 한정
        expect(isPop(['R&B/Soul'])).toBe(false);
    });
});

describe('classifyMood', () => {
    it('장르로 갈리면 장르를 쓴다', () => {
        expect(classifyMood({ artist: '아무개', title: '아무곡' }, ['댄스']))
            .toEqual({ mood: 'drive', by: 'genre' });
        expect(classifyMood({ artist: '아무개', title: '아무곡' }, ['발라드']))
            .toEqual({ mood: 'calm', by: 'genre' });
    });

    it('신나는 장르와 잔잔한 장르가 같이 있으면 양쪽', () => {
        expect(classifyMood({ artist: '아무개', title: '아무곡' }, ['댄스', '발라드']))
            .toEqual({ mood: 'both', by: 'genre' });
    });

    it('장르로 판단이 안 되면 양쪽에 넣는다', () => {
        // R&B/Soul 은 드라이브·잔잔 어느 쪽도 아니다
        expect(classifyMood({ artist: '모르는사람', title: '모르는곡' }, ['R&B/Soul']))
            .toEqual({ mood: 'both', by: 'default' });
    });

    it('곡 규칙이 아티스트 규칙보다 우선한다', () => {
        // Billie Eilish 는 기본 calm 이지만 'bury a friend' 는 예외
        expect(classifyMood({ artist: 'Billie Eilish', title: 'bury a friend' }, ['POP']).mood)
            .toBe('drive');
        expect(classifyMood({ artist: 'Billie Eilish', title: 'ocean eyes' }, ['POP']))
            .toEqual({ mood: 'calm', by: 'artist' });
    });

    it('규칙 매칭은 대소문자와 기호를 무시한다', () => {
        expect(classifyMood({ artist: 'taylor swift', title: 'SHAKE IT OFF' }, ['POP']).mood)
            .toBe('drive');
    });

    it('아티스트 규칙은 첫 아티스트로 찾는다', () => {
        expect(classifyMood({ artist: 'SAAY, Colde', title: '아무곡' }, ['R&B/Soul']))
            .toEqual({ mood: 'drive', by: 'artist' });
    });
});
