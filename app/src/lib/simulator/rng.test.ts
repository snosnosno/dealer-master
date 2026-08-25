import { describe, it, expect } from 'vitest'
import { createRng } from './rng'

describe('createRng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng('nlh-7f3a91')
    const b = createRng('nlh-7f3a91')
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 다른 수열을 만든다', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-b')
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() 는 0 이상 1 미만을 돌려준다', () => {
    const r = createRng('range-check')
    for (let i = 0; i < 500; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int(n) 은 0 이상 n 미만 정수를 돌려준다', () => {
    const r = createRng('int-check')
    for (let i = 0; i < 500; i++) {
      const v = r.int(6)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
    }
  })

  it('pick 은 배열의 원소를 돌려주고 시드에 대해 결정론적이다', () => {
    const arr = ['a', 'b', 'c', 'd']
    const one = Array.from({ length: 10 }, (_, i) => createRng('pick' + i).pick(arr))
    const two = Array.from({ length: 10 }, (_, i) => createRng('pick' + i).pick(arr))
    expect(one).toEqual(two)
    one.forEach((v) => expect(arr).toContain(v))
  })
})
