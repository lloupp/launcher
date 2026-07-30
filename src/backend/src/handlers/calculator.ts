import type { CalcEvaluatePayload, CalcEvaluateResult } from "../protocol.js";

/**
 * Safe math expression evaluator.
 *
 * Supports +, -, *, /, %, ^, parentheses, and common functions
 * (sin, cos, tan, sqrt, log, ln, abs, round, floor, ceil).
 * Also supports unit conversions via a simple lookup table.
 *
 * Security: the expression is sanitized to only allow numbers, operators,
 * parentheses, dots, and whitelisted function names. No `eval` of arbitrary
 * JS.
 */

const ALLOWED_FUNCTIONS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan",
  "sqrt", "cbrt", "abs", "round", "floor", "ceil",
  "log", "ln", "exp", "pow", "min", "max",
  "sign", "trunc", "hypot",
]);

/** Check if a token is a valid function name. */
function isFunction(name: string): boolean {
  return ALLOWED_FUNCTIONS.has(name);
}

/**
 * Tokenize the expression into numbers, operators, parens, identifiers.
 */
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t") { i++; continue; }
    // Number: digits and decimal point
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push(num);
      continue;
    }
    // Identifier: letters (function names, constants)
    if (/[a-zA-Z]/.test(c)) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { id += expr[i]; i++; }
      tokens.push(id);
      continue;
    }
    // Operators and parens
    if ("+-*/%^(),:".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    throw new Error(`Unexpected character: "${c}" at position ${i}`);
  }
  return tokens;
}

/** Shunting-yard algorithm to convert infix to RPN. */
interface OpInfo {
  precedence: number;
  rightAssoc: boolean;
}

const BINARY_OPS: Record<string, OpInfo> = {
  "^": { precedence: 4, rightAssoc: true },
  "*": { precedence: 3, rightAssoc: false },
  "/": { precedence: 3, rightAssoc: false },
  "%": { precedence: 3, rightAssoc: false },
  "+": { precedence: 2, rightAssoc: false },
  "-": { precedence: 2, rightAssoc: false },
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  inf: Infinity,
};

function toRPN(tokens: string[]): string[] {
  const output: string[] = [];
  const stack: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Number
    if (/^[0-9.]/.test(token)) {
      output.push(token);
      continue;
    }

    // Constant
    if (CONSTANTS[token] !== undefined) {
      output.push(String(CONSTANTS[token]));
      continue;
    }

    // Function
    if (isFunction(token)) {
      stack.push(token);
      continue;
    }

    // Comma — pop until left paren
    if (token === ",") {
      while (stack.length > 0 && stack[stack.length - 1] !== "(") {
        output.push(stack.pop()!);
      }
      continue;
    }

    // Operator
    if (BINARY_OPS[token]) {
      while (
        stack.length > 0 &&
        stack[stack.length - 1] !== "(" &&
        BINARY_OPS[stack[stack.length - 1]] &&
        (BINARY_OPS[stack[stack.length - 1]].precedence > BINARY_OPS[token].precedence ||
          (BINARY_OPS[stack[stack.length - 1]].precedence === BINARY_OPS[token].precedence &&
            !BINARY_OPS[token].rightAssoc))
      ) {
        output.push(stack.pop()!);
      }
      stack.push(token);
      continue;
    }

    // Left paren
    if (token === "(") {
      stack.push(token);
      continue;
    }

    // Right paren
    if (token === ")") {
      while (stack.length > 0 && stack[stack.length - 1] !== "(") {
        output.push(stack.pop()!);
      }
      if (stack.length === 0) throw new Error("Mismatched parentheses");
      stack.pop(); // Remove the "("
      // If top of stack is a function, push to output
      if (stack.length > 0 && isFunction(stack[stack.length - 1])) {
        output.push(stack.pop()!);
      }
      continue;
    }

    throw new Error(`Unexpected token: ${token}`);
  }

  // Pop remaining operators
  while (stack.length > 0) {
    const op = stack.pop()!;
    if (op === "(") throw new Error("Mismatched parentheses");
    output.push(op);
  }

  return output;
}

/** Evaluate RPN. */
function evalRPN(rpn: string[]): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (/^-?[0-9.]/.test(token)) {
      stack.push(parseFloat(token));
      continue;
    }

    if (BINARY_OPS[token]) {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Invalid expression");
      switch (token) {
        case "+": stack.push(a + b); break;
        case "-": stack.push(a - b); break;
        case "*": stack.push(a * b); break;
        case "/": stack.push(a / b); break;
        case "%": stack.push(a % b); break;
        case "^": stack.push(Math.pow(a, b)); break;
      }
      continue;
    }

    if (isFunction(token)) {
      if (token === "min" || token === "max" || token === "pow" || token === "hypot") {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) throw new Error("Invalid expression");
        stack.push(token === "min" ? Math.min(a, b) : token === "max" ? Math.max(a, b) : token === "pow" ? Math.pow(a, b) : Math.hypot(a, b));
      } else {
        const a = stack.pop();
        if (a === undefined) throw new Error("Invalid expression");
        switch (token) {
          case "sin": stack.push(Math.sin(a)); break;
          case "cos": stack.push(Math.cos(a)); break;
          case "tan": stack.push(Math.tan(a)); break;
          case "asin": stack.push(Math.asin(a)); break;
          case "acos": stack.push(Math.acos(a)); break;
          case "atan": stack.push(Math.atan(a)); break;
          case "sqrt": stack.push(Math.sqrt(a)); break;
          case "cbrt": stack.push(Math.cbrt(a)); break;
          case "abs": stack.push(Math.abs(a)); break;
          case "round": stack.push(Math.round(a)); break;
          case "floor": stack.push(Math.floor(a)); break;
          case "ceil": stack.push(Math.ceil(a)); break;
          case "log": stack.push(Math.log10(a)); break;
          case "ln": stack.push(Math.log(a)); break;
          case "exp": stack.push(Math.exp(a)); break;
          case "sign": stack.push(Math.sign(a)); break;
          case "trunc": stack.push(Math.trunc(a)); break;
        }
      }
    }
  }

  if (stack.length !== 1) throw new Error("Invalid expression");
  return stack[0];
}

/** Format a number for display. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

export async function handleCalcEvaluate(
  payload: CalcEvaluatePayload,
): Promise<CalcEvaluateResult> {
  const expr = payload.expression.trim();
  if (!expr) throw new Error("Empty expression");

  const tokens = tokenize(expr);
  const rpn = toRPN(tokens);
  const result = evalRPN(rpn);

  return {
    result: String(result),
    formatted: formatNumber(result),
  };
}
