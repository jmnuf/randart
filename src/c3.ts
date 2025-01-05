import { pipe } from "./yielder";
import { Result, NK } from "./randart-types";
import type { NodeKind } from "./randart-types";

export type WasmModuleExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  _initialize(): void;
};

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

export type StructFieldType = "i32" | "u32" | "f32" | "bool" | "string";

type BaseStructConfig = {
  wasm: WasmModuleExports;
  fields: Record<string, { type: StructFieldType; offset: number; writable: boolean; } | { type: "struct"; offset: number; writable?: undefined; init: (p: Ptr) => Struct<any> }>;
  methods?: Record<string, {
    c3_name: string;
    transform?(wasm: WasmModuleExports, c3fn: (p: Ptr, ...args: any[]) => any): ((p: Ptr, ...args: any[]) => any);
  }>;
};
type Struct<T extends BaseStructConfig> = {
  // @ts-expect-error Trust me bro, this is fine
  [K in keyof T["methods"]as T["methods"] extends undefined ? never : K]: T["methods"][K]["transform"] extends Function ? ReturnType<T["methods"][K]["transform"]> : (...args: any[]) => any;
} & {
  fields: {
    [K in keyof T["fields"]]: {
      read: T["fields"][K]["type"] extends "bool"
      ? (() => boolean)
      : T["fields"][K]["type"] extends "i32" | "u32" | "f32"
      ? (() => number)
      : T["fields"][K]["type"] extends "string"
      ? (() => string)
      : never;

      write: T["fields"][K]["type"] extends "struct"
      ? never
      : T["fields"][K]["writable"] extends false
      ? never
      : T["fields"][K]["type"] extends "bool"
      ? ((value: boolean) => void)
      : T["fields"][K]["type"] extends "i32" | "u32" | "f32"
      ? ((value: number) => void)
      : T["fields"][K]["type"] extends "string"
      ? ((value: string) => void)
      : never;
    };
  };
};

// const Foo = defStruct({
//   wasm: {} as any,
//   fields: {
//     bar: {
//       type: "i32",
//       offset: 0,
//       writable: false,
//     },
//     baz: {
//       type: "i32",
//       offset: 4,
//       writable: true,
//     },
//     baf: {
//       type: "struct",
//       offset: 8,
//       init() {
//         return {} as Struct<any>;
//       },
//     },
//   },
//   methods: {
//     flip_bar_baz: {
//       c3_name: "Foo__flip_bar_baz",
//     },
//   },
// });
// const foo = Foo(NULL_PTR);
// foo.fields.bar.read();
// foo.fields.baz.write(34 + 35);
// foo.flip_bar_baz();


export function defStruct<const T extends BaseStructConfig>(cfg: T): (ptr: Ptr) => Struct<T> {
  const wasm = cfg.wasm;
  const base_struct: any = {};
  if (cfg.methods) {
    for (const [key, { c3_name, transform }] of Object.entries(cfg.methods)) {
      const c3fn = wasm[c3_name] as (self: Ptr, ...args: any[]) => any;
      base_struct[key] = typeof transform == "function" ? transform(wasm, c3fn) : c3fn;
    }
  }

  const fields: any = {};
  for (const [key, { offset, writable, type }] of Object.entries(cfg.fields)) {
    const field: any = {};
    if (type == "bool") {
      field.read = (ptr: Ptr) => {
        const n = new Uint8Array(wasm.memory.buffer, ptr + offset, 1)[0];
        return Boolean(n);
      };
      if (writable) {
        field.write = (ptr: Ptr, val: boolean) => {
          new Uint8Array(wasm.memory.buffer, ptr + offset, 1)[0] = Number(val);
        };
      }
    } else if (type == "u32") {
      field.read = (ptr: Ptr) => {
        const n = new Uint32Array(wasm.memory.buffer, ptr + offset, 1)[0];
        return n;
      };
      if (writable) {
        field.write = (ptr: Ptr, val: number) => {
          new Uint32Array(wasm.memory.buffer, ptr + offset, 1)[0] = val;
        };
      }
    } else if (type == "i32") {
      field.read = (ptr: Ptr) => {
        const n = new Int32Array(wasm.memory.buffer, ptr + offset, 1)[0];
        return n;
      };
      if (writable) {
        field.write = (ptr: Ptr, val: number) => {
          new Int32Array(wasm.memory.buffer, ptr + offset, 1)[0] = val;
        };
      }
    } else if (type == "f32") {
      field.read = (ptr: Ptr) => {
        const n = new Float32Array(wasm.memory.buffer, ptr + offset, 1)[0];
        return n;
      };
      if (writable) {
        field.write = (ptr: Ptr, val: number) => {
          new Float32Array(wasm.memory.buffer, ptr + offset, 1)[0] = val;
        };
      }
    } else if (type == "string") {
      field.read = (ptr: Ptr) => {
        const strPtr = new Uint32Array(wasm.memory.buffer, ptr + offset, 1)[0] as Ptr;
        if (strPtr == NULL_PTR) {
          console.warn("Attempting to read string from null pointer");
          return "";
        }
        const len = new Uint32Array(wasm.memory.buffer, ptr + offset + 4, 1)[0];
        const bytes = new Uint8Array(wasm.memory.buffer, strPtr, len);
        return new TextDecoder().decode(bytes);
      };
      if (writable) {
        field.write = (ptr: Ptr, val: string) => {
          const strPtr = new Uint8Array(wasm.memory.buffer, ptr + offset, 1)[0] as Ptr;
          const newStr = new TextEncoder().encode(val);
          const strBuf = new Uint8Array(wasm.memory.buffer, strPtr, newStr.length);
          for (let i = 0; i < newStr.length; ++i) {
            strBuf[i] = newStr[i];
          }
          const strLenBuf = new Uint32Array(wasm.memory.buffer, ptr + offset + 4, 1);
          strLenBuf[0] = newStr.length;
        };
      }
    } else {
      console.error("Unsupported C3 field type:", type);
      continue;
    }
    fields[key] = field;
  }
  base_struct.fields = cfg.fields;

  return (ptr: Ptr) => {
    const struct: any = {};
    for (const key of Object.keys(base_struct)) {
      if (key != "fields") {
        struct[key] = (base_struct[key] as (ptr: Ptr) => any).bind(null, ptr);
        continue;
      }
      const fields: any = {};
      for (const [pkey, pval] of Object.entries(base_struct[key] as Record<string, { read(ptr: Ptr): any; write?(ptr: Ptr, v: any): void; }>)) {
        fields[pkey] = {};
        fields[pkey].read = pval.read.bind(null, ptr);
        if (pval.write) {
          fields[pkey].write = pval.write.bind(null, ptr);
        }
      }
      struct[key] = fields;
    }
    return struct;
  };
}


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

export function* quickUse<T extends { free(): void; }>(init: () => T, cb: (inst: T) => any) {
  const inst = init();
  yield cb(inst);
  inst.free();
}


/*
 * ==============================
 * |
 * | Build functions for building objects to reference structs in wasm memory.
 * | Comment made for clear separation
 * |
 * -----------------------------
 */
export function create_constructors(wasm: WebAssembly.WebAssemblyInstantiatedSource) {
  const exports = wasm.instance.exports;

  const ResultFlt = (() => {
    const cfree = exports.ResultFlt_free as (self: Ptr) => void;
    return (ptr: Ptr): ResultFlt => {
      const ref: ResultFlt = {
        ptr,
        read: {
          ok() {
            const memory = exports.memory as WebAssembly.Memory;
            const buffer = memory.buffer;
            return Boolean(new Uint8Array(buffer, ptr, 1)[0]);
          },
          value() {
            const memory = exports.memory as WebAssembly.Memory;
            const buffer = memory.buffer;
            return new Float32Array(buffer, ptr + 4, 1)[0];
          },
          error() {
            const memory = exports.memory as WebAssembly.Memory;
            const buffer = memory.buffer;
            // return new Uint8Array(buffer, ptr + 4 + 4, 8);
            const p = new Uint32Array(buffer, ptr + 4 + 4, 1)[0];
            // return read_cstr(exports, p as Ptr);
            if (p == 0) return null;
            const len = new Uint32Array(buffer, ptr + 4 + 4 + 4, 1)[0];
            // return new Uint8Array(buffer, p, 48);
            return new TextDecoder().decode(new Uint8Array(buffer, p, len));
          },
        } as const,
        as_obj: () => {
          if (ref.read.ok()) {
            return Result.Ok(ref.read.value());
          } else {
            return Result.Err(new Error(ref.read.error()!));
          }
        },
        free: () => cfree(ptr),
      };
      return ref;
    }
  })();

  const ResultFlt3 = (() => {
    const cfree = exports.ResultFlt3_free as (self: Ptr) => void;
    return (ptr: Ptr): ResultFlt3 => {
      const ref: ResultFlt3 = {
        ptr,
        read: {
          ok() {
            const memory = exports.memory as WebAssembly.Memory;
            const buffer = memory.buffer;
            return Boolean(new Uint8Array(buffer, ptr, 1)[0]);
          },
          value() {
            const memory = exports.memory as WebAssembly.Memory;
            const buffer = memory.buffer;
            const flts = new Float32Array(buffer, ptr + 4, 3);
            return [flts[0], flts[1], flts[2]];
          },
          error() {
            const memory = exports.memory as WebAssembly.Memory;
            const buffer = memory.buffer;
            const str_ptr = ptr + 4 /* bool ok offset */ + (4 * 3 /* float[3] value offset */);
            const p = new Uint32Array(buffer, str_ptr, 1)[0];
            if (p == 0) return null;
            const len = new Uint32Array(buffer, str_ptr + 4, 1)[0];
            return new TextDecoder().decode(new Uint8Array(buffer, p, len));
          },
        } as const,
        as_obj: () => {
          if (ref.read.ok()) {
            return Result.Ok(ref.read.value());
          } else {
            return Result.Err(new Error(ref.read.error()!));
          }
        },
        free: () => cfree(ptr),
      };
      return ref;
    }
  })();

  const NTriop = (() => {
    return (ptr: Ptr): NodeTriop => {
      return {
        ptr,
        read: {
          a: () => Node(ptr),
          b: () => Node((ptr + 24) as Ptr),
          c: () => Node((ptr + (24 * 2)) as Ptr),
        },
      };
    };
  })();

  const Node = (() => {
    const as_single_value = exports.Node_as_single_value as (self: Ptr, x: number, y: number, t: number) => Ptr;
    const as_triple_value = exports.Node_as_triple_value as (self: Ptr, x: number, y: number, t: number) => Ptr;
    const get_value_as_number = exports.get_node_number as (self: Ptr) => number;
    const set_value_as_number = exports.set_node_number as (self: Ptr, val: number) => void;
    const get_value_as_bool = exports.get_node_bool as (self: Ptr) => number;
    const set_value_as_bool = exports.set_node_bool as (self: Ptr, val: boolean) => void;
    // const cfree = exports.tNode_free as (self: Ptr) => void;

    return (ptr: Ptr, cfree?: (self: Ptr) => void): Node => {
      return {
        ptr,
        read: {
          kind: () => {
            const mem = exports.memory as WebAssembly.Memory;
            const buf = mem.buffer;
            const k = new Uint8Array(buf, ptr, 1)[0];
            // console.log("Node.sizeof <-", 24, "<-", ...new Uint8Array(buf, ptr, 24));
            const key = NK.keys()[k];
            return NK[key];
          },
          value: {
            number: () => get_value_as_number(ptr),
            bool: () => Boolean(get_value_as_bool(ptr)),
          } as const,
          rule: () => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const r = new Int32Array(buf, ptr + 8, 1)[0];
            return r;
          },
          unaop: () => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const p = new Uint32Array(buf, ptr + 12, 1)[0] as Ptr;
            return Node(p);
          },
          triop: () => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const p = new Uint32Array(buf, ptr + 20, 1)[0] as Ptr;
            if (p == 0) return null;
            return NTriop(p);
          },
        },
        write: {
          kind: (kind: NodeKind) => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const arr = new Uint8Array(buf, ptr, 1);
            arr[0] = +kind;
          },
          value: {
            number: (value: number) => set_value_as_number(ptr, value),
            bool: (value: boolean) => set_value_as_bool(ptr, value),
          },
          rule: (idx: number) => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const arr = new Int32Array(buf, ptr + 8, 1);
            arr[0] = idx;
          },
          unaop: (node) => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const arr = new Uint32Array(buf, ptr + 12, 1);
            arr[0] = node == null ? 0 : node.ptr;
          },
          triop: (node) => {
            const buf = (exports.memory as WebAssembly.Memory).buffer;
            const arr = new Uint32Array(buf, ptr + 20, 1);
            arr[0] = node == null ? 0 : node.ptr;
          },
        },
        free: () => {
          if (!cfree) {
            console.warn("Can't free C3.Node with unknown allocator origin", ptr);
          } else {
            cfree(ptr);
          }
        },
        eval_to_single: (x: number, y: number, t: number, cb: (r: ResultFlt) => any) => {
          const rPtr = as_single_value(ptr, x, y, t);
          const result = ResultFlt(rPtr);
          cb(result);
          result.free();
        },
        eval_to_triple: (x: number, y: number, t: number, cb: (r: ResultFlt3) => any) => {
          const rPtr = as_triple_value(ptr, x, y, t);
          const result = ResultFlt3(rPtr);
          cb(result);
          result.free();
        },
      } as const;
    };
  })();

  const TNode = (() => {
    const alloc_new_tNode = exports.new_tnode as (kind: number) => Ptr;
    const cfree = exports.tNode_free as (self: Ptr) => void;
    return (kind: NodeKind): Node => {
      const ptr = alloc_new_tNode(+kind);
      return Node(ptr, cfree);
    };
  })();

  const tempNode = function*(kind: NodeKind, cb: (tnode: Node) => any) {
    const node = TNode(kind);
    return pipe(
      node,
      cb,
      () => node.free(),
    );
  };

  const Rule = (() => {
    const alloc_new_rule = exports.new_rule as () => Ptr;
    const cpush_num = (exports.Rule_push_num as (self: Ptr, num: number, prob: number) => void);
    const cpush_node = (exports.Rule_push_node_ptr as (self: Ptr, node_ptr: Ptr, prob: number) => void);
    const cpush_rule = (exports.Rule_push_rule as (self: Ptr, rule: number, prob: number) => void);
    const cbranches_count = (exports.Rule_branches_count as (self: Ptr) => number);
    const cfree = exports.free_rule as (self: Ptr) => void;

    return (ptr?: Ptr): Rule => {
      if (!ptr) {
        ptr = alloc_new_rule();
      }
      return {
        ptr,
        push_num: (num: number, prob: number) => cpush_num(ptr, num, prob),
        push_node: (node: Node, prob: number = 0) => cpush_node(ptr, node.ptr, prob),
        push_rule: (rule: number, prob: number = 0) => cpush_rule(ptr, rule, prob),
        len: () => cbranches_count(ptr),
        free: () => cfree(ptr),
      };
    }
  })();


  return {
    struct: {
      Rule,
      Node,
      NTriop,
    },
    tempNode,
  };
}
