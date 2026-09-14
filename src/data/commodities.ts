// src/data/commodities.ts — L0-06 商品表（18 条；basePrice ↔ systemPrompt 物价锚同源 DAT-10）
import type { Commodity } from '../validation/dataSchemas'
import { CommoditySchema } from '../validation/dataSchemas'

// 物价锚表（systemPrompt 同源单点；DAT-10 防两表漂移的唯一事实源 = 本表）
export const PRICE_ANCHORS: Readonly<Record<string, number>> = Object.freeze({
  'cmd-grain': 12,
  'cmd-cotton': 35,
  'cmd-salt': 8,
  'cmd-iron': 45,
  'cmd-silk': 120,
  'cmd-tea': 28,
  'cmd-opium': 300,
  'cmd-timber': 15,
  'cmd-wool': 22,
  'cmd-coal': 6,
  'cmd-kerosene': 40,
  'cmd-cloth': 25,
  'cmd-medicine': 150,
  'cmd-matches': 3,
  'cmd-cigarette': 18,
  'cmd-porcelain': 60,
  'cmd-paper': 10,
  'cmd-tungoil': 50,
})

export const commodities: readonly Commodity[] = Object.freeze([
  {
    "id": "cmd-grain",
    "name": "大米",
    "basePrice": 12,
    "unit": "担",
    "resourceMapped": true
  },
  {
    "id": "cmd-cotton",
    "name": "棉花",
    "basePrice": 35,
    "unit": "担",
    "resourceMapped": true
  },
  {
    "id": "cmd-salt",
    "name": "原盐",
    "basePrice": 8,
    "unit": "担",
    "resourceMapped": false
  },
  {
    "id": "cmd-iron",
    "name": "生铁",
    "basePrice": 45,
    "unit": "担",
    "resourceMapped": true
  },
  {
    "id": "cmd-silk",
    "name": "生丝",
    "basePrice": 120,
    "unit": "担",
    "resourceMapped": true
  },
  {
    "id": "cmd-tea",
    "name": "茶叶",
    "basePrice": 28,
    "unit": "担",
    "resourceMapped": true
  },
  {
    "id": "cmd-opium",
    "name": "鸦片",
    "basePrice": 300,
    "unit": "箱",
    "resourceMapped": true
  },
  {
    "id": "cmd-timber",
    "name": "木材",
    "basePrice": 15,
    "unit": "方",
    "resourceMapped": true
  },
  {
    "id": "cmd-wool",
    "name": "羊毛",
    "basePrice": 22,
    "unit": "担",
    "resourceMapped": false
  },
  {
    "id": "cmd-coal",
    "name": "煤炭",
    "basePrice": 6,
    "unit": "吨",
    "resourceMapped": true
  },
  {
    "id": "cmd-kerosene",
    "name": "煤油",
    "basePrice": 40,
    "unit": "桶",
    "resourceMapped": false
  },
  {
    "id": "cmd-cloth",
    "name": "棉布",
    "basePrice": 25,
    "unit": "匹",
    "resourceMapped": false
  },
  {
    "id": "cmd-medicine",
    "name": "西药",
    "basePrice": 150,
    "unit": "箱",
    "resourceMapped": false
  },
  {
    "id": "cmd-matches",
    "name": "火柴",
    "basePrice": 3,
    "unit": "箱",
    "resourceMapped": false
  },
  {
    "id": "cmd-cigarette",
    "name": "香烟",
    "basePrice": 18,
    "unit": "箱",
    "resourceMapped": false
  },
  {
    "id": "cmd-porcelain",
    "name": "瓷器",
    "basePrice": 60,
    "unit": "担",
    "resourceMapped": false
  },
  {
    "id": "cmd-paper",
    "name": "纸张",
    "basePrice": 10,
    "unit": "令",
    "resourceMapped": false
  },
  {
    "id": "cmd-tungoil",
    "name": "桐油",
    "basePrice": 50,
    "unit": "担",
    "resourceMapped": true
  }
].map((r) => CommoditySchema.parse(r)))
