# melon-to-ytmusic

멜론에 몇 년치 쌓아둔 플레이리스트를 유튜브 뮤직으로 옮기려고 만든 CLI입니다.

곡이 900개가 넘으니까 하나씩 옮기는 건 도저히 못 하겠어서 만들었습니다.
옮기고 나서는 팝송 / 드라이브 / 잔잔한 곡처럼 나눠서 듣고 싶어서 무드 분류도 붙였습니다.

## Claude Code로 쓰면 더 편합니다

CLI 명령어를 직접 입력하기 귀찮다면 **Claude Code Skill이나 Plugin으로 설치해서 사용하는 걸 추천합니다.**

설치해두면

> 멜론 플레이리스트 유튜브 뮤직으로 옮겨줘

정도로 말해도 알아서 필요한 명령을 순서대로 실행합니다.

곡 매칭 결과를 보고 애매한 곡만 따로 확인하는 것도 가능해서, 그냥 CLI를 직접 쓰는 것보다 편합니다.

### Skill

```bash
npm run skill:install
```

현재 프로젝트에서만 사용하려면:

```bash
npm run skill:install -- --project
```

`~/.claude/skills`에 설치하거나 현재 프로젝트의 `./.claude/skills`에 설치할 수 있습니다.

레포를 업데이트했다면 다시 실행해주세요. 복사해서 설치하는 방식이라 자동으로 따라가지는 않습니다.

### Plugin

Plugin으로 설치하면 레포를 따로 클론하지 않아도 됩니다.

```text
/plugin marketplace add umdoyuun/melon-to-ytmusic
/plugin install melon-to-ytmusic
```

설치할 때 필요한 코드와 Skill이 같이 들어갑니다.

처음 실행할 때 의존성이 없으면 `scripts/bootstrap.js`를 한 번 실행합니다.

작업 데이터는 플러그인 디렉터리와 별도로 `~/.melon-to-ytmusic/data`에 저장합니다.
Plugin을 업데이트해도 기존 데이터는 그대로 남습니다.

---

## 직접 CLI로 쓰기

비밀번호를 프로그램에 넣을 필요는 없습니다.

크롬 창을 하나 띄우고 그 창에서 직접 멜론과 구글에 로그인하면 됩니다.
프로그램은 로그인된 브라우저 세션에 붙어서 작업합니다.

남이 만든 스크립트에 계정 비밀번호를 적어 넣는 게 찝찝해서 이렇게 만들었습니다.

### 준비물

* Node.js 20 이상
* Chrome
* 멜론 계정
* Google 계정

Chrome은 설치만 되어 있으면 됩니다. `playwright-core`를 사용해서 브라우저를 따로 다운로드하지 않습니다.

```bash
npm install
npm run build
```

### 사용법

먼저 로그인합니다.

```bash
npm run mtym -- login
```

크롬이 뜨면 멜론과 유튜브 뮤직에 로그인합니다.

멜론 플레이리스트를 확인합니다.

```bash
npm run mtym -- playlists
```

옮길 플레이리스트의 번호를 확인한 뒤 곡을 수집합니다.

```bash
npm run mtym -- scrape --playlist 558381546
```

무드 분류까지 할 거라면 `--genres`를 붙입니다.

```bash
npm run mtym -- scrape --playlist 558381546 --genres
```

수집이 끝나면 유튜브 뮤직에서 곡을 찾아 새 플레이리스트로 옮깁니다.

```bash
npm run mtym -- migrate
```

1000곡 정도 옮겨보니 대략 20분 정도 걸렸습니다.

중간에 끊겨도 괜찮습니다. 진행 상태를 저장하고 있어서 같은 명령을 다시 실행하면 이어서 처리합니다.

빌드한 뒤에는 아래처럼 직접 실행할 수도 있습니다.

```bash
node dist/cli.js <command>
```

`npm link`를 해두면 `mtym`으로 바로 사용할 수 있습니다.

---

## 무드 분류

기본적으로는 팝송 / 드라이브 / 잔잔 세 가지로 나눠줍니다.

먼저 결과만 확인하려면:

```bash
npm run mtym -- moods --dry-run
```

실제로 플레이리스트를 만들려면:

```bash
npm run mtym -- moods
```

분류 기준은 `src/rules/moodRules.ts`에서 바꿀 수 있습니다.

```ts
export const ARTIST_MOOD = {
    'Dua Lipa': 'drive',
    'Billie Eilish': 'calm',
};

export const SONG_MOOD = {
    'Billie Eilish|bury a friend': 'drive',
};
```

아티스트 전체에 기본값을 줄 수도 있고, 특정 곡만 따로 지정할 수도 있습니다.

곡 규칙이 아티스트 규칙보다 우선하고, 둘 다 없으면 멜론 장르를 봅니다.

애매해서 하나로 정하기 어려운 곡은 `both`로 둘 수도 있습니다.
이 경우 두 플레이리스트에 모두 들어갑니다.

규칙을 수정한 뒤에는:

```bash
npm run mtym -- moods --recreate
```

로 다시 만들면 됩니다.

---

## 곡 매칭

멜론과 유튜브 뮤직은 같은 곡도 제목이나 아티스트 표기가 다른 경우가 많아서 단순히 이름만 비교해서는 잘 안 맞습니다.

그래서 검색 결과에서 **공식 음원을 우선하고, 앨범·EP 같은 결과는 제외**한 뒤 제목과 아티스트의 유사도를 같이 봅니다.

MR, Instrumental, 리믹스, 라이브 같은 결과도 원곡보다 낮게 봅니다.

표기가 아예 다른 경우에는 문자열 비교보다 유튜브 검색 순위를 더 크게 봅니다.

그래도 가끔 엉뚱한 곡이 잡히기 때문에 `repair` 명령으로 매칭 결과를 확인하고 수정할 수 있게 해뒀습니다.

```bash
npm run mtym -- repair
npm run mtym -- repair --apply
```

`--apply` 없이 실행하면 실제 변경 없이 수정 대상만 보여줍니다.


---

## 결과 파일

작업 결과는 `data/`에 저장됩니다.

```text
melon-playlist.json
melon-playlist.tsv
melon-genres.json
migration-state.json
migration-report.txt
mood-assignments.tsv
```

`migration-report.txt`를 보면 못 찾은 곡이나 매칭 점수가 낮은 곡을 확인할 수 있습니다.

`mood-assignments.tsv`에는 곡마다 어떤 무드로 분류됐는지도 남습니다.

계정 정보와 플레이리스트가 들어가기 때문에 `data/`는 `.gitignore`에 넣어뒀습니다.

---

## 설정

기본값으로 대부분 그냥 사용하면 됩니다.

| 변수                     | 기본값                                  |
| ---------------------- | ------------------------------------ |
| `MTYM_CHROME_PATH`     | 자동 탐지                                |
| `MTYM_CHROME_PROFILE`  | `~/.melon-to-ytmusic/chrome-profile` |
| `MTYM_DEBUG_PORT`      | `9222`                               |
| `MTYM_DATA_DIR`        | `./data`                             |
| `MTYM_SEARCH_DELAY_MS` | `250`                                |
| `MTYM_ADD_BATCH`       | `50`                                 |
| `MTYM_LOW_SCORE`       | `0.75`                               |

Chrome 프로필은 평소 쓰는 브라우저와 따로 만듭니다.

이미 실행 중인 Chrome은 나중에 디버깅 포트를 열 수 없는 경우가 있고, 자동화 때문에 평소 사용하던 브라우저 세션을 건드리는 것도 피하려고 분리했습니다.

---

## 알아둘 것

멜론과 유튜브 뮤직의 비공개 API와 현재 DOM 구조에 기대고 있습니다.

그래서 두 서비스가 API나 UI를 바꾸면 언제든지 깨질 수 있습니다.

**2026년 8월 기준으로는 동작합니다.**

유튜브 뮤직에 없는 곡은 옮길 수 없습니다.

개인 플레이리스트를 옮기는 용도로 만든 프로그램입니다.

---

## 개발

```bash
npm run typecheck
npm test
```

테스트는 브라우저 없이 돌릴 수 있는 `src/core/match.ts`와 `src/core/mood.ts` 위주로 작성했습니다.

곡 매칭이나 무드 분류는 결과가 조용히 틀릴 수 있어서 이쪽은 테스트를 붙여두는 게 좋겠다고 생각했습니다.

실제로 테스트를 붙이고 `Acapella`를 제대로 걸러내지 못하던 정규식 버그를 하나 발견했습니다.

---

## License

MIT
