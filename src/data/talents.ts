// src/data/talents.ts — L0-03 天赋表（15 条；effects 全过受限指令集 DAT-08）
import type { Talent } from '../validation/dataSchemas'
import { TalentSchema } from '../validation/dataSchemas'

export const talents: readonly Talent[] = Object.freeze([
  {
    "id": "talent-haggle",
    "name": "讨价还价",
    "desc": "市集摸爬滚打练出的嘴皮子",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "haggle",
          "value": 1
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-streetwise",
    "name": "市井耳目",
    "desc": "三教九流都有熟人",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "streetwise",
          "value": 1
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-iron-gut",
    "name": "铁打的胃",
    "desc": "糙米霉面也能下咽",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "health",
          "value": 5
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-silver-tongue",
    "name": "三寸不烂舌",
    "desc": "说话能把死人说活",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "persuasion",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": [
      "talent-streetwise"
    ]
  },
  {
    "id": "talent-night-owl",
    "name": "夜猫子",
    "desc": "后半夜才是正经干活的时候",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "nightOwl",
          "value": 1
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-abacus",
    "name": "一手好算盘",
    "desc": "账目过目不忘",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "accounting",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-pistol",
    "name": "盒子炮",
    "desc": "枪法在乱世人手里是硬道理",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "marksmanship",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-first-aid",
    "name": "战地急救",
    "desc": "白布条和碘酒能救命",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "firstAid",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-calligraphy",
    "name": "一笔好字",
    "desc": "状纸招牌都写得漂亮",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "calligraphy",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-english",
    "name": "洋泾浜",
    "desc": "能跟洋行买办搭上话",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "english",
          "value": 1
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-herbal",
    "name": "草药方",
    "desc": "山里采的方子治穷病",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "herbalism",
          "value": 1
        }
      }
    ],
    "mutuallyExclusiveWith": [
      "talent-first-aid"
    ]
  },
  {
    "id": "talent-gambling",
    "name": "牌桌老手",
    "desc": "骰子落手心里有数",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "gambling",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": [
      "talent-haggle"
    ]
  },
  {
    "id": "talent-scout",
    "name": "腿脚勤",
    "desc": "消息总比报纸快半天",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "scouting",
          "value": 1
        }
      }
    ],
    "mutuallyExclusiveWith": []
  },
  {
    "id": "talent-black-market",
    "name": "黑道门路",
    "desc": "灰市里的路子比官道宽",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "blackMarket",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": [
      "talent-streetwise"
    ]
  },
  {
    "id": "talent-luck",
    "name": "福大命大",
    "desc": "枪子儿都绕着走",
    "effects": [
      {
        "op": "modifyPlayer",
        "args": {
          "field": "luck",
          "value": 2
        }
      }
    ],
    "mutuallyExclusiveWith": []
  }
].map((r) => TalentSchema.parse(r)))
