// src/data/situationTemplates.ts — L0-16 处境模板表（骨架期 8 条；内容期补至规模锚 19；合池权重 0.5×）
import type { SituationTemplate } from '../validation/dataSchemas'
import { SituationTemplateSchema } from '../validation/dataSchemas'

export const situationTemplates: readonly SituationTemplate[] = Object.freeze([
  {
    "id": "tmpl-illness",
    "title": "风寒侵体",
    "desc": "换季的风一阵冷一阵热，你嗓子发紧额头滚烫。",
    "tags": [
      "society"
    ],
    "weight": 20,
    "cooldownMonths": 6,
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
        "text": "请郎中开药",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -6
            }
          },
          {
            "op": "modifyPlayer",
            "args": {
              "field": "health",
              "value": 5
            }
          }
        ]
      },
      {
        "text": "硬扛",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "health",
              "value": -5
            }
          }
        ]
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-pickpocket",
    "title": "扒手光顾",
    "desc": "人潮里一只手飞快地探进你的衣袋。",
    "tags": [
      "society"
    ],
    "weight": 22,
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
        "text": "当场抓住",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": 3
            }
          },
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
        "text": "自认倒霉",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -8
            }
          }
        ]
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-old-debt",
    "title": "旧账上门",
    "desc": "一个熟面孔堵在你门口，笑得不怀好意：老兄，那笔钱该还了。",
    "tags": [
      "society",
      "economy"
    ],
    "weight": 25,
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
        "text": "还钱",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -20
            }
          }
        ]
      },
      {
        "text": "求宽限",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-press-sale",
    "title": "报童叫卖",
    "desc": "报童挥着当天的报纸喊头条，嗓子都哑了。",
    "tags": [
      "society",
      "culture"
    ],
    "weight": 30,
    "cooldownMonths": 1,
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
        "text": "买一份",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -1
            }
          }
        ]
      },
      {
        "text": "不买",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-market-quarrel",
    "title": "市口争执",
    "desc": "你跟摊主为了价钱吵得不可开交，围观的人开始起哄。",
    "tags": [
      "society"
    ],
    "weight": 26,
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
        "text": "各退一步",
        "effects": []
      },
      {
        "text": "争到底",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 1
            }
          }
        ]
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-night-patrol",
    "title": "宵禁夜巡",
    "desc": "宵禁后的街面上传来皮靴声，手电的光柱扫过窗棂。",
    "tags": [
      "war",
      "politics"
    ],
    "weight": 28,
    "cooldownMonths": 5,
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
        "text": "熄灯静卧",
        "effects": []
      },
      {
        "text": "从后窗看一眼",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "streetwise",
              "value": 1
            }
          }
        ]
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-charity",
    "title": "善堂募捐",
    "desc": "善堂的人在街口设了桌子，为灾民募捐，账本摊在明面上。",
    "tags": [
      "society"
    ],
    "weight": 24,
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
        "text": "捐一点",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "money",
              "value": -5
            }
          },
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
        "text": "走过去",
        "effects": []
      }
    ],
    "followUp": null
  },
  {
    "id": "tmpl-stray-letter",
    "title": "无主书信",
    "desc": "你捡到一封信，火漆完好，落款是个没听过的名字。",
    "tags": [
      "society",
      "politics"
    ],
    "weight": 22,
    "cooldownMonths": 6,
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
        "text": "拆开看",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "streetwise",
              "value": 1
            }
          }
        ]
      },
      {
        "text": "按地址物归原主",
        "effects": [
          {
            "op": "modifyPlayer",
            "args": {
              "field": "reputation",
              "value": 1
            }
          }
        ]
      }
    ],
    "followUp": null
  }
].map((r) => SituationTemplateSchema.parse(r)))
