// 技术方案文档守卫：确保 docs/技术方案.md 存在且选型结论完整
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const docPath = join(root, 'docs', '技术方案.md');

async function readDoc() {
  return readFile(docPath, 'utf8');
}

test('技术方案文档存在且非空', async () => {
  const content = await readDoc();
  assert.ok(content.trim().length > 100, 'docs/技术方案.md 应存在且有实质内容');
});

test('选型结论包含既定技术组合', async () => {
  const content = await readDoc();
  for (const keyword of ['Electron', 'React', 'TypeScript', 'Vite', 'Electron Forge']) {
    assert.ok(content.includes(keyword), `文档应包含选型关键词：${keyword}`);
  }
});

test('明确当前阶段不引入的范围', async () => {
  const content = await readDoc();
  for (const keyword of ['SQLite', 'Redux']) {
    assert.ok(content.includes(keyword), `文档应明确暂不引入：${keyword}`);
  }
});
