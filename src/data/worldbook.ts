// src/data/worldbook.ts — L0-12 世界书（骨架期 12 条核心词条；内容期补至规模锚 36）
import type { WorldbookEntry } from '../validation/dataSchemas'
import { WorldbookEntrySchema } from '../validation/dataSchemas'

export const worldbook: readonly WorldbookEntry[] = Object.freeze([
  {
    "id": "wb-warlord-politics",
    "title": "北洋政局",
    "tags": [
      "politics"
    ],
    "content": "北洋政府名存实亡，实际权力在各省督军手中。总统府和国务院的政争从未停歇，内阁平均存续不过半年。"
  },
  {
    "id": "wb-treaty-ports",
    "title": "租界格局",
    "tags": [
      "politics",
      "diplomacy"
    ],
    "content": "上海公共租界、法租界、天津九国租界——国中之国。治外法权庇护下，冒险家和逃犯都往这里跑。"
  },
  {
    "id": "wb-currency-chaos",
    "title": "币制乱象",
    "tags": [
      "economy"
    ],
    "content": "银元、铜元、纸币并行，各军阀滥发军用票。银元成色还分袁大头、龙洋、鹰洋，贴水各不相同。"
  },
  {
    "id": "wb-new-culture",
    "title": "新文化运动",
    "tags": [
      "culture"
    ],
    "content": "白话文、德先生、赛先生。青年学生读《新青年》，剪辫子，进学堂，反抗包办婚姻。"
  },
  {
    "id": "wb-gangland",
    "title": "帮会生态",
    "tags": [
      "society"
    ],
    "content": "青帮、洪门遍及码头与租界。杜月笙、黄金荣的名字，比很多督军更好使。帮会有帮会的规矩。"
  },
  {
    "id": "wb-railways",
    "title": "铁路命脉",
    "tags": [
      "economy",
      "war"
    ],
    "content": "平汉、津浦、京奉、陇海——铁路即兵线。谁控制了枢纽站，谁就握住了调兵的钥匙。"
  },
  {
    "id": "wb-foreign-powers",
    "title": "列强在华",
    "tags": [
      "diplomacy"
    ],
    "content": "英日美法各怀心思：日本步步紧逼，英美要市场，苏联输出革命。以夷制夷是老手艺，也是走钢丝。"
  },
  {
    "id": "wb-red-movement",
    "title": "红色火种",
    "tags": [
      "politics",
      "uprising"
    ],
    "content": "从建党到建军，根据地在夹缝中生长。城市地下工作与农村包围城市，两条战线同样凶险。"
  },
  {
    "id": "wb-famine-years",
    "title": "灾荒频仍",
    "tags": [
      "disaster",
      "society"
    ],
    "content": "军阀混战加天灾，1920-1921北方五省大旱，1928-1930西北大饥荒。赈灾常常变成发财的生意。"
  },
  {
    "id": "wb-press-wars",
    "title": "报业江湖",
    "tags": [
      "culture"
    ],
    "content": "《申报》《大公报》《新闻报》各据一方，有风骨的报人用命换真相，也有的拿津贴写软文。"
  },
  {
    "id": "wb-opium-economy",
    "title": "鸦片经济",
    "tags": [
      "economy"
    ],
    "content": "禁烟条例与特税局并存。西南军阀靠烟税养兵，上海滩的烟土行有巡捕房的保护伞。"
  },
  {
    "id": "wb-migrant-life",
    "title": "闯荡者们",
    "tags": [
      "society"
    ],
    "content": "这个年代人口流动空前：闯关东、走西口、下南洋，还有涌向上海的百万苏北人。离乡的人都在赌一个活法。"
  }
].map((r) => WorldbookEntrySchema.parse(r)))
