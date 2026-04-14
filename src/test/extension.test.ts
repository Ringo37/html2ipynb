import * as assert from "assert";
import {
  toLines,
  parseOutputs,
  convertHtmlToIpynb,
  CodeCell,
  MarkdownCell,
  StreamOutput,
  ExecuteResultOutput,
  DisplayDataOutput,
  ErrorOutput,
} from "../converter";
import * as cheerio from "cheerio";

// ─── toLines ────────────────────────────────────────────────────────────────

suite("toLines", () => {
  test("空文字列は空配列を返す", () => {
    assert.deepStrictEqual(toLines(""), []);
  });

  test("1行のテキストはそのまま返す", () => {
    assert.deepStrictEqual(toLines("hello"), ["hello"]);
  });

  test("複数行は末尾以外に改行を付ける", () => {
    assert.deepStrictEqual(toLines("a\nb"), ["a\n", "b"]);
    assert.deepStrictEqual(toLines("a\nb\nc"), ["a\n", "b\n", "c"]);
  });

  test("末尾の空行は除去される", () => {
    assert.deepStrictEqual(toLines("a\nb\n"), ["a\n", "b"]);
    assert.deepStrictEqual(toLines("a\nb\n\n"), ["a\n", "b"]);
  });

  test("空行だけの文字列は空配列を返す", () => {
    assert.deepStrictEqual(toLines("\n"), []);
    assert.deepStrictEqual(toLines("\n\n"), []);
  });
});

// ─── parseOutputs ────────────────────────────────────────────────────────────

function makeOutputArea(innerHtml: string): {
  $: cheerio.CheerioAPI;
  area: ReturnType<cheerio.CheerioAPI>;
} {
  const $ = cheerio.load(
    `<div class="jp-OutputArea">${innerHtml}</div>`
  );
  const area = $("div.jp-OutputArea");
  return { $, area };
}

suite("parseOutputs", () => {
  test("stdout ストリーム出力をパースする", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="application/vnd.jupyter.stdout">
          <pre>Hello\nWorld</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 1);
    const out = outputs[0] as StreamOutput;
    assert.strictEqual(out.output_type, "stream");
    assert.strictEqual(out.name, "stdout");
    assert.deepStrictEqual(out.text, ["Hello\n", "World"]);
  });

  test("stderr ストリーム出力をパースする", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="application/vnd.jupyter.stderr">
          <pre>warning message</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 1);
    const out = outputs[0] as StreamOutput;
    assert.strictEqual(out.output_type, "stream");
    assert.strictEqual(out.name, "stderr");
  });

  test("execute_result (text/plain) をパースする", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child jp-OutputArea-executeResult">
        <div class="jp-OutputPrompt jp-OutputArea-prompt">Out [3]:</div>
        <div class="jp-OutputArea-output" data-mime-type="text/plain">
          <pre>42</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 1);
    const out = outputs[0] as ExecuteResultOutput;
    assert.strictEqual(out.output_type, "execute_result");
    assert.strictEqual(out.execution_count, 3);
    assert.deepStrictEqual(out.data["text/plain"], ["42"]);
  });

  test("execute_result の execution_count が取れない場合は null", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child jp-OutputArea-executeResult">
        <div class="jp-OutputPrompt jp-OutputArea-prompt">Out []:</div>
        <div class="jp-OutputArea-output" data-mime-type="text/plain">
          <pre>result</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    const out = outputs[0] as ExecuteResultOutput;
    assert.strictEqual(out.execution_count, null);
  });

  test("display_data (text/html) をパースする", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="text/html">
          <div><b>bold</b></div>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 1);
    const out = outputs[0] as DisplayDataOutput;
    assert.strictEqual(out.output_type, "display_data");
    assert.ok(
      (out.data["text/html"] as string[]).join("").includes("<b>bold</b>")
    );
  });

  test("display_data (image/png) をパースしてdata URIヘッダを除去する", () => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="image/png">
          <img src="data:image/png;base64,${b64}" />
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    const out = outputs[0] as DisplayDataOutput;
    assert.strictEqual(out.output_type, "display_data");
    assert.strictEqual(out.data["image/png"], b64);
  });

  test("エラー出力をパースする", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="application/vnd.jupyter.error">
          <pre>Traceback (most recent call last):
  File "test.py", line 1
ZeroDivisionError: division by zero</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 1);
    const out = outputs[0] as ErrorOutput;
    assert.strictEqual(out.output_type, "error");
    assert.strictEqual(out.ename, "ZeroDivisionError");
    assert.strictEqual(out.evalue, "division by zero");
    assert.ok(out.traceback.length > 0);
  });

  test("data-mime-type がない要素はスキップされる", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output">
          <pre>no mime type</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 0);
  });

  test("複数の出力をまとめてパースする", () => {
    const { $, area } = makeOutputArea(`
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="application/vnd.jupyter.stdout">
          <pre>line1</pre>
        </div>
      </div>
      <div class="jp-OutputArea-child jp-OutputArea-executeResult">
        <div class="jp-OutputPrompt">Out [1]:</div>
        <div class="jp-OutputArea-output" data-mime-type="text/plain">
          <pre>result</pre>
        </div>
      </div>
    `);
    const outputs = parseOutputs($, area);
    assert.strictEqual(outputs.length, 2);
    assert.strictEqual(outputs[0].output_type, "stream");
    assert.strictEqual(outputs[1].output_type, "execute_result");
  });
});

// ─── convertHtmlToIpynb ──────────────────────────────────────────────────────

const MARKDOWN_CELL_HTML = `
<div class="jp-Cell jp-MarkdownCell">
  <div class="jp-Cell-inputWrapper">
    <div class="jp-RenderedMarkdown">
      <h1>Title<a class="anchor-link" href="#Title">¶</a></h1>
      <p>Some <strong>text</strong>.</p>
    </div>
  </div>
</div>
`;

const CODE_CELL_HTML = `
<div class="jp-Cell jp-CodeCell">
  <div class="jp-Cell-inputWrapper">
    <div class="jp-InputArea">
      <div class="jp-InputPrompt">In [2]:</div>
      <pre>x = 1\nprint(x)</pre>
    </div>
  </div>
  <div class="jp-Cell-outputWrapper">
    <div class="jp-OutputArea jp-Cell-outputArea">
      <div class="jp-OutputArea-child">
        <div class="jp-OutputArea-output" data-mime-type="application/vnd.jupyter.stdout">
          <pre>1</pre>
        </div>
      </div>
    </div>
  </div>
</div>
`;

suite("convertHtmlToIpynb", () => {
  test("マークダウンセルを変換する", () => {
    const ipynb = convertHtmlToIpynb(MARKDOWN_CELL_HTML, false);
    assert.strictEqual(ipynb.cells.length, 1);
    const cell = ipynb.cells[0] as MarkdownCell;
    assert.strictEqual(cell.cell_type, "markdown");
    const joined = cell.source.join("");
    assert.ok(joined.includes("# Title"), `source: ${joined}`);
    assert.ok(joined.includes("Some"), `source: ${joined}`);
    assert.ok(!joined.includes("¶"), "ピルクロウ記号が残っている");
  });

  test("コードセルのソースと execution_count を変換する", () => {
    const ipynb = convertHtmlToIpynb(CODE_CELL_HTML, false);
    assert.strictEqual(ipynb.cells.length, 1);
    const cell = ipynb.cells[0] as CodeCell;
    assert.strictEqual(cell.cell_type, "code");
    assert.strictEqual(cell.execution_count, 2);
    assert.ok(cell.source.join("").includes("x = 1"));
  });

  test("includeOutputs: true のとき outputs を含む", () => {
    const ipynb = convertHtmlToIpynb(CODE_CELL_HTML, true);
    const cell = ipynb.cells[0] as CodeCell;
    assert.strictEqual(cell.outputs.length, 1);
    assert.strictEqual(cell.outputs[0].output_type, "stream");
  });

  test("includeOutputs: false のとき outputs は空配列", () => {
    const ipynb = convertHtmlToIpynb(CODE_CELL_HTML, false);
    const cell = ipynb.cells[0] as CodeCell;
    assert.deepStrictEqual(cell.outputs, []);
  });

  test("コードセルのソース末尾の空行が除去される", () => {
    const html = `
      <div class="jp-Cell jp-CodeCell">
        <div class="jp-Cell-inputWrapper">
          <div class="jp-InputArea">
            <div class="jp-InputPrompt">In [1]:</div>
            <pre>print("hi")\n\n</pre>
          </div>
        </div>
      </div>
    `;
    const ipynb = convertHtmlToIpynb(html, false);
    const cell = ipynb.cells[0] as CodeCell;
    const last = cell.source[cell.source.length - 1];
    assert.ok(!last.endsWith("\n"), `末尾行が改行で終わっている: "${last}"`);
  });

  test("jp-Cell でない要素は無視される", () => {
    const html = `<div class="jp-Cell jp-CodeCell">
      <div class="jp-Cell-inputWrapper">
        <div class="jp-InputArea">
          <div class="jp-InputPrompt">In [1]:</div>
          <pre>a = 1</pre>
        </div>
      </div>
    </div>
    <div class="unrelated">ignored</div>`;
    const ipynb = convertHtmlToIpynb(html, false);
    assert.strictEqual(ipynb.cells.length, 1);
  });

  test("マークダウンとコードが混在する場合に順序を保つ", () => {
    const html = MARKDOWN_CELL_HTML + CODE_CELL_HTML;
    const ipynb = convertHtmlToIpynb(html, false);
    assert.strictEqual(ipynb.cells.length, 2);
    assert.strictEqual(ipynb.cells[0].cell_type, "markdown");
    assert.strictEqual(ipynb.cells[1].cell_type, "code");
  });
});
