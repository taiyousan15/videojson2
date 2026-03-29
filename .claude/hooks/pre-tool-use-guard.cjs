#!/usr/bin/env node
/**
 * TAISUN PreToolUse Guard - 統合ガードエントリ
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 * - blockが基本（warnではない）
 * - block時は『次にやる最小手順』を日本語で短く提示
 *
 * 実行順序:
 * 1. copy_safety_guard
 * 2. definition_lint_hard_gate
 * 3. intent_contract_first_gate
 * 4. reference_provenance_guard
 * 5. read_before_create_guard
 * 6. skill_workflow_enforcement_guard
 * 7. deviation_approval_guard (最後に例外許可)
 */

const fs = require('fs');
const path = require('path');
const stateManager = require('./shared/state-manager.cjs');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, '.claude/artifacts');
const INTENT_CONTRACT_PATH = path.join(ARTIFACTS_DIR, 'intent_contract.yaml');

// 危険操作のリスト（Read/Search以外）
const DANGEROUS_TOOLS = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Tool'];
const SAFE_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'AskUserQuestion'];

/**
 * 1. Copy Safety Guard - コピー混入/文字化けを検出
 */
function copySafetyGuard(toolInput) {
  const text = JSON.stringify(toolInput);

  // U+FFFD (replacement character) 検出
  if (text.includes('\uFFFD')) {
    return {
      blocked: true,
      reason: '【安全停止】文字化け(U+FFFD)を検出しました。コピー元を確認してください。'
    };
  }

  // U+3000 (全角スペース) 検出（コード内）
  if (toolInput.content && toolInput.content.includes('\u3000')) {
    return {
      blocked: true,
      reason: '【安全停止】全角スペース(U+3000)を検出しました。コピー混入の可能性があります。'
    };
  }

  return { blocked: false };
}

/**
 * 2. Intent Contract First Gate - 契約未確定は危険操作禁止
 */
function intentContractFirstGate(toolName, state) {
  // Read/Search は許可
  if (SAFE_TOOLS.includes(toolName)) {
    return { blocked: false };
  }

  // 危険操作は契約が必要
  if (DANGEROUS_TOOLS.includes(toolName)) {
    // 契約ファイルの存在確認
    if (!fs.existsSync(INTENT_CONTRACT_PATH)) {
      return {
        blocked: true,
        reason: `【安全停止】Intent Contract が未確定です（意図乖離防止のため停止）。

次にやること:
1) artifacts/intent_contract.yaml を作成/更新
2) objective / inputs / constraints / definition_of_done を確定
3) それから再実行してください`
      };
    }

    // 契約の必須フィールド確認
    try {
      const content = fs.readFileSync(INTENT_CONTRACT_PATH, 'utf8');
      const requiredFields = ['objective', 'inputs', 'constraints', 'definition_of_done'];
      const missingFields = requiredFields.filter(field => !content.includes(`${field}:`));

      if (missingFields.length > 0) {
        return {
          blocked: true,
          reason: `【安全停止】Intent Contract に必須フィールドがありません: ${missingFields.join(', ')}

次にやること:
1) artifacts/intent_contract.yaml を編集
2) 不足フィールドを追加
3) それから再実行してください`
        };
      }

      // 契約参照をstateに記録
      state.intentContractRef = INTENT_CONTRACT_PATH;
      stateManager.saveState(state);

    } catch (e) {
      return {
        blocked: true,
        reason: `【安全停止】Intent Contract の読み込みに失敗: ${e.message}`
      };
    }
  }

  return { blocked: false };
}

/**
 * 3. Reference Provenance Guard - 参考入力すり替え防止
 */
function referenceProvenanceGuard(toolName, toolInput, state) {
  // 生成系の操作のみチェック
  if (!['Bash', 'Write'].includes(toolName)) {
    return { blocked: false };
  }

  // reference_analysis.json の存在確認
  const refAnalysisPath = path.join(ARTIFACTS_DIR, 'reference_analysis.json');
  if (!fs.existsSync(refAnalysisPath)) {
    // 分析ファイルがない場合、参照アセットがロックされていなければOK
    if (state.locks.referenceAssets.length === 0) {
      return { blocked: false };
    }

    return {
      blocked: true,
      reason: `【安全停止】参考入力の決定的分析（deterministic analyzer）が未実行です。

次にやること:
1) 参考入力を登録
2) npm run analyze:reference で artifacts/reference_analysis.json を生成
3) それから生成工程へ進んでください`
    };
  }

  // sha256 の一致確認
  try {
    const analysis = JSON.parse(fs.readFileSync(refAnalysisPath, 'utf8'));

    for (const lock of state.locks.referenceAssets) {
      const analyzed = analysis.assets?.find(a => a.asset_id === lock.assetId);
      if (!analyzed) {
        return {
          blocked: true,
          reason: `【安全停止】参考入力 "${lock.assetId}" が分析されていません。

次にやること:
npm run analyze:reference "${lock.assetId}" を実行してください`
        };
      }

      if (analyzed.sha256 !== lock.sha256) {
        return {
          blocked: true,
          reason: `【安全停止】参考入力のすり替えを検知しました（sha256不一致）。

アセット: ${lock.assetId}
登録時: ${lock.sha256}
現在: ${analyzed.sha256}

対応:
1) ユーザー提供の参考入力を登録し直し
2) reference_analysis.json で sha256 を確定
3) 一致を確認してから進んでください
例外は逸脱承認が必要です`
        };
      }
    }
  } catch (e) {
    // 読み込みエラーは警告のみ
  }

  return { blocked: false };
}

/**
 * 4. Read Before Create Guard - 新規作成前に探索必須
 */
function readBeforeCreateGuard(toolName, toolInput, state) {
  if (toolName !== 'Write') {
    return { blocked: false };
  }

  const targetPath = toolInput.file_path || '';
  const patterns = ['phase', 'create_', 'templates/', 'scripts/', 'render/'];

  // パターンにマッチするファイルか確認
  const isTargetFile = patterns.some(p => targetPath.toLowerCase().includes(p));
  if (!isTargetFile) {
    return { blocked: false };
  }

  // 既にファイルが存在する場合は Write として扱う（Read済み前提）
  if (fs.existsSync(targetPath)) {
    return { blocked: false };
  }

  // 新規作成の場合、探索/Read/decision evidence が必要
  const hasSearchEvidence = state.skillEvidence.some(e => e.type === 'search:repo');
  const hasReadEvidence = state.skillEvidence.some(e => e.type === 'read:file');
  const hasDecision = state.decisions.assetReuse.some(d => d.target_path === targetPath);

  if (!hasSearchEvidence || !hasReadEvidence || !hasDecision) {
    const missing = [];
    if (!hasSearchEvidence) missing.push('repo内探索（search evidence）');
    if (!hasReadEvidence) missing.push('既存候補のRead（read evidence）');
    if (!hasDecision) missing.push('再利用/新規の意思決定（decision）');

    return {
      blocked: true,
      reason: `【安全停止】新規作成の前に探索/既存Read/意思決定が必要です（既存無視逸脱防止）。

不足: ${missing.join(', ')}

次にやること:
1) repo内探索（Glob/Grep）
2) 既存候補をRead
3) 再利用 or 新規（理由付き）を decision として記録
4) それから新規作成してください`
    };
  }

  return { blocked: false };
}

/**
 * 5. Deviation Approval Guard - 例外許可の確認（最後に実行）
 */
function deviationApprovalGuard(toolName, toolInput, state, blockResult) {
  // ブロックされていない場合はそのまま
  if (!blockResult.blocked) {
    return blockResult;
  }

  // 有効な逸脱承認があるか確認
  const targetPath = toolInput.file_path || toolInput.command || '';
  if (stateManager.hasValidDeviationApproval(state, toolName, targetPath)) {
    return {
      blocked: false,
      reason: `逸脱承認により許可: ${toolName}`
    };
  }

  return blockResult;
}

/**
 * メイン処理
 */
function main() {
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch (e) {
    process.exit(0);
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch (e) {
    process.exit(0);
  }

  const toolName = hookData.tool_name || hookData.tool || '';
  const toolInput = hookData.tool_input || hookData.input || {};

  if (!toolName) {
    process.exit(0);
  }

  // State読み込み
  const state = stateManager.loadState();

  // ガードを順番に実行
  let result = { blocked: false };

  // 1. Copy Safety Guard
  result = copySafetyGuard(toolInput);
  if (result.blocked) {
    result = deviationApprovalGuard(toolName, toolInput, state, result);
  }

  // 2. Intent Contract First Gate
  if (!result.blocked) {
    result = intentContractFirstGate(toolName, state);
    if (result.blocked) {
      result = deviationApprovalGuard(toolName, toolInput, state, result);
    }
  }

  // 3. Reference Provenance Guard
  if (!result.blocked) {
    result = referenceProvenanceGuard(toolName, toolInput, state);
    if (result.blocked) {
      result = deviationApprovalGuard(toolName, toolInput, state, result);
    }
  }

  // 4. Read Before Create Guard
  if (!result.blocked) {
    result = readBeforeCreateGuard(toolName, toolInput, state);
    if (result.blocked) {
      result = deviationApprovalGuard(toolName, toolInput, state, result);
    }
  }

  // 結果出力
  if (result.blocked) {
    const output = {
      decision: 'block',
      reason: result.reason
    };
    console.log(JSON.stringify(output));
    process.exit(1);
  }

  // Evidence 自動記録
  if (toolName === 'Read') {
    stateManager.recordEvidence(state, {
      type: 'read:file',
      path: toolInput.file_path,
      stepId: state.activeSkillStepId
    });
    stateManager.saveState(state);
  } else if (toolName === 'Glob' || toolName === 'Grep') {
    stateManager.recordEvidence(state, {
      type: 'search:repo',
      pattern: toolInput.pattern,
      path_scope: toolInput.path,
      stepId: state.activeSkillStepId
    });
    stateManager.saveState(state);
  } else if (toolName === 'Write' || toolName === 'Edit') {
    stateManager.recordEvidence(state, {
      type: 'artifact:file_created_or_updated',
      path: toolInput.file_path,
      is_new_file: !fs.existsSync(toolInput.file_path),
      stepId: state.activeSkillStepId
    });
    stateManager.saveState(state);
  }

  process.exit(0);
}

main();
