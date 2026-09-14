// src/validation/effects.ts — DomainEffect 与 Operation 类型（B-07 受限指令集的类型面）
// 类型住 L1（被依赖层 —— L2 引擎产出效果、L4 编译消费、L5/L6 命令与意图产出，
// 四层共用故住最底层；编译逻辑与映射仍在 L4 compiler.ts，SX-08「稳定级」签名）。
// 〔SK-05 层间修正留痕〕原类型定义在 L4 compiler；M-01 collect 返回 DomainEffect[]
// 使 L2 必然 import 它 —— L-01 单向依赖下唯一合法位置是被多下层共用的 L1。
// compiler.ts re-export 保持既有引用面不变（S-08：改签名须同批，此处仅挪位不改形）。

export type DomainOp =
  | 'cityEffect' // 对当前城市施加六维效果（§4.5 事件解耦缝的原型指令）
  | 'setCurrency' // 货币锚点切换（temporal）
  | 'advanceDate' // 日期推进（Travel 命令 / temporal）
  | 'memoryWrite' // memory.items 写入（链③：三源同通道）
  | 'situationEnqueue' // 待决处境入队（events 模块 / resolves 出队对称）
  | 'situationDequeue' // 待决处境出队（resolves 命令）
  | 'claimTerritory' // 控制权落账（链①：history/factions/Occupation 同一编译路径）
  | 'modifyPlayer' // 主角级域（career/player —— sanitize 白名单投影的核心区）

// 受限指令集封闭枚举（值形态 —— 测试与 sanitize 白名单侧可枚举）
export const DOMAIN_OPS: readonly DomainOp[] = [
  'cityEffect', 'setCurrency', 'advanceDate', 'memoryWrite',
  'situationEnqueue', 'situationDequeue', 'claimTerritory', 'modifyPlayer',
] as const

export interface DomainEffect {
  readonly op: DomainOp
  readonly args: Readonly<Record<string, unknown>>
}

// RFC 6902 子集（B-07 不变量 3：ops · RFC 6902，承 arch-minguo.json 边标注）
export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }

export type Operation = JsonPatchOp

// 命令编译入口输入（LL-08：签名不含来源参数 —— 等价性的结构保证）
export interface CommandInput {
  readonly cmd: string
  readonly args: Readonly<Record<string, unknown>>
}
