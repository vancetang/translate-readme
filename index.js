const { readFileSync, writeFileSync, readdirSync } = require("fs");
const { join } = require("path");
const core = require("@actions/core");
const $ = require("@k3rn31p4nic/google-translate-api");
const unified = require("unified");
const parse = require("remark-parse");
const stringify = require("remark-stringify");
const visit = require("unist-util-visit");
const simpleGit = require("simple-git");
const git = simpleGit();

// 解析 Markdown 為 AST
const toAst = (markdown) => {
  return unified().use(parse).parse(markdown);
};

// 將 AST 轉回 Markdown
const toMarkdown = (ast) => {
  return unified().use(stringify).stringify(ast);
};

// 從 GitHub Actions 輸入或命令列參數獲取輸入檔案
const getInputFile = () => {
  let inputFromAction = core.getInput("input");
  if (inputFromAction) {
    console.log(`Input from action: ${inputFromAction}`);
    return inputFromAction;
  }

  const args = process.argv;
  const inputIndex = args.indexOf("--input");
  if (inputIndex !== -1 && inputIndex + 1 < args.length) {
    const inputFromCli = args[inputIndex + 1];
    console.log(`Input from CLI: ${inputFromCli}`);
    return inputFromCli;
  }

  const mainDir = ".";
  const defaultFile = readdirSync(mainDir).includes("readme.md")
    ? "readme.md"
    : "README.md";
  console.log(`Using default file: ${defaultFile}`);
  return defaultFile;
};

// 主邏輯
console.log("Starting Vance Custom translation process");
const mainDir = ".";
const inputFile = getInputFile();
if (!inputFile) {
  throw new Error(
    "No input file specified. Please provide --input or set input parameter."
  );
}
const lang = core.getInput("LANG") || "zh-CN";
const fileContent = readFileSync(join(mainDir, inputFile), {
  encoding: "utf8",
});
const fileAST = toAst(fileContent);
console.log("AST CREATED AND READ");

let originalText = [];

visit(fileAST, async (node) => {
  if (node.type === "text") {
    originalText.push(node.value);
    node.value = (await $(node.value, { to: lang })).text;
  }
});

const translatedText = originalText.map(async (text) => {
  return (await $(text, { to: lang })).text;
});

async function writeToFile() {
  await Promise.all(translatedText);
  // 使用 inputFile 的路徑生成輸出檔案名稱
  const outputFile = inputFile.replace(/\.md$/, `.${lang}.md`);
  writeFileSync(join(mainDir, outputFile), toMarkdown(fileAST), "utf8");
  console.log(`${outputFile} written`);
}

async function commitChanges(lang) {
  console.log("commit started");
  await git.add("./*");
  await git.addConfig("user.name", "github-actions[bot]");
  await git.addConfig(
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com"
  );
  await git.commit(
    `docs: Added ${inputFile}.${lang}.md translation via https://github.com/vancetang/translate-readme`
  );
  console.log("finished commit");
  await git.push();
  console.log("pushed");
}

async function translateReadme() {
  try {
    await writeToFile();
    await commitChanges(lang);
    console.log("Done");
  } catch (error) {
    throw new Error(error);
  }
}

translateReadme();
