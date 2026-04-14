import * as vscode from "vscode";
import * as path from "path";
import { convertHtmlToIpynb } from "./converter";

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

      const ipynb = convertHtmlToIpynb(html, includeOutputs);

      const currentFilePath = fileUri.fsPath;
      const newFilePath = currentFilePath.replace(/\.html$/, ".ipynb");
      const newFileUri = vscode.Uri.file(newFilePath);

      try {
        await vscode.workspace.fs.writeFile(
          newFileUri,
          Buffer.from(JSON.stringify(ipynb, null, 1), "utf-8")
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
