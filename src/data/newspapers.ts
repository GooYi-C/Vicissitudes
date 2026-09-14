// src/data/newspapers.ts — L0-13 报纸表（史实报名只读；自办报馆暂缓 §0.3-E8）
import type { Newspaper } from '../validation/dataSchemas'
import { NewspaperSchema } from '../validation/dataSchemas'

export const newspapers: readonly Newspaper[] = Object.freeze([
  {
    "id": "paper-shenbao",
    "name": "申报",
    "city": "shanghai",
    "stance": {
      "politics": "neutral",
      "credibility": 4
    },
    "eraRange": [
      1872,
      1949
    ]
  },
  {
    "id": "paper-xinwenbao",
    "name": "新闻报",
    "city": "shanghai",
    "stance": {
      "politics": "neutral",
      "credibility": 3
    },
    "eraRange": [
      1893,
      1949
    ]
  },
  {
    "id": "paper-dagongbao",
    "name": "大公报",
    "city": "tianjin",
    "stance": {
      "politics": "neutral",
      "credibility": 5
    },
    "eraRange": [
      1902,
      1949
    ]
  },
  {
    "id": "paper-minsheng",
    "name": "民生报",
    "city": "nanjing",
    "stance": {
      "politics": "guomin",
      "credibility": 3
    },
    "eraRange": [
      1927,
      1935
    ]
  },
  {
    "id": "paper-xinsheng",
    "name": "新生周刊",
    "city": "shanghai",
    "stance": {
      "politics": "zhiyuan",
      "credibility": 4
    },
    "eraRange": [
      1934,
      1935
    ]
  },
  {
    "id": "paper-huashang",
    "name": "华商报",
    "city": "hongkong",
    "stance": {
      "politics": "zhiyuan",
      "credibility": 4
    },
    "eraRange": [
      1941,
      1941
    ]
  },
  {
    "id": "paper-takungpao-hk",
    "name": "大公报港版",
    "city": "hongkong",
    "stance": {
      "politics": "neutral",
      "credibility": 5
    },
    "eraRange": [
      1938,
      1949
    ]
  },
  {
    "id": "paper-ribao",
    "name": "救亡日报",
    "city": "guangzhou",
    "stance": {
      "politics": "zhiyuan",
      "credibility": 4
    },
    "eraRange": [
      1937,
      1941
    ]
  },
  {
    "id": "paper-minzhu",
    "name": "民主报",
    "city": "guangzhou",
    "stance": {
      "politics": "guomin",
      "credibility": 3
    },
    "eraRange": [
      1945,
      1947
    ]
  }
].map((r) => NewspaperSchema.parse(r)))
