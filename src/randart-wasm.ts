import wasmPath from "/randart.wasm?url";

import { run, pipe, safePromise } from "./yielder";
// import { NK } from "./randart-types";
import * as C3 from "./c3";

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

function* init_wasm() {
  const result = yield* safePromise(WebAssembly.instantiateStreaming(fetch(wasmPath), {
    env: make_environment({
      // extern fn void printn(usz len, char* str);
      printn(len: number, str_p: C3.Ptr) {
        const str = C3.read_string_with_len(exports, str_p, len);
        console.log("[WASM.INFO]", str);
      },

      // extern fn void eprintn(usz len, char* str);
      eprintn(len: number, str_p: C3.Ptr) {
        const str = C3.read_string_with_len(exports, str_p, len);
        console.error("[WASM.ERROR]", str);
      },
    }),
  }));
  if (result.i == 0) {
    console.error("[ERROR]", result.error);
    return;
  }
  const wasm = result.value;
  const exports = wasm.instance.exports as WebAssembly.Exports & { memory: WebAssembly.Memory; _initialize(): void; };
  // C3 always exports this function to setup the memory space so functions like mem::alloc work properly.
  exports._initialize();
  console.log(exports);

  // const c3inst = C3.create_constructors(wasm);
  const c3m = C3.create_constructors(wasm);
  console.log(c3m);
  // const { struct, tempNode } = c3m;

  // wasm.instance.exports
  // wasm.instance.exports.memory as WebAssembly.Memory


  yield C3.quickUse(
    // () => c3m.mem.alloc_cstr("(Mult(0.5, 0.5), Mult(0.3, 0.3))"),
    () => c3m.mem.alloc_cstr("Sqrt(Add(Mult(0.34, 0.34), Mult(0.35, 0.35)))"),
    // () => c3m.mem.alloc_cstr("Sqrt(Add(Mult(X, X), Mult(Y, Y)))"),
    // () => c3m.mem.alloc_cstr("(-0.04231036887571982, 0.3698903664947131, T)"),
    // () => c3m.mem.alloc_cstr(`(Add(${Math.random() * 2 - 1}, Mult(Add(X, T), Y)), Sqrt(Add(Mult(X, X), Add(Mult(Y, Y), Mult(T, T)))), ${Math.random()})`),
    // () => c3m.mem.alloc_cstr(`(Add(${Math.random() * 2 - 1}, Mult(0.6, 0.1)), Sqrt(Add(Mult(0.5, 0.5), Add(Mult(0.1, 0.1), Mult(0.1, 0.1)))), ${Math.random()})`),
    (strPtr) => {
      const ptr = c3m.parse_function_from_cstr(strPtr.ptr);
      console.log(`parse_function_from_cstr(${strPtr.ptr}) <-`, ptr);
    },
  );
  // c3m.parse_function_from_cstr();

  // const struct_node_size = (wasm.instance.exports.node_size as () => number)();
  // const r1 = struct.Rule();
  // r1;
  // yield tempNode(NK.Triple, n => {
  //   n.eval_to_single(0, 0, 0, result => {
  //     console.log("Node is single value:", result.read.ok());
  //     console.log("ResulFlt.value <-", result.read.value());
  //     console.log("ResulFlt.error <-", result.read.error());
  //   });
  //   n.eval_to_triple(0, 0, 0, result => {
  //     console.log("Node is triple value:", result.read.ok());
  //     console.log("ResulFlt3.value <-", ...result.read.value());
  //     console.log("ResulFlt3.error <-", result.read.error());
  //   });

  //   console.log("Node.kind <-", n.read.kind());
  //   console.log("Node.triop <-", n.read.triop());
  //   console.log("Node.triop.a.value.number <-", n.read.triop()!.read.a().read.value.number());
  //   r1.push_node(n, 0);
  // });
  // console.log("rule.len <-", r1.len());
  // console.log("ResultFlt3.sizeof <-", (exports.ResultFlt3_sizeof as Function)())
  // r1.free();

  return {
    wasm,
    tempNode: c3m.tempNode,
    struct: c3m.struct,
  } as const;
}

// TODO: Once done working out how the module will work, remove this code
run(pipe(
  init_wasm(),
  c3 => {
    console.log(Object.keys(c3 as any));
  },
)).catch(console.error);
