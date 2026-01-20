#!/usr/bin/env node
/**
 * TAISUN Skill Step Transition Gate
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 * - Step遷移は gate API でのみ可能
 * - requiredEvidence と requiredValidations を満たした時だけ state.activeSkillStepId を更新
 * - 満たしていない場合は fail を返し、次工程のツール実行も block のまま
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const stateManager = require('./state-manager.cjs');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(ROOT_DIR, '.claude/skills');

/**
 * スキルワークフロー定義を読み込み
 */
function loadSkillWorkflow(skillId) {
  // 優先順位:
  // 1. .claude/skills/<skillId>/workflow.yaml
  // 2. config/skills/workflows/<skillId>.yaml
  const paths = [
    path.join(SKILLS_DIR, skillId, 'workflow.yaml'),
    path.join(ROOT_DIR, 'config/skills/workflows', `${skillId}.yaml`)
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return yaml.load(content);
      } catch (e) {
        console.error(`[TAISUN] ワークフロー読み込みエラー: ${p} - ${e.message}`);
      }
    }
  }

  return null;
}

/**
 * 現在のStepの定義を取得
 */
function getCurrentStepDefinition(workflow, stepId) {
  if (!workflow || !workflow.steps) return null;
  return workflow.steps.find(s => s.id === stepId);
}

/**
 * requiredEvidence を満たしているか確認
 */
function checkRequiredEvidence(state, requiredEvidence) {
  if (!requiredEvidence || requiredEvidence.length === 0) {
    return { satisfied: true, missing: [] };
  }

  const missing = [];
  for (const required of requiredEvidence) {
    const hasEvidence = state.skillEvidence.some(e => e.type === required);
    if (!hasEvidence) {
      missing.push(required);
    }
  }

  return {
    satisfied: missing.length === 0,
    missing
  };
}

/**
 * 操作が現在のStepで許可されているか確認
 */
function isOperationAllowed(stepDefinition, toolName) {
  if (!stepDefinition) return true; // 定義がない場合は許可

  // allowedTools が定義されている場合
  if (stepDefinition.allowedTools && Array.isArray(stepDefinition.allowedTools)) {
    return stepDefinition.allowedTools.includes(toolName);
  }

  // 定義がない場合は全て許可
  return true;
}

/**
 * Step を完了してマーク（gate API）
 */
function completeStep(skillId, stepId) {
  const state = stateManager.loadState();
  const workflow = loadSkillWorkflow(skillId);

  if (!workflow) {
    return {
      success: false,
      error: `ワークフロー定義が見つかりません: ${skillId}`
    };
  }

  const stepDef = getCurrentStepDefinition(workflow, stepId);
  if (!stepDef) {
    return {
      success: false,
      error: `Step定義が見つかりません: ${stepId}`
    };
  }

  // requiredEvidence チェック
  const evidenceCheck = checkRequiredEvidence(state, stepDef.requiredEvidence);
  if (!evidenceCheck.satisfied) {
    return {
      success: false,
      error: `requiredEvidence未達: ${evidenceCheck.missing.join(', ')}`,
      missing: evidenceCheck.missing
    };
  }

  // requiredValidations チェック（TODO: 実装）

  // Step 完了を記録
  const stepIndex = workflow.steps.findIndex(s => s.id === stepId);
  const nextStep = workflow.steps[stepIndex + 1];

  stateManager.recordEvidence(state, {
    type: 'step:completed',
    skillId,
    stepId,
    nextStepId: nextStep?.id || null
  });

  // 次のStepに遷移
  if (nextStep) {
    state.activeSkillStepId = nextStep.id;
  } else {
    // ワークフロー完了
    state.activeSkillId = null;
    state.activeSkillStepId = null;
  }

  stateManager.saveState(state);

  return {
    success: true,
    completedStepId: stepId,
    nextStepId: nextStep?.id || null,
    workflowCompleted: !nextStep
  };
}

/**
 * スキルワークフローを開始
 */
function startSkillWorkflow(skillId) {
  const workflow = loadSkillWorkflow(skillId);

  if (!workflow) {
    return {
      success: false,
      error: `ワークフロー定義が見つかりません: ${skillId}`
    };
  }

  if (!workflow.steps || workflow.steps.length === 0) {
    return {
      success: false,
      error: `ワークフローにStepがありません: ${skillId}`
    };
  }

  const state = stateManager.loadState();
  state.activeSkillId = skillId;
  state.activeSkillStepId = workflow.steps[0].id;
  stateManager.saveState(state);

  return {
    success: true,
    skillId,
    firstStepId: workflow.steps[0].id,
    totalSteps: workflow.steps.length
  };
}

/**
 * PreToolUse 用: 操作がブロックされるべきか判定
 */
function shouldBlockOperation(toolName) {
  const state = stateManager.loadState();

  // スキルがアクティブでない場合は判定しない
  if (!state.activeSkillId) {
    return { blocked: false };
  }

  const workflow = loadSkillWorkflow(state.activeSkillId);
  if (!workflow) {
    return { blocked: false };
  }

  const stepDef = getCurrentStepDefinition(workflow, state.activeSkillStepId);
  if (!stepDef) {
    return { blocked: false };
  }

  if (!isOperationAllowed(stepDef, toolName)) {
    return {
      blocked: true,
      reason: `【安全停止】Step完了条件が未達です（Stepスキップ防止）。

現在のStep: ${state.activeSkillStepId}
許可されている操作: ${stepDef.allowedTools?.join(', ') || '（制限なし）'}
要求された操作: ${toolName}

requiredEvidence / requiredValidations を満たしてから skill.step.complete を再実行してください`
    };
  }

  return { blocked: false };
}

module.exports = {
  loadSkillWorkflow,
  getCurrentStepDefinition,
  checkRequiredEvidence,
  isOperationAllowed,
  completeStep,
  startSkillWorkflow,
  shouldBlockOperation
};
