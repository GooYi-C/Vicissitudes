// src/data/timeline.ts — L0-08 史实时间线（骨架期 29 条核心节点；内容期补至规模锚 58）
import type { TimelineEntry } from '../validation/dataSchemas'
import { TimelineEntrySchema } from '../validation/dataSchemas'

export const timeline: readonly TimelineEntry[] = Object.freeze([
  {
    "id": "tl-192107-founding",
    "date": "1921-07-01",
    "title": "中共建党",
    "themes": [
      "politics",
      "uprising"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192204-zhifeng-war",
    "date": "1922-04-01",
    "title": "第一次直奉战争",
    "themes": [
      "war"
    ],
    "windowMonths": 4,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192409-jiangzhe",
    "date": "1924-09-01",
    "title": "江浙战争",
    "themes": [
      "war",
      "politics"
    ],
    "windowMonths": 3,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192505-may30",
    "date": "1925-05-30",
    "title": "五卅惨案",
    "themes": [
      "uprising",
      "politics"
    ],
    "windowMonths": 8,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192607-northern",
    "date": "1926-07-01",
    "title": "北伐开始",
    "themes": [
      "war"
    ],
    "windowMonths": 12,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192704-qingming",
    "date": "1927-04-12",
    "title": "四一二事变",
    "themes": [
      "politics",
      "war"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192708-nanchang",
    "date": "1927-08-01",
    "title": "南昌起义",
    "themes": [
      "uprising",
      "war"
    ],
    "windowMonths": 5,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192806-huanggutun",
    "date": "1928-06-04",
    "title": "皇姑屯事件",
    "themes": [
      "politics",
      "war"
    ],
    "windowMonths": 4,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-192812-flag",
    "date": "1928-12-29",
    "title": "东北易帜",
    "themes": [
      "politics"
    ],
    "windowMonths": 5,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193005-central-plains",
    "date": "1930-05-01",
    "title": "中原大战",
    "themes": [
      "war"
    ],
    "windowMonths": 8,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193109-manchuria",
    "date": "1931-09-18",
    "title": "九一八事变",
    "themes": [
      "war",
      "politics"
    ],
    "windowMonths": 12,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-19320128-shanghai-war",
    "date": "1932-01-28",
    "title": "一二八淞沪抗战",
    "themes": [
      "war"
    ],
    "windowMonths": 5,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193410-longmarch",
    "date": "1934-10-01",
    "title": "红军长征",
    "themes": [
      "war",
      "uprising"
    ],
    "windowMonths": 12,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193512-yijiu",
    "date": "1935-12-09",
    "title": "一二九运动",
    "themes": [
      "uprising",
      "culture"
    ],
    "windowMonths": 4,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193612-xian",
    "date": "1936-12-12",
    "title": "西安事变",
    "themes": [
      "politics"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193707-lugou",
    "date": "1937-07-07",
    "title": "卢沟桥事变",
    "themes": [
      "war"
    ],
    "windowMonths": 10,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193712-nanjing",
    "date": "1937-12-13",
    "title": "南京陷落",
    "themes": [
      "war",
      "disaster"
    ],
    "windowMonths": 8,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-193803-taierzhuang",
    "date": "1938-03-16",
    "title": "台儿庄大捷",
    "themes": [
      "war"
    ],
    "windowMonths": 4,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194008-hundred-regiments",
    "date": "1940-08-20",
    "title": "百团大战",
    "themes": [
      "war"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194101-wannan",
    "date": "1941-01-04",
    "title": "皖南事变",
    "themes": [
      "politics",
      "war"
    ],
    "windowMonths": 5,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194205-zuoyi",
    "date": "1942-05-01",
    "title": "左权殉国",
    "themes": [
      "war"
    ],
    "windowMonths": 3,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194404-yuxiang",
    "date": "1944-04-01",
    "title": "豫湘桂会战",
    "themes": [
      "war"
    ],
    "windowMonths": 8,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194508-victory",
    "date": "1945-08-15",
    "title": "日本投降",
    "themes": [
      "war",
      "politics"
    ],
    "windowMonths": 10,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194606-civilwar",
    "date": "1946-06-01",
    "title": "全面内战爆发",
    "themes": [
      "war"
    ],
    "windowMonths": 8,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194809-liaoshen",
    "date": "1948-09-01",
    "title": "辽沈战役",
    "themes": [
      "war"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194811-huaihai",
    "date": "1948-11-01",
    "title": "淮海战役",
    "themes": [
      "war"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194901-beiping",
    "date": "1949-01-31",
    "title": "北平和平解放",
    "themes": [
      "politics"
    ],
    "windowMonths": 5,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194904-crossing",
    "date": "1949-04-21",
    "title": "渡江战役",
    "themes": [
      "war"
    ],
    "windowMonths": 4,
    "intervene": {
      "requires": []
    }
  },
  {
    "id": "tl-194910-founding-prc",
    "date": "1949-10-01",
    "title": "开国大典",
    "themes": [
      "politics"
    ],
    "windowMonths": 6,
    "intervene": {
      "requires": []
    }
  }
].map((r) => TimelineEntrySchema.parse(r)))
