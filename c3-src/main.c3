import std::math;
import std::collections;

enum NodeKind : char {
  X,
  Y,
  T,
  RANDOM,
  RULE,
  NUMBER,
  BOOL,
  SQRT,
  ADD,
  MULT,
  MOD,
  GT,
  TRIPLE,
  IF,
}

struct NodeBinOp {
  Node a; // 00:24
  Node b; // 24:24
} // <- 48

struct NodeTriOp {
  Node a; // 00:24
  Node b; // 24:24
  Node c; // 48:24
} // <- 70

union NodeVal {
  bool boolean;
  float number;
}
struct Node {
  NodeKind kind;    // 00:4
  NodeVal  value;   // 04:4
  int rule;         // 08:4
  Node *unaop;      // 12:4
  NodeBinOp *binop; // 16:4
  NodeTriOp *triop; // 20:4
}

macro void @tfree(void *ptr) {
  allocator::free(allocator::temp(), ptr);
}

fn Node rule_node(int rule) {
  return Node {
    .kind = NodeKind.RULE,
    .rule = rule,
  };
}
fn Node triple_node(Node a, Node b, Node c) {
  return Node {
    .kind = NodeKind.TRIPLE,
    .triop = @tclone(NodeTriOp { a, b, c }),
  };
}
fn Node number_node(float number) {
  return Node {
    .kind = NodeKind.NUMBER,
    .value.number = number,
  };
}
fn Node random_node() {
  return Node {
    .kind = NodeKind.RANDOM,
  };
}
fn Node x_node() {
  return Node {
    .kind = NodeKind.X,
  };
}
fn Node y_node() {
  return Node {
    .kind = NodeKind.Y,
  };
}
fn Node t_node() {
  return Node {
    .kind = NodeKind.T,
  };
}

struct Branch {
  Node f;
  float prob;
}
macro Branch branch(Node f, float prob = 0) {
  return Branch {
    .f = f,
    .prob = prob,
  };
}

def Rule = List(<Branch>);
def Grammar = List(<Rule>);

union EvaluatedNodeValue {
  float  single;
  float[3] triple;
}
struct EvalNode {
  bool is_triple;
  EvaluatedNodeValue value;
}
fault NodeEvalError {
  GRAMMAR_NODE_IN_EVAL,
  UNKNOWN_NODE_KIND,
  EXPECTED_SINGLE,
  EXPECTED_TRIPLE,
  EXPECTED_UNAOP_VALUE,
  EXPECTED_BINOP_VALUE,
  EXPECTED_TRIOP_VALUE,
}

fn EvalNode! Node.eval(&n, float x, float y, float t) {
  switch (n.kind) {
    case NodeKind.X:
    return EvalNode { .is_triple = false, .value.single = x };

    
    case NodeKind.Y:
    return EvalNode { .is_triple = false, .value.single = y };


    case NodeKind.NUMBER:
    return EvalNode { .is_triple = false, .value.single = n.value.number };


    case NodeKind.ADD:
    if (n.binop == null) return NodeEvalError.EXPECTED_BINOP_VALUE?;
    EvalNode a = n.binop.a.eval(x, y, t)!;
    if (a.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    EvalNode b = n.binop.b.eval(x, y, t)!;
    if (b.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    float result = a.value.single + b.value.single;
    return EvalNode { .is_triple = false, .value.single = result };


    case NodeKind.MULT:
    if (n.binop == null) return NodeEvalError.EXPECTED_BINOP_VALUE?;
    EvalNode a = n.binop.a.eval(x, y, t)!;
    if (a.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    EvalNode b = n.binop.b.eval(x, y, t)!;
    if (b.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    float result = a.value.single * b.value.single;
    return EvalNode { .is_triple = false, .value.single = result };


    case NodeKind.SQRT:
    if (n.unaop == null) return NodeEvalError.EXPECTED_UNAOP_VALUE?;
    EvalNode a = n.unaop.eval(x, y, t)!;
    if (a.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    float result = $$sqrt(a.value.single);
    return EvalNode { .is_triple = false, .value.single = result };


    case NodeKind.TRIPLE:
    if (n.triop == null) return NodeEvalError.EXPECTED_TRIOP_VALUE?;
    float[3] triple = { 0, 0, 0 };

    EvalNode a = n.triop.a.eval(x, y, t)!;
    if (a.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    triple[0] = a.value.single;

    EvalNode b = n.triop.b.eval(x, y, t)!;
    if (b.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    triple[1] = b.value.single;

    EvalNode c = n.triop.c.eval(x, y, t)!;
    if (c.is_triple) return NodeEvalError.EXPECTED_SINGLE?;
    triple[2] = c.value.single;

    return EvalNode { .is_triple = true, .value.triple = triple };


    case NodeKind.RULE:
    case NodeKind.RANDOM:
    return NodeEvalError.GRAMMAR_NODE_IN_EVAL?;

    default:
    return NodeEvalError.UNKNOWN_NODE_KIND?;
  }
}

struct ResultFlt {
  bool ok;
  float val;
  String err;
}

struct ResultFlt3 {
  bool ok;
  float[3] val;
  String err;
}


struct NodeLexer {
  usz i, n;
  String string;
  List(<String>) tokens;
  Node* result;
}
fn void NodeLexer.init(&self, String string) {
  self.string = string;
  self.tokens.new_init();
}

fn char* NodeLexer.advance(&self) {
  usz i = self.i + self.n;
  char c = self.string[i];
  while (c.is_space() || c == ',' || c == '(' || c == ')') {
    if (i + 1 >= self.string.len) {
      eprintn("Expected token but hit end of string");
      return null;
    }
    c = self.string[++i];
  }
  self.i = i;
  usz n = 1;
  if (i + n > self.string.len) {
    eprintn("Expected token of at least length 1 but hit end of string");
    return null;
  }
  c = self.string[i + n];
  while (!(c.is_space() || c == ',' || c == '(' || c == ')')) {
    if (i + n + 1 > self.string.len) {
      break;
    }
    ++n;
    c = self.string[i + n];
  }
  self.n = n;
  if (i + n >= self.string.len) {
    eprintn("Expected end of token but hit end of string");
    return null;
  }
  self.tokens.push((String) self.at());
  return &self.string[self.i];
}

fn char[] NodeLexer.at(&self) {
  return self.string[self.i:self.n];
}



/*
* =======================
* | Exported Functions
* ----------------------
*/

fn usz resultFlt_struct_size() @inline @export("ResultFlt_sizeof") @wasm {
  return ResultFlt.sizeof;
}

fn void ResultFlt.free(&self) @export("ResultFlt_free") @wasm {
  self.err.free();
  temp_free(self);
}

fn usz resultFlt3_struct_size() @inline @export("ResultFlt3_sizeof") @wasm {
  return ResultFlt3.sizeof;
}

fn void ResultFlt3.free(&self) @export("ResultFlt3_free") @wasm {
  self.err.free();
  temp_free(self);
}



fn Node* parse_function_from_cstr(ZString cstr) @export("parse_function_from_cstr") @wasm {
  String str = cstr.str_view();
  NodeLexer l;
  l.string = str;
  printn(str);

  if (l.advance() == null) {
    eprintn("Failed to read function from cstr");
    return null;
  }
  String token = (String) l.at();
  String message = string::tformat("Token(%d:%d) <- %s", l.i, l.n, token);
  printn(message);
  message.free(allocator::temp());
  // tokens.push(token);
  while (l.advance() != null) {
    token = (String) l.at();
    message = string::tformat("Token(%d:%d) <- %s", l.i, l.n, token);
    printn(message);
    message.free(allocator::temp());
    // tokens.push(token);
  }

  l.tokens.reverse();
  List(<float>) stack;
  stack.new_init();

  DString dstr;
  defer dstr.free();
  dstr.append_chars("Start -> ");
  foreach(&tok : l.tokens) {
    dstr.append_chars(*tok);
    dstr.append_chars(" -> ");
  }
  dstr.append_chars("End");
  printn(dstr.str_view());
  dstr.clear();

  List(<String>) *tokens = @clone(l.tokens);
  defer mem::free(tokens);
  while (tokens.len() > 0) {
    String tok = tokens.pop_first()!!;
    // printfn("Checking token: %s", tok);
    switch (tok) {
      case "Add":
      float a, b;
      {
        float! item = stack.pop();
        if (catch excuse = (item)) {
          eprintn("Not enough items in stack for add operation! Found 0 numbers but requires 2");
          return null;
        }
        // a = anycast(item, String).to_float()!!;
        a = item;
      }
      {
        float! item = stack.pop();
        if (catch excuse = item) {
          eprintn("Not enough items in stack for add operation! Found only 1 number but requires 2");
          return null;
        }
        // b = anycast(item, String).to_float()!!;
        b = item;
      }
      float c = a + b;
      printfn("(+ %f %f)\n= %f", a, b, c);
      stack.push(c);
      // printfn("Pushing to stack: %f", c);
      break;

      case "Mult":
      float a, b;
      {
        float! item = stack.pop();
        if (catch excuse = item) {
          eprintn("Not enough items in stack for mult operation! Found 0 numbers but requires 2");
          return null;
        }
        // a = anycast(item, String).to_float()!!;
        a = item;
      }
      {
        float! item = stack.pop();
        if (catch excuse = item) {
          eprintn("Not enough items in stack for mult operation! Found only 1 number but requires 2");
          return null;
        }
        // b = anycast(item, String).to_float()!!;
        b = item;
      }
      float c = a * b;
      printfn("(* %f %f)\n= %f", a, b, c);
      stack.push(c);
      // printfn("Pushing to stack: %f", c);
      break;

      case "Sqrt":
      float! item = stack.pop();
      if (catch excuse = item) {
        eprintn("Not enough items in stack for sqrt operation! Found 0 numbers but requires 2");
        return null;
      }
      stack.push(math::sqrt(item));
      break;

      default:
      // printfn("Pushing to the stack: %s", tok);
      float! num = tok.to_float();
      if (catch excuse = num) {
        eprintfn("Failed to transform item(%s) to float: %s", tok, excuse);
        return null;
      }
      stack.push(num);
      break;
    }
  }


  dstr.append_chars("Stack result:");
  foreach(item: stack) {
    dstr.appendf(" %f", item);
    // switch (item) {
    //   case float:
    //   dstr.appendf("%f", *item);
    //   break;
    //   case String:
    //   dstr.appendf("%s", *item);
    //   break;
    // }
  }
  
  String msg = dstr.str_view();
  printn(msg);
  msg.free();
  
  return l.result;
}



fn Node* new_tnode(char kind) @export("new_tnode") @wasm {
  Node* node = @tclone(Node { .kind = (NodeKind) kind });
  if (node.kind == NodeKind.NUMBER) node.value.number = 69;
  if (node.kind == NodeKind.TRIPLE) {
    node.triop = @tclone(NodeTriOp {
      number_node(34),
      number_node(0),
      number_node(35),
    });
  }
  return node;
}

fn float get_node_number(Node* n) @export("get_node_number") @wasm {
  return n.value.number;
}
fn bool get_node_bool(Node* n) @export("get_node_bool") @wasm {
  return n.value.boolean;
}

fn void tnode_free(Node* n) @export("tNode_free") @wasm {
  if (n.unaop != null) temp_free(n.unaop);
  if (n.binop != null) temp_free(n.binop);
  if (n.triop != null) temp_free(n.triop);
  temp_free(n);
}

fn usz node_size() @inline @export("node_size") @wasm {
  return Node.sizeof;
}

fn ResultFlt* Node.as_single_value(Node* f, float x, float y, float t) @export("Node_as_single_value") @wasm {
  EvalNode! n = f.eval(x, y, t);
  if (catch excuse = n) {
    return @tclone(ResultFlt {
      .ok = false,
      .err = string::format("Failed to evaluate node: %s", excuse, allocator: allocator::heap()),
    });
  }
  if (n.is_triple) return @tclone(ResultFlt {
    .ok = false,
    .err = "Node returned was triple but expected a single",
  });
  return @tclone(ResultFlt {
    .ok = true,
    .val = n.value.single,
  });
}

fn ResultFlt3* Node.as_triple_value(Node* f, float x, float y, float t) @export("Node_as_triple_value") @wasm {
  EvalNode! n = f.eval(x, y, t);
  if (catch excuse = n) {
    return @tclone(ResultFlt3 {
      .ok = false,
      .err = string::format("Failed to evaluate node: %s", excuse, allocator: allocator::heap()),
    });
  }
  if (!n.is_triple) return @tclone(ResultFlt3 {
    .ok = false,
    .err = "Node returned was single but expected a triple",
  });
  return @tclone(ResultFlt3 {
    .ok = true,
    .val = n.value.triple,
  });
}


fn Rule* new_rule() @export("new_rule") @wasm {
  Rule* rule = mem::new(Rule);
  rule.new_init();
  return rule;
}

fn usz Rule.branches_count(&self) @inline @export("Rule_branches_count") @wasm {
  return self.len();
}

// TODO: Actually write the rule branches into a DString
fn char* Rule.to_cstr(&self) @export("Rule_to_cstr") @wasm {
  String s = "[Object Rule{foo,bar,baz}]";
  char* c = mem::new_array(char, s.len+1);
  for (usz i = 0; i < s.len; ++i) {
    char ch = s[i];
    c[i] = ch;
  }
  c[s.len] = 0;
  return c;
}

fn void Rule.push_number(&self, float num, float prob) @export("Rule_push_num") @wasm {
  Branch b = branch(number_node(num), prob);
  self.push(b);
}

fn void Rule.push_random(&self, float prob) @export("Rule_push_random") @wasm {
  Branch b = branch(random_node(), prob);
  self.push(b);
}

fn void Rule.push_node_ptr(&self, Node* n, float prob = 0) @export("Rule_push_node_ptr") @wasm {
  Branch b = branch(*n, prob);
  self.push(b);
}

fn void Rule.push_rule(&self, int rule, float prob = 0) @export("Rule_push_rule") @wasm {
  Branch b = branch(rule_node(rule), prob);
  self.push(b);
}

fn void free_rule(Rule* r) @export("free_rule") @wasm {
  r.free();
  mem::free(r);
}

fn Grammar* new_grammar() @export("new_grammar") @wasm {
  Grammar* grammar = mem::new(Grammar);
  grammar.new_init();
  return grammar;
}

fn void Grammar.push_rule_ptr(&self, Rule* r) @export("Grammar_push_rule_ptr") @wasm {
  self.push(*r);
}

fn void free_grammar(Grammar* g) @export("free_grammar") @wasm {
  g.free();
  mem::free(g);
}


fn void* mem_malloc_char(usz len) @export("mem_malloc_char") @wasm {
  return mem::malloc(char.sizeof * len);
}

fn void mem_free(void* ptr) @export("mem_free") @wasm {
  mem::free(ptr);
}
fn void temp_free(void* ptr) @inline @export("temp_free") @wasm {
  return allocator::free(allocator::temp(), ptr);
}

/*
* =======================
* | JS Functions
* ----------------------
*/

extern fn void _js_printn(usz len, char* str) @extern("printn");
fn void printn(String message) {
  _js_printn(message.len, &message[0]);
}
fn void printfn(String fmt, data...) {
  String message = string::tformat(fmt, ...data);
  printn(message);
  message.free(allocator::temp());
}
extern fn void _js_eprintn(usz len, char* str) @extern("eprintn");
fn void eprintn(String message) {
  _js_eprintn(message.len, &message[0]);
}
fn void eprintfn(String fmt, data...) {
  String message = string::tformat(fmt, ...data);
  eprintn(message);
  message.free(allocator::temp());
}
