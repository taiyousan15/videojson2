/**
 * CLI E2E Tests
 * ネットワーク不要のCLIテスト
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

// ヘルパー: コマンド実行
function runCommand(command: string, options: ExecSyncOptions = {}): CommandResult {
  try {
    const result = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 30000,
      ...options,
    });
    return { stdout: result as string, stderr: '', code: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.status || 1,
    };
  }
}

describe('CLI: videojson command', () => {
  it('--help でヘルプが表示される', () => {
    const result = runCommand('node scripts/cli/videojson.mjs --help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('VideoJSON CLI');
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).toContain('create');
    expect(result.stdout).toContain('run');
  });

  it('--version でバージョンが表示される', () => {
    const result = runCommand('node scripts/cli/videojson.mjs --version');
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/videojson v\d+\.\d+\.\d+/);
  });

  it('不明なコマンドでエラーが返る', () => {
    const result = runCommand('node scripts/cli/videojson.mjs unknown-command');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('不明なコマンド');
  });
});

describe('CLI: doctor command', () => {
  it('doctor コマンドが正常に動作する', () => {
    const result = runCommand('node scripts/cli/videojson.mjs doctor');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('VideoJSON Doctor');
    expect(result.stdout).toContain('チェック結果');
  });
});

describe('CLI: validate command', () => {
  it('validate --project examples/minimal が成功する', () => {
    const result = runCommand('node scripts/validate-strict.mjs --project examples/minimal');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Passed');
  });

  it('存在しないプロジェクトでは検証がスキップされる', () => {
    const result = runCommand('node scripts/validate-strict.mjs --project nonexistent');
    // プロジェクトが存在しなくてもエラーにならない（検証がスキップされる）
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Passed:  0');
  });
});

describe('CLI: project-create command', () => {
  const testProjectDir = path.join(ROOT_DIR, 'tests/cli/.test-project');

  afterAll(() => {
    // クリーンアップ
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  it('--help でヘルプが表示される', () => {
    const result = runCommand('node scripts/project-create.mjs --help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Project Create');
  });

  it('--transcript でプロジェクトが作成される', () => {
    const result = runCommand(
      `node scripts/project-create.mjs --transcript examples/fixtures/transcript.sample.json --out ${testProjectDir}`
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('プロジェクト作成完了');

    // ファイルが作成されていることを確認
    expect(fs.existsSync(path.join(testProjectDir, 'structure.json'))).toBe(true);
    expect(fs.existsSync(path.join(testProjectDir, 'narration.md'))).toBe(true);
    expect(fs.existsSync(path.join(testProjectDir, 'config.json'))).toBe(true);
  });

  it('--dry-run で実際には作成されない', () => {
    const dryRunDir = path.join(ROOT_DIR, 'tests/cli/.dryrun-project');
    const result = runCommand(
      `node scripts/project-create.mjs --transcript examples/fixtures/transcript.sample.json --out ${dryRunDir} --dry-run`
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Dry Run');
    expect(fs.existsSync(dryRunDir)).toBe(false);
  });
});

describe('CLI: project-run command', () => {
  it('--help でヘルプが表示される', () => {
    const result = runCommand('node scripts/project-run.mjs --help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('--project');
  });

  it('--project なしでエラーが返る', () => {
    const result = runCommand('node scripts/project-run.mjs');
    expect(result.code).toBe(1);
  });

  it('存在しないプロジェクトでエラーが返る', () => {
    const result = runCommand('node scripts/project-run.mjs --project nonexistent');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('見つかりません');
  });
});

describe('CLI: transcript-convert command', () => {
  it('SRT を transcript.json に変換できる', () => {
    const outputPath = path.join(ROOT_DIR, 'tests/cli/.test-transcript.json');

    try {
      const result = runCommand(
        `node scripts/convert-subtitles-to-transcript.mjs --in examples/fixtures/sample.srt --out ${outputPath}`
      );
      expect(result.code).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      const transcript = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(transcript.items).toBeDefined();
      expect(Array.isArray(transcript.items)).toBe(true);
    } finally {
      // クリーンアップ
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
  });
});

describe('CLI: analyze-transcript command', () => {
  it('transcript.json から structure.json を生成できる', () => {
    const outputPath = path.join(ROOT_DIR, 'tests/cli/.test-structure.json');

    try {
      const result = runCommand(
        `node scripts/analyze-transcript.mjs --transcript examples/fixtures/transcript.sample.json --out ${outputPath}`
      );
      expect(result.code).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      const structure = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(structure.segments).toBeDefined();
      expect(Array.isArray(structure.segments)).toBe(true);
    } finally {
      // クリーンアップ
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
  });
});
