import { describe, it, expect } from 'vitest'
import { parseStars } from '../src/progress'

describe('saved stars validation', () => {
  it('recovers from null or non-object JSON without breaking the menu', () => {
    for (const raw of [null, 'null', '[]', '42', '"oops"', '{broken']) expect(parseStars(raw)).toEqual({})
  })
  it('preserves only actual level IDs and integer star counts within bounds', () => {
    expect(parseStars('{"pagi":3,"ikan":1,"malam":0,"daging":4,"gudang":-1,"parkiran":1.5,"gerbang":"3","unknown":3}')).toEqual({pagi:3,ikan:1,malam:0})
  })
})
