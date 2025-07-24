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

type Output = ExecuteResult | DisplayData | Stream | Error;

interface BaseOutput {
  output_type: "execute_result" | "display_data" | "stream" | "error";
}

interface ExecuteResult extends BaseOutput {
  output_type: "execute_result";
  execution_count: number | null;
  data: { [key: string]: string[] };
  metadata: object;
}

interface DisplayData extends BaseOutput {
  output_type: "display_data";
  data: { [key: string]: string[] };
  metadata: object;
}

interface Stream extends BaseOutput {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: string[];
}

interface Error extends BaseOutput {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "html2ipynb.convert",
    async () => {
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

      const html = editor.document.getText();
      const $ = cheerio.load(html);

      const ipynb: Ipynb = {
        cells: [],
      };

      $("div.jp-Cell").each((_, element) => {
        const cell = $(element);

        if (cell.hasClass("jp-MarkdownCell")) {
          const sourceDiv = cell.find("div.jp-RenderedMarkdown");
          const sourceText = sourceDiv.text();
          const formattedSource = sourceText
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(h[1-6]|p|div)>/gi, "\n")
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

          const codeCell: CodeCell = {
            cell_type: "code",
            execution_count: execution_count,
            metadata: {},
            outputs: [],
            source: formattedSource,
          };
          if (codeCell.source.length > 0) {
            const lastLine = codeCell.source[codeCell.source.length - 1];
            codeCell.source[codeCell.source.length - 1] = lastLine.trimEnd();
          }
          ipynb.cells.push(codeCell);
        }
      });

      const currentFilePath = editor.document.uri.fsPath;
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
