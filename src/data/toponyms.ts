// src/data/toponyms.ts — L0-10 地名词表（骨架期核心省份；内容期补至规模锚 311 第一圈）
import type { Toponym } from '../validation/dataSchemas'
import { ToponymSchema } from '../validation/dataSchemas'

export const toponyms: readonly Toponym[] = Object.freeze([
  {
    "id": "topo-beijing",
    "provinceId": "vic.beijing",
    "name": "北京",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-jiangsu",
    "provinceId": "vic.jiangsu",
    "name": "江苏",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-zhili",
    "provinceId": "vic.zhili",
    "name": "直隶",
    "from": "1921-01-01",
    "to": "1928-06-30"
  },
  {
    "id": "topo-zhili-hebei",
    "provinceId": "vic.zhili",
    "name": "河北",
    "from": "1928-07-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-hubei",
    "provinceId": "vic.hubei",
    "name": "湖北",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-guangdong",
    "provinceId": "vic.guangdong",
    "name": "广东",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-zhejiang",
    "provinceId": "vic.zhejiang",
    "name": "浙江",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-sichuan",
    "provinceId": "vic.sichuan",
    "name": "四川",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-shaanxi",
    "provinceId": "vic.shaanxi",
    "name": "陕西",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-fengtian",
    "provinceId": "vic.fengtian",
    "name": "奉天",
    "from": "1921-01-01",
    "to": "1929-01-19"
  },
  {
    "id": "topo-fengtian-liaoning",
    "provinceId": "vic.fengtian",
    "name": "辽宁",
    "from": "1929-01-20",
    "to": "1949-12-31"
  },
  {
    "id": "topo-shandong",
    "provinceId": "vic.shandong",
    "name": "山东",
    "from": "1921-01-01",
    "to": "1949-12-31"
  },
  {
    "id": "topo-shanxi",
    "provinceId": "vic.shanxi",
    "name": "山西",
    "from": "1921-01-01",
    "to": "1949-12-31"
  }
].map((r) => ToponymSchema.parse(r)))
