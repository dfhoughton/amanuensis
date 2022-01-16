import { trie } from "../src/modules/trie"

const chars = "abcdefjhijklmnopqrstuvwxyzåß∑≈ç√ƒπµ†0123456789!@#$%^&*()_+-=:;"
const rand = (n: number): number => Math.floor(Math.random() * n)
function randomWord(max = 8): string {
  let word = ""
  for (let i = 0, l = rand(8) + 1; i < l; i++)
    word += chars.charAt(rand(chars.length))
  return word
}
function randomList(n: number, max = 8): string[] {
  const list = []
  for (let i = 0; i < n; i++) list.push(randomWord(max))
  return list
}

type Test = {
  words: string[]
  pattern?: string
  duds?: string[]
  label?: string
}

const tests: Test[] = [
  { words: ["cat"], pattern: "/(?<=\\P{L}|^)cat(?=\\P{L}|$)/iu" },
  { words: ["fooooo"], pattern: "/(?<=\\P{L}|^)fo{5}(?=\\P{L}|$)/iu" },
  { words: ["cat foo"], pattern: "/(?<=\\P{L}|^)cat\\s+foo(?=\\P{L}|$)/iu" },
  {
    words: "cat cats".split(" "),
    pattern: "/(?<=\\P{L}|^)cats?(?=\\P{L}|$)/iu",
  },
  {
    words: "cat bat".split(" "),
    pattern: "/(?<=\\P{L}|^)[bc]at(?=\\P{L}|$)/iu",
  },
  {
    words: "CAT BAT".split(" "),
    pattern: "/(?<=\\P{L}|^)[bc]at(?=\\P{L}|$)/iu",
  },
  {
    words: "scats shits".split(" "),
    pattern: "/(?<=\\P{L}|^)s(?:ca|hi)ts(?=\\P{L}|$)/iu",
  },
  {
    words: "cat dog camel".split(" "),
    duds: "scat cattle hotdog doggerel cameleopard".split(" "),
  },
  { label: "metacharacters", words: "@#!#$ ()\\%%^& ./~@+-_".split(" ") },
  { label: "long list", words: randomList(200) },
  { label: "long list short words", words: randomList(200, 4) },
  { label: "long list long words", words: randomList(200, 16) },
]
tests.forEach(({ words, pattern, duds, label }) => {
  const rx = trie(words)
  label ??= words.join(", ")
  if (pattern) test(label, () => expect(rx.toString()).toBe(pattern))
  for (const w of words) {
    test(`${label}: ${w} =~ ${rx}`, () => expect(rx.test(w)).toBeTruthy())
  }
  if (duds) {
    for (const w of duds) {
      test(`${label}: ${w} !~ ${rx}`, () => expect(rx.test(w)).toBeFalsy())
    }
  }
})
