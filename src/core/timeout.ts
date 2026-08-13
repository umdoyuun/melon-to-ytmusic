/**
 * 약속된 시간 안에 끝나지 않으면 실패시킨다.
 *
 * Playwright의 기본 타임아웃은 클릭·이동 같은 동작에만 걸리고
 * `page.evaluate`에는 걸리지 않는다. 응답하지 않는 탭을 붙잡으면
 * 에러도 없이 영원히 매달리기 때문에 직접 끊어줘야 한다.
 */
export const withTimeout = async <T>(
    task: Promise<T>,
    ms: number,
    label: string,
): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;

    const guard = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label}: ${ms / 1000}초 안에 응답이 없습니다.`)),
            ms,
        );
    });

    try {
        return await Promise.race([task, guard]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};
