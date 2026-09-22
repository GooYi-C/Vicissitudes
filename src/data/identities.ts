// src/data/identities.ts — L0-02 身份表（40 = 5 era × 8 identity；DAT-01 全覆盖无遗漏）
import type { Identity } from '../validation/dataSchemas'
import { IdentitySchema } from '../validation/dataSchemas'

export const identities: readonly Identity[] = Object.freeze([
  {
    "id": "id-warlord-student",
    "eraId": "era-warlord",
    "kind": "student",
    "name": "student",
    "startMoney": 5,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-warlord 时代的student出身"
  },
  {
    "id": "id-warlord-worker",
    "eraId": "era-warlord",
    "kind": "worker",
    "name": "worker",
    "startMoney": 5,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-warlord 时代的worker出身"
  },
  {
    "id": "id-warlord-merchant",
    "eraId": "era-warlord",
    "kind": "merchant",
    "name": "merchant",
    "startMoney": 50,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-warlord 时代的merchant出身"
  },
  {
    "id": "id-warlord-journalist",
    "eraId": "era-warlord",
    "kind": "journalist",
    "name": "journalist",
    "startMoney": 10,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-warlord 时代的journalist出身"
  },
  {
    "id": "id-warlord-soldier",
    "eraId": "era-warlord",
    "kind": "soldier",
    "name": "soldier",
    "startMoney": 15,
    "startCity": "wuhan",
    "startsWithControl": false,
    "desc": "era-warlord 时代的soldier出身"
  },
  {
    "id": "id-warlord-teacher",
    "eraId": "era-warlord",
    "kind": "teacher",
    "name": "teacher",
    "startMoney": 8,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-warlord 时代的teacher出身"
  },
  {
    "id": "id-warlord-doctor",
    "eraId": "era-warlord",
    "kind": "doctor",
    "name": "doctor",
    "startMoney": 20,
    "startCity": "guangzhou",
    "startsWithControl": false,
    "desc": "era-warlord 时代的doctor出身"
  },
  {
    "id": "id-warlord-industrialist",
    "eraId": "era-warlord",
    "kind": "industrialist",
    "name": "industrialist",
    "startMoney": 200,
    "startCity": "tianjin",
    "startsWithControl": false,
    "desc": "era-warlord 时代的industrialist出身"
  },
  {
    "id": "id-nanjing-student",
    "eraId": "era-nanjing",
    "kind": "student",
    "name": "student",
    "startMoney": 5,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的student出身"
  },
  {
    "id": "id-nanjing-worker",
    "eraId": "era-nanjing",
    "kind": "worker",
    "name": "worker",
    "startMoney": 5,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的worker出身"
  },
  {
    "id": "id-nanjing-merchant",
    "eraId": "era-nanjing",
    "kind": "merchant",
    "name": "merchant",
    "startMoney": 50,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的merchant出身"
  },
  {
    "id": "id-nanjing-journalist",
    "eraId": "era-nanjing",
    "kind": "journalist",
    "name": "journalist",
    "startMoney": 10,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的journalist出身"
  },
  {
    "id": "id-nanjing-soldier",
    "eraId": "era-nanjing",
    "kind": "soldier",
    "name": "soldier",
    "startMoney": 15,
    "startCity": "wuhan",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的soldier出身"
  },
  {
    "id": "id-nanjing-teacher",
    "eraId": "era-nanjing",
    "kind": "teacher",
    "name": "teacher",
    "startMoney": 8,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的teacher出身"
  },
  {
    "id": "id-nanjing-doctor",
    "eraId": "era-nanjing",
    "kind": "doctor",
    "name": "doctor",
    "startMoney": 20,
    "startCity": "guangzhou",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的doctor出身"
  },
  {
    "id": "id-nanjing-industrialist",
    "eraId": "era-nanjing",
    "kind": "industrialist",
    "name": "industrialist",
    "startMoney": 200,
    "startCity": "tianjin",
    "startsWithControl": false,
    "desc": "era-nanjing 时代的industrialist出身"
  },
  {
    "id": "id-resistance-student",
    "eraId": "era-resistance",
    "kind": "student",
    "name": "student",
    "startMoney": 5,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-resistance 时代的student出身"
  },
  {
    "id": "id-resistance-worker",
    "eraId": "era-resistance",
    "kind": "worker",
    "name": "worker",
    "startMoney": 5,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-resistance 时代的worker出身"
  },
  {
    "id": "id-resistance-merchant",
    "eraId": "era-resistance",
    "kind": "merchant",
    "name": "merchant",
    "startMoney": 50,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-resistance 时代的merchant出身"
  },
  {
    "id": "id-resistance-journalist",
    "eraId": "era-resistance",
    "kind": "journalist",
    "name": "journalist",
    "startMoney": 10,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-resistance 时代的journalist出身"
  },
  {
    "id": "id-resistance-soldier",
    "eraId": "era-resistance",
    "kind": "soldier",
    "name": "soldier",
    "startMoney": 15,
    "startCity": "wuhan",
    "startsWithControl": false,
    "desc": "era-resistance 时代的soldier出身"
  },
  {
    "id": "id-resistance-teacher",
    "eraId": "era-resistance",
    "kind": "teacher",
    "name": "teacher",
    "startMoney": 8,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-resistance 时代的teacher出身"
  },
  {
    "id": "id-resistance-doctor",
    "eraId": "era-resistance",
    "kind": "doctor",
    "name": "doctor",
    "startMoney": 20,
    "startCity": "guangzhou",
    "startsWithControl": false,
    "desc": "era-resistance 时代的doctor出身"
  },
  {
    "id": "id-resistance-industrialist",
    "eraId": "era-resistance",
    "kind": "industrialist",
    "name": "industrialist",
    "startMoney": 200,
    "startCity": "tianjin",
    "startsWithControl": false,
    "desc": "era-resistance 时代的industrialist出身"
  },
  {
    "id": "id-civilwar-student",
    "eraId": "era-civilwar",
    "kind": "student",
    "name": "student",
    "startMoney": 5,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的student出身"
  },
  {
    "id": "id-civilwar-worker",
    "eraId": "era-civilwar",
    "kind": "worker",
    "name": "worker",
    "startMoney": 5,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的worker出身"
  },
  {
    "id": "id-civilwar-merchant",
    "eraId": "era-civilwar",
    "kind": "merchant",
    "name": "merchant",
    "startMoney": 50,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的merchant出身"
  },
  {
    "id": "id-civilwar-journalist",
    "eraId": "era-civilwar",
    "kind": "journalist",
    "name": "journalist",
    "startMoney": 10,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的journalist出身"
  },
  {
    "id": "id-civilwar-soldier",
    "eraId": "era-civilwar",
    "kind": "soldier",
    "name": "soldier",
    "startMoney": 15,
    "startCity": "wuhan",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的soldier出身"
  },
  {
    "id": "id-civilwar-teacher",
    "eraId": "era-civilwar",
    "kind": "teacher",
    "name": "teacher",
    "startMoney": 8,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的teacher出身"
  },
  {
    "id": "id-civilwar-doctor",
    "eraId": "era-civilwar",
    "kind": "doctor",
    "name": "doctor",
    "startMoney": 20,
    "startCity": "guangzhou",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的doctor出身"
  },
  {
    "id": "id-civilwar-industrialist",
    "eraId": "era-civilwar",
    "kind": "industrialist",
    "name": "industrialist",
    "startMoney": 200,
    "startCity": "tianjin",
    "startsWithControl": false,
    "desc": "era-civilwar 时代的industrialist出身"
  },
  {
    "id": "id-collapse-student",
    "eraId": "era-collapse",
    "kind": "student",
    "name": "student",
    "startMoney": 5,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-collapse 时代的student出身"
  },
  {
    "id": "id-collapse-worker",
    "eraId": "era-collapse",
    "kind": "worker",
    "name": "worker",
    "startMoney": 5,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-collapse 时代的worker出身"
  },
  {
    "id": "id-collapse-merchant",
    "eraId": "era-collapse",
    "kind": "merchant",
    "name": "merchant",
    "startMoney": 50,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-collapse 时代的merchant出身"
  },
  {
    "id": "id-collapse-journalist",
    "eraId": "era-collapse",
    "kind": "journalist",
    "name": "journalist",
    "startMoney": 10,
    "startCity": "shanghai",
    "startsWithControl": false,
    "desc": "era-collapse 时代的journalist出身"
  },
  {
    "id": "id-collapse-soldier",
    "eraId": "era-collapse",
    "kind": "soldier",
    "name": "soldier",
    "startMoney": 15,
    "startCity": "wuhan",
    "startsWithControl": false,
    "desc": "era-collapse 时代的soldier出身"
  },
  {
    "id": "id-collapse-teacher",
    "eraId": "era-collapse",
    "kind": "teacher",
    "name": "teacher",
    "startMoney": 8,
    "startCity": "beijing",
    "startsWithControl": false,
    "desc": "era-collapse 时代的teacher出身"
  },
  {
    "id": "id-collapse-doctor",
    "eraId": "era-collapse",
    "kind": "doctor",
    "name": "doctor",
    "startMoney": 20,
    "startCity": "guangzhou",
    "startsWithControl": false,
    "desc": "era-collapse 时代的doctor出身"
  },
  {
    "id": "id-collapse-industrialist",
    "eraId": "era-collapse",
    "kind": "industrialist",
    "name": "industrialist",
    "startMoney": 200,
    "startCity": "tianjin",
    "startsWithControl": false,
    "desc": "era-collapse 时代的industrialist出身"
  }
].map((r) => IdentitySchema.parse(r)))
