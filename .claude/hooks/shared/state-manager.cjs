#!/usr/bin/env node
/**
 * TAISUN State Manager - ワークフロー状態の唯一の真実
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 * - activeSkillId / activeSkillStepId / activePhaseId は state の唯一の真実
 * - AIの自己申告で Step/Phase を進めることは禁止
 * - 遷移は gate 関数を通した時のみ
 */

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.resolve(__dirname, '../../artifacts');
const STATE_FILE = path.join(STATE_DIR, 'workflow_state.json');

// デフォルトstate構造
const DEFAULT_STATE = {
  version: 1,
  activeWorkflowId: null,
  activePhaseId: null,
  activeSkillId: null,
  activeSkillStepId: null,
  intentContractRef: null,
  skillEvidence: [],
  skillEvidenceIndexByStepId: {},
  registeredInputs: {
    referenceAssets: []
  },
  locks: {
    referenceAssets: []
  },
  decisions: {
    assetReuse: []
  },
  approvals: {
    deviations: []
  },
  validations: {
    lastResults: []
  },
  lastUpdated: null
};

/**
 * State を読み込む
 */
function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { ...DEFAULT_STATE };
    }
    const data = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(data);
    // デフォルト値とマージ（新しいキーを追加）
    return { ...DEFAULT_STATE, ...state };
  } catch (e) {
    console.error(`[TAISUN State] 読み込みエラー: ${e.message}`);
    return { ...DEFAULT_STATE };
  }
}

/**
 * State を保存
 */
function saveState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`[TAISUN State] 保存エラー: ${e.message}`);
    return false;
  }
}

/**
 * Evidence を記録
 */
function recordEvidence(state, evidence) {
  const record = {
    ...evidence,
    timestamp: new Date().toISOString()
  };
  state.skillEvidence.push(record);

  // stepId がある場合はインデックスを更新
  if (evidence.stepId) {
    if (!state.skillEvidenceIndexByStepId[evidence.stepId]) {
      state.skillEvidenceIndexByStepId[evidence.stepId] = [];
    }
    state.skillEvidenceIndexByStepId[evidence.stepId].push(
      state.skillEvidence.length - 1
    );
  }

  return record;
}

/**
 * 逸脱承認を記録
 */
function recordDeviationApproval(state, approval) {
  const record = {
    ...approval,
    timestamp: new Date().toISOString(),
    expiresAt: approval.expiresAt || null
  };
  state.approvals.deviations.push(record);
  return record;
}

/**
 * 有効な逸脱承認があるか確認
 */
function hasValidDeviationApproval(state, operationType, targetPath) {
  const now = new Date();
  return state.approvals.deviations.some(approval => {
    // 期限切れチェック
    if (approval.expiresAt && new Date(approval.expiresAt) < now) {
      return false;
    }
    // 操作タイプチェック
    if (approval.operationType && approval.operationType !== operationType) {
      return false;
    }
    // ターゲットパスチェック（指定されている場合）
    if (approval.targetPath && targetPath && !targetPath.includes(approval.targetPath)) {
      return false;
    }
    return true;
  });
}

/**
 * Intent Contract 参照を設定
 */
function setIntentContractRef(state, ref) {
  state.intentContractRef = ref;
  return state;
}

/**
 * 参照アセットを登録
 */
function registerReferenceAsset(state, asset) {
  const record = {
    ...asset,
    registeredAt: new Date().toISOString()
  };
  state.registeredInputs.referenceAssets.push(record);
  return record;
}

/**
 * 参照アセットをロック（sha256固定）
 */
function lockReferenceAsset(state, assetId, sha256) {
  const lock = {
    assetId,
    sha256,
    lockedAt: new Date().toISOString()
  };
  state.locks.referenceAssets.push(lock);
  return lock;
}

/**
 * 決定を記録（再利用 or 新規作成）
 */
function recordDecision(state, decision) {
  const record = {
    ...decision,
    timestamp: new Date().toISOString()
  };
  state.decisions.assetReuse.push(record);
  return record;
}

/**
 * State をリセット（新セッション開始時）
 */
function resetState() {
  const newState = { ...DEFAULT_STATE };
  saveState(newState);
  return newState;
}

// エクスポート
module.exports = {
  loadState,
  saveState,
  recordEvidence,
  recordDeviationApproval,
  hasValidDeviationApproval,
  setIntentContractRef,
  registerReferenceAsset,
  lockReferenceAsset,
  recordDecision,
  resetState,
  STATE_FILE,
  DEFAULT_STATE
};
