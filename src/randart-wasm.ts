import wasmPath from "/randart.wasm?url";

import { run, pipe, safePromise } from "./yielder";
import { NK } from "./randart-types";
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
    env: make_environment({}),
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
  const { struct, tempNode } = C3.create_constructors(wasm);

  // wasm.instance.exports
  // wasm.instance.exports.memory as WebAssembly.Memory
  // const struct_node_size = (wasm.instance.exports.node_size as () => number)();
  const r1 = struct.Rule();
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
    struct,
  } as const;
}

// TODO: Once done working out how the module will work, remove this code
run(pipe(
  init_wasm(),
  c3 => {
    console.log(Object.keys(c3 as any));
  },
)).catch(console.error);
