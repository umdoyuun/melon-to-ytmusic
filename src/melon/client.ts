import type { Page } from 'playwright-core';

export const MELON_ORIGIN = 'https://www.melon.com';

/**
 * 멜론은 폐기된 경로에 접근하면 alert를 띄운다.
 * (예: memberKey 없이 마이뮤직 목록 URL을 열면 "탈퇴한 회원입니다")
 * alert가 뜬 채로 두면 이후 모든 evaluate가 막히므로 자동으로 닫는다.
 */
export const autoDismissDialogs = (page: Page): void => {
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => undefined); });
};

/** 멜론 도메인 컨텍스트를 확보한다 (쿠키/동일출처 fetch용). */
export const gotoMelon = async (page: Page, path = '/'): Promise<void> => {
    await page.goto(`${MELON_ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
};

/** 로그인 여부 */
export const isLoggedIn = (page: Page): Promise<boolean> =>
    page.evaluate(() => !document.querySelector('.btn_login'));

/**
 * 로그인한 회원의 memberKey.
 * 마이뮤직 관련 URL은 전부 이 값을 쿼리로 요구한다.
 * (빠뜨리면 멜론이 "탈퇴한 회원입니다" alert를 띄우고 메인으로 돌려보낸다.)
 */
export const getMemberKey = async (page: Page): Promise<string> => {
    const key = await page.evaluate(() => {
        const fn = (window as unknown as { getMemberKey?: () => string }).getMemberKey;
        return typeof fn === 'function' ? fn() : null;
    });

    if (!key) {
        throw new Error('memberKey를 읽지 못했습니다. 멜론에 로그인되어 있는지 확인해주세요.');
    }
    return String(key);
};
