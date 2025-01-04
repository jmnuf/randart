import { Enums } from "./yielder";
import type * as Yielder from "./yielder";

export type Result<T, E extends Error = Error> = Yielder.Result<T, E>;
export const Result = Enums.Result;
export type Option<T> = Yielder.Option<T>;
export const Option = Enums.Option;

export const NK = Enums.create(
  // Enum Name:
  "NodeKind",
  // Keys:
  "X",
  "Y",
  "T",
  "Random",
  "Rule",
  "Number",
  "Bool",
  "Sqrt",
  "Add",
  "Mult",
  "Mod",
  "GT",
  "Triple",
  "If",
);
export const NK_COUNT = 14;
// @ts-expect-error TS is dumb, keys are appropriate. I also need to fix how the Enum type works
export type NodeKind = keyof typeof NK extends infer T ? T extends string ? (typeof NK)[T] extends number ? (typeof NK)[T] : never : never : never;

console.log(`NK Count is ${NK.count()}`);
console.assert(NK.count() == NK_COUNT, "Do exhaustive check of NodeKind (NK)");
