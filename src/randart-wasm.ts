import wasmPath from "/randart.wasm?url";

import { run, pipe, Enums } from "./yielder";
import type { Result as ResultEx } from "./yielder";
type Result<T> = ResultEx<T, Error>;
const Result = Enums.Result;

const NK = Enums.create(
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
// @ts-expect-error TS is dumb
type NodeKind = keyof typeof NK extends infer T ? T extends string ? (typeof NK)[T] extends number ? (typeof NK)[T] : never : never : never;


function make_environment<TEnv extends Record<string | symbol, Function>>(env: TEnv) {
  return new Proxy(env, {
    get(_target, prop, _receiver) {
      if (env[prop] !== undefined) {
        return env[prop].bind(env);
      }
      return (...args: any[]) => {
        throw new Error(`NOT IMPLEMENTED: ${String(prop)} ${args}`);
      }
    }
  });
}

function* safeP<T>(p: Promise<T>): Generator<unknown, Result<T>> {
  return yield p.then(v => Result.Ok(v)).catch(e => Result.Err(e as Error));
}

export type Ptr = number & { __wasm__: "PTR" };

// function cstrlen(mem: Uint8Array, ptr: number) {
//   let len = 0;
//   while (mem[ptr] != 0) {
//     len++;
//     ptr++;
//   }
//   return len;
// }

// function read_cstr(exports: WebAssembly.Exports, ptr: Ptr) {
//   const memory = exports.memory as WebAssembly.Memory;
//   const mfree = exports.mem_free as (p: Ptr) => void;
//   const buffer = memory.buffer;
//   const mem = new Uint8Array(buffer);
//   const len = cstrlen(mem, ptr);
//   const bytes = new Uint8Array(buffer, ptr, len);
//   return Object.freeze({
//     ptr,
//     len,
//     str: new TextDecoder().decode(bytes),
//     free: () => mfree(ptr),
//   }) as C3.CStr;
// }

export namespace C3 {
  export type CStr = Readonly<{
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
    // as_obj(): { kind: NodeKind; value: number | boolean | undefined; rule: number | undefined; unaop: Node; triop: NodeTriop; };
  }>;

  export type Rule = Readonly<{
    ptr: Ptr;
    push_num(num: number, prob: number): void;
    push_node(node: Node, prob: number): void;
    push_rule(rule: number, prob: number): void;
    len(): number;
    free(): void;
  }>;
}

function* init_wasm() {
  const result = yield* safeP(WebAssembly.instantiateStreaming(fetch(wasmPath), {
    env: make_environment({}),
  }));
  if (result.i == 0) {
    console.error("[ERROR]", result.error);
    return;
  }
  const wasm = result.value;
  const exports = wasm.instance.exports;
  // @ts-ignore C3 always exports this function to call before using memory
  exports._initialize();
  console.log(exports);
  // wasm.instance.exports
  // wasm.instance.exports.memory as WebAssembly.Memory
  // const struct_node_size = (wasm.instance.exports.node_size as () => number)();
  const ResultFlt = (() => {
    const cfree = exports.ResultFlt_free as (self: Ptr) => void;
    return (ptr: Ptr): C3.ResultFlt => {
      const ref: C3.ResultFlt = {
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
    return (ptr: Ptr): C3.ResultFlt3 => {
      const ref: C3.ResultFlt3 = {
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
    return (ptr: Ptr): C3.NodeTriop => {
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
    return (ptr: Ptr, cfree?: (self: Ptr) => void): C3.Node => {
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
        eval_to_single: (x: number, y: number, t: number, cb: (r: C3.ResultFlt) => any) => {
          const rPtr = as_single_value(ptr, x, y, t);
          const result = ResultFlt(rPtr);
          cb(result);
          result.free();
        },
        eval_to_triple: (x: number, y: number, t: number, cb: (r: C3.ResultFlt3) => any) => {
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
    return (kind: NodeKind): C3.Node => {
      const ptr = alloc_new_tNode(+kind);
      return Node(ptr, cfree);
    };
  })();
  const tempNode = function*(kind: NodeKind, cb: (tnode: C3.Node) => any) {
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

    return (): C3.Rule => {
      const ptr = alloc_new_rule();
      return {
        ptr,
        push_num: (num: number, prob: number) => cpush_num(ptr, num, prob),
        push_node: (node: C3.Node, prob: number = 0) => cpush_node(ptr, node.ptr, prob),
        push_rule: (rule: number, prob: number = 0) => cpush_rule(ptr, rule, prob),
        len: () => cbranches_count(ptr),
        free: () => cfree(ptr),
      };
    }
  })();
  const r1 = Rule();
  r1;
  yield tempNode(NK.Triple, n => {
    n.eval_to_single(0, 0, 0, result => {
      console.log("Node is single value:", result.read.ok());
      console.log("ResulFlt.value <-", result.read.value());
      console.log("ResulFlt.error <-", result.read.error());
    });
    n.eval_to_triple(0, 0, 0, result => {
      console.log("Node is triple value:", result.read.ok());
      console.log("ResulFlt3.value <-", ...result.read.value());
      console.log("ResulFlt3.error <-", result.read.error());
    });

    console.log("Node.kind <-", n.read.kind());
    console.log("Node.triop <-", n.read.triop());
    console.log("Node.triop.a.value.number <-", n.read.triop()!.read.a().read.value.number());
    r1.push_node(n, 0);
  });
  console.log("rule.len <-", r1.len());
  console.log("ResultFlt3.sizeof <-", (exports.ResultFlt3_sizeof as Function)())
  r1.free();
  return {
    wasm,
    tempNode,
    Rule,
  } as const;
}

run(pipe(
  init_wasm(),
  c3 => {
    console.log(Object.keys(c3 as any));
  },
)).catch(console.error);
