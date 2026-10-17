// Loads the inline <script> of ../index.html inside a Node vm sandbox and
// hands back its internal functions, so the text pipeline can be tested
// without a browser. Nothing here is used by the live page.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const INDEX = path.join(__dirname, "..", "index.html");

function fakeElement() {
  const el = {
    value: "", innerHTML: "", textContent: "", className: "",
    style: {}, dataset: {}, children: [],
    selectionStart: 0, selectionEnd: 0, offsetLeft: 0, offsetWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
    appendChild(c) { el.children.push(c); return c; }, remove() {},
    focus() {}, blur() {}, select() {}, setSelectionRange() {}, closest() { return null; },
    querySelector() { return fakeElement(); }, querySelectorAll() { return []; },
  };
  return el;
}

// fetchImpl(url, opts) -> Promise<Response-like>; used for the tweet APIs
function loadApp({ fetchImpl, userAgent = "node" } = {}) {
  const html = fs.readFileSync(INDEX, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error("no inline <script> found in index.html");
  let src = scripts[scripts.length - 1][1];

  // function declarations are hoisted, so a getter placed right after
  // "use strict" can reach every internal once the IIFE has run
  const hook = `globalThis.__app=function(){return{
    autoFix:autoFix, applyDirection:applyDirection, parse:parse, toHtml:toHtml, toPlain:toPlain,
    inline:inline, isMediaMetaLine:isMediaMetaLine, trimBlankEdges:trimBlankEdges,
    videoVariants:videoVariants, imageVariants:imageVariants, pickRecommended:pickRecommended,
    resolveTweet:resolveTweet, collectDirect:collectDirect, tweetIds:tweetIds,
    SIGNATURE:SIGNATURE, input:input, runsToMarkdown:runsToMarkdown, output:output,
    fixLines:fixLines
  };};`;
  if (!/"use strict";/.test(src)) throw new Error('"use strict"; marker not found');
  src = src.replace('"use strict";', '"use strict";' + hook);

  const elements = {};
  const document = {
    getElementById(id) { return elements[id] || (elements[id] = fakeElement()); },
    createElement() { return fakeElement(); },
    createDocumentFragment() { return fakeElement(); },
    hasFocus() { return true; },
    querySelector() { return fakeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    execCommand() { return true; },
    body: fakeElement(),
    activeElement: null,
  };
  const sandbox = {
    document,
    navigator: { userAgent, clipboard: {} },
    fetch: fetchImpl || (() => Promise.reject(new Error("network disabled in tests"))),
    setTimeout, clearTimeout, console,
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
    getSelection: () => ({ rangeCount: 0 }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "index.html<script>" });
  const app = sandbox.__app();
  app.elements = elements;
  return app;
}

module.exports = { loadApp, INDEX };
