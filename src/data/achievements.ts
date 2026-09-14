// src/data/achievements.ts — L0-14 成就表（17 条；id 冻结级——跨档保留不得改名）
import type { Achievement } from '../validation/dataSchemas'
import { AchievementSchema } from '../validation/dataSchemas'

export const achievements: readonly Achievement[] = Object.freeze([
  {
    "id": "ach-survive-one-year",
    "name": "乱世苟全",
    "condition": "同一身份存活满 12 个月",
    "desc": "在民国活过一年，就是本事。"
  },
  {
    "id": "ach-first-thousand",
    "name": "第一桶金",
    "condition": "身家达到 1000 银元",
    "desc": "乱世财，快快来。"
  },
  {
    "id": "ach-ten-thousand",
    "name": "家财万贯",
    "condition": "身家达到 10000 银元",
    "desc": "上海滩的门槛，摸到了。"
  },
  {
    "id": "ach-five-cities",
    "name": "行商万里",
    "condition": "到访 5 座核心城市",
    "desc": "读万卷书，行万里路。"
  },
  {
    "id": "ach-all-cities",
    "name": "九州足迹",
    "condition": "到访全部 10 座核心城市",
    "desc": "从奉天到广州，你都走过了。"
  },
  {
    "id": "ach-first-estate",
    "name": "实业起步",
    "condition": "创办第一家企业",
    "desc": "实业救国，从一家厂开始。"
  },
  {
    "id": "ach-industry-tycoon",
    "name": "实业巨头",
    "condition": "同时经营 3 家企业",
    "desc": "你的名字上了报纸的商情版。"
  },
  {
    "id": "ach-deep-reading",
    "name": "手不释卷",
    "condition": "细读 10 份旧报",
    "desc": "报纸是乱世的日记。"
  },
  {
    "id": "ach-clipping-collection",
    "name": "剪报成册",
    "condition": "收藏 20 条剪报",
    "desc": "剪下的都是时代的碎片。"
  },
  {
    "id": "ach-memory-hundred",
    "name": "百年记忆",
    "condition": "记忆库累积 100 条",
    "desc": "好记性不如烂笔头。"
  },
  {
    "id": "ach-promise-keeper",
    "name": "一诺千金",
    "condition": "兑现 10 个约定",
    "desc": "在民国，守信比黄金贵。"
  },
  {
    "id": "ach-grudge-settled",
    "name": "快意恩仇",
    "condition": "了结 3 笔旧账",
    "desc": "出来混，迟早要还。"
  },
  {
    "id": "ach-street-talk",
    "name": "街谈巷议",
    "condition": "经历 10 次街谈处境",
    "desc": "市井的声音，你也算一份。"
  },
  {
    "id": "ach-model-proposal",
    "name": "说书人",
    "condition": "经历 1 次模型提议处境",
    "desc": "故事自己长出了枝杈。"
  },
  {
    "id": "ach-time-traveler",
    "name": "平行时空",
    "condition": "触发客串彩蛋",
    "desc": "似曾相识的来客。"
  },
  {
    "id": "ach-death-epitaph",
    "name": "盖棺论定",
    "condition": "完成一次死亡结算（讣告生成）",
    "desc": "这一生，被写成了一篇讣告。"
  },
  {
    "id": "ach-full-life",
    "name": "完整一生",
    "condition": "从开局活到 1949 年 12 月",
    "desc": "你把整个民国走完了。"
  }
].map((r) => AchievementSchema.parse(r)))
