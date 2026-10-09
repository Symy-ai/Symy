// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../table';

/**
 * table.tsx (116行) — shadcn 表格八件套。
 *
 * 锁定:
 * - Table: 容器 div (overflow-x-auto) 包 table
 * - 八件 data-slot 全标记 (组装全表验证)
 * - TableRow hover/selected class
 */
describe('Table 八件套', () => {
  afterEach(() => cleanup());

  function setup() {
    return render(
      <Table>
        <TableCaption>统计表</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>数值</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>拦截</TableCell>
            <TableCell>42</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>合计</TableCell>
            <TableCell>42</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
  }

  it('容器结构: overflow-x-auto 包原生 table', () => {
    setup();
    const container = document.querySelector('[data-slot="table-container"]') as HTMLElement;
    expect(container.className).toContain('overflow-x-auto');
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('八件 data-slot 全标记', () => {
    setup();
    for (const slot of ['table', 'table-header', 'table-body', 'table-footer', 'table-row', 'table-head', 'table-cell', 'table-caption']) {
      expect(document.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    }
  });

  it('语义元素映射 (thead/th/td/caption)+内容', () => {
    setup();
    expect(document.querySelector('[data-slot="table-header"]')?.tagName).toBe('THEAD');
    expect(screen.getByText('名称').tagName).toBe('TH');
    expect(screen.getByText('拦截').tagName).toBe('TD');
    expect(screen.getByText('统计表').tagName).toBe('CAPTION');
  });

  it('TableRow selected 态 class', () => {
    setup();
    const row = screen.getByText('拦截').closest('tr') as HTMLElement;
    expect(row.className).toContain('data-[state=selected]:bg-muted');
    expect(row.className).toContain('hover:bg-muted/50');
  });
});
