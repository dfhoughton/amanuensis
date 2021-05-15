import { buildEditDistanceMetric } from "../src/modules/util";

function editTest(
  w1: string,
  w2: string,
  d: number,
  edit: (w1: string, w2: string) => number
) {
  const d1 = edit(w1, w2),
    d2 = edit(w2, w1),
    d3 = edit(w1, w1),
    d4 = edit(w2, w2);
  test(`"${w1}" is ${d} from "${w2}"`, () => expect(d1).toBe(d));
  test(`distance from "${w1}" to "${w2}" = the distance from "${w2}" to "${w1}"`, () =>
    expect(d1).toBe(d2));
  test(`distance from "${w1}" to itself is 0`, () => expect(d3).toBe(0));
  test(`distance from "${w2}" to itself is 0`, () => expect(d4).toBe(0));
}

const welsh = buildEditDistanceMetric({
  prefix: 1,
  suffix: 3,
  insertables: "hg",
  similars: ["aeiouyw", "pb", "cg", "bf", "mf", "bm", "td", "bm", "dn", "cn"],
});
const welshTests: [w1: string, w2: string, d: number][] = [
  ["cath", "chath", 0.5],
  ["cath", "clath", 1],
  ["cath", "gath", 0.25],
  ["gwneud", "wneud", 0.25],
  ["mam", "fam", 0.25],
  ["mam", "tam", 0.5],
  ["fforc", "ffyrc", 0.25],
  ["maharen", "meheryn", 1.25],
  ["dyn", "dynion", 1.5],
  ["amser", "hamser", 0.25],
];
for (const [w1, w2, d] of welshTests) {
  editTest(w1, w2, d, welsh);
}

const levenshtein = buildEditDistanceMetric({});
const levenshteinTests: [w1: string, w2: string, d: number][] = [
  ["cath", "chath", 1],
  ["cath", "clath", 1],
  ["cath", "gath", 1],
  ["gwneud", "wneud", 1],
  ["mam", "fam", 1],
  ["mam", "tam", 1],
  ["fforc", "ffyrc", 1],
  ["maharen", "meheryn", 3],
  ["dyn", "dynion", 3],
  ["amser", "hamser", 1],
];
for (const [w1, w2, d] of levenshteinTests) {
  editTest(w1, w2, d, levenshtein);
}

const english = buildEditDistanceMetric({ suffix: 2 });
const englishTests: [w1: string, w2: string, d: number][] = [
  ["cat", "cats", 0.5],
  ["kick", "kicked", 1],
  ["kick", "kicking", 2],
  ["cat", "sat", 1],
  ["cot", "cat", 0.5],
  ["fox", "cat", 2],
];
for (const [w1, w2, d] of englishTests) {
  editTest(w1, w2, d, english);
}
