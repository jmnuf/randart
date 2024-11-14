import { run, pipe, Enums } from "./yielder";
import type { Result, Option } from "./yielder";

const Result = Enums.Result;
const Option = Enums.Option;

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

console.log(`NK Count is ${NK.count()}`);
console.assert(NK.count() == 14, "Exhaustive check of NodeKind");

class MissingCanvas extends Error {
  constructor() {
    super("No Canvas element was found");
  }
}
class UnsupportedContext2D extends Error {
  constructor() {
    super("Context 2D is unsupported in the user's browser");
  }
}
class ElementNotFound extends Error {
  constructor(selector: string) {
    super(`No element matchin selector "${selector}" was found`);
  }
}

const WIDTH = 500;
const HEIGHT = WIDTH;
let animated = false;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function Q<T extends HTMLElement = HTMLElement>(
  selector: string,
): Result<T, ElementNotFound> {
  const elem = document.querySelector<T>(selector);
  if (!elem) return Result.Err(new ElementNotFound(selector));
  return Result.Ok(elem);
}

function getCanvas(): Result<
  { cnv: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
  MissingCanvas | UnsupportedContext2D
> {
  const canvasRes = Q<HTMLCanvasElement>("#canvas");
  if (Result.is_err(canvasRes)) return Result.Err(new MissingCanvas());
  const canvas = canvasRes.unwrap();
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return Result.Err(new UnsupportedContext2D());
  return Result.Ok({ cnv: canvas, ctx: context } as const);
}

function genPixelsBuffer() {
  return new Uint8ClampedArray(
    Array.from({ length: WIDTH * HEIGHT * 4 }).map(() => 255),
  );
}

function* generate_random_art(
  ctx: CanvasRenderingContext2D,
  codeElem: HTMLElement,
): Generator<unknown, Result<SomeNode, Error>> {
  try {
    const node = yield* pipe(
      () => genPixelsBuffer(),
      (buff) =>
        pipe(
          default_grammar(),
          ([e, g]) => gen_rule(g, e),
          (opt) => opt.unwrap(),
          (node) => {
            if (node.kind != NK.Triple) {
              throw new Error("Entry rule result must be a triple");
            }
            return node;
          },
          (n) => gen_node([], n, 20),
          (opt) => opt.unwrap() as TripleNode,
          (node) => {
            return flatten_node(node);
          },
          (node) => {
            codeElem.innerText = node_as_str(node);
            return pipe(
              () => render_pixels(node, buff),
              (buff) => [buff, node] as const,
            );
          },
        ),
      ([buf, node]) => [new ImageData(buf, WIDTH, HEIGHT), node] as const,
      ([imgData, node]) => {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.putImageData(imgData, 0, 0);
        return node;
      },
    );
    return Result.Ok(node);
  } catch (err: unknown) {
    console.error("RandomArt Failed:", err);
    return Result.Err(err as Error);
  }
}

run(function* main() {
  const pElem = Q("#ctxP").unwrap();
  const genBtn = Q<HTMLButtonElement>("#genBtn").unwrap();
  const animBtn = Q<HTMLButtonElement>("#animBtn").unwrap();
  const codeElem = Q("#formula").unwrap();
  const cnvRes = getCanvas();
  if (Result.is_err(cnvRes)) {
    console.error(cnvRes.error);
    return;
  }
  const { ctx } = cnvRes.value;
  let node: TripleNode;
  function* doRandomArtGeneration() {
    pElem.innerText = "Generating...";
    genBtn.disabled = true;
    animBtn.disabled = true;
    let result = yield* generate_random_art(ctx, codeElem);
    if (Result.is_err(result)) {
      pElem.innerText = `Generation Failed: ${result.error}`;
    }
    if (!Result.is_err(result)) {
      pElem.innerText = "Function used:";
      node = result.value;
    }
    genBtn.disabled = false;
    animBtn.disabled = false;
  }
  genBtn.addEventListener("click", () => {
    void run(doRandomArtGeneration());
  });
  animBtn.addEventListener("click", () => {
    animated = !animated;
    if (animated) {
      animBtn.innerText = "Stop Animating";
    } else {
      animBtn.innerText = "Start Animating";
    }
  });
  run(() => doRandomArtGeneration());
  const animTick = () => {
    requestAnimationFrame(animTick);
    if (!animated || !node) return;
    void run(
      pipe(
        () => genPixelsBuffer(),
        (buff) => render_pixels(node, buff),
        (buff) => new ImageData(buf, WIDTH, HEIGHT),
        (imgData) => {
          ctx.clearRect(0, 0, WIDTH, HEIGHT);
          ctx.putImageData(imgData, 0, 0);
        },
      ),
    );
  };
  requestAnimationFrame(animTick);
}).catch(console.error);

type VarNode = {
  kind:
    | (typeof NK)["X"]
    | (typeof NK)["Y"]
    | (typeof NK)["T"]
    | (typeof NK)["Random"];
};
type RuleNode = { kind: (typeof NK)["Rule"]; rule: number };
type NumberNode = { kind: (typeof NK)["Number"]; value: number };
type BoolNode = { kind: (typeof NK)["Bool"]; value: boolean };
type SqrtNode = { kind: (typeof NK)["Sqrt"]; value: SomeNode };
type AddNode = { kind: (typeof NK)["Add"]; lhs: SomeNode; rhs: SomeNode };
type MultNode = { kind: (typeof NK)["Mult"]; lhs: SomeNode; rhs: SomeNode };
type ModNode = { kind: (typeof NK)["Mod"]; lhs: SomeNode; rhs: SomeNode };
type GTNode = { kind: (typeof NK)["GT"]; lhs: SomeNode; rhs: SomeNode };
type TripleNode = {
  kind: (typeof NK)["Triple"];
  a: SomeNode;
  b: SomeNode;
  c: SomeNode;
};
type IfNode = {
  kind: (typeof NK)["If"];
  cond: SomeNode;
  then: SomeNode;
  elze: SomeNode;
};
type SomeNode =
  | VarNode
  | RuleNode
  | NumberNode
  | BoolNode
  | SqrtNode
  | AddNode
  | MultNode
  | ModNode
  | GTNode
  | TripleNode
  | IfNode;
function rule_node(rule: number): RuleNode {
  return {
    kind: NK.Rule,
    rule,
  };
}
function triple_node(a: SomeNode, b: SomeNode, c: SomeNode): TripleNode {
  return {
    kind: NK.Triple,
    a,
    b,
    c,
  };
}
function number_node(value: number): NumberNode {
  return {
    kind: NK.Number,
    value,
  };
}
function rand_node(): VarNode {
  return {
    kind: NK.Random,
  };
}
function x_node(): VarNode {
  return {
    kind: NK.X,
  };
}
function y_node(): VarNode {
  return { kind: NK.Y };
}
function t_node(): VarNode {
  return { kind: NK.T };
}
function add_node(lhs: SomeNode, rhs: SomeNode): AddNode {
  return { kind: NK.Add, lhs, rhs };
}
function mult_node(lhs: SomeNode, rhs: SomeNode): MultNode {
  return { kind: NK.Mult, lhs, rhs };
}
function sqrt_node(value: SomeNode): SqrtNode {
  return { kind: NK.Sqrt, value };
}
function bool_node(value: boolean): BoolNode {
  return { kind: NK.Bool, value };
}
// TODO: Use branches and probabilities
// type Branch = {
//   f: SomeNode;
//   prob: number;
// };
type Rule = Array<SomeNode>;
type Grammar = Array<Rule>;
function default_grammar() {
  `
// Grammar rules
0:E := (C, C, C)
1:A := <Random [-1, 1]> | X | Y | T | Sqrt(Add(Add(Mult(X, X), Mult(Y, Y)), Mult(T, T)))
2:C := A | C | Add(C, C) | Mult(C, C) | Sqrt(C)`;
  const rule_e_idx = 0;
  const rule_a_idx = 1;
  const rule_c_idx = 2;
  const rule_a = () => rule_node(rule_a_idx);
  const rule_c = () => rule_node(rule_c_idx);
  const g: Grammar = [];
  g.push([triple_node(rule_c(), rule_c(), rule_c())]);
  g.push([
    rand_node(),
    x_node(),
    y_node(),
    t_node(),
    sqrt_node(
      add_node(
        add_node(mult_node(x_node(), x_node()), mult_node(y_node(), y_node())),
        mult_node(t_node(), t_node()),
      ),
    ),
  ]);
  g.push([
    rule_a(),
    rule_c(),
    add_node(rule_c(), rule_c()),
    mult_node(rule_c(), rule_c()),
    sqrt_node(rule_c()),
  ]);
  return [rule_e_idx, g] as const;
}

function node_as_str(n: SomeNode): string {
  switch (n.kind) {
    case NK.X:
    case NK.Y:
    case NK.T: // The toPrimitive override should print the name
      return `${n.kind}`;
    case NK.Number:
      return `${n.value}`;
    case NK.Bool:
      return n.value ? "true" : "false";
    case NK.Random:
      return "(random)";
    case NK.Sqrt:
      return `${n.kind}(${node_as_str(n.value)})`;
    case NK.Mult:
    case NK.Mod:
    case NK.Add:
    case NK.GT:
      const lhs = node_as_str(n.lhs);
      const rhs = node_as_str(n.rhs);
      return `${n.kind}(${lhs}, ${rhs})`;
    case NK.Triple:
      const a = node_as_str(n.a);
      const b = node_as_str(n.b);
      const c = node_as_str(n.c);
      return `(${a}, ${b}, ${c})`;
    case NK.Rule:
      return `rule(${n.rule})`;
    default:
      throw new Error(`Node(${n.kind}) not added to generation yet`);
  }
}

function* gen_node(
  g: Grammar,
  n: SomeNode,
  depth: number,
): Generator<unknown, Option<SomeNode>> {
  switch (n.kind) {
    case NK.X:
    case NK.Y:
    case NK.T:
    case NK.Number:
    case NK.Bool:
      return Enums.Option.Some(n);
    case NK.Random:
      return Enums.Option.Some({
        kind: NK.Number,
        value: rand(-1, 1),
      });
    case NK.Sqrt:
      const value = yield* gen_node(g, n.value, depth);
      if (!Enums.Option.is_some(value)) return value;
      return Enums.Option.Some({
        kind: n.kind,
        value: value.unwrap(),
      });
    case NK.Mult:
    case NK.Mod:
    case NK.Add:
    case NK.GT:
      const lhs = yield* gen_node(g, n.lhs, depth);
      if (!Enums.Option.is_some(lhs)) return lhs;
      const rhs = yield* gen_node(g, n.rhs, depth);
      if (!Enums.Option.is_some(rhs)) return rhs;
      return Enums.Option.Some({
        kind: n.kind,
        lhs: lhs.unwrap(),
        rhs: rhs.unwrap(),
      });
    case NK.Triple:
      const a = yield* gen_node(g, n.a, depth);
      if (!Enums.Option.is_some(a)) return a;
      const b = yield* gen_node(g, n.b, depth);
      if (!Enums.Option.is_some(b)) return b;
      const c = yield* gen_node(g, n.c, depth);
      if (!Enums.Option.is_some(c)) return c;
      return Enums.Option.Some({
        kind: n.kind,
        a: a.unwrap(),
        b: b.unwrap(),
        c: c.unwrap(),
      });
    case NK.Rule:
      return yield* gen_rule(g, n.rule, depth - 1);
    default:
      throw new Error(`Node(${n.kind}) not added to generation yet`);
  }
}
// TODO: Use Result type instead of Option type
function node_eval(
  n: SomeNode,
  x: number,
  y: number,
  t: number,
): Option<number | [number, number, number]> {
  switch (n.kind) {
    case NK.X:
      return Option.Some(x);
    case NK.Y:
      return Option.Some(y);
    case NK.T:
      return Option.Some(t);
    case NK.Number:
      return Option.Some(n.value);
    case NK.Bool:
      return Option.Some(n.value ? 1 : 0);
    case NK.Mult: {
      const lhs = node_eval(n.lhs, x, y, t).unwrap() as number;
      const rhs = node_eval(n.rhs, x, y, t).unwrap() as number;
      return Option.Some(lhs * rhs);
    }
    case NK.Mod: {
      const lhs = node_eval(n.lhs, x, y, t).unwrap() as number;
      const rhs = node_eval(n.rhs, x, y, t).unwrap() as number;
      return Option.Some(lhs % rhs);
    }
    case NK.Add: {
      const lhs = node_eval(n.lhs, x, y, t).unwrap() as number;
      const rhs = node_eval(n.rhs, x, y, t).unwrap() as number;
      return Option.Some(lhs + rhs);
    }
    case NK.GT: {
      const lhs = node_eval(n.lhs, x, y, t).unwrap() as number;
      const rhs = node_eval(n.rhs, x, y, t).unwrap() as number;
      return Option.Some(lhs > rhs ? 1 : 0);
    }
    case NK.Sqrt: {
      const value = node_eval(n.value, x, y, t).unwrap() as number;
      return Option.Some(Math.sqrt(value));
    }
    case NK.Triple: {
      const a = node_eval(n.a, x, y, t).unwrap() as number;
      const b = node_eval(n.b, x, y, t).unwrap() as number;
      const c = node_eval(n.c, x, y, t).unwrap() as number;
      return Option.Some([a, b, c]);
    }
    case NK.Rule:
    case NK.Random:
      console.error(
        `Cannot evaluate node kind ${n.kind} as it's a grammar only node`,
      );
      return Option.None;
    default:
      throw new Error(`Node(${n.kind}) not added to generation yet`);
  }
}

function* flatten_node(n: SomeNode): SomeNode {
  switch (n.kind) {
    case NK.Sqrt:
      const valueN = yield* flatten_node(n.value);
      if (valueN.kind != NK.Number) return n;
      return number_node(Math.sqrt(valueN.value));
    case NK.Mult:
    case NK.Mod:
    case NK.Add:
    case NK.GT:
      const lhsN = yield* flatten_node(n.lhs);
      if (lhsN.kind != NK.Number) return n;
      const rhsN = yield* flatten_node(n.rhs);
      if (rhsN.kind != NK.Number) return n;
      if (n.kind == NK.Mult) return number_node(lhsN.value * rhsN.value);
      if (n.kind == NK.Mod) return number_mode(lhsN.value % rhsN.value);
      if (n.kind == NK.Add) return number_mode(lhsN.value + rhsN.value);
      if (n.kind == NK.GT) return bool_node(lhsN.value > rhsN.value);
      return n;
    case NK.Triple:
      const a = yield* flatten_node(n.a);
      const b = yield* flatten_node(n.b);
      const c = yield* flatten_node(n.c);
      return { kind: n.kind, a, b, c };

    case NK.X:
    case NK.Y:
    case NK.T:
    case NK.Number:
    case NK.Bool:
    case NK.Random:
    default:
      return n;
  }
}

function* gen_rule(g: Grammar, rule: number, depth: number = 25) {
  // TODO: Use errors instead of option
  const rules = g[rule];
  if (!rules || rules.length <= 0) {
    console.log("Invalid rule provided");
    return Option.None;
  }
  // if (depth <= 0) {
  //   return Option.None;
  // }
  // TODO: Maybe log a warning when we've reached depth 0
  // TODO: Use probablities
  const node = depth <= 0 ? rules[0] : rules[Math.floor(rand(0, rules.length))];
  const o = yield* gen_node(g, node, depth);
  if (!Enums.Option.is_some(o)) {
    //console.log("Node generation failed");
    return o;
  }
  const f = o.unwrap();
  return Option.Some(f);
}

function* render_pixels(node: TripleNode, buff: Uint8ClampedArray) {
  const t = Math.sin(Date.now());
  for (let y = 0; y < HEIGHT; ++y) {
    const ny = (y / HEIGHT) * 2 - 1;
    for (let x = 0; x < WIDTH; ++x) {
      const nx = (x / WIDTH) * 2 - 1;
      const index = (y * WIDTH + x) * 4;
      const result: Option<[number, number, number]> = yield node_eval(
        node,
        nx,
        ny,
        t,
      );
      const [first, secon, third] = result.unwrap();
      const r = Math.round(((first + 1) / 2) * 255);
      const g = Math.round(((secon + 1) / 2) * 255);
      const b = Math.round(((third + 1) / 2) * 255);
      buff[index + 0] = r;
      (buff[index + 1] = g), (buff[index + 2] = b);
      buff[index + 3] = 255;
    }
    // Let the browser breath!
    yield new Promise((res) => setTimeout(res, 1));
  }
  return buff;
}
