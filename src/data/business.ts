// src/data/business.ts — L0-07 实业表（8 条；consumes 链 DAG 无环 DAT-11；报馆 produces 留空）
import type { Business } from '../validation/dataSchemas'
import { BusinessSchema } from '../validation/dataSchemas'

export const business: readonly Business[] = Object.freeze([
  {
    "id": "biz-textile",
    "name": "纱厂",
    "produces": [
      "cmd-cloth"
    ],
    "consumes": [
      "cmd-cotton"
    ],
    "capitalMin": 80,
    "desc": "纺纱织布，实业救国"
  },
  {
    "id": "biz-flour",
    "name": "面粉厂",
    "produces": [
      "cmd-grain"
    ],
    "consumes": [
      "cmd-grain"
    ],
    "capitalMin": 50,
    "desc": "民以食为天"
  },
  {
    "id": "biz-match",
    "name": "火柴厂",
    "produces": [
      "cmd-matches"
    ],
    "consumes": [
      "cmd-timber"
    ],
    "capitalMin": 30,
    "desc": "洋火也能国货"
  },
  {
    "id": "biz-tobacco",
    "name": "卷烟厂",
    "produces": [
      "cmd-cigarette"
    ],
    "consumes": [
      "cmd-timber"
    ],
    "capitalMin": 60,
    "desc": "烟酒专营利厚"
  },
  {
    "id": "biz-tungoil",
    "name": "桐油行",
    "produces": [
      "cmd-tungoil"
    ],
    "consumes": [],
    "capitalMin": 40,
    "desc": "出口大宗"
  },
  {
    "id": "biz-pharmacy",
    "name": "西药房",
    "produces": [
      "cmd-medicine"
    ],
    "consumes": [],
    "capitalMin": 35,
    "desc": "战时比黄金贵"
  },
  {
    "id": "biz-shipping",
    "name": "轮船行",
    "produces": [],
    "consumes": [
      "cmd-coal",
      "cmd-kerosene"
    ],
    "capitalMin": 100,
    "desc": "长江水路的命脉"
  },
  {
    "id": "biz-newspaper",
    "name": "报馆",
    "produces": [],
    "consumes": [],
    "capitalMin": 45,
    "desc": "自办报馆暂缓（§0.3-E8：produces 留空占位）"
  }
].map((r) => BusinessSchema.parse(r)))
