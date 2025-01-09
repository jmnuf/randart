import std::io;
import std::os::process;
import std::collections;

def StrList = List(<String>);

struct Command {
  StrList parts;
  SubProcess proc;
}

fn Command* Command.new_init(&self, String cmd) {
  self.parts.new_init();
  self.parts.push(cmd);
  return self;
}

fn Command* Command.arg(&self, String arg) {
  self.parts.push(arg);
  return self;
}

macro Command* Command.args(&self, ...) {
  $for (var $i = 0; $i < $vacount; ++$i)
    self.arg($vaconst[$i]);
  $endfor
  return self;
}

fn bool Command.clear(&self) {
  if (try self.proc.is_running()) {
    io::eprintn("[ERROR] Attempting to clear command that's currently running");
    return false;
  }
  self.parts.clear();
  return true;
}

fn void! Command.run_async(&self) {
  SubProcessOptions options = {
    /* .combined_stdout_stderr = true, */
    .inherit_environment = true,
  };
  io::print("[CMD]");
  foreach (String arg : self.parts) {
    if (arg.contains(" ")) {
      io::printf(" '%s'", arg);
    } else {
      io::printf(" %s", arg);
    }
  }
  io::print("\n");
  self.proc = process::create(self.parts.to_tarray(), options)!;
}

fn CInt! Command.run_sync(&self) {
  self.run_async()!;
  return self.proc.join();
}

fn void Command.print_stdout(&self) {
  const usz BUF_SIZE = 1024;
  char *buf = mem::new_array(char, BUF_SIZE);
  defer free(buf);
  for (;;) {
    usz! len = self.proc.read_stdout(buf, BUF_SIZE);
    if (catch excuse = len) {
      io::eprintfn("[ERROR] Failed to read from stdout: %s", excuse);
      return;
    }
    if (len == 0) {
      break;
    }
    io::printf("%s", (ZString) buf[0:len]);
  };
}


fn void Command.print_stderr(&self) {
  const usz BUF_SIZE = 1024;
  char *buf = mem::new_array(char, BUF_SIZE);
  defer free(buf);
  for (;;) {
    usz! len = self.proc.read_stderr(buf, BUF_SIZE);
    if (catch excuse = len) {
      io::eprintfn("[ERROR] Failed to read from stderr: %s", excuse);
      return;
    }
    if (len == 0) {
      break;
    }
    io::printf("%s", (ZString) buf[0:len]);
  };
}

fn void Command.print_output(&self) {
  self.print_stderr();
  self.print_stdout();
}

const String WASM_OUTPATH = "./public/randart";

fn bool build_wasm() {
  Command cmd = {};
  defer cmd.parts.free();
  cmd.new_init("c3c")
    .arg  ("compile")
    .arg  ("--reloc=none")
    .args ("--target", "wasm32")
    .args ("-O5", "-g0", "--link-libc=no", "--no-entry")
    .arg  ("--trust=full")
    .args ("-o", WASM_OUTPATH)
    .args ("-z", "--export-table")
    .arg  ("c3-src/main.c3");

  CInt! code = cmd.run_sync();
  if (catch excuse = code) {
    io::eprintfn("[ERROR] %s", excuse);
    return false;
  }
  cmd.print_output();
  if (code != 0) {
    io::eprintn("[ERROR] Failed to build wasm");
    return false;
  }
  io::printfn("[INFO] Built wasm: %s.wasm", WASM_OUTPATH);
  return true;
}

fn bool build_mainjs() {
  Command cmd = {};
  defer cmd.parts.free();
  cmd.new_init("bun").args("run", "build");

  CInt! code = cmd.run_sync();
  if (catch excuse = code) {
    io::eprintfn("[ERROR] %s", excuse);
    return false;
  }
  cmd.print_output();
  if (code != 0) {
    return false;
  }
  return true;
}

fn ZString shift_arr(int* sz, char*** arr) {
  ZString item = (ZString) (*arr)[0];
  *arr += 1;
  *sz -= 1;
  return item;
}

fn void print_usage(ZString program) {
    io::printfn("Usage: %s <item>", program);
    io::printfn("    %s all    ---  build c3 wasm & vite project", program);
    io::printfn("    %s wasm   ---  c3c build c3 wasm", program);
    io::printfn("    %s vite   ---  bun build vite project", program);
}

fn int main(int argc, char** argv) {
  ZString program = shift_arr(&argc, &argv);
  if (argc == 0) {
    io::eprintn("[ERROR] Missing argument for what to build");
    print_usage(program);
    return 1;
  }
  while (argc > 0) {
    ZString arg = shift_arr(&argc, &argv);
    String target = arg.str_view();
    if (target == "wasm" || target == "all") {
      if (!build_wasm()) return 1;
      if (target != "all") continue;
    }
    if (target == "vite" || target == "all") {
      if (!build_mainjs()) return 1;
      continue;
    }
    io::eprintfn("[ERROR] Unknown target: %s", target);
    print_usage(program);
    return 1;
  }
  return 0;
}
