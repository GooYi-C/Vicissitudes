// src/data/transport.ts — L0-05 交通表（20 条含 5 exit；图连通性 DAT-09 构造期已验）
import type { TransportLine } from '../validation/dataSchemas'
import { TransportLineSchema } from '../validation/dataSchemas'

export const transport: readonly TransportLine[] = Object.freeze([
  {
    "id": "line-bj-sh",
    "from": "beijing",
    "to": "shanghai",
    "kind": "rail",
    "days": 3,
    "baseCost": 15
  },
  {
    "id": "line-bj-tj",
    "from": "beijing",
    "to": "tianjin",
    "kind": "rail",
    "days": 1,
    "baseCost": 3
  },
  {
    "id": "line-tj-sh",
    "from": "tianjin",
    "to": "shanghai",
    "kind": "water",
    "days": 4,
    "baseCost": 10
  },
  {
    "id": "line-sh-hz",
    "from": "shanghai",
    "to": "hangzhou",
    "kind": "rail",
    "days": 1,
    "baseCost": 4
  },
  {
    "id": "line-sh-nj",
    "from": "shanghai",
    "to": "nanjing",
    "kind": "rail",
    "days": 2,
    "baseCost": 8
  },
  {
    "id": "line-nj-wh",
    "from": "nanjing",
    "to": "wuhan",
    "kind": "water",
    "days": 4,
    "baseCost": 12
  },
  {
    "id": "line-wh-cd",
    "from": "wuhan",
    "to": "chengdu",
    "kind": "water",
    "days": 12,
    "baseCost": 25
  },
  {
    "id": "line-wh-gz",
    "from": "wuhan",
    "to": "guangzhou",
    "kind": "rail",
    "days": 4,
    "baseCost": 18
  },
  {
    "id": "line-gz-hk",
    "from": "guangzhou",
    "to": "hongkong",
    "kind": "rail",
    "days": 1,
    "baseCost": 6
  },
  {
    "id": "line-hk-macau",
    "from": "hongkong",
    "to": "macau",
    "kind": "water",
    "days": 1,
    "baseCost": 2
  },
  {
    "id": "line-tj-dl",
    "from": "tianjin",
    "to": "dalian",
    "kind": "water",
    "days": 2,
    "baseCost": 8
  },
  {
    "id": "line-dl-shenyang",
    "from": "dalian",
    "to": "shenyang",
    "kind": "rail",
    "days": 2,
    "baseCost": 7
  },
  {
    "id": "line-shenyang-hb",
    "from": "shenyang",
    "to": "harbin",
    "kind": "rail",
    "days": 3,
    "baseCost": 10
  },
  {
    "id": "line-xian-cd",
    "from": "xian",
    "to": "chengdu",
    "kind": "road",
    "days": 8,
    "baseCost": 15
  },
  {
    "id": "line-nj-xian",
    "from": "nanjing",
    "to": "xian",
    "kind": "rail",
    "days": 2,
    "baseCost": 14
  },
  {
    "id": "line-bj-xian",
    "from": "beijing",
    "to": "xian",
    "kind": "rail",
    "days": 1,
    "baseCost": 16
  },
  {
    "id": "line-exit-sh",
    "from": "shanghai",
    "to": "hongkong",
    "kind": "exit",
    "days": 5,
    "baseCost": 40
  },
  {
    "id": "line-exit-tj",
    "from": "tianjin",
    "to": "dalian",
    "kind": "exit",
    "days": 3,
    "baseCost": 30
  },
  {
    "id": "line-exit-gz",
    "from": "guangzhou",
    "to": "hongkong",
    "kind": "exit",
    "days": 1,
    "baseCost": 20
  },
  {
    "id": "line-exit-bj",
    "from": "beijing",
    "to": "tianjin",
    "kind": "exit",
    "days": 1,
    "baseCost": 25
  },
  {
    "id": "line-exit-hz",
    "from": "hangzhou",
    "to": "shanghai",
    "kind": "exit",
    "days": 2,
    "baseCost": 18
  }
].map((r) => TransportLineSchema.parse(r)))
