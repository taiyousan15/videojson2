#!/usr/bin/env node
/**
 * TAISUN Shared Validator - Lint/Runtime共通判定ロジック
 *
 * 仕様: docs/taisun_master_guard_spec.yaml
 * - lint と runtime の判定ロジックは single source of truth
 * - workflow/policy/skill workflow の validate を集約
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');

/**
 * 必須ファイルの存在確認
 */
function validateRequiredFiles(files) {
  const results = [];
  for (const file of files) {
    const fullPath = path.join(ROOT_DIR, file);
    const exists = fs.existsSync(fullPath);
    results.push({
      file,
      exists,
      error: exists ? null : `必須ファイルが見つかりません: ${file}`
    });
  }
  return results;
}

/**
 * JSONファイルの検証
 */
function validateJsonFile(filePath, requiredKeys = []) {
  const fullPath = path.join(ROOT_DIR, filePath);

  if (!fs.existsSync(fullPath)) {
    return { valid: false, error: `ファイルが見つかりません: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(content);

    const missingKeys = requiredKeys.filter(key => !(key in data));
    if (missingKeys.length > 0) {
      return {
        valid: false,
        error: `必須キーがありません: ${missingKeys.join(', ')}`,
        data
      };
    }

    return { valid: true, data };
  } catch (e) {
    return { valid: false, error: `JSONパースエラー: ${e.message}` };
  }
}

/**
 * 正規表現の検証
 */
function validateRegexPatterns(patterns) {
  const results = [];
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, 'i');
      results.push({ pattern, valid: true });
    } catch (e) {
      results.push({
        pattern,
        valid: false,
        error: `無効な正規表現: ${e.message}`
      });
    }
  }
  return results;
}

/**
 * スキルワークフロー定義の検証
 */
function validateSkillWorkflowDefinition(definition) {
  const errors = [];

  // 必須フィールド
  if (!definition.id) {
    errors.push('id が必須です');
  }
  if (typeof definition.version !== 'number') {
    errors.push('version が必須です（数値）');
  }
  if (!definition.steps || !Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push('steps が必須です（非空配列）');
  }

  // 各stepの検証
  if (definition.steps) {
    for (let i = 0; i < definition.steps.length; i++) {
      const step = definition.steps[i];
      const prefix = `steps[${i}]`;

      if (!step.id) {
        errors.push(`${prefix}.id が必須です`);
      }
      if (!step.requiredEvidence || !Array.isArray(step.requiredEvidence) || step.requiredEvidence.length === 0) {
        errors.push(`${prefix}.requiredEvidence が必須です（最低1つ）`);
      }
    }

    // 最終stepの検証
    const lastStep = definition.steps[definition.steps.length - 1];
    if (lastStep && lastStep.requiredEvidence) {
      const hasAllPreviousCheck = lastStep.requiredEvidence.some(e =>
        e.includes('all_previous') || e.includes('validation')
      );
      if (!hasAllPreviousCheck) {
        errors.push('最終stepは validation:all_previous_steps_passed 相当を requiredEvidence に含める必要があります');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Intent Contract の検証
 */
function validateIntentContract(contractPath) {
  const fullPath = path.join(ROOT_DIR, contractPath);

  if (!fs.existsSync(fullPath)) {
    return { valid: false, error: 'Intent Contract が見つかりません' };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const requiredFields = ['objective', 'inputs', 'constraints', 'definition_of_done'];
    const missingFields = requiredFields.filter(field => !content.includes(`${field}:`));

    if (missingFields.length > 0) {
      return {
        valid: false,
        error: `必須フィールドがありません: ${missingFields.join(', ')}`
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `読み込みエラー: ${e.message}` };
  }
}

/**
 * 禁止パターンのチェック
 */
function checkForbiddenPatterns(content, patterns) {
  const violations = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.pattern, 'i');
    if (regex.test(content)) {
      violations.push({
        pattern: pattern.pattern,
        reason: pattern.reason
      });
    }
  }
  return violations;
}

/**
 * 総合検証（lint用）
 */
function runLint(options = {}) {
  const results = {
    errors: [],
    warnings: [],
    passed: []
  };

  // 必須ファイル
  const requiredFiles = [
    '.claude/CLAUDE.md',
    '.claude/hooks/task-skill-mapping.json'
  ];

  for (const file of requiredFiles) {
    if (fs.existsSync(path.join(ROOT_DIR, file))) {
      results.passed.push(`ファイル存在: ${file}`);
    } else {
      results.errors.push(`必須ファイルなし: ${file}`);
    }
  }

  // task-skill-mapping.json の検証
  const mappingResult = validateJsonFile('.claude/hooks/task-skill-mapping.json', ['mappings']);
  if (mappingResult.valid) {
    results.passed.push('task-skill-mapping.json: 有効');

    // 正規表現の検証
    if (mappingResult.data.mappings) {
      for (const mapping of mappingResult.data.mappings) {
        if (mapping.task_patterns) {
          const regexResults = validateRegexPatterns(mapping.task_patterns);
          for (const r of regexResults) {
            if (!r.valid) {
              results.errors.push(`無効な正規表現: ${r.pattern} - ${r.error}`);
            }
          }
        }
      }
    }
  } else {
    results.errors.push(`task-skill-mapping.json: ${mappingResult.error}`);
  }

  return results;
}

module.exports = {
  validateRequiredFiles,
  validateJsonFile,
  validateRegexPatterns,
  validateSkillWorkflowDefinition,
  validateIntentContract,
  checkForbiddenPatterns,
  runLint,
  ROOT_DIR
};
