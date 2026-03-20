const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");

/** CONFIG **/
const PROJECT_DIR = "/Users/ken/Documents/Project/blueprint";       // folder code
const JSON_FILE = "/Users/ken/Documents/Project/blueprint/apps/fd/src/common/json/locales/en/translation.json";   // file chứa keys

const VALID_EXT = [".js", ".jsx", ".ts", ".tsx"];
const IGNORE_FILES = [".spec.js", ".spec.jsx"];
const IGNORE_DIRS = ["node_modules", "dist", "build", ".next", "coverage", ".git"];

/** STEP 1: LOAD KEYS **/
const json = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
const allKeys = Object.keys(json);

/** STEP 2: GET FILES **/
function getAllFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    if (IGNORE_DIRS.includes(item)) continue;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function isValidFile(file) {
  const ext = path.extname(file);

  if (!VALID_EXT.includes(ext)) return false;
  if (IGNORE_FILES.some(f => file.endsWith(f))) return false;

  return true;
}

const files = getAllFiles(PROJECT_DIR).filter(isValidFile);

/** STEP 3: AST EXTRACT **/
function walkAst(node, callback) {
  if (!node || typeof node !== "object") return;
  callback(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach(c => walkAst(c, callback));
    } else if (child && typeof child === "object" && child.type) {
      walkAst(child, callback);
    }
  }
}

function isTranslationCallee(node) {
  if (!node) return false;
  // t("key") or i18n.t("key") or props.t("key")
  if (node.type === "Identifier" && node.name === "t") return true;
  if (node.type === "MemberExpression" && node.property?.name === "t") return true;
  return false;
}

function extractKeysFromCode(code) {
  const keys = new Set();

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch (e) {
    return keys;
  }

  try {
    walkAst(ast, node => {
      if (
        node.type === "CallExpression" &&
        isTranslationCallee(node.callee) &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (arg.type === "StringLiteral") {
          keys.add(arg.value);
        } else if (arg.type === "TemplateLiteral") {
          const raw = arg.quasis.map(q => q.value.cooked).join("*");
          keys.add(raw);
        }
      }
    });
  } catch (e) {
    // skip files that cause walk errors
  }

  return keys;
}

/** STEP 4: NORMALIZE **/
function normalizeKeyVariants(key) {
  const parts = key.split("_");

  return [
    key,
    parts.join("."), // a.b.c
    parts.join("/"), // a/b/c
    parts
      .map((p, i) =>
        i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)
      )
      .join(""), // camelCase
  ];
}

/** STEP 5: FALLBACK **/
function isKeyUsedFallback(content, key) {
  const tokens = key.split("_");

  let index = 0;
  for (const token of tokens) {
    index = content.indexOf(token, index);
    if (index === -1) return false;
  }

  return true;
}

/** STEP 6: SCAN **/
const usedKeys = new Set();
let allContent = "";

for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  allContent += content;

  const extracted = extractKeysFromCode(content);
  extracted.forEach(k => usedKeys.add(k));
}

/** STEP 7: FIND UNUSED **/
const unused = [];

for (const key of allKeys) {
  const variants = normalizeKeyVariants(key);

  const matched =
    variants.some(v => usedKeys.has(v)) ||
    variants.some(v => allContent.includes(v)) ||
    isKeyUsedFallback(allContent, key);

  if (!matched) {
    unused.push(key);
  }
}

/** OUTPUT **/
console.log(`\n❌ Unused keys (${unused.length}):\n`);
unused.forEach(k => console.log(k));

/** OPTIONAL: EXPORT FILE **/
fs.writeFileSync(
  "unused-keys.json",
  JSON.stringify(unused, null, 2)
);