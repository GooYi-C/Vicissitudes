// src/data/events.ts — L0-15 事件表（骨架期 12 条；内容期补至规模锚 32）
import type { EventDef } from '../validation/dataSchemas'
import { EventDefSchema } from '../validation/dataSchemas'

export const events: readonly EventDef[] = Object.freeze([
  {
    "id": "evt-street-gambling",
    "title": "街头牌局",
    "desc": "巷口有人摆开了牌九，庄家皮笑肉不笑地招呼围观的人。",
    "tags": [
      "society"
    ],
    "weight": 30,
    "cooldownMonths": 3,
    "when": {
      "eras": [
        [
          1921,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "坐下摸两把",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -5
            }
          }
        ]
      },
      {
        "text": "摇头走开",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-rickshaw-fare",
    "title": "黄包车风波",
    "desc": "车夫蹲在路边抹汗，坐车的先生正指着鼻子骂街。",
    "tags": [
      "society"
    ],
    "weight": 25,
    "cooldownMonths": 2,
    "when": {
      "eras": [
        [
          1921,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "替车夫说句公道话",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 1
            }
          }
        ]
      },
      {
        "text": "看热闹，不多嘴",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-militia-levy",
    "title": "乱兵拉夫",
    "desc": "一队溃兵进了街，见人就抓丁挑担子。",
    "tags": [
      "war"
    ],
    "weight": 35,
    "cooldownMonths": 6,
    "when": {
      "eras": [
        [
          1921,
          1937
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "给点钱打发",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -10
            }
          }
        ]
      },
      {
        "text": "绕小巷躲开",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-rice-panic",
    "title": "米荒抢购",
    "desc": "城里风传米要断市，米店门口排起了长龙。",
    "tags": [
      "economy"
    ],
    "weight": 40,
    "cooldownMonths": 4,
    "when": {
      "eras": [
        [
          1921,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "跟风囤两担米",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -24
            }
          }
        ]
      },
      {
        "text": "按兵不动",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-student-parade",
    "title": "学潮过街",
    "desc": "学生们举着旗子从校门涌出来，口号声震得窗户嗡嗡响。",
    "tags": [
      "uprising",
      "culture"
    ],
    "weight": 45,
    "cooldownMonths": 5,
    "when": {
      "eras": [
        [
          1921,
          1937
        ],
        [
          1945,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "跟着走一段",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 1
            }
          }
        ]
      },
      {
        "text": "站在路边看",
        "effects": []
      },
      {
        "text": "绕道走，别惹事",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-neighbor-fire",
    "title": "邻街失火",
    "desc": "半夜锣声大作，邻街的铺面着了火，火光映红了半条街。",
    "tags": [
      "disaster"
    ],
    "weight": 30,
    "cooldownMonths": 8,
    "when": {
      "eras": [
        [
          1921,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "提桶去帮忙救火",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 2
            }
          }
        ]
      },
      {
        "text": "守着自己的铺子",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-silver-storm",
    "title": "银元风潮",
    "desc": "市面上银根突然收紧，钱庄门口挤满了兑银元的人。",
    "tags": [
      "economy"
    ],
    "weight": 35,
    "cooldownMonths": 6,
    "when": {
      "eras": [
        [
          1935,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "赶紧把手里的纸钞换成银元",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": 5
            }
          }
        ]
      },
      {
        "text": "静观其变",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-teahouse-debate",
    "title": "茶馆论政",
    "desc": "茶馆里两拨人为了时局吵得脸红脖子粗，掌柜的直作揖。",
    "tags": [
      "culture",
      "politics"
    ],
    "weight": 28,
    "cooldownMonths": 2,
    "when": {
      "eras": [
        [
          1921,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "插一句自己的看法",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 1
            }
          }
        ]
      },
      {
        "text": "喝茶，听戏",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-boat-ticket",
    "title": "船票难求",
    "desc": "码头上等船的人排到街尾，黄牛在人群里穿梭喊价。",
    "tags": [
      "society",
      "economy"
    ],
    "weight": 30,
    "cooldownMonths": 3,
    "when": {
      "eras": [
        [
          1937,
          1945
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "多花点钱买黄牛票",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -15
            }
          }
        ]
      },
      {
        "text": "老老实实排队",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-air-raid",
    "title": "空袭警报",
    "desc": "凄厉的警报声响起来，街上的人瞬间跑散，防空洞口挤成一团。",
    "tags": [
      "war"
    ],
    "weight": 50,
    "cooldownMonths": 10,
    "when": {
      "eras": [
        [
          1937,
          1945
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "就近进防空洞",
        "effects": []
      },
      {
        "text": "帮着扶老人孩子",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 2
            }
          }
        ]
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-goods-check",
    "title": "关卡盘查",
    "desc": "城门口的哨兵把你的货翻了个底朝天，眼神不善。",
    "tags": [
      "war",
      "economy"
    ],
    "weight": 32,
    "cooldownMonths": 4,
    "when": {
      "eras": [
        [
          1937,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "塞点烟钱",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -8
            }
          }
        ]
      },
      {
        "text": "亮出证件讲理",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "evt-night-knock",
    "title": "深夜叩门",
    "desc": "半夜有人急促地敲门，声音压得很低：开门，自己人。",
    "tags": [
      "politics"
    ],
    "weight": 38,
    "cooldownMonths": 8,
    "when": {
      "eras": [
        [
          1927,
          1949
        ]
      ],
      "cities": [],
      "requires": [],
      "requiresForces": []
    },
    "options": [
      {
        "text": "开门",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 1
            }
          }
        ]
      },
      {
        "text": "吹灯装睡",
        "effects": []
      }
    ],
    "followUp": null
  }
].map((r) => EventDefSchema.parse(r)))
