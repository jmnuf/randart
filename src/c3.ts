
import { Result } from "./randart-types";
import type { NodeKind } from "./randart-types";

export type Ptr = number & { __wasm__: "PTR" };

export const NULL_PTR: Ptr = 0 as Ptr;
export type Str = Readonly<{
  ptr: Ptr;
  len: number;
  str: string;
  free(): void;
}>;

export type ResultFlt = Readonly<{
  ptr: Ptr;
  read: Readonly<{
    ok(): boolean;
    value(): number;
    error(): string | null;
  }>;
  as_obj(): Result<number>;
  free(): void;
}>;

export type ResultFlt3 = Readonly<{
  ptr: Ptr;
  read: Readonly<{
    ok(): boolean;
    value(): [number, number, number];
    error(): string | null;
  }>;
  as_obj(): Result<[number, number, number]>;
  free(): void;
}>;

export type NodeTriop = Readonly<{
  ptr: Ptr;
  read: Readonly<{
    a(): Node;
    b(): Node;
    c(): Node;
  }>;
}>;

export type Node = Readonly<{
  ptr: Ptr;
  free(): void;
  eval_to_single(x: number, y: number, t: number, cb: (result: ResultFlt) => any): void;
  eval_to_triple(x: number, y: number, t: number, cb: (result: ResultFlt3) => any): void;
  read: Readonly<{
    kind(): NodeKind;
    value: Readonly<{
      number(): number;
      bool(): boolean;
    }>;
    rule(): number;
    unaop(): Node | null;
    // binop(): NodeBinop | null;
    triop(): NodeTriop | null;
  }>;
  write: Readonly<{
    kind(kind: NodeKind): void;
    value: Readonly<{
      number(v: number): void;
      bool(v: boolean): void;
    }>;
    rule(idx: number): void;
    unaop(node: Node | null): void;
    // binop(binop: NodeBinop | null): void;
    triop(triop: NodeTriop | null): void;
  }>;
  // as_obj(): { kind: NodeKind; value: number | boolean | undefined; rule: number | undefined; unaop: Node | null; triop: NodeTriop | null; };
}>;

export type Rule = Readonly<{
  ptr: Ptr;
  push_num(num: number, prob: number): void;
  push_node(node: Node, prob: number): void;
  push_rule(rule: number, prob: number): void;
  len(): number;
  free(): void;
}>;


function cstrlen(mem: Uint8Array, ptr: Ptr) {
  let len = 0;
  while (mem[ptr] != 0) {
    len++;
    ptr++;
  }
  return len;
}

export function read_cstr(exports: WebAssembly.Exports, ptr: Ptr) {
  const memory = exports.memory as WebAssembly.Memory;
  const mfree = exports.mem_free as (p: Ptr) => void;
  const buffer = memory.buffer;
  const mem = new Uint8Array(buffer);
  const len = cstrlen(mem, ptr);
  const bytes = new Uint8Array(buffer, ptr, len);
  return Object.freeze({
    ptr,
    len,
    str: new TextDecoder().decode(bytes),
    free: () => mfree(ptr),
  }) as Str;
}

export function read_string(exports: WebAssembly.Exports, ptr: Ptr) {
  const memory = exports.memory as WebAssembly.Memory;
  const mfree = exports.mem_free as (p: Ptr) => void;
  const buffer = memory.buffer;
  // A C3 string is a fat pointer: char* + length
  const strPtr = new Uint32Array(buffer, ptr, 1)[0] as Ptr;
  const len = new Uint32Array(buffer, ptr + 4, 1)[0];
  const bytes = new Uint8Array(buffer, strPtr, len);
  return Object.freeze({
    ptr,
    len,
    str: new TextDecoder().decode(bytes),
    free: () => mfree(ptr),
  }) as Str;
}
