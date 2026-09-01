/**
 * 액션 판정 러시의 문제 타입.
 *
 * 축 1(팟 판독)이 "얼마인가"를 물었다면 축 2는 **"그 액션이 무엇인가"** 를 묻는다.
 * 그래서 카드도 팟도 없고, 대신 **액션 로그**와 **조항**이 있다.
 *
 * **정답은 이 타입 안에 값으로 들어 있지만, 그 값을 만든 것은 전부 엔진이다.**
 * 이 폴더에 포커 규칙은 없다 (설계 §3).
 */

export type ActionKind = 'minraise' | 'reopen' | 'oversize' | 'multichip' | 'outofturn'

export const KIND_LABEL: Record<ActionKind, string> = {
  minraise: '최소 레이즈',
  reopen: '베팅 기회 재개',
  oversize: '오버사이즈 칩',
  multichip: '다중 칩 베팅',
  outofturn: '순서 위반',
}

/** 제한시간(초). 프로토타입 실플레이로 "맞다"가 확인된 값이다 (설계 §4). 바꾸지 않는다. */
export const LIMIT_SEC: Record<ActionKind, number> = {
  minraise: 28,
  multichip: 22,
  reopen: 20,
  outofturn: 20,
  oversize: 18,
}

/** 한 판의 문제 수. */
export const QUESTION_COUNT = 10

/**
 * 유형별 출제 수 — **균등 2문제씩**.
 *
 * 프로토타입은 "5종 각 1회 + 무작위 5회"였고 무작위 5회의 기댓값이 유형당 1이므로
 * 기대 배분이 곧 2·2·2·2·2 다. 재미가 확인된 배분을 결정론으로 고정하는 것이지
 * 새 배분을 도입하는 것이 아니다 (설계 §4).
 */
export const KIND_QUOTA: Record<ActionKind, number> = {
  minraise: 2,
  reopen: 2,
  oversize: 2,
  multichip: 2,
  outofturn: 2,
}

/** 조항 근거. 채점 후 화면에 **원문 그대로** 보여준다 — 이게 축 2의 학습 가치다. */
export type Article = {
  /** 예: '제35조 2항 (베팅의 원칙 및 한도)' */
  no: string
  /** 규정 원문. 요약하거나 바꿔 쓰지 않는다 */
  text: string
}

/** 액션 로그 한 줄. 최소 레이즈·재개 유형은 이걸 읽어야 풀린다. */
export type LogRow = {
  who: string
  /** 'RAISE' · 'ALL IN' · 'BET' · 'CHECK' 등 */
  act: string
  /** 총액. 없으면 금액이 없는 액션(체크·폴드)이다 */
  amount?: number
  allIn?: boolean
  /** 순서를 어긴 액션인가 */
  outOfTurn?: boolean
}

export type ActionSeat = {
  name: string
  /** 이 좌석이 낸 총액. **화면에는 칩과 함께 보여준다** */
  bet?: number
  /** 앞으로 밀어 놓은 칩의 액면 내역. 다중 칩·오버사이즈 유형이 쓴다 */
  chips?: number[]
  /** 좌석 아래 라벨 — 'RAISE' · '밀었다 (선언 없음)' 등 */
  act?: string
  allIn?: boolean
  blind?: boolean
  /** 질문의 대상. 지문에만 이름이 있으면 매번 지문을 다시 읽게 된다 */
  hero?: boolean
  /** 순서를 어긴 좌석 */
  outOfTurn?: boolean
  /** 아직 액션하지 않은, 지금 차례인 좌석 */
  waiting?: boolean
}

/** 선다형 보기 하나. */
export type Choice = {
  label: string
  /** 보기 아래 한 줄 설명. 왜 그 보기가 그런 뜻인지 */
  note?: string
  correct: boolean
}

type Base = {
  label: string
  /**
   * 지문. **평문이다** — HTML 을 넣지 않는다. 강조는 좌석의 `hero` 표시가 대신한다
   * (문자열에 마크업을 섞으면 dangerouslySetInnerHTML 이 필요해지고, 그 문자열은
   * 생성기가 만든다).
   */
  prompt: string
  limitSec: number
  /** 어느 스트리트 상황인가. 오픈 벳이 성립하려면 플랍이어야 하는 유형이 있다 (설계 §6.1) */
  street: '프리플랍' | '플랍'
  bb: number
  rows: LogRow[]
  seats: ActionSeat[]
  article: Article
  /** 채점 후 보여주는 근거 한 줄 */
  why: string
}

export type ActionQuestion =
  | (Base & { kind: 'minraise'; input: 'number'; answer: number })
  | (Base & {
      kind: 'reopen' | 'oversize' | 'multichip' | 'outofturn'
      input: 'choice'
      choices: Choice[]
    })
