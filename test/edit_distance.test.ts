import { formatNumber } from "../src/modules/util"

test(`basic grouping`, () => expect(formatNumber(1000)).toBe("1,000"))
test(`no commas in small numbers`, () => expect(formatNumber(100)).toBe("100"))
test(`big number`, () => expect(formatNumber(1000000000)).toBe("1,000,000,000"))
test(`rounding`, () => expect(formatNumber(10.5)).toBe("11"))
test(`negation`, () => expect(formatNumber(-10.5)).toBe("-11"))
test(`negation of a big number`, () =>
  expect(formatNumber(-1000.5)).toBe("-1,001"))
