/**
 * TAISUN Guard Tests
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 *
 * minimum_tests:
 * (1) 契約なしで危険操作が block される
 * (2) reference_analysis 未生成で生成工程が block される
 * (3) sha256不一致で block される
 * (4) 探索/Read/decision無しの新規作成が block される
 * (5) lint fail で start/resume/strict が block される
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(ROOT_DIR, '.claude/hooks');
const ARTIFACTS_DIR = path.join(ROOT_DIR, '.claude/artifacts');
const STATE_PATH = path.join(ARTIFACTS_DIR, 'workflow_state.json');
const INTENT_CONTRACT_PATH = path.join(ARTIFACTS_DIR, 'intent_contract.yaml');
const REFERENCE_ANALYSIS_PATH = path.join(ARTIFACTS_DIR, 'reference_analysis.json');

interface GuardResult {
  blocked: boolean;
  reason?: string;
  decision?: string;
  output?: string;
}

/**
 * PreToolUse ガードを実行
 */
function runPreToolUseGuard(toolName: string, toolInput: Record<string, unknown> = {}): GuardResult {
  const hookPath = path.join(HOOKS_DIR, 'pre-tool-use-guard.cjs');
  const input = JSON.stringify({ tool_name: toolName, tool_input: toolInput });

  try {
    const result = execSync(`echo '${input}' | node "${hookPath}"`, {
      encoding: 'utf8',
      cwd: ROOT_DIR
    });
    return { blocked: false, output: result };
  } catch (e: unknown) {
    const error = e as { stdout?: string };
    const output = error.stdout || '';
    try {
      return { blocked: true, ...JSON.parse(output) };
    } catch {
      return { blocked: true, reason: output };
    }
  }
}

/**
 * state をリセット
 */
function resetState(overrides: Record<string, unknown> = {}) {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  const defaultState = {
    version: 1,
    activeWorkflowId: null,
    activePhaseId: null,
    activeSkillId: null,
    activeSkillStepId: null,
    intentContractRef: null,
    skillEvidence: [],
    skillEvidenceIndexByStepId: {},
    registeredInputs: { referenceAssets: [] },
    locks: { referenceAssets: [] },
    decisions: { assetReuse: [] },
    approvals: { deviations: [] },
    validations: { lastResults: [] },
    lastUpdated: new Date().toISOString(),
    ...overrides
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(defaultState, null, 2));
}

/**
 * intent_contract.yaml を削除
 */
function removeIntentContract() {
  if (fs.existsSync(INTENT_CONTRACT_PATH)) {
    fs.unlinkSync(INTENT_CONTRACT_PATH);
  }
}

/**
 * reference_analysis.json を削除
 */
function removeReferenceAnalysis() {
  if (fs.existsSync(REFERENCE_ANALYSIS_PATH)) {
    fs.unlinkSync(REFERENCE_ANALYSIS_PATH);
  }
}

/**
 * intent_contract.yaml を作成
 */
function createValidIntentContract() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  fs.writeFileSync(INTENT_CONTRACT_PATH, `
objective: "Test objective"
non_goals:
  - "Not a goal"
inputs:
  - type: "test"
    path: "/test/path"
constraints:
  - "Test constraint"
definition_of_done:
  - "Test is complete"
allowed_deviations_policy:
  requires_approval: true
`);
}

/**
 * reference_analysis.json を作成
 */
function createReferenceAnalysis(assets: Array<{ asset_id: string; sha256: string }>) {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  fs.writeFileSync(REFERENCE_ANALYSIS_PATH, JSON.stringify({ assets }, null, 2));
}

// =============================================================================
// (1) Intent Contract First Gate
// =============================================================================
describe('(1) Intent Contract First Gate', () => {
  beforeEach(() => {
    resetState();
  });

  it('契約なしで危険操作(Bash)が block される', () => {
    removeIntentContract();

    const result = runPreToolUseGuard('Bash', { command: 'ls' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('Intent Contract');
  });

  it('契約なしで危険操作(Write)が block される', () => {
    removeIntentContract();

    const result = runPreToolUseGuard('Write', { file_path: '/tmp/test.txt', content: 'test' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('Intent Contract');
  });

  it('契約なしでも Read は許可される', () => {
    removeIntentContract();

    const result = runPreToolUseGuard('Read', { file_path: '/tmp/test.txt' });
    expect(result.blocked).toBe(false);
  });

  it('契約なしでも Glob は許可される', () => {
    removeIntentContract();

    const result = runPreToolUseGuard('Glob', { pattern: '**/*.ts' });
    expect(result.blocked).toBe(false);
  });

  it('契約ありで危険操作が許可される', () => {
    createValidIntentContract();

    const result = runPreToolUseGuard('Bash', { command: 'ls' });
    expect(result.blocked).toBe(false);
  });
});

// =============================================================================
// (2) Reference Provenance Guard - analysis 未生成
// =============================================================================
describe('(2) Reference Provenance Guard - analysis 未生成', () => {
  beforeEach(() => {
    resetState();
    createValidIntentContract();
  });

  afterEach(() => {
    removeReferenceAnalysis();
  });

  it('referenceAssets あり & analysis 無しで生成操作(Bash)が block される', () => {
    // state に referenceAssets を登録
    resetState({
      locks: {
        referenceAssets: [{ assetId: 'test-asset', sha256: 'abc123def456' }]
      }
    });
    removeReferenceAnalysis();

    const result = runPreToolUseGuard('Bash', { command: 'python generate.py' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('分析');
  });

  it('referenceAssets あり & analysis 無しで生成操作(Write)が block される', () => {
    resetState({
      locks: {
        referenceAssets: [{ assetId: 'test-asset', sha256: 'abc123def456' }]
      }
    });
    removeReferenceAnalysis();

    const result = runPreToolUseGuard('Write', { file_path: '/tmp/output.png' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('分析');
  });

  it('referenceAssets 無しなら analysis 無しでも許可される', () => {
    resetState({
      locks: { referenceAssets: [] }
    });
    removeReferenceAnalysis();

    const result = runPreToolUseGuard('Bash', { command: 'ls' });
    expect(result.blocked).toBe(false);
  });
});

// =============================================================================
// (3) Reference Provenance Guard - sha256 不一致
// =============================================================================
describe('(3) Reference Provenance Guard - sha256 不一致', () => {
  beforeEach(() => {
    resetState();
    createValidIntentContract();
  });

  afterEach(() => {
    removeReferenceAnalysis();
  });

  it('sha256 不一致で生成操作が block される（すり替え検知）', () => {
    // state の locks に登録された sha256
    resetState({
      locks: {
        referenceAssets: [{ assetId: 'test-asset', sha256: 'locked_hash_abc123' }]
      }
    });
    // analysis には異なる sha256
    createReferenceAnalysis([{ asset_id: 'test-asset', sha256: 'different_hash_xyz789' }]);

    const result = runPreToolUseGuard('Write', { file_path: '/tmp/output.png' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('すり替え');
  });

  it('sha256 一致なら許可される', () => {
    const matchingHash = 'matching_hash_abc123';
    resetState({
      locks: {
        referenceAssets: [{ assetId: 'test-asset', sha256: matchingHash }]
      }
    });
    createReferenceAnalysis([{ asset_id: 'test-asset', sha256: matchingHash }]);

    const result = runPreToolUseGuard('Bash', { command: 'ls' });
    expect(result.blocked).toBe(false);
  });
});

// =============================================================================
// (4) Read Before Create Guard
// =============================================================================
describe('(4) Read Before Create Guard', () => {
  beforeEach(() => {
    resetState();
    createValidIntentContract();
  });

  it('探索/Read/decision 無しで新規 phase*.py 作成が block される', () => {
    // evidence をクリア
    resetState({ skillEvidence: [] });

    // 存在しないファイルへの Write（phase パターンにマッチ）
    const targetPath = path.join(ROOT_DIR, 'scripts/phase_new_test.py');

    // ファイルが存在しないことを確認
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    const result = runPreToolUseGuard('Write', { file_path: targetPath });

    // block されるべき（探索 evidence がない）
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('探索');
  });

  it('探索/Read/decision 無しで新規 create_*.py 作成が block される', () => {
    resetState({ skillEvidence: [] });

    const targetPath = path.join(ROOT_DIR, 'scripts/create_new_test.py');
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    const result = runPreToolUseGuard('Write', { file_path: targetPath });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('探索');
  });

  it('evidence があれば新規作成が許可される', () => {
    // search と read の evidence を追加
    resetState({
      skillEvidence: [
        { type: 'search:repo', pattern: '**/*.py', timestamp: new Date().toISOString() },
        { type: 'read:file', path: '/some/existing/file.py', timestamp: new Date().toISOString() }
      ],
      decisions: {
        assetReuse: [
          { target_path: path.join(ROOT_DIR, 'scripts/phase_with_evidence.py'), decision: 'create', reason: 'No existing match' }
        ]
      }
    });

    const targetPath = path.join(ROOT_DIR, 'scripts/phase_with_evidence.py');
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    const result = runPreToolUseGuard('Write', { file_path: targetPath });
    expect(result.blocked).toBe(false);
  });
});

// =============================================================================
// (5) Definition Lint Hard Gate
// =============================================================================
describe('(5) Definition Lint - Shared Validator', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const validator = require(path.join(HOOKS_DIR, 'shared/shared-validator.cjs'));

  it('workflow 定義に id がない場合は lint fail', () => {
    const result = validator.validateSkillWorkflowDefinition({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id が必須です');
  });

  it('workflow 定義に version がない場合は lint fail', () => {
    const result = validator.validateSkillWorkflowDefinition({ id: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('version が必須です（数値）');
  });

  it('workflow 定義に steps がない場合は lint fail', () => {
    const result = validator.validateSkillWorkflowDefinition({ id: 'test', version: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('steps が必須です（非空配列）');
  });

  it('steps に requiredEvidence がない場合は lint fail', () => {
    const result = validator.validateSkillWorkflowDefinition({
      id: 'test',
      version: 1,
      steps: [{ id: 'step1' }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('requiredEvidence'))).toBe(true);
  });

  it('最終 step に validation がない場合は lint fail', () => {
    const result = validator.validateSkillWorkflowDefinition({
      id: 'test',
      version: 1,
      steps: [
        { id: 'step1', requiredEvidence: ['read:file'] }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('all_previous') || e.includes('validation'))).toBe(true);
  });

  it('有効な定義は lint pass', () => {
    const result = validator.validateSkillWorkflowDefinition({
      id: 'test-skill',
      version: 1,
      steps: [
        { id: 'step1', requiredEvidence: ['read:file', 'validation:all_previous_steps_passed'] }
      ]
    });
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Copy Safety Guard
// =============================================================================
describe('Copy Safety Guard', () => {
  beforeEach(() => {
    resetState();
    createValidIntentContract();
  });

  it('U+FFFD (文字化け) を検出して block する', () => {
    const result = runPreToolUseGuard('Write', {
      file_path: '/tmp/test.txt',
      content: 'テスト\uFFFD文字化け'
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('U+FFFD');
  });

  it('U+3000 (全角スペース) を検出して block する', () => {
    const result = runPreToolUseGuard('Write', {
      file_path: '/tmp/test.txt',
      content: 'テスト\u3000全角スペース'
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('U+3000');
  });
});

// =============================================================================
// Evidence Auto Capture
// =============================================================================
describe('Evidence Auto Capture', () => {
  beforeEach(() => {
    resetState();
    createValidIntentContract();
  });

  it('Read 操作で evidence が記録される', () => {
    runPreToolUseGuard('Read', { file_path: '/tmp/test.txt' });

    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const hasReadEvidence = state.skillEvidence.some((e: { type: string }) => e.type === 'read:file');
    expect(hasReadEvidence).toBe(true);
  });

  it('Glob 操作で evidence が記録される', () => {
    runPreToolUseGuard('Glob', { pattern: '**/*.js' });

    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const hasSearchEvidence = state.skillEvidence.some((e: { type: string }) => e.type === 'search:repo');
    expect(hasSearchEvidence).toBe(true);
  });
});

// =============================================================================
// Skill Workflow Gate
// =============================================================================
describe('Skill Workflow Gate', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skillGate = require(path.join(HOOKS_DIR, 'shared/skill-workflow-gate.cjs'));

  it('evidence がない場合は未達', () => {
    const state = { skillEvidence: [] };
    const result = skillGate.checkRequiredEvidence(state, ['read:file']);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('read:file');
  });

  it('evidence がある場合は達成', () => {
    const state = {
      skillEvidence: [{ type: 'read:file', path: '/test' }]
    };
    const result = skillGate.checkRequiredEvidence(state, ['read:file']);
    expect(result.satisfied).toBe(true);
  });
});

// =============================================================================
// Large Output Sink
// =============================================================================
describe('Large Output Sink', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sink = require(path.join(HOOKS_DIR, 'shared/large-output-sink.cjs'));

  it('6000文字以上は large', () => {
    const largeText = 'a'.repeat(6001);
    expect(sink.isLargeOutput(largeText)).toBe(true);
  });

  it('120行以上は large', () => {
    const manyLines = Array(121).fill('line').join('\n');
    expect(sink.isLargeOutput(manyLines)).toBe(true);
  });

  it('閾値以下は large ではない', () => {
    expect(sink.isLargeOutput('small text')).toBe(false);
  });
});
