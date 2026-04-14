import * as vscode from "vscode";
import * as cheerio from "cheerio";
import * as path from "path";

interface Ipynb {
  cells: (CodeCell | MarkdownCell)[];
}

interface Cell {
  cell_type: "code" | "markdown";
  metadata: object;
  source: string[];
}

interface CodeCell extends Cell {
  cell_type: "code";
  execution_count: number | null;
  outputs: Output[];
}

interface MarkdownCell extends Cell {
  cell_type: "markdown";
}

type Output = StreamOutput | ExecuteResultOutput | DisplayDataOutput | ErrorOutput;

interface StreamOutput {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: string[];
}

interface ExecuteResultOutput {
  output_type: "execute_result";
  execution_count: number | null;
  data: Record<string, string[] | string>;
  metadata: object;
}

interface DisplayDataOutput {
  output_type: "display_data";
  data: Record<string, string[] | string>;
  metadata: object;
}

interface ErrorOutput {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}

function toLines(text: string): string[] {
  if (!text) {
    return [];
  }
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line, i, arr) =>
    i < arr.length - 1 ? line + "\n" : line
  );
}

function parseOutputs(
  $: cheerio.CheerioAPI,
  outputArea: ReturnType<cheerio.CheerioAPI>
): Output[] {
  const outputs: Output[] = [];

  outputArea.find(".jp-OutputArea-child").each((_, child) => {
    const childEl = $(child);
    const outputDiv = childEl.find(".jp-OutputArea-output").first();
    const mimeType = outputDiv.attr("data-mime-type");

    if (!mimeType) {
      return;
    }

    if (
      mimeType === "application/vnd.jupyter.stdout" ||
      mimeType === "application/vnd.jupyter.stderr"
    ) {
      const name = mimeType.includes("stdout") ? "stdout" : "stderr";
      const text = outputDiv.find("pre").text() || outputDiv.text();
      outputs.push({
        output_type: "stream",
        name,
        text: toLines(text),
      });
    } else if (mimeType === "application/vnd.jupyter.error") {
      const rawText = outputDiv.find("pre").text() || outputDiv.text();
      const tracebackLines = toLines(rawText);
      const ename = tracebackLines.length > 0
        ? tracebackLines[tracebackLines.length - 1].split(":")[0].trim()
        : "";
      const evalue = tracebackLines.length > 0
        ? tracebackLines[tracebackLines.length - 1].split(":").slice(1).join(":").trim()
        : "";
      outputs.push({
        output_type: "error",
        ename,
        evalue,
        traceback: tracebackLines,
      });
    } else {
      const isExecuteResult = childEl.hasClass("jp-OutputArea-executeResult");

      const data: Record<string, string[] | string> = {};

      if (mimeType === "text/plain") {
        const text = outputDiv.find("pre").text();
        data["text/plain"] = toLines(text);
      } else if (mimeType === "text/html") {
        const innerHtml = outputDiv.html() ?? "";
        data["text/html"] = toLines(innerHtml);
      } else if (mimeType === "image/png") {
        const src = outputDiv.find("img").attr("src") ?? "";
        data["image/png"] = src.replace(/^data:image\/png;base64,/, "");
      } else if (mimeType === "image/svg+xml") {
        const svg = outputDiv.html() ?? "";
        data["image/svg+xml"] = toLines(svg);
      } else {
        const text = outputDiv.text();
        data[mimeType] = toLines(text);
      }

      if (isExecuteResult) {
        const outputPrompt = childEl.find(".jp-OutputPrompt").text();
        const execCountMatch = outputPrompt.match(/Out\s*\[(\d+)\]/);
        const execution_count = execCountMatch
          ? parseInt(execCountMatch[1], 10)
          : null;
        outputs.push({
          output_type: "execute_result",
          execution_count,
          data,
          metadata: {},
        });
      } else {
        outputs.push({
          output_type: "display_data",
          data,
          metadata: {},
        });
      }
    }
  });

  return outputs;
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "html2ipynb.convert",
    async (contextUri?: vscode.Uri) => {
      let fileUri: vscode.Uri;

      if (contextUri) {
        fileUri = contextUri;
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage("アクティブなエディタがありません。");
          return;
        }
        if (editor.document.languageId !== "html") {
          vscode.window.showErrorMessage(
            "HTMLファイルを開いて実行してください。"
          );
          return;
        }
        fileUri = editor.document.uri;
      }

      if (!fileUri.fsPath.endsWith(".html")) {
        vscode.window.showErrorMessage("HTMLファイルを指定してください。");
        return;
      }

      const config = vscode.workspace.getConfiguration("html2ipynb");
      const includeOutputs = config.get<boolean>("includeOutputs", true);

      const fileBytes = await vscode.workspace.fs.readFile(fileUri);
      const html = Buffer.from(fileBytes).toString("utf-8");
      const $ = cheerio.load(html);

      const ipynb: Ipynb = {
        cells: [],
      };

      $("div.jp-Cell").each((_, element) => {
        const cell = $(element);

        if (cell.hasClass("jp-MarkdownCell")) {
          const sourceDiv = cell.find("div.jp-RenderedMarkdown");
          const sourceText = sourceDiv.html();
          if (!sourceText) {
            return;
          }

          const formattedSource = sourceText
            .replace(/¶/g, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(h[1-6]|p|div)>/gi, "\n")
            .replace(/<h1[^>]*>/gi, "# ")
            .replace(/<h2[^>]*>/gi, "## ")
            .replace(/<h3[^>]*>/gi, "### ")
            .replace(/<h4[^>]*>/gi, "#### ")
            .replace(/<h5[^>]*>/gi, "##### ")
            .replace(/<h6[^>]*>/gi, "###### ")
            .replace(/<[^>]+>/g, "")
            .trim();

          const markdownCell: MarkdownCell = {
            cell_type: "markdown",
            metadata: {},
            source: formattedSource
              .split("\n")
              .map((line) => line.trim() + "\n"),
          };
          if (markdownCell.source.length > 0) {
            const lastLine =
              markdownCell.source[markdownCell.source.length - 1];
            markdownCell.source[markdownCell.source.length - 1] =
              lastLine.trimEnd();
          }
          ipynb.cells.push(markdownCell);
        } else if (cell.hasClass("jp-CodeCell")) {
          const inputPrompt = cell.find("div.jp-InputPrompt").text();
          const executionCountMatch = inputPrompt.match(/In\s*\[(\d+)\]/);
          const execution_count = executionCountMatch
            ? parseInt(executionCountMatch[1], 10)
            : null;

          const sourceCode = cell.find("div.jp-InputArea pre").text();
          const rawLines = sourceCode.split("\n");

          while (
            rawLines.length > 0 &&
            rawLines[rawLines.length - 1].trim() === ""
          ) {
            rawLines.pop();
          }

          const formattedSource = rawLines.map((line, i) =>
            i < rawLines.length - 1 ? line + "\n" : line
          );

          let outputs: Output[] = [];
          if (includeOutputs) {
            const outputArea = cell.find("div.jp-OutputArea").first();
            outputs = parseOutputs($, outputArea);
          }

          const codeCell: CodeCell = {
            cell_type: "code",
            execution_count: execution_count,
            metadata: {},
            source: formattedSource,
            outputs,
          };
          if (codeCell.source.length > 0) {
            const lastLine = codeCell.source[codeCell.source.length - 1];
            codeCell.source[codeCell.source.length - 1] = lastLine.trimEnd();
          }
          ipynb.cells.push(codeCell);
        }
      });

      const currentFilePath = fileUri.fsPath;
      const newFilePath = currentFilePath.replace(/\.html$/, ".ipynb");

      const ipynbContent = JSON.stringify(ipynb, null, 1);
      const newFileUri = vscode.Uri.file(newFilePath);

      try {
        await vscode.workspace.fs.writeFile(
          newFileUri,
          Buffer.from(ipynbContent, "utf-8")
        );
        vscode.window.showInformationMessage(
          `${path.basename(newFilePath)} に変換しました。`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `ファイルの保存に失敗しました: ${error}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
