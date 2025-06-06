import * as vscode from "vscode";
import * as cheerio from "cheerio";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "html2ipynb.convert",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor.");
        return;
      }
      const html = editor.document.getText();
      const $ = cheerio.load(html);
      const title = $("title").text();
      vscode.window.showInformationMessage(`Title: ${title}`);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
