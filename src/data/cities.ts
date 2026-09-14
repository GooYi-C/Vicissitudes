// src/data/cities.ts — L0-04 城市表（10 isCore + 4 isOverseasPort；六维 ∈ [0,100]）
import type { City } from '../validation/dataSchemas'
import { CitySchema } from '../validation/dataSchemas'

export const cities: readonly City[] = Object.freeze([
  {
    "id": "beijing",
    "name": "北京",
    "provinceId": "vic.beijing",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-grain",
    "dims": {
      "economy": 70,
      "security": 50,
      "culture": 85,
      "transport": 75,
      "industry": 55,
      "population": 90
    }
  },
  {
    "id": "shanghai",
    "name": "上海",
    "provinceId": "vic.jiangsu",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-cotton",
    "dims": {
      "economy": 95,
      "security": 60,
      "culture": 90,
      "transport": 95,
      "industry": 85,
      "population": 95
    }
  },
  {
    "id": "tianjin",
    "name": "天津",
    "provinceId": "vic.zhili",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-salt",
    "dims": {
      "economy": 80,
      "security": 55,
      "culture": 60,
      "transport": 85,
      "industry": 75,
      "population": 80
    }
  },
  {
    "id": "wuhan",
    "name": "武汉",
    "provinceId": "vic.hubei",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-iron",
    "dims": {
      "economy": 75,
      "security": 45,
      "culture": 65,
      "transport": 90,
      "industry": 70,
      "population": 78
    }
  },
  {
    "id": "guangzhou",
    "name": "广州",
    "provinceId": "vic.guangdong",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-silk",
    "dims": {
      "economy": 82,
      "security": 52,
      "culture": 72,
      "transport": 80,
      "industry": 68,
      "population": 75
    }
  },
  {
    "id": "nanjing",
    "name": "南京",
    "provinceId": "vic.jiangsu",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-grain",
    "dims": {
      "economy": 72,
      "security": 70,
      "culture": 78,
      "transport": 72,
      "industry": 60,
      "population": 70
    }
  },
  {
    "id": "hangzhou",
    "name": "杭州",
    "provinceId": "vic.zhejiang",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-tea",
    "dims": {
      "economy": 65,
      "security": 60,
      "culture": 80,
      "transport": 65,
      "industry": 50,
      "population": 60
    }
  },
  {
    "id": "chengdu",
    "name": "成都",
    "provinceId": "vic.sichuan",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-grain",
    "dims": {
      "economy": 55,
      "security": 55,
      "culture": 70,
      "transport": 40,
      "industry": 35,
      "population": 72
    }
  },
  {
    "id": "xian",
    "name": "西安",
    "provinceId": "vic.shaanxi",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-wool",
    "dims": {
      "economy": 45,
      "security": 40,
      "culture": 75,
      "transport": 50,
      "industry": 30,
      "population": 58
    }
  },
  {
    "id": "shenyang",
    "name": "沈阳",
    "provinceId": "vic.fengtian",
    "isCore": true,
    "isOverseasPort": false,
    "specialty": "cmd-iron",
    "dims": {
      "economy": 68,
      "security": 48,
      "culture": 50,
      "transport": 70,
      "industry": 80,
      "population": 65
    }
  },
  {
    "id": "hongkong",
    "name": "香港",
    "provinceId": "vic.overseas",
    "isCore": false,
    "isOverseasPort": true,
    "specialty": "cmd-opium",
    "dims": {
      "economy": 88,
      "security": 75,
      "culture": 60,
      "transport": 90,
      "industry": 50,
      "population": 70
    }
  },
  {
    "id": "macau",
    "name": "澳门",
    "provinceId": "vic.overseas",
    "isCore": false,
    "isOverseasPort": true,
    "specialty": "cmd-opium",
    "dims": {
      "economy": 60,
      "security": 70,
      "culture": 45,
      "transport": 55,
      "industry": 20,
      "population": 30
    }
  },
  {
    "id": "dalian",
    "name": "大连",
    "provinceId": "vic.overseas",
    "isCore": false,
    "isOverseasPort": true,
    "specialty": "cmd-iron",
    "dims": {
      "economy": 62,
      "security": 50,
      "culture": 35,
      "transport": 75,
      "industry": 65,
      "population": 45
    }
  },
  {
    "id": "harbin",
    "name": "哈尔滨",
    "provinceId": "vic.overseas",
    "isCore": false,
    "isOverseasPort": true,
    "specialty": "cmd-timber",
    "dims": {
      "economy": 55,
      "security": 45,
      "culture": 40,
      "transport": 60,
      "industry": 58,
      "population": 50
    }
  }
].map((r) => CitySchema.parse(r)))
