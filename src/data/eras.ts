// src/data/eras.ts — L0-01 时代表（5 条；fromYear 升序首尾相接，五段并集 = [1921,1949]）
import type { Era } from '../validation/dataSchemas'
import { EraSchema } from '../validation/dataSchemas'

export const eras: readonly Era[] = Object.freeze([
  { id: 'era-warlord', name: '军阀混战', fromYear: 1921, toYear: 1927, desc: '直奉交替，北洋末路' },
  { id: 'era-nanjing', name: '宁汉对峙', fromYear: 1928, toYear: 1936, desc: '定都南京，建设与围剿并行' },
  { id: 'era-resistance', name: '全面抗战', fromYear: 1937, toYear: 1944, desc: '烽火连天，山河破碎' },
  { id: 'era-civilwar', name: '内战风云', fromYear: 1945, toYear: 1948, desc: '胜利之后，暗流汹涌' },
  { id: 'era-collapse', name: '大厦将倾', fromYear: 1949, toYear: 1949, desc: '金圆券崩，江山易帜' },
].map((e) => EraSchema.parse(e)))
